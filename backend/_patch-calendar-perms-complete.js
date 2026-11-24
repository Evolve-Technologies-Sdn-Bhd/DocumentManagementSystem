const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CAL_ACTIONS = { view: true, create: true, edit: true, delete: true };
const CAL_VIEW_ONLY = { view: true };

function parsePerms(p) {
  if (!p) return {};
  if (typeof p === 'string') {
    try { return JSON.parse(p) || {}; } catch { return {}; }
  }
  if (typeof p === 'object') return { ...p };
  return {};
}

(async () => {
  try {
    console.log('== Calendar Permission Patch (Complete) ==');
    console.log('Scanning ALL roles in database...\n');

    const roles = await prisma.role.findMany({
      select: { id: true, name: true, displayName: true, permissions: true, isSystem: true }
    });

    console.log(`Found ${roles.length} roles total\n`);

    const updated = [];
    const untouched = [];

    for (const r of roles) {
      const current = parsePerms(r.permissions);
      const next = { ...current };

      const adminPattern = /admin|administrator|super|document[ ]?controller|doc[ ]?controller/i;
      const name = `${r.displayName || ''} ${r.name || ''}`;
      const isAdminLike = adminPattern.test(name);

      let patch = null;

      if (isAdminLike) {
        // Full calendar + set global all=true if has many existing permissions
        patch = { ...CAL_ACTIONS };
      } else if (current.dashboard?.view === true || current.all === true) {
        // Any non-admin role that already has dashboard view gets calendar view
        patch = { ...CAL_VIEW_ONLY };
      }

      // Check if role already has calendar with what we need
      const hasCurrent = current.calendar || {};
      const patchNeeded = patch && Object.keys(patch).some(
        k => hasCurrent[k] !== true
      );

      if (patchNeeded) {
        next.calendar = { ...(hasCurrent || {}), ...patch };
        await prisma.role.update({
          where: { id: r.id },
          data: { permissions: next }
        });
        const label = r.displayName || r.name;
        console.log(`✅ UPDATED [${label}]: added calendar -> ${Object.keys(next.calendar).filter(k=>next.calendar[k]).join(',')}`);
        updated.push(label);
      } else {
        const label = r.displayName || r.name;
        const calKeys = Object.keys(hasCurrent||{}).filter(k=>hasCurrent[k]);
        if (calKeys.length > 0) {
          console.log(`⏭  SKIP    [${label}]: already has calendar (${calKeys.join(',')})`);
        } else {
          console.log(`⏭  SKIP    [${label}]: no dashboard access, no calendar`);
        }
        untouched.push(label);
      }
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Roles updated  : ${updated.length}`);
    if (updated.length) console.log(`  -> ${updated.join(', ')}`);
    console.log(`Roles untouched: ${untouched.length}`);
    console.log('\nVerifying ALL roles now...');

    const after = await prisma.role.findMany({
      select: { name: true, displayName: true, permissions: true }
    });
    let calendarHas = 0;
    for (const r of after) {
      const p = parsePerms(r.permissions);
      const keys = Object.keys(p.calendar || {}).filter(k => p.calendar[k]);
      if (keys.length) {
        calendarHas++;
        console.log(`  [${r.displayName || r.name}] calendar: ${keys.join(',')}`);
      }
    }
    console.log(`\n${calendarHas} / ${after.length} roles have calendar access now.`);
    console.log('\n✅ Patch complete. Now: LOGOUT + LOGIN semula untuk refresh permissions!');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
