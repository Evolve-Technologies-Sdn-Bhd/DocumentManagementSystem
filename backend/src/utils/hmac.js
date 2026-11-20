const crypto = require('crypto');

/**
 * HMAC-SHA256 signing helpers for integration payloads.
 *
 * Signing input is `<timestamp>.<rawBody>` (Stripe / Standard Webhooks style)
 * so a captured signature cannot be replayed against a different body or time.
 */

const DEFAULT_TOLERANCE_SECONDS = 300;

const computeSignature = (secret, timestamp, rawBody) => {
  const signedContent = `${timestamp}.${rawBody}`;
  return crypto.createHmac('sha256', String(secret)).update(signedContent).digest('hex');
};

const buildSignatureHeader = (secret, timestamp, rawBody) => {
  return `sha256=${computeSignature(secret, timestamp, rawBody)}`;
};

const timingSafeEqualHex = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Verify an inbound `sha256=<hex>` signature header.
 * @returns {{ ok: boolean, reason?: string }}
 */
const verifySignatureHeader = ({ secret, timestamp, rawBody, header, toleranceSeconds = DEFAULT_TOLERANCE_SECONDS }) => {
  if (!secret) return { ok: false, reason: 'Missing signing secret' };
  if (!header) return { ok: false, reason: 'Missing signature header' };
  if (!timestamp) return { ok: false, reason: 'Missing timestamp header' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'Invalid timestamp' };

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (toleranceSeconds > 0 && ageSeconds > toleranceSeconds) {
    return { ok: false, reason: 'Signature timestamp outside tolerance' };
  }

  const provided = String(header).startsWith('sha256=')
    ? String(header).slice('sha256='.length)
    : String(header);

  const expected = computeSignature(secret, timestamp, rawBody);
  return timingSafeEqualHex(expected, provided) ? { ok: true } : { ok: false, reason: 'Signature mismatch' };
};

module.exports = {
  DEFAULT_TOLERANCE_SECONDS,
  computeSignature,
  buildSignatureHeader,
  verifySignatureHeader,
  timingSafeEqualHex
};
