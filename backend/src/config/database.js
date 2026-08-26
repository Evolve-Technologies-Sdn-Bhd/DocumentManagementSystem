const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { PrismaClient } = require('@prisma/client');

const isProd = process.env.NODE_ENV === 'production';

// Initialize Prisma Client with logging
const prisma = new PrismaClient({
  log: isProd ? ['error'] : ['error', 'warn'],
  errorFormat: 'minimal',
  transactionOptions: {
    maxWait: 10000,
    timeout: 20000
  },
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // Limit connection pool for low-RAM servers (3GB-5GB RAM)
  // Formula: 3-core server with 5.5GB RAM → avoid pool exhaustion
  __internal: {
    params: {
      connection_limit: process.env.PRISMA_CONNECTION_LIMIT ? parseInt(process.env.PRISMA_CONNECTION_LIMIT, 10) : (isProd ? 10 : 20),
      pool_timeout: process.env.PRISMA_POOL_TIMEOUT ? parseInt(process.env.PRISMA_POOL_TIMEOUT, 10) : 15
    }
  }
});

// Handle connection errors - don't exit immediately
prisma.$connect()
  .then(() => {
    console.log('✅ Database connected successfully');
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err.message);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  try { await prisma.$disconnect(); } catch {}
  console.log('Database connection closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  try { await prisma.$disconnect(); } catch {}
  console.log('Database connection closed');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT_EXCEPTION:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED_REJECTION:', reason?.message || reason);
});

module.exports = prisma;
