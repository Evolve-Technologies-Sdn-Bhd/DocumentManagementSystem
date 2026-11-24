const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const names = ['Administrator', 'Document Controller', 'Admin', 'Super Admin', 'Super-Admin', 'DocumentController'];
    const calPatch = { view: true, create: true, edit: true, delete: true };
    const allRoles = await p.role.findMany({ select: { id: true, name: true, permissions: true } });
    const pat = /admin|administrator|super|document[ ]?controller/i;
    const roles = allRoles.filter(r => pat.test(r.name));
    console.log('Found roles:', roles.map(r => r.name).join(', '));
    for (const r of roles) {
      const cur = (typeof r.permissions === 'object' && r.permissions) ? { ...r.permissions } : {};
      const next = { ...cur, calendar: { ...(cur.calendar || {}), ...calPatch } };
      await p.role.update({ where: { id: r.id }, data: { permissions: next } });
      console.log('Updated:', r.name, '-> calendar perms added');
    }
    const checkAll = await p.role.findMany({ select: { name: true, permissions: true } });
    const check = checkAll.filter(r => pat.test(r.name));
    for (const c of check) {
      const perms = (typeof c.permissions === 'object' && c.permissions) ? c.permissions : {};
      console.log(c.name, 'calendar keys:', Object.keys(perms.calendar || {}));
    }
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
