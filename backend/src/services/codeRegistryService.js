const prisma = require('../config/database')
const documentService = require('./documentService')
const DocumentNumbering = require('../utils/documentNumbering')
const { BadRequestError } = require('../utils/errors')

class CodeRegistryService {
  async getConsolidatedMasterRecord(filters = {}, pagination = {}) {
    const search = String(filters.search || '').trim()
    const projectCategoryId = filters.projectCategoryId !== undefined && filters.projectCategoryId !== null
      ? parseInt(filters.projectCategoryId, 10)
      : null
    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const limit = Math.max(1, parseInt(pagination.limit, 10) || 50)
    const exportToken = String(filters.export || '').trim().toLowerCase()
    const exportAll = exportToken === '1' || exportToken === 'true' || exportToken === 'excel' || exportToken === 'all'

    const normalizeRevision = (rev, fileCode) => {
      const raw = String(rev || '').trim()
      const fallback = String(fileCode || '').split('/')[1] || ''
      const candidate = raw || String(fallback || '').trim()
      const m = /^0*(\d+)(?:\.(\d+))?([a-z]*)$/i.exec(candidate)
      if (!m) return raw || candidate
      const major = parseInt(m[1], 10)
      const minor = typeof m[2] === 'string' ? m[2] : null
      const suffix = String(m[3] || '').toLowerCase()
      if (!Number.isFinite(major)) return raw || candidate
      if (minor !== null) return `${major}.${minor}${suffix}`
      if (suffix) return `${major}${suffix}`
      return `${major}.0`
    }

    const whereContains = (field) => search ? { [field]: { contains: search } } : undefined

    const [ndr, obsolete, archive, legacy, nvrRequests] = await Promise.all([
      prisma.documentRegister.findMany({
        where: search ? {
          OR: [
            whereContains('fileCode'),
            whereContains('documentTitle'),
            whereContains('owner')
          ].filter(Boolean)
        } : undefined,
        orderBy: { registeredDate: 'desc' }
      }),
      prisma.obsoleteRegister.findMany({
        where: search ? {
          OR: [
            whereContains('fileCode'),
            whereContains('documentTitle'),
            whereContains('documentType')
          ].filter(Boolean)
        } : undefined,
        orderBy: { obsoleteDate: 'desc' }
      }),
      prisma.archiveRegister.findMany({
        where: search ? {
          OR: [
            whereContains('fileCode'),
            whereContains('documentTitle'),
            whereContains('archivedBy')
          ].filter(Boolean)
        } : undefined,
        orderBy: { archivedDate: 'desc' }
      }),
      prisma.codeRegistry.findMany({
        where: search ? {
          OR: [
            whereContains('fileCode'),
            whereContains('documentTitle'),
            whereContains('registryStatus')
          ].filter(Boolean)
        } : undefined,
        include: {
          projectCategory: { select: { id: true, name: true, code: true } },
          documentType: { select: { id: true, name: true, prefix: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.versionRequest.findMany({
        where: {
          status: 'APPROVED',
          newDocumentId: { not: null },
          ...(search ? {
            OR: [
              { newDocument: { fileCode: { contains: search } } },
              { newDocument: { title: { contains: search } } },
              { document: { fileCode: { contains: search } } },
              { document: { title: { contains: search } } }
            ]
          } : {})
        },
        include: {
          document: {
            include: {
              documentType: true,
              projectCategory: true
            }
          },
          newDocument: {
            include: {
              documentType: true,
              projectCategory: true
            }
          },
          requestedBy: {
            select: { firstName: true, lastName: true }
          }
        },
        orderBy: { approvedAt: 'desc' }
      })
    ])

    const fileCodesToEnrich = new Set()
    ndr.forEach((r) => r?.fileCode && fileCodesToEnrich.add(r.fileCode))
    obsolete.forEach((r) => r?.fileCode && fileCodesToEnrich.add(r.fileCode))
    archive.forEach((r) => r?.fileCode && fileCodesToEnrich.add(r.fileCode))
    legacy.forEach((r) => r?.fileCode && fileCodesToEnrich.add(r.fileCode))

    const relatedDocs = fileCodesToEnrich.size > 0
      ? await prisma.document.findMany({
          where: {
            fileCode: { in: Array.from(fileCodesToEnrich) }
          },
          include: {
            documentType: true,
            projectCategory: true
          }
        })
      : []
    const docByFileCode = new Map(relatedDocs.map((d) => [d.fileCode, d]))

    const rows = []

    for (const r of ndr) {
      const doc = docByFileCode.get(r.fileCode)
      const parts = String(r.fileCode || '').split('/')
      const versionSegment = /^\d+$/.test(String(parts[1] || '').trim())
        ? String(parts[1]).trim().padStart(2, '0')
        : String(parts[1] || '').trim()
      const register = versionSegment && versionSegment !== '01' ? 'NVR' : 'NDR'
      const rev = normalizeRevision(versionSegment ? `${versionSegment}.0` : r.version, r.fileCode)
      rows.push({
        register,
        fileCode: r.fileCode,
        documentTitle: r.documentTitle,
        documentType: doc?.documentType?.name || r.documentType || '',
        projectCategory: doc?.projectCategory?.name || '',
        projectCategoryId: doc?.projectCategory?.id ?? r.projectCategoryId ?? null,
        date: r.registeredDate,
        status: r.status,
        rev: register === 'NDR' ? '1.0' : rev,
        source: 'SYSTEM'
      })
    }

    for (const vr of nvrRequests) {
      const originalParts = vr.document?.fileCode?.split('/') || []
      const newParts = vr.newDocument?.fileCode?.split('/') || []
      const prevVersion = normalizeRevision(originalParts[1] ? `${originalParts[1]}.0` : vr.document?.version || '1.0', vr.document?.fileCode)
      const newVersion = normalizeRevision(newParts[1] ? `${newParts[1]}.0` : vr.newDocument?.version || '2.0', vr.newDocument?.fileCode)
      rows.push({
        register: 'NVR',
        fileCode: vr.newDocument?.fileCode || vr.document?.fileCode || '',
        documentTitle: vr.newDocument?.title || vr.document?.title || '',
        documentType: vr.newDocument?.documentType?.name || vr.document?.documentType?.name || '',
        projectCategory: vr.newDocument?.projectCategory?.name || vr.document?.projectCategory?.name || '',
        projectCategoryId: vr.newDocument?.projectCategoryId ?? vr.document?.projectCategoryId ?? null,
        date: vr.approvedAt,
        status: 'APPROVED',
        rev: newVersion || prevVersion,
        source: 'SYSTEM'
      })
    }

    for (const r of obsolete) {
      const doc = docByFileCode.get(r.fileCode)
      rows.push({
        register: 'OR',
        fileCode: r.fileCode,
        documentTitle: r.documentTitle,
        documentType: doc?.documentType?.name || r.documentType || '',
        projectCategory: doc?.projectCategory?.name || '',
        projectCategoryId: doc?.projectCategoryId ?? null,
        date: r.obsoleteDate,
        status: 'OBSOLETE',
        rev: '',
        source: 'SYSTEM'
      })
    }

    for (const r of archive) {
      const doc = docByFileCode.get(r.fileCode)
      rows.push({
        register: 'OVR',
        fileCode: r.fileCode,
        documentTitle: r.documentTitle,
        documentType: doc?.documentType?.name || '',
        projectCategory: doc?.projectCategory?.name || '',
        projectCategoryId: doc?.projectCategoryId ?? null,
        date: r.archivedDate,
        status: 'ARCHIVED',
        rev: normalizeRevision(r.version, r.fileCode),
        source: 'SYSTEM'
      })
    }

    for (const r of legacy) {
      const doc = docByFileCode.get(r.fileCode)
      if (!doc) {
        continue
      }

      rows.push({
        register: 'DOCUMENT',
        fileCode: doc.fileCode,
        documentTitle: doc.title || r.documentTitle || '',
        documentType: doc.documentType?.name || r.documentType?.name || '',
        projectCategory: doc.projectCategory?.name || r.projectCategory?.name || '',
        projectCategoryId: doc.projectCategoryId ?? r.projectCategory?.id ?? null,
        date: doc.updatedAt || doc.createdAt || r.documentDate || r.createdAt,
        status: doc.status || 'NOT EXIST',
        rev: normalizeRevision(doc.version || r.revision || '', doc.fileCode),
        source: r.source || 'SYSTEM'
      })
    }

    const byFileCode = new Map()
    for (const row of rows) {
      if (!row.fileCode) continue
      const existing = byFileCode.get(row.fileCode)
      if (!existing) {
        byFileCode.set(row.fileCode, row)
        continue
      }
      const a = existing.date ? new Date(existing.date).getTime() : 0
      const b = row.date ? new Date(row.date).getTime() : 0
      if (b >= a) byFileCode.set(row.fileCode, row)
    }

    let consolidated = Array.from(byFileCode.values())
    if (projectCategoryId && !Number.isNaN(projectCategoryId)) {
      consolidated = consolidated.filter((r) => r.projectCategoryId === projectCategoryId)
    }
    consolidated = consolidated
      .sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0
        const tb = b.date ? new Date(b.date).getTime() : 0
        if (tb !== ta) return tb - ta
        return String(a.fileCode).localeCompare(String(b.fileCode))
      })

    if (exportAll) {
      return { rows: consolidated, pagination: { page: 1, limit: consolidated.length, total: consolidated.length } }
    }

    const total = consolidated.length
    const start = (page - 1) * limit
    const paged = consolidated.slice(start, start + limit)
    return { rows: paged, pagination: { page, limit, total } }
  }

  async importLegacyRows(rows, userId) {
    if (!Array.isArray(rows) || rows.length === 0) {
      const err = new BadRequestError('No rows to import')
      err.code = 'EMPTY_IMPORT'
      throw err
    }

    const settings = await DocumentNumbering.loadSettings()
    const startingNumber = Math.max(1, parseInt(settings?.startingNumber, 10) || 1)
    const counterDigits = Math.max(1, parseInt(settings?.counterDigits, 10) || 3)
    const imported = []
    const failed = []
    const maxCache = new Map()
    const [projectCategories, documentTypes] = await Promise.all([
      prisma.projectCategory.findMany({ select: { id: true } }),
      prisma.documentType.findMany({ select: { id: true } })
    ])
    const projectCategorySet = new Set(projectCategories.map((x) => x.id))
    const documentTypeSet = new Set(documentTypes.map((x) => x.id))

    for (let i = 0; i < rows.length; i++) {
      const lineNumber = rows[i]?.lineNumber || (i + 2)
      try {
        const fileCode = String(rows[i]?.fileCode || '').trim()
        const projectCategoryId = rows[i]?.projectCategoryId ? parseInt(rows[i].projectCategoryId, 10) : null
        const documentTypeId = rows[i]?.documentTypeId ? parseInt(rows[i].documentTypeId, 10) : null
        const documentTitle = String(rows[i]?.documentTitle || '').trim()
        const registryStatus = String(rows[i]?.status || '').trim()
        const revision = String(rows[i]?.rev || rows[i]?.revision || '').trim()
        const documentDate = rows[i]?.documentDate ? new Date(rows[i].documentDate) : null

        if (!fileCode) {
          const err = new BadRequestError('Reference No is required')
          err.code = 'EMPTY_FILE_CODE'
          throw err
        }
        if (!projectCategoryId) {
          const err = new BadRequestError('Project category is required')
          err.code = 'PROJECT_CATEGORY_REQUIRED'
          throw err
        }
        if (!projectCategorySet.has(projectCategoryId)) {
          const err = new BadRequestError('Project category not found')
          err.code = 'PROJECT_CATEGORY_NOT_FOUND'
          throw err
        }
        if (!documentTypeId) {
          const err = new BadRequestError('Document type is required')
          err.code = 'DOCUMENT_TYPE_REQUIRED'
          throw err
        }
        if (!documentTypeSet.has(documentTypeId)) {
          const err = new BadRequestError('Document type not found')
          err.code = 'DOCUMENT_TYPE_NOT_FOUND'
          throw err
        }

        const parsed = documentService.parseAndNormalizeFileCodeStrict(fileCode, settings)
        const normalized = parsed.normalizedFileCode
        const codeKey = documentService.buildCodeKey(projectCategoryId, documentTypeId, parsed.versionSegment)
        const key = codeKey

        if (!maxCache.has(key)) {
          const maxRunning = await documentService.getCurrentMaxRunningNumber(projectCategoryId, documentTypeId, settings, {
            versionSegment: parsed.versionSegment
          })
          maxCache.set(key, maxRunning)
        }

        const currentMax = maxCache.get(key) || 0
        if (currentMax >= startingNumber && parsed.runningNumber <= currentMax) {
          const err = new BadRequestError(`Running number conflicts with existing registry (current max: ${String(currentMax).padStart(counterDigits, '0')})`)
          err.code = 'RUNNING_NUMBER_CONFLICT'
          throw err
        }

        const existingDoc = await prisma.document.findFirst({ where: { fileCode: normalized, projectCategoryId } })
        if (existingDoc) {
          const err = new BadRequestError(`File code "${normalized}" already exists`)
          err.code = 'DUPLICATE_FULL_CODE'
          throw err
        }

        await prisma.codeRegistry.create({
          data: {
            fileCode: normalized,
            normalizedFileCode: normalized,
            documentTitle: documentTitle || null,
            documentDate: documentDate && !Number.isNaN(documentDate.getTime()) ? documentDate : null,
            registryStatus: registryStatus || null,
            revision: revision || null,
            projectCategoryId,
            documentTypeId,
            codeKey,
            runningNumber: parsed.runningNumber,
            source: 'LEGACY_IMPORT',
            sourceRefId: userId ? parseInt(userId, 10) : null
          }
        })

        maxCache.set(key, Math.max(currentMax, parsed.runningNumber))
        imported.push({ lineNumber, fileCode: normalized })
      } catch (e) {
        failed.push({
          lineNumber,
          reasonCode: String(e?.code || e?.name || 'IMPORT_FAILED'),
          message: String(e?.message || 'Failed to import row')
        })
      }
    }

    return { imported, failed, counts: { imported: imported.length, failed: failed.length } }
  }
}

module.exports = new CodeRegistryService()

