import React, { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { hasAnyPermission } from '../utils/permissions'
import { usePreferences } from '../contexts/PreferencesContext'
import api from '../api/axios'
import AppNavItem from './layout/AppNavItem'

const menuItems = [
  { 
    name: 'Dashboard', 
    translationKey: 'dashboard',
    path: '/dashboard',
    module: 'dashboard',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
  },
  { 
    name: 'New Document Request', 
    translationKey: 'new_document_request',
    path: '/new-document-request',
    module: 'newDocumentRequest',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  },
  { 
    name: 'My Documents Status', 
    translationKey: 'my_documents_status',
    path: '/my-documents',
    module: 'myDocumentsStatus',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  },
  { 
    name: 'Project Tracking', 
    translationKey: 'project_tracking',
    path: '/project-tracking',
    module: 'projectTracking',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2m-6 4h6m-6 4h6m-6 4h6M9 5a2 2 0 114 0h-4z" /></svg>
  },
  { 
    name: 'Draft Documents', 
    translationKey: 'draft_documents',
    path: '/drafts',
    module: 'documents.draft',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
  },
  {
    name: 'EPC Registry',
    translationKey: 'rfid_epc_registry',
    path: '/rfid-epc-registry',
    module: 'documents.rfidRegistry',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V7a2 2 0 00-2-2h-3M4 11v6a2 2 0 002 2h3m5-14h-4m0 14h4m-5-9h6m-6 4h6M7 7h.01M17 17h.01" /></svg>
  },
  { 
    name: 'Review and Approval', 
    translationKey: 'review_approval',
    path: '/review-approval',
    module: 'documents.review',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  },
  { 
    name: 'Published Documents', 
    translationKey: 'published_documents',
    path: '/published',
    module: 'documents.published',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  },
  { 
    name: 'Superseded & Obsolete', 
    translationKey: 'superseded_obsolete',
    path: '/archived',
    module: 'documents.superseded',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
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
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  },
  { 
    name: 'Logs & Report', 
    translationKey: 'logs_report',
    path: '/logs',
    module: 'logsReport.activityLogs',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  },
  { 
    name: 'Master Record', 
    translationKey: 'master_record',
    path: '/master-record',
    module: 'masterRecord',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
  },
  { 
    name: 'Profile Settings', 
    translationKey: 'profile_settings',
    path: '/profile',
    module: null, // Always show - no permission required
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
  }
]

export default function Sidebar({ isOpen, onClose, isCollapsed }) {
  const { t } = usePreferences()
  const location = useLocation()
  const [tourTargetPath, setTourTargetPath] = useState('')

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
  
  // Listen for permission changes
  useEffect(() => {
    const loadRfidRegistryStatus = async () => {
      try {
        const res = await api.get('/epc-registry/status')
        const enabled = Boolean(res.data?.data?.enabled)
        setRfidRegistryEnabled(enabled)
      } catch (error) {
        console.error('Failed to load RFID EPC registry status:', error)
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
      <aside className={`app-sidebar dms-scrollbar hidden h-full overflow-y-auto overflow-x-hidden transition-all duration-200 md:block ${isCollapsed ? 'md:w-sidebar-collapsed p-2' : 'md:w-sidebar lg:w-sidebar-lg p-3 lg:p-4'}`} style={{ backgroundColor: 'var(--dms-sidebar-bg)' }}>
        <nav className="space-y-1.5">
          {visibleMenuItems.map((item) => (
            <AppNavItem
              key={item.path}
              item={{...item, name: t(item.translationKey), tourId: pathToTourId(item.path)}}
              active={isItemActive(item.path)}
              isTourTarget={tourTargetPath === item.path}
              collapsed={Boolean(isCollapsed)}
            />
          ))}
        </nav>
      </aside>

      {/* Mobile overlay sidebar */}
      <div className={`fixed inset-0 z-40 md:hidden ${isOpen ? '' : 'pointer-events-none'}`} aria-hidden={!isOpen}>
        <div className={`absolute inset-0 bg-black/40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}></div>
        <div className={`dms-scrollbar absolute left-0 top-0 h-full w-[min(18rem,85vw)] overflow-y-auto overflow-x-hidden p-4 transform transition-transform ${isOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ backgroundColor: 'var(--dms-sidebar-bg)' }}>
          <div className="mb-4 flex items-center justify-end">
            <button onClick={onClose} className="rounded-xl p-2 text-white transition-colors hover:bg-white/10">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav className="space-y-1.5">
            {visibleMenuItems.map((item) => (
              <AppNavItem
                key={item.path}
                item={{...item, name: t(item.translationKey), tourId: pathToTourId(item.path)}}
                active={isItemActive(item.path)}
                isTourTarget={tourTargetPath === item.path}
                onClick={onClose}
                collapsed={false}
              />
            ))}
          </nav>
        </div>
      </div>
    </>
  )
}
