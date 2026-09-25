import React, { useState, useEffect } from 'react'
import * as ReactDOM from 'react-dom'
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
  const [divisions, setDivisions] = useState([])
  const [selectedDivisions, setSelectedDivisions] = useState([])
  const [loadingDivisions, setLoadingDivisions] = useState(false)

  const defaultRoles = [
    { id: 1, numericId: 1, name: 'Admin', roleName: 'admin', description: 'Full system access' },
    { id: 2, numericId: 2, name: 'Reviewer', roleName: 'reviewer', description: 'Can review documents' },
    { id: 3, numericId: 3, name: 'Approver', roleName: 'approver', description: 'Can approve documents' },
    { id: 4, numericId: 4, name: 'Acknowledger', roleName: 'acknowledger', description: 'Can acknowledge documents' },
    { id: 5, numericId: 5, name: 'Drafter', roleName: 'drafter', description: 'Can create and edit drafts' },
    { id: 6, numericId: 6, name: 'Viewer', roleName: 'viewer', description: 'Read-only access' }
  ]

  const roles = (availableRoles && availableRoles.length > 0) ? availableRoles : defaultRoles
  
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const res = await api.get('/system/config/departments')
        setDepartments(res.data.data.departments || [])
      } catch (error) {
        console.error('Failed to load departments:', error)
        setDepartments([])
      }
    }
    loadDepartments()
  }, [])

  useEffect(() => {
    if (initialData) return

    const loadDivisions = async () => {
      setLoadingDivisions(true)
      try {
        const res = await api.get('/divisions')
        const divisionsData = res.data?.data?.divisions || []
        const activeDivisions = divisionsData.filter((d) => d?.isActive !== false)
        setDivisions(activeDivisions)

        const lastActiveDivisionIdRaw = localStorage.getItem('lastActiveDivisionId')
        const lastActiveDivisionId = lastActiveDivisionIdRaw ? Number.parseInt(lastActiveDivisionIdRaw, 10) : null
        const lastActiveDivisionAvailable = Number.isFinite(lastActiveDivisionId) && activeDivisions.some((d) => d.id === lastActiveDivisionId)

        if (lastActiveDivisionAvailable) {
          setSelectedDivisions([lastActiveDivisionId])
        } else if (activeDivisions.length === 1) {
          setSelectedDivisions([activeDivisions[0].id])
        } else {
          setSelectedDivisions([])
        }
      } catch (error) {
        console.error('Failed to load divisions:', error)
        setDivisions([])
        setSelectedDivisions([])
      } finally {
        setLoadingDivisions(false)
      }
    }

    loadDivisions()
  }, [initialData])

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

    if (!initialData && selectedDivisions.length === 0) {
      alert('Please assign at least one division to the user')
      return
    }

    const userData = {
      ...formData,
      roles: selectedRoles,
      divisionIds: initialData ? undefined : selectedDivisions
    }
    
    onSubmit(userData)
  }

  const modal = (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center p-4 z-[90] modal-uniform">
      <div className="bg-[var(--dms-color-bg-surface)] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border-2 border-[var(--dms-color-border-default)]">
        <div className="px-6 py-4 border-b-2 border-[var(--dms-color-border-default)] sticky top-0 bg-[var(--dms-color-bg-surface)]">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-ink">
              {initialData ? 'Edit User' : 'Add New User'}
            </h3>
            <button onClick={onClose} className="text-ink-muted hover:text-ink-secondary transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-ink-secondary mt-2">
            Create user account and assign roles
          </p>
        </div>

        <div className="px-6 py-4 space-y-6">
          <div className="space-y-4">
            <h4 className="font-semibold text-ink">Basic Information</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  User Name <span className="text-[var(--dms-color-danger-ink)]">*</span>
                </label>
                <input
                  type="text"
                  name="userName"
                  value={formData.userName}
                  onChange={handleInputChange}
                  placeholder="Enter full name"
                  className="w-full rounded-xl border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-4 py-3 text-ink outline-none transition-all duration-150 focus:border-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  Email <span className="text-[var(--dms-color-danger-ink)]">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="user@company.com"
                  className="w-full rounded-xl border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-4 py-3 text-ink outline-none transition-all duration-150 focus:border-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  Department
                </label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-4 py-3 text-ink outline-none transition-all duration-150 focus:border-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20"
                >
                  <option value="">Select department</option>
                  {departments.map((dept) => (
                    <option key={`dept-${dept.id}`} value={dept.name}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-4 py-3 text-ink outline-none transition-all duration-150 focus:border-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-ink">Role Assignment <span className="text-[var(--dms-color-danger-ink)]">*</span></h4>
              <p className="text-sm text-ink-secondary mt-1">Select one or more roles for this user</p>
            </div>

            <div className="border-2 border-[var(--dms-color-border-default)] rounded-[16px] p-4 bg-[var(--dms-color-bg-surface-muted)] space-y-3">
              {roles.map((role) => (
                <label 
                  key={`role-${role.id}`} 
                  className="flex items-start gap-3 cursor-pointer hover:bg-[var(--dms-color-bg-surface)] p-2 rounded-lg transition-colors"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] focus-within:ring-2 focus-within:ring-[var(--dms-color-brand-primary)]/30 focus-within:border-[var(--dms-color-brand-primary)] mt-1">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role.id)}
                      onChange={() => handleRoleToggle(role.id)}
                      className="h-5 w-5 accent-[var(--dms-color-brand-primary)] cursor-pointer border-0 focus:ring-0"
                    />
                  </span>
                  <div className="flex-1">
                    <div className="font-medium text-ink">{role.name}</div>
                    {role.description && (
                      <div className="text-sm text-ink-secondary">{role.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
            
            {selectedRoles.length > 0 && (
              <div className="rounded-[16px] border-2 border-[var(--dms-color-info-ink)]/20 bg-[color-mix(in_srgb,var(--dms-color-bg-info-soft)_70%,var(--dms-color-bg-card))] p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--dms-color-info-ink)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-[var(--dms-color-info-ink)]">
                    <strong>{selectedRoles.length}</strong> role{selectedRoles.length > 1 ? 's' : ''} selected: {selectedRoles.map(roleId => roles.find(r => r.id === roleId)?.name).join(', ')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!initialData && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-ink">Division Assignment <span className="text-[var(--dms-color-danger-ink)]">*</span></h4>
                <p className="text-sm text-ink-secondary mt-1">
                  Select one or more divisions for this user
                </p>
              </div>

              <div className="border-2 border-[var(--dms-color-border-default)] rounded-[16px] p-4 bg-[var(--dms-color-bg-surface-muted)] space-y-3">
                {loadingDivisions ? (
                  <div className="text-sm text-ink-secondary">Loading divisions...</div>
                ) : divisions.length > 0 ? (
                  divisions.map((division) => (
                    <label
                      key={`division-${division.id}`}
                      className="flex items-start gap-3 cursor-pointer hover:bg-[var(--dms-color-bg-surface)] p-2 rounded-lg transition-colors"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] focus-within:ring-2 focus-within:ring-[var(--dms-color-brand-primary)]/30 focus-within:border-[var(--dms-color-brand-primary)] mt-1">
                        <input
                          type="checkbox"
                          checked={selectedDivisions.includes(division.id)}
                          onChange={() => {
                            setSelectedDivisions((prev) => {
                              if (prev.includes(division.id)) return prev.filter((id) => id !== division.id)
                              return [...prev, division.id]
                            })
                          }}
                          className="h-5 w-5 accent-[var(--dms-color-brand-primary)] cursor-pointer border-0 focus:ring-0"
                        />
                      </span>
                      <div className="flex-1">
                        <div className="font-medium text-ink">{division.name}</div>
                        <div className="text-sm text-ink-secondary">{division.code}</div>
                      </div>
                    </label>
                  ))
                ) : (
                  <div className="text-sm text-ink-secondary">No divisions available</div>
                )}
              </div>

              {selectedDivisions.length > 0 ? (
                <div className="rounded-[16px] border-2 border-[var(--dms-color-info-ink)]/20 bg-[color-mix(in_srgb,var(--dms-color-bg-info-soft)_70%,var(--dms-color-bg-card))] p-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-[var(--dms-color-info-ink)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-[var(--dms-color-info-ink)]">
                      <strong>{selectedDivisions.length}</strong> division{selectedDivisions.length > 1 ? 's' : ''} selected: {selectedDivisions.map((divisionId) => divisions.find((d) => d.id === divisionId)?.code || divisionId).join(', ')}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {!initialData && (
            <div className="rounded-[16px] border-2 border-[var(--dms-color-warning-ink)]/20 bg-[color-mix(in_srgb,var(--dms-color-warning-soft)_70%,var(--dms-color-bg-card))] p-4">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[var(--dms-color-warning-ink)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm text-[var(--dms-color-warning-ink)]">
                  A temporary password will be generated and sent to the user's email address.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-[var(--dms-color-bg-surface-muted)] border-t-2 border-[var(--dms-color-border-default)] flex justify-end gap-3 sticky bottom-0">
          <button
            onClick={onClose}
            className="rounded-xl h-10 px-4 border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] text-ink-secondary font-semibold transition-all hover:border-[var(--dms-color-border-strong)] hover:text-ink text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-xl h-10 px-4 border-2 border-[var(--dms-color-brand-primary)] bg-[var(--dms-color-brand-primary)] text-white font-semibold transition-all hover:bg-[color-mix(in_srgb,var(--dms-color-brand-primary)_90%,black)] text-sm"
          >
            {initialData ? 'Update User' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
