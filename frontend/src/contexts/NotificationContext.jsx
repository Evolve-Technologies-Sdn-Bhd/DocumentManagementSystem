import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/axios'
import { createDefaultNotificationPreferences, normalizeNotificationPreferences } from '../constants/notificationEvents'

const NotificationContext = createContext()

// Create a silent API instance that doesn't log 404 errors (for optional backend sync)
const silentApi = api

export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}

// Notification types mapped to preference keys
export const NOTIFICATION_TYPES = {
  DOCUMENT_ASSIGNED: 'reviewAssigned',
  DOCUMENT_RETURNED: 'documentReturned',
  REVIEW_REQUIRED: 'reviewRequired',
  DOCUMENT_SUBMITTED: 'documentSubmitted',
  APPROVAL_REQUIRED: 'approvalRequired',
  APPROVAL_REQUEST: 'approvalRequest',
  REVIEW_COMPLETED: 'reviewCompleted',
  DOCUMENT_APPROVED: 'documentApproved',
  APPROVAL_GRANTED: 'documentApproved',
  DOCUMENT_REJECTED: 'documentRejected',
  APPROVAL_REJECTED: 'documentRejected',
  ACKNOWLEDGMENT_REQUIRED: 'acknowledgeRequired',
  ACKNOWLEDGEMENT_REQUIRED: 'acknowledgeRequired',
  ACKNOWLEDGMENT_COMPLETED: 'acknowledgeCompleted',
  DOCUMENT_PUBLISHED: 'documentPublished',
  DOCUMENT_SUPERSEDED: 'documentSuperseded',
  DOCUMENT_OBSOLETED: 'documentObsoleted',
  DOCUMENT_EXPIRING: 'documentExpiring',
  DOCUMENT_EXPIRED: 'documentExpired',
  RENEWAL_IN_PROGRESS: 'renewalInProgress',
  RENEWAL_COMPLETED: 'renewalCompleted',
  SYSTEM_ALERT: 'systemAlert'
}

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [preferences, setPreferences] = useState(null)
  const [loading, setLoading] = useState(true)

  const hasAccessToken = () => {
    try {
      return Boolean(localStorage.getItem('token'))
    } catch {
      return false
    }
  }

  // Load user notification preferences
  const loadPreferences = useCallback(async () => {
    try {
      // Try to load from localStorage first
      const savedPreferences = localStorage.getItem('notificationPreferences')
      if (savedPreferences) {
        setPreferences(normalizeNotificationPreferences(JSON.parse(savedPreferences)))
        setLoading(false)
      }

      if (!hasAccessToken()) {
        if (!savedPreferences) {
          const defaults = getDefaultPreferences()
          setPreferences(defaults)
          localStorage.setItem('notificationPreferences', JSON.stringify(defaults))
        }
        return
      }
      
      // Backend sync enabled
      try {
        const res = await silentApi.get('/user/notification-settings')
        const serverPreferences = normalizeNotificationPreferences(
          res.data.data || res.data.data?.settings || res.data.settings || getDefaultPreferences()
        )
        setPreferences(serverPreferences)
        localStorage.setItem('notificationPreferences', JSON.stringify(serverPreferences))
      } catch (apiError) {
        // Backend not available or endpoint doesn't exist, use localStorage
        if (!savedPreferences) {
          const defaults = getDefaultPreferences()
          setPreferences(defaults)
          localStorage.setItem('notificationPreferences', JSON.stringify(defaults))
        }
      }
    } catch (error) {
      console.error('Failed to load notification preferences:', error)
      const defaults = getDefaultPreferences()
      setPreferences(defaults)
      localStorage.setItem('notificationPreferences', JSON.stringify(defaults))
    } finally {
      setLoading(false)
    }
  }, [])

  // Load notifications from backend
  const loadNotifications = useCallback(async () => {
    try {
      if (!hasAccessToken()) {
        const savedNotifications = localStorage.getItem('notifications')
        if (savedNotifications) {
          const parsed = JSON.parse(savedNotifications)
          setNotifications(parsed)
          setUnreadCount(parsed.filter(n => !n.read).length)
        } else {
          setNotifications([])
          setUnreadCount(0)
        }
        return
      }

      // Always fetch from backend first for fresh data
      const res = await silentApi.get('/notifications')
      const backendNotifications = res.data.data?.notifications || res.data.notifications || []
      
      const mapSeverity = (type) => {
        const t = String(type || '').toUpperCase()
        if (t === 'DOCUMENT_APPROVED') return 'success'
        if (t === 'DOCUMENT_REJECTED' || t === 'DOCUMENT_RETURNED') return 'error'
        if (t === 'REVIEW_REQUIRED' || t === 'APPROVAL_REQUIRED' || t === 'ACKNOWLEDGMENT_REQUIRED') return 'warning'
        if (t === 'SYSTEM_ALERT') return 'warning'
        return 'info'
      }

      // Map backend fields to frontend format
      const mappedNotifications = backendNotifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        read: n.isRead,
        severity: mapSeverity(n.type),
        timestamp: n.createdAt,
        createdAt: n.createdAt,
        metadata: n.metadata || {}
      }))
      
      setNotifications(mappedNotifications)
      setUnreadCount(mappedNotifications.filter(n => !n.read).length)
      
      // Save to localStorage as backup only
      localStorage.setItem('notifications', JSON.stringify(mappedNotifications))
    } catch (apiError) {
      // Fallback to localStorage only if backend fails
      try {
        const savedNotifications = localStorage.getItem('notifications')
        if (savedNotifications) {
          const parsed = JSON.parse(savedNotifications)
          setNotifications(parsed)
          setUnreadCount(parsed.filter(n => !n.read).length)
        } else {
          setNotifications([])
          setUnreadCount(0)
        }
      } catch (error) {
        console.error('Failed to load notifications from localStorage:', error)
        setNotifications([])
        setUnreadCount(0)
      }
    }
  }, [])

  // Initialize
  useEffect(() => {
    loadPreferences()
    loadNotifications()
    
    // Poll for new notifications every 5 seconds for faster updates
    const interval = setInterval(loadNotifications, 5000)
    
    return () => clearInterval(interval)
  }, [loadPreferences, loadNotifications])

  // Check if notification should be shown based on user preferences
  const shouldShowNotification = useCallback((type, channel = 'inApp') => {
    if (!preferences) return true // Show by default if preferences not loaded
    
    const channelKey = channel === 'email' ? 'emailNotifications' : 'inAppNotifications'
    const preferenceKey = NOTIFICATION_TYPES[type] || type
    return preferences[channelKey]?.[preferenceKey] !== false
  }, [preferences])

  // Add a new notification
  const addNotification = useCallback((notification) => {
    const { type, title, message, severity = 'info', link = null, metadata = {} } = notification
    
    // Check if this type should be shown
    if (!shouldShowNotification(type, 'inApp')) {
      console.log('Notification type disabled by user:', type)
      return
    }

    const newNotification = {
      id: Date.now() + Math.random(),
      type,
      title,
      message,
      severity, // 'info', 'success', 'warning', 'error'
      link,
      metadata,
      read: false,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }

    const updatedNotifications = [newNotification, ...notifications]
    setNotifications(updatedNotifications)
    setUnreadCount(prev => prev + 1)

    // Save to localStorage
    localStorage.setItem('notifications', JSON.stringify(updatedNotifications))

    // Optionally persist to backend
    if (hasAccessToken()) {
      silentApi.post('/notifications', newNotification).catch(() => {})
    }

    return newNotification
  }, [shouldShowNotification])

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    const updatedNotifications = notifications.map(n =>
      n.id === notificationId ? { ...n, read: true } : n
    )
    setNotifications(updatedNotifications)
    setUnreadCount(prev => Math.max(0, prev - 1))

    // Save to localStorage
    localStorage.setItem('notifications', JSON.stringify(updatedNotifications))

    try {
      if (hasAccessToken()) {
        await silentApi.patch(`/notifications/${notificationId}/read`)
      }
    } catch (error) {
      // Backend endpoint doesn't exist yet, already saved to localStorage
    }
  }, [notifications])

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    const updatedNotifications = notifications.map(n => ({ ...n, read: true }))
    setNotifications(updatedNotifications)
    setUnreadCount(0)

    // Save to localStorage
    localStorage.setItem('notifications', JSON.stringify(updatedNotifications))

    try {
      await silentApi.patch('/notifications/read-all')
    } catch (error) {
      // Backend endpoint doesn't exist yet, already saved to localStorage
    }
  }, [notifications])

  // Clear a notification
  const clearNotification = useCallback(async (notificationId) => {
    const notification = notifications.find(n => n.id === notificationId)
    if (notification && !notification.read) {
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    
    const updatedNotifications = notifications.filter(n => n.id !== notificationId)
    setNotifications(updatedNotifications)

    // Save to localStorage
    localStorage.setItem('notifications', JSON.stringify(updatedNotifications))

    try {
      await silentApi.delete(`/notifications/${notificationId}`)
    } catch (error) {
      // Backend endpoint doesn't exist yet, already saved to localStorage
    }
  }, [notifications])

  // Clear all notifications
  const clearAll = useCallback(async () => {
    setNotifications([])
    setUnreadCount(0)

    // Save to localStorage
    localStorage.setItem('notifications', JSON.stringify([]))

    try {
      await silentApi.delete('/notifications/all')
    } catch (error) {
      // Backend endpoint doesn't exist yet, already saved to localStorage
    }
  }, [])

  // Update preferences
  const updatePreferences = useCallback(async (newPreferences) => {
    const normalizedPreferences = normalizeNotificationPreferences(newPreferences)
    setPreferences(normalizedPreferences)
    
    // Save to localStorage immediately
    localStorage.setItem('notificationPreferences', JSON.stringify(normalizedPreferences))
    
    try {
      await silentApi.put('/user/notification-settings', normalizedPreferences)
    } catch (error) {
      // Backend endpoint doesn't exist yet, already saved to localStorage
      console.log('Notification preferences saved to localStorage (backend not available)')
    }
  }, [])

  const value = {
    notifications,
    unreadCount,
    preferences,
    loading,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAll,
    updatePreferences,
    loadNotifications,
    shouldShowNotification
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

// Default notification preferences
function getDefaultPreferences() {
  return createDefaultNotificationPreferences()
}
