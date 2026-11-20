const crypto = require('crypto');
const prisma = require('../config/database');
const logger = require('../utils/logger');
const encryptionService = require('./encryptionService');
const { buildSignatureHeader } = require('../utils/hmac');
const { ValidationError, NotFoundError } = require('../utils/errors');

/**
 * Webhook Service
 * Manages webhook subscribers and the delivery worker that pushes DMS events
 * to external systems (ERP / WMS / PMS / Sales).
 *
 * Delivery model:
 *   IntegrationEvent (outbox)  --fan-out-->  WebhookDelivery (per endpoint)
 * The worker retries failed deliveries with exponential backoff and moves
 * them to DEAD_LETTER once maxAttempts is exhausted.
 */

const VALID_SYSTEMS = ['ERP', 'WMS', 'PMS', 'SALES', 'CUSTOM'];
const INTERVAL_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;
const BATCH_SIZE = 25;
const RESPONSE_BODY_LIMIT = 2000;

// 30s, 2m, 10m, 30m, 2h, 6h
const BACKOFF_SCHEDULE_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000, 21_600_000];

const normalizeSystem = (value) => {
  const upper = String(value || 'CUSTOM').trim().toUpperCase();
  return VALID_SYSTEMS.includes(upper) ? upper : 'CUSTOM';
};

const normalizeEvents = (events) => {
  if (!events) return ['*'];
  const list = Array.isArray(events) ? events : String(events).split(',');
  const cleaned = list.map((e) => String(e ?? '').trim()).filter(Boolean);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : ['*'];
};

const truncate = (value, limit = RESPONSE_BODY_LIMIT) => {
  if (value == null) return null;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > limit ? `${str.slice(0, limit)}…[truncated]` : str;
};

