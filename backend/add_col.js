const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const fs = require('fs');
const log = [];
(async () => {
  try {
    const r1 = await p.$executeRawUnsafe('ALTER TABLE CalendarCustomEvent ADD COLUMN reminderOffset VARCHAR(32) NULL');
    log.push('Col1 added: ' + JSON.stringify(r1));
  } catch (e) {
    log.push('Col1 skip: ' + e.message.slice(0, 200));
  }
  try {
    const r2 = await p.$executeRawUnsafe('ALTER TABLE CalendarCustomEvent ADD COLUMN categoryMeta JSON NULL');
    log.push('Col2 added: ' + JSON.stringify(r2));
  } catch (e) {
    log.push('Col2 skip: ' + e.message.slice(0, 200));
  }
  try {
    const r3 = await p.$queryRawUnsafe('SHOW COLUMNS FROM CalendarCustomEvent');
    log.push('Columns: ' + JSON.stringify(r3.map(c => c.Field)));
  } catch (e) {
    log.push('Columns err: ' + e.message.slice(0, 200));
  }
  await p.$disconnect();
  fs.writeFileSync(__dirname + '/cols.log', log.join('\n'));
  process.exit(0);
})();
