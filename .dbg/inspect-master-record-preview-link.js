const prisma = require('../backend/src/config/database')

async function main() {
  const fileCodes = ['MOM/01/260713/018', 'PR/01/260713/001', 'MOM/01/260709/002', 'MOM/01/260707/001']

  const regs = await prisma.documentRegister.findMany({
    where: { fileCode: { in: fileCodes } },
    orderBy: [{ fileCode: 'asc' }, { projectCategoryId: 'asc' }]
  })

  const docs = await prisma.document.findMany({
    where: { fileCode: { in: fileCodes } },
    select: {
      id: true,
      fileCode: true,
      title: true,
      projectCategoryId: true,
      status: true,
      stage: true,
      ownerId: true,
      createdById: true,
      folderId: true,
      updatedAt: true,
      versions: {
        select: { id: true, fileName: true, mimeType: true, uploadedAt: true },
        orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        take: 3
      }
    },
    orderBy: [{ fileCode: 'asc' }, { projectCategoryId: 'asc' }, { updatedAt: 'desc' }]
  })

  const allDocs = await prisma.document.findMany({
    select: {
      id: true,
      fileCode: true,
      title: true,
      projectCategoryId: true,
      status: true,
      updatedAt: true
    },
    orderBy: [{ fileCode: 'asc' }, { projectCategoryId: 'asc' }, { updatedAt: 'desc' }]
  })

  const dupMap = new Map()
  for (const row of allDocs) {
    const key = `${row.fileCode}::${row.projectCategoryId ?? ''}`
    const arr = dupMap.get(key) || []
    arr.push(row)
    dupMap.set(key, arr)
  }

  const dup = [...dupMap.entries()]
    .filter(([, arr]) => arr.length > 1)
    .slice(0, 100)
    .map(([key, rows]) => ({ key, count: rows.length, rows }))

  console.log(JSON.stringify({ regs, docs, duplicateCount: dup.length, dup }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
