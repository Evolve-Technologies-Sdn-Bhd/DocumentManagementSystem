import React, { useState, useEffect } from 'react'
import * as ReactDOM from 'react-dom'

export default function EditSystemRolePermissionsModal({ role, onClose, onSubmit }) {
  const [permissions, setPermissions] = useState({})

  const formatActionLabel = (action) =>
    String(action || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (char) => char.toUpperCase())

  // Define available modules with detailed submodules and their permissions
  // NOTE: Permission actions should match exactly what components check with hasPermission()
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
          actions: ['view', 'read', 'create', 'publish', 'update', 'delete', 'download']
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

  // Helper function to get valid actions for any module ID
  const getValidActions = (moduleId) => {
    for (const mod of modules) {
      if (mod.id === moduleId && mod.actions) {
        return mod.actions
      }
      if (mod.submodules) {
        const sub = mod.submodules.find(s => s.id === moduleId)
        if (sub) return sub.actions
      }
    }
    return []
  }

  // Clean permissions to only include valid module IDs and actions
  const cleanPermissions = (perms) => {
    const cleaned = {}
    Object.keys(perms).forEach(moduleId => {
      const validActions = getValidActions(moduleId)
      if (validActions.length > 0) {
        cleaned[moduleId] = {}
        validActions.forEach(action => {
          if (perms[moduleId]?.[action]) {
            cleaned[moduleId][action] = true
          }
        })
        // Remove empty modules
        if (Object.keys(cleaned[moduleId]).length === 0) {
          delete cleaned[moduleId]
        }
      }
    })
    return cleaned
  }

  useEffect(() => {
    // Parse existing permissions from role
    if (role && role._originalData?.permissions) {
      try {
        const parsed = typeof role._originalData.permissions === 'string'
          ? JSON.parse(role._originalData.permissions)
          : role._originalData.permissions
        
        // Convert array format to boolean object format
        const converted = {}
        Object.keys(parsed).forEach(moduleKey => {
          if (Array.isArray(parsed[moduleKey])) {
            // Array format: ["read", "create"]
            // Map legacy keys to new structure
            let targetKey = moduleKey
            
            // Handle legacy 'documents' key - map to all document submodules
            if (moduleKey === 'documents') {
              // Apply to all document submodules
              const docSubmodules = ['documents.draft', 'documents.review', 'documents.published', 'documents.superseded']
              docSubmodules.forEach(subKey => {
                if (!converted[subKey]) converted[subKey] = {}
                parsed[moduleKey].forEach(action => {
                  // Map old action names to new ones if needed
                  let mappedAction = action
                  if (action === 'read') mappedAction = 'view'
                  converted[subKey][mappedAction] = true
                })
              })
            } 
            // Handle legacy 'reports' key
            else if (moduleKey === 'reports') {
              targetKey = 'logsReport.reports'
              if (!converted[targetKey]) converted[targetKey] = {}
              parsed[moduleKey].forEach(action => {
                let mappedAction = action
                if (action === 'read') mappedAction = 'view'
                converted[targetKey][mappedAction] = true
              })
            }
            // Handle other keys normally, but skip if they don't exist in new structure
            else {
              // Check if this module exists in the new structure
              const moduleExists = modules.some(m => {
                if (m.id === targetKey) return true
                if (m.submodules) {
                  return m.submodules.some(sub => sub.id === targetKey)
                }
                return false
              })
              
              // Only add if module exists in new structure
              if (moduleExists) {
                if (!converted[targetKey]) converted[targetKey] = {}
                parsed[moduleKey].forEach(action => {
                  let mappedAction = action
                  if (action === 'read') mappedAction = 'view'
                  converted[targetKey][mappedAction] = true
                })
              }
              // Otherwise skip this legacy key
            }
          } else if (typeof parsed[moduleKey] === 'object') {
            // Already in boolean format - copy it
            converted[moduleKey] = { ...parsed[moduleKey] }
          }
        })
        
        // Clean up any invalid actions before setting state
        const cleanedPermissions = cleanPermissions(converted)
        setPermissions(cleanedPermissions)
      } catch (e) {
        console.error('Failed to parse permissions:', e)
        setPermissions({})
      }
    }
  }, [role])

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
    // If actions are provided directly (for submodules), use them
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

    // Otherwise find the module
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

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(permissions)
  }

  const isModuleFullySelected = (moduleId) => {
    const module = modules.find(m => m.id === moduleId)
    if (!module) return false
    return module.actions.every(action => permissions[moduleId]?.[action])
  }

  // Helper to get valid actions for a module/submodule by ID
  const getValidActionsForModule = (moduleId) => {
    // Check if it's a top-level module with actions
    const topModule = modules.find(m => m.id === moduleId)
    if (topModule && topModule.actions) {
      return topModule.actions
    }
    // Check if it's a submodule
    for (const mod of modules) {
      if (mod.submodules) {
        const submodule = mod.submodules.find(sub => sub.id === moduleId)
        if (submodule) {
          return submodule.actions
        }
      }
    }
    return []
  }

  const getSelectedCount = (moduleId) => {
    if (!permissions[moduleId]) return 0
    const validActions = getValidActionsForModule(moduleId)
    // Only count permissions that are valid actions for this module
    return validActions.filter(action => permissions[moduleId]?.[action]).length
  }

  // Get all module IDs (including submodules) for a module
  const getAllModuleIds = (module) => {
    const ids = []
    // Only include module.id if it has its own actions
    if (module.actions && module.actions.length > 0) {
      ids.push(module.id)
    }
    if (module.submodules) {
      module.submodules.forEach(sub => ids.push(sub.id))
    }
    return ids
  }

  // Get total selected count including submodules
  const getTotalSelectedCount = (module) => {
    const ids = getAllModuleIds(module)
    return ids.reduce((total, id) => total + getSelectedCount(id), 0)
  }

  // Get total actions count including submodules
  const getTotalActionsCount = (module) => {
    let total = 0
    // Only count if module has its own actions
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

  // Calculate grand total of all permissions
  const getGrandTotal = () => {
    let selected = 0
    let total = 0
    modules.forEach(module => {
      selected += getTotalSelectedCount(module)
      total += getTotalActionsCount(module)
    })
    return { selected, total }
  }

  // Select all permissions across all modules
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

  // Deselect all permissions
  const handleClearAllGlobal = () => {
    setPermissions({})
  }

  const modal = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Edit Permissions</h2>
              <p className="text-sm text-blue-100 mt-1">
                {role?.roleName} - System Role
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-blue-800 rounded-lg p-2 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Info Alert */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-blue-900">System Role Permissions</h4>
                      <p className="text-sm text-blue-800 mt-1">
                        Configure permissions for this system role. Selected: <span className="font-semibold">{getGrandTotal().selected} / {getGrandTotal().total}</span>
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        type="button"
                        onClick={handleSelectAllGlobal}
                        className="text-xs px-3 py-1.5 text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md font-medium transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAllGlobal}
                        className="text-xs px-3 py-1.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Permissions Grid */}
            <div className="space-y-4">
              {modules.map(module => {
                const totalSelected = getTotalSelectedCount(module)
                const totalActions = getTotalActionsCount(module)
                const hasSubmodules = module.submodules && module.submodules.length > 0
                
                return (
                  <div key={module.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Module Header */}
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-bold text-gray-900 text-base">{module.name}</h3>
                            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                              totalSelected === 0 ? 'bg-gray-300 text-gray-700' :
                              totalSelected === totalActions ? 'bg-green-600 text-white' :
                              'bg-blue-600 text-white'
                            }`}>
                              {totalSelected} / {totalActions}
                            </span>
                          </div>
                          {module.description && (
                            <p className="text-xs text-gray-600 mt-1.5">{module.description}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Main Module Actions (if any) */}
                    {module.actions && module.actions.length > 0 && (
                      <div className="bg-white p-4 border-b border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-gray-800">
                              {hasSubmodules ? 'General Permissions' : 'Permissions'}
                            </h4>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                              {getSelectedCount(module.id)} / {module.actions.length}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleSelectAll(module.id)}
                              className="text-xs px-3 py-1 text-blue-600 hover:bg-blue-50 rounded-md font-medium transition-colors"
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeselectAll(module.id)}
                              className="text-xs px-3 py-1 text-gray-600 hover:bg-gray-50 rounded-md font-medium transition-colors"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                          {module.actions.map(action => (
                            <label
                              key={action}
                              className={`flex items-center gap-2.5 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                permissions[module.id]?.[action]
                                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                                  : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={permissions[module.id]?.[action] || false}
                                onChange={() => handleToggle(module.id, action)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                              />
                              <span className={`text-sm font-medium capitalize ${
                                permissions[module.id]?.[action] ? 'text-blue-900' : 'text-gray-700'
                              }`}>
                                {formatActionLabel(action)}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Submodules */}
                    {hasSubmodules && (
                      <div className="bg-gradient-to-b from-gray-50 to-gray-100">
                        {module.submodules.map((submodule, index) => (
                          <div 
                            key={submodule.id} 
                            className={`p-4 ${
                              index !== module.submodules.length - 1 ? 'border-b border-gray-200' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2.5">
                                <div className="flex items-center justify-center w-5 h-5 rounded bg-white border border-gray-300">
                                  <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                                <h4 className="text-sm font-semibold text-gray-900">{submodule.name}</h4>
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                  getSelectedCount(submodule.id) === 0 ? 'bg-gray-200 text-gray-600' :
                                  getSelectedCount(submodule.id) === submodule.actions.length ? 'bg-green-100 text-green-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                  {getSelectedCount(submodule.id)} / {submodule.actions.length}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSelectAll(submodule.id, submodule.actions)}
                                  className="text-xs px-3 py-1 text-blue-600 hover:bg-blue-50 rounded-md font-medium transition-colors border border-transparent hover:border-blue-200"
                                >
                                  Select All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeselectAll(submodule.id)}
                                  className="text-xs px-3 py-1 text-gray-600 hover:bg-white rounded-md font-medium transition-colors border border-transparent hover:border-gray-300"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                              {submodule.actions.map(action => (
                                <label
                                  key={action}
                                  className={`flex items-center gap-2 p-2.5 rounded-md border-2 cursor-pointer transition-all ${
                                    permissions[submodule.id]?.[action]
                                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                                      : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={permissions[submodule.id]?.[action] || false}
                                    onChange={() => handleToggle(submodule.id, action)}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span className={`text-xs font-medium capitalize ${
                                    permissions[submodule.id]?.[action] ? 'text-blue-900' : 'text-gray-700'
                                  }`}>
                                    {formatActionLabel(action)}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium">Total Selected:</span> 
              <span className="ml-1 font-semibold text-gray-900">{getGrandTotal().selected} of {getGrandTotal().total} permissions</span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm hover:shadow-md"
              >
                Save Permissions
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
