import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import ReviewDocumentModal from './ReviewDocumentModal'
import ApproveDocumentModal from './ApproveDocumentModal'
import AcknowledgeDocumentModal from './AcknowledgeDocumentModal'
import DocumentViewerModal from './DocumentViewerModal'
import PublishDocumentModal from './PublishDocumentModal'
import ReviewSupersedeModal from './ReviewSupersedeModal'
import ApproveSupersedeModal from './ApproveSupersedeModal'
import StatusBadge from './StatusBadge'
import ActionMenu from './ActionMenu'
import EmptyState from './EmptyState'
import Pagination from './Pagination'
import { PermissionGate } from './PermissionGate'
import { hasPermission } from '../utils/permissions'
import { AlertModal } from './ConfirmModal'
import { usePreferences } from '../contexts/PreferencesContext'
import PageHeader from './ui/PageHeader'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import SelectField from './ui/SelectField'
import InlineSpinner from './ui/InlineSpinner'
import ColumnSettingsButton from './ui/ColumnSettingsButton'
import DataTableToolbar from './ui/DataTableToolbar'
import { Table, TableContainer, Td, Th, Tr } from './ui/Table'
import useTableFeatures from '../hooks/useTableFeatures'

function isPdfDocument(doc) {
  const name = String(doc?.fileName || '')
  return name.toLowerCase().endsWith('.pdf')
}

