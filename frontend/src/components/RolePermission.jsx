import React, { useState, useEffect } from 'react'
import { usePreferences } from '../contexts/PreferencesContext'
import api from '../api/axios'
import AddRoleModal from './AddRoleModal'
import AddUserModal from './AddUserModal'
import ActionMenu from './ActionMenu'
import EditSystemRolePermissionsModal from './EditSystemRolePermissionsModal'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import Pagination from './Pagination'

// Sub-tab Navigation Component
function SubTabNavigation({ activeTab, onTabChange }) {
  const { t } = usePreferences()
  const tabs = [
    { id: 'roles', label: t('rp_roles_mgmt') },
    { id: 'users', label: t('rp_users_mgmt') }
  ]

  return (
    <div className="border-b border-gray-200 mb-6" data-tour-id="rp-tabbar">
      <nav className="flex space-x-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            data-tour-id={`rp-tab-${tab.id}`}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

// Roles Management Tab
function RolesManagement() {
  const { t } = usePreferences()
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [showAddRoleModal, setShowAddRoleModal] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [showPermissionsModal, setShowPermissionsModal] = useState(false)
  const [editingPermissionsRole, setEditingPermissionsRole] = useState(null)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })

  useEffect(() => {
    loadRoles()
  }, [])

  const loadRoles = async () => {
    try {
      const res = await api.get('/roles')
      const rolesData = res.data.data?.roles || []
      
      // Transform to match UI format but keep original data
      const transformedRoles = rolesData.map(role => ({
        id: role.id,
        roleName: role.displayName,
        description: role.description || '',
        usersCount: role._count?.users || 0,
        status: 'Active',
        createdOn: new Date(role.createdAt).toLocaleDateString('en-GB'),
        // Store original data for editing
        _originalData: role
      }))
      
      setRoles(transformedRoles)
    } catch (error) {
      console.error('Failed to load roles:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to load roles from server', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const filteredRoles = roles.filter(role => {
    const matchesSearch = role.roleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          role.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || role.status.toLowerCase() === statusFilter.toLowerCase()
    return matchesSearch && matchesStatus
  })

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter])

  const totalRecords = filteredRoles.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pageItems = filteredRoles.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const handleAddRole = () => {
    setEditingRole(null)
    setShowAddRoleModal(true)
  }

  const handleEdit = (role) => {
    // For system roles, show permissions modal instead
    if (role._originalData?.isSystem) {
      setEditingPermissionsRole(role)
      setShowPermissionsModal(true)
      return
    }
    setEditingRole(role)
    setShowAddRoleModal(true)
  }

  const handleStatusChange = (roleId, newStatus) => {
    setRoles(prev => prev.map(r => r.id === roleId ? { ...r, status: newStatus } : r))
  }

  const handleDelete = async (role) => {
    // Prevent deleting system roles
    if (role._originalData?.isSystem) {
      setAlertModal({ show: true, title: 'Cannot Delete', message: 'System roles cannot be deleted. Only custom roles can be removed.', type: 'warning' })
      return
    }
    
    if (role.usersCount > 0) {
      setAlertModal({ show: true, title: 'Cannot Delete', message: `Cannot delete role "${role.roleName}" because it is assigned to ${role.usersCount} user(s). Please reassign or remove those users first.`, type: 'warning' })
      return
    }
    
    setConfirmModal({
      show: true,
      title: 'Confirm Delete',
      message: `Are you sure you want to delete the role "${role.roleName}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/roles/${role.id}`)
          setRoles(prev => prev.filter(r => r.id !== role.id))
          setAlertModal({ show: true, title: 'Success', message: `Role "${role.roleName}" has been deleted successfully`, type: 'success' })
        } catch (error) {
          console.error('Failed to delete role:', error)
          setAlertModal({ show: true, title: 'Error', message: `Failed to delete role: ${error.response?.data?.message || error.message}`, type: 'error' })
        }
      }
    })
  }

  const handlePermissionsSubmit = async (permissions) => {
    if (!editingPermissionsRole) return

    try {
      const response = await api.patch(`/roles/${editingPermissionsRole.id}/permissions`, {
        permissions: permissions
      })

      // Reload roles to get updated permissions
      await loadRoles()
      
      setAlertModal({ show: true, title: 'Success', message: `Permissions for "${editingPermissionsRole.roleName}" have been updated successfully!`, type: 'success' })
      setShowPermissionsModal(false)
      setEditingPermissionsRole(null)
    } catch (error) {
      console.error('Failed to update permissions:', error)
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      })
      setAlertModal({ show: true, title: 'Error', message: `Failed to update permissions: ${error.response?.data?.message || error.message}`, type: 'error' })
    }
  }

  const handleRoleSubmit = async (roleData) => {
    try {
      if (editingRole) {
        // Update existing role
        await api.put(`/roles/${editingRole.id}`, {
          displayName: roleData.roleName,
          description: roleData.description,
          permissions: roleData.permissions
        })
        
        // Update local state
        setRoles(prev => prev.map(r => 
          r.id === editingRole.id 
            ? { 
                ...r, 
                roleName: roleData.roleName,
                description: roleData.description
              } 
            : r
        ))
        setAlertModal({ show: true, title: 'Success', message: `Role "${roleData.roleName}" has been updated successfully!`, type: 'success' })
      } else {
        // Create new role
        const response = await api.post('/roles', {
          name: roleData.roleName.toLowerCase().replace(/\s+/g, '_'),
          displayName: roleData.roleName,
          description: roleData.description,
          permissions: roleData.permissions
        })
        
        // Add to local state with data from server
        const newRole = {
          id: response.data.data.role.id,
          roleName: response.data.data.role.displayName,
          description: response.data.data.role.description || '',
          usersCount: 0,
          status: 'Active',
          createdOn: new Date().toLocaleDateString('en-GB'),
          _originalData: response.data.data.role
        }
        setRoles(prev => [...prev, newRole])
        setAlertModal({ show: true, title: 'Success', message: `Role "${roleData.roleName}" has been created successfully!`, type: 'success' })
      }
      
      setShowAddRoleModal(false)
      setEditingRole(null)
    } catch (error) {
      console.error('Failed to save role:', error)
      setAlertModal({ show: true, title: 'Error', message: `Failed to save role: ${error.response?.data?.message || error.message}`, type: 'error' })
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      Active: 'bg-green-100 text-green-800',
      Inactive: 'bg-gray-100 text-gray-800'
    }
    return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[status]}`}>{status}</span>
  }

  return (
    <div className="space-y-6">
      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false })}
      />
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false })}
      />

      {showAddRoleModal && (
        <AddRoleModal
          onClose={() => { setShowAddRoleModal(false); setEditingRole(null) }}
          onSubmit={handleRoleSubmit}
          initialData={editingRole}
        />
      )}

      {showPermissionsModal && editingPermissionsRole && (
        <EditSystemRolePermissionsModal
          role={editingPermissionsRole}
          onClose={() => { setShowPermissionsModal(false); setEditingPermissionsRole(null) }}
          onSubmit={handlePermissionsSubmit}
        />
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('rp_roles_list')}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {t('rp_showing')} {filteredRoles.length} {filteredRoles.length !== 1 ? t('rp_roles_mgmt').toLowerCase() : t('rp_role_name').toLowerCase()}
          </p>
        </div>
        <button onClick={handleAddRole} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          {t('rp_add_role')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('rp_search_roles_desc')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
        >
          <option value="all">{t('rp_all_status')}</option>
          <option value="active">{t('rp_active')}</option>
          <option value="inactive">{t('rp_inactive')}</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('rp_role_name')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('description')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('rp_users_count')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('status')}</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('rp_active')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="text-center py-8 text-gray-500">{t('rp_loading_roles')}</td></tr>
            ) : filteredRoles.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-12 text-gray-500">{t('rp_no_roles')}</td></tr>
            ) : (
              pageItems.map((role) => (
                <tr key={role.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-4 font-medium text-gray-900">{role.roleName}</td>
                  <td className="py-4 px-4 text-gray-600">{role.description}</td>
                  <td className="py-4 px-4 text-gray-700">{role.usersCount}</td>
                  <td className="py-4 px-4">{getStatusBadge(role.status)}</td>
                  <td className="py-4 px-4">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => handleStatusChange(role.id, role.status === 'Active' ? 'Inactive' : 'Active')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          role.status === 'Active' ? 'bg-green-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          role.status === 'Active' ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <ActionMenu
                      actions={role._originalData?.isSystem ? [
                        { label: t('rp_edit_permissions'), onClick: () => handleEdit(role) }
                      ] : [
                        { label: t('rp_edit_role'), onClick: () => handleEdit(role) },
                        { label: t('rp_edit_permissions'), onClick: () => {
                          setEditingPermissionsRole(role)
                          setShowPermissionsModal(true)
                        }},
                        { label: t('rp_delete'), onClick: () => handleDelete(role), variant: 'destructive', dividerAfter: true }
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalRecords={totalRecords}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
      />
    </div>
  )
}

// Users Management Tab
function UsersManagement() {
  const { t } = usePreferences()
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })

  useEffect(() => {
    loadUsers()
    loadRoles()
  }, [])

  const loadRoles = async () => {
    try {
      const res = await api.get('/roles')
      const rolesData = res.data.data?.roles || []

      // Transform to match modal format - USE NUMERIC ID FROM DATABASE
      const transformedRoles = rolesData.map(role => {
        const transformedRole = {
          id: role.id,  // Use numeric database ID, not roleName!
          numericId: role.id,  // Keep numeric ID for backend calls
          name: role.displayName || role.roleName,
          roleName: role.roleName,  // Keep for mapping
          description: role.description || `${role.displayName || role.roleName} role`
        }
        return transformedRole
      })
      
      setRoles(transformedRoles)
    } catch (error) {
      console.error('Failed to load roles:', error)
      // Fallback to default roles if API fails
      setRoles([
        { id: 1, numericId: 1, name: 'Admin', roleName: 'admin', description: 'Full system access' },
        { id: 2, numericId: 2, name: 'Reviewer', roleName: 'reviewer', description: 'Can review documents' },
        { id: 3, numericId: 3, name: 'Approver', roleName: 'approver', description: 'Can approve documents' },
        { id: 4, numericId: 4, name: 'Acknowledger', roleName: 'acknowledger', description: 'Can acknowledge documents' },
        { id: 5, numericId: 5, name: 'Drafter', roleName: 'drafter', description: 'Can create and edit drafts' },
        { id: 6, numericId: 6, name: 'Viewer', roleName: 'viewer', description: 'Read-only access' }
      ])
    }
  }

  const loadUsers = async () => {
    try {
      const res = await api.get('/users')
      const usersData = res.data.data?.users || []
      
      // Transform to match UI format
      const transformedUsers = usersData.map(user => {
        // Extract role IDs AND display names from backend structure
        const userRoleIds = []
        const roleNames = []
        
        if (user.roles && Array.isArray(user.roles)) {
          user.roles.forEach(r => {
            if (r.role) {
              userRoleIds.push(r.role.id)  // Store numeric ID
              roleNames.push(r.role.displayName || 'Unknown')
            }
          })
        }
        
        return {
          id: user.id,
          userName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          email: user.email,
          roles: roleNames,  // For display in table
          roleIds: userRoleIds,  // For editing - numeric IDs
          department: user.department || 'N/A',
          status: user.status === 'ACTIVE' ? 'Active' : 'Inactive',
          lastLogin: user.lastLogin 
            ? new Date(user.lastLogin).toLocaleString('en-US', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
              })
            : 'Never'
        }
      })
      
      setUsers(transformedUsers)
    } catch (error) {
      console.error('Failed to load users:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to load users from server', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          user.email.toLowerCase().includes(searchQuery.toLowerCase())
    
    // Roles are already strings from transformation
    const matchesRole = roleFilter === 'all' || (Array.isArray(user.roles) && user.roles.includes(roleFilter))
    return matchesSearch && matchesRole
  })

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, roleFilter])

  const totalRecords = filteredUsers.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pageItems = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const handleAddUser = () => {
    setEditingUser(null)
    setShowAddUserModal(true)
  }

  const handleEdit = (user) => {
    // Use the numeric roleIds directly - no mapping needed!
    const normalizedUser = {
      ...user,
      roles: user.roleIds || []  // Use numeric IDs directly
    }
    setEditingUser(normalizedUser)
    setShowAddUserModal(true)
  }

  const handleStatusChange = async (userId, newStatus) => {
    // Check if trying to deactivate current user
    const user = users.find(u => u.id === userId)
    if (user) {
      const savedUser = localStorage.getItem('user')
      if (savedUser) {
        try {
          const currentUser = JSON.parse(savedUser)
          if (currentUser.id === userId || currentUser.email === user.email) {
            if (newStatus === 'Inactive') {
              setAlertModal({ show: true, title: 'Warning', message: 'You cannot deactivate your own account!', type: 'warning' })
              return
            }
          }
        } catch (e) {
          console.error('Failed to parse user data', e)
        }
      }
    }

    try {
      // Map UI status to backend status
      const backendStatus = newStatus === 'Active' ? 'ACTIVE' : 'INACTIVE'
      
      await api.patch(`/users/${userId}/status`, {
        status: backendStatus
      })
      
      // Update local state after successful API call
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u))
    } catch (error) {
      console.error('Failed to update user status:', error)
      setAlertModal({ show: true, title: 'Error', message: `Failed to update user status: ${error.response?.data?.message || error.message}`, type: 'error' })
    }
  }

  const handleDelete = async (user) => {
    // Check if trying to delete current user
    const savedUser = localStorage.getItem('user')
    if (savedUser) {
      try {
        const currentUser = JSON.parse(savedUser)
        if (currentUser.id === user.id || currentUser.email === user.email) {
          setAlertModal({ show: true, title: 'Warning', message: 'You cannot delete your own account!', type: 'warning' })
          return
        }
      } catch (e) {
        console.error('Failed to parse user data', e)
      }
    }

    setConfirmModal({
      show: true,
      title: 'Confirm Delete',
      message: `Are you sure you want to delete user "${user.userName}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/users/${user.id}`)
          setUsers(prev => prev.filter(u => u.id !== user.id))
          setAlertModal({ show: true, title: 'Success', message: `User "${user.userName}" has been deleted successfully`, type: 'success' })
        } catch (error) {
          console.error('Failed to delete user:', error)
          setAlertModal({ show: true, title: 'Error', message: `Failed to delete user: ${error.response?.data?.message || error.message}`, type: 'error' })
        }
      }
    })
  }

  const handleResetPassword = async (user) => {
    setConfirmModal({
      show: true,
      title: 'Reset Password',
      message: `Reset password for "${user.userName}" to the default password?`,
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.post(`/users/${user.id}/reset-password`)
          setAlertModal({ show: true, title: 'Success', message: `Password reset successfully. Default password: Password123!`, type: 'success' })
        } catch (error) {
          console.error('Failed to reset password:', error)
          setAlertModal({ show: true, title: 'Error', message: `Failed to reset password: ${error.response?.data?.message || error.message}`, type: 'error' })
        }
      }
    })
  }

  const handleUserSubmit = async (userData) => {
    try {
      // Split userName into firstName and lastName
      const nameParts = userData.userName.trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''
      
      // userData.roles already contains numeric IDs from the modal!
      const roleIds = userData.roles || []

      if (editingUser) {
        // Update existing user
        const updatePayload = {
          firstName,
          lastName,
          department: userData.department || null,
          roleIds: roleIds.length > 0 ? roleIds : undefined
        }
        
        await api.put(`/users/${editingUser.id}`, updatePayload)
        
        // Reload users to get fresh data
        await loadUsers()
        setAlertModal({ show: true, title: 'Success', message: `User "${userData.userName}" has been updated successfully!`, type: 'success' })
      } else {
        // Create new user (password will default to 'Password123!' on backend)
        const createPayload = {
          email: userData.email?.trim(),
          firstName,
          lastName,
          department: userData.department || null,
          roleIds: roleIds.length > 0 ? roleIds : undefined
        }
        
        await api.post('/users', createPayload)
        
        // Reload users to get fresh data
        await loadUsers()
        setAlertModal({ show: true, title: 'Success', message: `User "${userData.userName}" has been created successfully! Default password: Password123!`, type: 'success' })
      }
      
      setShowAddUserModal(false)
      setEditingUser(null)
    } catch (error) {
      console.error('Failed to save user:', error)
      setAlertModal({ show: true, title: 'Error', message: `Failed to save user: ${error.response?.data?.message || error.message}`, type: 'error' })
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      Active: 'bg-green-100 text-green-800',
      Inactive: 'bg-gray-100 text-gray-800'
    }
    return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[status]}`}>{status}</span>
  }

  return (
    <div className="space-y-6">
      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false })}
      />
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false })}
      />

      {showAddUserModal && (
        <AddUserModal
          onClose={() => { setShowAddUserModal(false); setEditingUser(null) }}
          onSubmit={handleUserSubmit}
          initialData={editingUser}
          availableRoles={roles}
        />
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('rp_users_list')}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {t('rp_showing')} {filteredUsers.length} {t('rp_users_mgmt').toLowerCase()}
          </p>
        </div>
        <button onClick={handleAddUser} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          {t('rp_add_user')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('rp_search_users_desc')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
        >
          <option value="all">{t('rp_all_roles')}</option>
          {roles.map((role, index) => (
            <option key={`role-filter-${role.id || role.name || index}`} value={role.name}>{role.name}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('rp_user_name')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('rp_email')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('rp_role_col')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('rp_department')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('status')}</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('rp_active')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="text-center py-8 text-gray-500">{t('rp_loading_users')}</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-12 text-gray-500">{t('rp_no_users')}</td></tr>
            ) : (
              pageItems.map((user) => (
                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-4 font-medium text-gray-900">{user.userName}</td>
                  <td className="py-4 px-4 text-gray-600">{user.email}</td>
                  <td className="py-4 px-4">
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(user.roles) ? user.roles : []).map((role, idx) => (
                        <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-gray-700">{user.department}</td>
                  <td className="py-4 px-4">{getStatusBadge(user.status)}</td>
                  <td className="py-4 px-4">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => handleStatusChange(user.id, user.status === 'Active' ? 'Inactive' : 'Active')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          user.status === 'Active' ? 'bg-green-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          user.status === 'Active' ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <ActionMenu
                      actions={[
                        { label: t('rp_edit'), onClick: () => handleEdit(user), dividerAfter: true },
                        { label: 'Reset Password', onClick: () => handleResetPassword(user) },
                        { label: t('rp_delete'), onClick: () => handleDelete(user), variant: 'destructive' }
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalRecords={totalRecords}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
      />
    </div>
  )
}


// Main Component
export default function RolePermission() {
  const { t } = usePreferences()
  const [activeTab, setActiveTab] = useState('roles')

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('rp_title')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('rp_desc')}</p>
        <p className="text-sm text-gray-600">{t('rp_desc2')}</p>
      </div>

      <div className="card p-6">
        <SubTabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        
        {activeTab === 'roles' && <RolesManagement />}
        {activeTab === 'users' && <UsersManagement />}
      </div>
    </div>
  )
}
