const express = require('express');
const integrationController = require('../controllers/integrationController');
const { authenticate, requireSystemAdmin } = require('../middleware/auth');

/**
 * Integration admin routes.
 * Everything here is human-facing and locked behind JWT + system admin.
 * Machine-to-machine traffic uses /api/v1 (see routes/apiV1.js).
 */

const router = express.Router();

router.use(authenticate, requireSystemAdmin);

// Catalog: available systems, scopes and event types
router.get('/catalog', integrationController.getCatalog);

// API keys
router.get('/api-keys', integrationController.listApiKeys);
router.post('/api-keys', integrationController.createApiKey);
router.get('/api-keys/:id', integrationController.getApiKey);
router.put('/api-keys/:id', integrationController.updateApiKey);
router.post('/api-keys/:id/rotate-secret', integrationController.rotateApiKeySecret);
router.post('/api-keys/:id/revoke', integrationController.revokeApiKey);
router.delete('/api-keys/:id', integrationController.deleteApiKey);

// Webhook endpoints
router.get('/webhooks', integrationController.listWebhookEndpoints);
router.post('/webhooks', integrationController.createWebhookEndpoint);
router.get('/webhooks/:id', integrationController.getWebhookEndpoint);
router.put('/webhooks/:id', integrationController.updateWebhookEndpoint);
router.post('/webhooks/:id/rotate-secret', integrationController.rotateWebhookSecret);
router.post('/webhooks/:id/test', integrationController.testWebhookEndpoint);
router.delete('/webhooks/:id', integrationController.deleteWebhookEndpoint);

// Outbox events & deliveries
router.get('/events', integrationController.listEvents);
router.get('/events/:id', integrationController.getEvent);
router.post('/events/:id/requeue', integrationController.requeueEvent);

router.get('/deliveries', integrationController.listDeliveries);
router.post('/deliveries/:id/retry', integrationController.retryDelivery);

// External references
router.get('/external-references', integrationController.listExternalReferences);
router.post('/external-references', integrationController.createExternalReference);
router.delete('/external-references/:id', integrationController.deleteExternalReference);

module.exports = router;
