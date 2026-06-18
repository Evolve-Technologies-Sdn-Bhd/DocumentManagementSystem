import React, { useState, useEffect, useRef } from 'react'
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
import { Table, TableContainer, Td, Th, Tr } from './ui/Table'

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
      // Access nested data structure: res.data.data.documents
      const docs = res.data.data?.documents || res.data.documents || []
      setDocuments(docs)
      setFilteredDocuments(docs)
    } catch (error) {
      console.error('Failed to load documents:', error)
      console.error('Error details:', error.response?.data || error.message)
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
      setAlertModal({
        show: true,
        title: t('failed_load_doc'),
        message: apiMessage || t('failed_load_doc'),
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
    // Check if this is a supersede request
    if (doc.type === 'supersede-request') {
      setReviewSupersedeModalOpen(true)
    } else {
      setReviewModalOpen(true)
    }
  }

  const handleReviewSubmit = async (formData) => {
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
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to submit review. Please try again.', type: 'error' })
    }
  }

  const handleApprove = (doc) => {
    setSelectedDocument(doc)
    // Check if this is a supersede request
    if (doc.type === 'supersede-request') {
      setApproveSupersedeModalOpen(true)
    } else {
      setApproveModalOpen(true)
    }
  }

  const handleApproveSubmit = async (formData) => {
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
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to submit approval. Please try again.', type: 'error' })
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
                onClick={() => navigate('/drafts')}
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

          {/* Search and Filter */}
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
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

            {/* Stage Filter */}
            <SelectField
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="min-w-[200px]"
            >
              {allStages.map(stage => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </SelectField>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <TableContainer>
            <Table>
              <thead>
                <tr>
                  <Th>{t('file_code')}</Th>
                  <Th>{t('doc_title')}</Th>
                  <Th>{t('version')}</Th>
                  <Th>{t('stage')}</Th>
                  <Th>{t('submitted_by')}</Th>
                  <Th>{t('reviewer')}</Th>
                  <Th>{t('approver')}</Th>
                  <Th>{t('second_approver')}</Th>
                  <Th>{t('last_updated')}</Th>
                  <Th>{t('status')}</Th>
                  <Th>{t('action')}</Th>
                </tr>
              </thead>
              <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" className="py-10">
                    <div className="flex flex-col items-center gap-2">
                      <InlineSpinner />
                      <span className="text-sm text-ink-muted">{t('loading_docs')}</span>
                    </div>
                  </td>
                </tr>
              ) : currentDocuments.length === 0 ? (
                <tr>
                  <td colSpan="11">
                    <EmptyState 
                      message={t('no_docs_found')} 
                      description={searchQuery || stageFilter !== 'All' ? t('try_adjusting') : t('no_pending_review')}
                      actionLabel={searchQuery ? t('clear_search') : null}
                      onAction={searchQuery ? () => setSearchQuery('') : null}
                    />
                  </td>
                </tr>
              ) : (
                currentDocuments.map((doc) => (
                  <Tr key={doc.id}>
                    <Td>
                      <a href="#" className="font-medium text-ink hover:text-brand">
                        {doc.fileCode}
                      </a>
                    </Td>
                    <Td>
                      <a href="#" className="font-medium text-brand hover:text-brand-hover hover:underline">
                        {doc.title}
                      </a>
                    </Td>
                    <Td>{doc.version}</Td>
                    <Td>{doc.stage}</Td>
                    <Td>{doc.submittedBy}</Td>
                    <Td>{doc.reviewerName || '-'}</Td>
                    <Td>{doc.firstApproverName || '-'}</Td>
                    <Td>{doc.secondApproverName || '-'}</Td>
                    <Td>{doc.lastUpdated}</Td>
                    <Td className="py-3">
                      <StatusBadge status={doc.status} />
                    </Td>
                    <Td className="py-3">
                      <ActionMenu
                        actions={[
                          ...(hasPermission('documents.review', 'read')
                            ? [
                                ...(isPdfDocument(doc) ? [{ label: t('view'), onClick: () => handleView(doc) }] : []),
                                { label: t('download'), onClick: () => handleDownload(doc), dividerAfter: true }
                              ]
                            : []
                          ),
                          ...(doc.stage === 'Review' && hasPermission('documents.review', 'review') && !isDocumentOwner(doc) && isAssignedReviewer(doc)
                            ? [{ label: t('review_action'), onClick: () => handleReview(doc) }]
                            : []
                          ),
                          ...((doc.stage === 'Approval' || doc.stage === 'FIRST_APPROVAL' || doc.stage === 'SECOND_APPROVAL') && hasPermission('documents.review', 'approve') && !isDocumentOwner(doc) && isAssignedApprover(doc)
                            ? [{ label: t('approve_action'), onClick: () => handleApprove(doc) }]
                            : []
                          ),
                          ...(doc.stage === 'Acknowledge' && hasPermission('documents.published', 'acknowledge')
                            ? [{ label: t('acknowledge_action'), onClick: () => handleAcknowledge(doc) }]
                            : []
                          ),
                          ...(doc.status === 'READY_TO_PUBLISH' && hasPermission('documents.published', 'create')
                            ? [{ label: t('publish_action'), onClick: () => handlePublish(doc) }]
                            : []
                          )
                        ]}
                      />
                    </Td>
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
          ) : currentDocuments.length === 0 ? (
            <EmptyState 
              message={t('no_docs_found')} 
              description={searchQuery || stageFilter !== 'All' ? t('try_adjusting') : t('no_pending_review')}
              actionLabel={searchQuery ? t('clear_search') : null}
              onAction={searchQuery ? () => setSearchQuery('') : null}
            />
          ) : (
            currentDocuments.map((doc) => (
              <AppSurface key={doc.id} variant="muted" padding="md" className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <a href="#" className="text-ink font-semibold hover:text-brand">
                      {doc.fileCode}
                    </a>
                    <div className="text-sm text-ink-secondary mt-1">{doc.title}</div>
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
                    <span className="text-ink-muted">{t('stage')}:</span>
                    <div className="text-ink font-medium">{doc.stage}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('submitted_by')}:</span>
                    <div className="text-ink font-medium">{doc.submittedBy}</div>
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
                  {doc.stage === 'Acknowledge' && (
                    <Button
                      onClick={() => handleAcknowledge(doc)}
                      size="sm"
                      variant="primary"
                      className="flex-1"
                    >
                      {t('acknowledge_action')}
                    </Button>
                  )}
                  {doc.status === 'READY_TO_PUBLISH' && (
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
      {!loading && filteredDocuments.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={filteredDocuments.length}
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
          }}
          onSubmit={handleReviewSubmit}
        />
      )}

      {/* Approve Document Modal */}
      {approveModalOpen && selectedDocument && (
        <ApproveDocumentModal
          document={selectedDocument}
          onClose={() => {
            setApproveModalOpen(false)
            setSelectedDocument(null)
          }}
          onSubmit={handleApproveSubmit}
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
