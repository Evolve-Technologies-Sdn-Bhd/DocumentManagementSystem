const path = require('path');
const url = require('url');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { PrismaClient } = require('@prisma/client');

const isProd = process.env.NODE_ENV === 'production';

function buildDatabaseUrlWithPoolLimits(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const desiredConnLimit = isProd
      ? parseInt(process.env.PRISMA_CONNECTION_LIMIT || '10', 10)
      : parseInt(process.env.PRISMA_CONNECTION_LIMIT || '20', 10);
    const desiredPoolTimeout = parseInt(process.env.PRISMA_POOL_TIMEOUT || '15', 10);
    const existingConn = parsed.searchParams.get('connection_limit');
    const existingPool = parsed.searchParams.get('pool_timeout');
    if (!existingConn) {
      parsed.searchParams.set('connection_limit', String(desiredConnLimit));
    }
    if (!existingPool) {
      parsed.searchParams.set('pool_timeout', String(desiredPoolTimeout));
    }
    return parsed.toString();
  } catch (err) {
    console.warn('⚠️  Failed to parse DATABASE_URL for pool tuning, using raw value');
    return rawUrl;
  }
}

const dbUrl = buildDatabaseUrlWithPoolLimits(process.env.DATABASE_URL);

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl
    }
  },
  log: isProd ? ['error'] : ['error', 'warn'],
  errorFormat: 'minimal',
  transactionOptions: {
    maxWait: 10000,
    timeout: 20000
  }
});

prisma.$connect()
  .then(() => {
    try {
      const parsed = new URL(dbUrl);
      const pool = parsed.searchParams.get('connection_limit') || 'default';
      console.log(`✅ Database connected successfully (pool=${pool})`);
    } catch {
      console.log('✅ Database connected successfully');
    }
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err.message);
  });

process.on('SIGTERM', async () => {
  try { await prisma.$disconnect(); } catch {}
  console.log('Database connection closed (SIGTERM)');
  process.exit(0);
});

process.on('SIGINT', async () => {
  try { await prisma.$disconnect(); } catch {}
  console.log('Database connection closed (SIGINT)');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT_EXCEPTION:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED_REJECTION:', reason?.message || reason);
});

module.exports = prisma;
