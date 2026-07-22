const NOTIFICATION_EVENT_DEFINITIONS = [
  { key: 'documentSubmitted', dbType: 'REVIEW_REQUIRED' },
  { key: 'reviewAssigned', dbType: 'DOCUMENT_ASSIGNED' },
  { key: 'requiredDocumentPicAssigned', dbType: 'DOCUMENT_ASSIGNED' },
  { key: 'reviewRequired', dbType: 'REVIEW_REQUIRED' },
  { key: 'reviewCompleted', dbType: 'STATUS_CHANGED' },
  { key: 'approvalRequest', dbType: 'APPROVAL_REQUIRED' },
  { key: 'approvalRequired', dbType: 'APPROVAL_REQUIRED' },
  { key: 'documentApproved', dbType: 'DOCUMENT_APPROVED' },
  { key: 'documentRejected', dbType: 'DOCUMENT_REJECTED' },
  { key: 'documentReturned', dbType: 'DOCUMENT_RETURNED' },
  { key: 'acknowledgeRequired', dbType: 'ACKNOWLEDGMENT_REQUIRED' },
  { key: 'acknowledgeCompleted', dbType: 'STATUS_CHANGED' },
  { key: 'documentPublished', dbType: 'STATUS_CHANGED' },
  { key: 'documentSuperseded', dbType: 'STATUS_CHANGED' },
  { key: 'documentObsoleted', dbType: 'STATUS_CHANGED' },
  { key: 'documentExpiring', dbType: 'DOCUMENT_EXPIRING' },
  { key: 'documentExpired', dbType: 'DOCUMENT_EXPIRED' },
  { key: 'renewalInProgress', dbType: 'RENEWAL_IN_PROGRESS' },
  { key: 'renewalCompleted', dbType: 'RENEWAL_COMPLETED' },
  { key: 'systemAlert', dbType: 'SYSTEM_ALERT' }
]

const NOTIFICATION_EVENT_KEYS = NOTIFICATION_EVENT_DEFINITIONS.map((event) => event.key)

const NOTIFICATION_EVENT_DB_TYPE_MAP = Object.fromEntries(
  NOTIFICATION_EVENT_DEFINITIONS.map((event) => [event.key, event.dbType])
)

const LEGACY_NOTIFICATION_EVENT_ALIASES = {
  acknowledgementRequired: 'acknowledgeRequired',
  acknowledgmentRequired: 'acknowledgeRequired',
  acknowledgementCompleted: 'acknowledgeCompleted',
  acknowledgmentCompleted: 'acknowledgeCompleted',
  documentAssigned: 'reviewAssigned',
  approvalGranted: 'documentApproved',
  approvalRejected: 'documentRejected',
  systemAlerts: 'systemAlert'
}

const LEGACY_NOTIFICATION_EVENT_EXPANSIONS = {
  reviewRequired: ['documentSubmitted', 'reviewRequired'],
  approvalRequired: ['approvalRequest', 'approvalRequired'],
  documentAssigned: ['reviewAssigned'],
  approvalGranted: ['documentApproved'],
  approvalRejected: ['documentRejected'],
  acknowledgementRequired: ['acknowledgeRequired'],
  acknowledgmentRequired: ['acknowledgeRequired'],
  acknowledgementCompleted: ['acknowledgeCompleted'],
  acknowledgmentCompleted: ['acknowledgeCompleted'],
  systemAlerts: ['systemAlert'],
  statusChanged: [
    'reviewCompleted',
    'acknowledgeCompleted',
    'documentPublished',
    'documentSuperseded',
    'documentObsoleted'
  ]
}

function createDefaultAdminNotificationChannels() {
  return Object.fromEntries(
    NOTIFICATION_EVENT_KEYS.map((key) => [key, { email: true, inApp: true }])
  )
}

function createDefaultUserNotificationPreferences() {
  const base = Object.fromEntries(NOTIFICATION_EVENT_KEYS.map((key) => [key, true]))

  return {
    emailNotifications: { ...base },
    inAppNotifications: { ...base },
    digestFrequency: 'daily',
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    }
  }
}

module.exports = {
  NOTIFICATION_EVENT_DEFINITIONS,
  NOTIFICATION_EVENT_KEYS,
  NOTIFICATION_EVENT_DB_TYPE_MAP,
  LEGACY_NOTIFICATION_EVENT_ALIASES,
  LEGACY_NOTIFICATION_EVENT_EXPANSIONS,
  createDefaultAdminNotificationChannels,
  createDefaultUserNotificationPreferences
}
