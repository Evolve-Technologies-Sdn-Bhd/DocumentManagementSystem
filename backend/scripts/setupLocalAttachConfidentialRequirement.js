const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

const VIEWER_ROLE_NAME = 'local_project_viewer'
const VIEWER_EMAIL = 'hanish.local@company.com'
const VIEWER_PASSWORD = 'Hanish@123'

async function ensureViewerRole() {
  const permissions = {
    dashboard: { view: true },
    projectTracking: { view: true, searchProject: true },
    'documents.published': { view: true, read: true, download: true },
    myDocumentsStatus: { view: true },
    profileSettings: { view: true, edit: true, changePassword: true }
  }

  return prisma.role.upsert({
    where: { name: VIEWER_ROLE_NAME },
    update: {
      displayName: 'Local Project Viewer',
      description: 'Local reproduction user for project tracking confidential access',
      permissions
    },
    create: {
      name: VIEWER_ROLE_NAME,
      displayName: 'Local Project Viewer',
      description: 'Local reproduction user for project tracking confidential access',
      permissions,
      isSystem: false
    }
  })
}

async function ensureViewerUser(roleId) {
  const passwordHash = await bcrypt.hash(VIEWER_PASSWORD, 10)

  const user = await prisma.user.upsert({
    where: { email: VIEWER_EMAIL },
    update: {
      password: passwordHash,
      firstName: 'Hanish',
      lastName: 'Local',
      department: 'Project',
      position: 'Project Viewer',
      status: 'ACTIVE'
    },
    create: {
      email: VIEWER_EMAIL,
      password: passwordHash,
      firstName: 'Hanish',
      lastName: 'Local',
      department: 'Project',
      position: 'Project Viewer',
      employeeId: 'EMP-HANISH-LOCAL',
      status: 'ACTIVE'
    }
  })

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId
      }
    },
    update: {},
    create: {
      userId: user.id,
      roleId
    }
  })

  return user
}

async function ensureStageDefinition() {
  const existing = await prisma.projectStageDefinition.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' }
  })

  if (existing) return existing

  return prisma.projectStageDefinition.create({
    data: {
      key: 'local_confidential_stage',
      name: 'Local Confidential Stage',
      sortOrder: 1,
      isSystem: false,
      isActive: true
    }
  })
}

async function ensureCategoryStage(projectCategoryId, stageId) {
  return prisma.projectCategoryStage.upsert({
    where: {
      projectCategoryId_stageId: {
        projectCategoryId,
        stageId
      }
    },
    update: {
      isEnabled: true,
      sortOrder: 1,
      displayName: 'Local Confidential Stage'
    },
    create: {
      projectCategoryId,
      stageId,
      isEnabled: true,
      sortOrder: 1,
      displayName: 'Local Confidential Stage'
    }
  })
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@company.com' } })
  if (!admin) throw new Error('Admin user not found')

  const projectCategory = await prisma.projectCategory.findFirst({ orderBy: { id: 'asc' } })
  if (!projectCategory) throw new Error('No project category found')

  const documentType = await prisma.documentType.findFirst({ orderBy: { id: 'asc' } })
  if (!documentType) throw new Error('No document type found')

  const role = await ensureViewerRole()
  const viewer = await ensureViewerUser(role.id)
  const stage = await ensureStageDefinition()
  await ensureCategoryStage(projectCategory.id, stage.id)

  const uniqueSuffix = Date.now()
  const projectCode = `LCR-A-${uniqueSuffix}`

  const project = await prisma.project.create({
    data: {
      code: projectCode,
      name: `Local Attach Confidential Repro ${uniqueSuffix}`,
      description: 'Local reproduction fixture for attaching existing doc to confidential requirement',
      projectCategoryId: projectCategory.id,
      managerId: admin.id,
      createdById: admin.id,
      status: 'ACTIVE'
    }
  })

  const iteration = await prisma.projectIteration.create({
    data: {
      projectId: project.id,
      iterationNo: 1,
      name: 'Iteration 1',
      currentStageId: stage.id,
      isActive: true
    }
  })

  const item = await prisma.projectIterationDocumentItem.create({
    data: {
      projectIterationId: iteration.id,
      stageId: stage.id,
      documentTypeId: documentType.id,
      status: 'PENDING'
    }
  })

  const override = await prisma.projectSetupDocumentRequirementOverride.upsert({
    where: {
      projectId_stageId_documentTypeId: {
        projectId: project.id,
        stageId: stage.id,
        documentTypeId: documentType.id
      }
    },
    update: {
      isExcluded: false,
      isRequired: true,
      isConfidentialDefault: true
    },
    create: {
      projectId: project.id,
      stageId: stage.id,
      documentTypeId: documentType.id,
      isExcluded: false,
      isRequired: true,
      isConfidentialDefault: true
    }
  })

  const fileCode = `LCR-A/${String(uniqueSuffix).slice(-6)}`
  const fileDir = path.join(process.cwd(), 'uploads', 'documents', `local-attach-confidential-${uniqueSuffix}`)
  fs.mkdirSync(fileDir, { recursive: true })
  const filePath = path.join(fileDir, 'local-attach-confidential-repro.txt')
  fs.writeFileSync(filePath, 'Local attach-confidential reproduction file\n')

  const document = await prisma.document.create({
    data: {
      fileCode,
      title: `Local Attach Confidential Repro Document ${uniqueSuffix}`,
      description: 'Non-confidential document to be attached to confidential requirement',
      documentTypeId: documentType.id,
      projectCategoryId: projectCategory.id,
      createdById: admin.id,
      ownerId: admin.id,
      status: 'PUBLISHED',
      stage: 'PUBLISHED',
      version: '1.0',
      isConfidential: false,
      publishedById: admin.id,
      publishedAt: new Date(),
      acknowledgedById: admin.id,
      acknowledgedAt: new Date()
    }
  })

  await prisma.documentVersion.create({
    data: {
      documentId: document.id,
      version: '1.0',
      filePath,
      fileName: 'local-attach-confidential-repro.txt',
      mimeType: 'text/plain',
      fileSize: fs.statSync(filePath).size,
      uploadedById: admin.id,
      isPublished: true,
      isEncrypted: false
    }
  })

  console.log(JSON.stringify({
    admin: { id: admin.id, email: admin.email },
    viewer: { id: viewer.id, email: viewer.email, password: VIEWER_PASSWORD, role: role.name },
    project: { id: project.id, code: project.code, name: project.name },
    iteration: { id: iteration.id, currentStageId: iteration.currentStageId },
    stage: { id: stage.id, name: stage.name },
    item: { id: item.id, stageId: item.stageId, documentTypeId: item.documentTypeId },
    requirementOverride: { id: override.id, isConfidentialDefault: override.isConfidentialDefault },
    document: { id: document.id, isConfidential: document.isConfidential, fileCode: document.fileCode, title: document.title }
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

