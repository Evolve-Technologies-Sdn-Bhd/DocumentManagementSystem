const prisma = require('../config/database')
const folderPermissionService = require('./folderPermissionService')
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors')

class ConfidentialAccessService {
  normalizeEntries(payload) {
    const entries = Array.isArray(payload?.entries) ? payload.entries : []
    const normalized = []
    for (const e of entries) {
      const subjectType = String(e?.subjectType || '').toUpperCase()
      const subjectId = e?.subjectId ? parseInt(e.subjectId, 10) : null
      if (!subjectId || !['USER', 'ROLE'].includes(subjectType)) continue
      normalized.push({
        subjectType,
        subjectId,
        canView: e?.canView === undefined ? true : Boolean(e.canView)
      })
    }
    return normalized
  }

  async canUserViewDocument(document, user) {
    if (!document) return false
    if (!user) return false

    if (!document.isConfidential) return true

    if (user?.permissions?.projectTracking?.viewConfidential) return true

    if (document.ownerId === user.id || document.createdById === user.id) return true

    const roleIds = await folderPermissionService.getRoleIdsByNames(user?.roles || [])
    const where = {
      documentId: document.id,
      canView: true,
      OR: [
        { userId: user.id },
        ...(roleIds.length > 0 ? [{ roleId: { in: roleIds } }] : [])
      ]
    }
    const count = await prisma.documentConfidentialAccess.count({ where })
    return count > 0
  }

  buildConfidentialWhereClause(user, roleIds = []) {
    const userId = user?.id
    if (!userId) return { isConfidential: false }
    if (user?.permissions?.projectTracking?.viewConfidential) return {}

    const rids = Array.isArray(roleIds) ? roleIds.filter((x) => Number.isFinite(x)) : []

    return {
      OR: [
        { isConfidential: false },
        {
          AND: [
            { isConfidential: true },
            {
              OR: [
                { ownerId: userId },
                { createdById: userId },
                { confidentialAccess: { some: { userId, canView: true } } },
                ...(rids.length > 0 ? [{ confidentialAccess: { some: { roleId: { in: rids }, canView: true } } }] : [])
              ]
            }
          ]
        }
      ]
    }
  }

  async getDocumentAccess(documentId, actor) {
    const doc = await prisma.document.findUnique({
      where: { id: parseInt(documentId, 10) },
      select: { id: true, ownerId: true, createdById: true, folderId: true, stage: true, isConfidential: true }
    })
    if (!doc) throw new NotFoundError('Document')

    if (!actor?.permissions?.projectTracking?.manageConfidentialAccess) {
      throw new ForbiddenError("You don't have permission to manage confidential access")
    }

    const entries = await prisma.documentConfidentialAccess.findMany({
      where: { documentId: doc.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        role: { select: { id: true, name: true, displayName: true } }
      },
      orderBy: { id: 'asc' }
    })
    return { document: doc, entries }
  }

  async setDocumentAccess(documentId, actor, payload) {
    const doc = await prisma.document.findUnique({
      where: { id: parseInt(documentId, 10) },
      select: { id: true, ownerId: true, createdById: true, folderId: true, stage: true, isConfidential: true }
    })
    if (!doc) throw new NotFoundError('Document')

    if (!actor?.permissions?.projectTracking?.manageConfidentialAccess) {
      throw new ForbiddenError("You don't have permission to manage confidential access")
    }

    if (String(doc.stage || '').toUpperCase() !== 'DRAFT') {
      throw new BadRequestError('Can only manage confidential access while document is in DRAFT stage')
    }

    const entries = this.normalizeEntries(payload)

    await prisma.$transaction(async (tx) => {
      await tx.documentConfidentialAccess.deleteMany({ where: { documentId: doc.id } })
      for (const e of entries) {
        await tx.documentConfidentialAccess.create({
          data: {
            documentId: doc.id,
            subjectType: e.subjectType,
            userId: e.subjectType === 'USER' ? e.subjectId : null,
            roleId: e.subjectType === 'ROLE' ? e.subjectId : null,
            canView: e.canView
          }
        })
      }

      await tx.auditLog.create({
        data: {
          userId: actor?.id || null,
          action: 'UPDATE',
          entity: 'Document',
          entityId: doc.id,
          description: `updated confidential viewers for documentId=${doc.id}`,
          metadata: {
            documentId: doc.id,
            viewersCount: entries.length,
            subjectTypes: Array.from(new Set(entries.map((x) => x.subjectType)))
          }
        }
      })
    })

    return this.getDocumentAccess(doc.id, actor)
  }

