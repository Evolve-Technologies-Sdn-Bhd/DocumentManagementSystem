const express = require('express');
const controller = require('../controllers/publicApiV1Controller');
const openapi = require('../docs/openapi.v1.json');
const { authenticateApiKey, requireScope, verifyInboundSignature } = require('../middleware/integrationAuth');

/**
 * Public API v1 — machine-to-machine surface for external systems.
 *
 * Auth:    X-API-Key: dms_<system>_<prefix>.<secret>
 *          (or) Authorization: Bearer dms_...
 * Signing: X-DMS-Timestamp + X-DMS-Signature (sha256=<hmac of "<ts>.<rawBody>">)
 *          — required on every write request for keys that have a signing secret.
 * Scopes:  documents:read|write, projects:read|write, references:read|write
 */

const router = express.Router();

// Awam: kontrak API (OpenAPI 3.1) supaya vendor ERP/WMS/PMS boleh import
// ke Postman/Swagger sebelum onboarding. Tiada API key diperlukan.
router.get('/openapi.json', (req, res) => res.json(openapi));

router.use(authenticateApiKey);

// Meta — any valid key
router.get('/ping', controller.ping);
router.get('/catalog', controller.catalog);

// Documents
router.get('/documents', requireScope('documents:read'), controller.listDocuments);
router.get('/documents/:id', requireScope('documents:read'), controller.getDocument);

// Projects
router.get('/projects', requireScope('projects:read'), controller.listProjects);
router.get('/projects/:id', requireScope('projects:read'), controller.getProject);

// External references
router.get('/external-references', requireScope('references:read'), controller.listExternalReferences);
router.get('/external-references/resolve', requireScope('references:read'), controller.resolveExternalReference);
router.post(
  '/external-references',
  requireScope('references:write'),
  verifyInboundSignature,
  controller.linkExternalReference
);
router.delete(
  '/external-references',
  requireScope('references:write'),
  verifyInboundSignature,
  controller.unlinkExternalReference
);

// Outbox events (poll-based alternative to webhooks)
router.get('/events', requireScope('documents:read', 'projects:read'), controller.listEvents);

module.exports = router;
