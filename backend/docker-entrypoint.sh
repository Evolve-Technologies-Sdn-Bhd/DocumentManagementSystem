#!/bin/bash
set -e

export NODE_OPTIONS="--max-old-space-size=1024 ${NODE_OPTIONS:-}"

echo "[backend-entrypoint] Waiting for database to be ready..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['error'] });
const maxRetries = 30;
let retries = 0;
(async () => {
  while (retries < maxRetries) {
    try {
      await prisma.\$queryRaw\`SELECT 1\`;
      console.log('[db-check] Database connection OK');
      await prisma.\$disconnect();
      process.exit(0);
    } catch (err) {
      retries++;
      if (retries % 5 === 0) {
        console.log('[db-check] Retry ' + retries + '/' + maxRetries + '... lastErr=' + (err?.code || err?.message || 'unknown'));
      } else {
        console.log('[db-check] Retry ' + retries + '/' + maxRetries + '...');
      }
      await new Promise(r => setTimeout(r, 2500));
    }
  }
  try { await prisma.\$disconnect(); } catch (_e) {}
  console.error('[db-check] Could not connect after ' + maxRetries + ' retries');
  process.exit(1);
})();
"

echo "[backend-entrypoint] Running database migrations..."
node -e "
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
(async () => {
  try {
    const prisma = new PrismaClient({ log: ['error', 'warn'] });
    await prisma.\$queryRaw\`SELECT 1\`;
    await prisma.\$disconnect();
    const out = execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: '/app', env: process.env });
    process.exit(0);
  } catch (err) {
    console.error('[migrate] Migration failed:', err?.message || err);
    process.exit(1);
  }
})();
"

if [ "$RUN_SEED" = "true" ]; then
  echo "[backend-entrypoint] Seeding database..."
  node prisma/seed.js || echo "[backend-entrypoint] Seed skipped or failed (may already be seeded)"
fi

echo "[backend-entrypoint] Starting backend server (NODE_OPTIONS=$NODE_OPTIONS)..."
exec node src/index.js
