import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import AddTemplateModal from './AddTemplateModal'
import TemplatePreviewModal from './TemplatePreviewModal'
import RolePermission from './RolePermission'
import GeneralSystemSettings from './GeneralSystemSettings'
import AuditLogSettings from './AuditLogSettings'
import BackupRecovery from './BackupRecovery'
import MasterDataManagement from './MasterDataManagement'
import DatabaseCleanup from './DatabaseCleanup'
import ActionMenu from './ActionMenu'
import { PermissionGate } from './PermissionGate'
import { hasPermission, hasAnyPermission } from '../utils/permissions'
import { usePreferences } from '../contexts/PreferencesContext'
import Pagination from './Pagination'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import { useLocation } from 'react-router-dom'

const VALID_CONFIG_TABS = ['general', 'masterdata', 'roles', 'template', 'audit', 'backup', 'cleanup']

// Tab Navigation Component
function TabNavigation({ activeTab, onTabChange }) {
  const { t } = usePreferences()
  const tabs = [
    { id: 'general', label: t('cfg_general_system') },
    { id: 'masterdata', label: t('cfg_master_data') },
    { id: 'roles', label: t('cfg_role_permission') },
    { id: 'template', label: t('cfg_template_mgmt') },
    { id: 'audit', label: t('cfg_audit_log') },
    { id: 'backup', label: t('cfg_backup_recovery') },
    { id: 'cleanup', label: t('cfg_database_cleanup') }
  ]

  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="flex space-x-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            data-tour-id={`config-tab-${tab.id}`}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600'
                : 'border-transparent hover:border-gray-300'
            }`}
            style={{
              color: activeTab === tab.id ? 'var(--dms-tab-active)' : 'var(--dms-tab-text)',
              borderColor: activeTab === tab.id ? 'var(--dms-tab-active)' : 'transparent'
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

// Template Management Tab Component
function TemplateManagement() {
  const { t } = usePreferences()
  const [activeSubTab, setActiveSubTab] = useState('templates')
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [documentTypes, setDocumentTypes] = useState([])
  const [isAdminUser, setIsAdminUser] = useState(false)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'error' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'warning' })
  const [templateRequests, setTemplateRequests] = useState([])
  const [loadingTemplateRequests, setLoadingTemplateRequests] = useState(false)
  const [showTemplateRequestModal, setShowTemplateRequestModal] = useState(false)
  const [templateRequestForm, setTemplateRequestForm] = useState({
    requestType: 'NEW',
    documentTypeMode: 'existing',
    documentTypeId: '',
    documentTypeName: '',
    templateMode: 'existing',
    templateId: '',
    templateName: '',
    description: ''
  })

  useEffect(() => {
    loadTemplates()
    loadDocumentTypes()
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user')
      const user = raw ? JSON.parse(raw) : null
      const roles = Array.isArray(user?.roles) ? user.roles : []
      const hasAdmin = roles.some((r) => r?.role?.name === 'admin' || r?.name === 'admin')
      setIsAdminUser(!!hasAdmin)
    } catch {
      setIsAdminUser(false)
    }
  }, [])

  const loadDocumentTypes = async () => {
    try {
      const res = await api.get('/system/config/document-types')
      setDocumentTypes(res.data.data.documentTypes || [])
    } catch (error) {
      console.error('Failed to load document types:', error)
    }
  }

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const res = await api.get('/templates')
      const data = res.data.data?.templates || []
      setTemplates(data)
    } catch (error) {
      console.error('Failed to load templates:', error)
      // Mock data for demonstration
      const mockTemplates = [
        {
          id: 1,
          documentType: 'Proposal',
          templateName: 'TMP - Project Proposal v01.dotx',
          version: '4.0',
          prefixCode: 'P',
          uploadedBy: 'Mr. Khairul',
          uploadedOn: '22/02/2021'
        },
        {
          id: 2,
          documentType: 'Business Case',
          templateName: 'TMP - Business Case (Client-Facing) v01.dotx',
          version: '3.8',
          prefixCode: 'BC',
          uploadedBy: 'Ms. Hanish',
          uploadedOn: '15/06/2020'
        },
        {
          id: 3,
          documentType: 'Project Plan',
          templateName: 'TMP - Project Plan v01.dotx',
          version: '1.4',
          prefixCode: 'PP',
          uploadedBy: 'Mr. Khairul',
          uploadedOn: '31/12/2021'
        },
        {
          id: 4,
          documentType: 'Work Breakdown Structure',
          templateName: 'TMP - Work Breakdown Structure v01.dotx',
          version: '2.3',
          prefixCode: 'WBS',
          uploadedBy: 'Ms. Hanish',
          uploadedOn: '10/05/2022'
        },
        {
          id: 5,
          documentType: 'Project Requirement Analysis',
          templateName: 'TMP - Project Requirement Analysis v01.dotx',
          version: '3.6',
          prefixCode: 'PRA',
          uploadedBy: 'Mr. Khairul',
          uploadedOn: '21/10/2020'
        },
        {
          id: 6,
          documentType: 'Risk Management Plan',
          templateName: 'TMP - Risk Management Plan v01.dotx',
          version: '3.0',
          prefixCode: 'RMP',
          uploadedBy: 'Ms. Hanish',
          uploadedOn: '16/10/2025'
        },
        {
          id: 7,
          documentType: 'Project Schedule',
          templateName: 'TMP - Project Schedule v01.dotx',
          version: '1.0',
          prefixCode: 'PS',
          uploadedBy: 'Mr. Khairul',
          uploadedOn: '24/10/2023'
        }
      ]
      setTemplates(mockTemplates)
    } finally {
      setLoading(false)
    }
  }

  const filteredTemplates = templates.filter(template =>
    template.documentType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.templateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.prefixCode.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  useEffect(() => {
    if (activeSubTab !== 'requests') return
    if (!hasPermission('configuration.templateRequests', 'read') && !hasPermission('configuration.templateRequests', 'view')) return
    loadTemplateRequests()
  }, [activeSubTab])

  const totalRecords = filteredTemplates.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const currentTemplates = filteredTemplates.slice(startIndex, endIndex)

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleView = (template) => {
    setPreviewTemplate(template)
    setShowPreviewModal(true)
  }

  const handleReupload = (e, template) => {
    e?.preventDefault()
    // Set the template data for editing
    setEditingTemplate({
      id: template.id,
      documentType: template.documentType,
      templateName: template.templateName,
      version: template.version,
      prefixCode: template.prefixCode
    })
    setShowAddTemplateModal(true)
  }

  const handleDownload = async (template) => {
    try {
      const token = localStorage.getItem('token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      
      // Fetch the file as blob
      const response = await fetch(`${baseURL}/templates/${template.id}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Download failed')
      }
      
      // Create blob and download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = template.fileName || template.templateName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to download template:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to download template file', type: 'error' })
    }
  }

  const handleDeleteTemplate = async (template) => {
    if (!isAdminUser) {
      setAlertModal({ show: true, title: 'Error', message: 'Only administrators can delete templates', type: 'error' })
      return
    }

    setConfirmModal({
      show: true,
      title: t('delete'),
      message: `Delete template "${template.templateName}"? This will permanently remove it from the database.`,
      type: 'warning',
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/templates/${template.id}`)
          setTemplates((prev) => prev.filter((x) => x.id !== template.id))
          setAlertModal({ show: true, title: 'Success', message: 'Template deleted successfully!', type: 'success' })
        } catch (error) {
          console.error('Failed to delete template:', error)
          setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to delete template', type: 'error' })
        }
      }
    })
  }

  const loadTemplateRequests = async () => {
    try {
      setLoadingTemplateRequests(true)
      const res = await api.get('/templates/requests')
      setTemplateRequests(res.data?.data?.requests || [])
    } catch (error) {
      console.error('Failed to load template requests:', error)
      setTemplateRequests([])
    } finally {
      setLoadingTemplateRequests(false)
    }
  }

  const openTemplateRequestModal = async () => {
    setTemplateRequestForm({
      requestType: 'NEW',
      documentTypeMode: 'existing',
      documentTypeId: '',
      documentTypeName: '',
      templateMode: 'existing',
      templateId: '',
      templateName: '',
      description: ''
    })
    setShowTemplateRequestModal(true)
  }

  const submitTemplateRequest = async () => {
    const requestType = String(templateRequestForm.requestType || '').toUpperCase()
    const docMode = templateRequestForm.documentTypeMode
    const tplMode = templateRequestForm.templateMode
    const documentTypeId = docMode === 'existing' && templateRequestForm.documentTypeId ? parseInt(templateRequestForm.documentTypeId) : null
    const documentTypeName = docMode === 'new' ? String(templateRequestForm.documentTypeName || '').trim() : null
    const templateId = tplMode === 'existing' && templateRequestForm.templateId ? parseInt(templateRequestForm.templateId) : null
    const templateName = tplMode === 'new' ? String(templateRequestForm.templateName || '').trim() : null
    const description = String(templateRequestForm.description || '').trim()

    if (!documentTypeId && !documentTypeName) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'Please select an existing document type or enter a new one.', type: 'warning' })
      return
    }

    if (requestType === 'NEW' && !templateName) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'Please enter a template name.', type: 'warning' })
      return
    }

    if (requestType === 'UPDATE' && !templateId && !templateName) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'Please select an existing template or enter a new template name.', type: 'warning' })
      return
    }

    try {
      await api.post('/templates/requests', {
        requestType,
        documentTypeId,
        documentTypeName,
        templateId,
        templateName,
        description: description || null
      })
      setShowTemplateRequestModal(false)
      setAlertModal({ show: true, title: 'Success', message: 'Template request submitted successfully.', type: 'success' })
      if (activeSubTab === 'requests') loadTemplateRequests()
    } catch (error) {
      console.error('Failed to submit template request:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to submit template request.', type: 'error' })
    }
  }

  const updateTemplateRequestStatus = async (request, nextStatus) => {
    const label = nextStatus === 'RESOLVED' ? 'Resolve' : 'Reject'
    setConfirmModal({
      show: true,
      title: `${label} Template Request`,
      message: `Mark this request as ${label.toLowerCase()}?`,
      type: nextStatus === 'REJECTED' ? 'warning' : 'info',
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.patch(`/templates/requests/${request.id}`, { status: nextStatus })
          setAlertModal({ show: true, title: 'Success', message: 'Request updated successfully.', type: 'success' })
          loadTemplateRequests()
        } catch (error) {
          console.error('Failed to update template request:', error)
          setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to update request.', type: 'error' })
        }
      }
    })
  }

  const handleAddNewTemplate = (e) => {
    e?.preventDefault()
    setEditingTemplate(null)
    setShowAddTemplateModal(true)
  }

  const handleTemplateSubmit = async (templateData) => {
    try {
      // Find the document type ID from the selected document type
      const selectedDocType = documentTypes.find(dt => dt.name === templateData.documentType)
      if (!selectedDocType) {
        setAlertModal({ show: true, title: 'Error', message: 'Invalid document type selected', type: 'error' })
        return
      }

      // Create FormData for file upload
      const formData = new FormData()
      formData.append('documentTypeId', selectedDocType.id)
      formData.append('templateName', templateData.templateName)
      formData.append('version', templateData.version)
      formData.append('uploadedBy', 'Current User') // TODO: Get from auth context
      
      // Append only the first file (backend accepts single file)
      if (templateData.files && templateData.files.length > 0) {
        formData.append('files', templateData.files[0])
      } else {
        setAlertModal({ show: true, title: 'Validation Error', message: 'Please upload a template file', type: 'warning' })
        return
      }

      if (editingTemplate) {
        // Update existing template
        // Note: Don't set Content-Type manually for FormData - browser will set it with boundary
        await api.put(`/templates/${editingTemplate.id}`, formData)
        setAlertModal({ show: true, title: 'Success', message: 'Template updated successfully!', type: 'success' })
      } else {
        // Create new template
        // Note: Don't set Content-Type manually for FormData - browser will set it with boundary
        await api.post('/templates', formData)
        setAlertModal({ show: true, title: 'Success', message: 'Template added successfully!', type: 'success' })
      }
      
      setShowAddTemplateModal(false)
      setEditingTemplate(null)
      
      // Reload templates list
      loadTemplates()
    } catch (error) {
      console.error('Failed to save template:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to save template', type: 'error' })
    }
  }

  // Document types are now loaded from API

  return (
    <div className="space-y-6">
      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false })}
      />

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'error' })}
      />

      {/* Add/Reupload Template Modal */}
      {showAddTemplateModal && (
        <AddTemplateModal
          onClose={() => {
            setShowAddTemplateModal(false)
            setEditingTemplate(null)
          }}
          onSubmit={handleTemplateSubmit}
          initialData={editingTemplate}
          documentTypes={documentTypes.map(dt => dt.name)}
        />
      )}
      
      {/* Template Preview Modal */}
      {showPreviewModal && previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => {
            setShowPreviewModal(false)
            setPreviewTemplate(null)
          }}
        />
      )}
      {/* Header */}
      <div className="card p-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('cfg_template_config')}</h2>
        <p className="text-sm text-gray-600 mt-1">
          {t('cfg_template_config_desc')}
        </p>
        <p className="text-sm text-gray-600">
          {t('cfg_template_autolink')}
        </p>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            type="button"
            onClick={() => setActiveSubTab('templates')}
            data-tour-id="tmpl-subtab-templates"
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeSubTab === 'templates'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t('cfg_template_list')}
          </button>
          {hasAnyPermission('configuration.templateRequests') && (
            <button
              type="button"
              onClick={() => setActiveSubTab('requests')}
              data-tour-id="tmpl-subtab-requests"
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeSubTab === 'requests'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Template Requests
            </button>
          )}
        </nav>
      </div>

      {showTemplateRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Request Template</h3>
              <button
                type="button"
                onClick={() => setShowTemplateRequestModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Request Type</label>
                  <select
                    value={templateRequestForm.requestType}
                    onChange={(e) => {
                      const v = e.target.value
                      setTemplateRequestForm((prev) => ({
                        ...prev,
                        requestType: v,
                        templateMode: v === 'NEW' ? 'new' : prev.templateMode,
                        templateId: v === 'NEW' ? '' : prev.templateId
                      }))
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  >
                    <option value="NEW">New Template</option>
                    <option value="UPDATE">Update Existing Template</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Document Type</label>
                  <div className="flex items-center gap-4 mb-2">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="docTypeModeCfg"
                        checked={templateRequestForm.documentTypeMode === 'existing'}
                        onChange={() => setTemplateRequestForm((prev) => ({ ...prev, documentTypeMode: 'existing', documentTypeName: '' }))}
                      />
                      Existing
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="docTypeModeCfg"
                        checked={templateRequestForm.documentTypeMode === 'new'}
                        onChange={() => setTemplateRequestForm((prev) => ({ ...prev, documentTypeMode: 'new', documentTypeId: '' }))}
                      />
                      New
                    </label>
                  </div>

                  {templateRequestForm.documentTypeMode === 'existing' ? (
                    <select
                      value={templateRequestForm.documentTypeId}
                      onChange={(e) => setTemplateRequestForm((prev) => ({ ...prev, documentTypeId: e.target.value, templateId: '' }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                    >
                      <option value="">Select document type</option>
                      {documentTypes.map((dt) => (
                        <option key={dt.id} value={dt.id}>{dt.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={templateRequestForm.documentTypeName}
                      onChange={(e) => setTemplateRequestForm((prev) => ({ ...prev, documentTypeName: e.target.value }))}
                      placeholder="Enter new document type"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Template</label>
                {templateRequestForm.requestType === 'UPDATE' && (
                  <div className="flex items-center gap-4 mb-2">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="tplModeCfg"
                        checked={templateRequestForm.templateMode === 'existing'}
                        onChange={() => setTemplateRequestForm((prev) => ({ ...prev, templateMode: 'existing', templateName: '' }))}
                      />
                      Existing
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="tplModeCfg"
                        checked={templateRequestForm.templateMode === 'new'}
                        onChange={() => setTemplateRequestForm((prev) => ({ ...prev, templateMode: 'new', templateId: '' }))}
                      />
                      New
                    </label>
                  </div>
                )}

                {templateRequestForm.requestType === 'NEW' || templateRequestForm.templateMode === 'new' ? (
                  <input
                    type="text"
                    value={templateRequestForm.templateName}
                    onChange={(e) => setTemplateRequestForm((prev) => ({ ...prev, templateName: e.target.value }))}
                    placeholder="Enter template name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                ) : (
                  <select
                    value={templateRequestForm.templateId}
                    onChange={(e) => setTemplateRequestForm((prev) => ({ ...prev, templateId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                    disabled={templateRequestForm.documentTypeMode !== 'existing' || !templateRequestForm.documentTypeId}
                  >
                    <option value="">Select template</option>
                    {(() => {
                      const dt = templateRequestForm.documentTypeId ? documentTypes.find((x) => String(x.id) === String(templateRequestForm.documentTypeId)) : null
                      const dtName = dt?.name
                      const list = dtName ? templates.filter((tpl) => tpl.documentType === dtName) : []
                      return list.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>{tpl.templateName} (v{tpl.version})</option>
                      ))
                    })()}
                  </select>
                )}
                {templateRequestForm.requestType === 'UPDATE' && templateRequestForm.templateMode === 'existing' && templateRequestForm.documentTypeMode !== 'existing' && (
                  <p className="mt-1 text-xs text-gray-500">Select an existing document type to choose an existing template.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description / Reason</label>
                <textarea
                  value={templateRequestForm.description}
                  onChange={(e) => setTemplateRequestForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  rows={3}
                  placeholder="Describe what you need (optional)"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowTemplateRequestModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={submitTemplateRequest}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                {t('submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template List */}
      <div className="card p-6">
        {activeSubTab === 'templates' && (
          <>
            <div className="mb-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{t('cfg_template_list')}</h3>
                  <p className="text-sm text-gray-600 mt-1">{t('cfg_template_list_desc')}</p>
                </div>

                <PermissionGate module="configuration.templates" action="create">
                  <button
                    onClick={handleAddNewTemplate}
                    data-tour-id="tmpl-btn-add-template"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {t('cfg_add_new_template')}
                  </button>
                </PermissionGate>
              </div>

              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={t('cfg_search_template')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('document_type')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('cfg_template_name')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('version')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('cfg_prefix_code')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('cfg_uploaded_by')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('cfg_uploaded_on')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="text-center py-8 text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                          <span>{t('cfg_loading_templates')}</span>
                        </div>
                      </td>
                    </tr>
                  ) : currentTemplates.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-12 text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>{t('cfg_no_templates')}</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    currentTemplates.map((template) => (
                      <tr key={template.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-4 text-gray-700">{template.documentType}</td>
                        <td className="py-4 px-4 text-gray-700">{template.templateName}</td>
                        <td className="py-4 px-4 text-gray-700">{template.version}</td>
                        <td className="py-4 px-4 text-gray-700">{template.prefixCode}</td>
                        <td className="py-4 px-4 text-gray-700">{template.uploadedBy}</td>
                        <td className="py-4 px-4 text-gray-700">{template.uploadedOn}</td>
                        <td className="py-4 px-4">
                          <ActionMenu
                            actions={[
                              ...(hasPermission('configuration.templates', 'read') ? [{ label: t('view'), onClick: () => handleView(template) }] : []),
                              ...(hasPermission('configuration.templates', 'update') ? [{ label: t('cfg_reupload'), onClick: (e) => handleReupload(e, template) }] : []),
                              ...(hasPermission('configuration.templates', 'read') ? [{ label: t('download'), onClick: () => handleDownload(template) }] : []),
                              ...(isAdminUser ? [{ label: t('delete'), onClick: () => handleDeleteTemplate(template), variant: 'destructive' }] : [])
                            ]}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-4">
              {loading ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span>{t('cfg_loading_templates')}</span>
                  </div>
                </div>
              ) : currentTemplates.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <span>{t('cfg_no_templates')}</span>
                </div>
              ) : (
                currentTemplates.map((template) => (
                  <div key={template.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div>
                      <div className="font-semibold text-gray-900">{template.documentType}</div>
                      <div className="text-sm text-gray-600 mt-1">{template.templateName}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">{t('version')}:</span>
                        <div className="text-gray-900 font-medium">{template.version}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">{t('cfg_prefix_code')}:</span>
                        <div className="text-gray-900 font-medium">{template.prefixCode}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">{t('cfg_uploaded_by')}:</span>
                        <div className="text-gray-900 font-medium">{template.uploadedBy}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">{t('cfg_uploaded_on')}:</span>
                        <div className="text-gray-900 font-medium">{template.uploadedOn}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-gray-200">
                      {hasPermission('configuration.templates', 'read') && (
                        <button
                          onClick={() => handleView(template)}
                          className="flex-1 px-3 py-2 text-sm text-white bg-gray-500 rounded hover:bg-gray-600"
                        >
                          {t('view')}
                        </button>
                      )}
                      {hasPermission('configuration.templates', 'update') && (
                        <button
                          onClick={(e) => handleReupload(e, template)}
                          className="flex-1 px-3 py-2 text-sm text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
                        >
                          {t('cfg_reupload')}
                        </button>
                      )}
                      {hasPermission('configuration.templates', 'read') && (
                        <button
                          onClick={() => handleDownload(template)}
                          className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
                        >
                          {t('download')}
                        </button>
                      )}
                      {isAdminUser && (
                        <button
                          onClick={() => handleDeleteTemplate(template)}
                          className="flex-1 px-3 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-700"
                        >
                          {t('delete')}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalRecords={totalRecords}
              pageSize={pageSize}
              onPageChange={handlePageChange}
              onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
            />
          </>
        )}

        {activeSubTab === 'requests' && hasAnyPermission('configuration.templateRequests') && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Template Requests</h3>
                <p className="text-sm text-gray-600 mt-1">Request a new template or ask to update an existing template.</p>
              </div>
              <PermissionGate module="configuration.templateRequests" action="create">
                <button
                  type="button"
                  onClick={openTemplateRequestModal}
                  data-tour-id="tmpl-btn-request-template"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Request Template
                </button>
              </PermissionGate>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Document Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Template</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Status</th>
                    {hasPermission('configuration.templateRequests', 'update') && (
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Requested By</th>
                    )}
                    {hasPermission('configuration.templateRequests', 'update') && (
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loadingTemplateRequests ? (
                    <tr>
                      <td colSpan={hasPermission('configuration.templateRequests', 'update') ? 7 : 5} className="text-center py-8 text-gray-500">Loading...</td>
                    </tr>
                  ) : templateRequests.length === 0 ? (
                    <tr>
                      <td colSpan={hasPermission('configuration.templateRequests', 'update') ? 7 : 5} className="text-center py-12 text-gray-500">No template requests found.</td>
                    </tr>
                  ) : (
                    templateRequests.map((r) => {
                      const docLabel = r.documentType?.name || r.documentTypeName || '-'
                      const tplLabel = r.template?.templateName || r.templateName || '-'
                      const requesterLabel = r.requestedBy ? ([r.requestedBy.firstName, r.requestedBy.lastName].filter(Boolean).join(' ').trim() || r.requestedBy.email) : '-'
                      return (
                        <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 text-gray-700">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : '-'}</td>
                          <td className="py-3 px-4 text-gray-700">{r.requestType}</td>
                          <td className="py-3 px-4 text-gray-700">{docLabel}</td>
                          <td className="py-3 px-4 text-gray-700">{tplLabel}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              r.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                              r.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          {hasPermission('configuration.templateRequests', 'update') && (
                            <td className="py-3 px-4 text-gray-700">{requesterLabel}</td>
                          )}
                          {hasPermission('configuration.templateRequests', 'update') && (
                            <td className="py-3 px-4">
                              {r.status === 'PENDING' ? (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => updateTemplateRequestStatus(r, 'RESOLVED')}
                                    className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700"
                                  >
                                    Resolve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateTemplateRequestStatus(r, 'REJECTED')}
                                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-500">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </div>
    </div>
  )
}

// Main Configuration Component
export default function Configuration() {
  const location = useLocation()
  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    return tab && VALID_CONFIG_TABS.includes(tab) ? tab : 'general'
  })

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    if (tab && VALID_CONFIG_TABS.includes(tab) && tab !== activeTab) {
      setActiveTab(tab)
    }
  }, [location.search, activeTab])

  return (
    <div className="p-6">
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      
      {activeTab === 'general' && <GeneralSystemSettings />}
      {activeTab === 'masterdata' && <MasterDataManagement />}
      {activeTab === 'roles' && <RolePermission />}
      {activeTab === 'template' && <TemplateManagement />}
      {activeTab === 'audit' && <AuditLogSettings />}
      {activeTab === 'backup' && <BackupRecovery />}
      {activeTab === 'cleanup' && <DatabaseCleanup />}
    </div>
  )
}
