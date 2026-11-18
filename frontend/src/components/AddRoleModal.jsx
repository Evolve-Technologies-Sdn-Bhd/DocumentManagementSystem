import React, { useState } from 'react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from './ui/Modal'

export default function AddRoleModal({ onClose, onSubmit, initialData }) {
  const [formData, setFormData] = useState({
    roleName: initialData?.roleName || '',
    description: initialData?.description || ''
  })

  const formatActionLabel = (action) =>
    String(action || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (char) => char.toUpperCase())

  const [permissions, setPermissions] = useState(initialData?.permissions || {})
  const [currentStep, setCurrentStep] = useState(1)
  const [activeModuleId, setActiveModuleId] = useState('dashboard')
  const [moduleSearch, setModuleSearch] = useState('')

  const modules = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      description: 'Main dashboard and analytics overview',
      actions: ['view']
    },
    {
      id: 'documents',
      name: 'Document Management',
      description: 'Complete document lifecycle management',
      submodules: [
        {
          id: 'documents.draft',
          name: 'Draft Documents',
          actions: ['view', 'create', 'update']
        },
        {
          id: 'documents.review',
          name: 'Review & Approval',
          actions: ['view', 'read', 'review', 'approve', 'reject']
        },
        {
          id: 'documents.published',
          name: 'Published Documents',
          actions: ['view', 'read', 'create', 'publish', 'update', 'delete', 'download', 'manageAccess']
        },
        {
          id: 'documents.superseded',
          name: 'Superseded & Obsolete',
          actions: ['view', 'read', 'create', 'update', 'download']
        }
      ]
    },
    {
      id: 'newDocumentRequest',
      name: 'New Document Request',
      description: 'Request new document creation',
      actions: ['view', 'create', 'acknowledge']
    },
    {
      id: 'myDocumentsStatus',
      name: 'My Documents Status',
      description: 'Track personal document status',
      actions: ['view']
    },
    {
      id: 'projectTracking',
      name: 'Project Tracking',
      description: 'Track projects with document requirements by stage',
      actions: ['view', 'searchProject', 'create', 'edit', 'delete', 'projectSetup', 'linkDocument', 'advanceStage', 'manageConfidentialAccess', 'projectControls', 'activityLogs', 'keyInChangeRequest', 'editProject', 'addNextPhase', 'moveToNextStage']
    },
    {
      id: 'expiryTracking',
      name: 'Expiry Tracking',
      description: 'Track document expiry, renewal workflow, and expiry reporting',
      actions: ['view', 'edit', 'renew', 'export']
    },
    {
      id: 'crm',
      name: 'CRM Registers',
      description: 'Tender book and enquiry registers',
      submodules: [
        {
          id: 'crm.tenderBook',
          name: 'Tender Book Register',
          actions: ['view', 'create', 'update', 'delete', 'import', 'export']
        },
        {
          id: 'crm.fbEnquiry',
          name: 'FB Enquiry Register',
          actions: ['view', 'create', 'update', 'delete', 'import', 'export']
        }
      ]
    },
    {
      id: 'configuration',
      name: 'Configuration',
      description: 'System configuration and settings',
      submodules: [
        {
          id: 'configuration.users',
          name: 'Users Management',
          actions: ['view', 'create', 'edit', 'delete', 'activate', 'deactivate']
        },
        {
          id: 'configuration.roles',
          name: 'Roles & Permissions',
          actions: ['view', 'create', 'edit', 'delete', 'assign']
        },
        {
          id: 'configuration.templates',
          name: 'Document Templates',
          actions: ['view', 'read', 'create', 'update', 'delete', 'download']
        },
        {
          id: 'configuration.templateRequests',
          name: 'Template Requests',
          actions: ['view', 'read', 'create', 'update']
        },
        {
          id: 'configuration.documentTypes',
          name: 'Document Types',
          actions: ['view', 'create', 'edit', 'delete']
        },
        {
          id: 'configuration.masterData',
          name: 'Master Data',
          actions: ['view', 'create', 'edit', 'delete']
        },
        {
          id: 'configuration.settings',
          name: 'General Settings',
          actions: ['view', 'edit']
        },
        {
          id: 'configuration.backup',
          name: 'Backup & Recovery',
          actions: ['view', 'backup', 'restore', 'download']
        },
        {
          id: 'configuration.cleanup',
          name: 'Database Cleanup',
          actions: ['view', 'analyze', 'cleanup']
        },
        {
          id: 'configuration.auditSettings',
          name: 'Audit Log Settings',
          actions: ['view', 'edit']
        }
      ]
    },
    {
      id: 'logsReport',
      name: 'Logs & Reports',
      description: 'System logs, reports and analytics',
      submodules: [
        {
          id: 'logsReport.activityLogs',
          name: 'Activity Logs',
          actions: ['view', 'filter', 'export']
        },
        {
          id: 'logsReport.userActivity',
          name: 'User Activity',
          actions: ['view', 'filter', 'export']
        },
        {
          id: 'logsReport.reports',
          name: 'System Reports',
          actions: ['view', 'generate', 'export', 'download']
        },
        {
          id: 'logsReport.analytics',
          name: 'Analytics Dashboard',
          actions: ['view']
        }
      ]
    },
    {
      id: 'masterRecord',
      name: 'Master Record',
      description: 'Central repository of all approved documents',
      actions: ['view', 'search', 'filter', 'export', 'download']
    },
    {
      id: 'documents.rfidRegistry',
      name: 'EPC Registry',
      description: 'EPC generated record listing and export',
      actions: ['view', 'export', 'manage']
    },
    {
      id: 'profileSettings',
      name: 'Profile Settings',
      description: 'Personal profile management',
      actions: ['view', 'edit', 'changePassword']
    }
  ]

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleToggle = (moduleId, action) => {
    setPermissions(prev => ({
      ...prev,
      [moduleId]: {
        ...(prev[moduleId] || {}),
        [action]: !(prev[moduleId]?.[action])
      }
    }))
  }

  const handleSelectAll = (moduleId, actions) => {
    if (actions) {
      const allSelected = {}
      actions.forEach(action => {
        allSelected[action] = true
      })
      setPermissions(prev => ({
        ...prev,
        [moduleId]: allSelected
      }))
      return
    }

    const module = modules.find(m => m.id === moduleId)
    if (!module) return

    const allSelected = {}
    module.actions.forEach(action => {
      allSelected[action] = true
    })

    setPermissions(prev => ({
      ...prev,
      [moduleId]: allSelected
    }))
  }

  const handleDeselectAll = (moduleId) => {
    setPermissions(prev => ({
      ...prev,
      [moduleId]: {}
    }))
  }

  const getSelectedCount = (moduleId) => {
    if (!permissions[moduleId]) return 0
    return Object.values(permissions[moduleId]).filter(Boolean).length
  }

  const getAllModuleIds = (module) => {
    const ids = []
    if (module.actions && module.actions.length > 0) {
      ids.push(module.id)
    }
    if (module.submodules) {
      module.submodules.forEach(sub => ids.push(sub.id))
    }
    return ids
  }

  const getTotalSelectedCount = (module) => {
    const ids = getAllModuleIds(module)
    return ids.reduce((total, id) => total + getSelectedCount(id), 0)
  }

  const getTotalActionsCount = (module) => {
    let total = 0
    if (module.actions && module.actions.length > 0) {
      total += module.actions.length
    }
    if (module.submodules) {
      module.submodules.forEach(sub => {
        total += sub.actions?.length || 0
      })
    }
    return total
  }

  const getGrandTotal = () => {
    let selected = 0
    let total = 0
    modules.forEach(module => {
      selected += getTotalSelectedCount(module)
      total += getTotalActionsCount(module)
    })
    return { selected, total }
  }

  const handleSelectAllGlobal = () => {
    const newPermissions = {}
    modules.forEach(module => {
      if (module.actions && module.actions.length > 0) {
        newPermissions[module.id] = {}
        module.actions.forEach(action => {
          newPermissions[module.id][action] = true
        })
      }
      if (module.submodules) {
        module.submodules.forEach(sub => {
          newPermissions[sub.id] = {}
          sub.actions.forEach(action => {
            newPermissions[sub.id][action] = true
          })
        })
      }
    })
    setPermissions(newPermissions)
  }

  const handleClearAllGlobal = () => {
    setPermissions({})
  }

  const handleSubmit = () => {
    if (!formData.roleName.trim()) {
      alert('Please enter a role name')
      return
    }

    const roleData = {
      ...formData,
      permissions
    }
    
    onSubmit(roleData)
  }

  const handleNext = () => {
    if (!formData.roleName.trim()) {
      alert('Please enter a role name')
      return
    }
    setCurrentStep(2)
  }

  const filteredModules = modules.filter(module => {
    const search = moduleSearch.trim().toLowerCase()
    return !search ||
      module.name.toLowerCase().includes(search) ||
      (module.description || '').toLowerCase().includes(search)
  })

  const activeModule = modules.find(module => module.id === activeModuleId) || modules[0]

  const modal = (
    <Modal isOpen size="xl" onClose={onClose}>
        <ModalHeader
          title={initialData ? 'Edit Role' : 'Create New Role'}
          subtitle={currentStep === 1 ? 'Step 1 of 2: Basic Information' : 'Step 2 of 2: Assign Permissions'}
          onClose={onClose}
        />

        <div className="border-b border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-5 py-3">
          <div className="mx-auto flex max-w-md items-center">
            {/* Step 1 */}
            <div className="flex shrink-0 items-center gap-2.5">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                currentStep === 1
                  ? 'bg-[var(--dms-color-brand-primary)] text-white shadow-sm'
                  : 'bg-[var(--dms-color-success-ink)] text-white'
              }`}>
                {currentStep === 1 ? '1' : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.2 7.2a1 1 0 01-1.415 0l-3.3-3.3a1 1 0 011.414-1.42l2.593 2.594 6.493-6.494a1 1 0 011.415 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="leading-tight">
                <p className={`whitespace-nowrap text-xs font-semibold ${
                  currentStep === 1 ? 'text-[var(--dms-color-brand-primary)]' : 'text-ink'
                }`}>
                  Basic Info
                </p>
                <p className={`mt-0.5 text-[10px] ${
                  currentStep === 1 ? 'text-[var(--dms-color-brand-primary)]' : 'text-[var(--dms-color-success-ink)]'
                }`}>
                  {currentStep === 1 ? 'Current step' : 'Completed'}
                </p>
              </div>
            </div>

            {/* Progress connector */}
            <div className="mx-4 h-px min-w-6 flex-1 overflow-hidden rounded-full bg-[var(--dms-color-border-default)]">
              <div className={`h-full rounded-full transition-all duration-300 ${
                currentStep === 2 ? 'w-full bg-[var(--dms-color-success-ink)]' : 'w-0'
              }`} />
            </div>

            {/* Step 2 */}
            <div className="flex shrink-0 items-center gap-2.5">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                currentStep === 2
                  ? 'bg-[var(--dms-color-brand-primary)] text-white shadow-sm'
                  : 'border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface-muted)] text-ink-muted'
              }`}>
                2
              </div>
              <div className="leading-tight">
                <p className={`whitespace-nowrap text-xs font-semibold ${
                  currentStep === 2 ? 'text-[var(--dms-color-brand-primary)]' : 'text-ink-muted'
                }`}>
                  Permissions
                </p>
                <p className={`mt-0.5 text-[10px] ${
                  currentStep === 2 ? 'text-[var(--dms-color-brand-primary)]' : 'text-ink-muted'
                }`}>
                  {currentStep === 2 ? 'Current step' : 'Up next'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <ModalBody className="p-0">
          {currentStep === 1 ? (
            <div className="p-6 space-y-6">
              <div className="rounded-[16px] border-2 border-[var(--dms-color-info-ink)]/20 bg-[color-mix(in_srgb,var(--dms-color-bg-info-soft)_70%,var(--dms-color-bg-card))] p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[var(--dms-color-info-ink)] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="font-medium text-[var(--dms-color-info-ink)]">Role Information</h4>
                    <p className="text-sm text-[var(--dms-color-info-ink)] mt-1">
                      Define the basic details for this role. You'll assign permissions in the next step.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    Role Name <span className="text-[var(--dms-color-danger-ink)]">*</span>
                  </label>
                  <input
                    type="text"
                    name="roleName"
                    value={formData.roleName}
                    onChange={handleInputChange}
                    placeholder="e.g., Document Controller, Quality Manager"
                    className="w-full rounded-xl border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-4 py-3 text-ink outline-none transition-all duration-150 focus:border-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20 text-sm"
                    autoFocus
                  />
                  <p className="text-xs text-ink-muted mt-1">Enter a descriptive name for this role</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    Description <span className="text-ink-muted">(Optional)</span>
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Describe the responsibilities and purpose of this role..."
                    rows={4}
                    className="w-full rounded-xl border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-4 py-3 text-ink outline-none transition-all duration-150 focus:border-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20 resize-none text-sm"
                  />
                  <p className="text-xs text-ink-muted mt-1">Optional: Provide a detailed description of the role's purpose</p>
                </div>
              </div>

              <div className="rounded-[16px] border-2 border-[var(--dms-color-warning-ink)]/20 bg-[color-mix(in_srgb,var(--dms-color-warning-soft)_70%,var(--dms-color-bg-card))] p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--dms-color-warning-ink)] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-[var(--dms-color-warning-ink)]">
                    <strong>Important:</strong> After creating the role, you'll need to assign it to users from the Users Management section.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                {/* Permission overview */}
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      Permissions for {formData.roleName || 'New Role'}
                    </p>
                    <p className="mt-1 text-xs text-ink-secondary">
                      Select a module to configure its access permissions.
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--dms-color-bg-surface-muted)] sm:w-48 sm:flex-none">
                        <div
                          className="h-full rounded-full bg-[var(--dms-color-brand-primary)] transition-all"
                          style={{
                            width: `${getGrandTotal().total > 0
                              ? (getGrandTotal().selected / getGrandTotal().total) * 100
                              : 0}%`
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-ink">
                        {getGrandTotal().selected} / {getGrandTotal().total} selected
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllGlobal}
                      className="rounded-lg border border-[var(--dms-color-brand-primary)] bg-[var(--dms-color-brand-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllGlobal}
                      className="rounded-lg border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-3 py-2 text-xs font-semibold text-ink-secondary transition-colors hover:border-[var(--dms-color-brand-primary)] hover:text-ink"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Module navigation and permission workspace */}
                <div className="grid min-h-[420px] grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">

                  {/* Left: module navigation */}
                  <aside className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)]">
                    <div className="border-b border-[var(--dms-color-border-default)] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-secondary">
                          Modules
                        </h3>
                        <span className="text-xs text-ink-muted">
                          {modules.length} total
                        </span>
                      </div>
                      <div className="relative">
                        <svg
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <circle cx="11" cy="11" r="7" strokeWidth="2" />
                          <path strokeLinecap="round" strokeWidth="2" d="m16 16 4 4" />
                        </svg>
                        <input
                          type="text"
                          value={moduleSearch}
                          onChange={(e) => setModuleSearch(e.target.value)}
                          placeholder="Search modules..."
                          aria-label="Search permission modules"
                          className="h-9 w-full rounded-lg border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface-muted)] pl-9 pr-3 text-xs text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/15"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 overflow-y-auto p-2 md:max-h-[470px]">
                      {filteredModules.length > 0 ? (
                        filteredModules.map(module => {
                          const selected = getTotalSelectedCount(module)
                          const total = getTotalActionsCount(module)
                          const isActive = activeModule?.id === module.id

                          return (
                            <button
                              key={module.id}
                              type="button"
                              onClick={() => setActiveModuleId(module.id)}
                              className={`w-full rounded-lg border p-3 text-left transition-all ${
                                isActive
                                  ? 'border-[var(--dms-color-brand-primary)] bg-[color-mix(in_srgb,var(--dms-color-brand-primary)_9%,var(--dms-color-bg-card))] shadow-sm'
                                  : 'border-transparent hover:border-[var(--dms-color-border-default)] hover:bg-[var(--dms-color-bg-surface-muted)]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`min-w-0 truncate text-xs font-semibold ${
                                  isActive ? 'text-[var(--dms-color-brand-primary)]' : 'text-ink'
                                }`}>
                                  {module.name}
                                </span>
                                {isActive && (
                                  <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--dms-color-brand-primary)]" />
                                )}
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--dms-color-bg-surface-muted)]">
                                  <div
                                    className="h-full rounded-full bg-[var(--dms-color-brand-primary)]"
                                    style={{
                                      width: `${total > 0 ? (selected / total) * 100 : 0}%`
                                    }}
                                  />
                                </div>
                                <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">
                                  {selected}/{total}
                                </span>
                              </div>
                            </button>
                          )
                        })
                      ) : (
                        <div className="px-3 py-8 text-center">
                          <p className="text-xs font-medium text-ink-secondary">No modules found</p>
                          <p className="mt-1 text-[11px] text-ink-muted">Try another search term.</p>
                        </div>
                      )}
                    </div>
                  </aside>

                  {/* Right: selected module permissions */}
                  <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)]">
                    {activeModule ? (
                      <>
                        <div className="border-b border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface-muted)] px-4 py-4 sm:px-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-base font-bold text-ink">
                                {activeModule.name}
                              </h3>
                              {activeModule.description && (
                                <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                                  {activeModule.description}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 rounded-full border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-3 py-1 text-xs font-semibold tabular-nums text-ink">
                              {getTotalSelectedCount(activeModule)} / {getTotalActionsCount(activeModule)}
                            </span>
                          </div>
                        </div>

                        <div className="max-h-[470px] space-y-4 overflow-y-auto p-4 sm:p-5">

                          {/* General module permissions */}
                          {activeModule.actions && activeModule.actions.length > 0 && (
                            <div>
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <h4 className="text-sm font-semibold text-ink">
                                    {activeModule.submodules?.length > 0
                                      ? 'General Permissions'
                                      : 'Available Permissions'}
                                  </h4>
                                  <p className="mt-0.5 text-xs text-ink-muted">
                                    Access controls for this module
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium tabular-nums text-ink-secondary">
                                    {getSelectedCount(activeModule.id)} / {activeModule.actions.length}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectAll(activeModule.id)}
                                    className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--dms-color-brand-primary)] hover:bg-[var(--dms-color-bg-surface-muted)]"
                                  >
                                    Select all
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeselectAll(activeModule.id)}
                                    className="rounded-md px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-[var(--dms-color-bg-surface-muted)]"
                                  >
                                    Clear
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                                {activeModule.actions.map(action => (
                                  <label
                                    key={action}
                                    className="flex min-w-0 cursor-pointer items-center gap-2 py-1.5"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={permissions[activeModule.id]?.[action] || false}
                                      onChange={() => handleToggle(activeModule.id, action)}
                                      className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--dms-color-brand-primary)]"
                                    />
                                    <span className={`truncate text-xs font-medium ${
                                      permissions[activeModule.id]?.[action]
                                        ? 'text-[var(--dms-color-brand-primary)]'
                                        : 'text-ink-secondary'
                                    }`}>
                                      {formatActionLabel(action)}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Submodule permissions */}
                          {activeModule.submodules?.map((submodule, index) => (
                            <div
                              key={submodule.id}
                              className={`${
                                index > 0 || activeModule.actions?.length > 0
                                  ? 'border-t border-[var(--dms-color-border-default)] pt-4'
                                  : ''
                              }`}
                            >
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <h4 className="text-sm font-semibold text-ink">
                                    {submodule.name}
                                  </h4>
                                  <p className="mt-0.5 text-xs text-ink-muted">
                                    {getSelectedCount(submodule.id)} of {submodule.actions.length} permissions selected
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectAll(submodule.id, submodule.actions)}
                                    className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--dms-color-brand-primary)] hover:bg-[var(--dms-color-bg-surface-muted)]"
                                  >
                                    Select all
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeselectAll(submodule.id)}
                                    className="rounded-md px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-[var(--dms-color-bg-surface-muted)]"
                                  >
                                    Clear
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                                {submodule.actions.map(action => (
                                  <label
                                    key={action}
                                    className="flex min-w-0 cursor-pointer items-center gap-2 py-1.5"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={permissions[submodule.id]?.[action] || false}
                                      onChange={() => handleToggle(submodule.id, action)}
                                      className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--dms-color-brand-primary)]"
                                    />
                                    <span className={`truncate text-xs font-medium ${
                                      permissions[submodule.id]?.[action]
                                        ? 'text-[var(--dms-color-brand-primary)]'
                                        : 'text-ink-secondary'
                                    }`}>
                                      {formatActionLabel(action)}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}

                          {(!activeModule.actions || activeModule.actions.length === 0) &&
                            (!activeModule.submodules || activeModule.submodules.length === 0) && (
                              <div className="py-12 text-center">
                                <p className="text-sm font-medium text-ink-secondary">
                                  No permissions configured
                                </p>
                                <p className="mt-1 text-xs text-ink-muted">
                                  This module does not have any configurable actions.
                                </p>
                              </div>
                            )}
                        </div>
                      </>
                    ) : (
                      <div className="flex min-h-[300px] items-center justify-center p-6 text-center">
                        <p className="text-sm text-ink-secondary">Select a module to view its permissions.</p>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          )}
        </ModalBody>

        <ModalFooter className="justify-between">
          {currentStep === 2 ? (
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="rounded-xl h-10 px-4 border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] text-ink-secondary font-semibold transition-all hover:border-[var(--dms-color-brand-primary)] hover:text-ink text-xs"
            >
              ← Back
            </button>
          ) : (
            <div className="text-sm text-ink-secondary">
              <span className="font-medium">Step 1 of 2</span>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl h-10 px-4 border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] text-ink-secondary font-semibold transition-all hover:border-[var(--dms-color-brand-primary)] hover:text-ink text-xs"
            >
              Cancel
            </button>
            {currentStep === 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-xl h-10 px-4 border-2 border-[var(--dms-color-brand-primary)] bg-[var(--dms-color-brand-primary)] text-white font-semibold transition-all hover:bg-[color-mix(in_srgb,var(--dms-color-brand-primary)_90%,black)] text-sm"
              >
                Next: Permissions →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                className="rounded-xl h-10 px-4 border-2 border-[var(--dms-color-brand-primary)] bg-[var(--dms-color-brand-primary)] text-white font-semibold transition-all hover:bg-[color-mix(in_srgb,var(--dms-color-brand-primary)_90%,black)] text-sm"
              >
                {initialData ? 'Update Role' : 'Create Role'}
              </button>
            )}
          </div>
        </ModalFooter>
    </Modal>
  )


  return modal
}
