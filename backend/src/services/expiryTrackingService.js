const prisma = require('../config/database')
const configService = require('./configService')
const fileStorageService = require('./fileStorageService')
const notificationService = require('./notificationService')
const DocumentNumbering = require('../utils/documentNumbering')
const path = require('path')
const { BadRequestError, NotFoundError } = require('../utils/errors')

const REMINDER_LEVEL_CONFIG = [
  { key: 'reminder1', level: 'REMINDER_1', daysField: 'reminder1Days', sentAtField: 'lastReminder1SentAt' },
  { key: 'reminder2', level: 'REMINDER_2', daysField: 'reminder2Days', sentAtField: 'lastReminder2SentAt' },
  { key: 'reminder3', level: 'REMINDER_3', daysField: 'reminder3Days', sentAtField: 'lastReminder3SentAt' },
  { key: 'reminder4', level: 'REMINDER_4', daysField: 'reminder4Days', sentAtField: 'lastReminder4SentAt' }
]

class ExpiryTrackingService {
  formatUserDisplay(user) {
    if (!user) return ''
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || ''
  }

  normalizeReminderRecipientInput(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null

    const normalized = {}
    for (const config of REMINDER_LEVEL_CONFIG) {
      const rawValues = input[config.key]
      const cleaned = Array.isArray(rawValues)
        ? Array.from(
            new Set(
              rawValues
                .map((value) => parseInt(value, 10))
                .filter((value) => Number.isFinite(value) && value > 0)
            )
          )
        : []
      normalized[config.key] = cleaned
    }

    return normalized
  }

