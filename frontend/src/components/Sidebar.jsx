import React, { useState, useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { hasAnyPermission } from '../utils/permissions'
import { usePreferences } from '../contexts/PreferencesContext'
import api from '../api/axios'
import AppNavItem from './layout/AppNavItem'
import IconButton from './ui/IconButton'

const menuItems = [
  { 
    name: 'Overview', 
    translationKey: 'dashboard_overview',
    path: '/dashboard',
    module: 'dashboard',
    hideIcon: true
  },
  { 
    name: 'Calendar', 
    translationKey: 'calendar',
    path: '/calendar',
    module: 'calendar',
    hideIcon: true
  },
  { 
    name: 'New Document Request', 
    translationKey: 'new_document_request',
    path: '/new-document-request',
    module: 'newDocumentRequest',
    hideIcon: true
  },
  { 
    name: 'My Documents Status', 
    translationKey: 'my_documents_status',
    path: '/documents/my-documents',
    module: 'myDocumentsStatus',
    hideIcon: true
  },
  { 
    name: 'Draft Documents', 
    translationKey: 'draft_documents',
    path: '/documents/drafts',
    module: 'documents.draft',
    hideIcon: true
  },
  { 
    name: 'Project Tracking', 
    translationKey: 'project_tracking',
    path: '/project-tracking',
    module: 'projectTracking',
    hideIcon: true
  },
  {
    name: 'EPC Registry',
    translationKey: 'rfid_epc_registry',
    path: '/rfid-epc-registry',
    module: 'documents.rfidRegistry',
    hideIcon: true
  },
  { 
    name: 'Review and Approval', 
    translationKey: 'review_approval',
    path: '/documents/review-approval',
    module: 'documents.review',
    hideIcon: true
  },
  { 
    name: 'Published Documents', 
    translationKey: 'published_documents',
    path: '/documents/published',
    module: 'documents.published',
    hideIcon: true
  },
  {
    name: 'Expiry Tracking',
    translationKey: 'expiry_tracking',
    path: '/expiry-tracking',
    module: 'expiryTracking',
    hideIcon: true
  },
  {
    name: 'Tender Book Register',
    translationKey: 'tender_book_register',
    path: '/tender-book',
    module: 'crm.tenderBook',
    hideIcon: true
  },
  {
    name: 'FB Enquiry Register',
    translationKey: 'fb_enquiry_register',
    path: '/fb-enquiries',
    module: 'crm.fbEnquiry',
    hideIcon: true
  },
  { 
    name: 'Superseded & Obsolete', 
    translationKey: 'superseded_obsolete',
    path: '/documents/archived',
    module: 'documents.superseded',
    hideIcon: true
  },
  { 
    name: 'Master Record', 
    translationKey: 'master_record',
    path: '/master-record',
    module: 'masterRecord',
    hideIcon: true
  },
  { 
    name: 'Logs & Report', 
    translationKey: 'logs_report',
    path: '/logs',
    module: 'logsReport.activityLogs',
    hideIcon: true
  },
  { 
    name: 'Configuration', 
    translationKey: 'configuration',
    path: '/config',
    module: [
      'configuration.users',
      'configuration.roles',
      'configuration.templates',
      'configuration.templateRequests',
      'configuration.documentTypes',
      'configuration.masterData',
      'configuration.settings',
      'configuration.backup',
      'configuration.cleanup',
      'configuration.auditSettings'
    ],
    hideIcon: true
  },
  { 
    name: 'Profile Settings', 
    translationKey: 'profile_settings',
    path: '/profile',
    module: null, // Always show - no permission required
    hideIcon: true
  }
]

const menuSections = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
    paths: ['/dashboard', '/calendar']
  },
  {
    key: 'workspace',
    label: 'Workspace',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7.5A2.5 2.5 0 015.5 5h4.379a2.5 2.5 0 011.768.732l.621.622a2.5 2.5 0 001.768.732H18.5A2.5 2.5 0 0121 9.586V16.5A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-9z" /></svg>,
    paths: ['/new-document-request', '/documents/my-documents', '/documents/drafts']
  },
  {
    key: 'projects',
    label: 'Projects',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.25 3.75H8.25A2.25 2.25 0 006 6v12a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 18V7.5l-3.75-3.75z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.25 3.75V7.5H18" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 3h3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 14.25l1.5 1.5m0 0l2.25-2.25m-2.25 2.25a3 3 0 11-4.243-4.243 3 3 0 014.243 4.243z" /></svg>,
    paths: ['/project-tracking']
  },
  {
    key: 'documentControl',
    label: 'Document Control',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75l2.25 2.25L15 9.75m-9-4.286l5.357-2.143a1.75 1.75 0 011.286 0L18 5.464A1.75 1.75 0 0119.25 7.09v4.26c0 3.76-2.208 7.17-5.643 8.714l-.964.433a1.75 1.75 0 01-1.286 0l-.964-.433A9.545 9.545 0 014.75 11.35V7.09A1.75 1.75 0 016 5.464z" /></svg>,
    paths: ['/documents/review-approval', '/documents/published', '/expiry-tracking', '/documents/archived']
  },
  {
    key: 'records',
    label: 'Records',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 7.5h15m-15 4.5h15m-15 4.5h9m-9 3h13.5A1.5 1.5 0 0020 18V6a1.5 1.5 0 00-1.5-1.5h-13A1.5 1.5 0 004 6v12a1.5 1.5 0 001.5 1.5z" /></svg>,
    paths: ['/master-record', '/rfid-epc-registry']
  },
  {
    key: 'crm',
    label: 'CRM',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19v-1a3 3 0 00-3-3H7a3 3 0 00-3 3v1" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.5 11a3 3 0 100-6 3 3 0 000 6z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 19v-1a3 3 0 00-2-2.83" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.5 5.17a3 3 0 010 5.66" /></svg>,
    paths: ['/tender-book', '/fb-enquiries']
  },
  {
    key: 'reporting',
    label: 'Reporting',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 19.5h15M7.5 16.5v-4.5m4.5 4.5v-9m4.5 9v-6" /></svg>,
    paths: ['/logs']
  },
  {
    key: 'administration',
    label: 'Settings',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 6h3m-7.5 0H7.5m6 6h4.5m-12 0h4.5m-1.5 6h9m-12 0h1.5M9 4.5v3m6-3v3m-9 3v3m6-3v3m-3 3v3" /></svg>,
    paths: ['/config', '/profile']
  }
]

