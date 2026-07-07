const prisma = require('../config/database');
const config = require('../config/app');
const emailService = require('./emailService');
const configService = require('./configService');
const {
  NOTIFICATION_EVENT_DB_TYPE_MAP,
  NOTIFICATION_EVENT_KEYS,
  LEGACY_NOTIFICATION_EVENT_ALIASES,
  LEGACY_NOTIFICATION_EVENT_EXPANSIONS,
  createDefaultUserNotificationPreferences
} = require('../constants/notificationEvents');

class NotificationService {
  getValidNotificationTypes() {
    return new Set([
      'DOCUMENT_ASSIGNED',
      'REVIEW_REQUIRED',
      'APPROVAL_REQUIRED',
      'ACKNOWLEDGMENT_REQUIRED',
      'STATUS_CHANGED',
      'DOCUMENT_APPROVED',
      'DOCUMENT_REJECTED',
      'DOCUMENT_RETURNED',
      'VERSION_UPDATE',
      'DOCUMENT_EXPIRING',
      'DOCUMENT_EXPIRED',
      'RENEWAL_IN_PROGRESS',
      'RENEWAL_COMPLETED',
      'SYSTEM_ALERT'
    ])
  }

  normalizeTypeKey(type) {
    const raw = String(type || '').trim()
    return LEGACY_NOTIFICATION_EVENT_ALIASES[raw] || raw
  }

  resolveNotificationDbType(type) {
    const raw = this.normalizeTypeKey(type)
    if (!raw) return 'SYSTEM_ALERT'

    const valid = this.getValidNotificationTypes()
    if (valid.has(raw)) return raw

    return NOTIFICATION_EVENT_DB_TYPE_MAP[raw] || 'SYSTEM_ALERT'
  }

  normalizeUserNotificationSettings(settings) {
    const defaults = createDefaultUserNotificationPreferences()
    const source = (settings && typeof settings === 'object') ? settings : {}
    const normalized = {
      ...defaults,
      emailNotifications: { ...defaults.emailNotifications },
      inAppNotifications: { ...defaults.inAppNotifications },
      quietHours: {
        ...defaults.quietHours,
        ...(source.quietHours && typeof source.quietHours === 'object' ? source.quietHours : {})
      }
    }

    const applyValue = (targetMap, key, value) => {
      const expandedKeys = LEGACY_NOTIFICATION_EVENT_EXPANSIONS[key]
      const normalizedKey = LEGACY_NOTIFICATION_EVENT_ALIASES[key] || key
      const targets = expandedKeys || (NOTIFICATION_EVENT_KEYS.includes(normalizedKey) ? [normalizedKey] : [])
      if (targets.length === 0) return
      for (const targetKey of targets) {
        targetMap[targetKey] = Boolean(value)
      }
    }

    const directEntries = Object.entries(source).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    for (const [key, value] of directEntries) {
      if (!('email' in value) && !('inApp' in value)) continue
      const expandedKeys = LEGACY_NOTIFICATION_EVENT_EXPANSIONS[key]
      const normalizedKey = LEGACY_NOTIFICATION_EVENT_ALIASES[key] || key
      const targets = expandedKeys || (NOTIFICATION_EVENT_KEYS.includes(normalizedKey) ? [normalizedKey] : [])
      for (const targetKey of targets) {
        if ('email' in value) normalized.emailNotifications[targetKey] = Boolean(value.email)
        if ('inApp' in value) normalized.inAppNotifications[targetKey] = Boolean(value.inApp)
      }
    }

    const emailMap = source.emailNotifications && typeof source.emailNotifications === 'object'
      ? source.emailNotifications
      : {}
    const inAppMap = source.inAppNotifications && typeof source.inAppNotifications === 'object'
      ? source.inAppNotifications
      : {}

    for (const [key, value] of Object.entries(emailMap)) {
      applyValue(normalized.emailNotifications, key, value)
    }
    for (const [key, value] of Object.entries(inAppMap)) {
      applyValue(normalized.inAppNotifications, key, value)
    }

    normalized.digestFrequency = String(source.digestFrequency || defaults.digestFrequency).trim().toLowerCase() || defaults.digestFrequency
    if (!['realtime', 'hourly', 'daily', 'weekly'].includes(normalized.digestFrequency)) {
      normalized.digestFrequency = defaults.digestFrequency
    }

    return normalized
  }

