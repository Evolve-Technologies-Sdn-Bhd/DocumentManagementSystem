const prisma = require('../config/database')

const RETENTION_YEARS = 7
const SYSTEM_ACTOR = 'System'

function ownerDisplayName(owner) {
  if (!owner) return ''
  const name = `${owner.firstName || ''} ${owner.lastName || ''}`.trim()
  return name || owner.email || ''
}

function versionSegmentFromFileCode(fileCode) {
  const parts = String(fileCode || '').split('/')
  const seg = String(parts[1] || '').trim()
  return /^\d+[a-zA-Z]*$/.test(seg) ? seg : ''
}

function registerKey(fileCode, projectCategoryId) {
  return `${fileCode}\u0000${projectCategoryId === null || projectCategoryId === undefined ? 'null' : projectCategoryId}`
}

/**
 * Reconciles the Master Record register tables with the Document table (source of truth).
 * All operations are idempotent so this can safely run on every startup or on demand.
 */
class MasterRecordSyncService {
  async syncAll() {
    const documentRegister = await this.syncDocumentRegister()
    const obsoleteRegister = await this.syncObsoleteRegister()
    const archiveRegister = await this.syncArchiveRegister()
    return { documentRegister, obsoleteRegister, archiveRegister }
  }

  /**
   * Ensures every non-client document has a DocumentRegister row.
   * Covers both the New Document Register (initial version) and New Version Register (later versions).
   */
  async syncDocumentRegister() {
    const documents = await prisma.document.findMany({
      where: { isClientDocument: false },
      include: {
        documentType: { select: { name: true } },
        owner: { select: { firstName: true, lastName: true, email: true, department: true } }
      }
    })

    const existingRows = await prisma.documentRegister.findMany({
      select: { id: true, fileCode: true, projectCategoryId: true }
    })
    const existingByKey = new Map(
      existingRows.map((row) => [registerKey(row.fileCode, row.projectCategoryId), row])
    )

    let created = 0
    let updated = 0
    let skipped = 0

    for (const doc of documents) {
      const fileCode = String(doc.fileCode || '').trim()
      if (!fileCode) {
        skipped += 1
        continue
      }

      const projectCategoryId = doc.projectCategoryId ?? null
      const data = {
        documentTitle: doc.title || '',
        documentType: doc.documentType?.name || '',
        version: versionSegmentFromFileCode(fileCode) || doc.version || '1.0',
        owner: ownerDisplayName(doc.owner),
        department: doc.owner?.department || '',
        status: doc.status
      }

      const existing = existingByKey.get(registerKey(fileCode, projectCategoryId))
      if (existing) {
        await prisma.documentRegister.update({ where: { id: existing.id }, data })
        updated += 1
      } else {
        await prisma.documentRegister.create({
          data: { fileCode, projectCategoryId, registeredDate: doc.createdAt || new Date(), ...data }
        })
        created += 1
      }
    }

    return { total: documents.length, created, updated, skipped }
  }

  /**
   * Ensures every OBSOLETE document has an ObsoleteRegister row.
   */
  async syncObsoleteRegister() {
    const documents = await prisma.document.findMany({
      where: { status: 'OBSOLETE' },
      include: {
        documentType: { select: { name: true } },
        owner: { select: { firstName: true, lastName: true, email: true } },
        supersededBy: { select: { fileCode: true } }
      }
    })

    const existingRows = await prisma.obsoleteRegister.findMany({ select: { fileCode: true } })
    const existingFileCodes = new Set(existingRows.map((row) => row.fileCode))

    let created = 0
    let skipped = 0

    for (const doc of documents) {
      const fileCode = String(doc.fileCode || '').trim()
      if (!fileCode || existingFileCodes.has(fileCode)) {
        skipped += 1
        continue
      }

      await prisma.obsoleteRegister.create({
        data: {
          fileCode,
          documentTitle: doc.title || '',
          documentType: doc.documentType?.name || '',
          obsoleteDate: doc.obsoleteDate || doc.updatedAt || new Date(),
          reason: doc.obsoleteReason || 'Marked obsolete',
          replacedBy: doc.supersededBy?.fileCode || null,
          lastOwner: ownerDisplayName(doc.owner)
        }
      })
      existingFileCodes.add(fileCode)
      created += 1
    }

    return { total: documents.length, created, skipped }
  }

  /**
   * Ensures every SUPERSEDED document has an ArchiveRegister row (Old Version Register).
   */
  async syncArchiveRegister() {
    const documents = await prisma.document.findMany({
      where: { status: 'SUPERSEDED' },
      include: {
        supersededBy: { select: { version: true, fileCode: true } },
        versions: {
          select: { filePath: true },
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
          take: 1
        }
      }
    })

    const existingRows = await prisma.archiveRegister.findMany({ select: { fileCode: true } })
    const existingFileCodes = new Set(existingRows.map((row) => row.fileCode))

    let created = 0
    let skipped = 0

    for (const doc of documents) {
      const fileCode = String(doc.fileCode || '').trim()
      if (!fileCode || existingFileCodes.has(fileCode)) {
        skipped += 1
        continue
      }

      const retentionUntil = new Date()
      retentionUntil.setFullYear(retentionUntil.getFullYear() + RETENTION_YEARS)

      await prisma.archiveRegister.create({
        data: {
          fileCode,
          documentTitle: doc.title || '',
          version: doc.version || versionSegmentFromFileCode(fileCode) || '',
          archivedDate: doc.updatedAt || new Date(),
          archivedBy: SYSTEM_ACTOR,
          currentVersion: doc.supersededBy?.version || '',
          retentionUntil,
          filePath: doc.versions?.[0]?.filePath || ''
        }
      })
      existingFileCodes.add(fileCode)
      created += 1
    }

    return { total: documents.length, created, skipped }
  }
}

module.exports = new MasterRecordSyncService()
