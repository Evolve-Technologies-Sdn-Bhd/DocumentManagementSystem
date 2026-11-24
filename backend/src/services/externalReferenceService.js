const prisma = require('../config/database');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');

/**
 * ExternalReference Service
 * Links DMS records (Document, Project, ...) to records living in external
 * systems (ERP Sales Orders, WMS Goods Receipts, PMS projects, ...).
 *
 * The link is polymorphic and system-agnostic so new integrations never
 * require a schema change.
 */

const VALID_SYSTEMS = ['ERP', 'WMS', 'PMS', 'SALES', 'CUSTOM'];

const normalizeSystem = (value) => {
  const upper = String(value || '').trim().toUpperCase();
  if (!upper) throw new ValidationError('system is required');
  return VALID_SYSTEMS.includes(upper) ? upper : 'CUSTOM';
};

const requireString = (value, field) => {
  const str = String(value ?? '').trim();
  if (!str) throw new ValidationError(`${field} is required`);
  return str;
};

class ExternalReferenceService {
  async link({
    system,
    entityType,
    entityId,
    externalType,
    externalId,
    externalUrl = null,
    metadata = null,
    createdById = null
  }) {
    const payload = {
      system: normalizeSystem(system),
      entityType: requireString(entityType, 'entityType'),
      entityId: Number(entityId),
      externalType: requireString(externalType, 'externalType'),
      externalId: requireString(externalId, 'externalId'),
      externalUrl: externalUrl ? String(externalUrl) : null,
      metadata: metadata ?? null
    };

    if (!Number.isFinite(payload.entityId)) {
      throw new ValidationError('entityId must be a number');
    }

    const existing = await prisma.externalReference.findUnique({
      where: {
        system_externalType_externalId: {
          system: payload.system,
          externalType: payload.externalType,
          externalId: payload.externalId
        }
      }
    });

    // The same external record can only point at one DMS record.
    if (existing && !(existing.entityType === payload.entityType && existing.entityId === payload.entityId)) {
      throw new ConflictError(
        `${payload.system} ${payload.externalType} ${payload.externalId} is already linked to ${existing.entityType} #${existing.entityId}`
      );
    }

    const record = await prisma.externalReference.upsert({
      where: {
        system_externalType_externalId: {
          system: payload.system,
          externalType: payload.externalType,
          externalId: payload.externalId
        }
      },
      update: {
        entityType: payload.entityType,
        entityId: payload.entityId,
        externalUrl: payload.externalUrl,
        metadata: payload.metadata
      },
      create: { ...payload, createdById }
    });

    return record;
  }

  async unlink(id) {
    const existing = await prisma.externalReference.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('External reference');
    await prisma.externalReference.delete({ where: { id: Number(id) } });
    return { id: Number(id) };
  }

  async unlinkByExternal({ system, externalType, externalId }) {
    const row = await prisma.externalReference.findUnique({
      where: {
        system_externalType_externalId: {
          system: normalizeSystem(system),
          externalType: requireString(externalType, 'externalType'),
          externalId: requireString(externalId, 'externalId')
        }
      }
    });
    if (!row) return null;
    await prisma.externalReference.delete({ where: { id: row.id } });
    return { id: row.id };
  }

  async listForEntity(entityType, entityId) {
    return prisma.externalReference.findMany({
      where: { entityType: requireString(entityType, 'entityType'), entityId: Number(entityId) },
      orderBy: { createdAt: 'desc' }
    });
  }

  async resolve({ system, externalType, externalId }) {
    return prisma.externalReference.findUnique({
      where: {
        system_externalType_externalId: {
          system: normalizeSystem(system),
          externalType: requireString(externalType, 'externalType'),
          externalId: requireString(externalId, 'externalId')
        }
      }
    });
  }

  /** Resolve a single DMS entity from an external identity (throws if missing). */
  async requireResolved({ system, externalType, externalId }) {
    const ref = await this.resolve({ system, externalType, externalId });
    if (!ref) {
      throw new NotFoundError(`Link for ${system} ${externalType} ${externalId}`);
    }
    return ref;
  }

  async list(filters = {}) {
    const where = {};
    if (filters.system) where.system = normalizeSystem(filters.system);
    if (filters.entityType) where.entityType = String(filters.entityType);
    if (filters.entityId != null) where.entityId = Number(filters.entityId);
    if (filters.externalType) where.externalType = String(filters.externalType);

    return prisma.externalReference.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(filters.limit) || 100, 500)
    });
  }
}

module.exports = new ExternalReferenceService();
module.exports.VALID_SYSTEMS = VALID_SYSTEMS;