  async getRequirementAccess(requirementId) {
    const reqRow = await prisma.projectCategoryDocumentRequirement.findUnique({
      where: { id: parseInt(requirementId, 10) },
      select: { id: true, projectCategoryId: true, stageId: true, documentTypeId: true, isConfidentialDefault: true }
    })
    if (!reqRow) throw new NotFoundError('Requirement')

    const entries = await prisma.projectCategoryDocumentRequirementConfidentialAccess.findMany({
      where: { requirementId: reqRow.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        role: { select: { id: true, name: true, displayName: true } }
      },
      orderBy: { id: 'asc' }
    })
    return { requirement: reqRow, entries }
  }

  async setRequirementAccess(requirementId, actor, payload) {
    const reqRow = await prisma.projectCategoryDocumentRequirement.findUnique({
      where: { id: parseInt(requirementId, 10) },
      select: { id: true, isConfidentialDefault: true }
    })
    if (!reqRow) throw new NotFoundError('Requirement')

    if (!actor?.permissions?.projectTracking?.manageTemplates) {
      throw new ForbiddenError("You don't have permission to manage templates")
    }

    if (!reqRow.isConfidentialDefault) {
      throw new BadRequestError('Confidential must be enabled for this requirement before setting access list')
    }

    const entries = this.normalizeEntries(payload)

    await prisma.$transaction(async (tx) => {
      await tx.projectCategoryDocumentRequirementConfidentialAccess.deleteMany({ where: { requirementId: reqRow.id } })
      for (const e of entries) {
        await tx.projectCategoryDocumentRequirementConfidentialAccess.create({
          data: {
            requirementId: reqRow.id,
            subjectType: e.subjectType,
            userId: e.subjectType === 'USER' ? e.subjectId : null,
            roleId: e.subjectType === 'ROLE' ? e.subjectId : null,
            canView: e.canView
          }
        })
      }

      await tx.auditLog.create({
        data: {
          userId: actor?.id || null,
          action: 'UPDATE',
          entity: 'ProjectCategoryDocumentRequirement',
          entityId: reqRow.id,
          description: `updated confidential viewers template for requirementId=${reqRow.id}`,
          metadata: {
            requirementId: reqRow.id,
            viewersCount: entries.length,
            subjectTypes: Array.from(new Set(entries.map((x) => x.subjectType)))
          }
        }
      })
    })

    return this.getRequirementAccess(reqRow.id)
  }

  async getProjectSetupRequirementAccess({ projectId, requirementId, scope }) {
    const normalizedScope = String(scope || '').toUpperCase()
    if (normalizedScope !== 'DEFAULT' && normalizedScope !== 'OVERRIDE') {
      throw new ValidationError('Invalid requirement scope')
    }

    if (normalizedScope === 'DEFAULT') {
      const reqRow = await prisma.projectSetupDocumentRequirementDefault.findUnique({
        where: { id: parseInt(requirementId, 10) },
        select: { id: true, stageId: true, documentTypeId: true, isConfidentialDefault: true }
      })
      if (!reqRow) throw new NotFoundError('Requirement')

      const entries = await prisma.projectSetupDocumentRequirementDefaultConfidentialAccess.findMany({
        where: { requirementId: reqRow.id },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          role: { select: { id: true, name: true, displayName: true } }
        },
        orderBy: { id: 'asc' }
      })

      return { requirement: reqRow, entries }
    }

    const pid = parseInt(projectId, 10)
    if (!pid) throw new ValidationError('Invalid projectId')

    const reqRow = await prisma.projectSetupDocumentRequirementOverride.findFirst({
      where: { id: parseInt(requirementId, 10), projectId: pid },
      select: { id: true, projectId: true, stageId: true, documentTypeId: true, isConfidentialDefault: true, isExcluded: true }
    })
    if (!reqRow) throw new NotFoundError('Requirement')

    const entries = await prisma.projectSetupDocumentRequirementOverrideConfidentialAccess.findMany({
      where: { requirementId: reqRow.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        role: { select: { id: true, name: true, displayName: true } }
      },
      orderBy: { id: 'asc' }
    })

