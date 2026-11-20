const apiKeyService = require('../services/apiKeyService');
const { verifySignatureHeader } = require('../utils/hmac');
const { getClientIp } = require('../utils/clientIp');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Integration Auth Middleware
 * Machine-to-machine authentication for the public API v1.
 *
 *   X-API-Key: dms_pms_ab12cd34.<secret>       (or Authorization: Bearer dms_...)
 *   X-DMS-Timestamp: <unix seconds>
 *   X-DMS-Signature: sha256=<hmac>
 *
 * When an API key has a signing secret, write requests must also carry a valid
 * HMAC signature so the payload cannot be tampered with in transit.
 */

const extractRawKey = (req) => {
  const headerKey = req.headers['x-api-key'];
  if (headerKey) return String(headerKey).trim();

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    // Only treat DMS-issued keys as API keys; JWTs are handled by `authenticate`.
    if (token.startsWith('dms_')) return token;
  }
  return null;
};

const authenticateApiKey = async (req, res, next) => {
  try {
    const rawKey = extractRawKey(req);
    if (!rawKey) {
      return ResponseFormatter.error(res, 'Missing API key', 401, { code: 'API_KEY_MISSING' });
    }

    const record = await apiKeyService.verifyKey(rawKey);
    if (!record) {
      return ResponseFormatter.error(res, 'Invalid or revoked API key', 401, { code: 'API_KEY_INVALID' });
    }

    const ip = getClientIp(req);
    apiKeyService.touchUsage(record.id, ip).catch(() => {});

    req.integration = {
      apiKeyId: record.id,
      name: record.name,
      system: record.system,
      scopes: Array.isArray(record.scopes) ? record.scopes : ['*'],
      signingSecret: apiKeyService.getSigningSecret(record)
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Require at least one of the given scopes (or the wildcard).
 */
const requireScope = (...scopes) => {
  return (req, res, next) => {
    const granted = req.integration?.scopes || [];
    if (granted.includes('*') || scopes.some((scope) => granted.includes(scope))) {
      return next();
    }
    return ResponseFormatter.error(
      res,
      `This API key is missing the required scope: ${scopes.join(' or ')}`,
      403,
      { code: 'INSUFFICIENT_SCOPE', required: scopes }
    );
  };
};

/**
 * Verify the inbound HMAC signature against the API key's signing secret.
 * Skipped automatically for keys that have no signing secret configured.
 */
const verifyInboundSignature = (req, res, next) => {
  const secret = req.integration?.signingSecret;
  if (!secret) return next();

  const rawBody = req.rawBody != null ? req.rawBody : '';

  const result = verifySignatureHeader({
    secret,
    timestamp: req.headers['x-dms-timestamp'],
    rawBody,
    header: req.headers['x-dms-signature']
  });

  if (!result.ok) {
    return ResponseFormatter.error(res, `Invalid request signature: ${result.reason}`, 401, {
      code: 'SIGNATURE_INVALID'
    });
  }
  return next();
};

module.exports = {
  authenticateApiKey,
  requireScope,
  verifyInboundSignature
};
