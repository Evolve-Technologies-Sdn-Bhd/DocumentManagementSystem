const prisma = require('../config/database')
const { BadRequestError, NotFoundError } = require('../utils/errors')

class CrmFbEnquiryService {
  getAllowedStatuses() {
    return ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTATION_PROVIDED', 'CONVERTED']
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
        { location: { contains: search, mode: 'insensitive' } },
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
        Number(countByStatus.QUALIFIED || 0) +
        Number(countByStatus.QUOTATION_PROVIDED || 0),
      converted: Number(countByStatus.CONVERTED || 0),
      totalPotentialValueCents: Number(aggregate._sum?.potentialValueCents || 0)
    }
  }

  async create({ userId, payload }) {
    const name = String(payload?.name || '').trim()
    if (!name) {
      throw new BadRequestError('name is required')
    }

    const data = {
      name,
      enquiryDate: this.normalizeDate(payload?.enquiryDate),
      email: this.normalizeOptionalEmail(payload?.email),
      company: this.normalizeOptionalText(payload?.company),
      contact: this.normalizeOptionalText(payload?.contact),
      location: this.normalizeOptionalText(payload?.location),
      channel: await this.normalizeLookupValue(payload?.channel, 'channel', 'channels'),
      industryType: await this.normalizeLookupValue(payload?.industryType, 'industryType', 'industryTypes'),
      interestedProduct: this.normalizeOptionalText(payload?.interestedProduct),
      painPoint: this.normalizeOptionalText(payload?.painPoint),
      status: this.normalizeStatus(payload?.status || 'NEW'),
      potentialValueCents: this.normalizeCents(payload?.potentialValueCents ?? 0, 'potentialValueCents'),
      documentLink: this.normalizeOptionalUrl(payload?.documentLink),
      followUpNotes: this.normalizeOptionalText(payload?.followUpNotes),
      createdById: userId
    }

    const entry = await prisma.crmFbEnquiryEntry.create({ data })
    return { entry }
  }

  async update({ id, payload }) {
    const entryId = Number(id)
    if (!entryId) {
      throw new BadRequestError('invalid id')
    }

    const existing = await prisma.crmFbEnquiryEntry.findUnique({ where: { id: entryId } })
    if (!existing) {
      throw new NotFoundError('FB enquiry entry not found')
    }

    const name = payload?.name !== undefined ? String(payload.name || '').trim() : undefined
    if (name === '') {
      throw new BadRequestError('name is required')
    }

    const data = {}
    if (name !== undefined) data.name = name
    if (payload?.enquiryDate !== undefined) data.enquiryDate = this.normalizeDate(payload.enquiryDate)
    if (payload?.email !== undefined) data.email = this.normalizeOptionalEmail(payload.email)
    if (payload?.company !== undefined) data.company = this.normalizeOptionalText(payload.company)
    if (payload?.contact !== undefined) data.contact = this.normalizeOptionalText(payload.contact)
    if (payload?.location !== undefined) data.location = this.normalizeOptionalText(payload.location)
    if (payload?.channel !== undefined) data.channel = await this.normalizeLookupValue(payload.channel, 'channel', 'channels')
    if (payload?.industryType !== undefined) data.industryType = await this.normalizeLookupValue(payload.industryType, 'industryType', 'industryTypes')
    if (payload?.interestedProduct !== undefined) data.interestedProduct = this.normalizeOptionalText(payload.interestedProduct)
    if (payload?.painPoint !== undefined) data.painPoint = this.normalizeOptionalText(payload.painPoint)
    if (payload?.status !== undefined) data.status = this.normalizeStatus(payload.status)
    if (payload?.potentialValueCents !== undefined) data.potentialValueCents = this.normalizeCents(payload.potentialValueCents, 'potentialValueCents')
    if (payload?.documentLink !== undefined) data.documentLink = this.normalizeOptionalUrl(payload.documentLink)
    if (payload?.followUpNotes !== undefined) data.followUpNotes = this.normalizeOptionalText(payload.followUpNotes)

    const entry = await prisma.crmFbEnquiryEntry.update({
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

    const prepared = (await Promise.all(entries
      .map(async (row) => {
        const name = String(row?.name || '').trim()
        if (!name) return null
        return {
          name,
          enquiryDate: this.normalizeDate(row?.enquiryDate),
          email: this.normalizeOptionalEmail(row?.email),
          company: this.normalizeOptionalText(row?.company),
          contact: this.normalizeOptionalText(row?.contact),
          location: this.normalizeOptionalText(row?.location),
          channel: await this.normalizeLookupValue(row?.channel, 'channel', 'channels'),
          industryType: await this.normalizeLookupValue(row?.industryType, 'industryType', 'industryTypes'),
          interestedProduct: this.normalizeOptionalText(row?.interestedProduct),
          painPoint: this.normalizeOptionalText(row?.painPoint),
          status: this.normalizeStatus(row?.status || 'NEW'),
          potentialValueCents: this.normalizeCents(row?.potentialValueCents ?? 0, 'potentialValueCents'),
          documentLink: this.normalizeOptionalUrl(row?.documentLink),
          followUpNotes: this.normalizeOptionalText(row?.followUpNotes),
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
      'Location',
      'Channel',
      'Industry Type',
      'Interested Product / Service',
      'Pain Point / Customer Need',
      'Status',
      'Potential Value (RM)',
      'Documents (Link / Reference)',
      'Follow-up Notes'
    ]]

    records.forEach((r) => {
      rows.push([
        escape(new Date(r.enquiryDate).toISOString().split('T')[0]),
        escape(r.name),
        escape(r.email || ''),
        escape(r.company || ''),
        escape(r.contact || ''),
        escape(r.location || ''),
        escape(r.channel || ''),
        escape(r.industryType || ''),
        escape(r.interestedProduct || ''),
        escape(r.painPoint || ''),
        escape(r.status),
        escape(((Number(r.potentialValueCents || 0)) / 100).toFixed(2)),
        escape(r.documentLink || ''),
        escape(r.followUpNotes || '')
      ])
    })

    return rows.map((row) => row.join(',')).join('\n')
  }

  async exportCsv(query = {}) {
    const { search, status } = this.normalizeListQuery(query)
    const where = this.buildWhere({ search, status })

    const records = await prisma.crmFbEnquiryEntry.findMany({
      where,
      orderBy: [{ enquiryDate: 'desc' }, { createdAt: 'desc' }]
    })

    const csv = this.buildCsv(records)
    return { csv }
  }
}

module.exports = new CrmFbEnquiryService()
