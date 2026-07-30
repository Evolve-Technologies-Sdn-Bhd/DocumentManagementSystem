const prisma = require('../config/database')
const { BadRequestError, NotFoundError } = require('../utils/errors')
const crmTenderService = require('./crmTenderService')
const notificationService = require('./notificationService')
const emailService = require('./emailService')
const ExcelJS = require('exceljs')

class CrmFbEnquiryService {
  getAllowedStatuses() {
    return ['NEW', 'CONTACTED', 'FOLLOW_UP', 'NO_RESPONSE', 'QUOTATION_ISSUED']
  }

  getDefaultLookups() {
    return {
      channels: ['Facebook Post/Ad', 'Messenger', 'Comment', 'Referral from FB'],
      industryTypes: ['Construction', 'Manufacturing', 'Retail', 'Services', 'Education', 'Healthcare', 'Other']
    }
  }

  async getConfiguredLookups() {
    const record = await prisma.configuration.findUnique({
      where: { key: 'crm.fbEnquiry.lookups' },
      select: { value: true }
    })
    if (!record?.value) return this.getDefaultLookups()

    try {
      const parsed = JSON.parse(record.value)
      return {
        channels: Array.isArray(parsed?.channels) ? parsed.channels.map((item) => String(item).trim()).filter(Boolean) : this.getDefaultLookups().channels,
        industryTypes: Array.isArray(parsed?.industryTypes) ? parsed.industryTypes.map((item) => String(item).trim()).filter(Boolean) : this.getDefaultLookups().industryTypes
      }
    } catch {
      return this.getDefaultLookups()
    }
  }

