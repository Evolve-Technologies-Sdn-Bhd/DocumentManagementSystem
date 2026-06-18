import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePreferences } from '../contexts/PreferencesContext'
import { normalizeAppPath } from '../utils/normalizeUrl'
import { readBranding, subscribeBranding } from '../utils/branding'
import IconButton from './ui/IconButton'
import AppTopbarBrand from './layout/AppTopbarBrand'
import AppUserMenu from './layout/AppUserMenu'

export default function Topbar({ onMenu, onGettingStarted, showGettingStartedHint }) {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [branding, setBranding] = useState(() => readBranding())
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [currentUser, setCurrentUser] = useState({ name: 'John Doe', email: 'john.doe@company.com', role: 'Document Controller', department: '', profileImage: null })

  useEffect(() => {
    // Load user from localStorage
    const loadUser = () => {
      const savedUser = localStorage.getItem('user')
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser)
          setCurrentUser({
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'User',
            email: user.email || 'user@company.com',
            role: user.role || 'Document Controller',
            department: user.department || '',
            profileImage: normalizeAppPath(user.profileImage) || null
          })
        } catch (e) {
          console.error('Failed to parse user data', e)
        }
      }
    }

    loadUser()

    // Listen for user profile changes
    const handleUserUpdate = (e) => {
      if (e.key === 'user' || e.key === null) {
        loadUser()
      }
    }

    window.addEventListener('storage', handleUserUpdate)

    // Also listen for custom event for same-tab updates
    window.addEventListener('userProfileUpdated', loadUser)

    return () => {
      window.removeEventListener('storage', handleUserUpdate)
      window.removeEventListener('userProfileUpdated', loadUser)
    }
  }, [])

  useEffect(() => {
    setBranding(readBranding())
    return subscribeBranding((next) => setBranding(next))
  }, [])

  const handleLogout = () => {
    // Clear all authentication data
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    // Navigate to login page
    navigate('/login')
  }

  const handleSettings = () => {
    navigate('/config')
    setShowUserMenu(false)
  }

  const handleProfile = () => {
    navigate('/profile')
    setShowUserMenu(false)
  }

  return (
    <div className="app-topbar flex h-topbar items-center justify-between border-b border-white/10 px-3 shadow-md sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton
          onClick={onMenu}
          className="border-white/10 bg-white/10 text-white hover:bg-white/15 hover:text-white md:hidden"
          aria-label="Open menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" clipRule="evenodd" />
          </svg>
        </IconButton>
        <AppTopbarBrand
          logo={branding.logo}
          companyName={branding.companyName}
          appLabel={t('dms_label')}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => onGettingStarted?.()}
            className={`flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white transition-colors hover:bg-white/15 ${
              showGettingStartedHint ? 'animate-pulse ring-2 ring-[var(--dms-color-accent)]' : ''
            }`}
            aria-label={t('getting_started')}
          >
            <span className="hidden sm:inline text-sm font-semibold">{t('first_time_user')}</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {showGettingStartedHint && (
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-border bg-surface p-3 text-ink shadow-dms-lg sm:w-64">
              <div className="text-sm font-semibold">{t('first_time_user_hint_title')}</div>
              <div className="mt-1 text-xs text-ink-muted">{t('first_time_user_hint_body')}</div>
            </div>
          )}
        </div>

        <AppUserMenu
          currentUser={currentUser}
          open={showUserMenu}
          onToggle={() => setShowUserMenu((prev) => !prev)}
          onClose={() => setShowUserMenu(false)}
          onProfile={handleProfile}
          onSettings={handleSettings}
          onLogout={handleLogout}
          t={t}
        />
      </div>
    </div>
  )
}
