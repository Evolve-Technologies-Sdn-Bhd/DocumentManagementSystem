const prisma = require('../config/database')
const { BadRequestError, NotFoundError } = require('../utils/errors')

class CrmTenderService {
  buildGeneratedTenderRefNo(year, runningNumber) {
    const y = Number(year)
    const n = Number(runningNumber)
    const suffix = String(Number.isFinite(n) ? n : 0).padStart(3, '0')
    return `TB-${Number.isFinite(y) ? y : new Date().getFullYear()}-${suffix}`
  }

  async allocateGeneratedTenderRefNos(tx, count, year) {
    const safeCount = Math.max(0, Number(count) || 0)
    if (safeCount <= 0) return []

    const y = Number.isFinite(Number(year)) ? Number(year) : new Date().getFullYear()
    const seq = await tx.crmTenderSequence.upsert({
      where: { year: y },
      create: { year: y, lastNumber: safeCount },
      update: { lastNumber: { increment: safeCount } }
    })

    const end = Number(seq.lastNumber || 0)
    const start = end - safeCount + 1
    return Array.from({ length: safeCount }, (_, i) => this.buildGeneratedTenderRefNo(y, start + i))
  }

  getAllowedStatuses() {
    return ['DRAFT', 'SUBMITTED', 'PENDING', 'KIV', 'WON', 'LOST']
  }

