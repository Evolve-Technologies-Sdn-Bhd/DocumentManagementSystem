#!/bin/bash
set -e

echo "[backend-entrypoint] Waiting for database to be ready..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const maxRetries = 30;
let retries = 0;
(async () => {
  while (retries < maxRetries) {
    try {
      await prisma.\$queryRaw\`SELECT 1\`;
      console.log('[db-check] Database connection OK');
      process.exit(0);
    } catch (err) {
      retries++;
      console.log('[db-check] Retry ' + retries + '/' + maxRetries + '...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.error('[db-check] Could not connect after ' + maxRetries + ' retries');
  process.exit(1);
})();
"

echo "[backend-entrypoint] Running database migrations..."
npm run prisma:migrate:deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "[backend-entrypoint] Seeding database..."
  npm run seed || echo "[backend-entrypoint] Seed skipped or failed (may already be seeded)"
fi

echo "[backend-entrypoint] Starting backend server..."
exec node src/index.js
