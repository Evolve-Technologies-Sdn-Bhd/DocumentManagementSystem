const asyncHandler = require('../utils/asyncHandler');
const ResponseFormatter = require('../utils/responseFormatter');
const prisma = require('../config/database');
const documentService = require('../services/documentService');
const externalReferenceService = require('../services/externalReferenceService');
const integrationEventService = require('../services/integrationEventService');
const { EVENT_TYPES } = require('../services/integrationEventService');

/**
 * Public API v1 Controller
 * Machine-to-machine surface for external systems (ERP / WMS / PMS / Sales).
 * All routes sit behind `authenticateApiKey` + `requireScope` so the caller
 * identity is already resolved in `req.integration`.
 */

const SYSTEMS = ['ERP', 'WMS', 'PMS', 'SALES', 'CUSTOM'];

const SCOPES = [
  'documents:read',
  'documents:write',
  'projects:read',
  'projects:write',
  'references:read',
  'references:write'
];

// Stable, integration-safe projection of a project (no internal-only fields).
const PROJECT_PUBLIC_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  status: true,
  clientName: true,
  clientPic: true,
  startDate: true,
  plannedCompletionDate: true,
  actualCompletionDate: true,
  createdAt: true,
  updatedAt: true,
  projectCategory: { select: { id: true, name: true } },
  manager: { select: { id: true, email: true, firstName: true, lastName: true } },
  iterations: {
    orderBy: { iterationNo: 'desc' },
    select: {
      id: true,
      iterationNo: true,
      name: true,
      startedAt: true,
      endedAt: true,
      isActive: true
    }
  }
};

// ----------------------------------------------------------------
// Meta
// ----------------------------------------------------------------

exports.ping = asyncHandler(async (req, res) => {
  return ResponseFormatter.success(
    res,
    {
      ok: true,
      service: 'dms-integration-api',
      version: 'v1',
      system: req.integration?.system || null,
      timestamp: new Date().toISOString()
    },
    'pong'
  );
});

exports.catalog = asyncHandler(async (req, res) => {
  return ResponseFormatter.success(
    res,
    {
      systems: SYSTEMS,
      scopes: SCOPES,
      eventTypes: Object.values(EVENT_TYPES)
    },
    'Integration catalog retrieved successfully'
  );
});

// ----------------------------------------------------------------
// Documents
// ----------------------------------------------------------------

exports.listDocuments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 15, sortBy = 'createdAt', sortOrder = 'desc', ...filters } = req.query;

  const result = await documentService.listDocuments(
    filters,
    { page: Number(page) || 1, limit: Number(limit) || 15, sortBy, sortOrder },
    null
  );

  const items = Array.isArray(result) ? result : result?.documents || result?.items || [];
  const total = Array.isArray(result) ? result.length : result?.total ?? items.length;

  return ResponseFormatter.paginated(res, items, Number(page) || 1, Number(limit) || 15, total, 'Documents retrieved successfully');
});

exports.getDocument = asyncHandler(async (req, res) => {
  const document = await documentService.getDocumentById(Number(req.params.id), null);
  return ResponseFormatter.success(res, { document }, 'Document retrieved successfully');
});

// ----------------------------------------------------------------
// Projects
// ----------------------------------------------------------------

exports.listProjects = asyncHandler(async (req, res) => {
  const { search, projectCategoryId, status, page = 1, limit = 50 } = req.query;

  const where = {};
  if (search) where.OR = [{ code: { contains: String(search) } }, { name: { contains: String(search) } }];
  if (projectCategoryId) where.projectCategoryId = Number(projectCategoryId);
  if (status) where.status = String(status).toUpperCase();

  const take = Math.min(Number(limit) || 50, 200);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      select: PROJECT_PUBLIC_SELECT,
      orderBy: { createdAt: 'desc' },
      take,
      skip
    }),
    prisma.project.count({ where })
  ]);

  return ResponseFormatter.paginated(res, projects, Number(page) || 1, take, total, 'Projects retrieved successfully');
});

exports.getProject = asyncHandler(async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: Number(req.params.id) },
    select: PROJECT_PUBLIC_SELECT
  });

  if (!project) return ResponseFormatter.notFound(res, 'Project');
  return ResponseFormatter.success(res, { project }, 'Project retrieved successfully');
});

// ----------------------------------------------------------------
// External references
// ----------------------------------------------------------------

exports.listExternalReferences = asyncHandler(async (req, res) => {
  const { entityType, entityId, externalType, limit } = req.query;
  const system = req.query.system || req.integration?.system;

  const references = await externalReferenceService.list({ system, entityType, entityId, externalType, limit });
  return ResponseFormatter.success(res, { references }, 'External references retrieved successfully');
});

exports.resolveExternalReference = asyncHandler(async (req, res) => {
  const { externalType, externalId } = req.query;
  const system = req.query.system || req.integration?.system;

  const reference = await externalReferenceService.resolve({ system, externalType, externalId });
  if (!reference) return ResponseFormatter.notFound(res, 'External reference');
  return ResponseFormatter.success(res, { reference }, 'External reference resolved successfully');
});

exports.linkExternalReference = asyncHandler(async (req, res) => {
  const reference = await externalReferenceService.link({
    system: req.body?.system || req.integration?.system,
    entityType: req.body?.entityType,
    entityId: req.body?.entityId,
    externalType: req.body?.externalType,
    externalId: req.body?.externalId,
    externalUrl: req.body?.externalUrl,
    metadata: req.body?.metadata,
    createdById: null
  });
  return ResponseFormatter.success(res, { reference }, 'External reference linked successfully', 201);
});

exports.unlinkExternalReference = asyncHandler(async (req, res) => {
  const { externalType, externalId } = req.query;
  const system = req.query.system || req.integration?.system;

  const removed = await externalReferenceService.unlinkByExternal({ system, externalType, externalId });
  if (!removed) return ResponseFormatter.notFound(res, 'External reference');
  return ResponseFormatter.success(res, removed, 'External reference removed successfully');
});

// ----------------------------------------------------------------
// Outbox events (poll-based alternative to webhooks)
// ----------------------------------------------------------------

exports.listEvents = asyncHandler(async (req, res) => {
  const { status, type, entityType, entityId, limit, offset } = req.query;
  const result = await integrationEventService.listEvents({
    status,
    type,
    entityType,
    entityId,
    limit,
    offset
  });
  return ResponseFormatter.success(res, result, 'Integration events retrieved successfully');
});
