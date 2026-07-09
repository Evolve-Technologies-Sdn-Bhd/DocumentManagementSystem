import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bars3Icon, DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { usePreferences } from '../contexts/PreferencesContext'
import { readBranding, subscribeBranding } from '../utils/branding'
import BrandLogoImage from './ui/BrandLogoImage'
import BrandLogoPreload from './ui/BrandLogoPreload'

export default function PublicTopbar({ onSection }) {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [branding, setBranding] = useState(() => readBranding())

  useEffect(() => {
    setBranding(readBranding())
    return subscribeBranding((next) => setBranding(next))
  }, [])

  const navItems = useMemo(() => ([
    { id: 'home', label: t('hp_home') },
    { id: 'about', label: t('hp_about') },
    { id: 'features', label: t('hp_features') },
    { id: 'workflow', label: 'Overview' },
    { id: 'contact', label: t('hp_contact') }
  ]), [t])

  const goToSection = (id) => {
    if (typeof onSection === 'function') {
      onSection(id)
      return
    }
    navigate(`/#${id}`)
  }

  const goLogin = () => {
    navigate('/login')
  }

  return (
    <nav className="app-topbar fixed top-0 inset-x-0 z-50 text-white shadow-md" style={{ backdropFilter: 'blur(10px)' }}>
      <BrandLogoPreload src={branding.logo} />
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <button type="button" className="flex items-center gap-3 text-left focus-visible:outline-none" onClick={() => navigate('/')} aria-label="Go to home">
            {branding.logo ? (
              <div className="h-10 flex items-center bg-white rounded-lg px-2 shadow-sm">
                <BrandLogoImage
                  src={branding.logo}
                  placeholderSrc={branding.logoPlaceholder}
                  alt="Company Logo"
                  className="max-h-8 max-w-[180px] object-contain"
                />
              </div>
            ) : (
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <DocumentTextIcon className="h-6 w-6" style={{ color: 'var(--dms-primary, #0f6fcf)' }} />
              </div>
            )}
            <div className="hidden md:flex flex-col items-start text-left">
              <span className="text-sm font-semibold">{branding.companyName}</span>
              <span className="text-xs opacity-90">{t('dms_label')}</span>
            </div>
          </button>

          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goToSection(item.id)}
                className="text-white hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {item.label}
              </button>
            ))}

            <button
              type="button"
              onClick={goLogin}
              className="bg-white text-blue-600 px-4 py-2 rounded-lg text-sm font-semibold ml-2 hover:bg-blue-50 transition-colors"
            >
              {t('hp_login')}
            </button>
          </div>

          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center p-2 rounded-lg hover:bg-white/20 transition-colors"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="public-mobile-nav"
            onClick={() => setMobileMenuOpen(v => !v)}
          >
            {mobileMenuOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div id="public-mobile-nav" className="md:hidden border-t border-white/15 bg-[color:var(--dms-primary)]">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setMobileMenuOpen(false); goToSection(item.id) }}
                className="text-left text-white/95 hover:bg-white/15 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {item.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); goLogin() }}
              className="mt-1 bg-white text-blue-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors"
            >
              {t('hp_login')}
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
