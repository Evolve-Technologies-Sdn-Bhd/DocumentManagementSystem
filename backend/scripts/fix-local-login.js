const bcrypt = require('bcryptjs')
const prisma = require('../src/config/database')

async function main() {
  const email = 'admin@company.com'
  const password = 'Admin@123'
  const hashedPassword = await bcrypt.hash(password, 10)

  const securityDefault = {
    maxLoginAttempts: 5,
    lockoutDuration: 30,
    sessionTimeout: 480,
    enable2FA: false
  }

  const existingSecurity = await prisma.configuration.findUnique({
    where: { key: 'security_settings' }
  })

  let mergedSecurity = securityDefault
  if (existingSecurity?.value) {
    try {
      const parsed = JSON.parse(existingSecurity.value)
      mergedSecurity = { ...securityDefault, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
    } catch {}
  }
  mergedSecurity.enable2FA = false

  await prisma.configuration.upsert({
    where: { key: 'security_settings' },
    update: { value: JSON.stringify(mergedSecurity) },
    create: { key: 'security_settings', value: JSON.stringify(mergedSecurity) }
  })

  const adminUser = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      status: 'ACTIVE',
      failedAttempts: 0,
      lockedUntil: null,
      twoFactorEnabled: false,
      twoFactorCode: null,
      twoFactorCodeExpiry: null
    },
    create: {
      email,
      password: hashedPassword,
      firstName: 'System',
      lastName: 'Administrator',
      department: 'IT',
      position: 'System Administrator',
      status: 'ACTIVE',
      failedAttempts: 0,
      lockedUntil: null,
      twoFactorEnabled: false
    }
  })

  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } })
  if (adminRole) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: adminUser.id,
          roleId: adminRole.id
        }
      },
      update: {},
      create: {
        userId: adminUser.id,
        roleId: adminRole.id
      }
    })
  }

  process.stdout.write('OK\n')
  process.stdout.write(`email=${email}\n`)
  process.stdout.write(`password=${password}\n`)
  process.stdout.write('2FA(system)=disabled\n')
  process.stdout.write('account=ACTIVE, failedAttempts=0\n')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    process.stderr.write(String(e && e.stack ? e.stack : e) + '\n')
    try { await prisma.$disconnect() } catch {}
    process.exit(1)
  })
