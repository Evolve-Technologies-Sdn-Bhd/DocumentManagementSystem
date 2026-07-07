import React from 'react'
import { normalizeAppPath } from '../../utils/normalizeUrl'

function getUserInitials(name) {
  const safeName = String(name || 'User').trim()
  const names = safeName.split(' ').filter(Boolean)
  if (names.length >= 2) {
    return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
  }
  return safeName.substring(0, 2).toUpperCase()
}

export default function AppUserMenu({
  currentUser,
  open,
  onToggle,
  onClose,
  onProfile,
  onSettings,
  onLogout,
  t
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 rounded-2xl border border-topbar-border bg-topbar-surface py-1.5 pl-1.5 pr-3 text-ink-inverse transition-colors hover:bg-topbar-surfaceHover"
        aria-label="User menu"
      >
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-400 to-brand text-sm font-semibold text-white shadow-dms-soft">
          {currentUser.profileImage ? (
            <img src={normalizeAppPath(currentUser.profileImage)} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            getUserInitials(currentUser.name)
          )}
        </div>
        <div className="hidden text-left lg:block">
          <div className="max-w-[160px] truncate text-sm font-medium leading-tight">{currentUser.name}</div>
          <div className="max-w-[160px] truncate text-xs text-ink-meta">{currentUser.department || currentUser.role}</div>
        </div>
        <svg className={['h-4 w-4 transition-transform', open ? 'rotate-180' : ''].filter(Boolean).join(' ')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-[18px] border border-border bg-surface shadow-dms-lg">
            <div className="border-b border-border bg-surface-muted px-4 py-4">
              <div className="font-semibold text-ink">{currentUser.name}</div>
              <div className="mt-1 text-xs text-ink-muted">{currentUser.email}</div>
              {currentUser.department && <div className="mt-1 text-xs text-ink-muted">{currentUser.department}</div>}
              <div className="mt-1 text-xs text-ink-muted">{currentUser.role}</div>
            </div>
            <div className="p-2">
              <button
                type="button"
                onClick={onProfile}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <svg className="h-5 w-5 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>{t('my_profile')}</span>
              </button>
              <button
                type="button"
                onClick={onSettings}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <svg className="h-5 w-5 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{t('settings')}</span>
              </button>
              <div className="my-2 border-t border-border" />
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--dms-color-danger-ink)] transition-colors hover:bg-[var(--dms-color-danger-soft)]"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>{t('logout')}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
