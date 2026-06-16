const prisma = require('../config/database')
const configService = require('./configService')
const auditLogService = require('./auditLogService')
const { fileCodeToFixedEpcHex, FIXED_EPC_HEX_LENGTH } = require('../utils/epcEncoder')
const { BadRequestError, NotFoundError } = require('../utils/errors')

class EpcRegistryService {
  formatDocumentStatus(status, stage) {
    const statusMap = {
      PENDING_ACKNOWLEDGMENT: 'Pending Acknowledgment',
      ACKNOWLEDGED: stage === 'DRAFT' ? 'Drafting' : 'Acknowledged',
      DRAFT: 'Draft',
      PENDING_REVIEW: 'Waiting for Review',
      IN_REVIEW: 'In Review',
      RETURNED: 'Return for Amendments',
      PENDING_APPROVAL: 'Waiting for Approval',
      IN_APPROVAL: 'In Approval',
      PENDING_FIRST_APPROVAL: 'Pending First Approval',
      IN_FIRST_APPROVAL: 'In First Approval',
      PENDING_SECOND_APPROVAL: 'Pending Second Approval',
      IN_SECOND_APPROVAL: 'In Second Approval',
      READY_TO_PUBLISH: 'Ready to Publish',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      PUBLISHED: 'Published',
      SUPERSEDED: 'Superseded',
      OBSOLETE: 'Obsolete',
      ARCHIVED: 'Archived'
    }

    if (statusMap[status]) return statusMap[status]

    const stageMap = {
      DRAFT: 'Draft',
      REVIEW: 'Waiting for Review',
      APPROVAL: 'In Approval',
      Approval: 'In Approval',
      FIRST_APPROVAL: 'In First Approval',
      SECOND_APPROVAL: 'In Second Approval',
      READY_TO_PUBLISH: 'Ready to Publish',
      ACKNOWLEDGMENT: 'Pending Acknowledgment',
      PUBLISHED: 'Published',
      SUPERSEDED: 'Superseded',
      OBSOLETE: 'Obsolete'
    }

    return stageMap[stage] || 'In Process'
  }

  getDefaultSettings() {
    return {
      enabled: false
    }
  }

  async getSettings() {
    const cfg = await configService.getRfidEpcRegistrySettings()
    return {
      ...this.getDefaultSettings(),
      ...(cfg && typeof cfg === 'object' ? cfg : {})
    }
  }

  async isEnabled() {
    const settings = await this.getSettings()
    return Boolean(settings.enabled)
  }

  buildCsv(records) {
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [
      [
        'Generated At',
        'File Code',
        'File Name',
        'Document Status',
        'Tracking Status',
        'EPC Hex',
        'Scheme',
        'Document Title',
        'Document Type',
        'Version'
      ].join(',')
    ]

    for (const record of records) {
      const documentStatus = record.document
        ? this.formatDocumentStatus(record.document.status, record.document.stage)
        : ''
      rows.push([
        escape(record.generatedAt ? new Date(record.generatedAt).toISOString() : ''),
        escape(record.fileCode),
        escape(record.fileName),
        escape(documentStatus),
        escape(record.trackingStatus || ''),
        escape(record.epcHex),
        escape(record.epcScheme),
        escape(record.document?.title || ''),
        escape(record.document?.documentType?.name || ''),
        escape(record.document?.version || '')
      ].join(','))
    }

    return rows.join('\n')
  }

