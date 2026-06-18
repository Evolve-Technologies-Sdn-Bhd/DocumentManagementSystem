import React, { useEffect, useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Topbar from './Topbar'
import Sidebar from './Sidebar'
import RightPanel from './RightPanel'
import { usePreferences } from '../contexts/PreferencesContext'
import { applyTheme, readLandingPageSettings, readThemeSettings, subscribeBranding, subscribeLandingPageSettings } from '../utils/branding'
import GettingStartedModal from './GettingStartedModal'
import { isAdmin } from '../utils/permissions'
import GuidedTour from './GuidedTour'
import UploadProgressBar from './UploadProgressBar'
import AppShell from './layout/AppShell'
import PageContainer from './ui/PageContainer'
import IconButton from './ui/IconButton'

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { t } = usePreferences()
  const [sidebarPosition, setSidebarPosition] = useState('left')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('dms_sidebar_collapsed')
      if (stored === null) {
        return typeof window !== 'undefined' && window.matchMedia
          ? window.matchMedia('(max-width: 1366px)').matches
          : false
      }
      return stored === '1'
    } catch {
      return false
    }
  })
  const [footerConfig, setFooterConfig] = useState(null)
  const [gettingStartedOpen, setGettingStartedOpen] = useState(false)
  const [showAdminGuide, setShowAdminGuide] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourId, setTourId] = useState('user')
  const [showGettingStartedHint, setShowGettingStartedHint] = useState(false)
  // Right panel stays collapsed by default so small laptops keep more room for content.
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(true)

  useLayoutEffect(() => {
    const loadThemeSettings = () => {
      const savedTheme = readThemeSettings()
      if (savedTheme) {
        try {
          setSidebarPosition(savedTheme.sidebarPosition || 'left')
          applyTheme(savedTheme)
        } catch (e) {
          console.error('Failed to parse theme settings', e)
        }
      } else {
        // Apply Corporate theme as default if no theme is saved
        const defaultCorporateTheme = {
          primaryColor: '#003366',
          secondaryColor: '#0066CC',
          accentColor: '#FF9900',
          successColor: '#28A745',
          warningColor: '#FFC107',
          errorColor: '#DC3545',
          infoColor: '#0066CC',
          sidebarBgColor: '#003366',
          sidebarTextColor: '#E3F2FD',
          mainBgColor: '#F5F7FA',
          tabTextColor: '#64748B',
          tabActiveColor: '#0066CC',
          btnPrimaryBg: '#003366',
          btnPrimaryText: '#FFFFFF',
          btnPrimaryHover: '#002244',
          btnSecondaryBg: '#E3F2FD',
          btnSecondaryText: '#003366',
          btnSecondaryHover: '#BBDEFB',
          landingNavBg: '#003366',
          landingNavText: '#FFFFFF',
          landingHeroGradientStart: '#003366',
          landingHeroGradientMid: '#0066CC',
          landingHeroGradientEnd: '#0099FF',
          landingHeroText: '#FFFFFF',
          landingButtonPrimary: '#FF9900',
          landingButtonPrimaryText: '#FFFFFF',
          landingButtonSecondary: 'transparent',
          landingButtonSecondaryText: '#FFFFFF',
          landingAboutBg: '#F5F7FA',
          landingCoreFeaturesBg: '#F5F7FA',
          landingSystemFeaturesBg: 'linear-gradient(to bottom right, #E3F2FD, #F5F7FA)',
          landingRolesBg: 'linear-gradient(to bottom right, #BBDEFB, #E3F2FD, #F5F7FA)',
          landingWorkflowBg: 'linear-gradient(to bottom right, #F5F7FA, #E3F2FD)',
          landingContactBg: '#E3F2FD',
          loginBgGradientStart: '#F5F7FA',
          loginBgGradientEnd: '#E3F2FD',
          loginCardBg: '#FFFFFF',
          loginButtonBg: '#003366',
          loginButtonText: '#FFFFFF',
          loginButtonHover: '#002244',
          loginAccentBg: '#E3F2FD',
          loginAccentIcon: '#0066CC',
          fontFamily: 'Roboto',
          borderRadiusMedium: '0.25rem',
          spacingScale: 'normal',
          sidebarPosition: 'left'
        }
        setSidebarPosition('left')
        applyTheme(defaultCorporateTheme)
      }
    }

    loadThemeSettings()

    return subscribeBranding(() => loadThemeSettings())
  }, [])

  useEffect(() => {
    setIsRightPanelCollapsed(true)
  }, [location.pathname])

  useEffect(() => {
    const loadFooterConfig = () => {
      try {
        const parsed = readLandingPageSettings()
        if (!parsed || typeof parsed !== 'object') {
          setFooterConfig(null)
          return
        }
        setFooterConfig(parsed)
      } catch {
        setFooterConfig(null)
      }
    }

    loadFooterConfig()
    return subscribeLandingPageSettings(() => loadFooterConfig())
  }, [])

  useEffect(() => {
    setShowAdminGuide(isAdmin())
    try {
      const raw = localStorage.getItem('user')
      const user = raw ? JSON.parse(raw) : null
      const key = `dms_getting_started_seen_${user?.id || 'anon'}`
      const seen = localStorage.getItem(key)
      if (!seen) {
        setGettingStartedOpen(true)
        setShowGettingStartedHint(true)
      }
    } catch {
      setGettingStartedOpen(true)
      setShowGettingStartedHint(true)
    }
  }, [])

  const startTour = (id) => {
    setTourId(id === 'admin' ? 'admin' : 'user')
    setTourOpen(true)
    setShowGettingStartedHint(false)
  }

  const footerLinks = Array.isArray(footerConfig?.footerLinks) ? footerConfig.footerLinks : []
  const footerCopyright = footerConfig?.copyrightText

  return (
    <>
      <UploadProgressBar />
      <AppShell
        topbar={(
          <Topbar
            onMenu={() => setSidebarOpen(true)}
            onGettingStarted={() => {
              setGettingStartedOpen(true)
              setShowGettingStartedHint(false)
            }}
            showGettingStartedHint={showGettingStartedHint}
          />
        )}
        leftSidebar={sidebarPosition === 'left' ? (
          <div className="relative">
            <Sidebar
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              isCollapsed={sidebarCollapsed}
            />
            <IconButton
              onClick={() => {
                setSidebarCollapsed((prev) => {
                  const next = !prev
                  try {
                    localStorage.setItem('dms_sidebar_collapsed', next ? '1' : '0')
                  } catch {
                  }
                  return next
                })
              }}
              size="sm"
              className="absolute -right-4 bottom-20 z-30 hidden rounded-full md:flex"
              aria-label="Toggle sidebar"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarCollapsed ? 'M13 5l7 7-7 7M4 5h2v14H4z' : 'M11 19l-7-7 7-7M20 5h-2v14h2z'} />
              </svg>
            </IconButton>
          </div>
        ) : null}
        rightSidebar={sidebarPosition === 'right' ? (
          <div className="relative">
            <Sidebar
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              isCollapsed={sidebarCollapsed}
            />
            <IconButton
              onClick={() => {
                setSidebarCollapsed((prev) => {
                  const next = !prev
                  try {
                    localStorage.setItem('dms_sidebar_collapsed', next ? '1' : '0')
                  } catch {
                  }
                  return next
                })
              }}
              size="sm"
              className="absolute -left-4 bottom-20 z-30 hidden rounded-full md:flex"
              aria-label="Toggle sidebar"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarCollapsed ? 'M11 19l-7-7 7-7M20 5h-2v14h2z' : 'M13 5l7 7-7 7M4 5h2v14H4z'} />
              </svg>
            </IconButton>
          </div>
        ) : null}
        rightPanel={(
          <RightPanel
            onCollapseChange={setIsRightPanelCollapsed}
            isCollapsed={isRightPanelCollapsed}
          />
        )}
        footer={(
          <footer className="dms-footer mt-8 border-t border-border">
            <PageContainer className="pb-4 pt-4">
              <div className="text-center">
                <p className="text-xs text-ink-muted">
                  {footerCopyright || `© 2025 CLB Groups. ${t('rights_reserved')}`}
                </p>
                {footerLinks.length > 0 && (
                  <div className="mt-2 flex flex-col items-center justify-center gap-2 text-xs sm:flex-row sm:flex-wrap">
                    {footerLinks.map((link, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="hidden text-ink-soft sm:inline">|</span>}
                        <button
                          type="button"
                          onClick={() => { if (link?.pdf) window.open(link.pdf, '_blank', 'noopener,noreferrer') }}
                          className="text-brand transition-colors hover:underline disabled:text-ink-soft disabled:hover:no-underline"
                          disabled={!link?.pdf}
                        >
                          {link?.label || ''}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            </PageContainer>
          </footer>
        )}
      >
        <PageContainer size={location.pathname === '/dashboard' ? 'dashboard' : 'default'}>
          <GettingStartedModal
            open={gettingStartedOpen}
            showAdminGuide={showAdminGuide}
            onStartTour={startTour}
            onClose={() => {
              try {
                const raw = localStorage.getItem('user')
                const user = raw ? JSON.parse(raw) : null
                const key = `dms_getting_started_seen_${user?.id || 'anon'}`
                localStorage.setItem(key, '1')
              } catch {
              }
              setGettingStartedOpen(false)
              setShowGettingStartedHint(false)
            }}
          />
          <GuidedTour
            open={tourOpen}
            tourId={tourId}
            onClose={({ completed } = {}) => {
              if (completed) {
                try {
                  const raw = localStorage.getItem('user')
                  const user = raw ? JSON.parse(raw) : null
                  const key = `dms_getting_started_tour_done_${user?.id || 'anon'}_${tourId}`
                  localStorage.setItem(key, '1')
                } catch {
                }
              }
              setTourOpen(false)
            }}
          />
          {children}
        </PageContainer>
      </AppShell>
    </>
  )
}