  normalizeOptionalEmail(value) {
    const text = this.normalizeOptionalText(value)
    if (!text) return text
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      throw new BadRequestError('invalid email')
    }
    return text
  }

  normalizeOptionalUrl(value, fieldName = 'documentLink') {
    const text = this.normalizeOptionalText(value)
    if (!text) return text
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

  normalizeCents(value, fieldName) {
    const num = value === undefined ? undefined : Number(value)
    if (value === undefined) return undefined
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
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { contact: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { state: { contains: search, mode: 'insensitive' } },
        { interestedProduct: { contains: search, mode: 'insensitive' } }
      ]
    }
    return where
  }

  normalizeStatus(status) {
    const normalized = String(status || 'NEW').trim().toUpperCase()
    if (!this.getAllowedStatuses().includes(normalized)) {
      throw new BadRequestError('invalid status')
    }
    return normalized
  }

  normalizeDate(value, fieldName = 'enquiryDate') {
    const date = new Date(value)
    if (!value || Number.isNaN(date.getTime())) {
      throw new BadRequestError(`${fieldName} is required`)
    }
    return date
  }

  normalizeOptionalText(value) {
    if (value === undefined) return undefined
    const text = String(value || '').trim()
    return text || null
  }

  async normalizeLookupValue(value, fieldName, key) {
    const text = this.normalizeOptionalText(value)
    if (!text) return text
    const lookups = await this.getConfiguredLookups()
    const allowed = Array.isArray(lookups?.[key]) ? lookups[key] : []
    const matched = allowed.find((item) => item.toLowerCase() === text.toLowerCase())
    if (!matched) {
      throw new BadRequestError(`invalid ${fieldName}`)
    }
    return matched
  }

  async list(query = {}) {
    const { page, limit, search, status } = this.normalizeListQuery(query)
    const where = this.buildWhere({ search, status })

    const [total, records] = await Promise.all([
      prisma.crmFbEnquiryEntry.count({ where }),
      prisma.crmFbEnquiryEntry.findMany({
        where,
        orderBy: [{ enquiryDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true }
          },
          assignees: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } }
            },
            orderBy: { createdAt: 'asc' }
          },
          tenderEntry: {
            select: { id: true, tenderRefNo: true, title: true, status: true }
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
      prisma.crmFbEnquiryEntry.aggregate({
        where,
        _count: { _all: true },
        _sum: { potentialValueCents: true }
      }),
      prisma.crmFbEnquiryEntry.groupBy({
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
      newEntries: Number(countByStatus.NEW || 0),
      inPipeline:
        Number(countByStatus.CONTACTED || 0) +
        Number(countByStatus.FOLLOW_UP || 0),
      quotationIssued: Number(countByStatus.QUOTATION_ISSUED || 0),
      noResponse: Number(countByStatus.NO_RESPONSE || 0),
      totalPotentialValueCents: Number(aggregate._sum?.potentialValueCents || 0)
    }
  }

  normalizeRequiredContact(value) {
    const text = String(value || '').trim()
    if (!text) {
      throw new BadRequestError('contact is required')
    }
    if (text.length > 255) {
      throw new BadRequestError('contact is too long')
    }
    return text
  }

  async ensureContactUnique(contact, ignoreEntryId = null) {
    const existing = await prisma.crmFbEnquiryEntry.findFirst({
      where: {
        contact,
        ...(ignoreEntryId ? { id: { not: Number(ignoreEntryId) } } : {})
      },
      select: { id: true }
    })
    if (existing) {
      throw new BadRequestError('contact already exists')
    }
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

  async create({ userId, payload }) {
    const name = payload?.name !== undefined ? String(payload?.name || '').trim() : null
    const contact = this.normalizeRequiredContact(payload?.contact)
    await this.ensureContactUnique(contact)

    const data = {
      name: name || null,
      contact,
      enquiryDate: this.normalizeDate(payload?.enquiryDate),
      email: this.normalizeOptionalEmail(payload?.email),
      company: this.normalizeOptionalText(payload?.company),
      address: this.normalizeOptionalText(payload?.address),
      state: this.normalizeOptionalText(payload?.state),
      channel: await this.normalizeLookupValue(payload?.channel, 'channel', 'channels'),
      industryType: await this.normalizeLookupValue(payload?.industryType, 'industryType', 'industryTypes'),
      interestedProduct: this.normalizeOptionalText(payload?.interestedProduct),
      painPoint: this.normalizeOptionalText(payload?.painPoint),
      status: this.normalizeStatus(payload?.status || 'NEW'),
      potentialValueCents: this.normalizeCents(payload?.potentialValueCents ?? 0, 'potentialValueCents'),
      documentLink: this.normalizeOptionalUrl(payload?.documentLink),
      followUpNotes: this.normalizeOptionalText(payload?.followUpNotes),
      nextFollowUpAt: payload?.nextFollowUpAt ? this.normalizeDate(payload.nextFollowUpAt, 'nextFollowUpAt') : null,
      createdById: userId
    }

    const entry = await prisma.$transaction(async (tx) => {
      if (data.status === 'QUOTATION_ISSUED') {
        const generatedRefs = await crmTenderService.allocateGeneratedTenderRefNos(tx, 1, new Date().getFullYear())
        const tenderRefNo = generatedRefs[0] || null
        const tenderTitle = String(data.interestedProduct || '').trim() || `FB Enquiry - ${contact}`
        const tender = await tx.crmTenderEntry.create({
          data: {
            tenderRefNo,
            title: tenderTitle,
            clientName: data.company || null,
            contactPerson: data.name || null,
            source: 'FB_ENQUIRY',
            documentLink: data.documentLink || null,
            followUpNotes: data.followUpNotes || null,
            createdById: userId
          }
        })
        data.tenderEntryId = tender.id
      }

      return tx.crmFbEnquiryEntry.create({ data })
    })

    return { entry }
  }

  async update({ id, actorUserId, payload }) {
    const entryId = Number(id)
    if (!entryId) {
      throw new BadRequestError('invalid id')
    }

    const existing = await prisma.crmFbEnquiryEntry.findUnique({ where: { id: entryId } })
    if (!existing) {
      throw new NotFoundError('FB enquiry entry not found')
    }

    const name = payload?.name !== undefined ? String(payload.name || '').trim() : undefined
    const contact = payload?.contact !== undefined ? this.normalizeRequiredContact(payload.contact) : undefined
    if (contact !== undefined) {
      await this.ensureContactUnique(contact, entryId)
    }

    const data = {}
    if (name !== undefined) data.name = name || null
    if (contact !== undefined) data.contact = contact
    if (payload?.enquiryDate !== undefined) data.enquiryDate = this.normalizeDate(payload.enquiryDate)
    if (payload?.email !== undefined) data.email = this.normalizeOptionalEmail(payload.email)
    if (payload?.company !== undefined) data.company = this.normalizeOptionalText(payload.company)
    if (payload?.address !== undefined) data.address = this.normalizeOptionalText(payload.address)
    if (payload?.state !== undefined) data.state = this.normalizeOptionalText(payload.state)
    if (payload?.channel !== undefined) data.channel = await this.normalizeLookupValue(payload.channel, 'channel', 'channels')
    if (payload?.industryType !== undefined) data.industryType = await this.normalizeLookupValue(payload.industryType, 'industryType', 'industryTypes')
    if (payload?.interestedProduct !== undefined) data.interestedProduct = this.normalizeOptionalText(payload.interestedProduct)
    if (payload?.painPoint !== undefined) data.painPoint = this.normalizeOptionalText(payload.painPoint)
    if (payload?.status !== undefined) data.status = this.normalizeStatus(payload.status)
    if (payload?.potentialValueCents !== undefined) data.potentialValueCents = this.normalizeCents(payload.potentialValueCents, 'potentialValueCents')
    if (payload?.documentLink !== undefined) data.documentLink = this.normalizeOptionalUrl(payload.documentLink)
    if (payload?.followUpNotes !== undefined) data.followUpNotes = this.normalizeOptionalText(payload.followUpNotes)
    if (payload?.nextFollowUpAt !== undefined) data.nextFollowUpAt = payload.nextFollowUpAt ? this.normalizeDate(payload.nextFollowUpAt, 'nextFollowUpAt') : null

    const statusChangingToQuotationIssued = payload?.status !== undefined
      && this.normalizeStatus(payload.status) === 'QUOTATION_ISSUED'
      && existing.status !== 'QUOTATION_ISSUED'

    const entry = await prisma.$transaction(async (tx) => {
      let tenderEntryId = existing.tenderEntryId
      if (statusChangingToQuotationIssued && !tenderEntryId) {
        const generatedRefs = await crmTenderService.allocateGeneratedTenderRefNos(tx, 1, new Date().getFullYear())
        const tenderRefNo = generatedRefs[0] || null
        const tenderTitle = String(existing.interestedProduct || '').trim()
          || (contact ? `FB Enquiry - ${contact}` : `FB Enquiry - ${existing.contact}`)
        const tender = await tx.crmTenderEntry.create({
          data: {
            tenderRefNo,
            title: tenderTitle,
            clientName: existing.company || null,
            contactPerson: existing.name || null,
            source: 'FB_ENQUIRY',
            documentLink: existing.documentLink || null,
            followUpNotes: existing.followUpNotes || null,
            createdById: Number(actorUserId) || existing.createdById
          }
        })
        tenderEntryId = tender.id
        data.tenderEntryId = tender.id
      }

      return tx.crmFbEnquiryEntry.update({
        where: { id: entryId },
        data
      })
    })

    return { entry }
  }

  async getAssignees({ id }) {
    const entryId = Number(id)
    if (!entryId) throw new BadRequestError('invalid id')

    const entry = await prisma.crmFbEnquiryEntry.findUnique({
      where: { id: entryId },
      select: { id: true }
    })
    if (!entry) throw new NotFoundError('FB enquiry entry not found')

    const assignees = await prisma.crmFbEnquiryAssignee.findMany({
      where: { enquiryId: entryId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } }
      }
    })
    return { assignees }
  }

  async setAssignees({ id, actorUserId, userIds }) {
    const entryId = Number(id)
    if (!entryId) throw new BadRequestError('invalid id')
    const nextIds = Array.from(new Set((userIds || []).map((v) => Number(v)).filter(Boolean)))

    const entry = await prisma.crmFbEnquiryEntry.findUnique({
      where: { id: entryId },
      select: { id: true, contact: true }
    })
    if (!entry) throw new NotFoundError('FB enquiry entry not found')

    const existingRows = await prisma.crmFbEnquiryAssignee.findMany({
      where: { enquiryId: entryId },
      select: { userId: true }
    })
    const existingIds = existingRows.map((r) => r.userId)

    const added = nextIds.filter((v) => !existingIds.includes(v))

    await prisma.$transaction(async (tx) => {
      await tx.crmFbEnquiryAssignee.deleteMany({
        where: {
          enquiryId: entryId,
          userId: { notIn: nextIds.length ? nextIds : [-1] }
        }
      })
      if (added.length) {
        await tx.crmFbEnquiryAssignee.createMany({
          data: added.map((uid) => ({
            enquiryId: entryId,
            userId: uid,
            createdById: actorUserId
          })),
          skipDuplicates: true
        })
      }
    })

    if (added.length) {
      await this.notifyUsers({
        userIds: added,
        title: 'FB Enquiry Follow-up Assigned',
        message: `You have been assigned to follow up FB enquiry: ${entry.contact}`,
        link: '/fb-enquiries'
      })
    }

    return this.getAssignees({ id: entryId })
  }

  async listFollowUps({ id }) {
    const entryId = Number(id)
    if (!entryId) throw new BadRequestError('invalid id')

    const entry = await prisma.crmFbEnquiryEntry.findUnique({
      where: { id: entryId },
      select: { id: true }
    })
    if (!entry) throw new NotFoundError('FB enquiry entry not found')

    const followUps = await prisma.crmFbEnquiryFollowUpLog.findMany({
      where: { enquiryId: entryId },
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, status: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    })

    return { followUps }
  }

  async addFollowUp({ id, actorUserId, payload }) {
    const entryId = Number(id)
    if (!entryId) throw new BadRequestError('invalid id')

    const entry = await prisma.crmFbEnquiryEntry.findUnique({
      where: { id: entryId },
      select: { id: true, contact: true, nextFollowUpAt: true }
    })
    if (!entry) throw new NotFoundError('FB enquiry entry not found')

    const assignedToId = payload?.assignedToId ? Number(payload.assignedToId) : null
    const followUpAt = payload?.followUpAt ? this.normalizeDate(payload.followUpAt, 'followUpAt') : null
    const note = payload?.note !== undefined ? String(payload.note || '').trim() : ''
    if (!note) throw new BadRequestError('note is required')

    const log = await prisma.$transaction(async (tx) => {
      const created = await tx.crmFbEnquiryFollowUpLog.create({
        data: {
          enquiryId: entryId,
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

      if (followUpAt) {
        await tx.crmFbEnquiryEntry.update({
          where: { id: entryId },
          data: { nextFollowUpAt: followUpAt }
        })
      }

      return created
    })

    const notifyIds = []
    if (assignedToId) notifyIds.push(assignedToId)
    const assignees = await prisma.crmFbEnquiryAssignee.findMany({
      where: { enquiryId: entryId },
      select: { userId: true }
    })
    notifyIds.push(...assignees.map((a) => a.userId))

    await this.notifyUsers({
      userIds: notifyIds,
      title: 'FB Enquiry Follow-up Updated',
      message: `Follow-up added for FB enquiry: ${entry.contact}${followUpAt ? ` (Due: ${followUpAt.toISOString().split('T')[0]})` : ''}`,
      link: '/fb-enquiries'
    })

    return { followUp: log }
  }

  async remove({ id }) {
    const entryId = Number(id)
    if (!entryId) {
      throw new BadRequestError('invalid id')
    }

    const existing = await prisma.crmFbEnquiryEntry.findUnique({ where: { id: entryId } })
    if (!existing) {
      throw new NotFoundError('FB enquiry entry not found')
    }

    await prisma.crmFbEnquiryEntry.delete({ where: { id: entryId } })
    return { deleted: true }
  }

  async importEntries({ userId, entries }) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new BadRequestError('entries is required')
    }

    const contacts = entries.map((row) => this.normalizeRequiredContact(row?.contact))
    const seen = new Set()
    for (const c of contacts) {
      const key = c.toLowerCase()
      if (seen.has(key)) {
        throw new BadRequestError(`duplicate contact in import: ${c}`)
      }
      seen.add(key)
    }

    const existing = await prisma.crmFbEnquiryEntry.findMany({
      where: { contact: { in: contacts } },
      select: { contact: true }
    })
    if (existing.length) {
      throw new BadRequestError(`contact already exists: ${existing[0].contact}`)
    }

    const prepared = (await Promise.all(entries
      .map(async (row) => {
        const contact = this.normalizeRequiredContact(row?.contact)
        const name = row?.name !== undefined ? String(row?.name || '').trim() : ''
        return {
          name: name || null,
          enquiryDate: this.normalizeDate(row?.enquiryDate),
          email: this.normalizeOptionalEmail(row?.email),
          company: this.normalizeOptionalText(row?.company),
          contact,
          address: this.normalizeOptionalText(row?.address),
          state: this.normalizeOptionalText(row?.state),
          channel: await this.normalizeLookupValue(row?.channel, 'channel', 'channels'),
          industryType: await this.normalizeLookupValue(row?.industryType, 'industryType', 'industryTypes'),
          interestedProduct: this.normalizeOptionalText(row?.interestedProduct),
          painPoint: this.normalizeOptionalText(row?.painPoint),
          status: this.normalizeStatus(row?.status || 'NEW'),
          potentialValueCents: this.normalizeCents(row?.potentialValueCents ?? 0, 'potentialValueCents'),
          documentLink: this.normalizeOptionalUrl(row?.documentLink),
          followUpNotes: this.normalizeOptionalText(row?.followUpNotes),
          nextFollowUpAt: row?.nextFollowUpAt ? this.normalizeDate(row.nextFollowUpAt, 'nextFollowUpAt') : null,
          createdById: userId
        }
      }))).filter(Boolean)

    if (prepared.length === 0) {
      throw new BadRequestError('No valid entries to import')
    }

    const result = await prisma.crmFbEnquiryEntry.createMany({
      data: prepared,
      skipDuplicates: false
    })

    return { createdCount: Number(result.count || 0) }
  }

  buildCsv(records) {
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [[
      'Enquiry Date',
      'Name',
      'Email',
      'Company',
      'Contact',
      'Address',
      'State',
      'Channel',
      'Industry Type',
      'Interested Product / Service',
      'Pain Point / Customer Need',
      'Status',
      'Next Follow-up Date',
      'Documents (Link / Reference)',
      'Follow-up Notes',
      'Tender Ref No'
    ]]

    records.forEach((r) => {
      rows.push([
        escape(new Date(r.enquiryDate).toISOString().split('T')[0]),
        escape(r.name || ''),
        escape(r.email || ''),
        escape(r.company || ''),
        escape(r.contact || ''),
        escape(r.address || ''),
        escape(r.state || ''),
        escape(r.channel || ''),
        escape(r.industryType || ''),
        escape(r.interestedProduct || ''),
        escape(r.painPoint || ''),
        escape(r.status),
        escape(r.nextFollowUpAt ? new Date(r.nextFollowUpAt).toISOString().split('T')[0] : ''),
        escape(r.documentLink || ''),
        escape(r.followUpNotes || ''),
        escape(r.tenderEntry?.tenderRefNo || '')
      ])
    })

    return rows.map((row) => row.join(',')).join('\n')
  }

  async exportCsv(query = {}) {
    const { search, status } = this.normalizeListQuery(query)
    const where = this.buildWhere({ search, status })

    const records = await prisma.crmFbEnquiryEntry.findMany({
      where,
      orderBy: [{ enquiryDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        tenderEntry: { select: { tenderRefNo: true } }
      }
    })

    const csv = this.buildCsv(records)
    return { csv }
  }

  async exportXlsx(query = {}) {
    const { search, status } = this.normalizeListQuery(query)
    const where = this.buildWhere({ search, status })

    const records = await prisma.crmFbEnquiryEntry.findMany({
      where,
      orderBy: [{ enquiryDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        tenderEntry: { select: { tenderRefNo: true } }
      }
    })

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('FB Enquiries')
    sheet.columns = [
      { header: 'contact', key: 'contact', width: 22 },
      { header: 'enquiryDate', key: 'enquiryDate', width: 14 },
      { header: 'status', key: 'status', width: 18 },
      { header: 'name', key: 'name', width: 24 },
      { header: 'email', key: 'email', width: 26 },
      { header: 'company', key: 'company', width: 24 },
      { header: 'address', key: 'address', width: 28 },
      { header: 'state', key: 'state', width: 16 },
      { header: 'channel', key: 'channel', width: 20 },
      { header: 'industryType', key: 'industryType', width: 18 },
      { header: 'interestedProduct', key: 'interestedProduct', width: 24 },
      { header: 'painPoint', key: 'painPoint', width: 30 },
      { header: 'documentLink', key: 'documentLink', width: 30 },
      { header: 'nextFollowUpAt', key: 'nextFollowUpAt', width: 16 },
      { header: 'followUpNotes', key: 'followUpNotes', width: 30 },
      { header: 'tenderRefNo', key: 'tenderRefNo', width: 18 }
    ]

    records.forEach((r) => {
      sheet.addRow({
        contact: r.contact || '',
        enquiryDate: r.enquiryDate ? new Date(r.enquiryDate).toISOString().split('T')[0] : '',
        status: r.status || '',
        name: r.name || '',
        email: r.email || '',
        company: r.company || '',
        address: r.address || '',
        state: r.state || '',
        channel: r.channel || '',
        industryType: r.industryType || '',
        interestedProduct: r.interestedProduct || '',
        painPoint: r.painPoint || '',
        documentLink: r.documentLink || '',
        nextFollowUpAt: r.nextFollowUpAt ? new Date(r.nextFollowUpAt).toISOString().split('T')[0] : '',
        followUpNotes: r.followUpNotes || '',
        tenderRefNo: r.tenderEntry?.tenderRefNo || ''
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    return { buffer }
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

    const contactIdx = idx('contact')
    const enquiryDateIdx = idx('enquiryDate')
    if (contactIdx < 0 || enquiryDateIdx < 0) {
      throw new BadRequestError('Missing required headers: contact,enquiryDate')
    }

    const readCell = (row, index) => {
      const cell = row.getCell(index + 1)
      const value = cell?.value
      if (value == null) return ''
      if (typeof value === 'object' && value.text) return String(value.text)
      if (value instanceof Date) return value.toISOString().split('T')[0]
      return String(value)
    }

    const rows = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const contact = readCell(row, contactIdx).trim()
      const enquiryDate = readCell(row, enquiryDateIdx).trim()
      if (!contact || !enquiryDate) return

      const entry = {
        contact,
        enquiryDate,
        status: idx('status') >= 0 ? readCell(row, idx('status')).trim() : 'NEW',
        name: idx('name') >= 0 ? readCell(row, idx('name')).trim() : '',
        email: idx('email') >= 0 ? readCell(row, idx('email')).trim() : '',
        company: idx('company') >= 0 ? readCell(row, idx('company')).trim() : '',
        address: idx('address') >= 0 ? readCell(row, idx('address')).trim() : '',
        state: idx('state') >= 0 ? readCell(row, idx('state')).trim() : '',
        channel: idx('channel') >= 0 ? readCell(row, idx('channel')).trim() : '',
        industryType: idx('industryType') >= 0 ? readCell(row, idx('industryType')).trim() : '',
        interestedProduct: idx('interestedProduct') >= 0 ? readCell(row, idx('interestedProduct')).trim() : '',
        painPoint: idx('painPoint') >= 0 ? readCell(row, idx('painPoint')).trim() : '',
        documentLink: idx('documentLink') >= 0 ? readCell(row, idx('documentLink')).trim() : '',
        nextFollowUpAt: idx('nextFollowUpAt') >= 0 ? readCell(row, idx('nextFollowUpAt')).trim() : '',
        followUpNotes: idx('followUpNotes') >= 0 ? readCell(row, idx('followUpNotes')).trim() : ''
      }

      rows.push(entry)
    })

    const data = await this.importEntries({ userId, entries: rows })
    return data
  }
}

module.exports = new CrmFbEnquiryService()
