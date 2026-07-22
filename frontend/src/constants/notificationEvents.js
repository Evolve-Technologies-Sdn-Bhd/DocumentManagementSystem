export const notificationEventCategories = [
  {
    id: 'reviewApproval',
    title: 'Review & Approval',
    icon: '✅',
    description: 'Notifications for submission, review, approval, return, and acknowledgment flows.',
    items: [
      { key: 'documentSubmitted', label: 'Document Submitted', description: 'When a document is submitted for review.' },
      { key: 'reviewAssigned', label: 'Review Assigned', description: 'When a document is assigned to you for review.' },
      { key: 'requiredDocumentPicAssigned', label: 'Required Document PIC Assigned', description: 'When you are assigned as PIC for a required project document.' },
      { key: 'reviewRequired', label: 'Review Reminder', description: 'Reminder that your review is still pending.' },
      { key: 'reviewCompleted', label: 'Review Completed', description: 'When your document is reviewed and forwarded.' },
      { key: 'approvalRequest', label: 'Approval Request', description: 'When a document is assigned to you for approval.' },
      { key: 'approvalRequired', label: 'Approval Reminder', description: 'Reminder that your approval is still pending.' },
      { key: 'documentApproved', label: 'Document Approved', description: 'When your document has been approved.' },
      { key: 'documentRejected', label: 'Document Rejected', description: 'When your document has been rejected.' },
      { key: 'documentReturned', label: 'Document Returned', description: 'When your document is returned for amendments.' },
      { key: 'acknowledgeRequired', label: 'Acknowledgment Required', description: 'When a published document needs your acknowledgment.' },
      { key: 'acknowledgeCompleted', label: 'Acknowledgment Completed', description: 'When your document request has been acknowledged.' }
    ]
  },
  {
    id: 'documentLifecycle',
    title: 'Document Lifecycle',
    icon: '📄',
    description: 'Notifications for publication and document lifecycle changes.',
    items: [
      { key: 'documentPublished', label: 'Document Published', description: 'When a document is published to all active users.' },
      { key: 'documentSuperseded', label: 'Document Superseded', description: 'When a document is superseded by another document.' },
      { key: 'documentObsoleted', label: 'Document Obsoleted', description: 'When a document is marked obsolete.' }
    ]
  },
  {
    id: 'expiryRenewal',
    title: 'Expiry & Renewal',
    icon: '⏰',
    description: 'Notifications for document expiry tracking and renewal progress.',
    items: [
      { key: 'documentExpiring', label: 'Document Expiring', description: 'Reminder based on the configured expiry reminder thresholds.' },
      { key: 'documentExpired', label: 'Document Expired', description: 'When a tracked document has already expired.' },
      { key: 'renewalInProgress', label: 'Renewal In Progress', description: 'When renewal has started for a tracked document.' },
      { key: 'renewalCompleted', label: 'Renewal Completed', description: 'When a tracked document renewal is completed.' }
    ]
  },
  {
    id: 'system',
    title: 'System Alerts',
    icon: '⚙️',
    description: 'Administrative and platform-level notifications.',
    items: [
      { key: 'systemAlert', label: 'System Alert', description: 'General system alerts such as template request updates.' }
    ]
  }
]

export const notificationEventKeys = notificationEventCategories.flatMap((category) => category.items.map((item) => item.key))

export const legacyNotificationAliases = {
  acknowledgementRequired: 'acknowledgeRequired',
  acknowledgmentRequired: 'acknowledgeRequired',
  acknowledgementCompleted: 'acknowledgeCompleted',
  acknowledgmentCompleted: 'acknowledgeCompleted',
  systemAlerts: 'systemAlert'
}

const legacyNotificationExpansions = {
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

export function createDefaultNotificationPreferences() {
  const enabledByDefault = Object.fromEntries(notificationEventKeys.map((key) => [key, true]))
  return {
    emailNotifications: { ...enabledByDefault },
    inAppNotifications: { ...enabledByDefault },
    digestFrequency: 'daily',
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    }
  }
}

export function normalizeNotificationPreferences(input) {
  const defaults = createDefaultNotificationPreferences()
  const source = input && typeof input === 'object' ? input : {}
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
    const normalizedKey = legacyNotificationAliases[key] || key
    const targets = legacyNotificationExpansions[key]
      || (notificationEventKeys.includes(normalizedKey) ? [normalizedKey] : [])
    for (const targetKey of targets) {
      targetMap[targetKey] = Boolean(value)
    }
  }

  const directEntries = Object.entries(source).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
  for (const [key, value] of directEntries) {
    if (!('email' in value) && !('inApp' in value)) continue
    const normalizedKey = legacyNotificationAliases[key] || key
    const targets = legacyNotificationExpansions[key]
      || (notificationEventKeys.includes(normalizedKey) ? [normalizedKey] : [])
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

  Object.entries(emailMap).forEach(([key, value]) => applyValue(normalized.emailNotifications, key, value))
  Object.entries(inAppMap).forEach(([key, value]) => applyValue(normalized.inAppNotifications, key, value))

  const digestFrequency = String(source.digestFrequency || defaults.digestFrequency).trim().toLowerCase()
  normalized.digestFrequency = ['realtime', 'hourly', 'daily', 'weekly'].includes(digestFrequency)
    ? digestFrequency
    : defaults.digestFrequency

  return normalized
}