    return { requirement: reqRow, entries }
  }

  async setProjectSetupRequirementAccess({ projectId, requirementId, scope }, actor, payload) {
    const normalizedScope = String(scope || '').toUpperCase()
    if (normalizedScope !== 'DEFAULT' && normalizedScope !== 'OVERRIDE') {
      throw new ValidationError('Invalid requirement scope')
    }

    if (!actor?.permissions?.projectTracking?.manageTemplates) {
      throw new ForbiddenError("You don't have permission to manage templates")
    }

    const entries = this.normalizeEntries(payload)

    if (normalizedScope === 'DEFAULT') {
      const reqRow = await prisma.projectSetupDocumentRequirementDefault.findUnique({
        where: { id: parseInt(requirementId, 10) },
        select: { id: true, isConfidentialDefault: true }
      })
      if (!reqRow) throw new NotFoundError('Requirement')
      if (!reqRow.isConfidentialDefault) {
        throw new BadRequestError('Confidential must be enabled for this requirement before setting access list')
      }

      await prisma.$transaction(async (tx) => {
        await tx.projectSetupDocumentRequirementDefaultConfidentialAccess.deleteMany({ where: { requirementId: reqRow.id } })
        for (const e of entries) {
          await tx.projectSetupDocumentRequirementDefaultConfidentialAccess.create({
            data: {
              requirementId: reqRow.id,
              subjectType: e.subjectType,
              userId: e.subjectType === 'USER' ? e.subjectId : null,
              roleId: e.subjectType === 'ROLE' ? e.subjectId : null,
              canView: e.canView
            }
          })
        }

        await tx.auditLog.create({
          data: {
            userId: actor?.id || null,
            action: 'UPDATE',
            entity: 'ProjectSetupDocumentRequirementDefault',
            entityId: reqRow.id,
            description: `updated confidential viewers template for default requirementId=${reqRow.id}`,
            metadata: {
              requirementId: reqRow.id,
              viewersCount: entries.length,
              subjectTypes: Array.from(new Set(entries.map((x) => x.subjectType)))
            }
          }
        })
      })

      return this.getProjectSetupRequirementAccess({ requirementId: reqRow.id, scope: 'DEFAULT' })
    }

    const pid = parseInt(projectId, 10)
    if (!pid) throw new ValidationError('Invalid projectId')

    const existingOverride = await prisma.projectSetupDocumentRequirementOverride.findFirst({
      where: { id: parseInt(requirementId, 10), projectId: pid },
      select: { id: true, isConfidentialDefault: true, isExcluded: true }
    })

    if (!existingOverride) throw new NotFoundError('Requirement')
    if (existingOverride.isExcluded) throw new BadRequestError('Requirement is excluded for this project')
    if (!existingOverride.isConfidentialDefault) {
      throw new BadRequestError('Confidential must be enabled for this requirement before setting access list')
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectSetupDocumentRequirementOverrideConfidentialAccess.deleteMany({ where: { requirementId: existingOverride.id } })
      for (const e of entries) {
        await tx.projectSetupDocumentRequirementOverrideConfidentialAccess.create({
          data: {
            requirementId: existingOverride.id,
            subjectType: e.subjectType,
            userId: e.subjectType === 'USER' ? e.subjectId : null,
            roleId: e.subjectType === 'ROLE' ? e.subjectId : null,
            canView: e.canView
          }
        })
      }

      await tx.auditLog.create({
        data: {
          userId: actor?.id || null,
          action: 'UPDATE',
          entity: 'ProjectSetupDocumentRequirementOverride',
          entityId: existingOverride.id,
          description: `updated confidential viewers template for project requirementId=${existingOverride.id}`,
          metadata: {
            requirementId: existingOverride.id,
            projectId: pid,
            viewersCount: entries.length,
            subjectTypes: Array.from(new Set(entries.map((x) => x.subjectType)))
          }
        }
      })
    })

    return this.getProjectSetupRequirementAccess({ projectId: pid, requirementId: existingOverride.id, scope: 'OVERRIDE' })
  }

  async applyRequirementAccessToDocument(requirementId, documentId, db = prisma) {
    const rows = await db.projectCategoryDocumentRequirementConfidentialAccess.findMany({
      where: { requirementId: parseInt(requirementId, 10), canView: true },
      select: { subjectType: true, userId: true, roleId: true }
    })
    if (!rows.length) return 0

    const data = rows.map((r) => ({
      documentId: parseInt(documentId, 10),
      subjectType: r.subjectType,
      userId: r.userId,
      roleId: r.roleId,
      canView: true
    }))

    const created = await db.documentConfidentialAccess.createMany({
      data,
      skipDuplicates: true
    })
    return created.count || 0
  }

  async applyProjectSetupRequirementAccessToDocument({ requirementId, scope }, documentId, db = prisma) {
    const normalizedScope = String(scope || '').toUpperCase()
    if (normalizedScope !== 'DEFAULT' && normalizedScope !== 'OVERRIDE') return 0

    const reqId = parseInt(requirementId, 10)
    if (!reqId) return 0

    const rows =
      normalizedScope === 'DEFAULT'
        ? await db.projectSetupDocumentRequirementDefaultConfidentialAccess.findMany({
            where: { requirementId: reqId, canView: true },
            select: { subjectType: true, userId: true, roleId: true }
          })
        : await db.projectSetupDocumentRequirementOverrideConfidentialAccess.findMany({
            where: { requirementId: reqId, canView: true },
            select: { subjectType: true, userId: true, roleId: true }
          })

    if (!rows.length) return 0

    const data = rows.map((r) => ({
      documentId: parseInt(documentId, 10),
      subjectType: r.subjectType,
      userId: r.userId,
      roleId: r.roleId,
      canView: true
    }))

    const created = await db.documentConfidentialAccess.createMany({
      data,
      skipDuplicates: true
    })
    return created.count || 0
  }
}

module.exports = new ConfidentialAccessService()