export default function ReviewAndApproval() {
  const { itemsPerPage, t } = usePreferences()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const deepLinkDocId = searchParams.get('docId')
  const didHandleDeepLink = useRef(false)
  const [documents, setDocuments] = useState([])
  const [filteredDocuments, setFilteredDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [acknowledgeModalOpen, setAcknowledgeModalOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [reviewSupersedeModalOpen, setReviewSupersedeModalOpen] = useState(false)
  const [approveSupersedeModalOpen, setApproveSupersedeModalOpen] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewSubmitError, setReviewSubmitError] = useState('')
  const [approveSubmitting, setApproveSubmitting] = useState(false)
  const [approveSubmitError, setApproveSubmitError] = useState('')
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)
  const canSendDebugRef = useRef(null)

  const canSendDebug = () => {
    if (canSendDebugRef.current === null) {
      try {
        canSendDebugRef.current = localStorage.getItem('dms_debug') === '1'
      } catch {
        canSendDebugRef.current = false
      }
    }
    return canSendDebugRef.current
  }

  // Get current user ID for ownership check
  const getCurrentUserId = () => {
    try {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const user = JSON.parse(userStr)
        return user.id
      }
    } catch (error) {
      console.error('Error getting current user:', error)
    }
    return null
  }

  // Check if current user owns the document
  const isDocumentOwner = (doc) => {
    const currentUserId = getCurrentUserId()
    return currentUserId && doc.ownerId === currentUserId
  }

  // Check if current user is the assigned approver for the document
  const isAssignedApprover = (doc) => {
    const currentUserId = getCurrentUserId()
    if (!currentUserId) return false
    
    // Check if user is assigned as first or second approver
    const isFirstApprover = doc.firstApproverId === currentUserId
    const isSecondApprover = doc.secondApproverId === currentUserId
    
    // For first approval stage, check firstApproverId
    if (doc.stage === 'FIRST_APPROVAL' || doc.stage === 'Approval') {
      return isFirstApprover
    }
    
    // For second approval stage, check secondApproverId
    if (doc.stage === 'SECOND_APPROVAL') {
      return isSecondApprover
    }
    
    // For generic approval stage, check both
    return isFirstApprover || isSecondApprover
  }

  // Check if current user is the assigned reviewer for the document
  const isAssignedReviewer = (doc) => {
    const currentUserId = getCurrentUserId()
    if (!currentUserId) return false
    
    // Check if user is assigned as reviewer
    if (doc.reviewerId === currentUserId) return true
    
    if (doc.assignments && Array.isArray(doc.assignments)) {
      return doc.assignments.some(a => a.userId === currentUserId && a.assignmentType === 'REVIEW')
    }
    
    return false
  }

  useEffect(() => {
    loadDocuments()
  }, [])

  useEffect(() => {
    if (didHandleDeepLink.current) return
    const raw = parseInt(deepLinkDocId, 10)
    const docId = Number.isFinite(raw) ? raw : null
    if (!docId) return
    if (!documents || documents.length === 0) return

    const doc = documents.find((d) => d && String(d.id) === String(docId))
    if (!doc) return

    didHandleDeepLink.current = true
    setSelectedDocument(doc)

    const stage = String(doc.stage || '').toUpperCase()
    const status = String(doc.status || '').toUpperCase()

    if (doc.type === 'supersede-request') {
      setReviewSupersedeModalOpen(true)
      return
    }

    if (stage === 'REVIEW' || status === 'PENDING_REVIEW' || status === 'IN_REVIEW') {
      setReviewModalOpen(true)
      return
    }

    if (stage === 'ACKNOWLEDGMENT' || status === 'PENDING_ACKNOWLEDGMENT') {
      setAcknowledgeModalOpen(true)
      return
    }

    if (status === 'READY_TO_PUBLISH' || stage === 'READY_TO_PUBLISH') {
      setPublishModalOpen(true)
      return
    }

    if (stage === 'FIRST_APPROVAL' || stage === 'SECOND_APPROVAL' || stage === 'APPROVAL' || status === 'PENDING_FIRST_APPROVAL' || status === 'PENDING_SECOND_APPROVAL') {
      setApproveModalOpen(true)
      return
    }

    if (isPdfDocument(doc)) setViewModalOpen(true)
  }, [deepLinkDocId, documents])

  // Filter and search documents
  useEffect(() => {
    let filtered = documents

    // Apply stage filter
    if (stageFilter !== 'All') {
      filtered = filtered.filter(doc => doc.stage === stageFilter)
    }

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(doc =>
        doc.fileCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredDocuments(filtered)
    setCurrentPage(1)
  }, [documents, stageFilter, searchQuery])

  const loadDocuments = async () => {
    try {
      // Add timestamp to prevent caching
      const res = await api.get(`/documents/review-approval?_t=${Date.now()}`)
      const docs = res.data.data?.documents || res.data.documents || []
      setDocuments(docs)
      setFilteredDocuments(docs)
    } catch (error) {
      console.error('Failed to load documents:', error)
      console.error('Error details:', error.response?.data || error.message)
      if (error.response?.status === 401 || error.response?.status === 403) {
        setAlertModal({
          show: true,
          title: 'Access Denied',
          message: error.response?.data?.message || 'You do not have permission to view this page.',
          type: 'error'
        })
      }
      setDocuments([])
      setFilteredDocuments([])
    } finally {
      setLoading(false)
    }
  }

  // Get unique stages for filter
  const allStages = ['All', ...new Set(documents.map(doc => doc.stage))]

  // Pagination
  const totalPages = Math.ceil(filteredDocuments.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const currentDocuments = filteredDocuments.slice(startIndex, endIndex)

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
  }

  const handleDownload = async (doc) => {
    try {
      const downloadId = doc?.documentId ?? doc?.id
      // #region debug-point A:download-click
      if (canSendDebug()) {
        fetch('http://127.0.0.1:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'review-approval-title-download',
            runId: 'pre-fix',
            hypothesisId: 'A',
            location: 'ReviewAndApproval.jsx:handleDownload',
            msg: '[DEBUG] Download requested from review-approval list',
            data: {
              downloadId: downloadId ?? null,
              doc: {
                id: doc?.id ?? null,
                documentId: doc?.documentId ?? null,
                fileCode: doc?.fileCode ?? null,
                title: doc?.title ?? null,
                status: doc?.status ?? null,
                stage: doc?.stage ?? null,
                fileName: doc?.fileName ?? null
              }
            },
            ts: Date.now()
          })
        }).catch(() => {})
      }
      // #endregion
      if (!downloadId) {
        setAlertModal({
          show: true,
          title: t('failed_load_doc'),
          message: t('failed_load_doc'),
          type: 'error'
        })
        return
      }

      const res = await api.get(`/documents/${downloadId}/download`, {
        responseType: 'blob'
      })
      // #region debug-point B:download-success
      if (canSendDebug()) {
        fetch('http://127.0.0.1:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'review-approval-title-download',
            runId: 'pre-fix',
            hypothesisId: 'B',
            location: 'ReviewAndApproval.jsx:handleDownload',
            msg: '[DEBUG] Download response OK',
            data: {
              downloadId,
              contentType: res.headers?.['content-type'] || null,
              contentDisposition: res.headers?.['content-disposition'] || null
            },
            ts: Date.now()
          })
        }).catch(() => {})
      }
      // #endregion

      const contentDisposition = res.headers?.['content-disposition'] || ''
      const contentTypeHeader = res.headers?.['content-type'] || ''
      const getFileNameFromContentDisposition = (value) => {
        const v = String(value || '')
        const mStar = v.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
        if (mStar && mStar[1]) {
          try {
            return decodeURIComponent(mStar[1].trim().replace(/^"|"$/g, ''))
          } catch {
            return mStar[1].trim().replace(/^"|"$/g, '')
          }
        }
        const m = v.match(/filename\s*=\s*("?)([^";]+)\1/i)
        if (m && m[2]) return m[2].trim()
        return null
      }

      const fallbackName = doc.fileName || doc.title || `document-${downloadId}`
      const downloadName = getFileNameFromContentDisposition(contentDisposition) || fallbackName
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentTypeHeader || undefined }))
      const link = window.document.createElement('a')
      link.href = url
      link.setAttribute('download', downloadName)
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download document:', err)
      const apiMessage = err?.response?.data?.message
      // #region debug-point C:download-error
      if (canSendDebug()) {
        fetch('http://127.0.0.1:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'review-approval-title-download',
            runId: 'pre-fix',
            hypothesisId: 'C',
            location: 'ReviewAndApproval.jsx:handleDownload',
            msg: '[DEBUG] Download response error',
            data: {
              status: err?.response?.status ?? null,
              message: apiMessage || err?.message || null
            },
            ts: Date.now()
          })
        }).catch(() => {})
      }
      // #endregion
      const status = err?.response?.status
      const message =
        status === 403
          ? 'Anda tidak dibenarkan memuat turun dokumen ini. Jika dokumen masih dalam proses review/approval, hanya reviewer/approver/owner yang dibenarkan.'
          : (apiMessage || t('failed_load_doc'))
      setAlertModal({
        show: true,
        title: t('failed_load_doc'),
        message,
        type: 'error'
      })
    }
  }

  const handleView = (doc) => {
    if (!isPdfDocument(doc)) {
      setAlertModal({
        show: true,
        title: t('download'),
        message: 'Please download the document to review. Preview is only available for PDF.',
        type: 'info'
      })
      return
    }
    setSelectedDocument(doc)
    setViewModalOpen(true)
  }

  const handleReview = (doc) => {
    setSelectedDocument(doc)
    setReviewSubmitError('')
    // Check if this is a supersede request
    if (doc.type === 'supersede-request') {
      setReviewSupersedeModalOpen(true)
    } else {
      setReviewModalOpen(true)
    }
  }

  const handleReviewSubmit = async (formData) => {
    setReviewSubmitting(true)
    setReviewSubmitError('')
    try {
      // Prepare form data for API
      const apiFormData = new FormData()
      
      // Add fields based on review decision
      if (formData.reviewDecision === 'reviewed') {
        apiFormData.append('action', 'APPROVE')
      } else if (formData.reviewDecision === 'amendments') {
        apiFormData.append('action', 'RETURN')
      }
      
      apiFormData.append('comments', formData.comments || '')
      
      // Add approver if reviewing (not returning)
      if (formData.reviewDecision === 'reviewed' && formData.skipApproval) {
        apiFormData.append('skipApproval', 'true')
      } else if (formData.reviewDecision === 'reviewed' && formData.assignedApprover) {
        apiFormData.append('approverId', formData.assignedApprover)
      }
      
      // Add reviewed file if uploaded
      if (formData.reviewedFile) {
        apiFormData.append('reviewedFile', formData.reviewedFile)
      }
      
      // Call API
      await api.post(`/workflow/review/${selectedDocument.id}`, apiFormData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      setAlertModal({ show: true, title: 'Success', message: 'Review submitted successfully!', type: 'success' })
      setReviewModalOpen(false)
      setSelectedDocument(null)
      
      // Reload documents to reflect changes
      await loadDocuments()
    } catch (error) {
      console.error('Failed to submit review:', error)
      setReviewSubmitError(error.response?.data?.message || 'Failed to submit review. Please try again.')
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to submit review. Please try again.', type: 'error' })
    } finally {
      setReviewSubmitting(false)
    }
  }

  const handleApprove = (doc) => {
    setSelectedDocument(doc)
    setApproveSubmitError('')
    // Check if this is a supersede request
    if (doc.type === 'supersede-request') {
      setApproveSupersedeModalOpen(true)
    } else {
      setApproveModalOpen(true)
    }
  }

  const handleApproveSubmit = async (formData) => {
    setApproveSubmitting(true)
    setApproveSubmitError('')
    try {
      // Determine if this is first or second approval
      // Support legacy statuses: 'Pending Approval' and stage 'Approval' are treated as first approval
      const isFirstApproval = 
        selectedDocument?.status === 'PENDING_FIRST_APPROVAL' || 
        selectedDocument?.status === 'IN_FIRST_APPROVAL' ||
        selectedDocument?.status === 'Pending Approval' ||
        selectedDocument?.stage === 'Approval'
      const isSecondApproval = selectedDocument?.status === 'PENDING_SECOND_APPROVAL' || selectedDocument?.status === 'IN_SECOND_APPROVAL'
      
      // Prepare form data for API
      const apiFormData = new FormData()
      
      // Add fields based on approval decision
      if (formData.approvalDecision === 'approved') {
        apiFormData.append('action', 'APPROVE')
      } else if (formData.approvalDecision === 'amendments') {
        apiFormData.append('action', 'RETURN')
      }
      
      apiFormData.append('comments', formData.comments || '')
      
      // Add second approver if first approval and provided
      if (isFirstApproval && formData.assignedSecondApprover) {
        apiFormData.append('secondApproverId', formData.assignedSecondApprover)
      }
      
      // Add approved file if uploaded
      if (formData.approvedFile) {
        apiFormData.append('approvedFile', formData.approvedFile)
      }
      
      // Determine the correct endpoint
      const endpoint = isFirstApproval ? `/workflow/approve/first/${selectedDocument.id}` : `/workflow/approve/second/${selectedDocument.id}`
      
      // Call API
      await api.post(endpoint, apiFormData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      setAlertModal({ show: true, title: 'Success', message: 'Approval submitted successfully!', type: 'success' })
      setApproveModalOpen(false)
      setSelectedDocument(null)
      
      // Reload documents to reflect changes
      await loadDocuments()
    } catch (error) {
      console.error('Failed to submit approval:', error)
      setApproveSubmitError(error.response?.data?.message || 'Failed to submit approval. Please try again.')
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to submit approval. Please try again.', type: 'error' })
    } finally {
      setApproveSubmitting(false)
    }
  }

  const handleAcknowledge = (doc) => {
    setSelectedDocument(doc)
    setAcknowledgeModalOpen(true)
  }

  const handleAcknowledgeSubmit = async (formData) => {
    // TODO: Call API to submit acknowledgement
    // await api.post(`/documents/${selectedDocument.id}/acknowledge`, formData)
    
    setAcknowledgeModalOpen(false)
    setSelectedDocument(null)
    setAlertModal({ show: true, title: 'Success', message: 'Acknowledgement submitted successfully!', type: 'success' })
    // Optionally reload documents
    // loadDocuments()
  }

  const handlePublish = (doc) => {
    setSelectedDocument(doc)
    setPublishModalOpen(true)
  }

  const handlePublishSubmit = async (updatedDocument) => {
    setAlertModal({ show: true, title: 'Success', message: 'Document published successfully!', type: 'success' })
    setPublishModalOpen(false)
    setSelectedDocument(null)
    
    // Reload documents to reflect changes
    await loadDocuments()
  }

  const handleReviewSupersedeSubmit = async (formData) => {
    try {
      // API call handled by ReviewSupersedeModal
      setReviewSupersedeModalOpen(false)
      setSelectedDocument(null)
      // Reload documents to reflect changes
      await loadDocuments()
    } catch (error) {
      console.error('Failed to submit supersede review:', error)
    }
  }

  const handleApproveSupersedeSubmit = async (formData) => {
    try {
      // API call handled by ApproveSupersedeModal
      setApproveSupersedeModalOpen(false)
      setSelectedDocument(null)
      // Reload documents to reflect changes
      await loadDocuments()
    } catch (error) {
      console.error('Failed to submit supersede approval:', error)
    }
  }

  const raColumns = [
    { id: 'fileCode', key: 'fileCode', accessor: 'fileCode', label: t('file_code'), sortable: true, required: true,
      render: (value, row) => (
        <a href="#" className="font-medium text-ink hover:text-brand" onClick={(e) => { e.preventDefault(); handleDownload(row); }}>
          {value}
        </a>
      )
    },
    { id: 'title', key: 'title', accessor: 'title', label: t('doc_title'), sortable: true, required: true,
      render: (value, row) => (
        <a href="#" className="font-medium text-brand hover:text-brand-hover hover:underline" onClick={(e) => { e.preventDefault(); handleDownload(row); }}>
          {value}
        </a>
      )
    },
    { id: 'projectCategory', key: 'projectCategory', accessor: 'projectCategory', label: t('project_category'), sortable: true,
      render: (v) => v || '-'
    },
    { id: 'version', key: 'version', accessor: 'version', label: t('version'), sortable: true, align: 'center' },
    { id: 'submittedBy', key: 'submittedBy', accessor: 'submittedBy', label: t('submitted_by'), sortable: true },
    { id: 'reviewerName', key: 'reviewerName', accessor: 'reviewerName', label: t('reviewer'), sortable: true,
      render: (v) => v || '-'
    },
    { id: 'firstApproverName', key: 'firstApproverName', accessor: 'firstApproverName', label: t('approver'), sortable: true,
      render: (v) => v || '-'
    },
    { id: 'secondApproverName', key: 'secondApproverName', accessor: 'secondApproverName', label: t('second_approver'), sortable: true,
      render: (v) => v || '-'
    },
    { id: 'lastUpdated', key: 'lastUpdated', accessor: 'lastUpdated', label: t('last_updated'), sortable: true, sortType: 'date',
      sortComparer: (a, b) => new Date(a || 0) - new Date(b || 0)
    },
    { id: 'status', key: 'status', accessor: 'status', label: t('status'), sortable: true,
      render: (v, row) => <StatusBadge status={row.status} />
    },
    { id: 'actions', key: 'actions', accessor: '__actions', label: t('action'), required: true, align: 'right', stickyRight: true,
      render: (_v, row) => (
        <ActionMenu
          actions={[
            ...(hasPermission('documents.review', 'read')
              ? [
                  ...(isPdfDocument(row) ? [{ label: t('view'), onClick: () => handleView(row) }] : []),
                  { label: t('download'), onClick: () => handleDownload(row), dividerAfter: true }
                ]
              : []
            ),
            ...(row.stage === 'Review' && hasPermission('documents.review', 'review') && !isDocumentOwner(row) && isAssignedReviewer(row)
              ? [{ label: t('review_action'), onClick: () => handleReview(row) }]
              : []
            ),
            ...((row.stage === 'Approval' || row.stage === 'FIRST_APPROVAL' || row.stage === 'SECOND_APPROVAL') && hasPermission('documents.review', 'approve') && !isDocumentOwner(row) && isAssignedApprover(row)
              ? [{ label: t('approve_action'), onClick: () => handleApprove(row) }]
              : []
            ),
            ...(row.stage === 'Acknowledge' && hasPermission('documents.published', 'acknowledge')
              ? [{ label: t('acknowledge_action'), onClick: () => handleAcknowledge(row) }]
              : []
            ),
            ...(row.status === 'READY_TO_PUBLISH' && hasPermission('documents.published', 'publish')
              ? [{ label: t('publish_action'), onClick: () => handlePublish(row) }]
              : []
            )
          ]}
        />
      )
    }
  ]

  const raTableFeatures = useTableFeatures({
    tableId: 'review-approval-list',
    columns: raColumns,
    data: filteredDocuments,
    defaultSortKey: 'lastUpdated',
    defaultSortDirection: 'desc'
  })

  const {
    sortedData: raSortedData,
    visibleColumns: raVisibleColumns,
    orderedColumns: raOrderedColumns,
    getSortDirectionFor: raGetSortDirectionFor,
    toggleSort: raToggleSort,
    moveColumn: raMoveColumn,
    hiddenColumns: raHiddenColumns,
    toggleColumnVisibility: raToggleColumnVisibility,
    resetTableSettings: raResetTableSettings
  } = raTableFeatures

  const raTotalPages = Math.ceil(raSortedData.length / pageSize)
  const raStartIndex = (currentPage - 1) * pageSize
  const raCurrentDocuments = raSortedData.slice(raStartIndex, raStartIndex + pageSize)

  const raColDragStart = (idx, e) => {
    const col = raVisibleColumns[idx]
    if (!col || col.stickyRight) { e.preventDefault(); return }
    setDragColIndex(idx)
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)) } catch {}
  }
  const raColDragOver = (idx, e) => {
    e.preventDefault()
    const col = raVisibleColumns[idx]
    if (!col || col.stickyRight) return
    setDragOverColIndex(idx)
  }
  const raColDragLeave = () => setDragOverColIndex(null)
  const raColDrop = (toIdx, e) => {
    e.preventDefault()
    const fromIdx = dragColIndex
    setDragColIndex(null)
    setDragOverColIndex(null)
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return
    const fromId = raVisibleColumns[fromIdx]?.id
    const toId = raVisibleColumns[toIdx]?.id
    if (!fromId || !toId) return
    const gf = raOrderedColumns.findIndex((c) => c.id === fromId)
    const gt = raOrderedColumns.findIndex((c) => c.id === toId)
    if (gf >= 0 && gt >= 0) raMoveColumn(gf, gt)
  }
  const raColDragEnd = () => { setDragColIndex(null); setDragOverColIndex(null) }

  return (
    <>
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
      <div className="space-y-6">
      <PageHeader
        title={t('review_approval_title')}
        subtitle={t('review_approval_desc')}
      />

      {/* Document List */}
      <AppSurface padding="lg" data-tour-id="ra-list-card">
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">{t('review_approval_list')}</h2>
              <p className="text-sm text-ink-muted mt-1">
                List of Documents to be acknowledged, reviewed and approved. ({filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''})
              </p>
            </div>
            
            {/* Actions */}
            <PermissionGate module="documents.draft" action="create">
              <Button
                onClick={() => navigate('/documents/drafts')}
                data-tour-id="ra-btn-upload-new-draft"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {t('upload_new_draft')}
                </span>
              </Button>
            </PermissionGate>
          </div>

          <DataTableToolbar rightSlot={<>
            <ColumnSettingsButton
              orderedColumns={raOrderedColumns}
              hiddenColumns={raHiddenColumns}
              onToggleColumn={raToggleColumnVisibility}
              onReset={raResetTableSettings}
            />
          </>}>
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 min-w-0 relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <TextInput
                  type="text"
                  placeholder={t('search_docs_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="w-[280px] shrink-0">
                <SelectField
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                >
                  {allStages.map(stage => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </SelectField>
              </div>
            </div>
          </DataTableToolbar>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <TableContainer>
            <Table>
              <thead>
                <tr>
                  {raVisibleColumns.map((col, idx) => {
                    const id = col.id || col.key
                    const canDrag = !col.stickyRight
                    const isDragOver = canDrag && dragOverColIndex === idx
                    return (
                      <Th
                        key={id}
                        align={col.align || 'left'}
                        stickyRight={col.stickyRight || false}
                        sortable={Boolean(col.sortable)}
                        sortDirection={raGetSortDirectionFor(id)}
                        sortKey={id}
                        onSort={col.sortable ? raToggleSort : undefined}
                        draggable={canDrag}
                        dragOver={isDragOver}
                        onDragStart={(e) => raColDragStart(idx, e)}
                        onDragOver={(e) => raColDragOver(idx, e)}
                        onDragLeave={raColDragLeave}
                        onDrop={(e) => raColDrop(idx, e)}
                        onDragEnd={raColDragEnd}
                        title={canDrag ? 'Click to sort • Drag to reorder' : col.sortable ? 'Click to sort' : undefined}
                      >
                        {col.label || col.header || id}
                      </Th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
              {loading ? (
                <tr>
                  <td colSpan={Math.max(raVisibleColumns.length, 1)} className="py-10">
                    <div className="flex flex-col items-center gap-2">
                      <InlineSpinner />
                      <span className="text-sm text-ink-muted">{t('loading_docs')}</span>
                    </div>
                  </td>
                </tr>
              ) : raCurrentDocuments.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(raVisibleColumns.length, 1)}>
                    <EmptyState 
                      message={t('no_docs_found')} 
                      description={searchQuery || stageFilter !== 'All' ? t('try_adjusting') : t('no_pending_review')}
                      actionLabel={searchQuery ? t('clear_search') : null}
                      onAction={searchQuery ? () => setSearchQuery('') : null}
                    />
                  </td>
                </tr>
              ) : (
                raCurrentDocuments.map((doc) => (
                  <Tr key={doc.id}>
                    {raVisibleColumns.map((col) => {
                      const id = col.id || col.key || col.accessor
                      const accessor = col.accessor || id
                      let value
                      if (typeof accessor === 'function') value = accessor(doc, col)
                      else if (accessor === '__actions') value = null
                      else value = doc?.[accessor]
                      const content = typeof col.render === 'function' ? col.render(value, doc) : (value != null ? value : '')
                      return (
                        <Td
                          key={id}
                          align={col.align || 'left'}
                          stickyRight={col.stickyRight || false}
                          className={(col.stickyRight || id === 'status') ? 'py-3' : ''}
                        >
                          {content}
                        </Td>
                      )
                    })}
                  </Tr>
                ))
              )}
              </tbody>
            </Table>
          </TableContainer>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-4">
          {loading ? (
            <div className="text-center py-10">
              <div className="flex flex-col items-center gap-2">
                <InlineSpinner />
                <span className="text-sm text-ink-muted">{t('loading_docs')}</span>
              </div>
            </div>
          ) : raCurrentDocuments.length === 0 ? (
            <EmptyState 
              message={t('no_docs_found')} 
              description={searchQuery || stageFilter !== 'All' ? t('try_adjusting') : t('no_pending_review')}
              actionLabel={searchQuery ? t('clear_search') : null}
              onAction={searchQuery ? () => setSearchQuery('') : null}
            />
          ) : (
            raCurrentDocuments.map((doc) => (
              <AppSurface key={doc.id} variant="muted" padding="md" className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <a
                      href="#"
                      className="text-ink font-semibold hover:text-brand"
                      onClick={(e) => {
                        e.preventDefault()
                        handleDownload(doc)
                      }}
                    >
                      {doc.fileCode}
                    </a>
                    <a
                      href="#"
                      className="block text-sm text-ink-secondary mt-1 hover:text-brand hover:underline"
                      onClick={(e) => {
                        e.preventDefault()
                        handleDownload(doc)
                      }}
                    >
                      {doc.title}
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={doc.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-ink-muted">{t('version')}:</span>
                    <div className="text-ink font-medium">{doc.version}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('submitted_by')}:</span>
                    <div className="text-ink font-medium">{doc.submittedBy}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('project_category')}:</span>
                    <div className="text-ink font-medium">{doc.projectCategory || '-'}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('reviewer')}:</span>
                    <div className="text-ink font-medium">{doc.reviewerName || '-'}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('approver')}:</span>
                    <div className="text-ink font-medium">{doc.firstApproverName || '-'}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('second_approver')}:</span>
                    <div className="text-ink font-medium">{doc.secondApproverName || '-'}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('last_updated')}:</span>
                    <div className="text-ink font-medium">{doc.lastUpdated}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-3 border-t border-border/70">
                  {hasPermission('documents.review', 'read') && (
                    <Button
                      onClick={() => handleView(doc)}
                      size="sm"
                      variant="secondary"
                      className={isPdfDocument(doc) ? 'flex-1 border-brand text-brand hover:text-brand-hover' : 'flex-1'}
                      disabled={!isPdfDocument(doc)}
                    >
                      {t('view')}
                    </Button>
                  )}
                  {hasPermission('documents.review', 'read') && (
                    <Button
                      onClick={() => handleDownload(doc)}
                      size="sm"
                      variant="secondary"
                      className="flex-1 border-brand text-brand hover:text-brand-hover"
                    >
                      {t('download')}
                    </Button>
                  )}
                  {doc.stage === 'Review' && hasPermission('documents.review', 'review') && !isDocumentOwner(doc) && isAssignedReviewer(doc) && (
                    <Button
                      onClick={() => handleReview(doc)}
                      size="sm"
                      variant="primary"
                      className="flex-1"
                    >
                      {t('review_action')}
                    </Button>
                  )}
                  {(doc.stage === 'Approval' || doc.stage === 'FIRST_APPROVAL' || doc.stage === 'SECOND_APPROVAL') && hasPermission('documents.review', 'approve') && !isDocumentOwner(doc) && isAssignedApprover(doc) && (
                    <Button
                      onClick={() => handleApprove(doc)}
                      size="sm"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {t('approve_action')}
                    </Button>
                  )}
                  {doc.stage === 'Acknowledge' && hasPermission('documents.published', 'acknowledge') && (
                    <Button
                      onClick={() => handleAcknowledge(doc)}
                      size="sm"
                      variant="primary"
                      className="flex-1"
                    >
                      {t('acknowledge_action')}
                    </Button>
                  )}
                  {doc.status === 'READY_TO_PUBLISH' && hasPermission('documents.published', 'publish') && (
                    <Button
                      onClick={() => handlePublish(doc)}
                      size="sm"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {t('publish_action')}
                    </Button>
                  )}
                </div>
              </AppSurface>
            ))
          )}
        </div>

      </AppSurface>

      {/* Pagination */}
      {!loading && raSortedData.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={raTotalPages}
          totalRecords={raSortedData.length}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
      </div>

      {/* Review Document Modal */}
      {reviewModalOpen && selectedDocument && (
        <ReviewDocumentModal
          document={selectedDocument}
          onClose={() => {
            setReviewModalOpen(false)
            setSelectedDocument(null)
            setReviewSubmitError('')
          }}
          onSubmit={handleReviewSubmit}
          isSubmitting={reviewSubmitting}
          submitError={reviewSubmitError}
        />
      )}

      {/* Approve Document Modal */}
      {approveModalOpen && selectedDocument && (
        <ApproveDocumentModal
          document={selectedDocument}
          onClose={() => {
            setApproveModalOpen(false)
            setSelectedDocument(null)
            setApproveSubmitError('')
          }}
          onSubmit={handleApproveSubmit}
          isSubmitting={approveSubmitting}
          submitError={approveSubmitError}
        />
      )}

      {/* Acknowledge Document Modal */}
      {acknowledgeModalOpen && selectedDocument && (
        <AcknowledgeDocumentModal
          document={selectedDocument}
          onClose={() => {
            setAcknowledgeModalOpen(false)
            setSelectedDocument(null)
          }}
          onSubmit={handleAcknowledgeSubmit}
        />
      )}

      {/* Document Viewer Modal */}
      {viewModalOpen && selectedDocument && (
        <DocumentViewerModal
          document={selectedDocument}
          onClose={() => {
            setViewModalOpen(false)
            setSelectedDocument(null)
          }}
        />
      )}

      {/* Publish Document Modal */}
      {publishModalOpen && selectedDocument && (
        <PublishDocumentModal
          isOpen={publishModalOpen}
          document={selectedDocument}
          onClose={() => {
            setPublishModalOpen(false)
            setSelectedDocument(null)
          }}
          onPublish={handlePublishSubmit}
        />
      )}

      {/* Review Supersede Request Modal */}
      {reviewSupersedeModalOpen && selectedDocument && (
        <ReviewSupersedeModal
          document={selectedDocument}
          onClose={() => {
            setReviewSupersedeModalOpen(false)
            setSelectedDocument(null)
          }}
          onSubmit={handleReviewSupersedeSubmit}
        />
      )}

      {/* Approve Supersede Request Modal */}
      {approveSupersedeModalOpen && selectedDocument && (
        <ApproveSupersedeModal
          document={selectedDocument}
          onClose={() => {
            setApproveSupersedeModalOpen(false)
            setSelectedDocument(null)
          }}
          onSubmit={handleApproveSupersedeSubmit}
        />
      )}
    </>
  )
}
