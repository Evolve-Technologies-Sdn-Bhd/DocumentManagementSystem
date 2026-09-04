const prisma = require('../config/database')
const { BadRequestError, NotFoundError } = require('../utils/errors')
const ExcelJS = require('exceljs')
const notificationService = require('./notificationService')
const emailService = require('./emailService')

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

  normalizeOptionalRmFilterToCents(value, fieldName) {
    if (value === undefined) return undefined
    const raw = String(value ?? '').trim()
    if (!raw) return undefined
    const cleaned = raw.replace(/rm/ig, '').replace(/,/g, '').trim()
    const num = Number(cleaned)
    if (!Number.isFinite(num) || num < 0) {
      throw new BadRequestError(`invalid ${fieldName}`)
    }
    return Math.round(num * 100)
  }

  normalizeOptionalIsoDateFilter(value, fieldName) {
    if (value === undefined) return undefined
    const raw = String(value ?? '').trim()
    if (!raw) return undefined
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new BadRequestError(`invalid ${fieldName}`)
    }
    const date = new Date(`${raw}T00:00:00`)
    if (!Number.isFinite(date.getTime())) {
      throw new BadRequestError(`invalid ${fieldName}`)
    }
    return date
  }

  async notifyUsers({ userIds, title, message, link }) {
    const ids = Array.from(new Set((userIds || []).map((id) => Number(id)).filter(Boolean)))
    if (ids.length === 0) return

    await notificationService.createBulkNotifications(ids, 'SYSTEM_ALERT', title, message, link || null)

    const users = await prisma.user.findMany({
      where: { id: { in: ids }, status: 'ACTIVE' },
      select: { email: true }
    })
    const emails = users.map((u) => String(u.email || '').trim()).filter(Boolean)
    if (emails.length === 0) return

    const subject = title
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="color: #0f6fcf; margin: 0 0 12px 0;">${title}</h2>
        <p style="margin: 0 0 8px 0;">${message}</p>
        ${link ? `<p style="margin: 12px 0 0 0;"><a href="${notificationService.buildAbsoluteLink(link)}">Open in DMS</a></p>` : ''}
      </div>
    `
    await emailService.sendEmail({ to: emails.join(','), subject, html })
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

    const allowNegative = fieldName === 'estimatedProfitCents'

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
        if (!Number.isFinite(rm) || (!allowNegative && rm < 0)) {
          throw new BadRequestError(`invalid ${fieldName}`)
        }
        return Math.round(rm * 100)
      }

      normalizedValue = cleaned
    }

    const num = Number(normalizedValue)
    if (!Number.isFinite(num) || (!allowNegative && num < 0)) {
      throw new BadRequestError(`invalid ${fieldName}`)
    }
    return Math.round(num)
  }

  normalizeListQuery(query = {}) {
    const pageRaw = Number(query.page)
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1

    const limitRaw = Number(query.limit)
    const limit = Number.isFinite(limitRaw) && limitRaw >= 1
      ? Math.min(Math.floor(limitRaw), 100)
      : 15

    const search = String(query.search || '').trim()
    const statusToken = String(query.status || 'all').trim()
    let status = 'all'
    if (statusToken && statusToken.toLowerCase() !== 'all') {
      const normalized = statusToken.toUpperCase()
      if (!this.getAllowedStatuses().includes(normalized)) {
        throw new BadRequestError('invalid status')
      }
      status = normalized
    }

    const tenderRefNo = String(query.tenderRefNo || '').trim()
    const title = String(query.title || '').trim()
    const clientName = String(query.clientName || '').trim()
    const contactPerson = String(query.contactPerson || '').trim()
    const source = String(query.source || '').trim()
    const followUpNotes = String(query.followUpNotes || '').trim()

    const submissionDeadlineFrom = this.normalizeOptionalIsoDateFilter(query.submissionDeadlineFrom, 'submissionDeadlineFrom')
    const submissionDeadlineTo = this.normalizeOptionalIsoDateFilter(query.submissionDeadlineTo, 'submissionDeadlineTo')

    const tenderValueMinCents = this.normalizeOptionalRmFilterToCents(query.tenderValueMinRm, 'tenderValueMinRm')
    const tenderValueMaxCents = this.normalizeOptionalRmFilterToCents(query.tenderValueMaxRm, 'tenderValueMaxRm')
    const estimatedProfitMinCents = this.normalizeOptionalRmFilterToCents(query.estimatedProfitMinRm, 'estimatedProfitMinRm')
    const estimatedProfitMaxCents = this.normalizeOptionalRmFilterToCents(query.estimatedProfitMaxRm, 'estimatedProfitMaxRm')

    return {
      page,
      limit,
      search,
      status,
      tenderRefNo,
      title,
      clientName,
      contactPerson,
      source,
      followUpNotes,
      submissionDeadlineFrom,
      submissionDeadlineTo,
      tenderValueMinCents,
      tenderValueMaxCents,
      estimatedProfitMinCents,
      estimatedProfitMaxCents
    }
  }

  buildWhere({
    search,
    status,
    tenderRefNo,
    title,
    clientName,
    contactPerson,
    source,
    followUpNotes,
    submissionDeadlineFrom,
    submissionDeadlineTo,
    tenderValueMinCents,
    tenderValueMaxCents,
    estimatedProfitMinCents,
    estimatedProfitMaxCents
  }) {
    const where = {}
    if (status && status !== 'all') {
      where.status = status
    }
    if (tenderRefNo) {
      where.tenderRefNo = { contains: tenderRefNo }
    }
    if (title) {
      where.title = { contains: title }
    }
    if (clientName) {
      where.clientName = { contains: clientName }
    }
    if (contactPerson) {
      where.contactPerson = { contains: contactPerson }
    }
    if (source) {
      where.source = { contains: source }
    }
    if (followUpNotes) {
      where.followUpNotes = { contains: followUpNotes }
    }
    if (submissionDeadlineFrom || submissionDeadlineTo) {
      where.submissionDeadline = {
        ...(submissionDeadlineFrom ? { gte: submissionDeadlineFrom } : {}),
        ...(submissionDeadlineTo ? { lte: submissionDeadlineTo } : {})
      }
    }
    if (tenderValueMinCents != null || tenderValueMaxCents != null) {
      where.tenderValueCents = {
        ...(tenderValueMinCents != null ? { gte: tenderValueMinCents } : {}),
        ...(tenderValueMaxCents != null ? { lte: tenderValueMaxCents } : {})
      }
    }
    if (estimatedProfitMinCents != null || estimatedProfitMaxCents != null) {
      where.estimatedProfitCents = {
        ...(estimatedProfitMinCents != null ? { gte: estimatedProfitMinCents } : {}),
        ...(estimatedProfitMaxCents != null ? { lte: estimatedProfitMaxCents } : {})
      }
    }
    if (search) {
      where.OR = [
        { tenderRefNo: { contains: search } },
        { title: { contains: search } },
        { clientName: { contains: search } },
        { contactPerson: { contains: search } },
        { source: { contains: search } },
        { followUpNotes: { contains: search } }
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
    const normalized = this.normalizeListQuery(query)
    const { page, limit } = normalized
    const where = this.buildWhere(normalized)

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
    const normalized = this.normalizeListQuery(query)
    const where = this.buildWhere(normalized)

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

  async getAssignees({ id }) {
    const tenderId = Number(id)
    if (!tenderId) throw new BadRequestError('invalid id')

    const entry = await prisma.crmTenderEntry.findUnique({
      where: { id: tenderId },
      select: { id: true }
    })
    if (!entry) throw new NotFoundError('Tender entry not found')

    const assignees = await prisma.crmTenderAssignee.findMany({
      where: { tenderId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } }
      }
    })
    return { assignees }
  }

  async setAssignees({ id, actorUserId, userIds }) {
    const tenderId = Number(id)
    if (!tenderId) throw new BadRequestError('invalid id')
    const nextIds = Array.from(new Set((userIds || []).map((v) => Number(v)).filter(Boolean)))

    const entry = await prisma.crmTenderEntry.findUnique({
      where: { id: tenderId },
      select: { id: true, tenderRefNo: true, title: true }
    })
    if (!entry) throw new NotFoundError('Tender entry not found')

    const existingRows = await prisma.crmTenderAssignee.findMany({
      where: { tenderId },
      select: { userId: true }
    })
    const existingIds = existingRows.map((r) => r.userId)
    const added = nextIds.filter((v) => !existingIds.includes(v))

    await prisma.$transaction(async (tx) => {
      await tx.crmTenderAssignee.deleteMany({
        where: {
          tenderId,
          userId: { notIn: nextIds.length ? nextIds : [-1] }
        }
      })
      if (added.length) {
        await tx.crmTenderAssignee.createMany({
          data: added.map((uid) => ({
            tenderId,
            userId: uid,
            createdById: actorUserId
          })),
          skipDuplicates: true
        })
      }
    })

    if (added.length) {
      const tenderLabel = entry.tenderRefNo ? `${entry.tenderRefNo} - ${entry.title}` : entry.title
      await this.notifyUsers({
        userIds: added,
        title: 'Tender Follow-up Assigned',
        message: `You have been assigned to follow up tender: ${tenderLabel}`,
        link: '/tender-book'
      })
    }

    return this.getAssignees({ id: tenderId })
  }

  async listFollowUps({ id }) {
    const tenderId = Number(id)
    if (!tenderId) throw new BadRequestError('invalid id')

    const entry = await prisma.crmTenderEntry.findUnique({
      where: { id: tenderId },
      select: { id: true }
    })
    if (!entry) throw new NotFoundError('Tender entry not found')

    const followUps = await prisma.crmTenderFollowUpLog.findMany({
      where: { tenderId },
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, status: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    })
    return { followUps }
  }

  async addFollowUp({ id, actorUserId, payload }) {
    const tenderId = Number(id)
    if (!tenderId) throw new BadRequestError('invalid id')

    const entry = await prisma.crmTenderEntry.findUnique({
      where: { id: tenderId },
      select: { id: true, tenderRefNo: true, title: true }
    })
    if (!entry) throw new NotFoundError('Tender entry not found')

    const assignedToId = payload?.assignedToId ? Number(payload.assignedToId) : null
    const followUpAt = payload?.followUpAt ? this.normalizeOptionalIsoDateFilter(payload.followUpAt, 'followUpAt') : null
    const note = payload?.note !== undefined ? String(payload.note || '').trim() : ''
    if (!note) throw new BadRequestError('note is required')

    const log = await prisma.$transaction(async (tx) => {
      const created = await tx.crmTenderFollowUpLog.create({
        data: {
          tenderId,
          assignedToId,
          followUpAt,
          note,
          createdById: actorUserId
        },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, status: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
        }
      })

      await tx.crmTenderEntry.update({
        where: { id: tenderId },
        data: {
          followUpNotes: note,
          ...(followUpAt ? { nextFollowUpAt: followUpAt } : {})
        }
      })

      return created
    })

    const notifyIds = []
    if (assignedToId) notifyIds.push(assignedToId)
    const assignees = await prisma.crmTenderAssignee.findMany({
      where: { tenderId },
      select: { userId: true }
    })
    notifyIds.push(...assignees.map((a) => a.userId))

    const tenderLabel = entry.tenderRefNo ? `${entry.tenderRefNo} - ${entry.title}` : entry.title
    await this.notifyUsers({
      userIds: notifyIds,
      title: 'Tender Follow-up Updated',
      message: `Follow-up added for tender: ${tenderLabel}${followUpAt ? ` (Due: ${followUpAt.toISOString().split('T')[0]})` : ''}`,
      link: '/tender-book'
    })

    return { followUp: log }
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
      .map((row, rowIndex) => {
        const title = String(row?.title || '').trim()
        if (!title) return null

        let submissionDeadline = null
        try {
          submissionDeadline = this.normalizeOptionalDate(row?.submissionDeadline)
        } catch (e) {
          throw new BadRequestError(`Row ${rowIndex + 1}: invalid submissionDeadline. CSV may contain unquoted commas (e.g., thousand separators) causing column shifting.`)
        }

        return {
          tenderRefNo: null,
          title,
          clientName: this.normalizeOptionalText(row?.clientName),
          contactPerson: this.normalizeOptionalText(row?.contactPerson),
          submissionDeadline,
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

  async importFile({ userId, filePath, originalName }) {
    const name = String(originalName || '').toLowerCase()
    if (!filePath) throw new BadRequestError('file is required')
    if (!name.endsWith('.xlsx')) throw new BadRequestError('Only .xlsx is supported')

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)
    const sheet = workbook.worksheets[0]
    if (!sheet) throw new BadRequestError('Excel file is empty')

    const headerRow = sheet.getRow(1)
    const headerValues = Array.isArray(headerRow.values) ? headerRow.values.slice(1) : []
    const headers = headerValues.map((v) => String(v || '').trim())
    const idx = (key) => headers.findIndex((h) => h.toLowerCase() === String(key).toLowerCase())

    const titleIdx = idx('title')
    if (titleIdx < 0) {
      throw new BadRequestError('Missing required headers: title')
    }

    const readCell = (row, index, options = {}) => {
      const cell = row.getCell(index + 1)
      const value = cell?.value
      if (value == null) return ''
      if (value instanceof Date) return value.toISOString().split('T')[0]
      if (typeof value === 'object' && value.text) return String(value.text)
      if (typeof value === 'number' && options.forceTwoDp) return value.toFixed(2)
      return String(value)
    }

    const rows = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const title = readCell(row, titleIdx).trim()
      if (!title) return

      rows.push({
        title,
        clientName: idx('clientName') >= 0 ? readCell(row, idx('clientName')).trim() : '',
        contactPerson: idx('contactPerson') >= 0 ? readCell(row, idx('contactPerson')).trim() : '',
        submissionDeadline: idx('submissionDeadline') >= 0 ? readCell(row, idx('submissionDeadline')).trim() : '',
        status: idx('status') >= 0 ? readCell(row, idx('status')).trim() : '',
        tenderValueCents: idx('tenderValueCents') >= 0 ? readCell(row, idx('tenderValueCents'), { forceTwoDp: true }).trim() : '',
        estimatedProfitCents: idx('estimatedProfitCents') >= 0 ? readCell(row, idx('estimatedProfitCents'), { forceTwoDp: true }).trim() : '',
        source: idx('source') >= 0 ? readCell(row, idx('source')).trim() : '',
        documentLink: idx('documentLink') >= 0 ? readCell(row, idx('documentLink')).trim() : '',
        followUpNotes: idx('followUpNotes') >= 0 ? readCell(row, idx('followUpNotes')).trim() : ''
      })
    })

    return this.importEntries({ userId, entries: rows })
  }

  async exportTemplateXlsx() {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Tender Book')
    sheet.columns = [
      { header: 'title', key: 'title', width: 32 },
      { header: 'clientName', key: 'clientName', width: 24 },
      { header: 'contactPerson', key: 'contactPerson', width: 18 },
      { header: 'submissionDeadline', key: 'submissionDeadline', width: 16 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'tenderValueCents', key: 'tenderValueCents', width: 18 },
      { header: 'estimatedProfitCents', key: 'estimatedProfitCents', width: 20 },
      { header: 'source', key: 'source', width: 18 },
      { header: 'documentLink', key: 'documentLink', width: 30 },
      { header: 'followUpNotes', key: 'followUpNotes', width: 30 }
    ]

    sheet.addRow({
      title: 'Office Fit-out Package 3',
      clientName: 'ABC Sdn Bhd',
      contactPerson: 'John Tan',
      submissionDeadline: new Date().toISOString().split('T')[0],
      status: 'DRAFT',
      tenderValueCents: 1305720.00,
      estimatedProfitCents: 150000.00,
      source: '',
      documentLink: '',
      followUpNotes: ''
    })

    const buffer = await workbook.xlsx.writeBuffer()
    return { buffer }
  }

  async exportXlsx(query = {}) {
    const normalized = this.normalizeListQuery(query)
    const where = this.buildWhere(normalized)

    const records = await prisma.crmTenderEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    })

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Tender Book')
    sheet.columns = [
      { header: 'tenderRefNo', key: 'tenderRefNo', width: 16 },
      { header: 'title', key: 'title', width: 32 },
      { header: 'clientName', key: 'clientName', width: 24 },
      { header: 'contactPerson', key: 'contactPerson', width: 18 },
      { header: 'submissionDeadline', key: 'submissionDeadline', width: 16 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'tenderValueRm', key: 'tenderValueRm', width: 18 },
      { header: 'estimatedProfitRm', key: 'estimatedProfitRm', width: 20 },
      { header: 'source', key: 'source', width: 18 },
      { header: 'documentLink', key: 'documentLink', width: 30 },
      { header: 'followUpNotes', key: 'followUpNotes', width: 30 }
    ]

    records.forEach((r) => {
      sheet.addRow({
        tenderRefNo: r.tenderRefNo || '',
        title: r.title || '',
        clientName: r.clientName || '',
        contactPerson: r.contactPerson || '',
        submissionDeadline: r.submissionDeadline ? new Date(r.submissionDeadline).toISOString().split('T')[0] : '',
        status: r.status || '',
        tenderValueRm: ((Number(r.tenderValueCents || 0)) / 100).toFixed(2),
        estimatedProfitRm: ((Number(r.estimatedProfitCents || 0)) / 100).toFixed(2),
        source: r.source || '',
        documentLink: r.documentLink || '',
        followUpNotes: r.followUpNotes || ''
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    return { buffer }
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
    const normalized = this.normalizeListQuery(query)
    const where = this.buildWhere(normalized)

    const records = await prisma.crmTenderEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    })

    const csv = this.buildCsv(records)
    return { csv }
  }
}

module.exports = new CrmTenderService()