export default function Sidebar({ isOpen, onClose, isCollapsed }) {
  const { t } = usePreferences()
  const location = useLocation()
  const [tourTargetPath, setTourTargetPath] = useState('')
  const [expandedSections, setExpandedSections] = useState(() => (
    menuSections.reduce((acc, section) => {
      if (section.key === 'dashboard') {
        acc[section.key] = true
      } else {
        acc[section.key] = false
      }
      return acc
    }, {})
  ))

  const pathToTourId = (path) => {
    const cleaned = String(path || '/').replace(/^\//, '')
    const slug = cleaned ? cleaned.replace(/\//g, '-') : 'dashboard'
    return `nav-${slug}`
  }
  const [permissionTrigger, setPermissionTrigger] = useState(0)
  const [rfidRegistryEnabled, setRfidRegistryEnabled] = useState(() => {
    try {
      const savedSettings = localStorage.getItem('dms_document_settings')
      if (!savedSettings) return false
      const parsed = JSON.parse(savedSettings)
      return Boolean(parsed?.rfidEpcRegistryEnabled)
    } catch {
      return false
    }
  })
  
  // Load RFID registry feature flag
  useEffect(() => {
    const loadRfidRegistryStatus = async () => {
      const token = localStorage.getItem('token')
      if (!token) return

      try {
        const res = await api.get('/epc-registry/status')
        const enabled = Boolean(res.data?.data?.enabled)
        setRfidRegistryEnabled(enabled)
      } catch (error) {
        const status = error?.response?.status
        if (status !== 401 && status !== 403) {
          console.warn('RFID EPC registry check skipped – using saved settings.')
        }
      }
    }

    loadRfidRegistryStatus()
  }, [])

  const isItemActive = (path) => {
    if (path === '/project-tracking') {
      return location.pathname === path || location.pathname.startsWith('/project-tracking/')
    }
    return location.pathname === path
  }

  useEffect(() => {
    const handleStorageChange = (e) => {
      // When user data changes in localStorage, re-compute visible items
      if (e.key === 'user' || e.storageArea === localStorage) {
        setPermissionTrigger(prev => prev + 1)
      }
      if (e.key === 'dms_document_settings' || e.storageArea === localStorage) {
        try {
          const savedSettings = localStorage.getItem('dms_document_settings')
          const parsed = savedSettings ? JSON.parse(savedSettings) : {}
          setRfidRegistryEnabled(Boolean(parsed?.rfidEpcRegistryEnabled))
        } catch {
          setRfidRegistryEnabled(false)
        }
      }
    }
    
    // Listen for storage events from other tabs/windows
    window.addEventListener('storage', handleStorageChange)
    
    // Custom event for same-tab localStorage changes
    const handleCustomUserChange = () => {
      setPermissionTrigger(prev => prev + 1)
    }
    const handleDocumentSettingsChange = () => {
      try {
        const savedSettings = localStorage.getItem('dms_document_settings')
        const parsed = savedSettings ? JSON.parse(savedSettings) : {}
        setRfidRegistryEnabled(Boolean(parsed?.rfidEpcRegistryEnabled))
      } catch {
        setRfidRegistryEnabled(false)
      }
    }
    window.addEventListener('userDataChanged', handleCustomUserChange)
    window.addEventListener('documentSettingsChanged', handleDocumentSettingsChange)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('userDataChanged', handleCustomUserChange)
      window.removeEventListener('documentSettingsChanged', handleDocumentSettingsChange)
    }
  }, [])
  
  // Filter menu items based on user permissions
  // Re-compute when permissions change
  const visibleMenuItems = useMemo(() => {
    return menuItems.filter(item => {
      if (item.path === '/rfid-epc-registry' && !rfidRegistryEnabled) return false

      // Always show items without module requirement (like Profile)
      if (!item.module) return true
      
      // Check if user has any permission for this module
      const hasAccess = Array.isArray(item.module)
        ? item.module.some((m) => hasAnyPermission(m))
        : hasAnyPermission(item.module)
      return hasAccess
    })
  }, [permissionTrigger, rfidRegistryEnabled]) // Re-check when permissions or config are updated

  const groupedMenu = useMemo(() => {
    const itemByPath = visibleMenuItems.reduce((acc, item) => {
      acc[item.path] = item
      return acc
    }, {})

    const sections = menuSections
      .map(section => {
        const items = section.paths.map(path => itemByPath[path]).filter(Boolean)
        return { ...section, items }
      })
      .filter(section => section.items.length > 0)

    return { sections }
  }, [visibleMenuItems])

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }))
  }

  const renderNav = (collapsed, onItemClick) => {
    const sectionContainerClass = [
      'space-y-1.5 border-b border-white/10 pb-1.5',
      collapsed ? 'border-transparent bg-transparent p-0' : ''
    ].filter(Boolean).join(' ')

    const sectionHeaderClass = 'flex h-10 w-full items-center gap-2 rounded-2xl px-2 text-left text-[12px] font-semibold leading-4 text-sidebar-text opacity-95 transition hover:bg-sidebar-hover hover:opacity-100 lg:text-[13px]'

    return (
      <nav className="space-y-3">
        {groupedMenu.sections.map(section => {
          const isDashboardSection = section.key === 'dashboard'
          const hasActiveChild = section.items.some(item => isItemActive(item.path))
          
          return (
            <div
              key={section.key}
              className={sectionContainerClass}
            >
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className={[
                    sectionHeaderClass,
                    hasActiveChild ? 'bg-sidebar-hover opacity-100' : ''
                  ].filter(Boolean).join(' ')}
                  aria-expanded={expandedSections[section.key] !== false}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/8 text-sidebar-text">
                    {section.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{section.labelKey ? t(section.labelKey) : section.label}</span>
                  <svg
                    className={`h-4 w-4 shrink-0 opacity-70 transition-transform ${expandedSections[section.key] !== false ? 'rotate-0' : '-rotate-90'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              ) : (
                <>
                  {section.items.slice(0, 1).map((item) => (
                    <AppNavItem
                      key={item.path}
                      item={{...item, name: section.labelKey ? t(section.labelKey) : section.label, icon: section.icon, tourId: pathToTourId(item.path)}}
                      active={hasActiveChild}
                      isTourTarget={tourTargetPath === item.path}
                      onClick={onItemClick}
                      collapsed
                    />
                  ))}
                </>
              )}
              <div className={`${collapsed || expandedSections[section.key] !== false ? 'space-y-1 pt-0' : 'hidden'}`}>
                {section.items.map((item) => (
                  <AppNavItem
                    key={item.path}
                    item={{
                      ...item, 
                      hideIcon: !isDashboardSection, 
                      name: isDashboardSection
                        ? (item.path === '/dashboard' ? 'Overview' : (item.path === '/calendar' ? 'Calendar' : (item.translationKey ? t(item.translationKey) : item.name)))
                        : t(item.translationKey), 
                      tourId: pathToTourId(item.path)
                    }}
                    active={isItemActive(item.path)}
                    isTourTarget={tourTargetPath === item.path}
                    onClick={onItemClick}
                    collapsed={Boolean(collapsed)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </nav>
    )
  }

  useEffect(() => {
    let timer = null
    try {
      const v = localStorage.getItem('dms_guide_target_path') || ''
      if (v) {
        setTourTargetPath(v)
        timer = window.setTimeout(() => {
          try {
            localStorage.removeItem('dms_guide_target_path')
          } catch {
          }
          setTourTargetPath('')
        }, 5000)
      }
    } catch {
    }

    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [location.pathname])

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`app-sidebar dms-scrollbar hidden h-full overflow-y-auto overflow-x-hidden transition-all duration-200 md:block ${isCollapsed ? 'md:w-sidebar-collapsed p-2' : 'md:w-sidebar lg:w-sidebar-lg px-2 py-2.5 lg:px-2.5 lg:py-3'}`} style={{ backgroundColor: 'var(--dms-sidebar-bg)' }}>
        {renderNav(Boolean(isCollapsed), undefined)}
      </aside>

      {/* Mobile overlay sidebar */}
      <div className={`fixed inset-0 z-40 md:hidden ${isOpen ? '' : 'pointer-events-none'}`} aria-hidden={!isOpen}>
        <div className={`absolute inset-0 bg-overlay transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}></div>
        <div className={`dms-scrollbar absolute left-0 top-0 h-full w-[min(18rem,85vw)] overflow-y-auto overflow-x-hidden p-4 transform transition-transform ${isOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ backgroundColor: 'var(--dms-sidebar-bg)' }}>
          <div className="mb-4 flex items-center justify-end">
            <IconButton
              onClick={onClose}
              size="sm"
              className="border-topbar-border bg-topbar-surface text-ink-inverse hover:bg-topbar-surfaceHover hover:text-ink-inverse"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </IconButton>
          </div>
          {renderNav(false, onClose)}
        </div>
      </div>
    </>
  )
}
