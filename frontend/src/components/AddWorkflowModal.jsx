import React, { useState, useEffect } from 'react'
import * as ReactDOM from 'react-dom'
import api from '../api/axios'

export default function AddWorkflowModal({ onClose, onSubmit, initialData }) {
  const [documentTypes, setDocumentTypes] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({
    workflowName: initialData?.workflowName || '',
    documentTypeId: initialData?.documentTypeId || '',
    description: initialData?.description || '',
    status: initialData?.status || 'Active'
  })

  const [workflowSteps, setWorkflowSteps] = useState(
    initialData?.workflowSteps || [
      {
        id: 1,
        stepName: 'Review Stage',
        roleId: '',
        timeout: 3
      }
    ]
  )

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [docTypesRes, rolesRes] = await Promise.all([
        api.get('/system/config/document-types'),
        api.get('/roles')
      ])
      
      // Extract data from response (handle both data.documentTypes and data.data.documentTypes)
      const docTypes = docTypesRes.data.documentTypes || docTypesRes.data.data?.documentTypes || []
      const rolesData = rolesRes.data.roles || rolesRes.data.data?.roles || []

      setDocumentTypes(docTypes)
      setRoles(rolesData)
      
      if (docTypes.length === 0) {
        console.warn('No document types found. Please add document types in Master Data Management.')
      }
      if (rolesData.length === 0) {
        console.warn('No roles found. Please add roles in User Management.')
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
      alert('Failed to load document types and roles. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }


  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleStepChange = (stepId, field, value) => {
    setWorkflowSteps(prev =>
      prev.map(step =>
        step.id === stepId ? { ...step, [field]: value } : step
      )
    )
  }

  const handleStepUsersChange = (stepId, selectedUsers) => {
    setWorkflowSteps(prev =>
      prev.map(step =>
        step.id === stepId ? { ...step, users: selectedUsers } : step
      )
    )
  }

  const addStep = () => {
    const newStep = {
      id: Date.now(),
      stepName: `Step ${workflowSteps.length + 1}`,
      roleId: '',
      timeout: 3
    }
    setWorkflowSteps(prev => [...prev, newStep])
  }

  const removeStep = (stepId) => {
    if (workflowSteps.length > 1) {
      setWorkflowSteps(prev => prev.filter(step => step.id !== stepId))
    }
  }

  const moveStepUp = (index) => {
    if (index > 0) {
      const newSteps = [...workflowSteps]
      ;[newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]]
      setWorkflowSteps(newSteps)
    }
  }

  const moveStepDown = (index) => {
    if (index < workflowSteps.length - 1) {
      const newSteps = [...workflowSteps]
      ;[newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]]
      setWorkflowSteps(newSteps)
    }
  }

  const handleSubmit = () => {
    if (!formData.workflowName || !formData.documentTypeId || workflowSteps.length === 0) {
      alert('Please fill in workflow name, document type, and at least one workflow step')
      return
    }

    // Validate all steps have roles
    const invalidSteps = workflowSteps.filter(step => !step.roleId)
    if (invalidSteps.length > 0) {
      alert('Please assign a role for all workflow steps')
      return
    }

    const workflowData = {
      ...formData,
      workflowSteps
    }
    
    onSubmit(workflowData)
  }

  const modal = (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center p-4 z-[90] overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-lg z-10">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">
              {initialData ? 'Edit Workflow' : 'Add New Workflow'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Configure approval workflow steps and routing rules for document processing
          </p>
        </div>

        {/* Form Content */}
        <div className="px-6 py-4 max-h-[calc(100vh-300px)] overflow-y-auto">
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 text-lg">Basic Information</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Workflow Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="workflowName"
                    value={formData.workflowName}
                    onChange={handleInputChange}
                    placeholder="Enter workflow name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Document Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="documentTypeId"
                    value={formData.documentTypeId}
                    onChange={handleInputChange}
                    disabled={loading || !!initialData}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">{loading ? 'Loading...' : 'Select document type'}</option>
                    {documentTypes.map((type) => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                  {initialData && (
                    <p className="text-xs text-gray-500 mt-1">Document type cannot be changed when editing</p>
                  )}
                  {!loading && documentTypes.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">⚠ No document types available. Please add document types in Configuration → Master Data Management first.</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Enter workflow description"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  />
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

            {/* Workflow Steps Builder */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900 text-lg">Workflow Steps</h4>
                <button
                  onClick={addStep}
                  className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  + Add Step
                </button>
              </div>

              <div className="space-y-4">
                {workflowSteps.map((step, index) => (
                  <div key={step.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full font-semibold text-sm">
                          {index + 1}
                        </span>
                        <input
                          type="text"
                          value={step.stepName}
                          onChange={(e) => handleStepChange(step.id, 'stepName', e.target.value)}
                          placeholder="Step name"
                          className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium"
                        />
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => moveStepUp(index)}
                          disabled={index === 0}
                          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => moveStepDown(index)}
                          disabled={index === workflowSteps.length - 1}
                          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => removeStep(step.id)}
                          disabled={workflowSteps.length === 1}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Remove step"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role Required <span className="text-red-500">*</span></label>
                        <select
                          value={step.roleId}
                          onChange={(e) => handleStepChange(step.id, 'roleId', e.target.value)}
                          disabled={loading}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                        >
                          <option value="">{loading ? 'Loading...' : 'Select role'}</option>
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>{role.name}</option>
                          ))}
                        </select>
                        {!loading && roles.length === 0 && (
                          <p className="text-xs text-amber-600 mt-1">⚠ No roles available. Please add roles in User Management first.</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Timeout (days)</label>
                        <input
                          type="number"
                          value={step.timeout}
                          onChange={(e) => handleStepChange(step.id, 'timeout', parseInt(e.target.value) || 0)}
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                        />
                      </div>

                    </div>
                  </div>
                ))}
              </div>

              {/* Workflow Flow Visualization */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-2">Workflow Flow:</p>
                <div className="flex items-center gap-2 text-sm text-blue-700 flex-wrap">
                  <span className="px-2 py-1 bg-white rounded font-medium">Draft</span>
                  {workflowSteps.map((step, index) => (
                    <React.Fragment key={step.id}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="px-2 py-1 bg-white rounded font-medium">{step.stepName}</span>
                    </React.Fragment>
                  ))}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded font-medium">Published</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : initialData ? 'Update Workflow' : 'Create Workflow'}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
