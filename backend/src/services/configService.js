const prisma = require('../config/database');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { createDefaultAdminNotificationChannels, LEGACY_NOTIFICATION_EVENT_ALIASES } = require('../constants/notificationEvents');
const fs = require('fs/promises');
const path = require('path');
const appConfig = require('../config/app');

let maintenanceSettingsCache = null;
let maintenanceSettingsCacheAt = 0;
const MAINTENANCE_SETTINGS_CACHE_TTL_MS = 5000;

class ConfigService {
  getDefaultCrmFbEnquiryLookups() {
    return {
      channels: [
        'Facebook Post/Ad',
        'Messenger',
        'Comment',
        'Referral from FB'
      ],
      industryTypes: [
        'Construction',
        'Manufacturing',
        'Retail',
        'Services',
        'Education',
        'Healthcare',
        'Other'
      ]
    }
  }

  normalizeCrmFbEnquiryLookups(input) {
    const defaults = this.getDefaultCrmFbEnquiryLookups()
    const source = input && typeof input === 'object' ? input : {}
    const normalizeList = (items, fallback) => {
      const rawItems = Array.isArray(items) ? items : fallback
      const seen = new Set()
      return rawItems
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .filter((item) => {
          const key = item.toLowerCase()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .slice(0, 100)
    }

    return {
      channels: normalizeList(source.channels, defaults.channels),
      industryTypes: normalizeList(source.industryTypes, defaults.industryTypes)
    }
  }

  getDefaultDocumentNumberingSettings() {
    return {
      separator: '/',
      prefixPlaceholder: 'PFX',
      includeProjectCategoryCode: false,
      includeVersion: true,
      versionDigits: '2',
      dateFormat: 'YYMMDD',
      counterDigits: '3',
      startingNumber: '1'
    };
  }

  normalizeDocumentNumberingSettings(input) {
    const defaults = this.getDefaultDocumentNumberingSettings();
    const source = (input && typeof input === 'object') ? input : {};

    return {
      separator: String(source.separator ?? defaults.separator),
      prefixPlaceholder: String(source.prefixPlaceholder ?? defaults.prefixPlaceholder),
      includeProjectCategoryCode: Boolean(source.includeProjectCategoryCode ?? defaults.includeProjectCategoryCode),
      includeVersion: Boolean(source.includeVersion ?? defaults.includeVersion),
      versionDigits: String(source.versionDigits ?? defaults.versionDigits),
      dateFormat: String(source.dateFormat ?? defaults.dateFormat),
      counterDigits: String(source.counterDigits ?? defaults.counterDigits),
      startingNumber: String(source.startingNumber ?? defaults.startingNumber)
    };
  }

  getDefaultNotificationSettings() {
    const notifications = createDefaultAdminNotificationChannels()

    return {
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtpPort: process.env.SMTP_PORT || '587',
      smtpUsername: process.env.SMTP_USERNAME || '',
      smtpPassword: process.env.SMTP_PASSWORD || '',
      fromName: process.env.FROM_NAME || 'DMS System',
      fromEmail: process.env.FROM_EMAIL || 'noreply@company.com',
      notifications,
      reviewReminder: 3,
      approvalReminder: 2,
      dailyDigest: false,
      digestTime: '09:00'
    };
  }

  normalizeNotificationSettings(input) {
    const defaults = this.getDefaultNotificationSettings();
    const raw = (input && typeof input === 'object') ? input : {};
    const nested = (raw.settings && typeof raw.settings === 'object') ? raw.settings : null;

    // Support legacy/malformed stored payload like { settings: { ...actualValues } }
    const source = (nested && (nested.smtpHost || nested.smtpPort || nested.smtpUsername || nested.fromEmail || nested.notifications))
      ? nested
      : raw;

    const allowedKeys = Object.keys(defaults.notifications || {})
    const sourceNotifications = (source.notifications && typeof source.notifications === 'object')
      ? source.notifications
      : {}
    const normalizedSourceNotifications = Object.entries(sourceNotifications).reduce((acc, [key, value]) => {
      const normalizedKey = LEGACY_NOTIFICATION_EVENT_ALIASES[key] || key
      if (!allowedKeys.includes(normalizedKey)) return acc
      acc[normalizedKey] = value
      return acc
    }, {})
    const filteredNotifications = allowedKeys.reduce((acc, key) => {
      const v = normalizedSourceNotifications[key]
      acc[key] = {
        email: Boolean(v?.email ?? defaults.notifications[key]?.email),
        inApp: Boolean(v?.inApp ?? defaults.notifications[key]?.inApp)
      }
      return acc
    }, {})

    const rawFrontendUrl = String(source.frontendUrl ?? defaults.frontendUrl ?? '').trim()
    const frontendUrl = rawFrontendUrl.endsWith('/')
      ? rawFrontendUrl.slice(0, -1)
      : rawFrontendUrl

    return {
      frontendUrl,
      smtpHost: source.smtpHost ?? defaults.smtpHost,
      smtpPort: String(source.smtpPort ?? defaults.smtpPort),
      smtpUsername: source.smtpUsername ?? defaults.smtpUsername,
      smtpPassword: source.smtpPassword ?? defaults.smtpPassword,
      fromName: source.fromName ?? defaults.fromName,
      fromEmail: source.fromEmail ?? defaults.fromEmail,
      notifications: filteredNotifications,
      reviewReminder: Number(source.reviewReminder ?? defaults.reviewReminder),
      approvalReminder: Number(source.approvalReminder ?? defaults.approvalReminder),
      dailyDigest: Boolean(source.dailyDigest ?? defaults.dailyDigest),
      digestTime: source.digestTime ?? defaults.digestTime
    };
  }

  getDefaultExpiryTrackingSettings() {
    return {
      expiringSoonDays: 60,
      reminder1Days: 90,
      reminder2Days: 60,
      reminder3Days: 30,
      reminder4Days: 7
    }
  }

  normalizeExpiryTrackingSettings(input) {
    const defaults = this.getDefaultExpiryTrackingSettings()
    const source = (input && typeof input === 'object') ? input : {}
    const toPositiveInt = (value, fallback) => {
      const parsed = parseInt(value, 10)
      if (!Number.isFinite(parsed) || parsed < 0) return fallback
      return parsed
    }

    return {
      expiringSoonDays: toPositiveInt(source.expiringSoonDays, defaults.expiringSoonDays),
      reminder1Days: toPositiveInt(source.reminder1Days, defaults.reminder1Days),
      reminder2Days: toPositiveInt(source.reminder2Days, defaults.reminder2Days),
      reminder3Days: toPositiveInt(source.reminder3Days, defaults.reminder3Days),
      reminder4Days: toPositiveInt(source.reminder4Days, defaults.reminder4Days)
    }
  }

  /**
   * Get all document types
   */
  async getDocumentTypes({ includeInactive = false } = {}) {
    return await prisma.documentType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' }
    });
  }

