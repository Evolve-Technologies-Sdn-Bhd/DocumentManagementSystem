import React, { useState, useEffect, useMemo } from 'react'
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
import ColumnSettingsButton from './ui/ColumnSettingsButton'
import { Table, TableContainer, Td, Th, Tr } from './ui/Table'
import useTableFeatures from '../hooks/useTableFeatures'

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
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

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

  // Pagination overrides below via useTableFeatures.sortedData
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

  const soTableColumns = useMemo(() => [
    {
      id: 'fileCode',
      key: 'fileCode',
      accessor: 'fileCode',
      label: t('file_code'),
      sortable: true,
      required: true,
      render: (value, row) => (
        <a href="#" className="font-medium text-ink hover:text-brand">
          {value}
        </a>
      )
    },
    {
      id: 'title',
      key: 'title',
      accessor: 'title',
      label: t('doc_title'),
      sortable: true,
      required: true,
      render: (value) => (
        <a href="#" className="font-medium text-brand hover:text-brand-hover hover:underline">
          {value}
        </a>
      )
    },
    {
      id: 'actionType',
      key: 'actionType',
      accessor: 'actionType',
      label: t('action_type'),
      sortable: true,
      render: (value) => <span>{value}</span>
    },
    {
      id: 'replacedBy',
      key: 'replacedBy',
      accessor: 'replacedBy',
      label: t('replaced_by'),
      sortable: true,
      render: (value) => (
        <span className="text-sm" title={value}>
          {value === '-' ? '-' : (
            <span className="text-brand">{value}</span>
          )}
        </span>
      )
    },
    {
      id: 'requestedBy',
      key: 'requestedBy',
      accessor: 'requestedBy',
      label: t('requested_by'),
      sortable: true,
      render: (value) => <span>{value}</span>
    },
    {
      id: 'status',
      key: 'status',
      accessor: 'status',
      label: t('status'),
      sortable: true,
      render: (_v, row) => <StatusBadge status={row.status} />
    },
    {
      id: 'archiveStatus',
      key: 'archiveStatus',
      accessor: 'isArchived',
      label: t('archive_status'),
      sortable: true,
      render: (value) => (
        value ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            {t('archived')}
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-muted text-ink-secondary border border-border">
            {t('not_archived')}
          </span>
        )
      )
    },
    {
      id: 'actions',
      key: 'actions',
      accessor: '__actions',
      label: t('action'),
      required: true,
      align: 'right',
      stickyRight: true,
      render: (_v, row) => (
        <ActionMenu
          actions={[
            ...(hasPermission('documents.superseded', 'view')
              ? [{ label: t('view'), onClick: () => handleView(row) }]
              : []
            ),
            ...(row.status === 'Pending Review' && hasPermission('documents.review', 'review')
              ? [{ label: t('review_action'), onClick: () => handleReview(row) }]
              : []
            ),
            ...(row.status === 'Pending Approval' && hasPermission('documents.review', 'approve')
              ? [{ label: t('approve_action'), onClick: () => handleApproved(row) }]
              : []
            ),
            ...(row.status === 'Completed' && !row.isArchived && hasPermission('documents.superseded', 'update')
              ? [{ label: t('archive_action'), onClick: () => handleArchive(row) }]
              : []
            )
          ]}
        />
      )
    }
  ], [t])

  const tableFeatures = useTableFeatures({
    tableId: 'superseded-obsolete-list',
    columns: soTableColumns,
    data: filteredDocuments,
    defaultSortKey: 'fileCode',
    defaultSortDirection: 'asc'
  })

  const {
    sortedData,
    visibleColumns,
    orderedColumns,
    getSortDirectionFor,
    toggleSort,
    moveColumn,
    hiddenColumns,
    toggleColumnVisibility,
    resetTableSettings
  } = tableFeatures

  useEffect(() => { setCurrentPage(1) }, [sortedData.length])

  const totalPages = Math.ceil(sortedData.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const currentDocuments = sortedData.slice(startIndex, endIndex)

  const handleColDragStart = (idx, e) => {
    const col = visibleColumns[idx]
    if (!col || col.stickyRight) { e.preventDefault(); return }
    setDragColIndex(idx)
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)) } catch {}
  }
  const handleColDragOver = (idx, e) => {
    e.preventDefault()
    const col = visibleColumns[idx]
    if (!col || col.stickyRight) return
    setDragOverColIndex(idx)
  }
  const handleColDragLeave = () => setDragOverColIndex(null)
  const handleColDrop = (toIdx, e) => {
    e.preventDefault()
    const fromIdx = dragColIndex
    setDragColIndex(null)
    setDragOverColIndex(null)
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return
    const fromId = visibleColumns[fromIdx]?.id
    const toId = visibleColumns[toIdx]?.id
    if (!fromId || !toId) return
    const globalFrom = orderedColumns.findIndex((c) => c.id === fromId)
    const globalTo = orderedColumns.findIndex((c) => c.id === toId)
    if (globalFrom >= 0 && globalTo >= 0) moveColumn(globalFrom, globalTo)
  }
  const handleColDragEnd = () => { setDragColIndex(null); setDragOverColIndex(null) }

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
          <div className="flex flex-col md:flex-row md:items-center gap-3 w-full">
            {/* 3 equal-width columns for search + 2 filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 min-w-0 w-full">
              {/* Search */}
              <div className="min-w-0 relative">
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
              <div className="min-w-0">
                <SelectField
                  value={actionTypeFilter}
                  onChange={(e) => setActionTypeFilter(e.target.value)}
                >
                  {allActionTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </SelectField>
              </div>

              {/* Status Filter */}
              <div className="min-w-0">
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

            {/* Column Settings — pinned to right, separate from the 3-column grid */}
            <div className="flex items-center shrink-0 md:ml-auto">
              <ColumnSettingsButton
                orderedColumns={orderedColumns}
                hiddenColumns={hiddenColumns}
                onToggleColumn={toggleColumnVisibility}
                onReset={resetTableSettings}
              />
            </div>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <TableContainer>
          <Table>
            <thead className="bg-surface-muted">
              <tr>
                {visibleColumns.map((col, idx) => {
                  const id = col.id || col.key
                  const canDrag = !col.stickyRight
                  const isDragOver = canDrag && dragOverColIndex === idx
                  return (
                    <Th
                      key={id}
                      align={col.align || 'left'}
                      stickyRight={col.stickyRight || false}
                      sortable={Boolean(col.sortable)}
                      sortDirection={getSortDirectionFor(id)}
                      sortKey={id}
                      onSort={col.sortable ? toggleSort : undefined}
                      draggable={canDrag}
                      dragOver={isDragOver}
                      onDragStart={(e) => handleColDragStart(idx, e)}
                      onDragOver={(e) => handleColDragOver(idx, e)}
                      onDragLeave={handleColDragLeave}
                      onDrop={(e) => handleColDrop(idx, e)}
                      onDragEnd={handleColDragEnd}
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
                  <Td colSpan={Math.max(visibleColumns.length, 1)} className="py-10">
                    <div className="flex flex-col items-center gap-2">
                      <InlineSpinner className="h-8 w-8 border-2" />
                      <span className="text-sm text-ink-muted">{t('loading_docs')}</span>
                    </div>
                  </Td>
                </tr>
              ) : currentDocuments.length === 0 ? (
                <tr>
                  <Td colSpan={Math.max(visibleColumns.length, 1)}>
                    <EmptyState 
                      message={t('no_docs_found')} 
                      description={searchQuery || actionTypeFilter !== 'All' || statusFilter !== 'All' ? t('try_adjusting') : t('no_superseded_docs')}
                      actionLabel={searchQuery ? t('clear_search') : null}
                      onAction={searchQuery ? () => setSearchQuery('') : null}
                    />
                  </Td>
                </tr>
              ) : (
                currentDocuments.map((doc) => (
                  <Tr key={doc.id}>
                    {visibleColumns.map((col) => {
                      const id = col.id || col.key || col.accessor
                      const accessor = col.accessor || id
                      let value
                      if (typeof accessor === 'function') {
                        value = accessor(doc, col)
                      } else if (accessor === '__actions') {
                        value = null
                      } else {
                        value = doc?.[accessor]
                      }
                      const content = typeof col.render === 'function' ? col.render(value, doc) : (value != null ? value : '')
                      return (
                        <Td
                          key={id}
                          align={col.align || 'left'}
                          stickyRight={col.stickyRight || false}
                          className={col.stickyRight ? 'py-3' : ''}
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
      {!loading && sortedData.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={sortedData.length}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
    </>
  )
}
