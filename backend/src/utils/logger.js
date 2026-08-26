/**
 * Simple Logger Utility
 * For structured logging across the application
 */

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

function _isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function _sanitizeMeta(meta) {
  if (meta == null) return {};
  if (_isPlainObject(meta)) {
    const out = {};
    for (const [k, v] of Object.entries(meta)) {
      if (v instanceof Error) {
        out[k] = {
          name: v.name,
          message: v.message,
          code: v.code,
          status: v.status,
          stack: String(v.stack || '').substring(0, 600),
        };
      } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v == null) {
        out[k] = v;
      } else if (_isPlainObject(v) || Array.isArray(v)) {
        try {
          out[k] = JSON.parse(JSON.stringify(v));
        } catch {
          out[k] = String(v);
        }
      } else {
        out[k] = String(v);
      }
    }
    return out;
  }
  if (meta instanceof Error) {
    return {
      error: {
        name: meta.name,
        message: meta.message,
        code: meta.code,
        status: meta.status,
        stack: String(meta.stack || '').substring(0, 600),
      },
    };
  }
  if (Array.isArray(meta)) {
    try { return { items: JSON.parse(JSON.stringify(meta)).slice(0, 50) }; }
    catch { return { items: String(meta) }; }
  }
  if (typeof meta === 'string') return { value: meta.length > 2000 ? meta.substring(0, 2000) + '…[truncated]' : meta };
  if (typeof meta === 'number' || typeof meta === 'boolean') return { value: meta };
  try { return { value: String(meta).substring(0, 2000) }; }
  catch { return { value: '[unserializable]' }; }
}

class Logger {
  static log(level, message, meta) {
    const timestamp = new Date().toISOString();
    const safeMeta = _sanitizeMeta(meta);
    const logEntry = {
      timestamp,
      level,
      message: String(message ?? ''),
      ...safeMeta,
    };

    // In production, you might want to send this to a logging service
    console.log(JSON.stringify(logEntry));
  }

  static error(message, meta) {
    this.log(LOG_LEVELS.ERROR, message, meta);
  }

  static warn(message, meta) {
    this.log(LOG_LEVELS.WARN, message, meta);
  }

  static info(message, meta) {
    this.log(LOG_LEVELS.INFO, message, meta);
  }

  static debug(message, meta) {
    if (process.env.NODE_ENV === 'development') {
      this.log(LOG_LEVELS.DEBUG, message, meta);
    }
  }
}

module.exports = Logger;
