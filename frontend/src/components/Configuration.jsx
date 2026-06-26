import React, { useState, useEffect, useMemo } from 'react'
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
import { useLocation, useNavigate } from 'react-router-dom'

const VALID_CONFIG_TABS = ['general', 'masterdata', 'roles', 'template', 'audit', 'backup', 'cleanup']

// Tab Navigation Component
function TabNavigation({ activeTab, onTabChange, tabs }) {
  const { t } = usePreferences()
  const resolvedTabs = (tabs || []).map((tab) => ({
    ...tab,
    label: tab?.label || t(tab?.translationKey)
  }))

  return (
    <div className="mb-6 border-b border-border">
      <nav className="dms-scrollbar flex gap-4 overflow-x-auto">
        {resolvedTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            data-tour-id={`config-tab-${tab.id}`}
            className="whitespace-nowrap border-b-2 px-2 py-3 text-sm font-semibold transition-colors hover:text-ink"
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
  const { t, itemsPerPage } = usePreferences()
  const [activeSubTab, setActiveSubTab] = useState('templates')
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage || 10)
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
    setPageSize(itemsPerPage || 10)
  }, [itemsPerPage])

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
        <h2 className="text-2xl font-bold text-ink">{t('cfg_template_config')}</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          {t('cfg_template_config_desc')}
        </p>
        <p className="text-sm text-ink-secondary">
          {t('cfg_template_autolink')}
        </p>
      </div>

      <div className="mb-6 border-b border-border">
        <nav className="flex space-x-8">
          <button
            type="button"
            onClick={() => setActiveSubTab('templates')}
            data-tour-id="tmpl-subtab-templates"
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeSubTab === 'templates'
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-muted hover:text-ink hover:border-border'
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
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-muted hover:text-ink hover:border-border'
              }`}
            >
              Template Requests
            </button>
          )}
        </nav>
      </div>

      {showTemplateRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-dms-lg">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-semibold text-ink">Request Template</h3>
              <button
                type="button"
                onClick={() => setShowTemplateRequestModal(false)}
                className="text-ink-soft transition-colors hover:text-ink"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 px-6 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-ink-secondary">Request Type</label>
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
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                  >
                    <option value="NEW">New Template</option>
                    <option value="UPDATE">Update Existing Template</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-ink-secondary">Document Type</label>
                  <div className="mb-2 flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
                      <input
                        type="radio"
                        name="docTypeModeCfg"
                        checked={templateRequestForm.documentTypeMode === 'existing'}
                        onChange={() => setTemplateRequestForm((prev) => ({ ...prev, documentTypeMode: 'existing', documentTypeName: '' }))}
                      />
                      Existing
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
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
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
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
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-ink-secondary">Template</label>
                {templateRequestForm.requestType === 'UPDATE' && (
                  <div className="mb-2 flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
                      <input
                        type="radio"
                        name="tplModeCfg"
                        checked={templateRequestForm.templateMode === 'existing'}
                        onChange={() => setTemplateRequestForm((prev) => ({ ...prev, templateMode: 'existing', templateName: '' }))}
                      />
                      Existing
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
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
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                ) : (
                  <select
                    value={templateRequestForm.templateId}
                    onChange={(e) => setTemplateRequestForm((prev) => ({ ...prev, templateId: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-surface-muted disabled:text-ink-soft"
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
                  <p className="mt-1 text-xs text-ink-muted">Select an existing document type to choose an existing template.</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-ink-secondary">Description / Reason</label>
                <textarea
                  value={templateRequestForm.description}
                  onChange={(e) => setTemplateRequestForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                  rows={3}
                  placeholder="Describe what you need (optional)"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => setShowTemplateRequestModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={submitTemplateRequest}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-brand-hover"
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
                  <h3 className="text-lg font-semibold text-ink">{t('cfg_template_list')}</h3>
                  <p className="mt-1 text-sm text-ink-secondary">{t('cfg_template_list_desc')}</p>
                </div>

                <PermissionGate module="configuration.templates" action="create">
                  <button
                    onClick={handleAddNewTemplate}
                    data-tour-id="tmpl-btn-add-template"
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-brand-hover"
                  >
                    {t('cfg_add_new_template')}
                  </button>
                </PermissionGate>
              </div>

              <div className="relative">
                <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={t('cfg_search_template')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-4 text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">{t('document_type')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">{t('cfg_template_name')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">{t('version')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">{t('cfg_prefix_code')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">{t('cfg_uploaded_by')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">{t('cfg_uploaded_on')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-ink-muted">
                        <div className="flex flex-col items-center gap-2">
                          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand"></div>
                          <span>{t('cfg_loading_templates')}</span>
                        </div>
                      </td>
                    </tr>
                  ) : currentTemplates.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-ink-muted">
                        <div className="flex flex-col items-center gap-2">
                          <svg className="h-12 w-12 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>{t('cfg_no_templates')}</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    currentTemplates.map((template) => (
                      <tr key={template.id} className="border-b border-border transition-colors hover:bg-surface-muted">
                        <td className="px-4 py-4 text-ink-secondary">{template.documentType}</td>
                        <td className="px-4 py-4 text-ink-secondary">{template.templateName}</td>
                        <td className="px-4 py-4 text-ink-secondary">{template.version}</td>
                        <td className="px-4 py-4 text-ink-secondary">{template.prefixCode}</td>
                        <td className="px-4 py-4 text-ink-secondary">{template.uploadedBy}</td>
                        <td className="px-4 py-4 text-ink-secondary">{template.uploadedOn}</td>
                        <td className="px-4 py-4">
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
                <div className="py-8 text-center text-ink-muted">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand"></div>
                    <span>{t('cfg_loading_templates')}</span>
                  </div>
                </div>
              ) : currentTemplates.length === 0 ? (
                <div className="py-12 text-center text-ink-muted">
                  <span>{t('cfg_no_templates')}</span>
                </div>
              ) : (
                currentTemplates.map((template) => (
                  <div key={template.id} className="space-y-3 rounded-lg border border-border bg-surface p-4">
                    <div>
                      <div className="font-semibold text-ink">{template.documentType}</div>
                      <div className="mt-1 text-sm text-ink-secondary">{template.templateName}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-ink-muted">{t('version')}:</span>
                        <div className="font-medium text-ink">{template.version}</div>
                      </div>
                      <div>
                        <span className="text-ink-muted">{t('cfg_prefix_code')}:</span>
                        <div className="font-medium text-ink">{template.prefixCode}</div>
                      </div>
                      <div>
                        <span className="text-ink-muted">{t('cfg_uploaded_by')}:</span>
                        <div className="font-medium text-ink">{template.uploadedBy}</div>
                      </div>
                      <div>
                        <span className="text-ink-muted">{t('cfg_uploaded_on')}:</span>
                        <div className="font-medium text-ink">{template.uploadedOn}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 border-t border-border pt-2">
                      {hasPermission('configuration.templates', 'read') && (
                        <button
                          onClick={() => handleView(template)}
                          className="flex-1 rounded bg-surface-muted px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-strong hover:text-ink"
                        >
                          {t('view')}
                        </button>
                      )}
                      {hasPermission('configuration.templates', 'update') && (
                        <button
                          onClick={(e) => handleReupload(e, template)}
                          className="flex-1 rounded bg-surface-muted px-3 py-2 text-sm text-brand transition-colors hover:bg-surface-strong"
                        >
                          {t('cfg_reupload')}
                        </button>
                      )}
                      {hasPermission('configuration.templates', 'read') && (
                        <button
                          onClick={() => handleDownload(template)}
                          className="flex-1 rounded bg-brand px-3 py-2 text-sm text-ink-inverse transition-colors hover:bg-brand-hover"
                        >
                          {t('download')}
                        </button>
                      )}
                      {isAdminUser && (
                        <button
                          onClick={() => handleDeleteTemplate(template)}
                          className="flex-1 rounded bg-[var(--dms-color-danger-ink)] px-3 py-2 text-sm text-[color:var(--dms-color-bg-canvas)] transition-colors hover:opacity-90"
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
                <h3 className="text-lg font-semibold text-ink">Template Requests</h3>
                <p className="mt-1 text-sm text-ink-secondary">Request a new template or ask to update an existing template.</p>
              </div>
              <PermissionGate module="configuration.templateRequests" action="create">
                <button
                  type="button"
                  onClick={openTemplateRequestModal}
                  data-tour-id="tmpl-btn-request-template"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-brand-hover"
                >
                  Request Template
                </button>
              </PermissionGate>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Document Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Template</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Status</th>
                    {hasPermission('configuration.templateRequests', 'update') && (
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Requested By</th>
                    )}
                    {hasPermission('configuration.templateRequests', 'update') && (
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loadingTemplateRequests ? (
                    <tr>
                      <td colSpan={hasPermission('configuration.templateRequests', 'update') ? 7 : 5} className="py-8 text-center text-ink-muted">Loading...</td>
                    </tr>
                  ) : templateRequests.length === 0 ? (
                    <tr>
                      <td colSpan={hasPermission('configuration.templateRequests', 'update') ? 7 : 5} className="py-12 text-center text-ink-muted">No template requests found.</td>
                    </tr>
                  ) : (
                    templateRequests.map((r) => {
                      const docLabel = r.documentType?.name || r.documentTypeName || '-'
                      const tplLabel = r.template?.templateName || r.templateName || '-'
                      const requesterLabel = r.requestedBy ? ([r.requestedBy.firstName, r.requestedBy.lastName].filter(Boolean).join(' ').trim() || r.requestedBy.email) : '-'
                      return (
                        <tr key={r.id} className="border-b border-border transition-colors hover:bg-surface-muted">
                          <td className="px-4 py-3 text-ink-secondary">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : '-'}</td>
                          <td className="px-4 py-3 text-ink-secondary">{r.requestType}</td>
                          <td className="px-4 py-3 text-ink-secondary">{docLabel}</td>
                          <td className="px-4 py-3 text-ink-secondary">{tplLabel}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              r.status === 'PENDING' ? 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]' :
                              r.status === 'RESOLVED' ? 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]' :
                              'bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          {hasPermission('configuration.templateRequests', 'update') && (
                            <td className="px-4 py-3 text-ink-secondary">{requesterLabel}</td>
                          )}
                          {hasPermission('configuration.templateRequests', 'update') && (
                            <td className="py-3 px-4">
                              {r.status === 'PENDING' ? (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => updateTemplateRequestStatus(r, 'RESOLVED')}
                                    className="rounded bg-[var(--dms-color-success-ink)] px-3 py-1.5 text-xs font-medium text-[color:var(--dms-color-bg-canvas)] transition-colors hover:opacity-90"
                                  >
                                    Resolve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateTemplateRequestStatus(r, 'REJECTED')}
                                    className="rounded bg-[var(--dms-color-danger-ink)] px-3 py-1.5 text-xs font-medium text-[color:var(--dms-color-bg-canvas)] transition-colors hover:opacity-90"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-ink-muted">—</span>
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
  const navigate = useNavigate()
  const configTabs = useMemo(() => {
    const allTabs = [
      { id: 'general', translationKey: 'cfg_general_system', modules: ['configuration.settings'] },
      { id: 'masterdata', translationKey: 'cfg_master_data', modules: ['configuration.masterData', 'configuration.documentTypes'] },
      { id: 'roles', translationKey: 'cfg_role_permission', modules: ['configuration.users', 'configuration.roles'] },
      { id: 'template', translationKey: 'cfg_template_mgmt', modules: ['configuration.templates', 'configuration.templateRequests'] },
      { id: 'audit', translationKey: 'cfg_audit_log', modules: ['configuration.auditSettings'] },
      { id: 'backup', translationKey: 'cfg_backup_recovery', modules: ['configuration.backup'] },
      { id: 'cleanup', translationKey: 'cfg_database_cleanup', modules: ['configuration.cleanup'] }
    ]

    return allTabs.filter((tab) => {
      const modules = Array.isArray(tab.modules) ? tab.modules : []
      return modules.some((m) => hasAnyPermission(m))
    })
  }, [])

  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    const requested = tab && VALID_CONFIG_TABS.includes(tab) ? tab : null
    const firstAllowed = configTabs?.[0]?.id || 'general'
    const allowedIds = new Set((configTabs || []).map((t) => t.id))
    if (requested && allowedIds.has(requested)) return requested
    return firstAllowed
  })

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    const requested = tab && VALID_CONFIG_TABS.includes(tab) ? tab : null
    const allowedIds = new Set((configTabs || []).map((t) => t.id))
    const nextTab = requested && allowedIds.has(requested) ? requested : (configTabs?.[0]?.id || 'general')
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab))
  }, [location.search, configTabs])

  useEffect(() => {
    const allowedIds = new Set((configTabs || []).map((t) => t.id))
    if (activeTab && allowedIds.has(activeTab)) return
    const nextTab = configTabs?.[0]?.id || 'general'
    if (nextTab !== activeTab) setActiveTab(nextTab)
  }, [activeTab, configTabs])

  const handleTabChange = (nextTabId) => {
    const allowedIds = new Set((configTabs || []).map((t) => t.id))
    const safeTab = allowedIds.has(nextTabId) ? nextTabId : (configTabs?.[0]?.id || 'general')
    setActiveTab(safeTab)
    const params = new URLSearchParams(location.search)
    params.set('tab', safeTab)
    navigate({ pathname: location.pathname, search: `?${params.toString()}` })
  }

  return (
    <div className="p-6">
      <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} tabs={configTabs} />
      
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
