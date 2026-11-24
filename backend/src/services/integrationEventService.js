const prisma = require('../config/database');
const logger = require('../utils/logger');

/**
 * Integration Event Service (Transactional Outbox)
 *
 * Domain events are written to the IntegrationEvent table instead of being
 * dispatched inline. The webhook dispatcher worker later fans them out to the
 * subscribed endpoints. This guarantees no event is lost when the process
 * restarts (pm2) or when a consumer is temporarily down.
 */

const EVENT_TYPES = Object.freeze({
  DOCUMENT_CREATED: 'document.created',
  DOCUMENT_PUBLISHED: 'document.published',
  DOCUMENT_SUPERSEDED: 'document.superseded',
  DOCUMENT_OBSOLETE: 'document.obsolete',
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_STATUS_CHANGED: 'project.status.changed',
  PROJECT_ITERATION_CREATED: 'project.iteration.created',
  PROJECT_STAGE_ADVANCED: 'project.stage.advanced',
  PROJECT_DOCUMENT_LINKED: 'project.document.linked',
  PROJECT_DOCUMENT_UNLINKED: 'project.document.unlinked',
  PROJECT_CHANGE_REQUEST_CREATED: 'project.change-request.created'
});

class IntegrationEventService {
  constructor() {
    this.EVENT_TYPES = EVENT_TYPES;
  }

  /**
   * Persist an outbound event to the outbox.
   * Never throws — a failing integration hook must not break the business flow.
   *
   * @param {Object} params
   * @param {string} params.type - Event type, e.g. "project.created"
   * @param {string} [params.system] - Target system hint (PMS/ERP/WMS/SALES). null = broadcast.
   * @param {string} [params.entityType]
   * @param {number} [params.entityId]
   * @param {Object} [params.payload]
   * @param {Object} [options]
   * @param {Object} [options.client] - Prisma client or transaction client (defaults to global client)
   * @returns {Promise<Object|null>}
   */
  async publish(params = {}, options = {}) {
    const client = options.client || prisma;
    const { type, system = null, entityType = null, entityId = null, payload = {} } = params;

    if (!type) {
      logger.warn('IntegrationEvent.publish called without a type', { params });
      return null;
    }

    try {
      return await client.integrationEvent.create({
        data: {
          type: String(type),
          system: system ? String(system).toUpperCase() : null,
          entityType: entityType ? String(entityType) : null,
          entityId: entityId != null && Number.isFinite(Number(entityId)) ? Number(entityId) : null,
          payload: payload ?? {}
        }
      });
    } catch (error) {
      logger.error('Failed to persist integration event', { type, error });
      return null;
    }
  }

  async listEvents({ status, type, entityType, entityId, limit = 50, offset = 0 } = {}) {
    const where = {};
    if (status) where.status = String(status).toUpperCase();
    if (type) where.type = String(type);
    if (entityType) where.entityType = String(entityType);
    if (entityId != null) where.entityId = Number(entityId);

    const [items, total] = await Promise.all([
      prisma.integrationEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: Math.min(Number(limit) || 50, 200),
        skip: Number(offset) || 0,
        include: { _count: { select: { deliveries: true } } }
      }),
      prisma.integrationEvent.count({ where })
    ]);

    return { items, total };
  }

  async getEvent(id) {
    return prisma.integrationEvent.findUnique({
      where: { id: String(id) },
      include: { deliveries: { include: { endpoint: { select: { id: true, name: true, url: true, system: true } } } } }
    });
  }

  /** Reset a dead-lettered event so the dispatcher picks it up again. */
  async requeueEvent(id) {
    return prisma.integrationEvent.update({
      where: { id: String(id) },
      data: { status: 'PENDING', availableAt: new Date(), lastError: null }
    });
  }
}

module.exports = new IntegrationEventService();
module.exports.EVENT_TYPES = EVENT_TYPES;