  async generateForUploadedDraft(documentId, documentVersionId, req = null) {
    const enabled = await this.isEnabled()
    if (!enabled) return null

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        documentType: true,
        versions: {
          where: { id: documentVersionId },
          take: 1
        }
      }
    })

    if (!document || !document.versions?.length) return null

    const version = document.versions[0]
    const epcHex = fileCodeToFixedEpcHex(document.fileCode)
    const payload = {
      documentId,
      documentVersionId,
      fileCode: document.fileCode,
      fileName: version.fileName,
      epcScheme: 'FILECODE-HASH-96',
      epcHex,
      filter: 0,
      companyPrefixDigits: 0,
      companyPrefix: 'FIXED96',
      itemReference: document.fileCode,
      serial: String(document.id),
      tagUri: `urn:dms:epc:${epcHex}`,
      pureIdentityUri: `urn:dms:file-code:${encodeURIComponent(document.fileCode)}`,
      generatedAt: new Date()
    }

    const duplicate = await prisma.documentEpcRegistryRecord.findUnique({
      where: { epcHex }
    })

    let record = null
    if (duplicate) {
      if (duplicate.documentId !== documentId) {
        throw new Error(`EPC hex yang sama sudah digunakan oleh file code lain: ${duplicate.fileCode}`)
      }

      record = await prisma.documentEpcRegistryRecord.update({
        where: { id: duplicate.id },
        data: payload
      })
    } else {
      const existingForDocument = await prisma.documentEpcRegistryRecord.findFirst({
        where: { documentId }
      })

      if (existingForDocument) {
        record = await prisma.documentEpcRegistryRecord.update({
          where: { id: existingForDocument.id },
          data: payload
        })
      } else {
        record = await prisma.documentEpcRegistryRecord.create({
          data: payload
        })
      }
    }

    await auditLogService.logDocument(req?.user?.id || null, 'EPC_GENERATE', {
      id: document.id,
      fileCode: document.fileCode
    }, req, {
      documentVersionId,
      epcHex: record.epcHex,
      epcScheme: record.epcScheme,
      generationMode: 'fixed-96-bit-hash-from-file-code',
      epcHexLength: FIXED_EPC_HEX_LENGTH,
      fileName: record.fileName
    })

    return record
  }

  async updateTrackingStatus({ epcHex, fileCode, trackingStatus, userId = null, req = null }) {
    const normalizedEpcHex = epcHex ? String(epcHex).trim() : null
    const normalizedFileCode = fileCode ? String(fileCode).trim() : null

    if (!normalizedEpcHex && !normalizedFileCode) {
      throw new BadRequestError('epcHex atau fileCode diperlukan')
    }

    const whereOr = []
    if (normalizedEpcHex) whereOr.push({ epcHex: normalizedEpcHex })
    if (normalizedFileCode) whereOr.push({ fileCode: normalizedFileCode })

    const record = await prisma.documentEpcRegistryRecord.findFirst({
      where: { OR: whereOr },
      include: {
        document: {
          select: {
            id: true,
            fileCode: true,
            title: true,
            status: true,
            stage: true
          }
        }
      }
    })

    if (!record) {
      throw new NotFoundError('EPC registry record')
    }

    const updated = await prisma.documentEpcRegistryRecord.update({
      where: { id: record.id },
      data: {
        trackingStatus,
        trackingUpdatedAt: new Date(),
        trackingUpdatedById: userId || null
      }
    })

    await auditLogService.logDocument(userId, 'EPC_TRACKING_UPDATE', record.document, req, {
      epcHex: record.epcHex,
      previousTrackingStatus: record.trackingStatus,
      trackingStatus
    })

    return {
      ...updated,
      documentStatus: record.document
        ? this.formatDocumentStatus(record.document.status, record.document.stage)
        : null
    }
  }

  formatRecord(record) {
    const documentStatus = record.document
      ? this.formatDocumentStatus(record.document.status, record.document.stage)
      : null

    return {
      id: record.id,
      fileCode: record.fileCode,
      fileName: record.fileName,
      epcHex: record.epcHex,
      epcScheme: record.epcScheme,
      trackingStatus: record.trackingStatus,
      trackingUpdatedAt: record.trackingUpdatedAt,
      generatedAt: record.generatedAt,
      documentStatus,
      document: record.document
        ? {
            id: record.document.id,
            title: record.document.title,
            version: record.document.version,
            updatedAt: record.document.updatedAt,
            projectCategory: record.document.projectCategory || null,
            documentType: record.document.documentType || null
          }
        : null
    }
  }

  async searchRecords({ query, projectCategoryId, limit = 20 } = {}) {
    const enabled = await this.isEnabled()
    if (!enabled) {
      return { enabled, records: [] }
    }

    const q = String(query ?? '').trim()
    if (!q) {
      throw new BadRequestError('query diperlukan')
    }

    const categoryId = parseInt(projectCategoryId, 10)
    if (!Number.isFinite(categoryId)) {
      throw new BadRequestError('projectCategoryId diperlukan')
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50)
    const epcQuery = q.toUpperCase()

    const records = await prisma.documentEpcRegistryRecord.findMany({
      where: {
        document: {
          projectCategoryId: categoryId
        },
        OR: [
          { fileCode: { contains: q } },
          { epcHex: { contains: epcQuery } }
        ]
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            version: true,
            updatedAt: true,
            status: true,
            stage: true,
            projectCategory: {
              select: { id: true, name: true, code: true }
            },
            documentType: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { generatedAt: 'desc' },
      take
    })

    return {
      enabled,
      records: records.map((record) => this.formatRecord(record))
    }
  }

  async lookupByEpcHexes({ epcHexes, projectCategoryId, limit = 200 } = {}) {
    const enabled = await this.isEnabled()
    if (!enabled) {
      return { enabled, records: [] }
    }

    const categoryId = parseInt(projectCategoryId, 10)
    if (!Number.isFinite(categoryId)) {
      throw new BadRequestError('projectCategoryId diperlukan')
    }

    if (!Array.isArray(epcHexes) || epcHexes.length === 0) {
      throw new BadRequestError('epcHexes diperlukan')
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 200)
    const normalized = Array.from(
      new Set(
        epcHexes
          .map((v) => String(v ?? '').trim().toUpperCase())
          .filter(Boolean)
      )
    ).slice(0, take)

    if (normalized.length === 0) {
      return { enabled, records: [] }
    }

    const records = await prisma.documentEpcRegistryRecord.findMany({
      where: {
        epcHex: { in: normalized },
        document: {
          projectCategoryId: categoryId
        }
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            version: true,
            updatedAt: true,
            status: true,
            stage: true,
            projectCategory: {
              select: { id: true, name: true, code: true }
            },
            documentType: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { generatedAt: 'desc' }
    })

    return {
      enabled,
      records: records.map((record) => this.formatRecord(record))
    }
  }

  async listRecords(filters = {}) {
    const enabled = await this.isEnabled()
    const page = Math.max(parseInt(filters.page, 10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 200)
    const skip = (page - 1) * limit

    const where = {}
    if (filters.fileCode) {
      where.fileCode = { contains: String(filters.fileCode).trim() }
    }

    if (filters.from || filters.to) {
      where.generatedAt = {}
      if (filters.from) {
        where.generatedAt.gte = new Date(`${filters.from}T00:00:00.000Z`)
      }
      if (filters.to) {
        where.generatedAt.lte = new Date(`${filters.to}T23:59:59.999Z`)
      }
    }

    const [records, total] = await Promise.all([
      prisma.documentEpcRegistryRecord.findMany({
        where,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              version: true,
              status: true,
              stage: true,
              documentType: {
                select: { name: true }
              }
            }
          }
        },
        orderBy: { generatedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.documentEpcRegistryRecord.count({ where })
    ])

    return {
      enabled,
      page,
      limit,
      total,
      records: records.map((record) => ({
        ...record,
        documentStatus: record.document
          ? this.formatDocumentStatus(record.document.status, record.document.stage)
          : null
      }))
    }
  }

  async exportRecords(filters = {}) {
    const enabled = await this.isEnabled()
    const where = {}
    if (filters.fileCode) {
      where.fileCode = { contains: String(filters.fileCode).trim() }
    }
    if (filters.from || filters.to) {
      where.generatedAt = {}
      if (filters.from) where.generatedAt.gte = new Date(`${filters.from}T00:00:00.000Z`)
      if (filters.to) where.generatedAt.lte = new Date(`${filters.to}T23:59:59.999Z`)
    }

    const records = await prisma.documentEpcRegistryRecord.findMany({
      where,
      include: {
        document: {
          select: {
            title: true,
            version: true,
            status: true,
            stage: true,
            documentType: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { generatedAt: 'desc' }
    })

    return {
      enabled,
      csv: this.buildCsv(records),
      count: records.length
    }
  }
}

module.exports = new EpcRegistryService()
