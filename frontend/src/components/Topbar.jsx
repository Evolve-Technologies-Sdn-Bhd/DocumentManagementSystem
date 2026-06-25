import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePreferences } from '../contexts/PreferencesContext'
import { normalizeAppPath } from '../utils/normalizeUrl'
import { readBranding, subscribeBranding } from '../utils/branding'
import IconButton from './ui/IconButton'
import AppTopbarBrand from './layout/AppTopbarBrand'
import AppUserMenu from './layout/AppUserMenu'

export default function Topbar({ onMenu, onGettingStarted, showGettingStartedHint }) {
  const { t, themeMode, setThemeMode } = usePreferences()
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
    <div className="app-topbar flex h-topbar items-center justify-between border-b border-topbar-border px-3 shadow-md sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton
          onClick={onMenu}
          className="border-topbar-border bg-topbar-surface text-ink-inverse hover:bg-topbar-surfaceHover hover:text-ink-inverse md:hidden"
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
        <IconButton
          onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
          className="border-topbar-border bg-topbar-surface text-ink-inverse hover:bg-topbar-surfaceHover hover:text-ink-inverse"
          aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {themeMode === 'dark' ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.536 5.95a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414zM17 9a1 1 0 100 2h1a1 1 0 100-2h-1zM4.222 15.95a1 1 0 010 1.414l-.707.707A1 1 0 112.1 16.657l.707-.707a1 1 0 011.414 0zM3 9a1 1 0 100 2H2a1 1 0 100-2h1zm1.222-4.95a1 1 0 10-1.414-1.414L2.1 3.343a1 1 0 001.414 1.414l.707-.707zM10 15a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm4.95-10.778a1 1 0 010 1.414l-.707.707A1 1 0 1112.829 4.93l.707-.707a1 1 0 011.414 0z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          )}
        </IconButton>

        <div className="relative">
          <button
            type="button"
            onClick={() => onGettingStarted?.()}
            className={`flex items-center gap-2 rounded-2xl border border-topbar-border bg-topbar-surface px-3 py-2 text-ink-inverse transition-colors hover:bg-topbar-surfaceHover ${
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
