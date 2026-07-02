import React, { useState, useEffect } from 'react'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import api from '../api/axios'
import ConfirmModal, { AlertModal } from '../components/ConfirmModal'
import { usePreferences } from '../contexts/PreferencesContext'
import { createDefaultNotificationPreferences, normalizeNotificationPreferences, notificationEventCategories } from '../constants/notificationEvents'
import { normalizeAppPath } from '../utils/normalizeUrl'

// Tab Navigation Component
function TabNavigation({ activeTab, onTabChange, t }) {
  const tabs = [
    { 
      id: 'profile', 
      label: t('profile_info'), 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    },
    { 
      id: 'security', 
      label: t('security'), 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
    },
    { 
      id: 'notifications', 
      label: t('notifications'), 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
    },
    { 
      id: 'preferences', 
      label: t('preferences'), 
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
    }
  ]

  return (
    <div className="mb-6 border-b border-border" data-tour-id="profile-tabbar">
      <nav className="flex space-x-8 overflow-x-auto" aria-label="Settings Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            data-tour-id={`profile-tab-${tab.id}`}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === tab.id
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-muted hover:text-ink hover:border-border'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

// Profile Information Tab
function ProfileInformation() {
  const { t } = usePreferences()
  const [formData, setFormData] = useState({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@company.com',
    phone: '+60 12-345 6789',
    department: 'IT Department',
    position: 'Senior Document Controller',
    employeeId: 'EMP-2024-001',
    dateJoined: '2024-01-15'
  })
  const [loading, setLoading] = useState(true)
  const [profileImage, setProfileImage] = useState(null)
  const [profileImageFile, setProfileImageFile] = useState(null)
  const [departments, setDepartments] = useState([])
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })

  // Load user data from backend on mount
  useEffect(() => {
    loadUserData()
    loadDepartments()
  }, [])

  const loadDepartments = async () => {
    try {
      const res = await api.get('/system/config/departments')
      setDepartments(res.data?.data?.departments || [])
    } catch (error) {
      console.error('Failed to load departments:', error)
    }
  }

  const loadUserData = async () => {
    try {
      // Try to get user from localStorage first
      const savedUser = localStorage.getItem('user')
      if (savedUser) {
        const user = JSON.parse(savedUser)
        setFormData({
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
          phone: user.phone || '',
          department: user.department || '',
          position: user.position || '',
          employeeId: user.employeeId || '',
          dateJoined: user.dateJoined || user.createdAt ? new Date(user.createdAt).toISOString().split('T')[0] : ''
        })
        
        // Load profile image if exists
        if (user.profileImage) {
          setProfileImage(normalizeAppPath(user.profileImage))
        }
      }
      
      // Also fetch fresh data from backend
      const response = await api.get('/auth/me')
      if (response.data?.data?.user) {
        const user = response.data.data.user
        setFormData({
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
          phone: user.phone || '',
          department: user.department || '',
          position: user.position || '',
          employeeId: user.employeeId || '',
          dateJoined: user.dateJoined || user.createdAt ? new Date(user.createdAt).toISOString().split('T')[0] : ''
        })
        
        // Load profile image if exists
        if (user.profileImage) {
          setProfileImage(normalizeAppPath(user.profileImage))
        }
        
        // Update localStorage
        localStorage.setItem('user', JSON.stringify(user))
      }
    } catch (error) {
      console.error('Failed to load user data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setAlertModal({ show: true, title: 'Error', message: 'File size must be less than 2MB', type: 'error' })
        return
      }
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setAlertModal({ show: true, title: 'Error', message: 'Please upload an image file', type: 'error' })
        return
      }
      
      setProfileImageFile(file)
      const reader = new FileReader()
      reader.onload = (event) => {
        setProfileImage(event.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      // Create FormData to handle both text data and file upload
      const data = new FormData()
      data.append('firstName', formData.firstName)
      data.append('lastName', formData.lastName)
      data.append('email', formData.email)
      data.append('phone', formData.phone)
      data.append('department', formData.department)
      data.append('position', formData.position)
      data.append('employeeId', formData.employeeId)
      data.append('dateJoined', formData.dateJoined)
      
      // Add profile image if uploaded
      if (profileImageFile) {
        data.append('profileImage', profileImageFile)
      }
      
      const response = await api.put('/user/profile', data, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      // Update localStorage with new user data
      if (response.data?.data?.user) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}')
        const updatedUser = { ...currentUser, ...response.data.data.user }
        localStorage.setItem('user', JSON.stringify(updatedUser))
        
        // Dispatch custom event to notify other components (like Topbar)
        window.dispatchEvent(new Event('userProfileUpdated'))
      }
      
      setAlertModal({ show: true, title: 'Success', message: 'Profile updated successfully!', type: 'success' })
    } catch (error) {
      console.error('Failed to update profile:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to update profile. Please try again.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Profile Picture */}
      <div className="card p-6">
        <h3 className="mb-4 text-lg font-semibold text-ink">{t('profile_picture')}</h3>
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-4xl font-bold overflow-hidden">
              {profileImage ? (
                <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                `${formData.firstName[0]}${formData.lastName[0]}`
              )}
            </div>
          </div>
          <div className="flex-1">
            <p className="mb-3 text-sm text-ink-secondary">
              {t('upload_photo_desc')}
            </p>
            <div className="flex gap-3">
              <label className="cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-brand-hover">
                {t('upload_new_photo')}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
              </label>
              {profileImage && (
                <button
                  onClick={() => {
                    setProfileImage(null)
                    setProfileImageFile(null)
                  }}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
                >
                  {t('remove')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <div className="card p-6">
        <h3 className="mb-4 text-lg font-semibold text-ink">{t('personal_info')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-secondary">
              {t('first_name')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-secondary">
              {t('last_name')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-secondary">
              {t('email_address')} <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-secondary">
              {t('phone_number')}
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>
      </div>

      {/* Work Information */}
      <div className="card p-6">
        <h3 className="mb-4 text-lg font-semibold text-ink">{t('work_info')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-secondary">{t('employee_id')}</label>
            <input
              type="text"
              value={formData.employeeId}
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-border bg-surface-muted px-3 py-2 text-ink-muted outline-none"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-secondary">{t('department')}</label>
            <select
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              <option value="">{t('select_department')}</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.name}>{dept.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-secondary">{t('position')}</label>
            <input
              type="text"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-secondary">{t('date_joined')}</label>
            <input
              type="date"
              value={formData.dateJoined}
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-border bg-surface-muted px-3 py-2 text-ink-muted outline-none"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-border px-6 py-2 font-medium text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
        >
          {t('cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="rounded-lg bg-brand px-6 py-2 font-medium text-ink-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          {loading ? t('saving') : t('save_changes')}
        </button>
      </div>

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </div>
  )
}

// Security Tab
function SecuritySettings() {
  const { t, formatRelativeTime } = usePreferences()
  const defaultPasswordStrength = {
    score: 0,
    hasMinLength: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasNumber: false,
    hasSpecialChar: false
  }
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  })
  const [passwordStrength, setPasswordStrength] = useState(defaultPasswordStrength)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorMethod, setTwoFactorMethod] = useState('email')
  const [hasAuthenticator, setHasAuthenticator] = useState(false)
  const [authenticatorSetup, setAuthenticatorSetup] = useState(null)
  const [authenticatorCode, setAuthenticatorCode] = useState('')
  const [settingUpAuthenticator, setSettingUpAuthenticator] = useState(false)
  const [verifyingAuthenticator, setVerifyingAuthenticator] = useState(false)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [sessions, setSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [changingPassword, setChangingPassword] = useState(false)

  const checkPasswordStrength = (password) => {
    const strength = {
      score: 0,
      hasMinLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecialChar: /[!@#$%^&*]/.test(password)
    }

    if (strength.hasMinLength) strength.score++
    if (strength.hasUpperCase) strength.score++
    if (strength.hasLowerCase) strength.score++
    if (strength.hasNumber) strength.score++
    if (strength.hasSpecialChar) strength.score++

    setPasswordStrength(strength)
  }

  const handleNewPasswordChange = (value) => {
    setPasswords((prev) => ({ ...prev, new: value }))
    checkPasswordStrength(value)
  }

  // Load sessions on mount
  useEffect(() => {
    loadSessions()
    loadUserSettings()
  }, [])

  const parseUserAgent = (ua) => {
    if (!ua) return t('unknown_device')
    
    // Detect browser
    let browser = 'Unknown Browser'
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome'
    else if (ua.includes('Firefox')) browser = 'Firefox'
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari'
    else if (ua.includes('Edg')) browser = 'Edge'
    else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera'
    
    // Detect OS
    let os = 'Unknown OS'
    if (ua.includes('Windows NT 10')) os = 'Windows 10/11'
    else if (ua.includes('Windows')) os = 'Windows'
    else if (ua.includes('Mac OS X')) os = 'macOS'
    else if (ua.includes('Linux')) os = 'Linux'
    else if (ua.includes('Android')) os = 'Android'
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
    
    return `${os} - ${browser}`
  }

  const loadSessions = async () => {
    try {
      const res = await api.get('/auth/sessions')
      const sessionsData = res.data?.data?.sessions || []
      const currentToken = localStorage.getItem('token')
      
      setSessions(sessionsData.map(s => ({
        id: s.id,
        device: parseUserAgent(s.userAgent),
        location: s.ipAddress === '::1' || s.ipAddress === '127.0.0.1' ? 'Localhost' : t('unknown_location'),
        ip: s.ipAddress === '::1' ? '127.0.0.1' : (s.ipAddress || 'Unknown'),
        lastActive: s.createdAt ? formatRelativeTime(s.createdAt) : 'Unknown',
        current: s.token === currentToken
      })))
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoadingSessions(false)
    }
  }

  const loadUserSettings = async () => {
    try {
      const res = await api.get('/auth/2fa/status')
      const payload = res.data?.data || {}
      setTwoFactorEnabled(payload.twoFactorEnabled || false)
      setTwoFactorMethod(payload.method || 'email')
      setHasAuthenticator(Boolean(payload.hasAuthenticator))
    } catch (error) {
      console.error('Failed to load 2FA status:', error)
      try {
        const res = await api.get('/auth/me')
        if (res.data?.data?.user) {
          setTwoFactorEnabled(res.data.data.user.twoFactorEnabled || false)
          setTwoFactorMethod(res.data.data.user.twoFactorMethod || 'email')
          setHasAuthenticator(Boolean(res.data.data.user.twoFactorSecret))
        }
      } catch (fallbackError) {
        console.error('Failed to load user settings:', fallbackError)
        const savedUser = localStorage.getItem('user')
        if (savedUser) {
          const user = JSON.parse(savedUser)
          setTwoFactorEnabled(user.twoFactorEnabled || false)
          setTwoFactorMethod(user.twoFactorMethod || 'email')
          setHasAuthenticator(false)
        }
      }
    }
  }

  const handleSetupAuthenticator = async () => {
    setSettingUpAuthenticator(true)
    try {
      const res = await api.post('/auth/2fa/setup-authenticator', {
        issuer: 'FileNix / DMS'
      })
      setAuthenticatorSetup(res.data?.data || null)
      setAuthenticatorCode('')
      setAlertModal({
        show: true,
        title: 'Authenticator Setup',
        message: 'Scan QR code in your authenticator app, then enter the 6-digit code to verify.',
        type: 'info'
      })
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to generate authenticator setup',
        type: 'error'
      })
    } finally {
      setSettingUpAuthenticator(false)
    }
  }

  const handleVerifyAuthenticator = async () => {
    if (!authenticatorCode) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'Please enter the authenticator code', type: 'error' })
      return
    }

    setVerifyingAuthenticator(true)
    try {
      const res = await api.post('/auth/2fa/verify-authenticator', { code: authenticatorCode })
      const enabled = res.data?.data?.twoFactorEnabled || false
      setTwoFactorEnabled(enabled)
      setTwoFactorMethod('app')
      setHasAuthenticator(true)
      setAuthenticatorSetup(null)
      setAuthenticatorCode('')
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Authenticator app has been enabled successfully',
        type: 'success'
      })
    } catch (error) {
      setAlertModal({
        show: true,
        title: 'Error',
        message: error.response?.data?.message || 'Invalid authenticator code',
        type: 'error'
      })
    } finally {
      setVerifyingAuthenticator(false)
    }
  }

  const handleToggle2FA = async (enabled) => {
    try {
      await api.put('/auth/2fa', { enabled })
      setTwoFactorEnabled(enabled)
      
      // Update localStorage
      const savedUser = localStorage.getItem('user')
      if (savedUser) {
        const user = JSON.parse(savedUser)
        user.twoFactorEnabled = enabled
        localStorage.setItem('user', JSON.stringify(user))
      }
      
      setAlertModal({ 
        show: true, 
        title: 'Success', 
        message: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'} successfully`, 
        type: 'success' 
      })
    } catch (error) {
      console.error('Failed to toggle 2FA:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to update 2FA setting', type: 'error' })
    }
  }

  const handlePasswordChange = async () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'All fields are required', type: 'error' })
      return
    }
    if (passwords.new !== passwords.confirm) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'New passwords do not match!', type: 'error' })
      return
    }
    const meetsAllPasswordRequirements =
      passwordStrength.hasMinLength &&
      passwordStrength.hasUpperCase &&
      passwordStrength.hasLowerCase &&
      passwordStrength.hasNumber &&
      passwordStrength.hasSpecialChar

    if (!meetsAllPasswordRequirements) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'new password set does not follow password requirements', type: 'error' })
      return
    }
    setChangingPassword(true)
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwords.current,
        newPassword: passwords.new
      })
      setAlertModal({ show: true, title: 'Success', message: 'Password changed successfully!', type: 'success' })
      setPasswords({ current: '', new: '', confirm: '' })
      setPasswordStrength(defaultPasswordStrength)
    } catch (error) {
      const backendMessage = error.response?.data?.message
      const message = backendMessage && /validation failed/i.test(backendMessage)
        ? 'new password set does not follow password requirements'
        : (backendMessage || 'Failed to change password')
      setAlertModal({ show: true, title: 'Error', message, type: 'error' })
    } finally {
      setChangingPassword(false)
    }
  }

  const handleTerminateSession = (sessionId) => {
    setConfirmModal({
      show: true,
      title: 'Terminate Session',
      message: 'Are you sure you want to terminate this session?',
      onConfirm: async () => {
        setConfirmModal({ show: false, title: '', message: '', onConfirm: null })
        try {
          await api.delete(`/auth/sessions/${sessionId}`)
          setSessions(sessions.filter(s => s.id !== sessionId))
          setAlertModal({ show: true, title: 'Success', message: 'Session terminated successfully', type: 'success' })
        } catch (error) {
          setAlertModal({ show: true, title: 'Error', message: 'Failed to terminate session', type: 'error' })
        }
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <div className="card p-6">
        <h3 className="mb-4 text-lg font-semibold text-ink">{t('change_password')}</h3>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-secondary">
              {t('current_password')}
            </label>
            <input
              type="password"
              value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-secondary">
              {t('new_password')}
            </label>
            <input
              type="password"
              value={passwords.new}
              onChange={(e) => handleNewPasswordChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            {passwords.new && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-surface-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        passwordStrength.score <= 2 ? 'bg-red-500' :
                        passwordStrength.score === 3 ? 'bg-yellow-500' :
                        passwordStrength.score === 4 ? 'bg-blue-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                    ></div>
                  </div>
                  <span className={`text-xs font-medium ${
                    passwordStrength.score <= 2 ? 'text-red-600' :
                    passwordStrength.score === 3 ? 'text-yellow-600' :
                    passwordStrength.score === 4 ? 'text-blue-600' :
                    'text-green-600'
                  }`}>
                    {passwordStrength.score <= 2 ? t('weak') :
                      passwordStrength.score === 3 ? t('fair') :
                      passwordStrength.score === 4 ? t('good') :
                      t('strong')}
                  </span>
                </div>

                <div className="rounded-lg bg-surface-muted p-3 space-y-1.5 border border-border">
                  <p className="mb-2 text-xs font-medium text-ink-secondary">{t('pass_req_title')}</p>
                  <div className="flex items-center gap-2">
                    {passwordStrength.hasMinLength ?
                      <CheckCircleIcon className="h-4 w-4 text-green-500" /> :
                      <XCircleIcon className="h-4 w-4 text-red-500" />}
                    <span className={`text-xs ${passwordStrength.hasMinLength ? 'text-green-700' : 'text-red-700'}`}>
                      {t('pass_req_min_len')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordStrength.hasUpperCase ?
                      <CheckCircleIcon className="h-4 w-4 text-green-500" /> :
                      <XCircleIcon className="h-4 w-4 text-red-500" />}
                    <span className={`text-xs ${passwordStrength.hasUpperCase ? 'text-green-700' : 'text-red-700'}`}>
                      {t('pass_req_upper')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordStrength.hasLowerCase ?
                      <CheckCircleIcon className="h-4 w-4 text-green-500" /> :
                      <XCircleIcon className="h-4 w-4 text-red-500" />}
                    <span className={`text-xs ${passwordStrength.hasLowerCase ? 'text-green-700' : 'text-red-700'}`}>
                      {t('pass_req_lower')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordStrength.hasNumber ?
                      <CheckCircleIcon className="h-4 w-4 text-green-500" /> :
                      <XCircleIcon className="h-4 w-4 text-red-500" />}
                    <span className={`text-xs ${passwordStrength.hasNumber ? 'text-green-700' : 'text-red-700'}`}>
                      {t('pass_req_number')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordStrength.hasSpecialChar ?
                      <CheckCircleIcon className="h-4 w-4 text-green-500" /> :
                      <XCircleIcon className="h-4 w-4 text-red-500" />}
                    <span className={`text-xs ${passwordStrength.hasSpecialChar ? 'text-green-700' : 'text-red-700'}`}>
                      {t('pass_req_special')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-secondary">
              {t('confirm_new_password')}
            </label>
            <input
              type="password"
              value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <button
            onClick={handlePasswordChange}
            disabled={changingPassword}
            className="rounded-lg bg-brand px-6 py-2 font-medium text-ink-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {changingPassword ? t('updating') : t('update_password')}
          </button>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="mb-2 text-lg font-semibold text-ink">{t('two_factor_auth')}</h3>
            <p className="mb-4 text-sm text-ink-secondary">
              {t('two_factor_desc')}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={twoFactorEnabled}
              onChange={(e) => handleToggle2FA(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-border after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
          </label>
        </div>
        {twoFactorEnabled && (
          <div className="mt-4 p-4 rounded-lg border border-[var(--dms-color-info-ink)]/20 bg-[var(--dms-color-info-soft)]">
            <p className="text-sm text-[var(--dms-color-info-ink)]">
              {t('two_factor_enabled_desc')}
            </p>
            <p className="mt-1 text-xs text-[var(--dms-color-info-ink)]">
              Method: {twoFactorMethod === 'app' ? 'Authenticator App' : 'Email Verification'}
            </p>
          </div>
        )}
        <div className="mt-4 p-4 border border-border rounded-lg bg-surface-muted">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Authenticator App</p>
              <p className="mt-0.5 text-xs text-ink-secondary">
                {hasAuthenticator
                  ? 'Configured. You can use app code during login when available.'
                  : 'Set up Google/Microsoft Authenticator for stronger 2FA.'}
              </p>
            </div>
            {!hasAuthenticator && (
              <button
                onClick={handleSetupAuthenticator}
                disabled={settingUpAuthenticator}
                className="px-3 py-1.5 text-xs font-medium bg-brand text-ink-inverse rounded hover:bg-brand-hover disabled:opacity-50"
              >
                {settingUpAuthenticator ? 'Generating...' : 'Set Up App'}
              </button>
            )}
          </div>

          {hasAuthenticator && (
            <span className="inline-block mt-3 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
              Authenticator configured
            </span>
          )}

          {authenticatorSetup && (
            <div className="mt-4 p-3 bg-surface border border-border rounded-lg space-y-3">
              <div className="flex justify-center">
                <img src={authenticatorSetup.qrCodeDataUrl} alt="Authenticator QR Code" className="w-44 h-44 rounded border border-border" />
              </div>
              <div>
                <p className="text-xs text-ink-secondary mb-1">Manual key (if QR scan unavailable):</p>
                <p className="text-xs font-mono break-all bg-surface-muted p-2 rounded border border-border text-ink">
                  {authenticatorSetup.manualKey}
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={authenticatorCode}
                  onChange={(e) => setAuthenticatorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="flex-1 px-3 py-2 border border-border rounded-lg text-sm outline-none bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
                <button
                  onClick={handleVerifyAuthenticator}
                  disabled={verifyingAuthenticator}
                  className="px-3 py-2 text-sm font-medium bg-[var(--dms-color-success-ink)] text-[color:var(--dms-color-bg-canvas)] rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {verifyingAuthenticator ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </div>
          )}
        </div>
        {!twoFactorEnabled && hasAuthenticator && (
          <div className="mt-3 p-3 rounded-lg border border-[var(--dms-color-warning-ink)]/20 bg-[var(--dms-color-warning-soft)]">
            <p className="text-xs text-[var(--dms-color-warning-ink)]">
              Authenticator is configured but 2FA is currently disabled. Toggle 2FA on to enforce it on your account.
            </p>
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-ink mb-4">{t('active_sessions')}</h3>
        <p className="text-sm text-ink-secondary mb-4">
          {t('active_sessions_desc')}
        </p>
        <div className="space-y-3">
          {loadingSessions ? (
            <p className="text-sm text-ink-muted">{t('loading_sessions')}</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('no_active_sessions')}</p>
          ) : sessions.map((session) => (
            <div key={session.id} className="border border-border rounded-lg p-4 bg-surface">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-ink">{session.device}</p>
                    {session.current && (
                      <span className="px-2 py-0.5 bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)] text-xs font-medium rounded">
                        {t('current')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-secondary">{session.location}</p>
                  <p className="text-xs text-ink-muted mt-1">
                    IP: {session.ip} • Last active: {session.lastActive}
                  </p>
                </div>
                {!session.current && (
                  <button
                    onClick={() => handleTerminateSession(session.id)}
                    className="text-sm text-[var(--dms-color-danger-ink)] hover:opacity-90 font-medium"
                  >
                    {t('terminate')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>


      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false, title: '', message: '', onConfirm: null })}
      />
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </div>
  )
}

// Notifications Tab
function NotificationSettings() {
  const { t } = usePreferences()
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState(createDefaultNotificationPreferences())
  const [adminChannels, setAdminChannels] = useState(null)

  // Load notification settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const [userRes, adminRes] = await Promise.allSettled([
        api.get('/user/notification-settings'),
        api.get('/config/notification-settings')
      ])

      if (userRes.status === 'fulfilled' && userRes.value?.data?.data) {
        setSettings(normalizeNotificationPreferences(userRes.value.data.data))
      }

      if (adminRes.status === 'fulfilled') {
        const adminSettings = adminRes.value?.data?.data?.settings
        const notifications = adminSettings?.notifications || {}
        const keys = notificationEventCategories.flatMap((c) => c.items.map((i) => i.key))
        const emailNotifications = Object.fromEntries(keys.map((key) => [key, notifications[key]?.email ?? true]))
        const inAppNotifications = Object.fromEntries(keys.map((key) => [key, notifications[key]?.inApp ?? true]))
        setAdminChannels({ emailNotifications, inAppNotifications })
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/user/notification-settings', normalizeNotificationPreferences(settings))
      setAlertModal({ show: true, title: 'Success', message: 'Notification settings saved successfully!', type: 'success' })
    } catch (error) {
      setAlertModal({ show: true, title: 'Error', message: 'Failed to save notification settings', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const NotificationToggle = ({
    label,
    description,
    emailChecked,
    inAppChecked,
    onEmailChange,
    onInAppChange,
    adminEmailEnabled,
    adminInAppEnabled
  }) => {
    const emailDisabledByAdmin = adminEmailEnabled === false
    const inAppDisabledByAdmin = adminInAppEnabled === false
    const emailMutedByUser = adminEmailEnabled !== false && emailChecked === false
    const inAppMutedByUser = adminInAppEnabled !== false && inAppChecked === false

    return (
      <div className="py-3 border-b border-border last:border-0">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="font-medium text-ink text-sm">{label}</p>
            <p className="text-xs text-ink-muted mt-0.5">{description}</p>
            {(emailDisabledByAdmin || inAppDisabledByAdmin || emailMutedByUser || inAppMutedByUser) && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {emailDisabledByAdmin && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-surface-muted text-ink-muted border border-border">
                    Email disabled by admin
                  </span>
                )}
                {inAppDisabledByAdmin && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-surface-muted text-ink-muted border border-border">
                    In-app disabled by admin
                  </span>
                )}
                {emailMutedByUser && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-surface-muted text-ink-muted border border-border">
                    Email muted by you
                  </span>
                )}
                {inAppMutedByUser && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-surface-muted text-ink-muted border border-border">
                    In-app muted by you
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-4 ml-4">
            <label className={`flex items-center gap-1.5 ${emailDisabledByAdmin ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={emailChecked}
                onChange={onEmailChange}
                disabled={emailDisabledByAdmin}
                className="w-4 h-4 text-brand border-border rounded focus:ring-brand/20"
              />
              <span className="text-xs text-ink-secondary">Email</span>
            </label>
            <label className={`flex items-center gap-1.5 ${inAppDisabledByAdmin ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={inAppChecked}
                onChange={onInAppChange}
                disabled={inAppDisabledByAdmin}
                className="w-4 h-4 text-brand border-border rounded focus:ring-brand/20"
              />
              <span className="text-xs text-ink-secondary">In-App</span>
            </label>
          </div>
        </div>
      </div>
    )
  }

  const NotificationCategory = ({ title, icon, items }) => (
    <div className="card p-5 mb-4">
      <h4 className="text-md font-semibold text-ink mb-3 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h4>
      <div>
        {items.map((item) => (
          <NotificationToggle
            key={item.key}
            label={item.label}
            description={item.description}
            emailChecked={settings.emailNotifications[item.key] ?? true}
            inAppChecked={settings.inAppNotifications[item.key] ?? true}
            adminEmailEnabled={adminChannels?.emailNotifications?.[item.key]}
            adminInAppEnabled={adminChannels?.inAppNotifications?.[item.key]}
            onEmailChange={(e) => setSettings({
              ...settings,
              emailNotifications: { ...settings.emailNotifications, [item.key]: e.target.checked }
            })}
            onInAppChange={(e) => setSettings({
              ...settings,
              inAppNotifications: { ...settings.inAppNotifications, [item.key]: e.target.checked }
            })}
          />
        ))}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card p-5">
        <h3 className="text-lg font-semibold text-ink mb-2">{t('notification_preferences')}</h3>
        <p className="text-sm text-ink-secondary">
          {t('notification_desc')}
        </p>
        {adminChannels && (
          <p className="text-xs text-ink-muted mt-2">
            Admin settings control the maximum delivery. If admin turns Email or In-App off for an event, it cannot be enabled here.
          </p>
        )}
      </div>

      {notificationEventCategories.map((category) => (
        <NotificationCategory
          key={category.id}
          title={category.title}
          icon={category.icon}
          items={category.items}
        />
      ))}

      {/* Email Digest */}
      <div className="card p-5">
        <h4 className="text-md font-semibold text-ink mb-2">📧 {t('email_digest')}</h4>
        <p className="text-sm text-ink-secondary mb-3">
          {t('email_digest_desc')}
        </p>
        <select
          value={settings.digestFrequency}
          onChange={(e) => setSettings({ ...settings, digestFrequency: e.target.value })}
          className="w-full max-w-xs px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
        >
          <option value="realtime">Real-time (Send immediately)</option>
          <option value="hourly">Hourly Digest</option>
          <option value="daily">Daily Digest</option>
          <option value="weekly">Weekly Digest</option>
        </select>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-brand text-ink-inverse rounded-lg hover:bg-brand-hover transition-colors font-medium disabled:opacity-50"
        >
          {saving ? t('saving') : t('save_notification_settings')}
        </button>
      </div>

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </div>
  )
}

// Preferences Tab
function PreferencesSettings() {
  const { updatePreferences, t } = usePreferences()
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState({
    language: 'en',
    timezone: 'Asia/Kuala_Lumpur',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    itemsPerPage: 15,
    defaultView: 'list'
  })

  // Load preferences on mount
  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      const res = await api.get('/user/preferences')
      if (res.data?.data) {
        setPreferences(prev => ({ ...prev, ...res.data.data }))
      }
    } catch (error) {
      console.error('Failed to load preferences:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updatePreferences(preferences)
      setAlertModal({ show: true, title: 'Success', message: 'Preferences saved successfully!', type: 'success' })
    } catch (error) {
      setAlertModal({ show: true, title: 'Error', message: 'Failed to save preferences', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = () => {
    setConfirmModal({
      show: true,
      title: t('deactivate_account'),
      message: t('deactivate_desc') || 'Are you sure you want to deactivate your account? You will be logged out immediately.',
      type: 'danger',
      onConfirm: async () => {
        setConfirmModal({ show: false, title: '', message: '', onConfirm: null })
        try {
          await api.post('/auth/deactivate')
          // Clear local storage and redirect to login
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          window.location.href = '/login'
        } catch (error) {
          console.error('Failed to deactivate account:', error)
          setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to deactivate account', type: 'error' })
        }
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Localization */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-ink mb-4">{t('localization')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-2">{t('language')}</label>
            <select
              value={preferences.language}
              onChange={(e) => setPreferences({ ...preferences, language: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg outline-none bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
            >
              <option value="en">English</option>
              <option value="ms">Bahasa Malaysia</option>
              <option value="zh">中文 (Chinese)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-2">{t('timezone')}</label>
            <select
              value={preferences.timezone}
              onChange={(e) => setPreferences({ ...preferences, timezone: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg outline-none bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
            >
              <option value="Asia/Kuala_Lumpur">Kuala Lumpur (GMT+8)</option>
              <option value="Asia/Singapore">Singapore (GMT+8)</option>
              <option value="Asia/Bangkok">Bangkok (GMT+7)</option>
              <option value="Asia/Jakarta">Jakarta (GMT+7)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-2">{t('date_format')}</label>
            <select
              value={preferences.dateFormat}
              onChange={(e) => setPreferences({ ...preferences, dateFormat: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg outline-none bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY (20/11/2025)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (11/20/2025)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (2025-11-20)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-2">{t('time_format')}</label>
            <select
              value={preferences.timeFormat}
              onChange={(e) => setPreferences({ ...preferences, timeFormat: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg outline-none bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
            >
              <option value="24h">24-hour (14:30)</option>
              <option value="12h">12-hour (2:30 PM)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Display Preferences */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-ink mb-4">{t('display_preferences')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-2">{t('items_per_page')}</label>
            <select
              value={preferences.itemsPerPage}
              onChange={(e) => setPreferences({ ...preferences, itemsPerPage: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-border rounded-lg outline-none bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
            >
              <option value={10}>10 items</option>
              <option value={15}>15 items</option>
              <option value={25}>25 items</option>
              <option value={50}>50 items</option>
              <option value={100}>100 items</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-2">{t('default_view')}</label>
            <select
              value={preferences.defaultView}
              onChange={(e) => setPreferences({ ...preferences, defaultView: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg outline-none bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
            >
              <option value="list">List View</option>
              <option value="grid">Grid View</option>
              <option value="compact">Compact View</option>
            </select>
          </div>
        </div>
      </div>

      {/* Account Actions */}
      <div className="card p-6 border border-[var(--dms-color-danger-ink)]/20">
        <h3 className="text-lg font-semibold text-[var(--dms-color-danger-ink)] mb-4">{t('danger_zone')}</h3>
        <div className="space-y-4">
          <div className="flex items-start justify-between p-4 border border-[var(--dms-color-danger-ink)]/20 rounded-lg bg-[var(--dms-color-danger-soft)]">
            <div className="flex-1">
              <p className="font-medium text-ink">{t('export_data')}</p>
              <p className="text-sm text-ink-secondary mt-1">
                {t('export_data_desc')}
              </p>
            </div>
            <button className="px-4 py-2 border border-border bg-surface text-ink-secondary rounded-lg hover:bg-surface-muted transition-colors text-sm font-medium whitespace-nowrap ml-4">
              {t('export_btn')}
            </button>
          </div>
          <div className="flex items-start justify-between p-4 border border-[var(--dms-color-danger-ink)]/30 rounded-lg bg-[var(--dms-color-danger-soft)]">
            <div className="flex-1">
              <p className="font-medium text-[var(--dms-color-danger-ink)]">{t('deactivate_account')}</p>
              <p className="text-sm text-ink-secondary mt-1">
                {t('deactivate_desc')}
              </p>
            </div>
            <button 
              onClick={handleDeactivate}
              className="px-4 py-2 bg-[var(--dms-color-danger-ink)] text-[color:var(--dms-color-bg-canvas)] rounded-lg hover:opacity-90 transition-colors text-sm font-medium whitespace-nowrap ml-4"
            >
              {t('deactivate_btn')}
            </button>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="px-6 py-2 bg-brand text-ink-inverse rounded-lg hover:bg-brand-hover transition-colors font-medium disabled:opacity-50"
        >
          {saving ? t('saving') : t('save_preferences')}
        </button>
      </div>

      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false, title: '', message: '', onConfirm: null })}
      />

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </div>
  )
}

// Main Profile Settings Component
export default function ProfileSettings() {
  const { t } = usePreferences()
  const [activeTab, setActiveTab] = useState('profile')

  return (
    <div className="p-6 space-y-6" data-tour-id="profile-page">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink">{t('profile_settings')}</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            {t('manage_account')}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} t={t} />

      {/* Tab Content */}
      <div>
        {activeTab === 'profile' && <ProfileInformation />}
        {activeTab === 'security' && <SecuritySettings />}
        {activeTab === 'notifications' && <NotificationSettings />}
        {activeTab === 'preferences' && <PreferencesSettings />}
      </div>
    </div>
  )
}