  formatRecipientUser(user) {
    if (!user || user.status !== 'ACTIVE') return null
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      department: user.department || null
    }
  }

  buildReminderRecipientMap(reminderRecipients = []) {
    const grouped = Object.fromEntries(REMINDER_LEVEL_CONFIG.map((config) => [config.key, []]))

    for (const entry of Array.isArray(reminderRecipients) ? reminderRecipients : []) {
      const user = this.formatRecipientUser(entry?.user)
      const config = REMINDER_LEVEL_CONFIG.find((item) => item.level === entry?.reminderLevel)
      if (!user || !config) continue
      grouped[config.key].push(user)
    }

    for (const config of REMINDER_LEVEL_CONFIG) {
      grouped[config.key].sort((a, b) => this.formatUserDisplay(a).localeCompare(this.formatUserDisplay(b)))
    }

    return grouped
  }

  async syncReminderRecipients(expiryProfileId, reminderRecipientsInput, ownerId, userId) {
    const normalized = this.normalizeReminderRecipientInput(reminderRecipientsInput)
    if (!normalized) return

    const requestedIds = Array.from(
      new Set(
        REMINDER_LEVEL_CONFIG.flatMap((config) => normalized[config.key] || [])
          .filter((id) => (ownerId ? id !== ownerId : true))
      )
    )

    const allowedUsers = requestedIds.length > 0
      ? await prisma.user.findMany({
          where: {
            id: { in: requestedIds },
            status: 'ACTIVE'
          },
          select: { id: true }
        })
      : []

    const allowedIds = new Set(allowedUsers.map((user) => user.id))
    const finalEntries = REMINDER_LEVEL_CONFIG.flatMap((config) =>
      (normalized[config.key] || [])
        .filter((id) => allowedIds.has(id) && (ownerId ? id !== ownerId : true))
        .map((id) => ({
          expiryProfileId,
          reminderLevel: config.level,
          userId: id,
          createdById: userId || null
        }))
    )

    await prisma.$transaction([
      prisma.documentExpiryReminderRecipient.deleteMany({
        where: { expiryProfileId }
      }),
      ...(finalEntries.length > 0
        ? [
            prisma.documentExpiryReminderRecipient.createMany({
              data: finalEntries,
              skipDuplicates: true
            })
          ]
        : [])
    ])
  }

  startOfDay(value = new Date()) {
    const date = new Date(value)
    date.setHours(0, 0, 0, 0)
    return date
  }

  normalizeDate(value) {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestError('Invalid date value')
    }
    return this.startOfDay(date)
  }

  getDaysLeft(expiryDate) {
    if (!expiryDate) return null
    const today = this.startOfDay(new Date())
    const target = this.startOfDay(expiryDate)
    return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  }

  getReminderWindowStart(expiryDate, thresholdDays) {
    const target = this.startOfDay(expiryDate)
    const threshold = Math.max(0, parseInt(thresholdDays, 10) || 0)
    const start = new Date(target)
    start.setDate(start.getDate() - threshold)
    return this.startOfDay(start)
  }

  async processStatusAndRemindersForDocument(documentId) {
    const profile = await prisma.documentExpiryProfile.findUnique({
      where: { documentId: parseInt(documentId, 10) },
      include: {
        document: {
          include: {
            owner: {
              select: {
                id: true,
                status: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            versions: {
              select: {
                fileName: true,
                uploadedAt: true
              },
              orderBy: { uploadedAt: 'desc' },
              take: 1
            }
          }
        },
        watchers: {
          include: {
            user: {
              select: {
                id: true,
                status: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        reminderRecipients: {
          include: {
            user: {
              select: {
                id: true,
                status: true,
                firstName: true,
                lastName: true,
                email: true,
                department: true
              }
            }
          },
          orderBy: [
            { reminderLevel: 'asc' },
            { createdAt: 'asc' }
          ]
        }
      }
    })

    if (!profile || !profile.trackingEnabled || !profile.expiryDate) return
    await this.processProfileStatusAndReminders(profile)
  }

  queueImmediateReminderProcessing(documentId) {
    setImmediate(async () => {
      try {
        await this.processStatusAndRemindersForDocument(documentId)
      } catch (error) {
        console.error('Expiry tracking immediate processor failed:', error)
      }
    })
  }

  calculateExpiryStatus(expiryDate, expiringSoonDays) {
    if (!expiryDate) return 'ACTIVE'
    const today = this.startOfDay(new Date())
    const target = this.startOfDay(expiryDate)

    if (today.getTime() > target.getTime()) return 'EXPIRED'
    if (today.getTime() === target.getTime()) return 'EXPIRING_TODAY'

    const thresholdDate = new Date(target)
    thresholdDate.setDate(thresholdDate.getDate() - Math.max(0, parseInt(expiringSoonDays, 10) || 0))

    if (today.getTime() >= thresholdDate.getTime()) return 'EXPIRING_SOON'
    return 'ACTIVE'
  }

  incrementVersion(version) {
    const raw = String(version || '1.0').trim()
    const [majorRaw, minorRaw] = raw.split('.')
    const major = parseInt(majorRaw, 10)
    const minor = parseInt(minorRaw || '0', 10)

    if (!Number.isFinite(major)) return '2.0'
    return `${major + 1}.${Number.isFinite(minor) ? minor : 0}`
  }

  async incrementFileCodeVersion(fileCode) {
    const raw = String(fileCode || '').trim()
    if (!raw) return null

    const settings = await DocumentNumbering.loadSettings()
    if (!settings?.includeVersion) return null

    const separator = settings.separator || '/'
    const parts = raw.split(separator)
    if (parts.length < 3) return null

    const dateIncluded = Boolean(settings?.dateFormat && settings.dateFormat !== 'none')
    const expectedWithoutCategory = 1 + 1 + (dateIncluded ? 1 : 0) + 1
    const hasCategory = Boolean(settings?.includeProjectCategoryCode && parts.length > expectedWithoutCategory)
    const versionIndex = hasCategory ? 2 : 1

    const currentVersion = parseInt(parts[versionIndex], 10)
    if (!Number.isFinite(currentVersion)) return null

    const versionDigits = parseInt(settings.versionDigits, 10) || 2
    parts[versionIndex] = String(currentVersion + 1).padStart(versionDigits, '0')
    return parts.join(separator)
  }

  async getSettingsSnapshot(overrides = {}, fallback = null) {
    const settings = await configService.getExpiryTrackingSettings()
    const base = (fallback && typeof fallback === 'object') ? fallback : settings
    const pick = (key) => {
      const value = overrides?.[key]
      const fallbackValue = base?.[key]
      const parsedFallback = parseInt(fallbackValue, 10)
      if (value === undefined || value === null || value === '') {
        return Number.isFinite(parsedFallback) ? parsedFallback : settings[key]
      }
      const parsed = parseInt(value, 10)
      if (Number.isFinite(parsed) && parsed >= 0) return parsed
      return Number.isFinite(parsedFallback) ? parsedFallback : settings[key]
    }

    return {
      expiringSoonDays: pick('expiringSoonDays'),
      reminder1Days: pick('reminder1Days'),
      reminder2Days: pick('reminder2Days'),
      reminder3Days: pick('reminder3Days'),
      reminder4Days: pick('reminder4Days')
    }
  }

  async getCompanyNameSnapshot() {
    try {
      const companyInfo = await configService.getCompanyInfo()
      return companyInfo?.companyName || null
    } catch {
      return null
    }
  }

  async getDocumentContext(documentId) {
    const document = await prisma.document.findUnique({
      where: { id: parseInt(documentId, 10) },
      include: {
        documentType: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true
          }
        },
        folder: {
          select: {
            id: true,
            name: true
          }
        },
        versions: {
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
          take: 1
        },
        expiryProfile: true
      }
    })

    if (!document) {
      throw new NotFoundError('Document')
    }

    return document
  }

  async buildProfileData(document, input = {}, userId, existingProfile = null) {
    const trackingEnabled = input.trackingEnabled !== undefined
      ? Boolean(input.trackingEnabled)
      : existingProfile?.trackingEnabled ?? Boolean(document.documentType?.requiresExpiryTracking)

    const settings = await this.getSettingsSnapshot(input, existingProfile)
    const startDate = input.startDate !== undefined
      ? this.normalizeDate(input.startDate)
      : existingProfile?.startDate || this.normalizeDate(document.publishedAt || new Date())
    const expiryDate = input.expiryDate !== undefined
      ? this.normalizeDate(input.expiryDate)
      : existingProfile?.expiryDate || null

    if (trackingEnabled && !expiryDate) {
      throw new BadRequestError('Expiry date is required when expiry tracking is enabled')
    }

    if (trackingEnabled && startDate && expiryDate && expiryDate.getTime() < startDate.getTime()) {
      throw new BadRequestError('Expiry date cannot be earlier than start date')
    }

    const expiryStatus = trackingEnabled
      ? this.calculateExpiryStatus(expiryDate, settings.expiringSoonDays)
      : existingProfile?.expiryStatus || 'ACTIVE'

    const ownerName = document.owner
      ? `${document.owner.firstName || ''} ${document.owner.lastName || ''}`.trim() || document.owner.email || ''
      : ''
    const companySnapshot = await this.getCompanyNameSnapshot()

    return {
      trackingEnabled,
      startDate,
      expiryDate,
      expiryStatus,
      renewalStatus: input.renewalStatus || existingProfile?.renewalStatus || 'NOT_STARTED',
      expiringSoonDays: settings.expiringSoonDays,
      reminder1Days: settings.reminder1Days,
      reminder2Days: settings.reminder2Days,
      reminder3Days: settings.reminder3Days,
      reminder4Days: settings.reminder4Days,
      remarks: input.remarks !== undefined ? input.remarks : (existingProfile?.remarks || null),
      companySnapshot,
      departmentSnapshot: document.owner?.department || null,
      folderSnapshotName: document.folder?.name || null,
      currentVersionSnapshot: document.version,
      trackingDisabledAt: trackingEnabled ? null : (existingProfile?.trackingDisabledAt || new Date()),
      trackingDisabledBy: trackingEnabled ? null : userId,
      trackingDisabledReason: trackingEnabled ? null : (input.trackingDisabledReason || existingProfile?.trackingDisabledReason || null),
      createdBy: existingProfile?.createdBy || userId,
      updatedBy: userId,
      ownerName
    }
  }

  async syncProfileFromDocument(documentId, input = {}, userId) {
    const document = await this.getDocumentContext(documentId)
    const existingProfile = document.expiryProfile
    const profileData = await this.buildProfileData(document, input, userId, existingProfile)
    const reminderRecipientsInput = this.normalizeReminderRecipientInput(input.reminderRecipients)

    if (!profileData.trackingEnabled && !existingProfile) {
      return null
    }

    const shouldResetReminders = (() => {
      if (!existingProfile) return false
      if (!existingProfile.trackingEnabled && profileData.trackingEnabled) return true
      const prevExpiry = existingProfile.expiryDate ? this.startOfDay(existingProfile.expiryDate).getTime() : null
      const nextExpiry = profileData.expiryDate ? this.startOfDay(profileData.expiryDate).getTime() : null
      return prevExpiry !== nextExpiry
    })()

    const saved = existingProfile
      ? await prisma.documentExpiryProfile.update({
          where: { documentId: document.id },
          data: {
            trackingEnabled: profileData.trackingEnabled,
            startDate: profileData.startDate,
            expiryDate: profileData.expiryDate,
            expiryStatus: profileData.expiryStatus,
            renewalStatus: profileData.renewalStatus,
            expiringSoonDays: profileData.expiringSoonDays,
            reminder1Days: profileData.reminder1Days,
            reminder2Days: profileData.reminder2Days,
            reminder3Days: profileData.reminder3Days,
            reminder4Days: profileData.reminder4Days,
            remarks: profileData.remarks,
            companySnapshot: profileData.companySnapshot,
            departmentSnapshot: profileData.departmentSnapshot,
            folderSnapshotName: profileData.folderSnapshotName,
            currentVersionSnapshot: profileData.currentVersionSnapshot,
            trackingDisabledAt: profileData.trackingDisabledAt,
            trackingDisabledBy: profileData.trackingDisabledBy,
            trackingDisabledReason: profileData.trackingDisabledReason,
            ...(shouldResetReminders ? {
              lastReminder1SentAt: null,
              lastReminder2SentAt: null,
              lastReminder3SentAt: null,
              lastReminder4SentAt: null
            } : {}),
            updatedBy: profileData.updatedBy
          }
        })
      : await prisma.documentExpiryProfile.create({
          data: {
            documentId: document.id,
            trackingEnabled: profileData.trackingEnabled,
            startDate: profileData.startDate,
            expiryDate: profileData.expiryDate,
            expiryStatus: profileData.expiryStatus,
            renewalStatus: profileData.renewalStatus,
            expiringSoonDays: profileData.expiringSoonDays,
            reminder1Days: profileData.reminder1Days,
            reminder2Days: profileData.reminder2Days,
            reminder3Days: profileData.reminder3Days,
            reminder4Days: profileData.reminder4Days,
            remarks: profileData.remarks,
            companySnapshot: profileData.companySnapshot,
            departmentSnapshot: profileData.departmentSnapshot,
            folderSnapshotName: profileData.folderSnapshotName,
            currentVersionSnapshot: profileData.currentVersionSnapshot,
            createdBy: profileData.createdBy,
            updatedBy: profileData.updatedBy
          }
        })

    if (reminderRecipientsInput) {
      await this.syncReminderRecipients(saved.id, reminderRecipientsInput, document.owner?.id || document.ownerId || null, userId)
    }

    if (profileData.trackingEnabled && profileData.expiryDate) {
      this.queueImmediateReminderProcessing(saved.documentId)
    }

    return this.getProfile(saved.documentId)
  }

  formatProfile(profile) {
    const computedStatus = profile.trackingEnabled
      ? this.calculateExpiryStatus(profile.expiryDate, profile.expiringSoonDays)
      : profile.expiryStatus
    const daysLeft = profile.trackingEnabled ? this.getDaysLeft(profile.expiryDate) : null
    const ownerName = profile.document?.owner
      ? `${profile.document.owner.firstName || ''} ${profile.document.owner.lastName || ''}`.trim() || profile.document.owner.email || ''
      : null
    const reminderRecipientMap = this.buildReminderRecipientMap(profile.reminderRecipients)

    return {
      id: profile.id,
      documentId: profile.documentId,
      trackingEnabled: profile.trackingEnabled,
      startDate: profile.startDate,
      expiryDate: profile.expiryDate,
      expiryStatus: computedStatus,
      renewalStatus: profile.renewalStatus,
      daysLeft,
      remarks: profile.remarks,
      expiringSoonDays: profile.expiringSoonDays,
      reminderRule: {
        reminder1Days: profile.reminder1Days,
        reminder2Days: profile.reminder2Days,
        reminder3Days: profile.reminder3Days,
        reminder4Days: profile.reminder4Days,
        reminder1Recipients: reminderRecipientMap.reminder1,
        reminder2Recipients: reminderRecipientMap.reminder2,
        reminder3Recipients: reminderRecipientMap.reminder3,
        reminder4Recipients: reminderRecipientMap.reminder4
      },
      company: profile.companySnapshot,
      department: profile.departmentSnapshot || profile.document?.owner?.department || null,
      folder: profile.folderSnapshotName || profile.document?.folder?.name || null,
      currentVersion: profile.currentVersionSnapshot || profile.document?.version || null,
      trackingDisabledAt: profile.trackingDisabledAt,
      trackingDisabledReason: profile.trackingDisabledReason,
      document: profile.document ? {
        id: profile.document.id,
        fileCode: profile.document.fileCode,
        title: profile.document.title,
        version: profile.document.version,
        status: profile.document.status,
        ownerId: profile.document.ownerId,
        ownerName,
        documentTypeId: profile.document.documentTypeId,
        documentType: profile.document.documentType?.name || null,
        requiresExpiryTracking: Boolean(profile.document.documentType?.requiresExpiryTracking),
        allowRenewal: Boolean(profile.document.documentType?.allowRenewal),
        fileName: profile.document.versions?.[0]?.fileName || null,
        folderName: profile.document.folder?.name || null,
        updatedAt: profile.document.updatedAt
      } : null,
      watchers: Array.isArray(profile.watchers)
        ? profile.watchers
            .map((w) => w?.user)
            .filter((u) => u && u.status === 'ACTIVE')
            .map((u) => ({
              id: u.id,
              firstName: u.firstName,
              lastName: u.lastName,
              email: u.email,
              department: u.department
            }))
        : [],
      renewalHistory: Array.isArray(profile.renewalHistory) ? profile.renewalHistory.map((entry) => ({
        id: entry.id,
        fromVersion: entry.fromVersion,
        toVersion: entry.toVersion,
        previousExpiryDate: entry.previousExpiryDate,
        newExpiryDate: entry.newExpiryDate,
        renewalStatusBefore: entry.renewalStatusBefore,
        renewalStatusAfter: entry.renewalStatusAfter,
        renewedBy: entry.renewedBy,
        renewedAt: entry.renewedAt,
        remarks: entry.remarks,
        fileName: entry.documentVersion?.fileName || null
      })) : []
    }
  }

  buildListWhere(filters = {}) {
    const and = []
    const includeDisabled = String(filters.includeDisabled || '').toLowerCase() === 'true'

    if (!includeDisabled) {
      and.push({ trackingEnabled: true })
    }

    if (filters.expiryStatus) {
      and.push({ expiryStatus: String(filters.expiryStatus).toUpperCase() })
    }

    if (filters.renewalStatus) {
      and.push({ renewalStatus: String(filters.renewalStatus).toUpperCase() })
    }

    if (filters.company) {
      and.push({ companySnapshot: { contains: String(filters.company), mode: 'insensitive' } })
    }

    if (filters.expiryDateFrom || filters.expiryDateTo) {
      const expiryDate = {}
      if (filters.expiryDateFrom) expiryDate.gte = this.normalizeDate(filters.expiryDateFrom)
      if (filters.expiryDateTo) expiryDate.lte = this.normalizeDate(filters.expiryDateTo)
      and.push({ expiryDate })
    }

    const documentWhere = {}
    if (filters.ownerId) documentWhere.ownerId = parseInt(filters.ownerId, 10)
    if (filters.documentTypeId) documentWhere.documentTypeId = parseInt(filters.documentTypeId, 10)
    if (filters.department) {
      documentWhere.owner = {
        department: { contains: String(filters.department), mode: 'insensitive' }
      }
    }

    if (Object.keys(documentWhere).length > 0) {
      and.push({ document: documentWhere })
    }

    if (filters.search) {
      const keyword = String(filters.search).trim()
      and.push({
        OR: [
          { document: { title: { contains: keyword, mode: 'insensitive' } } },
          { document: { fileCode: { contains: keyword, mode: 'insensitive' } } }
        ]
      })
    }

    return and.length > 0 ? { AND: and } : {}
  }

  async listProfiles(filters = {}, pagination = {}) {
    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const limit = Math.max(1, Math.min(100, parseInt(pagination.limit, 10) || 15))
    const where = this.buildListWhere(filters)

    const [total, profiles] = await Promise.all([
      prisma.documentExpiryProfile.count({ where }),
      prisma.documentExpiryProfile.findMany({
        where,
        include: {
          document: {
            include: {
              documentType: true,
              owner: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  department: true
                }
              },
              folder: {
                select: {
                  id: true,
                  name: true
                }
              },
              versions: {
                orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
                take: 1
              }
            }
          },
          renewalHistory: {
            include: {
              documentVersion: {
                select: {
                  id: true,
                  fileName: true
                }
              }
            },
            orderBy: { renewedAt: 'desc' }
          },
          reminderRecipients: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  department: true,
                  status: true
                }
              }
            },
            orderBy: [
              { reminderLevel: 'asc' },
              { createdAt: 'asc' }
            ]
          }
        },
        orderBy: [
          { expiryDate: 'asc' },
          { updatedAt: 'desc' }
        ],
        skip: (page - 1) * limit,
        take: limit
      })
    ])

    return {
      records: profiles.map((profile) => this.formatProfile(profile)),
      pagination: {
        page,
        limit,
        total
      }
    }
  }

  async getDashboard(filters = {}) {
    const result = await this.listProfiles(filters, { page: 1, limit: 5000 })
    const dashboard = {
      totalTrackedDocuments: 0,
      active: 0,
      expiringSoon: 0,
      expiringToday: 0,
      expired: 0,
      renewalInProgress: 0
    }

    for (const record of result.records) {
      if (!record.trackingEnabled) continue
      dashboard.totalTrackedDocuments += 1
      if (record.expiryStatus === 'ACTIVE') dashboard.active += 1
      if (record.expiryStatus === 'EXPIRING_SOON') dashboard.expiringSoon += 1
      if (record.expiryStatus === 'EXPIRING_TODAY') dashboard.expiringToday += 1
      if (record.expiryStatus === 'EXPIRED') dashboard.expired += 1
      if (record.renewalStatus === 'IN_PROGRESS') dashboard.renewalInProgress += 1
    }

    return dashboard
  }

  async getProfile(documentId) {
    const profile = await prisma.documentExpiryProfile.findUnique({
      where: { documentId: parseInt(documentId, 10) },
      include: {
        document: {
          include: {
            documentType: true,
            owner: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                department: true
              }
            },
            folder: {
              select: {
                id: true,
                name: true
              }
            },
            versions: {
              orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
              take: 1
            }
          }
        },
        watchers: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                department: true,
                status: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        },
        reminderRecipients: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                department: true,
                status: true
              }
            }
          },
          orderBy: [
            { reminderLevel: 'asc' },
            { createdAt: 'asc' }
          ]
        },
        renewalHistory: {
          include: {
            documentVersion: {
              select: {
                id: true,
                fileName: true
              }
            }
          },
          orderBy: { renewedAt: 'desc' }
        }
      }
    })

    if (!profile) {
      throw new NotFoundError('Expiry profile')
    }

    return this.formatProfile(profile)
  }

  async updateProfile(documentId, input = {}, userId) {
    const existing = await prisma.documentExpiryProfile.findUnique({
      where: { documentId: parseInt(documentId, 10) }
    })

    if (!existing) {
      return this.syncProfileFromDocument(documentId, input, userId)
    }

    return this.syncProfileFromDocument(documentId, input, userId)
  }

  async applyGlobalSettingsToExistingProfiles(userId) {
    const settings = await configService.getExpiryTrackingSettings()
    const profiles = await prisma.documentExpiryProfile.findMany({
      select: {
        id: true,
        documentId: true,
        trackingEnabled: true,
        expiryDate: true,
        expiryStatus: true,
        updatedBy: true
      }
    })

    if (profiles.length === 0) {
      return {
        updatedCount: 0,
        settings
      }
    }

    await prisma.$transaction(
      profiles.map((profile) => prisma.documentExpiryProfile.update({
        where: { id: profile.id },
        data: {
          expiringSoonDays: settings.expiringSoonDays,
          reminder1Days: settings.reminder1Days,
          reminder2Days: settings.reminder2Days,
          reminder3Days: settings.reminder3Days,
          reminder4Days: settings.reminder4Days,
          expiryStatus: profile.trackingEnabled
            ? this.calculateExpiryStatus(profile.expiryDate, settings.expiringSoonDays)
            : profile.expiryStatus,
          lastReminder1SentAt: null,
          lastReminder2SentAt: null,
          lastReminder3SentAt: null,
          lastReminder4SentAt: null,
          updatedBy: userId || profile.updatedBy || null
        }
      }))
    )

    return {
      updatedCount: profiles.length,
      settings
    }
  }

  async setTrackingEnabled(documentId, enabled, input = {}, userId) {
    if (enabled) {
      return this.syncProfileFromDocument(documentId, { ...input, trackingEnabled: true }, userId)
    }

    const existing = await prisma.documentExpiryProfile.findUnique({
      where: { documentId: parseInt(documentId, 10) }
    })

    if (!existing) {
      throw new NotFoundError('Expiry profile')
    }

    await prisma.documentExpiryProfile.update({
      where: { documentId: parseInt(documentId, 10) },
      data: {
        trackingEnabled: false,
        trackingDisabledAt: new Date(),
        trackingDisabledBy: userId,
        trackingDisabledReason: input.reason || null,
        updatedBy: userId
      }
    })

    return this.getProfile(documentId)
  }

  async listWatchers(documentId) {
    const profile = await prisma.documentExpiryProfile.findUnique({
      where: { documentId: parseInt(documentId, 10) },
      select: {
        id: true,
        document: {
          select: {
            ownerId: true
          }
        },
        watchers: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                department: true,
                status: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!profile) {
      throw new NotFoundError('Expiry profile')
    }

    const watchers = Array.isArray(profile.watchers)
      ? profile.watchers.map((w) => w?.user).filter((u) => u && u.status === 'ACTIVE')
      : []

    return {
      ownerId: profile.document?.ownerId || null,
      watchers: watchers.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        department: u.department
      }))
    }
  }

  async updateWatchers(documentId, watcherIds = [], userId) {
    const profile = await prisma.documentExpiryProfile.findUnique({
      where: { documentId: parseInt(documentId, 10) },
      select: {
        id: true,
        document: {
          select: {
            ownerId: true
          }
        }
      }
    })

    if (!profile) {
      throw new NotFoundError('Expiry profile')
    }

    const ownerId = profile.document?.ownerId || null
    const rawIds = Array.isArray(watcherIds) ? watcherIds : []
    const cleaned = rawIds
      .map((v) => parseInt(v, 10))
      .filter((v) => Number.isFinite(v) && v > 0)
      .filter((v) => (ownerId ? v !== ownerId : true))
    const uniqueIds = Array.from(new Set(cleaned))

    const allowedUsers = await prisma.user.findMany({
      where: {
        id: { in: uniqueIds },
        status: 'ACTIVE'
      },
      select: { id: true }
    })

    const allowedIds = new Set(allowedUsers.map((u) => u.id))
    const finalIds = uniqueIds.filter((id) => allowedIds.has(id))

    const existing = await prisma.documentExpiryWatcher.findMany({
      where: { expiryProfileId: profile.id },
      select: { userId: true }
    })

    const existingIds = new Set(existing.map((w) => w.userId))
    const finalSet = new Set(finalIds)

    const toCreate = finalIds.filter((id) => !existingIds.has(id))
    const toDelete = Array.from(existingIds).filter((id) => !finalSet.has(id))

    await prisma.$transaction([
      prisma.documentExpiryWatcher.deleteMany({
        where: {
          expiryProfileId: profile.id,
          userId: { in: toDelete }
        }
      }),
      prisma.documentExpiryWatcher.createMany({
        data: toCreate.map((id) => ({
          expiryProfileId: profile.id,
          userId: id,
          createdById: userId || null
        })),
        skipDuplicates: true
      })
    ])

    return this.getProfile(documentId)
  }

  async startRenewal(documentId, input = {}, userId) {
    const existing = await prisma.documentExpiryProfile.findUnique({
      where: { documentId: parseInt(documentId, 10) }
    })

    if (!existing) {
      throw new NotFoundError('Expiry profile')
    }

    await prisma.documentExpiryProfile.update({
      where: { documentId: parseInt(documentId, 10) },
      data: {
        renewalStatus: 'IN_PROGRESS',
        remarks: input.remarks !== undefined ? input.remarks : existing.remarks,
        updatedBy: userId
      }
    })

    const document = await this.getDocumentContext(documentId)
    await notificationService.sendNotification(
      document.ownerId,
      'renewalInProgress',
      'Renewal In Progress',
      `Renewal has started for document "${document.title}" (${document.fileCode}).`,
      '/expiry-tracking',
      {
        subject: `Renewal In Progress - ${document.fileCode || 'DMS'}`,
        title: document.title,
        fileCode: document.fileCode,
        message: `Renewal has started for document "${document.title}" (${document.fileCode}).`,
        link: notificationService.buildAbsoluteLink('/expiry-tracking')
      }
    )

    return this.getProfile(documentId)
  }

  async rejectRenewal(documentId, input = {}, userId) {
    const existing = await prisma.documentExpiryProfile.findUnique({
      where: { documentId: parseInt(documentId, 10) }
    })

    if (!existing) {
      throw new NotFoundError('Expiry profile')
    }

    await prisma.documentExpiryProfile.update({
      where: { documentId: parseInt(documentId, 10) },
      data: {
        renewalStatus: 'REJECTED',
        remarks: input.remarks !== undefined ? input.remarks : existing.remarks,
        updatedBy: userId
      }
    })

    return this.getProfile(documentId)
  }

  async createPublishedVersion(document, file, nextVersion, userId) {
    await prisma.documentVersion.updateMany({
      where: {
        documentId: document.id,
        isPublished: true
      },
      data: {
        isPublished: false
      }
    })

    const { absolutePath } = fileStorageService.getDocumentPath(document.fileCode, document.projectCategoryId || null)
    const fileName = fileStorageService.generateUniqueFileName(file.originalname)
    const finalPath = await fileStorageService.saveFile(file, absolutePath, fileName)

    const encryptionService = require('./encryptionService')
    const isEncryptionEnabled = await encryptionService.isEncryptionEnabled()
    const version = await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        version: nextVersion,
        filePath: finalPath,
        fileName: file.displayName || file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedById: userId,
        isPublished: true,
        isEncrypted: false
      }
    })

    if (isEncryptionEnabled) {
      const documentService = require('./documentService')
      documentService.queueDocumentVersionEncryption(version.id, finalPath)
    }

    return version
  }

  async completeRenewal(documentId, file, input = {}, userId) {
    if (!file) {
      throw new BadRequestError('Renewal file is required')
    }

    const document = await this.getDocumentContext(documentId)
    const profile = document.expiryProfile

    if (!profile) {
      throw new NotFoundError('Expiry profile')
    }

    if (!profile.trackingEnabled) {
      throw new BadRequestError('Expiry tracking is disabled for this document')
    }

    const newExpiryDate = this.normalizeDate(input.newExpiryDate || input.expiryDate)
    if (!newExpiryDate) {
      throw new BadRequestError('New expiry date is required')
    }

    const nextVersion = this.incrementVersion(document.version)
    const oldFileCode = document.fileCode
    const nextFileCode = (await this.incrementFileCodeVersion(oldFileCode)) || oldFileCode
    const shouldUpdateFileCode = Boolean(nextFileCode && oldFileCode && nextFileCode !== oldFileCode)

    if (shouldUpdateFileCode) {
      const movedDirectories = await fileStorageService.renameDocumentDirectories(oldFileCode, nextFileCode, document.projectCategoryId || null)
      if (movedDirectories.length > 0) {
        const versions = await prisma.documentVersion.findMany({
          where: { documentId: document.id },
          select: { id: true, filePath: true }
        })

        for (const version of versions) {
          if (!version?.filePath) continue
          let updatedPath = version.filePath

          for (const moved of movedDirectories) {
            const oldPrefix = moved.oldPath + path.sep
            if (updatedPath === moved.oldPath) {
              updatedPath = moved.newPath
              break
            }
            if (updatedPath.startsWith(oldPrefix)) {
              updatedPath = moved.newPath + updatedPath.slice(moved.oldPath.length)
              break
            }
          }

          if (updatedPath !== version.filePath) {
            await prisma.documentVersion.update({
              where: { id: version.id },
              data: { filePath: updatedPath }
            })
          }
        }
      }
    }

    const renewedAt = new Date()
    document.fileCode = nextFileCode
    const versionRecord = await this.createPublishedVersion(document, file, nextVersion, userId)

    await prisma.document.update({
      where: { id: document.id },
      data: {
        version: nextVersion,
        fileCode: nextFileCode,
        updatedAt: renewedAt
      }
    })

    const nextStatus = this.calculateExpiryStatus(newExpiryDate, profile.expiringSoonDays)

    await prisma.documentExpiryProfile.update({
      where: { documentId: document.id },
      data: {
        startDate: this.normalizeDate(input.startDate || renewedAt),
        expiryDate: newExpiryDate,
        expiryStatus: nextStatus,
        renewalStatus: 'COMPLETED',
        currentVersionSnapshot: nextVersion,
        remarks: input.remarks !== undefined ? input.remarks : profile.remarks,
        trackingEnabled: true,
        trackingDisabledAt: null,
        trackingDisabledBy: null,
        trackingDisabledReason: null,
        updatedBy: userId
      }
    })

    await prisma.documentExpiryRenewalHistory.create({
      data: {
        documentId: document.id,
        expiryProfileId: profile.id,
        documentVersionId: versionRecord.id,
        fromVersion: document.version,
        toVersion: nextVersion,
        previousExpiryDate: profile.expiryDate,
        newExpiryDate,
        renewalStatusBefore: profile.renewalStatus,
        renewalStatusAfter: 'COMPLETED',
        remarks: input.remarks || null,
        renewedBy: userId,
        renewedAt
      }
    })

    const existingRegister = await prisma.documentRegister.findFirst({
      where: {
        fileCode: oldFileCode,
        projectCategoryId: document.projectCategoryId
      }
    })

    if (existingRegister) {
      await prisma.documentRegister.update({
        where: { id: existingRegister.id },
        data: {
          fileCode: nextFileCode,
          version: nextVersion,
          registeredDate: renewedAt
        }
      })
    } else if (shouldUpdateFileCode) {
      const ownerName = this.formatUserDisplay(document.owner)
      const department = document.owner?.department || ''
      const docType = document.documentType?.name || ''

      if (document.projectCategoryId) {
        await prisma.documentRegister.upsert({
          where: {
            fileCode_projectCategoryId: {
              fileCode: nextFileCode,
              projectCategoryId: document.projectCategoryId
            }
          },
          update: {
            documentTitle: document.title,
            documentType: docType,
            version: nextVersion,
            registeredDate: renewedAt,
            owner: ownerName,
            department,
            status: document.status
          },
          create: {
            fileCode: nextFileCode,
            projectCategoryId: document.projectCategoryId,
            documentTitle: document.title,
            documentType: docType,
            version: nextVersion,
            registeredDate: renewedAt,
            owner: ownerName,
            department,
            status: document.status
          }
        })
      } else {
        await prisma.documentRegister.create({
          data: {
            fileCode: nextFileCode,
            projectCategoryId: null,
            documentTitle: document.title,
            documentType: docType,
            version: nextVersion,
            registeredDate: renewedAt,
            owner: ownerName,
            department,
            status: document.status
          }
        })
      }
    }

    await notificationService.sendNotification(
      document.ownerId,
      'renewalCompleted',
      'Renewal Completed',
      `Renewal completed for document "${document.title}" (${nextFileCode}). New version ${nextVersion} is now active.`,
      '/expiry-tracking',
      {
        subject: `Renewal Completed - ${nextFileCode || 'DMS'}`,
        title: document.title,
        fileCode: nextFileCode,
        message: `Renewal completed for document "${document.title}" (${nextFileCode}). New version ${nextVersion} is now active.`,
        link: notificationService.buildAbsoluteLink('/expiry-tracking')
      }
    )

    return this.getProfile(document.id)
  }

  async exportRecords(filters = {}) {
    const result = await this.listProfiles(filters, { page: 1, limit: 5000 })
    return result.records
  }

  async processProfileStatusAndReminders(profile) {
    const computedStatus = this.calculateExpiryStatus(profile.expiryDate, profile.expiringSoonDays)
    const daysLeft = this.getDaysLeft(profile.expiryDate)
    const updateData = {}
    const todayStart = this.startOfDay(new Date())
    const fileName = profile.document?.versions?.[0]?.fileName || null
    const subjectLabel = fileName || profile.document?.title || profile.document?.fileCode || 'DMS'
    const ownerName = this.formatUserDisplay(profile.document?.owner) || 'Unknown'
    const lastUploadAt = profile.document?.versions?.[0]?.uploadedAt || null
    const documentLink = `/documents/${profile.document?.id || profile.documentId}`
    const recipientMap = new Map()
    if (profile.document?.ownerId && profile.document?.owner?.status === 'ACTIVE') {
      recipientMap.set(profile.document.ownerId, profile.document.owner)
    }
    for (const entry of Array.isArray(profile.reminderRecipients) ? profile.reminderRecipients : []) {
      if (entry?.userId && entry.user?.status === 'ACTIVE') {
        recipientMap.set(entry.userId, entry.user)
      }
    }

    const getRecipientsForLevel = (reminderLevel) => {
      const recipients = new Set()
      if (profile.document?.ownerId && profile.document?.owner?.status === 'ACTIVE') {
        recipients.add(profile.document.ownerId)
      }

      for (const entry of Array.isArray(profile.reminderRecipients) ? profile.reminderRecipients : []) {
        if (entry?.reminderLevel === reminderLevel && entry?.userId && entry.user?.status === 'ACTIVE') {
          recipients.add(entry.userId)
        }
      }

      return Array.from(recipients)
    }

    if (computedStatus !== profile.expiryStatus) {
      updateData.expiryStatus = computedStatus
    }

    const reminderMap = REMINDER_LEVEL_CONFIG.map((config) => ({
      level: config.level,
      field: config.sentAtField,
      threshold: profile[config.daysField]
    }))

    const lastReminder4SentToday = profile.lastReminder4SentAt
      ? this.startOfDay(profile.lastReminder4SentAt).getTime() === todayStart.getTime()
      : false

    if (daysLeft === 0 && !lastReminder4SentToday) {
      updateData.lastReminder4SentAt = new Date()
      const recipients = getRecipientsForLevel('REMINDER_4')
      const allRecipientNames = recipients
        .map((recipientId) => this.formatUserDisplay(recipientMap.get(recipientId)))
        .filter(Boolean)
      for (const recipientId of recipients) {
        const recipientUser = recipientMap.get(recipientId)
        const docId = profile.document?.id || profile.documentId
        await notificationService.sendNotification(
          recipientId,
          'documentExpiring',
          'Document Expires Today',
          `Document "${profile.document?.title || 'document'}" (${profile.document?.fileCode || 'N/A'}) expires today.`,
          documentLink,
          {
            subject: `Document Expires Today - ${subjectLabel}`,
            title: profile.document?.title || 'Document Expires Today',
            documentId: docId,
            fileCode: profile.document?.fileCode || '',
            fileName: fileName || '',
            ownerName,
            daysLeft,
            expiryDate: profile.expiryDate,
            lastUploadAt,
            recipientName: this.formatUserDisplay(recipientUser) || '',
            recipientEmail: recipientUser?.email || '',
            notifiedRecipients: allRecipientNames,
            renewLink: notificationService.buildAbsoluteLink(`/expiry-tracking?renew=1&docId=${docId}`),
            link: notificationService.buildAbsoluteLink(documentLink)
          }
        )
      }
    } else if (Number.isFinite(daysLeft) && daysLeft > 0) {
      const eligible = reminderMap
        .filter((r) => Number.isFinite(r.threshold))
        .sort((a, b) => a.threshold - b.threshold)
      const selected = eligible.find((r) => daysLeft <= r.threshold) || null
      if (selected) {
        const windowStart = this.getReminderWindowStart(profile.expiryDate, selected.threshold)
        const sentAt = profile[selected.field]
        const alreadySentForWindow = sentAt
          ? this.startOfDay(sentAt).getTime() >= windowStart.getTime()
          : false
        if (!alreadySentForWindow) {
          updateData[selected.field] = new Date()
          const recipients = getRecipientsForLevel(selected.level)
          const allRecipientNames = recipients
            .map((recipientId) => this.formatUserDisplay(recipientMap.get(recipientId)))
            .filter(Boolean)
          for (const recipientId of recipients) {
            const recipientUser = recipientMap.get(recipientId)
            const docId = profile.document?.id || profile.documentId
            await notificationService.sendNotification(
              recipientId,
              'documentExpiring',
              'Document Expiry Reminder',
              `Document "${profile.document?.title || 'document'}" (${profile.document?.fileCode || 'N/A'}) is due to expire in ${daysLeft} day(s).`,
              documentLink,
              {
                subject: `Document Expiry Reminder - ${subjectLabel}`,
                title: profile.document?.title || 'Document Expiry Reminder',
                documentId: docId,
                fileCode: profile.document?.fileCode || '',
                fileName: fileName || '',
                ownerName,
                daysLeft,
                expiryDate: profile.expiryDate,
                lastUploadAt,
                recipientName: this.formatUserDisplay(recipientUser) || '',
                recipientEmail: recipientUser?.email || '',
                notifiedRecipients: allRecipientNames,
                renewLink: notificationService.buildAbsoluteLink(`/expiry-tracking?renew=1&docId=${docId}`),
                link: notificationService.buildAbsoluteLink(documentLink)
              }
            )
          }
        }
      }
    }

    if (Number.isFinite(daysLeft) && daysLeft < 0 && !lastReminder4SentToday) {
      updateData.lastReminder4SentAt = new Date()
      const recipients = getRecipientsForLevel('REMINDER_4')
      const allRecipientNames = recipients
        .map((recipientId) => this.formatUserDisplay(recipientMap.get(recipientId)))
        .filter(Boolean)
      for (const recipientId of recipients) {
        const recipientUser = recipientMap.get(recipientId)
        const docId = profile.document?.id || profile.documentId
        await notificationService.sendNotification(
          recipientId,
          'documentExpired',
          'Document Expired',
          `Document "${profile.document?.title || 'document'}" (${profile.document?.fileCode || 'N/A'}) has already expired.`,
          documentLink,
          {
            subject: `Document Expired - ${subjectLabel}`,
            title: profile.document?.title || 'Document Expired',
            documentId: docId,
            fileCode: profile.document?.fileCode || '',
            fileName: fileName || '',
            ownerName,
            daysLeft,
            expiredDays: Math.abs(daysLeft),
            expiryDate: profile.expiryDate,
            lastUploadAt,
            recipientName: this.formatUserDisplay(recipientUser) || '',
            recipientEmail: recipientUser?.email || '',
            notifiedRecipients: allRecipientNames,
            renewLink: notificationService.buildAbsoluteLink(`/expiry-tracking?renew=1&docId=${docId}`),
            link: notificationService.buildAbsoluteLink(documentLink)
          }
        )
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.documentExpiryProfile.update({
        where: { id: profile.id },
        data: updateData
      })
    }
  }

  async processDailyStatusAndReminders() {
    const profiles = await prisma.documentExpiryProfile.findMany({
      where: {
        trackingEnabled: true,
        expiryDate: { not: null }
      },
      include: {
        document: {
          include: {
            owner: {
              select: {
                id: true,
                status: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            versions: {
              select: {
                fileName: true,
                uploadedAt: true
              },
              orderBy: { uploadedAt: 'desc' },
              take: 1
            }
          }
        },
        watchers: {
          include: {
            user: {
              select: {
                id: true,
                status: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        reminderRecipients: {
          include: {
            user: {
              select: {
                id: true,
                status: true,
                firstName: true,
                lastName: true,
                email: true,
                department: true
              }
            }
          },
          orderBy: [
            { reminderLevel: 'asc' },
            { createdAt: 'asc' }
          ]
        }
      }
    })

    for (const profile of profiles) {
      await this.processProfileStatusAndReminders(profile)
    }
  }
}

module.exports = new ExpiryTrackingService()
