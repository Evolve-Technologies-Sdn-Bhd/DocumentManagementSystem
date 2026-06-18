import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import RequestSupersedeModal from './RequestSupersedeModal'
import ReviewSupersedeModal from './ReviewSupersedeModal'
import ApproveSupersedeModal from './ApproveSupersedeModal'
import ArchiveDocumentModal from './ArchiveDocumentModal'
import DocumentViewerModal from './DocumentViewerModal'
import StatusBadge from './StatusBadge'
import ActionMenu from './ActionMenu'
import EmptyState from './EmptyState'
import Pagination from './Pagination'
import { PermissionGate } from './PermissionGate'
import { hasPermission } from '../utils/permissions'
import { usePreferences } from '../contexts/PreferencesContext'
import PageHeader from './ui/PageHeader'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import SelectField from './ui/SelectField'
import InlineSpinner from './ui/InlineSpinner'
import { Table, TableContainer, Td, Th, Tr } from './ui/Table'

export default function SupersededObsolete() {
  const { itemsPerPage, t } = usePreferences()
  const [documents, setDocuments] = useState([])
  const [filteredDocuments, setFilteredDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionTypeFilter, setActionTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)

  useEffect(() => {
    loadDocuments()
  }, [])

  // Filter and search documents
  useEffect(() => {
    let filtered = documents

    // Apply action type filter
    if (actionTypeFilter !== 'All') {
      filtered = filtered.filter(doc => doc.actionType === actionTypeFilter)
    }

    // Apply status filter
    if (statusFilter !== 'All') {
      filtered = filtered.filter(doc => doc.status === statusFilter)
    }

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(doc =>
        doc.fileCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.requestedBy.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredDocuments(filtered)
    setCurrentPage(1)
  }, [documents, actionTypeFilter, statusFilter, searchQuery])

  const loadDocuments = async () => {
    try {
      // Only fetch supersede/obsolete requests
      // The requests contain all necessary information including completed ones
      const requestsRes = await api.get('/supersede-requests')

      const requests = requestsRes.data.data?.requests || requestsRes.data.requests || []

      // Format requests to match expected structure
      const formattedRequests = requests.map(req => {
        // Map status display
        let displayStatus = req.status
        if (req.status === 'Approved') {
          displayStatus = 'Completed'
        }
        
        // Get replaced by info (superseding document)
        let replacedBy = '-'
        if (req.actionType === 'Supersede' && req.supersedingDoc) {
          replacedBy = `${req.supersedingDoc.fileCode} - ${req.supersedingDoc.title}`
        }
        
        return {
          id: req.id,
          fileCode: req.fileCode || '',
          title: req.title || '',
          actionType: req.actionType,
          requestedBy: req.requestedBy || '',
          replacedBy: replacedBy,
          status: displayStatus,
          rawStatus: req.rawStatus || req.status,
          isArchived: req.isArchived || false,
          type: 'request'
        }
      })
      
      setDocuments(formattedRequests)
      setFilteredDocuments(formattedRequests)
    } catch (error) {
      console.error('Failed to load requests:', error)
      console.error('Error details:', error.response?.data)
      // Mock data for demonstration
      const mockDocs = [
        {
          id: 1,
          fileCode: 'MoM01250821001',
          title: 'Minutes of Meeting',
          actionType: 'Superseded',
          requestedBy: 'Mr. Jin',
          status: 'Approved'
        },
        {
          id: 2,
          fileCode: 'PP01250821001',
          title: 'Project Plan',
          actionType: 'Obsolete',
          requestedBy: 'Ms. Nicole',
          status: 'Pending Review'
        },
        {
          id: 3,
          fileCode: 'PRA01250821001',
          title: 'Project Requirement Analysis',
          actionType: 'Superseded',
          requestedBy: 'Mr. Khairul',
          status: 'Reviewed'
        },
        {
          id: 4,
          fileCode: 'DD01250821001',
          title: 'Design Document',
          actionType: 'Obsolete',
          requestedBy: 'Ms. Hanish',
          status: 'Pending Approval'
        }
      ]
      setDocuments(mockDocs)
      setFilteredDocuments(mockDocs)
    } finally {
      setLoading(false)
    }
  }

  // Get unique action types and statuses for filters
  const allActionTypes = ['All', ...new Set(documents.map(doc => doc.actionType))]
  const allStatuses = ['All', ...new Set(documents.map(doc => doc.status))]

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

  const handleView = async (doc) => {
    try {
      // Fetch the full document details
      const response = await api.get(`/supersede-requests/${doc.id}`)
      const requestData = response.data.data?.request || response.data.request

      // Set document details for the viewer modal
      setSelectedDocument({
        id: requestData.document.id,
        fileCode: requestData.document.fileCode,
        fileName: requestData.document.title,
        title: requestData.document.title,
        status: requestData.document.status
      })
      setShowViewModal(true)
    } catch (error) {
      console.error('Error fetching document details:', error)
      alert('Failed to load document details. Please try again.')
    }
  }

  const handleReview = async (doc) => {
    try {
      // Fetch full request details including documentId, reason, etc.
      const response = await api.get(`/supersede-requests/${doc.id}`)
      const requestData = response.data.data?.request || response.data.request
      
      setSelectedDocument({
        id: requestData.id,
        documentId: requestData.document.id,
        fileCode: requestData.document.fileCode,
        title: requestData.document.title,
        documentType: requestData.document.documentType || '',
        version: requestData.document.version,
        actionType: requestData.actionType === 'OBSOLETE' ? 'Obsolete' : 'Supersede',
        reason: requestData.reason,
        requestedBy: requestData.requestedBy?.name || '',
        replacementFileCode: requestData.supersedingDoc?.fileCode || '',
        status: doc.status
      })
      setShowReviewModal(true)
    } catch (error) {
      console.error('Error fetching request details:', error)
      alert('Failed to load request details. Please try again.')
    }
  }

  const handleReviewSubmit = async (reviewData) => {
    setShowReviewModal(false)
    setSelectedDocument(null)
    
    // Reload documents to show updated status
    loadDocuments()
  }

  const handleApproved = async (doc) => {
    try {
      // Fetch full request details including documentId, reason, etc.
      const response = await api.get(`/supersede-requests/${doc.id}`)
      const requestData = response.data.data?.request || response.data.request
      
      setSelectedDocument({
        id: requestData.id,
        documentId: requestData.document.id,
        fileCode: requestData.document.fileCode,
        title: requestData.document.title,
        documentType: requestData.document.documentType || '',
        version: requestData.document.version,
        actionType: requestData.actionType === 'OBSOLETE' ? 'Obsolete' : 'Supersede',
        reason: requestData.reason,
        requestedBy: requestData.requestedBy?.name || '',
        replacementFileCode: requestData.supersedingDoc?.fileCode || '',
        status: doc.status
      })
      setShowApproveModal(true)
    } catch (error) {
      console.error('Error fetching request details:', error)
      alert('Failed to load request details. Please try again.')
    }
  }

  const handleApproveSubmit = async (approvalData) => {
    setShowApproveModal(false)
    setSelectedDocument(null)
    
    // Reload documents to show updated status
    loadDocuments()
  }

  const handleRequestSupersede = () => {
    setShowRequestModal(true)
  }

  const handleRequestSubmit = async (requestData) => {
    setShowRequestModal(false)
    // Reload documents to show new request
    loadDocuments()
  }

  const handleArchive = async (doc) => {
    try {
      // Fetch the full document details including documentId
      const response = await api.get(`/supersede-requests/${doc.id}`)
      const requestData = response.data.data?.request || response.data.request

      // Set document with documentId for the archive modal
      // Use the actual document status (OBSOLETE/SUPERSEDED), not the request status (APPROVED)
      setSelectedDocument({
        id: requestData.document.id,
        fileCode: requestData.document.fileCode,
        title: requestData.document.title,
        status: requestData.document.status || 'OBSOLETE'
      })
      setShowArchiveModal(true)
    } catch (error) {
      console.error('Error fetching document details:', error)
      alert('Failed to load document details')
    }
  }

  const handleArchiveComplete = (updatedDocument) => {
    alert('Document archived successfully!')
    loadDocuments()
  }

  return (
    <>
      {/* Request Supersede/Obsolete Modal */}
      {showRequestModal && (
        <RequestSupersedeModal
          onClose={() => setShowRequestModal(false)}
          onSubmit={handleRequestSubmit}
        />
      )}

      {/* Review Supersede/Obsolete Modal */}
      {showReviewModal && selectedDocument && (
        <ReviewSupersedeModal
          document={selectedDocument}
          onClose={() => {
            setShowReviewModal(false)
            setSelectedDocument(null)
          }}
          onSubmit={handleReviewSubmit}
        />
      )}

      {/* Approve Supersede/Obsolete Modal */}
      {showApproveModal && selectedDocument && (
        <ApproveSupersedeModal
          document={selectedDocument}
          onClose={() => {
            setShowApproveModal(false)
            setSelectedDocument(null)
          }}
          onSubmit={handleApproveSubmit}
        />
      )}

      {/* Archive Document Modal */}
      {showArchiveModal && selectedDocument && (
        <ArchiveDocumentModal
          isOpen={showArchiveModal}
          onClose={() => {
            setShowArchiveModal(false)
            setSelectedDocument(null)
          }}
          document={selectedDocument}
          onArchive={handleArchiveComplete}
        />
      )}
      
      {/* Document Viewer Modal */}
      {showViewModal && selectedDocument && (
        <DocumentViewerModal
          document={selectedDocument}
          onClose={() => {
            setShowViewModal(false)
            setSelectedDocument(null)
          }}
        />
      )}

      <div className="space-y-6">
      <PageHeader title={t('superseded_title')} subtitle={t('superseded_desc')} />

      {/* Document List */}
      <AppSurface padding="lg" data-tour-id="so-list-card">
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">{t('superseded_list')}</h2>
              <p className="text-sm text-ink-muted mt-1">
                {t('superseded_list_desc')}
              </p>
            </div>
            
            {/* Actions */}
            <PermissionGate module="documents.superseded" action="create">
              <Button
                onClick={handleRequestSupersede}
                data-tour-id="so-btn-request"
              >
                {t('request_supersede')}
              </Button>
            </PermissionGate>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <TextInput
                type="text"
                placeholder="Search by file code, title, or requester..."
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

            {/* Action Type Filter */}
            <SelectField
              value={actionTypeFilter}
              onChange={(e) => setActionTypeFilter(e.target.value)}
            >
              {allActionTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </SelectField>

            {/* Status Filter */}
            <SelectField
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {allStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </SelectField>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <TableContainer>
          <Table>
            <thead className="bg-surface-muted">
              <tr>
                <Th>{t('file_code')}</Th>
                <Th>{t('doc_title')}</Th>
                <Th>{t('action_type')}</Th>
                <Th>{t('replaced_by')}</Th>
                <Th>{t('requested_by')}</Th>
                <Th>{t('status')}</Th>
                <Th>{t('archive_status')}</Th>
                <Th>{t('action')}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-10">
                    <div className="flex flex-col items-center gap-2">
                      <InlineSpinner className="h-8 w-8 border-2" />
                      <span className="text-sm text-ink-muted">{t('loading_docs')}</span>
                    </div>
                  </td>
                </tr>
              ) : currentDocuments.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <EmptyState 
                      message={t('no_docs_found')} 
                      description={searchQuery || actionTypeFilter !== 'All' || statusFilter !== 'All' ? t('try_adjusting') : t('no_superseded_docs')}
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
                    <Td>{doc.actionType}</Td>
                    <Td>
                      <span className="text-sm" title={doc.replacedBy}>
                        {doc.replacedBy === '-' ? '-' : (
                          <span className="text-brand">{doc.replacedBy}</span>
                        )}
                      </span>
                    </Td>
                    <Td>{doc.requestedBy}</Td>
                    <Td className="py-3">
                      <StatusBadge status={doc.status} />
                    </Td>
                    <Td className="py-3">
                      {doc.isArchived ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {t('archived')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-muted text-ink-secondary border border-border">
                          {t('not_archived')}
                        </span>
                      )}
                    </Td>
                    <Td className="py-3">
                      <ActionMenu
                        actions={[
                          ...(hasPermission('documents.superseded', 'view')
                            ? [{ label: t('view'), onClick: () => handleView(doc) }]
                            : []
                          ),
                          ...(doc.status === 'Pending Review' && hasPermission('documents.review', 'review')
                            ? [{ label: t('review_action'), onClick: () => handleReview(doc) }]
                            : []
                          ),
                          ...(doc.status === 'Pending Approval' && hasPermission('documents.review', 'approve')
                            ? [{ label: t('approve_action'), onClick: () => handleApproved(doc) }]
                            : []
                          ),
                          ...(doc.status === 'Completed' && !doc.isArchived && hasPermission('documents.superseded', 'update')
                            ? [{ label: t('archive_action'), onClick: () => handleArchive(doc) }]
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
                <InlineSpinner className="h-8 w-8 border-2" />
                <span className="text-sm text-ink-muted">{t('loading_docs')}</span>
              </div>
            </div>
          ) : currentDocuments.length === 0 ? (
            <EmptyState 
              message={t('no_docs_found')} 
              description={searchQuery || actionTypeFilter !== 'All' || statusFilter !== 'All' ? t('try_adjusting') : t('no_superseded_docs')}
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
                    <span className="text-ink-muted">{t('action_type')}:</span>
                    <div className="text-ink font-medium">{doc.actionType}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('replaced_by')}:</span>
                    <div className="text-ink font-medium text-xs">
                      {doc.replacedBy === '-' ? '-' : (
                        <span className="text-brand">{doc.replacedBy}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('requested_by')}:</span>
                    <div className="text-ink font-medium">{doc.requestedBy}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('archive_status')}:</span>
                    <div className="text-ink font-medium">
                      {doc.isArchived ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {t('archived')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface text-ink-secondary border border-border">
                          {t('not_archived')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-3 border-t border-border/70">
                  <Button onClick={() => handleView(doc)} size="sm" variant="secondary" className="flex-1">
                    {t('view')}
                  </Button>
                  {doc.status === 'Pending Review' && (
                    <Button onClick={() => handleReview(doc)} size="sm" className="flex-1">
                      {t('review_action')}
                    </Button>
                  )}
                  {doc.status === 'Pending Approval' && (
                    <Button onClick={() => handleApproved(doc)} size="sm" className="flex-1">
                      {t('approve_action')}
                    </Button>
                  )}
                  {doc.status === 'Completed' && !doc.isArchived && (
                    <Button onClick={() => handleArchive(doc)} size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                      {t('archive_action')}
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
    </>
  )
}
