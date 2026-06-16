/**
 * Permission Utility Functions
 * Handles checking user permissions throughout the application
 */

/**
 * Get user's combined permissions from all their roles
 * @returns {Object} Combined permissions object
 */
export const getUserPermissions = () => {
  try {
    const userStr = localStorage.getItem('user')
    if (!userStr) return {}

    const user = JSON.parse(userStr)
    
    // If no roles, return empty permissions
    if (!user.roles || !Array.isArray(user.roles)) {
      return {}
    }

    // Combine permissions from all roles
    const combinedPermissions = {}
    
    user.roles.forEach(roleData => {
      // Handle different possible role data structures
      const role = roleData.role || roleData
      
      if (!role || !role.permissions) return
      
      // Parse permissions if it's a string
      const permissions = typeof role.permissions === 'string' 
        ? JSON.parse(role.permissions)
        : role.permissions

      // Merge permissions - if ANY role grants a permission, user has it
      Object.keys(permissions).forEach(module => {
        if (!combinedPermissions[module]) {
          combinedPermissions[module] = {}
        }
        
        // Merge actions for this module
        Object.keys(permissions[module]).forEach(action => {
          if (permissions[module][action]) {
            combinedPermissions[module][action] = true
          }
        })
      })
    })

    return combinedPermissions
  } catch (error) {
    console.error('Error getting user permissions:', error)
    return {}
  }
}

/**
 * Check if user has a specific permission
 * @param {string} module - Module ID (e.g., 'dashboard', 'documents.draft')
 * @param {string} action - Action (e.g., 'view', 'create', 'edit', 'delete')
 * @returns {boolean}
 */
export const hasPermission = (module, action) => {
  const permissions = getUserPermissions()
  return !!(permissions[module] && permissions[module][action])
}

/**
 * Check if user has ANY permission for a module (useful for showing menu items)
 * @param {string} module - Module ID
 * @returns {boolean}
 */
export const hasAnyPermission = (module) => {
  const permissions = getUserPermissions()
  if (!permissions[module]) return false
  
  return Object.values(permissions[module]).some(value => value === true)
}

/**
 * Check if user has ALL specified permissions
 * @param {Array<{module: string, action: string}>} requirements
 * @returns {boolean}
 */
export const hasAllPermissions = (requirements) => {
  return requirements.every(req => hasPermission(req.module, req.action))
}

/**
 * Check if user has ANY of the specified permissions
 * @param {Array<{module: string, action: string}>} requirements
 * @returns {boolean}
 */
export const hasAnyOfPermissions = (requirements) => {
  return requirements.some(req => hasPermission(req.module, req.action))
}

/**
 * Get user's role names
 * @returns {Array<string>}
 */
export const getUserRoles = () => {
  try {
    const userStr = localStorage.getItem('user')
    if (!userStr) return []

    const user = JSON.parse(userStr)
    
    if (!user.roles || !Array.isArray(user.roles)) {
      return []
    }

    return user.roles.map(roleData => {
      const role = roleData.role || roleData
      return role.displayName || role.name || 'Unknown'
    })
  } catch (error) {
    console.error('Error getting user roles:', error)
    return []
  }
}

/**
 * Check if user has a specific role
 * @param {string} roleName - Role name to check
 * @returns {boolean}
 */
export const hasRole = (roleName) => {
  const roles = getUserRoles()
  return roles.some(role => 
    role.toLowerCase() === roleName.toLowerCase()
  )
}

/**
 * Check if user is admin
 * @returns {boolean}
 */
export const isAdmin = () => {
  return hasRole('Administrator') || hasRole('Admin')
}

/**
 * Module to route mapping
 * NOTE: These must match the modules defined in EditSystemRolePermissionsModal.jsx
 */
export const MODULE_ROUTES = {
  'dashboard': '/dashboard',
  'projectTracking': '/project-tracking',
  'documents.draft': '/drafts',
  'documents.review': '/review-approval',
  'documents.published': '/published',
  'documents.superseded': '/archived',
  'newDocumentRequest': '/new-document-request',
  'myDocumentsStatus': '/my-documents',
  'configuration.users': '/config',
  'configuration.roles': '/config',
  'configuration.templates': '/config',
  'configuration.templateRequests': '/config',
  'configuration.documentTypes': '/config',
  'configuration.masterData': '/config',
  'configuration.settings': '/config',
  'configuration.backup': '/config',
  'configuration.cleanup': '/config',
  'configuration.auditSettings': '/config',
  'logsReport.activityLogs': '/logs',
  'logsReport.userActivity': '/logs',
  'logsReport.reports': '/logs',
  'logsReport.analytics': '/logs',
  'masterRecord': '/master-record',
  'documents.rfidRegistry': '/rfid-epc-registry',
  'profileSettings': '/profile'
}

/**
 * Get accessible routes based on user permissions
 * @returns {Array<string>}
 */
export const getAccessibleRoutes = () => {
  const permissions = getUserPermissions()
  const accessibleRoutes = []

  Object.keys(MODULE_ROUTES).forEach(module => {
    if (hasAnyPermission(module)) {
      accessibleRoutes.push(MODULE_ROUTES[module])
    }
  })

  return accessibleRoutes
}

/**
 * Check if user can access a specific route
 * @param {string} route - Route path
 * @returns {boolean}
 */
export const canAccessRoute = (route) => {
  // Find module for this route
  const module = Object.keys(MODULE_ROUTES).find(
    mod => MODULE_ROUTES[mod] === route
  )

  if (!module) {
    // If route not in mapping, allow access (might be a sub-route)
    return true
  }

  return hasAnyPermission(module)
}