const backoffFor = (attempts) => {
  const idx = Math.min(Math.max(attempts - 1, 0), BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[idx];
};

class WebhookService {
  constructor() {
    this._timer = null;
    this._running = false;
  }

  // ----------------------------------------------------------------
  // Endpoint management
  // ----------------------------------------------------------------

  async createEndpoint({
    name,
    url,
    system = 'CUSTOM',
    secret = null,
    events = ['*'],
    customHeaders = null,
    description = null,
    maxAttempts = 6,
    createdById = null
  }) {
    if (!name || !String(name).trim()) throw new ValidationError('Endpoint name is required');
    if (!url || !/^https?:\/\//i.test(String(url))) throw new ValidationError('A valid http(s) URL is required');

    const plainSecret = secret && String(secret).trim()
      ? String(secret).trim()
      : `whsec_${crypto.randomBytes(32).toString('base64url')}`;

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        name: String(name).trim(),
        url: String(url).trim(),
        system: normalizeSystem(system),
        secret: encryptionService.encryptString(plainSecret),
        events: normalizeEvents(events),
        customHeaders: customHeaders ?? null,
        description: description ? String(description) : null,
        maxAttempts: Math.min(Math.max(Number(maxAttempts) || 6, 1), 12),
        createdById
      }
    });

    return { endpoint: this.toSafe(endpoint), secret: plainSecret };
  }

  async updateEndpoint(id, { name, url, system, events, customHeaders, description, isActive, maxAttempts, secret }) {
    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (url !== undefined) {
      if (!/^https?:\/\//i.test(String(url))) throw new ValidationError('A valid http(s) URL is required');
      data.url = String(url).trim();
    }
    if (system !== undefined) data.system = normalizeSystem(system);
    if (events !== undefined) data.events = normalizeEvents(events);
    if (customHeaders !== undefined) data.customHeaders = customHeaders ?? null;
    if (description !== undefined) data.description = description ? String(description) : null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (maxAttempts !== undefined) data.maxAttempts = Math.min(Math.max(Number(maxAttempts) || 6, 1), 12);
    if (secret !== undefined && secret) data.secret = encryptionService.encryptString(String(secret).trim());

    if (Object.keys(data).length === 0) throw new ValidationError('No fields to update');

    const endpoint = await prisma.webhookEndpoint.update({ where: { id: Number(id) }, data });
    return this.toSafe(endpoint);
  }

  async listEndpoints() {
    const endpoints = await prisma.webhookEndpoint.findMany({ orderBy: { createdAt: 'desc' } });
    return endpoints.map((e) => this.toSafe(e));
  }

  async getEndpoint(id) {
    const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: Number(id) } });
    if (!endpoint) throw new NotFoundError('Webhook endpoint');
    return this.toSafe(endpoint);
  }

  async deleteEndpoint(id) {
    await prisma.webhookEndpoint.delete({ where: { id: Number(id) } });
    return { id: Number(id) };
  }

  async rotateSecret(id) {
    const plain = `whsec_${crypto.randomBytes(32).toString('base64url')}`;
    const endpoint = await prisma.webhookEndpoint.update({
      where: { id: Number(id) },
      data: { secret: encryptionService.encryptString(plain) }
    });
    return { endpoint: this.toSafe(endpoint), secret: plain };
  }

  getPlainSecret(endpoint) {
    if (!endpoint?.secret) return null;
    try {
      return encryptionService.decryptString(endpoint.secret);
    } catch {
      return null;
    }
  }

  toSafe(record) {
    if (!record) return null;
    return {
      id: record.id,
      name: record.name,
      url: record.url,
      system: record.system,
      events: record.events,
      customHeaders: record.customHeaders,
      description: record.description,
      isActive: record.isActive,
      maxAttempts: record.maxAttempts,
      lastSuccessAt: record.lastSuccessAt,
      lastFailureAt: record.lastFailureAt,
      failureCount: record.failureCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }

  // ----------------------------------------------------------------
  // Dispatcher (outbox -> deliveries)
  // ----------------------------------------------------------------

  endpointMatchesEvent(endpoint, event) {
    if (event.system && endpoint.system !== event.system) return false;
    const subscribed = Array.isArray(endpoint.events) ? endpoint.events : [];
    if (subscribed.includes('*')) return true;
    return subscribed.includes(event.type);
  }

  async dispatchPendingEvents(limit = BATCH_SIZE) {
    const events = await prisma.integrationEvent.findMany({
      where: { status: 'PENDING', availableAt: { lte: new Date() } },
      orderBy: { occurredAt: 'asc' },
      take: limit
    });
    if (events.length === 0) return { dispatched: 0, deliveries: 0 };

    const endpoints = await prisma.webhookEndpoint.findMany({ where: { isActive: true } });
    let deliveryCount = 0;

    for (const event of events) {
      const matched = endpoints.filter((ep) => this.endpointMatchesEvent(ep, event));

      for (const endpoint of matched) {
        try {
          await prisma.webhookDelivery.upsert({
            where: { eventId_endpointId: { eventId: event.id, endpointId: endpoint.id } },
            update: {},
            create: {
              eventId: event.id,
              endpointId: endpoint.id,
              maxAttempts: endpoint.maxAttempts || 6
            }
          });
          deliveryCount += 1;
        } catch (error) {
          logger.error('Failed to create webhook delivery', { eventId: event.id, endpointId: endpoint.id, error });
        }
      }

      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: { status: 'DISPATCHED', dispatchedAt: new Date() }
      });
    }

    return { dispatched: events.length, deliveries: deliveryCount };
  }

  // ----------------------------------------------------------------
  // Delivery worker
  // ----------------------------------------------------------------

  buildEventBody(event) {
    return JSON.stringify({
      id: event.id,
      type: event.type,
      system: event.system,
      entityType: event.entityType,
      entityId: event.entityId,
      occurredAt: event.occurredAt,
      data: event.payload
    });
  }

  buildHeaders(endpoint, event, body, secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'DMS-Webhooks/1.0',
      'X-DMS-Event': event.type,
      'X-DMS-Event-Id': event.id,
      'X-DMS-Delivery-Attempt': String(endpoint.__attempt || 1),
      'X-DMS-Timestamp': String(timestamp),
      'X-DMS-Signature': secret ? buildSignatureHeader(secret, timestamp, body) : ''
    };

    if (endpoint.customHeaders && typeof endpoint.customHeaders === 'object') {
      for (const [key, value] of Object.entries(endpoint.customHeaders)) {
        if (key && value != null) headers[key] = String(value);
      }
    }

    return headers;
  }

  async postToEndpoint(url, body, headers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      const text = await response.text().catch(() => '');
      return { ok: response.ok, status: response.status, body: truncate(text) };
    } finally {
      clearTimeout(timeout);
    }
  }

  async deliverOne(delivery, { endpoint, event }) {
    const secret = this.getPlainSecret(endpoint);
    const body = this.buildEventBody(event);
    const headers = this.buildHeaders({ ...endpoint, __attempt: delivery.attempts + 1 }, event, body, secret);

    try {
      const result = await this.postToEndpoint(endpoint.url, body, headers);

      if (result.ok) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SUCCESS',
            attempts: { increment: 1 },
            responseCode: result.status,
            responseBody: result.body,
            lastError: null,
            deliveredAt: new Date()
          }
        });
        await prisma.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: { lastSuccessAt: new Date() }
        });
        return { id: delivery.id, status: 'SUCCESS' };
      }

      await this.handleFailure(delivery, {
        endpointId: endpoint.id,
        responseCode: result.status,
        responseBody: result.body,
        error: `HTTP ${result.status}`
      });
      return { id: delivery.id, status: 'FAILED', responseCode: result.status };
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'Request timed out' : (error?.message || 'Request failed');
      await this.handleFailure(delivery, { endpointId: endpoint.id, error: reason });
      return { id: delivery.id, status: 'FAILED', error: reason };
    }
  }

  async handleFailure(delivery, { endpointId, responseCode = null, responseBody = null, error = null }) {
    const attempts = delivery.attempts + 1;
    const exhausted = attempts >= (delivery.maxAttempts || 6);

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: exhausted ? 'DEAD_LETTER' : 'PENDING',
        attempts,
        responseCode,
        responseBody,
        lastError: truncate(error, 1000),
        availableAt: exhausted ? delivery.availableAt : new Date(Date.now() + backoffFor(attempts))
      }
    });

    await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: { lastFailureAt: new Date(), failureCount: { increment: 1 } }
    });
  }

  async processPendingDeliveries(limit = BATCH_SIZE) {
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { status: 'PENDING', availableAt: { lte: new Date() } },
      orderBy: { availableAt: 'asc' },
      take: limit,
      include: { event: true, endpoint: true }
    });
    if (deliveries.length === 0) return { processed: 0 };

    let processed = 0;
    for (const delivery of deliveries) {
      if (!delivery.endpoint?.isActive) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'DEAD_LETTER', lastError: 'Endpoint disabled' }
        });
        continue;
      }
      await this.deliverOne(delivery, { endpoint: delivery.endpoint, event: delivery.event });
      processed += 1;
    }
    return { processed };
  }

  async retryDelivery(id) {
    const delivery = await prisma.webhookDelivery.findUnique({ where: { id: String(id) } });
    if (!delivery) throw new NotFoundError('Webhook delivery');
    return prisma.webhookDelivery.update({
      where: { id: String(id) },
      data: { status: 'PENDING', availableAt: new Date(), lastError: null }
    });
  }

  async listDeliveries({ status, endpointId, eventId, limit = 50, offset = 0 } = {}) {
    const where = {};
    if (status) where.status = String(status).toUpperCase();
    if (endpointId != null) where.endpointId = Number(endpointId);
    if (eventId) where.eventId = String(eventId);

    const [items, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit) || 50, 200),
        skip: Number(offset) || 0,
        include: {
          endpoint: { select: { id: true, name: true, url: true, system: true } },
          event: { select: { id: true, type: true, entityType: true, entityId: true, occurredAt: true } }
        }
      }),
      prisma.webhookDelivery.count({ where })
    ]);

    return { items, total };
  }

  /** Send a synthetic ping so an operator can verify the endpoint is reachable. */
  async testEndpoint(id) {
    const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: Number(id) } });
    if (!endpoint) throw new NotFoundError('Webhook endpoint');

    const secret = this.getPlainSecret(endpoint);
    const syntheticEvent = {
      id: `test_${crypto.randomUUID()}`,
      type: 'integration.ping',
      system: endpoint.system,
      entityType: null,
      entityId: null,
      occurredAt: new Date(),
      payload: { message: 'This is a test delivery from the DMS integration layer.' }
    };

    const body = this.buildEventBody(syntheticEvent);
    const headers = this.buildHeaders({ ...endpoint, __attempt: 1 }, syntheticEvent, body, secret);

    try {
      const result = await this.postToEndpoint(endpoint.url, body, headers);
      return { ok: result.ok, status: result.status, responseBody: result.body };
    } catch (error) {
      return { ok: false, status: null, error: error?.message || 'Request failed' };
    }
  }

  // ----------------------------------------------------------------
  // Background worker
  // ----------------------------------------------------------------

  async runOnce() {
    if (this._running) return;
    this._running = true;
    try {
      await this.dispatchPendingEvents();
      await this.processPendingDeliveries();
    } catch (error) {
      logger.error('Webhook worker cycle failed', { error });
    } finally {
      this._running = false;
    }
  }

  scheduleProcessing(intervalMs = INTERVAL_MS) {
    if (this._timer) return;
    this._timer = setInterval(() => {
      this.runOnce().catch((error) => logger.error('Webhook worker error', { error }));
    }, intervalMs);
    if (this._timer.unref) this._timer.unref();
  }

  stopProcessing() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

module.exports = new WebhookService();