  /**
   * Get all roles
   */
  async getRoles() {
    return await prisma.role.findMany({
      orderBy: { displayName: 'asc' }
    });
  }

  /**
   * Get all workflows
   */
  async getWorkflows() {
    return await prisma.workflow.findMany({
      include: {
        documentType: true,
        steps: {
          include: {
            role: true
          },
          orderBy: { stepOrder: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get all users with roles
   */
  async getUsers(filters = {}) {
    const { status, roleId } = filters;
    const where = {};

    if (status) where.status = status;
    if (roleId) {
      where.roles = {
        some: { roleId: parseInt(roleId) }
      };
    }

    return await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
        status: true,
        dateJoined: true,
        roles: {
          include: {
            role: true
          }
        }
      },
      orderBy: { firstName: 'asc' }
    });
  }

  /**
   * Get system configuration
   */
  async getConfiguration(key = null) {
    if (key) {
      return await prisma.configuration.findUnique({
        where: { key }
      });
    }

    return await prisma.configuration.findMany({
      orderBy: { key: 'asc' }
    });
  }

  /**
   * Update configuration
   */
  async updateConfiguration(key, value) {
    return await prisma.configuration.update({
      where: { key },
      data: { value }
    });
  }

  async upsertConfiguration(key, value, description = null) {
    return await prisma.configuration.upsert({
      where: { key },
      update: { value, description: description ?? undefined },
      create: { key, value, description }
    })
  }

  async getCrmFbEnquiryLookups() {
    const record = await prisma.configuration.findUnique({
      where: { key: 'crm.fbEnquiry.lookups' }
    })

    if (!record?.value) {
      return this.getDefaultCrmFbEnquiryLookups()
    }

    try {
      return this.normalizeCrmFbEnquiryLookups(JSON.parse(record.value))
    } catch {
      return this.getDefaultCrmFbEnquiryLookups()
    }
  }

  async updateCrmFbEnquiryLookups(input) {
    const lookups = this.normalizeCrmFbEnquiryLookups(input)
    await this.upsertConfiguration(
      'crm.fbEnquiry.lookups',
      JSON.stringify(lookups),
      'CRM FB enquiry lookup values for channels and industry types'
    )
    return lookups
  }

  // ============================================
  // DOCUMENT TYPE MANAGEMENT
  // ============================================

  /**
   * Create new document type
   */
  async createDocumentType(data) {
    const { name, prefix, description, requiresExpiryTracking, allowRenewal, renewalUrl, defaultRenewalChecklist } = data;
    return await prisma.documentType.create({
      data: {
        name,
        prefix,
        description,
        requiresExpiryTracking: Boolean(requiresExpiryTracking),
        allowRenewal: allowRenewal !== undefined ? Boolean(allowRenewal) : true,
        renewalUrl: renewalUrl || null,
        defaultRenewalChecklist: defaultRenewalChecklist || null,
        isActive: true
      }
    });
  }

  /**
   * Update document type
   */
  async updateDocumentType(id, data) {
    const { name, prefix, description, isActive, requiresExpiryTracking, allowRenewal, renewalUrl, defaultRenewalChecklist } = data;
    return await prisma.documentType.update({
      where: { id: parseInt(id) },
      data: {
        name,
        prefix,
        description,
        isActive,
        requiresExpiryTracking,
        allowRenewal,
        renewalUrl: renewalUrl !== undefined ? renewalUrl : undefined,
        defaultRenewalChecklist: defaultRenewalChecklist !== undefined ? defaultRenewalChecklist : undefined
      }
    });
  }

  /**
   * Delete document type
   */
  async deleteDocumentType(id) {
    const documentTypeId = parseInt(id)
    const [documentsCount, templatesCount, workflowsCount] = await Promise.all([
      prisma.document.count({ where: { documentTypeId } }),
      prisma.template.count({ where: { documentTypeId } }),
      prisma.workflow.count({ where: { documentTypeId } })
    ])

    if (documentsCount > 0 || templatesCount > 0 || workflowsCount > 0) {
      throw new ConflictError('Cannot delete this document type because it is currently in use.')
    }

    return await prisma.documentType.delete({
      where: { id: documentTypeId }
    })
  }

  async restoreDocumentType(id) {
    return await prisma.documentType.update({
      where: { id: parseInt(id) },
      data: { isActive: true }
    })
  }

  // ============================================
  // PROJECT CATEGORY MANAGEMENT
  // ============================================

  /**
   * Get all project categories
   */
  async getProjectCategories({ includeInactive = false } = {}) {
    return await prisma.projectCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' }
    });
  }

  /**
   * Create new project category
   */
  async createProjectCategory(data) {
    const { name, code, description } = data;
    return await prisma.projectCategory.create({
      data: {
        name,
        code,
        description,
        isActive: true
      }
    });
  }

  /**
   * Update project category
   */
  async updateProjectCategory(id, data) {
    const { name, code, description, isActive } = data;
    return await prisma.projectCategory.update({
      where: { id: parseInt(id) },
      data: {
        name,
        code,
        description,
        isActive
      }
    });
  }

  /**
   * Delete project category (hard delete)
   */
  async deleteProjectCategory(id) {
    return await prisma.projectCategory.delete({
      where: { id: parseInt(id) }
    })
  }

  // ============================================
  // DEPARTMENT MANAGEMENT
  // ============================================

  /**
   * Get all departments
   */
  async getDepartments({ includeInactive = false } = {}) {
    return await prisma.department.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' }
    })
  }

  /**
   * Create new department
   */
  async createDepartment(data) {
    const { name, code, description } = data;
    return await prisma.department.create({
      data: {
        name,
        code,
        description,
        isActive: true
      }
    });
  }

  /**
   * Update department
   */
  async updateDepartment(id, data) {
    const { name, code, description, isActive } = data;
    return await prisma.department.update({
      where: { id: parseInt(id) },
      data: {
        name,
        code,
        description,
        isActive
      }
    });
  }

  /**
   * Delete department
   */
  async deleteDepartment(id) {
    return await prisma.department.delete({
      where: { id: parseInt(id) }
    })
  }

  async restoreDepartment(id) {
    return await prisma.department.update({
      where: { id: parseInt(id) },
      data: { isActive: true }
    })
  }

  // ============================================
  // DOCUMENT NUMBERING SETTINGS
  // ============================================

  /**
   * Get document numbering settings
   * Returns stored settings or defaults if not configured
   */
  async getDocumentNumberingSettings() {
    const config = await prisma.configuration.findUnique({
      where: { key: 'document_numbering_settings' }
    });

    if (config && config.value) {
      try {
        return this.normalizeDocumentNumberingSettings(JSON.parse(config.value));
      } catch (error) {
        console.error('Failed to parse document numbering settings:', error);
      }
    }

    return this.getDefaultDocumentNumberingSettings();
  }

  /**
   * Update document numbering settings
   * Stores settings in Configuration table
   */
  async updateDocumentNumberingSettings(settings) {
    const normalizedSettings = this.normalizeDocumentNumberingSettings(settings);
    const settingsJson = JSON.stringify(normalizedSettings);

    // Upsert the configuration
    const config = await prisma.configuration.upsert({
      where: { key: 'document_numbering_settings' },
      update: { 
        value: settingsJson,
        description: 'Document numbering format configuration'
      },
      create: {
        key: 'document_numbering_settings',
        value: settingsJson,
        description: 'Document numbering format configuration'
      }
    });
    return JSON.parse(config.value);
  }

  // ============================================
  // FILE UPLOAD SETTINGS
  // ============================================

  /**
   * Get file upload settings
   * Returns stored settings or defaults if not configured
   */
  async getFileUploadSettings() {
    const config = await prisma.configuration.findUnique({
      where: { key: 'file_upload_settings' }
    });

    if (config && config.value) {
      try {
        return JSON.parse(config.value);
      } catch (error) {
        console.error('Failed to parse file upload settings:', error);
      }
    }

    // Return default settings if not configured
    return {
      maxFileSize: 100, // MB
      allowedTypes: [
        'PDF', 'DOC', 'DOCX', 'DOTX', 'XLS', 'XLSX', 'XLTX', 'PPT', 'PPTX', 'TXT', 'PNG', 'JPG', 'JPEG', 'GIF', 'CSV',
        'JS', 'JSX', 'TS', 'TSX', 'JSON', 'HTML', 'CSS', 'SCSS', 'LESS', 'MD', 'YML', 'YAML', 'XML', 'SQL',
        'PY', 'JAVA', 'C', 'CPP', 'H', 'HPP', 'CS', 'GO', 'RB', 'RS', 'KT', 'SWIFT', 'VUE'
      ],
      bulkUploadLimit: 10
    };
  }

  /**
   * Update file upload settings
   * Stores settings in Configuration table
   */
  async updateFileUploadSettings(settings) {
    const settingsJson = JSON.stringify(settings);

    const config = await prisma.configuration.upsert({
      where: { key: 'file_upload_settings' },
      update: { 
        value: settingsJson,
        description: 'File upload configuration'
      },
      create: {
        key: 'file_upload_settings',
        value: settingsJson,
        description: 'File upload configuration'
      }
    });

    return JSON.parse(config.value);
  }

  // ============================================
  // VERSION CONTROL SETTINGS
  // ============================================

  /**
   * Get version control settings
   * Returns stored settings or defaults if not configured
   */
  async getVersionControlSettings() {
    const config = await prisma.configuration.findUnique({
      where: { key: 'version_control_settings' }
    });

    if (config && config.value) {
      try {
        return JSON.parse(config.value);
      } catch (error) {
        console.error('Failed to parse version control settings:', error);
      }
    }

    // Return default settings if not configured
    return {
      autoVersion: true,
      versionFormat: 'x.x',
      maxVersions: 50
    };
  }

  /**
   * Update version control settings
   * Stores settings in Configuration table
   */
  async updateVersionControlSettings(settings) {
    const settingsJson = JSON.stringify(settings);

    const config = await prisma.configuration.upsert({
      where: { key: 'version_control_settings' },
      update: { 
        value: settingsJson,
        description: 'Version control configuration'
      },
      create: {
        key: 'version_control_settings',
        value: settingsJson,
        description: 'Version control configuration'
      }
    });

    return JSON.parse(config.value);
  }

  async getRfidEpcRegistrySettings() {
    const config = await prisma.configuration.findUnique({
      where: { key: 'rfid_epc_registry_settings' }
    })

    if (config?.value) {
      try {
        const parsed = JSON.parse(config.value)
        if (parsed && typeof parsed === 'object') return parsed
      } catch (error) {
        console.error('Failed to parse RFID EPC registry settings:', error)
      }
    }

    return {
      enabled: false
    }
  }

  async updateRfidEpcRegistrySettings(settings) {
    const normalizedSettings = {
      enabled: Boolean(settings?.enabled)
    }
    const settingsJson = JSON.stringify(normalizedSettings)
    const config = await prisma.configuration.upsert({
      where: { key: 'rfid_epc_registry_settings' },
      update: {
        value: settingsJson,
        description: 'RFID EPC registry configuration'
      },
      create: {
        key: 'rfid_epc_registry_settings',
        value: settingsJson,
        description: 'RFID EPC registry configuration'
      }
    })
    return JSON.parse(config.value)
  }

  // ============================================
  // RETENTION POLICY SETTINGS
  // ============================================

  /**
   * Get retention policy settings
   * Returns stored settings or defaults if not configured
   */
  async getRetentionPolicySettings() {
    const config = await prisma.configuration.findUnique({
      where: { key: 'retention_policy_settings' }
    });

    if (config && config.value) {
      try {
        return JSON.parse(config.value);
      } catch (error) {
        console.error('Failed to parse retention policy settings:', error);
      }
    }

    // Return default settings if not configured
    return {
      draftRetention: 30,
      archivedRetention: 365,
      deletedRetention: 30
    };
  }

  /**
   * Update retention policy settings
   * Stores settings in Configuration table
   */
  async updateRetentionPolicySettings(settings) {
    const settingsJson = JSON.stringify(settings);

    const config = await prisma.configuration.upsert({
      where: { key: 'retention_policy_settings' },
      update: { 
        value: settingsJson,
        description: 'Retention policy configuration'
      },
      create: {
        key: 'retention_policy_settings',
        value: settingsJson,
        description: 'Retention policy configuration'
      }
    });

    return JSON.parse(config.value);
  }

  // ============================================
  // EXPIRY TRACKING SETTINGS
  // ============================================

  async getExpiryTrackingSettings() {
    const config = await prisma.configuration.findUnique({
      where: { key: 'expiry_tracking_settings' }
    })

    if (config?.value) {
      try {
        return this.normalizeExpiryTrackingSettings(JSON.parse(config.value))
      } catch (error) {
        console.error('Failed to parse expiry tracking settings:', error)
      }
    }

    return this.getDefaultExpiryTrackingSettings()
  }

  async updateExpiryTrackingSettings(settings) {
    const normalizedSettings = this.normalizeExpiryTrackingSettings(settings)
    const settingsJson = JSON.stringify(normalizedSettings)
    const config = await prisma.configuration.upsert({
      where: { key: 'expiry_tracking_settings' },
      update: {
        value: settingsJson,
        description: 'Expiry tracking thresholds and reminder schedule'
      },
      create: {
        key: 'expiry_tracking_settings',
        value: settingsJson,
        description: 'Expiry tracking thresholds and reminder schedule'
      }
    })

    return this.normalizeExpiryTrackingSettings(JSON.parse(config.value))
  }

  // ============================================
  // NOTIFICATION SETTINGS
  // ============================================

  /**
   * Get notification settings
   * Returns stored settings or defaults if not configured
   */
  async getNotificationSettings() {
    const config = await prisma.configuration.findUnique({
      where: { key: 'notification_settings' }
    });

    if (config && config.value) {
      try {
        const parsed = JSON.parse(config.value);
        return this.normalizeNotificationSettings(parsed);
      } catch (error) {
        console.error('Failed to parse notification settings:', error);
      }
    }

    return this.getDefaultNotificationSettings();
  }

  /**
   * Update notification settings
   * Stores settings in Configuration table
   */
  async updateNotificationSettings(settings) {
    const current = await this.getNotificationSettings();
    const normalized = this.normalizeNotificationSettings(settings);

    const incomingPassword = settings?.smtpPassword;
    const shouldPreservePassword =
      incomingPassword === undefined ||
      incomingPassword === null ||
      incomingPassword === '' ||
      incomingPassword === '••••••••';

    const merged = this.normalizeNotificationSettings({
      ...current,
      ...normalized,
      smtpPassword: shouldPreservePassword ? current.smtpPassword : normalized.smtpPassword,
      notifications: { ...(current.notifications || {}), ...(normalized.notifications || {}) }
    })
    const settingsJson = JSON.stringify(merged);
    const config = await prisma.configuration.upsert({
      where: { key: 'notification_settings' },
      update: { 
        value: settingsJson,
        description: 'Email and notification configuration'
      },
      create: {
        key: 'notification_settings',
        value: settingsJson,
        description: 'Email and notification configuration'
      }
    });

    return this.normalizeNotificationSettings(JSON.parse(config.value));
  }

  /**
   * Test email configuration
   */
  async testEmailConfiguration(testEmail) {
    const emailService = require('./emailService');
    return await emailService.sendTestEmail(testEmail);
  }

  // ============================================
  // LANDING PAGE SETTINGS (GLOBAL)
  // ============================================

  async getLandingPageSettings() {
    const config = await prisma.configuration.findUnique({
      where: { key: 'landing_page_settings' }
    });

    if (config?.value) {
      try {
        return JSON.parse(config.value);
      } catch (error) {
        console.error('Failed to parse landing page settings:', error);
      }
    }

    return null;
  }

  async updateLandingPageSettings(settings) {
    const sanitized = settings && typeof settings === 'object' ? { ...settings } : settings
    if (sanitized && typeof sanitized === 'object') {
      delete sanitized.aboutGradientStart
      delete sanitized.aboutGradientEnd
      if (Array.isArray(sanitized.features)) {
        sanitized.features = sanitized.features.map((f) => {
          if (!f || typeof f !== 'object') return f
          const nf = { ...f }
          delete nf.icon
          return nf
        })
      }
    }

    const settingsJson = JSON.stringify(sanitized);

    const config = await prisma.configuration.upsert({
      where: { key: 'landing_page_settings' },
      update: {
        value: settingsJson,
        description: 'Landing page content and layout settings'
      },
      create: {
        key: 'landing_page_settings',
        value: settingsJson,
        description: 'Landing page content and layout settings'
      }
    });

    return JSON.parse(config.value);
  }

  async getLoginPageSettings() {
    let config = null
    try {
      config = await prisma.configuration.findUnique({
        where: { key: 'login_page_settings' }
      })
    } catch {
      config = null
    }

    if (config?.value) {
      try {
        return JSON.parse(config.value);
      } catch (error) {
        console.error('Failed to parse login page settings:', error);
      }
    }

    return null;
  }

  async updateLoginPageSettings(settings) {
    const settingsJson = JSON.stringify(settings);

    const config = await prisma.configuration.upsert({
      where: { key: 'login_page_settings' },
      update: {
        value: settingsJson,
        description: 'Login page content and layout settings'
      },
      create: {
        key: 'login_page_settings',
        value: settingsJson,
        description: 'Login page content and layout settings'
      }
    });

    return JSON.parse(config.value);
  }

  async getCompanyInfo() {
    const config = await prisma.configuration.findUnique({
      where: { key: 'company_info' }
    });

    if (config?.value) {
      try {
        return JSON.parse(config.value);
      } catch (error) {
        console.error('Failed to parse company info:', error);
      }
    }

    return null;
  }

  async updateCompanyInfo(companyInfo) {
    const value = JSON.stringify(companyInfo);

    const config = await prisma.configuration.upsert({
      where: { key: 'company_info' },
      update: { value, description: 'Company information (global branding)' },
      create: { key: 'company_info', value, description: 'Company information (global branding)' }
    });

    return JSON.parse(config.value);
  }

  async resolveBrandingFile(pathOrUrl) {
    // #region debug-point E:resolveBrandingFile
    const traceId = `logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    console.log(`[DEBUG-BRANDING:${traceId}] ===== resolveBrandingFile START =====`)
    console.log(`[DEBUG-BRANDING:${traceId}] raw input:`, JSON.stringify(pathOrUrl), typeof pathOrUrl)
    // #endregion
    if (!pathOrUrl || typeof pathOrUrl !== 'string') {
      // #region debug-point E:resolveBrandingFile
      console.log(`[DEBUG-BRANDING:${traceId}] early return null (empty/invalid)`)
      // #endregion
      return null;
    }
    const trimmed = pathOrUrl.trim();
    if (!trimmed) {
      // #region debug-point E:resolveBrandingFile
      console.log(`[DEBUG-BRANDING:${traceId}] early return null (trimmed empty)`)
      // #endregion
      return null;
    }
    if (trimmed.startsWith('data:')) {
      // #region debug-point E:resolveBrandingFile
      console.log(`[DEBUG-BRANDING:${traceId}] is data: URL, return as-is (len=${trimmed.length})`)
      // #endregion
      return trimmed;
    }
    const normalized = trimmed
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/+/, '');
    // #region debug-point E:resolveBrandingFile
    console.log(`[DEBUG-BRANDING:${traceId}] trimmed:`, JSON.stringify(trimmed))
    console.log(`[DEBUG-BRANDING:${traceId}] normalized (strip domain/leading slashes):`, JSON.stringify(normalized))
    // #endregion
    const match = normalized.match(/^uploads\/branding\/([^/?#]+)(?:[?#].*)?$/i);
    // #region debug-point E:resolveBrandingFile
    console.log(`[DEBUG-BRANDING:${traceId}] match (uploads/branding regex):`, match ? `OK -> fileName=${match[1]}` : 'NO MATCH')
    // #endregion
    if (!match) {
      const legacyMatch = trimmed.match(/(?:^|\/)branding\/([^/?#]+)(?:[?#].*)?$/i);
      // #region debug-point E:resolveBrandingFile
      console.log(`[DEBUG-BRANDING:${traceId}] legacyMatch (branding regex):`, legacyMatch ? `OK -> fileName=${legacyMatch[1]}` : 'NO MATCH')
      // #endregion
      if (!legacyMatch) {
        // #region debug-point E:resolveBrandingFile
        console.log(`[DEBUG-BRANDING:${traceId}] NO MATCH either regex, returning trimmed=`, JSON.stringify(trimmed))
        // #endregion
        return trimmed;
      }
    }
    const fileName = (match ? match[1] : null) || (trimmed.match(/(?:^|\/)([^\/?#]+)(?:[?#].*)?$/) || [])[1] || null;
    if (!fileName) {
      // #region debug-point E:resolveBrandingFile
      console.log(`[DEBUG-BRANDING:${traceId}] fileName extraction FAILED, return null`)
      // #endregion
      return null;
    }
    // #region debug-point E:resolveBrandingFile
    console.log(`[DEBUG-BRANDING:${traceId}] FINAL fileName=`, JSON.stringify(fileName))
    // #endregion
    const baseDir = appConfig && appConfig.uploadDir ? appConfig.uploadDir : path.resolve(process.cwd(), 'uploads');
    const filePath = path.join(baseDir, 'branding', fileName);
    // #region debug-point E:resolveBrandingFile
    console.log(`[DEBUG-BRANDING:${traceId}] baseDir=`, JSON.stringify(baseDir), `checking filePath=`, JSON.stringify(filePath))
    // #endregion
    try {
      await fs.access(filePath, require('fs').constants.R_OK);
      // #region debug-point E:resolveBrandingFile
      console.log(`[DEBUG-BRANDING:${traceId}] ✅ baseDir FOUND, return /uploads/branding/${fileName}`)
      // #endregion
      return `/uploads/branding/${fileName}`;
    } catch (err) {
      // #region debug-point E:resolveBrandingFile
      console.log(`[DEBUG-BRANDING:${traceId}] ❌ baseDir NOT FOUND (${err.code}), trying altDirs...`)
      // #endregion
      let foundPath = null;
      try {
        const processCwd = process.cwd();
        let osHomedir = processCwd;
        try { osHomedir = require('os').homedir(); } catch {}
        const altDirs = [
          path.resolve(processCwd, 'uploads'),
          path.resolve(processCwd, '..', 'uploads'),
          path.resolve(processCwd, 'public', 'uploads'),
          path.resolve(processCwd, '..', 'backend', 'uploads'),
          path.resolve(processCwd, 'backend', 'uploads'),
          // aaPanel standard paths (demo + generic)
          '/www/wwwroot/dms.demo.clbgroups.com/backend/uploads',
          '/www/wwwroot/dms.demo.clbgroups.com/uploads',
          '/www/wwwroot/dms.demo.clbgroups.com/backend/public/uploads',
          '/www/wwwroot/dms.demo.clbgroups.com/public/uploads',
          '/www/wwwroot/default/backend/uploads',
          '/www/wwwroot/default/uploads',
          // Docker on-prem bind mount paths
          '/var/www/html/backend/uploads',
          '/var/www/html/uploads',
          '/app/backend/uploads',
          '/app/uploads',
          '/data/backend/uploads',
          '/data/uploads',
          // Home dir fallback
          path.resolve(osHomedir, 'dms', 'uploads'),
          path.resolve(osHomedir, 'dms', 'backend', 'uploads')
        ];
        for (const dir of altDirs) {
          const altPath = path.join(dir, 'branding', fileName);
          try {
            await fs.access(altPath, require('fs').constants.R_OK);
            // #region debug-point E:resolveBrandingFile
            console.log(`%c[DEBUG-BRANDING:${traceId}] ✅ altDir FOUND: dir=${JSON.stringify(dir)} altPath=${JSON.stringify(altPath)} -> return /api/public/branding-file/branding/${fileName} (Nginx static INTERCEPTION AVOIDED via /api/ prefix)`, 'color:#065F46;font-weight:bold')
            // #endregion
            // ⭐ KEY FIX: Use /api/ URL (guaranteed to hit Node backend) instead of
            // /uploads/ static URL which Nginx aaPanel serves from its own docroot and 404s
            // when file is saved in backend upload dir.
            foundPath = `/api/public/branding-file/branding/${fileName}`;
            break;
          } catch (e2) {
            // #region debug-point E:resolveBrandingFile
            console.log(`[DEBUG-BRANDING:${traceId}] ❌ altDir MISS: dir=${JSON.stringify(dir)} (${e2.code})`)
            // #endregion
          }
        }
      } catch (outerErr) {
        // #region debug-point E:resolveBrandingFile
        console.log(`[DEBUG-BRANDING:${traceId}] ❌ altDirs loop EXCEPTION:`, outerErr.message)
        // #endregion
      }
      if (foundPath) {
        return foundPath;
      }
      // 🌟 CRITICAL FALLBACK — PREVENTS NULL OVERRIDE:
      // DB record has valid branding file reference. This means user uploaded before.
      // Even if physical file is missing, return RELATIVE PATH instead of NULL.
      // This prevents frontend from GLOBALLY overwriting in-memory cached logo to NULL.
      // Frontend BrandLogoImage onerror + ThemeAssetField will show "File missing" correctly.
      const relativeReturn = `/uploads/branding/${fileName}`;
      // #region debug-point E:resolveBrandingFile
      console.log(`%c[DEBUG-BRANDING:${traceId}] ❌❌ ALL DIRS FAILED — returning RELATIVE PATH FALLBACK: ${JSON.stringify(relativeReturn)} INSTEAD OF NULL (prevents global state null override)`, 'color:#B45309;font-weight:bold');
      // #endregion
      return relativeReturn;
    }
  }

  async getThemeSettings() {
    const config = await prisma.configuration.findUnique({
      where: { key: 'theme_settings' }
    });

    if (config?.value) {
      try {
        const parsed = JSON.parse(config.value);
        if (parsed && typeof parsed === 'object') {
          parsed.mainLogo = await this.resolveBrandingFile(parsed.mainLogo);
          parsed.favicon = await this.resolveBrandingFile(parsed.favicon);
          parsed.bgImage = await this.resolveBrandingFile(parsed.bgImage);
        }
        return parsed;
      } catch (error) {
        console.error('Failed to parse theme settings:', error);
      }
    }

    return null;
  }

  async updateThemeSettings(themeSettings) {
    const nextTheme = (themeSettings && typeof themeSettings === 'object') ? { ...themeSettings } : {};

    const existingConfig = await prisma.configuration.findUnique({
      where: { key: 'theme_settings' }
    });

    let previousTheme = null;
    if (existingConfig?.value) {
      try {
        previousTheme = JSON.parse(existingConfig.value);
      } catch {
        previousTheme = null;
      }
    }

    const previousLogo = typeof previousTheme?.mainLogo === 'string' ? previousTheme.mainLogo : null;

    const maybeDeletePreviousLogo = async () => {
      if (!previousLogo || typeof previousLogo !== 'string') return;
      const match = previousLogo.match(/^\/uploads\/branding\/([^?]+)(?:\?.*)?$/i);
      if (!match) return;
      const fileName = match[1];
      const filePath = path.join(appConfig.uploadDir, 'branding', fileName);
      try {
        await fs.unlink(filePath);
      } catch {}
    };

    const persistDataUrlAsFile = async (dataUrl) => {
      const match = String(dataUrl).match(/^data:([^;,]+)(;base64)?,(.*)$/i);
      if (!match) return null;
      const mime = match[1]?.toLowerCase() || '';
      const isBase64 = Boolean(match[2]);
      const payload = match[3] || '';

      const extMap = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/svg+xml': 'svg'
      };
      const ext = extMap[mime];
      if (!ext) return null;

      const brandingDir = path.join(appConfig.uploadDir, 'branding');
      await fs.mkdir(brandingDir, { recursive: true });

      const stamp = Date.now();
      const fileName = `main-logo-${stamp}.${ext}`;
      const filePath = path.join(brandingDir, fileName);

      const buffer = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8');
      await fs.writeFile(filePath, buffer);

      return `/uploads/branding/${fileName}`;
    };

    const incomingLogo = nextTheme.mainLogo;
    if (typeof incomingLogo === 'string' && incomingLogo.startsWith('data:')) {
      const url = await persistDataUrlAsFile(incomingLogo);
      if (url) {
        await maybeDeletePreviousLogo();
        nextTheme.mainLogo = url;
      }
    } else if (!incomingLogo) {
      await maybeDeletePreviousLogo();
      nextTheme.mainLogo = null;
    }

    if (typeof nextTheme.mainLogoPlaceholder !== 'string' || !nextTheme.mainLogoPlaceholder.trim()) {
      nextTheme.mainLogoPlaceholder = null;
    }

    const value = JSON.stringify(nextTheme);

    const config = await prisma.configuration.upsert({
      where: { key: 'theme_settings' },
      update: { value, description: 'Theme and branding settings (global)' },
      create: { key: 'theme_settings', value, description: 'Theme and branding settings (global)' }
    });

    return JSON.parse(config.value);
  }

  normalizeMaintenanceSettings(settings) {
    const enabled = Boolean(settings?.enabled);
    const message =
      typeof settings?.message === 'string' && settings.message.trim()
        ? settings.message.trim()
        : 'System is under maintenance';

    return { enabled, message };
  }

  async getMaintenanceSettings(options = {}) {
    const { bypassCache = false } = options;
    const now = Date.now();
    if (!bypassCache && maintenanceSettingsCache && (now - maintenanceSettingsCacheAt) < MAINTENANCE_SETTINGS_CACHE_TTL_MS) {
      return maintenanceSettingsCache;
    }

    let config = null
    try {
      config = await prisma.configuration.findUnique({
        where: { key: 'maintenance_settings' }
      })
    } catch {
      config = null
    }

    let parsed = null;
    if (config?.value) {
      try {
        parsed = JSON.parse(config.value);
      } catch {
        parsed = null;
      }
    }

    maintenanceSettingsCache = this.normalizeMaintenanceSettings(parsed || null);
    maintenanceSettingsCacheAt = now;
    return maintenanceSettingsCache;
  }

  async updateMaintenanceSettings(settings) {
    const normalized = this.normalizeMaintenanceSettings(settings || null);
    const value = JSON.stringify(normalized);

    const config = await prisma.configuration.upsert({
      where: { key: 'maintenance_settings' },
      update: { value, description: 'Maintenance mode settings' },
      create: { key: 'maintenance_settings', value, description: 'Maintenance mode settings' }
    });

    maintenanceSettingsCache = this.normalizeMaintenanceSettings(JSON.parse(config.value));
    maintenanceSettingsCacheAt = Date.now();
    return maintenanceSettingsCache;
  }

  // ============================================
  // SMART DOCUMENT FEATURE TOGGLE
  // ============================================

  getDefaultSmartDocumentSettings() {
    return {
      enabled: true
    }
  }

  normalizeSmartDocumentSettings(input) {
    const defaults = this.getDefaultSmartDocumentSettings()
    const source = (input && typeof input === 'object') ? input : {}
    return {
      enabled: Boolean(source.enabled ?? defaults.enabled)
    }
  }

  async getSmartDocumentSettings() {
    const config = await prisma.configuration.findUnique({
      where: { key: 'smart_document_settings' }
    })

    if (config?.value) {
      try {
        return this.normalizeSmartDocumentSettings(JSON.parse(config.value))
      } catch (error) {
        console.error('Failed to parse smart document settings:', error)
      }
    }

    return this.getDefaultSmartDocumentSettings()
  }

  async updateSmartDocumentSettings(settings) {
    const normalized = this.normalizeSmartDocumentSettings(settings || null)
    const value = JSON.stringify(normalized)
    const config = await prisma.configuration.upsert({
      where: { key: 'smart_document_settings' },
      update: { value, description: 'Smart Document feature enable/disable flag' },
      create: { key: 'smart_document_settings', value, description: 'Smart Document feature enable/disable flag' }
    })
    return this.normalizeSmartDocumentSettings(JSON.parse(config.value))
  }
}

module.exports = new ConfigService();
