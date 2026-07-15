const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@company.com' } })
  if (!admin) throw new Error('Admin user not found')

  const project = await prisma.project.findFirst({
    where: { code: { startsWith: 'LCR-A-' } },
    orderBy: { createdAt: 'desc' },
    include: {
      iterations: {
        take: 1,
        orderBy: { iterationNo: 'desc' }
      }
    }
  })

  if (!project) throw new Error('No LCR-A- project found')
  const iterationId = project.iterations[0]?.id
  if (!iterationId) throw new Error('No iteration found for project')

  const item = await prisma.projectIterationDocumentItem.findFirst({
    where: { projectIterationId: iterationId },
    orderBy: { id: 'asc' }
  })
  if (!item) throw new Error('No item found')

  const doc = await prisma.document.findFirst({
    where: { fileCode: { startsWith: 'LCR-A/' } },
    orderBy: { createdAt: 'desc' }
  })
  if (!doc) throw new Error('No LCR-A document found')

  const projectTrackingService = require('../src/services/projectTrackingService')

  const before = await prisma.document.findUnique({
    where: { id: doc.id },
    select: { id: true, isConfidential: true }
  })

  await projectTrackingService.linkDocumentToItem(item.id, { documentId: doc.id, linkedById: admin.id })

  const after = await prisma.document.findUnique({
    where: { id: doc.id },
    select: { id: true, isConfidential: true }
  })

  const accessCount = await prisma.documentConfidentialAccess.count({ where: { documentId: doc.id } })

  console.log(JSON.stringify({
    project: { id: project.id, code: project.code },
    iterationId,
    itemId: item.id,
    documentId: doc.id,
    before,
    after,
    confidentialAccessCount: accessCount
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