  getUserEventPreference(notificationsObj, eventKey) {
    if (!notificationsObj || typeof notificationsObj !== 'object') return null
    const normalized = this.normalizeUserNotificationSettings(notificationsObj)
    const key = this.normalizeTypeKey(eventKey)
    return {
      inApp: normalized.inAppNotifications?.[key],
      email: normalized.emailNotifications?.[key]
    }
  }

  buildRoleNameCandidates(name) {
    const raw = String(name || '').trim()
    if (!raw) return []
    const cap = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
    return Array.from(new Set([raw, raw.toLowerCase(), raw.toUpperCase(), cap]))
  }

  async findActiveUsersByRoleName(roleName) {
    const candidates = this.buildRoleNameCandidates(roleName)
    if (candidates.length === 0) return []

    let users = await prisma.user.findMany({
      where: {
        roles: {
          some: {
            role: { name: { in: candidates } }
          }
        },
        status: 'ACTIVE'
      },
      select: { id: true, email: true }
    })

    if (users.length > 0) return users

    users = await prisma.user.findMany({
      where: {
        roles: {
          some: {
            role: { displayName: { in: candidates } }
          }
        },
        status: 'ACTIVE'
      },
      select: { id: true, email: true }
    })

    return users
  }

  buildAbsoluteLink(pathname) {
    const base = this._cachedFrontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000'
    const p = String(pathname || '')
    return p.startsWith('http://') || p.startsWith('https://') ? p : `${base}${p.startsWith('/') ? '' : '/'}${p}`
  }
  /**
   * Create in-app notification
   */
  async createNotification(userId, type, title, message, link = null) {
    const dbType = this.resolveNotificationDbType(type)
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: dbType,
        title,
        message,
        link
      }
    });

    return notification;
  }

  /**
   * Create notifications for multiple users
   */
  async createBulkNotifications(userIds, type, title, message, link = null) {
    const dbType = this.resolveNotificationDbType(type)
    const notifications = await prisma.notification.createMany({
      data: userIds.map(userId => ({
        userId,
        type: dbType,
        title,
        message,
        link
      }))
    });

    return notifications;
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId, filters = {}) {
    const { isRead, limit = 50 } = filters;

    const where = { userId };
    if (isRead !== undefined) {
      where.isRead = isRead === 'true' || isRead === true;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return notifications;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    const notification = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    return notification;
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId) {
    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId, userId) {
    await prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId
      }
    });
  }

  /**
   * Delete all notifications for a user
   */
  async deleteAllNotifications(userId) {
    const result = await prisma.notification.deleteMany({
      where: {
        userId
      }
    });
    return result;
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId) {
    const count = await prisma.notification.count({
      where: {
        userId,
        isRead: false
      }
    });

    return count;
  }

  /**
   * Notify about document submission
   */
  async notifyDocumentSubmitted(documentId, document) {
    // Get users with reviewer role
    const reviewers = await prisma.user.findMany({
      where: {
        roles: {
          some: {
            role: {
              name: 'reviewer'
            }
          }
        },
        status: 'ACTIVE'
      }
    });

    const title = 'New Document for Review';
    const message = `Document "${document.title}" (${document.fileCode}) has been submitted for review`;
    const link = `/documents/${documentId}`;

    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      submittedBy: document.owner ? `${document.owner.firstName} ${document.owner.lastName}` : 'Unknown',
      link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}${link}`
    }

    await this.sendBulkNotifications(
      reviewers.map(r => r.id),
      'documentSubmitted',
      title,
      message,
      link,
      emailData
    )

    return reviewers.length;
  }

  /**
   * Notify about document approval needed
   */
  async notifyApprovalRequired(documentId, document) {
    // Get users with approver role
    const approvers = await prisma.user.findMany({
      where: {
        roles: {
          some: {
            role: {
              name: 'approver'
            }
          }
        },
        status: 'ACTIVE'
      }
    });

    const title = 'Document Needs Approval';
    const message = `Document "${document.title}" (${document.fileCode}) requires your approval`;
    const link = `/documents/${documentId}`;

    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      reviewedBy: document.owner ? `${document.owner.firstName} ${document.owner.lastName}` : 'Unknown',
      link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}${link}`
    }

    await this.sendBulkNotifications(
      approvers.map(a => a.id),
      'approvalRequest',
      title,
      message,
      link,
      emailData
    )

    return approvers.length;
  }

  /**
   * Notify about document acknowledgment needed
   */
  async notifyAcknowledgmentRequired(documentId, document) {
    // Get users with acknowledger role
    const acknowledgers = await this.findActiveUsersByRoleName('acknowledger')

    const title = 'Document Needs Acknowledgment';
    const message = `Document "${document.title}" (${document.fileCode}) requires your acknowledgment`;
    const link = `/documents/${documentId}`;

    const emailData = {
      title: document.title,
      fileCode: document.fileCode && !String(document.fileCode).startsWith('PENDING-') ? document.fileCode : '',
      requestedBy: document.owner ? `${document.owner.firstName} ${document.owner.lastName}` : 'Unknown',
      link: this.buildAbsoluteLink(link)
    }

    await this.sendBulkNotifications(
      acknowledgers.map(a => a.id),
      'acknowledgeRequired',
      title,
      message,
      link,
      emailData
    )

    return acknowledgers.length;
  }

  /**
   * Notify document owner about status change
   */
  async notifyStatusChange(documentId, document, newStatus, userId = null) {
    const title = 'Document Status Updated';
    const message = `Your document "${document.title}" (${document.fileCode}) status changed to ${newStatus}`;
    const link = `/documents/${documentId}`;

    await this.createNotification(
      document.ownerId,
      'STATUS_CHANGED',
      title,
      message,
      link
    );

    // Also notify creator if different from owner
    if (document.createdById !== document.ownerId) {
      await this.createNotification(
        document.createdById,
        'STATUS_CHANGED',
        title,
        message,
        link
      );
    }
  }

  /**
   * Notify about document approval
   */
  async notifyDocumentApproved(documentId, document) {
    await this.notifyStatusChange(documentId, document, 'APPROVED');
  }

  /**
   * Notify about document rejection
   */
  async notifyDocumentRejected(documentId, document, reason) {
    const title = 'Document Rejected';
    const message = `Your document "${document.title}" (${document.fileCode}) has been rejected. Reason: ${reason}`;
    const link = `/documents/${documentId}`;

    await this.createNotification(
      document.ownerId,
      'DOCUMENT_REJECTED',
      title,
      message,
      link
    );

    if (document.createdById !== document.ownerId) {
      await this.createNotification(
        document.createdById,
        'DOCUMENT_REJECTED',
        title,
        message,
        link
      );
    }
  }

  /**
   * Notify about document return for amendments
   */
  async notifyDocumentReturned(documentId, document, comments) {
    const title = 'Document Returned for Amendments';
    const message = `Your document "${document.title}" (${document.fileCode}) has been returned. Comments: ${comments || 'None'}`;
    const link = `/documents/${documentId}`;

    await this.createNotification(
      document.ownerId,
      'DOCUMENT_RETURNED',
      title,
      message,
      link
    );
  }

  /**
   * Notify ALL users about document published
   * This is a broadcast notification to all active users
   */
  async notifyDocumentPublished(documentId, document) {
    // Get all active users
    const allUsers = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true }
    });

    const title = 'Document Published';
    const message = `Document "${document.title}" (${document.fileCode}) has been published`;
    const link = `/documents/${documentId}`;

    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      publishedBy: document.owner ? `${document.owner.firstName} ${document.owner.lastName}` : 'Unknown',
      link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}${link}`
    }

    await this.sendBulkNotifications(
      allUsers.map(u => u.id),
      'documentPublished',
      title,
      message,
      link,
      emailData
    )

    console.log(`[Notification] Published document notification sent to ${allUsers.length} users`);
    return allUsers.length;
  }

  /**
   * Notify ALL users about document superseded
   * This is a broadcast notification to all active users
   */
  async notifyDocumentSuperseded(documentId, document, supersedingDoc) {
    // Get all active users
    const allUsers = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true }
    });

    const title = 'Document Superseded';
    const message = `Document "${document.title}" (${document.fileCode}) has been superseded by ${supersedingDoc.fileCode}`;
    const link = `/documents/${documentId}`;

    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      supersededBy: supersedingDoc?.fileCode || '',
      link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}${link}`
    }

    await this.sendBulkNotifications(
      allUsers.map(u => u.id),
      'documentSuperseded',
      title,
      message,
      link,
      emailData
    )

    console.log(`[Notification] Superseded document notification sent to ${allUsers.length} users`);
    return allUsers.length;
  }

  /**
   * Notify ALL users about document obsolete
   * This is a broadcast notification to all active users
   */
  async notifyDocumentObsolete(documentId, document, reason) {
    // Get all active users
    const allUsers = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true }
    });

    const title = 'Document Marked Obsolete';
    const message = `Document "${document.title}" (${document.fileCode}) has been marked as obsolete. Reason: ${reason}`;
    const link = `/documents/${documentId}`;

    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      reason: reason || '',
      link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}${link}`
    }

    await this.sendBulkNotifications(
      allUsers.map(u => u.id),
      'documentObsoleted',
      title,
      message,
      link,
      emailData
    )

    console.log(`[Notification] Obsolete document notification sent to ${allUsers.length} users`);
    return allUsers.length;
  }

  /**
   * Notify user when their NDR is acknowledged by admin
   * Only the user who created the request gets notified
   */
  async notifyNDRAcknowledged(documentId, document, acknowledgedBy) {
    const title = 'NDR Acknowledged';
    const message = `Your document request "${document.title}" (${document.fileCode}) has been acknowledged and assigned file code`;
    const link = `/documents/${documentId}`;

    // Notify only the document owner (the user who created the NDR)
    const acknowledgedByUser = (() => {
      if (acknowledgedBy && typeof acknowledgedBy === 'object') return acknowledgedBy
      if (Number.isFinite(Number(acknowledgedBy))) return null
      return null
    })()
    const acknowledgedByName = acknowledgedByUser
      ? `${acknowledgedByUser.firstName} ${acknowledgedByUser.lastName}`
      : (Number.isFinite(Number(acknowledgedBy))
          ? await (async () => {
              const u = await prisma.user.findUnique({
                where: { id: parseInt(acknowledgedBy, 10) },
                select: { firstName: true, lastName: true }
              })
              return u ? `${u.firstName} ${u.lastName}` : ''
            })()
          : '')
    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      acknowledgedBy: acknowledgedByName,
      link: this.buildAbsoluteLink(link)
    }

    await this.sendNotification(
      document.ownerId,
      'acknowledgeCompleted',
      title,
      message,
      link,
      emailData
    )

    console.log(`[Notification] NDR acknowledged notification sent to user ${document.ownerId}`);
  }

  /**
   * Notify user when document is returned to them for amendments
   * Only the document owner gets notified
   */
  async notifyDocumentReturnedToOwner(documentId, document, returnedBy, comments) {
    const title = 'Document Returned for Amendments';
    const message = `Your document "${document.title}" (${document.fileCode}) has been returned. ${comments ? 'Comments: ' + comments : 'Please make necessary amendments.'}`;
    const link = `/documents/${documentId}`;

    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      comments: comments || '',
      link: this.buildAbsoluteLink(link)
    }

    await this.sendNotification(
      document.ownerId,
      'documentReturned',
      title,
      message,
      link,
      emailData
    )

    console.log(`[Notification] Document returned notification sent to owner ${document.ownerId}`);
  }

  /**
   * Notify user when their document is approved
   * Only the document owner gets notified
   */
  async notifyOwnerDocumentApproved(documentId, document, approvedBy) {
    const title = 'Document Approved';
    const message = `Your document "${document.title}" (${document.fileCode}) has been approved!`;
    const link = `/documents/${documentId}`;

    // Notify only the document owner
    const approvedByUser = (() => {
      if (approvedBy && typeof approvedBy === 'object') return approvedBy
      if (Number.isFinite(Number(approvedBy))) return null
      return null
    })()
    const approvedByName = approvedByUser
      ? `${approvedByUser.firstName} ${approvedByUser.lastName}`
      : (Number.isFinite(Number(approvedBy))
          ? await (async () => {
              const u = await prisma.user.findUnique({
                where: { id: parseInt(approvedBy, 10) },
                select: { firstName: true, lastName: true }
              })
              return u ? `${u.firstName} ${u.lastName}` : 'Unknown'
            })()
          : 'Unknown')
    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      approvedBy: approvedByName,
      link: this.buildAbsoluteLink(link)
    }

    await this.sendNotification(
      document.ownerId,
      'documentApproved',
      title,
      message,
      link,
      emailData
    )

    console.log(`[Notification] Document approved notification sent to owner ${document.ownerId}`);
  }

  /**
   * Notify user when their document is rejected
   * Only the document owner gets notified
   */
  async notifyOwnerDocumentRejected(documentId, document, rejectedBy, reason) {
    const title = 'Document Rejected';
    const message = `Your document "${document.title}" (${document.fileCode}) has been rejected. ${reason ? 'Reason: ' + reason : ''}`;
    const link = `/documents/${documentId}`;

    // Notify only the document owner
    const rejectedByUser = (() => {
      if (rejectedBy && typeof rejectedBy === 'object') return rejectedBy
      if (Number.isFinite(Number(rejectedBy))) return null
      return null
    })()
    const rejectedByName = rejectedByUser
      ? `${rejectedByUser.firstName} ${rejectedByUser.lastName}`
      : (Number.isFinite(Number(rejectedBy))
          ? await (async () => {
              const u = await prisma.user.findUnique({
                where: { id: parseInt(rejectedBy, 10) },
                select: { firstName: true, lastName: true }
              })
              return u ? `${u.firstName} ${u.lastName}` : 'Unknown'
            })()
          : 'Unknown')
    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      rejectedBy: rejectedByName,
      comments: reason || '',
      link: this.buildAbsoluteLink(link)
    }

    await this.sendNotification(
      document.ownerId,
      'documentRejected',
      title,
      message,
      link,
      emailData
    )

    console.log(`[Notification] Document rejected notification sent to owner ${document.ownerId}`);
  }

  /**
   * Notify specific assigned approver (not all approvers)
   */
  async notifySpecificUserApprovalRequired(approverId, documentId, document, requestedById = null) {
    const title = 'Document Needs Your Approval';
    const message = `Document "${document.title}" (${document.fileCode}) has been assigned to you for approval`;
    const link = `/documents/${documentId}`;

    const requestedBy = requestedById
      ? await prisma.user.findUnique({ where: { id: requestedById }, select: { firstName: true, lastName: true } })
      : null
    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      reviewedBy: requestedBy ? `${requestedBy.firstName} ${requestedBy.lastName}` : 'Unknown',
      link: this.buildAbsoluteLink(link)
    }

    await this.sendNotification(
      approverId,
      'approvalRequest',
      title,
      message,
      link,
      emailData
    )

    console.log(`[Notification] Approval request sent to specific approver ${approverId}`);
  }

  /**
   * Notify specific assigned reviewer (not all reviewers)
   */
  async notifySpecificUserReviewRequired(reviewerId, documentId, document, assignedById = null) {
    const title = 'Document Assigned for Review';
    const message = `Document "${document.title}" (${document.fileCode}) has been assigned to you for review`;
    const link = `/documents/${documentId}`;

    const assignedBy = assignedById
      ? await prisma.user.findUnique({ where: { id: assignedById }, select: { firstName: true, lastName: true } })
      : null
    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      assignedBy: assignedBy ? `${assignedBy.firstName} ${assignedBy.lastName}` : 'Unknown',
      link: this.buildAbsoluteLink(link)
    }

    await this.sendNotification(
      reviewerId,
      'reviewAssigned',
      title,
      message,
      link,
      emailData
    )

    console.log(`[Notification] Review request sent to specific reviewer ${reviewerId}`);
  }

  /**
   * Notify document owner when document is reviewed and forwarded
   */
  async notifyOwnerDocumentReviewed(documentId, document, reviewedBy) {
    const title = 'Document Reviewed';
    const message = `Your document "${document.title}" (${document.fileCode}) has been reviewed and forwarded for approval`;
    const link = `/documents/${documentId}`;

    const reviewedByUser = Number.isFinite(Number(reviewedBy))
      ? await prisma.user.findUnique({ where: { id: parseInt(reviewedBy, 10) }, select: { firstName: true, lastName: true } })
      : (reviewedBy && typeof reviewedBy === 'object' ? reviewedBy : null)

    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      reviewedBy: reviewedByUser ? `${reviewedByUser.firstName} ${reviewedByUser.lastName}` : 'Unknown',
      link: this.buildAbsoluteLink(link)
    }

    await this.sendNotification(
      document.ownerId,
      'reviewCompleted',
      title,
      message,
      link,
      emailData
    )

    console.log(`[Notification] Review completion notification sent to owner ${document.ownerId}`);
  }

  /**
   * Notify approver when document has been reviewed (assigned to them)
   */
  async notifyApproverDocumentReady(approverId, documentId, document) {
    const title = 'Document Ready for Your Approval';
    const message = `Document "${document.title}" (${document.fileCode}) has been reviewed and is ready for your approval`;
    const link = `/documents/${documentId}`;

    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      reviewedBy: document.owner ? `${document.owner.firstName} ${document.owner.lastName}` : 'Unknown',
      link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}${link}`
    }

    await this.sendNotification(
      approverId,
      'approvalRequest',
      title,
      message,
      link,
      emailData
    )

    console.log(`[Notification] Document ready notification sent to approver ${approverId}`);
  }

  /**
   * Clean up old notifications
   */
  async cleanupOldNotifications(daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    await prisma.notification.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate
        },
        isRead: true
      }
    });
  }

  /**
   * Get notification preferences from settings
   */
  async getNotificationPreferences() {
    try {
      const settings = await configService.getNotificationSettings();
      const base = String(settings?.frontendUrl || '').trim()
      if (base) {
        this._cachedFrontendUrl = base.endsWith('/') ? base.slice(0, -1) : base
      }
      return settings.notifications || {};
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
      return {};
    }
  }

  /**
   * Send notification (in-app and/or email based on preferences)
   */
  async sendNotification(userId, type, title, message, link, emailData = null) {
    const preferences = await this.getNotificationPreferences();
    const systemPref = preferences[type] || { email: false, inApp: true }
    const userPrefRow = await prisma.userPreference.findUnique({
      where: { userId },
      select: { notifications: true }
    })
    const userPref = this.getUserEventPreference(userPrefRow?.notifications, type)

    const eventPreference = {
      inApp: Boolean(systemPref.inApp) && userPref?.inApp !== false,
      email: Boolean(systemPref.email) && userPref?.email !== false
    }

    // Send in-app notification
    if (eventPreference.inApp) {
      try {
        await this.createNotification(userId, type, title, message, link);
      } catch (error) {
        console.error(`Failed to create in-app notification for ${type}:`, error);
      }
    }

    // Send email notification
    const effectiveEmailData = emailData || { title, message, link }
    effectiveEmailData.link = this.buildAbsoluteLink(link)

    if (eventPreference.email) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            firstName: true,
            lastName: true
          }
        });

        if (user && user.email) {
          effectiveEmailData.recipientEmail = effectiveEmailData.recipientEmail || user.email
          effectiveEmailData.recipientName = effectiveEmailData.recipientName
            || `${user.firstName || ''} ${user.lastName || ''}`.trim()
            || user.email
          await emailService.sendNotificationEmail(user.email, type, effectiveEmailData);
        }
      } catch (error) {
        console.error(`Failed to send email notification for ${type}:`, error);
      }
    }
  }

  /**
   * Send bulk notifications (in-app and/or email based on preferences)
   */
  async sendBulkNotifications(userIds, type, title, message, link, emailData = null) {
    console.log(`[NotificationService] sendBulkNotifications called for type: ${type}, users: ${userIds.length}`);
    
    const preferences = await this.getNotificationPreferences();
    console.log(`[NotificationService] Notification preferences for ${type}:`, preferences[type]);

    const systemPref = preferences[type] || { email: false, inApp: true }
    const userPrefs = await prisma.userPreference.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, notifications: true }
    })
    const prefByUserId = new Map(
      userPrefs.map((p) => [p.userId, this.getUserEventPreference(p.notifications, type)])
    )

    const effective = userIds.map((id) => {
      const up = prefByUserId.get(id)
      return {
        userId: id,
        inApp: Boolean(systemPref.inApp) && up?.inApp !== false,
        email: Boolean(systemPref.email) && up?.email !== false
      }
    })
    const inAppUserIds = effective.filter((x) => x.inApp).map((x) => x.userId)
    const emailUserIds = effective.filter((x) => x.email).map((x) => x.userId)

    // Send in-app notifications
    if (inAppUserIds.length > 0) {
      console.log(`[NotificationService] Creating in-app notifications for ${inAppUserIds.length} users`);
      try {
        await this.createBulkNotifications(inAppUserIds, type, title, message, link);
        console.log(`[NotificationService] In-app notifications created successfully`);
      } catch (error) {
        console.error(`Failed to create bulk in-app notifications for ${type}:`, error);
      }
    } else {
      console.log(`[NotificationService] In-app notifications disabled for ${type}`);
    }

    // Send email notifications
    const effectiveEmailData = emailData || { title, message, link }
    effectiveEmailData.link = this.buildAbsoluteLink(link)

    if (emailUserIds.length > 0) {
      console.log(`[NotificationService] Sending email notifications`);
      try {
        // Get user emails
        const users = await prisma.user.findMany({
          where: { id: { in: emailUserIds } },
          select: { email: true }
        });

        for (const user of users) {
          if (user.email) {
            try {
              await emailService.sendNotificationEmail(user.email, type, effectiveEmailData);
            } catch (error) {
              console.error(`Failed to send email to ${user.email}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to send bulk email notifications for ${type}:`, error);
      }
    } else {
      console.log(`[NotificationService] Email notifications disabled or no recipients for ${type}`);
    }
  }

  /**
   * Notify about document submission with email support
   */
  async notifyDocumentSubmittedWithEmail(documentId, document) {
    console.log(`[NotificationService] notifyDocumentSubmittedWithEmail called for document ${documentId}`);
    
    const reviewers = await this.findActiveUsersByRoleName('reviewer')

    console.log(`[NotificationService] Found ${reviewers.length} active reviewers:`, reviewers.map(r => r.email));

    if (reviewers.length === 0) {
      console.log(`[NotificationService] No reviewers found, skipping notification`);
      return 0;
    }

    const title = 'New Document for Review';
    const message = `Document "${document.title}" (${document.fileCode}) has been submitted for review`;
    const link = `/documents/${documentId}`;

    const emailData = {
      title: document.title,
      fileCode: document.fileCode,
      submittedBy: document.owner ? `${document.owner.firstName} ${document.owner.lastName}` : 'Unknown',
      link: this.buildAbsoluteLink(link)
    };

    await this.sendBulkNotifications(
      reviewers.map(r => r.id),
      'documentSubmitted',
      title,
      message,
      link,
      emailData
    )

    return reviewers.length;
  }

  /**
   * Send email notification directly (for backward compatibility)
   */
  async sendEmailNotification(to, subject, html) {
    try {
      await emailService.sendEmail({ to, subject, html });
      return { sent: true };
    } catch (error) {
      console.error('Failed to send email:', error);
      return { sent: false, reason: error.message };
    }
  }
}

module.exports = new NotificationService();
