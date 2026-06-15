import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import StatusBadge from './StatusBadge'
import NewVersionRequestModal from './NewVersionRequestModal'
import { PermissionGate } from './PermissionGate'
import { hasPermission, isAdmin } from '../utils/permissions'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import { usePreferences } from '../contexts/PreferencesContext'
import { useNavigate } from 'react-router-dom'

// Calendar icon
const CalendarIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

// Simple Date Picker Component
function DatePicker({ value, onChange, placeholder = "Select date" }) {
  return (
    <div className="relative">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
      />
    </div>
  )
}


export default function NewDocumentRequest() {
  const { t, formatDate } = usePreferences()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    title: '',
    documentType: '',
    projectCategory: '',
    dateOfDocument: '',
    remarks: ''
  })
  
  // Load document numbering settings for preview
  const [numberingSettings, setNumberingSettings] = useState(null)
  
  useEffect(() => {
    const loadNumberingSettings = () => {
      const saved = localStorage.getItem('dms_document_settings')
      if (saved) {
        try {
          const settings = JSON.parse(saved)
          setNumberingSettings(settings)
        } catch (error) {
          console.error('Failed to load numbering settings:', error)
        }
      }
    }
    loadNumberingSettings()
  }, [])

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [showCalendar, setShowCalendar] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const [acknowledgingId, setAcknowledgingId] = useState(null)
  const [purgingFileCode, setPurgingFileCode] = useState('')
  const [adminPurgeMenuRequestId, setAdminPurgeMenuRequestId] = useState(null)
  const [showVersionModal, setShowVersionModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingRequest, setRejectingRequest] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [deletingRequestId, setDeletingRequestId] = useState(null)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'error' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'info' })
  const [templatePicker, setTemplatePicker] = useState({ show: false, templates: [], selectedId: '', documentTypeName: '' })
  
  // Master data states
  const [documentTypes, setDocumentTypes] = useState([])
  const [projectCategories, setProjectCategories] = useState([])
  const [loadingMasterData, setLoadingMasterData] = useState(true)
  
  // Check if user has permission to acknowledge document requests
  // Uses permission-based checking instead of hardcoded roles
  const canAcknowledge = hasPermission('newDocumentRequest', 'acknowledge')
  
  // Get current user ID to prevent self-acknowledgment
  const getCurrentUserId = () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      return user.id
    } catch {
      return null
    }
  }
  const currentUserId = getCurrentUserId()
  
  // Check if user can acknowledge a specific request (not their own)
  const canAcknowledgeRequest = (req) => {
    if (!canAcknowledge) return false
    if (req.status !== 'Pending Acknowledgment') return false
    // Prevent self-acknowledgment - user cannot acknowledge their own request
    const requesterId = req.requestedById || req.createdById || req.userId
    if (requesterId && currentUserId && requesterId === currentUserId) return false
    return true
  }

  const canDeleteRejectedRequest = (req) => {
    if (req.requestType === 'NVR') return false
    if (req.status !== 'Rejected') return false
    const requesterId = req.requestedById || req.createdById || req.userId
    return Boolean(requesterId && currentUserId && requesterId === currentUserId)
  }

  // Load existing requests and master data
  useEffect(() => {
    loadRequests()
    loadMasterData()
  }, [])

  const loadMasterData = async () => {
    setLoadingMasterData(true)
    try {
      const [docTypesRes, projCategoriesRes] = await Promise.all([
        api.get('/system/config/document-types'),
        api.get('/system/config/project-categories')
      ])
      setDocumentTypes(docTypesRes.data.data.documentTypes || [])
      setProjectCategories(projCategoriesRes.data.data.projectCategories || [])
    } catch (error) {
      console.error('Failed to load master data:', error)
    } finally {
      setLoadingMasterData(false)
    }
  }

  const handleAddDocumentType = () => {
    navigate('/config?tab=masterdata&mdTab=document-types&mdAction=add')
  }

  const handleAddProjectCategory = () => {
    navigate('/config?tab=masterdata&mdTab=project-categories&mdAction=add')
  }


  const loadRequests = async () => {
    setLoadingRequests(true)
    try {
      // Load both NDR and NVR
      const [ndrRes, nvrRes] = await Promise.all([
        api.get('/documents/requests').catch(err => {
          console.error('NDR fetch error:', err)
          return { data: { data: { requests: [] } } }
        }),
        api.get('/documents/version-requests').catch(err => {
          console.error('NVR fetch error:', err)
          console.error('NVR error response:', err.response?.data)
          console.error('NVR error status:', err.response?.status)
          return { data: { data: { requests: [] } } }
        })
      ])
      
      console.log('NDR Response:', ndrRes.data)
      console.log('NVR Response:', nvrRes.data)
      
      // Format NDR with requestType
      const ndrs = (ndrRes.data.data?.requests || []).map(req => ({
        ...req,
        requestType: 'NDR'
      }))
      
      // Format NVR with requestType
      const nvrs = (nvrRes.data.data?.requests || []).map(req => ({
        ...req,
        requestType: 'NVR'
      }))
      
      // Get file codes that have NVR requests
      // If an NVR exists for a document, the NDR should be hidden
      const nvrFileCodes = new Set(
        nvrs
          .filter(nvr => nvr.fileCode || nvr.document?.fileCode)
          .map(nvr => nvr.fileCode || nvr.document?.fileCode)
      )
      
      // Filter out NDRs that have been superseded by NVRs (same fileCode)
      const filteredNdrs = ndrs.filter(ndr => {
        // Keep NDR if it doesn't have a fileCode yet (still pending)
        if (!ndr.fileCode || ndr.fileCode === '-') return true
        // Keep NDR if no NVR exists for this fileCode
        return !nvrFileCodes.has(ndr.fileCode)
      })
      
      // Merge and sort by date (newest first)
      const allRequests = [...filteredNdrs, ...nvrs].sort((a, b) => {
        const dateA = new Date(a.createdAt || a.requestDate || 0)
        const dateB = new Date(b.createdAt || b.requestDate || 0)
        return dateB - dateA
      })
      
      console.log('NDR count (before filter):', ndrs.length)
      console.log('NDR count (after filter):', filteredNdrs.length)
      console.log('NVR count:', nvrs.length)
      console.log('NVR file codes:', [...nvrFileCodes])
      console.log('All requests:', allRequests)
      
      setRequests(allRequests)
    } catch (error) {
      console.error('Failed to load requests:', error)
      console.error('Error details:', error.response?.data || error.message)
      // Mock data for demonstration
      setRequests([
        {
          id: 1,
          title: 'Minutes of Meeting - Q1 2024',
          documentType: 'MoM',
          projectCategory: 'Internal',
          dateOfDocument: '25/01/2024',
          remarks: 'Regular quarterly meeting',
          fileCode: 'MoM012508241001',
          status: 'Acknowledged'
        },
        {
          id: 2,
          title: 'Project Implementation Plan',
          documentType: 'Project Plan',
          projectCategory: 'External',
          dateOfDocument: '17/09/2024',
          remarks: 'Client project phase 2',
          fileCode: 'PP-EXT-0917-001',
          status: 'In Process'
        },
        {
          id: 3,
          title: 'System Requirements Specification',
          documentType: 'Requirement Analysis',
          projectCategory: 'R&D',
          dateOfDocument: '22/02/2024',
          remarks: 'New DMS module requirements',
          fileCode: '-',
          status: 'In Process'
        },
        {
          id: 4,
          title: 'Technical Design Document v2.0',
          documentType: 'Design',
          projectCategory: 'Internal',
          dateOfDocument: '03/11/2024',
          remarks: 'Updated architecture design',
          fileCode: 'DD012508241001',
          status: 'Acknowledged'
        },
        {
          id: 5,
          title: 'Quality Assurance Procedures',
          documentType: 'SOP',
          projectCategory: 'Internal',
          dateOfDocument: '15/10/2024',
          remarks: 'Updated QA process',
          fileCode: 'SOP-QA-1024-001',
          status: 'Acknowledged'
        },
        {
          id: 6,
          title: 'API Integration Guide',
          documentType: 'Manual',
          projectCategory: 'Client',
          dateOfDocument: '28/08/2024',
          remarks: 'Third-party API documentation',
          fileCode: '-',
          status: 'In Process'
        }
      ])
    } finally {
      setLoadingRequests(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      await api.post('/documents/requests', formData)
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Document request submitted successfully!',
        type: 'success'
      })
      
      // Reset form
      setFormData({
        title: '',
        documentType: '',
        projectCategory: '',
        dateOfDocument: '',
        remarks: ''
      })
      
      // Reload requests
      loadRequests()
    } catch (error) {
      console.error('Failed to submit request:', error)
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Failed to submit request. Please try again.',
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVersionRequestSubmit = async (versionRequestData) => {
    try {
      await api.post('/documents/version-requests', versionRequestData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Version request submitted successfully!',
        type: 'success'
      })
      setShowVersionModal(false)
      loadRequests() // Reload to show new version request
    } catch (error) {
      console.error('Failed to submit version request:', error)
      setAlertModal({
        show: true,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to submit version request',
        type: 'error'
      })
      throw error
    }
  }

  const handleCancel = () => {
    setFormData({
      title: '',
      documentType: '',
      projectCategory: '',
      dateOfDocument: '',
      remarks: ''
    })
  }

  const handleAcknowledge = async (request) => {
    const isNVR = request.requestType === 'NVR'
    const confirmMessage = isNVR 
      ? 'Are you sure you want to acknowledge this version request? A new document version will be created.'
      : 'Are you sure you want to acknowledge this document request? A file code will be assigned.'
    
    setConfirmModal({
      show: true,
      title: 'Confirm Acknowledgment',
      message: confirmMessage,
      type: 'info',
      onConfirm: async () => {
        setConfirmModal({ show: false })
        await executeAcknowledge(request, isNVR)
      }
    })
  }

  const executeAcknowledge = async (request, isNVR) => {
    setAcknowledgingId(request.id)
    try {
      // Route to correct endpoint based on request type
      const endpoint = isNVR 
        ? `/documents/version-requests/${request.id}/acknowledge`
        : `/documents/requests/${request.id}/acknowledge`
      
      await api.post(endpoint, {
        remarks: 'Acknowledged by Document Controller'
      })
      
      const successMessage = isNVR
        ? 'Version request acknowledged successfully! New document version has been created.'
        : 'Document request acknowledged successfully! File code has been assigned.'
      
      setAlertModal({
        show: true,
        title: 'Success',
        message: successMessage,
        type: 'success'
      })
      loadRequests()
    } catch (error) {
      console.error('Failed to acknowledge request:', error)
      const errorMessage = error.response?.data?.message || 'Failed to acknowledge request. Please try again.'
      setAlertModal({
        show: true,
        title: 'Cannot Acknowledge Request',
        message: errorMessage,
        type: 'error'
      })
    } finally {
      setAcknowledgingId(null)
    }
  }

  const openRejectModal = (request) => {
    setRejectingRequest(request)
    setRejectReason('')
    setShowRejectModal(true)
  }

  const closeRejectModal = () => {
    setShowRejectModal(false)
    setRejectingRequest(null)
    setRejectReason('')
  }

  const handleReject = async () => {
    if (!rejectReason || rejectReason.trim() === '') {
      setAlertModal({
        show: true,
        title: 'Validation Error',
        message: 'Please enter a rejection reason',
        type: 'warning'
      })
      return
    }

    setAcknowledgingId(rejectingRequest.id)
    try {
      await api.post(`/documents/requests/${rejectingRequest.id}/reject`, {
        reason: rejectReason.trim()
      })
      
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Document request rejected successfully!',
        type: 'success'
      })
      closeRejectModal()
      loadRequests()
    } catch (error) {
      console.error('Failed to reject request:', error)
      setAlertModal({
        show: true,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to reject request. Please try again.',
        type: 'error'
      })
    } finally {
      setAcknowledgingId(null)
    }
  }

  const handleDownloadTemplate = async (request) => {
    // Only allow download if the request has been acknowledged
    if (request.status !== 'Acknowledged' && request.status !== 'ACKNOWLEDGED') {
      setAlertModal({
        show: true,
        title: 'Not Available',
        message: 'Template can only be downloaded after the document request has been acknowledged.',
        type: 'warning'
      })
      return
    }

    try {
      // Find the document type ID from the documentTypes array
      const docType = documentTypes.find(dt => dt.name === request.documentType)
      
      if (!docType) {
        setAlertModal({
          show: true,
          title: 'Error',
          message: 'Document type not found',
          type: 'error'
        })
        return
      }

      const listRes = await api.get(`/templates/by-document-type/${docType.id}`)
      const templates = listRes.data?.data?.templates || []

      if (templates.length === 0) {
        setAlertModal({
          show: true,
          title: 'Not Found',
          message: 'No template found for this document type. Please contact the administrator.',
          type: 'warning'
        })
        return
      }

      if (templates.length > 1) {
        setTemplatePicker({
          show: true,
          templates,
          selectedId: String(templates[0]?.id || ''),
          documentTypeName: request.documentType
        })
        return
      }

      const templateId = templates[0].id
      const response = await api.get(`/templates/${templateId}/download`, { responseType: 'blob' })

      // Create download link - response.data is already a blob
      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      
      // Try to get filename from content-disposition header
      const contentDisposition = response.headers['content-disposition']
      let fileName = `${request.documentType}_Template.docx`
      
      console.log('Download Template Debug:');
      console.log('  Response headers:', response.headers);
      console.log('  Content-Disposition:', contentDisposition);
      console.log('  Default filename:', fileName);
      
      if (contentDisposition) {
        // Match filename with or without quotes: filename="file.ext" or filename=file.ext
        const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=(['"]?)([^'"\n]*?)\1(?:;|$)/i)
        console.log('  Regex match result:', fileNameMatch);
        if (fileNameMatch && fileNameMatch[2]) {
          fileName = fileNameMatch[2].trim()
          console.log('  Extracted filename:', fileName);
        }
      } else {
        console.log('  No Content-Disposition header found!');
      }
      
      console.log('  Final filename:', fileName);
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download template:', error)
      if (error.response?.status === 404) {
        setAlertModal({
          show: true,
          title: 'Not Found',
          message: 'No template found for this document type. Please contact the administrator.',
          type: 'warning'
        })
      } else {
        setAlertModal({
          show: true,
          title: 'Error',
          message: 'Failed to download template. Please try again.',
          type: 'error'
        })
      }
    }
  }

  const handleDownloadSelectedTemplate = async () => {
    const selectedId = templatePicker.selectedId
    if (!selectedId) return

    try {
      const response = await api.get(`/templates/${selectedId}/download`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url

      const contentDisposition = response.headers['content-disposition']
      let fileName = `${templatePicker.documentTypeName || 'Template'}_Template.docx`
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=(['"]?)([^'"\n]*?)\1(?:;|$)/i)
        if (fileNameMatch && fileNameMatch[2]) {
          fileName = fileNameMatch[2].trim()
        }
      }

      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      setTemplatePicker({ show: false, templates: [], selectedId: '', documentTypeName: '' })
    } catch (error) {
      console.error('Failed to download template:', error)
      setAlertModal({
        show: true,
        title: 'Error',
        message: 'Failed to download template. Please try again.',
        type: 'error'
      })
    }
  }

  const executeDeleteRejectedRequest = async (request) => {
    setDeletingRequestId(request.id)
    try {
      await api.delete(`/documents/requests/${request.id}`)
      setConfirmModal({ show: false })
      setAlertModal({
        show: true,
        title: 'Deleted',
        message: 'Rejected document request deleted successfully.',
        type: 'success'
      })
      await loadRequests()
    } catch (error) {
      console.error('Failed to delete rejected request:', error)
      setConfirmModal({ show: false })
      setAlertModal({
        show: true,
        title: 'Delete failed',
        message: error.response?.data?.message || 'Failed to delete rejected request. Please try again.',
        type: 'error'
      })
    } finally {
      setDeletingRequestId(null)
    }
  }

  const handleDeleteRejectedRequest = (request) => {
    setConfirmModal({
      show: true,
      title: 'Delete rejected request?',
      message: 'This rejected request will be permanently deleted. Only the requester can perform this action.',
      type: 'danger',
      onConfirm: () => executeDeleteRejectedRequest(request)
    })
  }

  const renderRequestStatus = (req) => {
    if (deletingRequestId === req.id) {
      return (
        <span className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border whitespace-nowrap bg-gray-100 text-gray-600 border-gray-300">
          Deleting...
        </span>
      )
    }

    if (canDeleteRejectedRequest(req)) {
      return (
        <button
          type="button"
          onClick={() => handleDeleteRejectedRequest(req)}
          className="rounded-full focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          title="Click to delete this rejected request"
        >
          <StatusBadge status={req.status} />
        </button>
      )
    }

    return <StatusBadge status={req.status} />
  }

  const handleAdminPurgeByFileCode = async (fileCode) => {
    const code = String(fileCode || '').trim()
    if (!code || code === '-') return
    setPurgingFileCode(code)
    try {
      await api.delete(`/documents/code/${encodeURIComponent(code)}/purge`)
      setConfirmModal({ show: false })
      setAlertModal({
        show: true,
        title: 'Deleted',
        message: `All records for "${code}" have been deleted.`,
        type: 'success'
      })
      await loadRequests()
    } catch (error) {
      setConfirmModal({ show: false })
      setAlertModal({
        show: true,
        title: 'Delete failed',
        message: error.response?.data?.message || 'Failed to delete records. Please try again.',
        type: 'error'
      })
    } finally {
      setPurgingFileCode('')
    }
  }

  return (
    <div className="p-6 space-y-6" data-tour-id="ndr-page">
      {/* Confirmation Modal */}
      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false })}
      />

      {/* Alert Modal */}
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'error' })}
      />

      {templatePicker.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Select Template</h3>
                <p className="text-sm text-gray-600 mt-1">{templatePicker.documentTypeName}</p>
              </div>
              <button
                type="button"
                onClick={() => setTemplatePicker({ show: false, templates: [], selectedId: '', documentTypeName: '' })}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4">
              <div className="space-y-3 max-h-72 overflow-auto">
                {templatePicker.templates.map((tpl) => (
                  <label key={tpl.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="selectedTemplate"
                      className="mt-1"
                      checked={String(templatePicker.selectedId) === String(tpl.id)}
                      onChange={() => setTemplatePicker((prev) => ({ ...prev, selectedId: String(tpl.id) }))}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{tpl.templateName}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        <span className="font-mono">v{tpl.version}</span>
                        {tpl.fileName ? <span className="ml-2 text-gray-500 truncate">({tpl.fileName})</span> : null}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTemplatePicker({ show: false, templates: [], selectedId: '', documentTypeName: '' })}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDownloadSelectedTemplate}
                disabled={!templatePicker.selectedId}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="card p-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('ndr_title')}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {t('ndr_desc')}
        </p>
      </div>

      {/* NDR Form - Only visible to users with create permission */}
      <PermissionGate module="newDocumentRequest" action="create">
        <div className="card p-6" data-tour-id="ndr-form-card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('ndr_title')}</h2>
          <p className="text-sm text-gray-600 mb-6">
            {t('ndr_form_desc')}
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
          {/* Document Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('document_title_label')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder={t('input_text')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Document Type & Project Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('document_type')} <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <select
                  required
                  data-tour-id="ndr-field-document-type"
                  value={formData.documentType}
                  onChange={(e) => setFormData({ ...formData, documentType: e.target.value })}
                  className="flex-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  disabled={loadingMasterData}
                >
                  <option value="">{loadingMasterData ? t('loading') : t('select_document_type')}</option>
                  {documentTypes.map((type) => (
                    <option key={type.id} value={type.name}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddDocumentType}
                  title={t('mdm_add_doc_type')}
                  aria-label={t('mdm_add_doc_type')}
                  className="shrink-0 w-10 h-10 inline-flex items-center justify-center border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <span>
                  {t('project_category')} <span className="text-red-500">*</span>
                </span>
                <span className="relative inline-flex group">
                  <svg
                    className="w-4 h-4 text-gray-400 hover:text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                  </svg>
                  <span
                    className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-72 -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                    role="tooltip"
                  >
                    For External project categories, select the Client Name. For Internal project categories, select the Project Name.
                  </span>
                </span>
              </label>
              <div className="flex gap-2">
                <select
                  required
                  value={formData.projectCategory}
                  onChange={(e) => setFormData({ ...formData, projectCategory: e.target.value })}
                  className="flex-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  disabled={loadingMasterData}
                >
                  <option value="">{loadingMasterData ? t('loading') : t('select_project_category')}</option>
                  {projectCategories.map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddProjectCategory}
                  title={t('mdm_add_project_cat')}
                  aria-label={t('mdm_add_project_cat')}
                  className="shrink-0 w-10 h-10 inline-flex items-center justify-center border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Date of Event & Remarks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <span>
                  {t('date_of_document')} <span className="text-red-500">*</span>
                </span>
                <span className="relative inline-flex group">
                  <svg
                    className="w-4 h-4 text-gray-400 hover:text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                  </svg>
                  <span
                    className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-56 -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                    role="tooltip"
                  >
                    {t('date_of_event_info')}
                  </span>
                </span>
              </label>
              <DatePicker
                value={formData.dateOfDocument}
                onChange={(date) => setFormData({ ...formData, dateOfDocument: date })}
                placeholder="08 Feb 2021"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('remarks')}
              </label>
              <textarea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                placeholder={t('input_text')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              {t('cancel')}
            </button>
            <PermissionGate module="newDocumentRequest" action="create">
              <button
                type="submit"
                data-tour-id="ndr-btn-submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('sending') : t('send_request')}
              </button>
            </PermissionGate>
          </div>
          </form>
        </div>
      </PermissionGate>

      {/* Document Request List */}
      <div className="card p-6" data-tour-id="ndr-request-list-card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('document_request_list')}</h2>
            <p className="text-sm text-gray-600 mt-1">{t('document_request_list_desc')}</p>
          </div>
          <div className="flex gap-3">
            {requests.length > 0 && (
              <div className="text-sm text-gray-600 flex items-center">
                {t('showing_results')} <span className="font-medium text-gray-900 mx-1">{requests.length}</span> {t('requests')}
              </div>
            )}
            <PermissionGate module="newDocumentRequest" action="create">
              <button
                onClick={() => setShowVersionModal(true)}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {t('new_version_request')}
              </button>
            </PermissionGate>
          </div>
        </div>

        {/* Loading State */}
        {loadingRequests ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600">{t('loading_requests')}</p>
          </div>
        ) : requests.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16">
            <svg className="w-20 h-20 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('no_requests_yet')}</h3>
            <p className="text-gray-600 text-center max-w-md">
              {t('no_requests_desc')}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto" onClick={() => setAdminPurgeMenuRequestId(null)}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('request_type')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('document_title_label')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">
                      <span className="inline-flex items-center gap-2">
                        <span>{t('document_type')}</span>
                        <span className="relative inline-flex group">
                          <svg
                            className="w-4 h-4 text-gray-400 hover:text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                          </svg>
                          <span
                            className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-96 -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs normal-case text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                            role="tooltip"
                          >
                            If a template does not exist, please request a template in Configuration &gt; Template Management &gt; Template Request.
                          </span>
                        </span>
                      </span>
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('project_category')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('date_of_document')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('request_date')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('requested_by')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('remarks')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('file_code')}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('status')}</th>
                    {canAcknowledge && (
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('actions')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          req.requestType === 'NVR' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {req.requestType || 'NDR'}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-gray-900 font-medium">{req.title}</span>
                      </td>
                      <td className="py-4 px-4">
                        <button
                          onClick={() => handleDownloadTemplate(req)}
                          disabled={req.status !== 'Acknowledged' && req.status !== 'ACKNOWLEDGED'}
                          data-tour-id="ndr-btn-download-template"
                          className={`text-left font-medium ${
                            req.status === 'Acknowledged' || req.status === 'ACKNOWLEDGED'
                              ? 'text-blue-600 hover:text-blue-700 hover:underline cursor-pointer'
                              : 'text-gray-700 cursor-default'
                          }`}
                          title={req.status === 'Acknowledged' || req.status === 'ACKNOWLEDGED' ? 'Click to download template for this document type' : 'Template download available after acknowledgment'}
                        >
                          {req.documentType}
                        </button>
                      </td>
                      <td className="py-4 px-4">
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                          {req.projectCategory}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-gray-700">{req.dateOfDocument}</td>
                      <td className="py-4 px-4 text-gray-700">{req.requestDate}</td>
                      <td className="py-4 px-4 text-gray-700 font-medium">{req.requestedBy}</td>
                      <td className="py-4 px-4 text-gray-600 text-xs max-w-xs truncate" title={req.remarks}>{req.remarks}</td>
                      <td className="py-4 px-4">
                        {isAdmin() && req.fileCode && req.fileCode !== '-' && req.status !== 'Pending Acknowledgment' ? (
                          <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setAdminPurgeMenuRequestId((prev) => (prev === req.id ? null : req.id))}
                              className="font-mono text-xs text-gray-700 hover:text-gray-900"
                              title="Click for options"
                            >
                              {req.fileCode}
                            </button>
                            {adminPurgeMenuRequestId === req.id && (
                              <div className="absolute z-20 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg p-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdminPurgeMenuRequestId(null)
                                    setConfirmModal({
                                      show: true,
                                      title: 'Delete document records?',
                                      message: `This will permanently delete ALL records for "${req.fileCode}" (document, versions, registers, and stored files). This action cannot be undone.`,
                                      type: 'danger',
                                      onConfirm: () => handleAdminPurgeByFileCode(req.fileCode)
                                    })
                                  }}
                                  disabled={purgingFileCode === req.fileCode}
                                  className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
                                >
                                  {purgingFileCode === req.fileCode ? 'Deleting...' : 'Delete record'}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={`font-mono text-xs ${req.fileCode === '-' ? 'text-gray-400' : 'text-gray-700'}`}>
                            {req.fileCode}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {renderRequestStatus(req)}
                      </td>
                      {canAcknowledge && (
                        <td className="py-4 px-4">
                          {canAcknowledgeRequest(req) && req.requestType !== 'NVR' ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAcknowledge(req)}
                                disabled={acknowledgingId === req.id}
                                className="px-4 py-2 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {acknowledgingId === req.id ? t('processing') : t('acknowledge_btn')}
                              </button>
                              <button
                                onClick={() => openRejectModal(req)}
                                disabled={acknowledgingId === req.id}
                                className="px-4 py-2 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {t('reject_btn')}
                              </button>
                            </div>
                          ) : canAcknowledgeRequest(req) && req.requestType === 'NVR' ? (
                            <button
                              onClick={() => handleAcknowledge(req)}
                              disabled={acknowledgingId === req.id}
                              className="px-4 py-2 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {acknowledgingId === req.id ? t('processing') : t('acknowledge_btn')}
                            </button>
                          ) : req.status === 'Pending Acknowledgment' && !canAcknowledgeRequest(req) ? (
                            <span className="text-amber-600 text-xs italic" title="You cannot acknowledge your own request">{t('own_request')}</span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-4" onClick={() => setAdminPurgeMenuRequestId(null)}>
              {requests.map((req) => (
                <div key={req.id} className="border border-gray-200 rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                        req.requestType === 'NVR' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {req.requestType || 'NDR'}
                      </span>
                      <span className="text-gray-900 font-medium">{req.title}</span>
                    </div>
                    {renderRequestStatus(req)}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500 text-xs">Type:</span>
                      <div>
                        <button
                          onClick={() => handleDownloadTemplate(req)}
                          disabled={req.status !== 'Acknowledged' && req.status !== 'ACKNOWLEDGED'}
                          data-tour-id="ndr-btn-download-template"
                          className={`text-left font-medium ${
                            req.status === 'Acknowledged' || req.status === 'ACKNOWLEDGED'
                              ? 'text-blue-600 hover:text-blue-700 hover:underline cursor-pointer'
                              : 'text-gray-900 cursor-default'
                          }`}
                          title={req.status === 'Acknowledged' || req.status === 'ACKNOWLEDGED' ? 'Click to download template' : 'Template available after acknowledgment'}
                        >
                          {req.documentType}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Category:</span>
                      <div>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                          {req.projectCategory}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">{t('date_of_document')}:</span>
                      <div className="text-gray-900">{req.dateOfDocument}</div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Request Date:</span>
                      <div className="text-gray-900">{req.requestDate}</div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Requested By:</span>
                      <div className="text-gray-900 font-medium">{req.requestedBy}</div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">File Code:</span>
                      {isAdmin() && req.fileCode && req.fileCode !== '-' && req.status !== 'Pending Acknowledgment' ? (
                        <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setAdminPurgeMenuRequestId((prev) => (prev === req.id ? null : req.id))}
                            className="font-mono text-xs text-gray-900"
                            title="Click for options"
                          >
                            {req.fileCode}
                          </button>
                          {adminPurgeMenuRequestId === req.id && (
                            <div className="absolute z-20 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg p-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setAdminPurgeMenuRequestId(null)
                                  setConfirmModal({
                                    show: true,
                                    title: 'Delete document records?',
                                    message: `This will permanently delete ALL records for "${req.fileCode}" (document, versions, registers, and stored files). This action cannot be undone.`,
                                    type: 'danger',
                                    onConfirm: () => handleAdminPurgeByFileCode(req.fileCode)
                                  })
                                }}
                                disabled={purgingFileCode === req.fileCode}
                                className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
                              >
                                {purgingFileCode === req.fileCode ? 'Deleting...' : 'Delete record'}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={`font-mono text-xs ${req.fileCode === '-' ? 'text-gray-400' : 'text-gray-900'}`}>
                          {req.fileCode}
                        </div>
                      )}
                    </div>
                  </div>
                  {req.remarks && (
                    <div className="pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-500">Remarks:</span>
                      <p className="text-sm text-gray-600 mt-1">{req.remarks}</p>
                    </div>
                  )}
                  {canAcknowledge && req.status === 'Pending Acknowledgment' && (
                    <div className="pt-3 border-t border-gray-100">
                      {canAcknowledgeRequest(req) ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcknowledge(req)}
                            disabled={acknowledgingId === req.id}
                            className="flex-1 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {acknowledgingId === req.id ? 'Processing...' : 'Acknowledge'}
                          </button>
                          {req.requestType !== 'NVR' && (
                            <button
                              onClick={() => openRejectModal(req)}
                              disabled={acknowledgingId === req.id}
                              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-amber-600 text-sm italic text-center">You cannot acknowledge your own request</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {requests.length > itemsPerPage && (
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(currentPage * itemsPerPage, requests.length)}</span> of{' '}
                  <span className="font-medium">{requests.length}</span> results
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  
                  {[...Array(Math.ceil(requests.length / itemsPerPage))].map((_, idx) => (
                    <button 
                      key={idx + 1}
                      onClick={() => setCurrentPage(idx + 1)}
                      className={`w-8 h-8 rounded transition-colors ${
                        currentPage === idx + 1 
                          ? 'bg-blue-600 text-white' 
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                  
                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(requests.length / itemsPerPage), prev + 1))}
                    disabled={currentPage === Math.ceil(requests.length / itemsPerPage)}
                    className="p-2 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* New Version Request Modal */}
      {showVersionModal && (
        <NewVersionRequestModal
          onClose={() => setShowVersionModal(false)}
          onSubmit={handleVersionRequestSubmit}
        />
      )}

      {/* Reject Request Modal */}
      {showRejectModal && rejectingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Reject Document Request</h3>
              <button
                onClick={closeRejectModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Document Title:</p>
                <p className="font-medium text-gray-900">{rejectingRequest.title}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g., Duplicate title, Invalid information, Redundant request..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">Please provide a clear reason for rejecting this request.</p>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex gap-2">
                  <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm text-red-800">
                    This action cannot be undone. The requester will be notified of the rejection.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 p-6 border-t border-gray-200">
              <button
                onClick={closeRejectModal}
                disabled={acknowledgingId === rejectingRequest.id}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={acknowledgingId === rejectingRequest.id || !rejectReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {acknowledgingId === rejectingRequest.id ? 'Rejecting...' : 'Reject Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