  normalizeOptionalUrl(value, fieldName = 'documentLink') {
    const text = this.normalizeOptionalText(value)
    if (!text) return text
    const token = String(text).trim().toLowerCase()
    if (token === 'n/a' || token === 'na' || token === '-') return null
    try {
      const url = new URL(text)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('invalid protocol')
      }
      return text
    } catch {
      throw new BadRequestError(`${fieldName} must be a valid http(s) URL`)
    }
  }

  normalizeOptionalRef(value) {
    const text = this.normalizeOptionalText(value)
    if (!text) return text
    if (!/^[A-Za-z0-9][A-Za-z0-9/_-]{0,49}$/.test(text)) {
      throw new BadRequestError('invalid tenderRefNo')
    }
    return text
  }

  normalizeCents(value, fieldName) {
    if (value === undefined) return undefined

    if (value === null || value === '') return 0

    let normalizedValue = value
    if (typeof normalizedValue === 'string') {
      const raw = normalizedValue.trim()
      const token = raw.toLowerCase()
      if (!raw) return 0
      if (token === 'n/a' || token === 'na' || token === '-' || token === 'null') return 0

      const cleaned = raw
        .replace(/rm/ig, '')
        .replace(/,/g, '')
        .trim()

      if (cleaned.includes('.') || /[a-z]/i.test(raw) || raw.includes(',')) {
        const rm = Number(cleaned)
        if (!Number.isFinite(rm) || rm < 0) {
          throw new BadRequestError(`invalid ${fieldName}`)
        }
        return Math.round(rm * 100)
      }

      normalizedValue = cleaned
    }

    const num = Number(normalizedValue)
    if (!Number.isFinite(num) || num < 0) {
      throw new BadRequestError(`invalid ${fieldName}`)
    }
    return Math.round(num)
  }

  normalizeListQuery(query = {}) {
    const page = Math.max(Number(query.page || 1), 1)
    const limit = Math.min(Math.max(Number(query.limit || 15), 1), 100)
    const search = String(query.search || '').trim()
    const status = String(query.status || 'all').trim()
    return { page, limit, search, status }
  }

  buildWhere({ search, status }) {
    const where = {}
    if (status && status !== 'all') {
      where.status = status
    }
    if (search) {
      where.OR = [
        { tenderRefNo: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { source: { contains: search, mode: 'insensitive' } }
      ]
    }
    return where
  }

  normalizeStatus(status) {
    const token = String(status ?? '').trim()
    if (!token) return 'DRAFT'
    const lower = token.toLowerCase()
    if (lower === 'n/a' || lower === 'na' || lower === '-' || lower === 'null') return 'DRAFT'
    const normalized = token.toUpperCase()
    if (!this.getAllowedStatuses().includes(normalized)) {
      throw new BadRequestError('invalid status')
    }
    return normalized
  }

  normalizeOptionalText(value) {
    if (value === undefined) return undefined
    const text = String(value || '').trim()
    return text || null
  }

  normalizeOptionalDate(value) {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    const raw = String(value || '').trim()
    if (!raw) return null
    const token = raw.toLowerCase()
    if (token === 'n/a' || token === 'na' || token === '-' || token === 'null') return null

    const parseDdMmYyyy = (text) => {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
      if (!m) return null
      const dd = Number(m[1])
      const mm = Number(m[2])
      const yyyy = Number(m[3])
      if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null
      if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null
      const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
      const d = new Date(`${iso}T00:00:00.000Z`)
      return Number.isNaN(d.getTime()) ? null : d
    }

    const parseDdMmYyyyDash = (text) => {
      const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(text)
      if (!m) return null
      const dd = Number(m[1])
      const mm = Number(m[2])
      const yyyy = Number(m[3])
      if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null
      if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null
      const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
      const d = new Date(`${iso}T00:00:00.000Z`)
      return Number.isNaN(d.getTime()) ? null : d
    }

    const parsed = parseDdMmYyyy(raw) || parseDdMmYyyyDash(raw) || new Date(raw)
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestError('invalid submissionDeadline')
    }
    return parsed
  }

  async list(query = {}) {
    const { page, limit, search, status } = this.normalizeListQuery(query)
    const where = this.buildWhere({ search, status })

    const [total, records] = await Promise.all([
      prisma.crmTenderEntry.count({ where }),
      prisma.crmTenderEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true }
          }
        }
      })
    ])

    return { records, total }
  }

  async summary(query = {}) {
    const { search, status } = this.normalizeListQuery(query)
    const where = this.buildWhere({ search, status })

    const [aggregate, grouped] = await Promise.all([
      prisma.crmTenderEntry.aggregate({
        where,
        _count: { _all: true },
        _sum: {
          tenderValueCents: true,
          estimatedProfitCents: true
        }
      }),
      prisma.crmTenderEntry.groupBy({
        by: ['status'],
        where,
        _count: { _all: true }
      })
    ])

    const countByStatus = grouped.reduce((acc, row) => {
      acc[row.status] = Number(row._count?._all || 0)
      return acc
    }, {})

    return {
      totalEntries: Number(aggregate._count?._all || 0),
      inProgress:
        Number(countByStatus.DRAFT || 0) +
        Number(countByStatus.SUBMITTED || 0) +
        Number(countByStatus.PENDING || 0) +
        Number(countByStatus.KIV || 0),
      won: Number(countByStatus.WON || 0),
      lost: Number(countByStatus.LOST || 0),
      totalTenderValueCents: Number(aggregate._sum?.tenderValueCents || 0),
      totalEstimatedProfitCents: Number(aggregate._sum?.estimatedProfitCents || 0)
    }
  }

  async create({ userId, payload }) {
    const title = String(payload?.title || '').trim()
    if (!title) {
      throw new BadRequestError('title is required')
    }

    return prisma.$transaction(async (tx) => {
      const generatedRefs = await this.allocateGeneratedTenderRefNos(tx, 1, new Date().getFullYear())
      const tenderRefNo = generatedRefs[0] || null

      const data = {
        tenderRefNo,
        title,
        clientName: this.normalizeOptionalText(payload?.clientName),
        contactPerson: this.normalizeOptionalText(payload?.contactPerson),
        submissionDeadline: this.normalizeOptionalDate(payload?.submissionDeadline),
        status: this.normalizeStatus(payload?.status || 'DRAFT'),
        tenderValueCents: this.normalizeCents(payload?.tenderValueCents ?? 0, 'tenderValueCents'),
        estimatedProfitCents: this.normalizeCents(payload?.estimatedProfitCents ?? 0, 'estimatedProfitCents'),
        source: this.normalizeOptionalText(payload?.source),
        documentLink: this.normalizeOptionalUrl(payload?.documentLink),
        followUpNotes: this.normalizeOptionalText(payload?.followUpNotes),
        createdById: userId
      }

      const entry = await tx.crmTenderEntry.create({ data })
      return { entry }
    })
  }

  async update({ id, payload }) {
    const entryId = Number(id)
    if (!entryId) {
      throw new BadRequestError('invalid id')
    }

    const existing = await prisma.crmTenderEntry.findUnique({ where: { id: entryId } })
    if (!existing) {
      throw new NotFoundError('Tender entry not found')
    }

    const title = payload?.title !== undefined ? String(payload.title || '').trim() : undefined
    if (title === '') {
      throw new BadRequestError('title is required')
    }

    const data = {}
    if (payload?.tenderRefNo !== undefined) {
      throw new BadRequestError('tenderRefNo is system-generated')
    }
    if (title !== undefined) data.title = title
    if (payload?.clientName !== undefined) data.clientName = this.normalizeOptionalText(payload.clientName)
    if (payload?.contactPerson !== undefined) data.contactPerson = this.normalizeOptionalText(payload.contactPerson)
    if (payload?.submissionDeadline !== undefined) data.submissionDeadline = this.normalizeOptionalDate(payload.submissionDeadline)
    if (payload?.status !== undefined) data.status = this.normalizeStatus(payload.status)
    if (payload?.tenderValueCents !== undefined) data.tenderValueCents = this.normalizeCents(payload.tenderValueCents, 'tenderValueCents')
    if (payload?.estimatedProfitCents !== undefined) data.estimatedProfitCents = this.normalizeCents(payload.estimatedProfitCents, 'estimatedProfitCents')
    if (payload?.source !== undefined) data.source = this.normalizeOptionalText(payload.source)
    if (payload?.documentLink !== undefined) data.documentLink = this.normalizeOptionalUrl(payload.documentLink)
    if (payload?.followUpNotes !== undefined) data.followUpNotes = this.normalizeOptionalText(payload.followUpNotes)

    const entry = await prisma.crmTenderEntry.update({
      where: { id: entryId },
      data
    })

    return { entry }
  }

  async remove({ id }) {
    const entryId = Number(id)
    if (!entryId) {
      throw new BadRequestError('invalid id')
    }

    const existing = await prisma.crmTenderEntry.findUnique({ where: { id: entryId } })
    if (!existing) {
      throw new NotFoundError('Tender entry not found')
    }

    await prisma.crmTenderEntry.delete({ where: { id: entryId } })
    return { deleted: true }
  }

  async importEntries({ userId, entries }) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new BadRequestError('entries is required')
    }

    const preparedBase = entries
      .map((row) => {
        const title = String(row?.title || '').trim()
        if (!title) return null
        return {
          tenderRefNo: null,
          title,
          clientName: this.normalizeOptionalText(row?.clientName),
          contactPerson: this.normalizeOptionalText(row?.contactPerson),
          submissionDeadline: this.normalizeOptionalDate(row?.submissionDeadline),
          status: this.normalizeStatus(row?.status || 'DRAFT'),
          tenderValueCents: this.normalizeCents(row?.tenderValueCents ?? 0, 'tenderValueCents'),
          estimatedProfitCents: this.normalizeCents(row?.estimatedProfitCents ?? 0, 'estimatedProfitCents'),
          source: this.normalizeOptionalText(row?.source),
          documentLink: this.normalizeOptionalUrl(row?.documentLink),
          followUpNotes: this.normalizeOptionalText(row?.followUpNotes),
          createdById: userId
        }
      })
      .filter(Boolean)

    if (preparedBase.length === 0) {
      throw new BadRequestError('No valid entries to import')
    }

    const missingCount = preparedBase.length
    const year = new Date().getFullYear()

    return prisma.$transaction(async (tx) => {
      const generatedRefs = missingCount > 0 ? await this.allocateGeneratedTenderRefNos(tx, missingCount, year) : []
      let nextIdx = 0
      const prepared = preparedBase.map((r) => {
        const auto = generatedRefs[nextIdx++] || null
        return { ...r, tenderRefNo: auto }
      })

      const result = await tx.crmTenderEntry.createMany({
        data: prepared,
        skipDuplicates: false
      })

      return { createdCount: Number(result.count || 0) }
    })
  }

  buildCsv(records) {
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [
      [
        'Tender Ref No',
        'Tender / Project Title',
        'Client / Company',
        'Contact Person',
        'Submission Deadline',
        'Status',
        'Tender Value (RM)',
        'Estimated Profit (RM)',
        'Source',
        'Documents (Link / Reference)',
        'Follow-up Notes'
      ]
    ]

    records.forEach((r) => {
      rows.push([
        escape(r.tenderRefNo || ''),
        escape(r.title),
        escape(r.clientName || ''),
        escape(r.contactPerson || ''),
        escape(r.submissionDeadline ? new Date(r.submissionDeadline).toISOString().split('T')[0] : ''),
        escape(r.status),
        escape(((Number(r.tenderValueCents || 0)) / 100).toFixed(2)),
        escape(((Number(r.estimatedProfitCents || 0)) / 100).toFixed(2)),
        escape(r.source || ''),
        escape(r.documentLink || ''),
        escape(r.followUpNotes || '')
      ])
    })

    return rows.map((row) => row.join(',')).join('\n')
  }

  async exportCsv(query = {}) {
    const { search, status } = this.normalizeListQuery(query)
    const where = this.buildWhere({ search, status })

    const records = await prisma.crmTenderEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    })

    const csv = this.buildCsv(records)
    return { csv }
  }
}

module.exports = new CrmTenderService()
