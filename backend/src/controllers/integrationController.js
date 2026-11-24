const asyncHandler = require('../utils/asyncHandler');
const ResponseFormatter = require('../utils/responseFormatter');
const apiKeyService = require('../services/apiKeyService');
const externalReferenceService = require('../services/externalReferenceService');
const webhookService = require('../services/webhookService');
const integrationEventService = require('../services/integrationEventService');
const { EVENT_TYPES } = require('../services/integrationEventService');

/**
 * Integration Controller
 * Admin-facing management of the integration layer (API keys, webhook
 * subscribers, event log, deliveries and external references).
 * All routes are mounted behind JWT auth + system admin.
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

// ----------------------------------------------------------------
// Catalog
// ----------------------------------------------------------------

exports.getCatalog = asyncHandler(async (req, res) => {
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
// API keys
// ----------------------------------------------------------------

exports.listApiKeys = asyncHandler(async (req, res) => {
  const keys = await apiKeyService.listKeys();
  return ResponseFormatter.success(res, { apiKeys: keys }, 'API keys retrieved successfully');
});

exports.createApiKey = asyncHandler(async (req, res) => {
  const result = await apiKeyService.generateKey({
    name: req.body?.name,
    system: req.body?.system,
    scopes: req.body?.scopes,
    description: req.body?.description,
    expiresAt: req.body?.expiresAt,
    createdById: req.user?.id || null
  });

  return ResponseFormatter.success(
    res,
    result,
    'API key created. Store the plain key and signing secret now — they will not be shown again.',
    201
  );
});

exports.getApiKey = asyncHandler(async (req, res) => {
  const key = await apiKeyService.getKey(req.params.id);
  return ResponseFormatter.success(res, { apiKey: key }, 'API key retrieved successfully');
});

exports.updateApiKey = asyncHandler(async (req, res) => {
  const key = await apiKeyService.updateKey(req.params.id, req.body || {});
  return ResponseFormatter.success(res, { apiKey: key }, 'API key updated successfully');
});

exports.rotateApiKeySecret = asyncHandler(async (req, res) => {
  const result = await apiKeyService.rotateSigningSecret(req.params.id);
  return ResponseFormatter.success(res, result, 'Signing secret rotated successfully');
});

exports.revokeApiKey = asyncHandler(async (req, res) => {
  const key = await apiKeyService.revokeKey(req.params.id);
  return ResponseFormatter.success(res, { apiKey: key }, 'API key revoked successfully');
});

exports.deleteApiKey = asyncHandler(async (req, res) => {
  await apiKeyService.deleteKey(req.params.id);
  return ResponseFormatter.success(res, null, 'API key deleted successfully');
});

// ----------------------------------------------------------------
// Webhook endpoints
// ----------------------------------------------------------------

exports.listWebhookEndpoints = asyncHandler(async (req, res) => {
  const endpoints = await webhookService.listEndpoints();
  return ResponseFormatter.success(res, { endpoints }, 'Webhook endpoints retrieved successfully');
});

exports.createWebhookEndpoint = asyncHandler(async (req, res) => {
  const result = await webhookService.createEndpoint({
    name: req.body?.name,
    url: req.body?.url,
    system: req.body?.system,
    secret: req.body?.secret,
    events: req.body?.events,
    customHeaders: req.body?.customHeaders,
    description: req.body?.description,
    maxAttempts: req.body?.maxAttempts,
    createdById: req.user?.id || null
  });

  return ResponseFormatter.success(res, result, 'Webhook endpoint created successfully', 201);
});

exports.getWebhookEndpoint = asyncHandler(async (req, res) => {
  const endpoint = await webhookService.getEndpoint(req.params.id);
  return ResponseFormatter.success(res, { endpoint }, 'Webhook endpoint retrieved successfully');
});

exports.updateWebhookEndpoint = asyncHandler(async (req, res) => {
  const endpoint = await webhookService.updateEndpoint(req.params.id, req.body || {});
  return ResponseFormatter.success(res, { endpoint }, 'Webhook endpoint updated successfully');
});

exports.rotateWebhookSecret = asyncHandler(async (req, res) => {
  const result = await webhookService.rotateSecret(req.params.id);
  return ResponseFormatter.success(res, result, 'Webhook secret rotated successfully');
});

exports.testWebhookEndpoint = asyncHandler(async (req, res) => {
  const result = await webhookService.testEndpoint(req.params.id);
  return ResponseFormatter.success(res, result, 'Test delivery dispatched');
});

exports.deleteWebhookEndpoint = asyncHandler(async (req, res) => {
  await webhookService.deleteEndpoint(req.params.id);
  return ResponseFormatter.success(res, null, 'Webhook endpoint deleted successfully');
});

// ----------------------------------------------------------------
// Events & deliveries
// ----------------------------------------------------------------

exports.listEvents = asyncHandler(async (req, res) => {
  const { status, type, entityType, entityId, limit, offset } = req.query;
  const result = await integrationEventService.listEvents({ status, type, entityType, entityId, limit, offset });
  return ResponseFormatter.success(res, result, 'Integration events retrieved successfully');
});

exports.getEvent = asyncHandler(async (req, res) => {
  const event = await integrationEventService.getEvent(req.params.id);
  if (!event) return ResponseFormatter.notFound(res, 'Integration event');
  return ResponseFormatter.success(res, { event }, 'Integration event retrieved successfully');
});

exports.requeueEvent = asyncHandler(async (req, res) => {
  const event = await integrationEventService.requeueEvent(req.params.id);
  return ResponseFormatter.success(res, { event }, 'Integration event requeued successfully');
});

exports.listDeliveries = asyncHandler(async (req, res) => {
  const { status, endpointId, eventId, limit, offset } = req.query;
  const result = await webhookService.listDeliveries({ status, endpointId, eventId, limit, offset });
  return ResponseFormatter.success(res, result, 'Webhook deliveries retrieved successfully');
});

exports.retryDelivery = asyncHandler(async (req, res) => {
  const delivery = await webhookService.retryDelivery(req.params.id);
  return ResponseFormatter.success(res, { delivery }, 'Delivery queued for retry');
});

// ----------------------------------------------------------------
// External references
// ----------------------------------------------------------------

exports.listExternalReferences = asyncHandler(async (req, res) => {
  const { system, entityType, entityId, externalType, limit } = req.query;
  const references = await externalReferenceService.list({ system, entityType, entityId, externalType, limit });
  return ResponseFormatter.success(res, { references }, 'External references retrieved successfully');
});

exports.createExternalReference = asyncHandler(async (req, res) => {
  const reference = await externalReferenceService.link({
    system: req.body?.system,
    entityType: req.body?.entityType,
    entityId: req.body?.entityId,
    externalType: req.body?.externalType,
    externalId: req.body?.externalId,
    externalUrl: req.body?.externalUrl,
    metadata: req.body?.metadata,
    createdById: req.user?.id || null
  });
  return ResponseFormatter.success(res, { reference }, 'External reference linked successfully', 201);
});

exports.deleteExternalReference = asyncHandler(async (req, res) => {
  await externalReferenceService.unlink(req.params.id);
  return ResponseFormatter.success(res, null, 'External reference removed successfully');
});
