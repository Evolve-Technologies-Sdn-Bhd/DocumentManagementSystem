import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import api from '../api/axios'

export default function AddUserModal({ onClose, onSubmit, initialData, availableRoles }) {
  const [formData, setFormData] = useState({
    userName: initialData?.userName || '',
    email: initialData?.email || '',
    department: initialData?.department || '',
    status: initialData?.status || 'Active'
  })

  const [selectedRoles, setSelectedRoles] = useState(initialData?.roles || [])
  const [departments, setDepartments] = useState([])

  const defaultRoles = [
    { id: 'Admin', name: 'Admin', description: 'Full system access' },
    { id: 'Reviewer', name: 'Reviewer', description: 'Can review documents' },
    { id: 'Approver', name: 'Approver', description: 'Can approve documents' },
    { id: 'Acknowledger', name: 'Acknowledger', description: 'Can acknowledge documents' },
    { id: 'Drafter', name: 'Drafter', description: 'Can create and edit drafts' },
    { id: 'Viewer', name: 'Viewer', description: 'Read-only access' }
  ]

  const roles = (availableRoles && availableRoles.length > 0) ? availableRoles : defaultRoles
  
  // Load departments from API
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const res = await api.get('/system/config/departments')
        setDepartments(res.data.data.departments || [])
      } catch (error) {
        console.error('Failed to load departments:', error)
        // Fallback to empty array if API fails
        setDepartments([])
      }
    }
    loadDepartments()
  }, [])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleRoleToggle = (roleId) => {
    setSelectedRoles(prev => {
      const newRoles = prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
      return newRoles
    })
  }

  const handleSubmit = () => {
    if (!formData.userName || !formData.email) {
      alert('Please enter user name and email')
      return
    }

    if (selectedRoles.length === 0) {
      alert('Please assign at least one role to the user')
      return
    }

    const userData = {
      ...formData,
      roles: selectedRoles
    }
    
    onSubmit(userData)
  }

  const modal = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">
              {initialData ? 'Edit User' : 'Add New User'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Create user account and assign roles
          </p>
        </div>

        {/* Form Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">Basic Information</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  User Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="userName"
                  value={formData.userName}
                  onChange={handleInputChange}
                  placeholder="Enter full name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="user@company.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Department
                </label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="">Select department</option>
                  {departments.map((dept) => (
                    <option key={`dept-${dept.id}`} value={dept.name}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Role Assignment */}
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-900">Role Assignment <span className="text-red-500">*</span></h4>
              <p className="text-sm text-gray-600 mt-1">Select one or more roles for this user</p>
            </div>

            <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 space-y-3">
              {roles.map((role) => (
                <label 
                  key={`role-${role.id}`} 
                  className="flex items-start gap-3 cursor-pointer hover:bg-gray-100 p-2 rounded-lg transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role.id)}
                    onChange={() => handleRoleToggle(role.id)}
                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{role.name}</div>
                    {role.description && (
                      <div className="text-sm text-gray-600">{role.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
            
            {selectedRoles.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-blue-800">
                    <strong>{selectedRoles.length}</strong> role{selectedRoles.length > 1 ? 's' : ''} selected: {selectedRoles.map(roleId => roles.find(r => r.id === roleId)?.name).join(', ')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!initialData && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm text-yellow-800">
                  A temporary password will be generated and sent to the user's email address.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {initialData ? 'Update User' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}
