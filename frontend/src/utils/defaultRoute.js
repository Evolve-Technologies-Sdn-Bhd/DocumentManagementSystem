/**
 * Default Route Utility
 * Determines which page a user should land on based on their permissions
 */

import { hasAnyPermission, getUserPermissions } from './permissions'

/**
 * Ordered list of routes to check for access
 * User will be redirected to the first route they have access to
 */
const ROUTE_PRIORITY = [
  { path: '/dashboard', module: 'dashboard' },
  { path: '/project-tracking', module: 'projectTracking' },
  { path: '/new-document-request', module: 'newDocumentRequest' },
  { path: '/my-documents', module: 'myDocumentsStatus' },
  { path: '/drafts', module: 'documents.draft' },
  { path: '/review-approval', module: 'documents.review' },
  { path: '/published', module: 'documents.published' },
  { path: '/archived', module: 'documents.superseded' },
  { path: '/config', module: 'configuration.roles' },
  { path: '/logs', module: 'logsReport.activityLogs' },
  { path: '/master-record', module: 'masterRecord' },
  { path: '/rfid-epc-registry', module: 'documents.rfidRegistry' },
  { path: '/profile', module: 'profileSettings' }
]

/**
 * Get the default route for a user based on their permissions
 * @returns {string} - Path to redirect to (e.g., '/', '/drafts')
 */
export const getDefaultRoute = () => {
  const permissions = getUserPermissions()
  
  // Debug logging
  console.log('Getting default route for user with permissions:', permissions)
  
  // If user has no permissions at all, return profile (every user should access this)
  if (Object.keys(permissions).length === 0) {
    console.warn('User has no permissions, defaulting to /profile')
    return '/profile'
  }
  
  // Find first route user has access to
  for (const route of ROUTE_PRIORITY) {
    if (hasAnyPermission(route.module)) {
      console.log(`Default route determined: ${route.path} (module: ${route.module})`)
      return route.path
    }
  }
  
  // Fallback to profile if no other route is accessible
  console.warn('No accessible routes found, defaulting to /profile')
  return '/profile'
}

/**
 * Check if user can access dashboard
 * @returns {boolean}
 */
export const canAccessDashboard = () => {
  return hasAnyPermission('dashboard')
}
