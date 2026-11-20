const crypto = require('crypto');
const prisma = require('../config/database');
const encryptionService = require('./encryptionService');
const { ValidationError, NotFoundError } = require('../utils/errors');

/**
 * ApiKey Service
 * Issues and validates machine-to-machine credentials for external systems
 * (ERP / WMS / PMS / Sales) calling the DMS API v1.
 */

const VALID_SYSTEMS = ['ERP', 'WMS', 'PMS', 'SALES', 'CUSTOM'];
const USAGE_TOUCH_INTERVAL_MS = 60 * 1000;

const normalizeSystem = (value) => {
  const upper = String(value || 'CUSTOM').trim().toUpperCase();
  return VALID_SYSTEMS.includes(upper) ? upper : 'CUSTOM';
};

const normalizeScopes = (scopes) => {
  if (scopes == null) return ['*'];
  const list = Array.isArray(scopes) ? scopes : String(scopes).split(',');
  const cleaned = list
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : ['*'];
};

const hashKey = (rawKey) => crypto.createHash('sha256').update(String(rawKey)).digest('hex');

const buildPrefix = (system) => {
  const short = normalizeSystem(system).toLowerCase();
  return `dms_${short}_${crypto.randomBytes(4).toString('hex')}`;
};

class ApiKeyService {
  normalizeSystem(value) {
    return normalizeSystem(value);
  }

  normalizeScopes(scopes) {
    return normalizeScopes(scopes);
  }

  /**
   * Create a new API key. The plaintext key is returned exactly once.
   */
  async generateKey({
    name,
    system = 'CUSTOM',
    scopes = null,
    description = null,
    expiresAt = null,
    createdById = null,
    withSigningSecret = true
  }) {
    if (!name || !String(name).trim()) {
      throw new ValidationError('API key name is required');
    }

    const prefix = buildPrefix(system);
    const secretPart = crypto.randomBytes(32).toString('base64url');
    const plainTextKey = `${prefix}.${secretPart}`;

    const signingSecretPlain = withSigningSecret
      ? `whsec_${crypto.randomBytes(32).toString('base64url')}`
      : null;

    const apiKey = await prisma.apiKey.create({
      data: {
        name: String(name).trim(),
        keyPrefix: prefix,
        keyHash: hashKey(plainTextKey),
        signingSecret: signingSecretPlain ? encryptionService.encryptString(signingSecretPlain) : null,
        system: normalizeSystem(system),
        scopes: normalizeScopes(scopes),
        description: description ? String(description) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdById
      }
    });

    return {
      apiKey: this.toSafe(apiKey),
      plainTextKey,
      signingSecret: signingSecretPlain
    };
  }

  /**
   * Validate a raw key supplied by a caller. Returns the ApiKey row or null.
   */
  async verifyKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return null;
    const trimmed = rawKey.trim();
    const prefix = trimmed.split('.')[0];
    if (!prefix) return null;

    const record = await prisma.apiKey.findUnique({ where: { keyPrefix: prefix } });
    if (!record) return null;
    if (!record.isActive || record.revokedAt) return null;
    if (record.expiresAt && new Date() > record.expiresAt) return null;
    if (record.keyHash !== hashKey(trimmed)) return null;

    return record;
  }

  /**
   * Throttled usage tracking so every request does not write to the DB.
   */
  async touchUsage(apiKeyId, ipAddress = null) {
    try {
      const record = await prisma.apiKey.findUnique({
        where: { id: apiKeyId },
        select: { lastUsedAt: true }
      });
      const last = record?.lastUsedAt ? new Date(record.lastUsedAt).getTime() : 0;
      if (Date.now() - last < USAGE_TOUCH_INTERVAL_MS) return;

      await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: {
          lastUsedAt: new Date(),
          lastUsedIp: ipAddress || null,
          requestCount: { increment: 1 }
        }
      });
    } catch (_err) {
      // Usage tracking must never break a request.
    }
  }

  getSigningSecret(record) {
    if (!record?.signingSecret) return null;
    try {
      return encryptionService.decryptString(record.signingSecret);
    } catch {
      return null;
    }
  }

  async listKeys() {
    const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
    return keys.map((k) => this.toSafe(k));
  }

  async getKey(id) {
    const key = await prisma.apiKey.findUnique({ where: { id: Number(id) } });
    if (!key) throw new NotFoundError('API key');
    return this.toSafe(key);
  }

  async updateKey(id, { name, scopes, description, isActive, expiresAt }) {
    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (scopes !== undefined) data.scopes = normalizeScopes(scopes);
    if (description !== undefined) data.description = description ? String(description) : null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

    if (Object.keys(data).length === 0) throw new ValidationError('No fields to update');

    const key = await prisma.apiKey.update({ where: { id: Number(id) }, data });
    return this.toSafe(key);
  }

  async rotateSigningSecret(id) {
    const plain = `whsec_${crypto.randomBytes(32).toString('base64url')}`;
    const key = await prisma.apiKey.update({
      where: { id: Number(id) },
      data: { signingSecret: encryptionService.encryptString(plain) }
    });
    return { apiKey: this.toSafe(key), signingSecret: plain };
  }

  async revokeKey(id) {
    const key = await prisma.apiKey.update({
      where: { id: Number(id) },
      data: { isActive: false, revokedAt: new Date() }
    });
    return this.toSafe(key);
  }

  async deleteKey(id) {
    await prisma.apiKey.delete({ where: { id: Number(id) } });
    return { id: Number(id) };
  }

  /** Strip secrets before returning a key record over the API. */
  toSafe(record) {
    if (!record) return null;
    return {
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      system: record.system,
      scopes: record.scopes,
      description: record.description,
      isActive: record.isActive,
      expiresAt: record.expiresAt,
      lastUsedAt: record.lastUsedAt,
      lastUsedIp: record.lastUsedIp,
      requestCount: record.requestCount,
      hasSigningSecret: Boolean(record.signingSecret),
      revokedAt: record.revokedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
}

module.exports = new ApiKeyService();
