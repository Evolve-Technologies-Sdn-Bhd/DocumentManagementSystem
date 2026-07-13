import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import StatusBadge from './StatusBadge'
import EmptyState from './EmptyState'
import Pagination from './Pagination'
import DocumentRemarksModal from './DocumentRemarksModal'
import { usePreferences } from '../contexts/PreferencesContext'
import PageHeader from './ui/PageHeader'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import IconButton from './ui/IconButton'
import TextInput from './ui/TextInput'
import SelectField from './ui/SelectField'
import InlineSpinner from './ui/InlineSpinner'
import EmptyPanelState from './ui/EmptyPanelState'
import { TableContainer, Table, Th, Td, Tr } from './ui/Table'

// Progress Tracker Component
function ProgressTracker({ currentStage, trackingId }) {
  const { t } = usePreferences()
  const stages = [
    { id: 'ndr', label: 'NDR' },
    { id: 'draft', label: 'Draft' },
    { id: 'review', label: 'Review' },
    { id: 'approval', label: 'Approval' },
    { id: 'publish', label: 'Published' },
    { id: 'superseded', label: 'Archived' }
  ]

  const currentIndex = stages.findIndex(s => s.id === currentStage)

  return (
    <AppSurface padding="lg" className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">
        {t('tracking')}: {trackingId}
      </h2>

      <div className="hidden md:flex items-center gap-0.5 overflow-x-auto">
        {stages.map((stage, index) => {
          const isActive = index <= currentIndex
          const isFirst = index === 0
          const isLast = index === stages.length - 1

          return (
            <div
              key={stage.id}
              className={`relative flex-1 h-12 flex items-center justify-center text-sm font-medium transition-all ${
                isActive ? 'bg-brand text-ink-inverse' : 'bg-surface-muted text-ink-muted'
              } ${
                isFirst ? 'rounded-l-lg' : ''
              } ${
                isLast ? 'rounded-r-lg' : !isLast ? 'clip-arrow-right' : ''
              } ${
                !isFirst ? 'clip-arrow-left' : ''
              }`}
              style={{ minWidth: isLast ? '180px' : '120px' }}
            >
              <span className="px-2 text-center">{stage.label}</span>
            </div>
          )
        })}
      </div>

      <div className="md:hidden space-y-2">
        {stages.map((stage, index) => {
          const isActive = index <= currentIndex

          return (
            <div
              key={stage.id}
              className={`rounded-2xl p-3 text-sm font-medium transition-all ${
                isActive ? 'bg-brand text-ink-inverse' : 'bg-surface-muted text-ink-muted'
              }`}
            >
              {stage.label}
            </div>
          )
        })}
      </div>
    </AppSurface>
  )
}


// Helper function to map document status to workflow stage
const mapStatusToStage = (status, stage, reviewedAt, approvedAt, publishedAt) => {
  // First try direct status mapping
  const statusMap = {
    'Pending Acknowledgment': 'ndr',
    'Acknowledged': 'draft',
    'Draft': 'draft',
    'Draft Saved': 'draft',
    'Waiting for Review': 'review',
    'Pending Review': 'review',
    'In Review': 'review',
    'Return for Amendments': 'review',
    'Waiting for Approval': 'approval',
    'Pending Approval': 'approval',
    'In Approval': 'approval',
    'In Process': 'approval', // Generic in-process status
    'PENDING_FIRST_APPROVAL': 'approval',
    'IN_FIRST_APPROVAL': 'approval',
    'Pending First Approval': 'approval',
    'In First Approval': 'approval',
    'PENDING_SECOND_APPROVAL': 'approval',
    'IN_SECOND_APPROVAL': 'approval',
    'Pending Second Approval': 'approval',
    'In Second Approval': 'approval',
    'READY_TO_PUBLISH': 'approval',
    'Ready to Publish': 'approval',
    'Approved': 'approval',
    'Published': 'publish',
    'PUBLISHED': 'publish',
    'Superseded': 'superseded',
    'Obsolete': 'superseded',
    'Archived': 'superseded',
    'Rejected': 'review'
  }
  
  if (statusMap[status]) {
    return statusMap[status]
  }
  
  // Fallback: determine stage based on workflow completion dates
  if (publishedAt) return 'publish'
  if (approvedAt) return 'publish'
  if (reviewedAt) return 'approval'
  if (stage === 'FIRST_APPROVAL' || stage === 'SECOND_APPROVAL' || stage === 'READY_TO_PUBLISH') return 'approval'
  if (stage === 'REVIEW') return 'review'
  
  return 'draft'
}

const summaryCards = (t) => [
  { label: t('status_pending_ack'), status: 'Pending Acknowledgment', tone: 'warning' },
  { label: t('status_draft'), status: 'Draft', tone: 'neutral' },
  { label: t('status_in_review'), status: 'Waiting for Review', tone: 'info' },
  { label: t('status_in_approval'), status: 'Waiting for Approval', tone: 'brand' },
  { label: t('status_published'), status: 'Published', tone: 'success' },
  { label: t('status_archived'), status: 'Obsolete', tone: 'danger' }
]

const summaryToneClassMap = {
  warning: 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)] border-[var(--dms-color-border-default)]',
  neutral: 'bg-surface-muted text-ink-secondary border-border',
  info: 'bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)] border-[var(--dms-color-border-default)]',
  brand: 'bg-brand/10 text-brand border-brand/20',
  success: 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)] border-[var(--dms-color-border-default)]',
  danger: 'bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)] border-[var(--dms-color-border-default)]'
}

const getDisplayFileCode = (doc) => (
  doc.rawStatus === 'PENDING_ACKNOWLEDGMENT' || (doc.fileCode && doc.fileCode.startsWith('PENDING-'))
    ? '-'
    : doc.fileCode
)

export default function MyDocumentsStatus() {
  const { itemsPerPage, t, formatDate } = usePreferences()
  const [documents, setDocuments] = useState([])
  const [filteredDocuments, setFilteredDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [currentTracking, setCurrentTracking] = useState(null)
  const [currentStage, setCurrentStage] = useState('draft')
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [selectedDocDetails, setSelectedDocDetails] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [showDetailsPanel, setShowDetailsPanel] = useState(false)
  const [remarksModalOpen, setRemarksModalOpen] = useState(false)
  const [remarksLoading, setRemarksLoading] = useState(false)
  const [remarksDocument, setRemarksDocument] = useState(null)
  const [remarks, setRemarks] = useState([])

  // Update page size when preference changes
  useEffect(() => {
    setPageSize(itemsPerPage)
  }, [itemsPerPage])

  useEffect(() => {
    loadDocuments()
  }, [])

  const matchesStatusFilter = (doc, filterValue) => {
    if (filterValue === 'All') return true
    const status = doc.status
    if (filterValue === 'Obsolete') {
      return ['Obsolete', 'Superseded', 'Archived'].includes(status)
    }
    if (filterValue === 'Waiting for Review') {
      return ['Waiting for Review', 'Pending Review', 'In Review', 'Return for Amendments'].includes(status)
    }
    if (filterValue === 'Waiting for Approval') {
      return [
        'Waiting for Approval', 'Pending Approval', 'In Approval',
        'PENDING_FIRST_APPROVAL', 'IN_FIRST_APPROVAL', 'Pending First Approval', 'In First Approval',
        'PENDING_SECOND_APPROVAL', 'IN_SECOND_APPROVAL', 'Pending Second Approval', 'In Second Approval',
        'READY_TO_PUBLISH', 'Ready to Publish'
      ].includes(status)
    }
    if (filterValue === 'Published') {
      return ['Published', 'PUBLISHED', 'Approved'].includes(status)
    }
    if (filterValue === 'Draft') {
      return ['Draft', 'Draft Saved', 'Acknowledged', 'Drafting'].includes(status)
    }
    return status === filterValue
  }

  // Filter and search documents
  useEffect(() => {
    let filtered = documents

    // Apply status filter
    if (statusFilter !== 'All') {
      filtered = filtered.filter(doc => matchesStatusFilter(doc, statusFilter))
    }

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(doc =>
        doc.fileCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredDocuments(filtered)
    setCurrentPage(1) // Reset to first page when filtering
  }, [documents, statusFilter, searchQuery])

  const loadDocuments = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await api.get('/documents/my-status', {
        params: { limit: 0 }
      })
      const docs = res.data.data?.documents || res.data.documents || []
      setDocuments(docs)
      setFilteredDocuments(docs)

      if (docs.length > 0) {
        setCurrentTracking(docs[0].fileCode)
        setCurrentStage(mapStatusToStage(docs[0].status, docs[0].stage, docs[0].reviewedAt, docs[0].approvedAt, docs[0].publishedAt))
        setSelectedDocId(docs[0].id)
      } else {
        setCurrentTracking(null)
        setSelectedDocId(null)
        setShowDetailsPanel(false)
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
      setLoadError(t('failed_load_docs') || 'Failed to load documents.')
      setDocuments([])
      setFilteredDocuments([])
      setCurrentTracking(null)
      setSelectedDocId(null)
      setShowDetailsPanel(false)
    } finally {
      setLoading(false)
    }
  }

  // Get unique statuses for filter
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
    setCurrentPage(1) // Reset to first page when changing page size
  }

  // Handle document click to update tracking
  const handleDocumentClick = (doc) => {
    setCurrentTracking(doc.fileCode)
    setCurrentStage(mapStatusToStage(doc.status, doc.stage, doc.reviewedAt, doc.approvedAt, doc.publishedAt))
    setSelectedDocId(doc.id)
    setSelectedDocDetails(doc)
    setShowDetailsPanel(true)
  }

  const handleViewRemarks = async (doc) => {
    if (!doc?.id) return
    setRemarksDocument(doc)
    setRemarks([])
    setRemarksLoading(true)
    setRemarksModalOpen(true)
    try {
      const res = await api.get(`/documents/${doc.id}/remarks?action=RETURNED`)
      const items = res.data?.data?.remarks || res.data?.remarks || []
      setRemarks(Array.isArray(items) ? items : [])
    } catch (error) {
      console.error('Failed to load remarks:', error)
      setRemarks([])
    } finally {
      setRemarksLoading(false)
    }
  }

  // Document Details Panel Component
  const DocumentDetailsPanel = () => {
    if (!selectedDocDetails) return null

    const readyToPublishBy =
      selectedDocDetails.secondApprovedBy ||
      selectedDocDetails.firstApprovedBy ||
      selectedDocDetails.secondApprover ||
      selectedDocDetails.firstApprover ||
      selectedDocDetails.reviewedBy ||
      selectedDocDetails.reviewer

    const workflowHistory = [
      {
        stage: 'Created',
        date: selectedDocDetails.createdAt,
        user: selectedDocDetails.createdBy,
        status: 'completed'
      },
      {
        stage: 'Submitted for Acknowledgment',
        date: selectedDocDetails.submittedAt,
        user: selectedDocDetails.owner,
        status: selectedDocDetails.submittedAt ? 'completed' : 'pending'
      },
      {
        stage: 'Acknowledged',
        date: selectedDocDetails.acknowledgedAt,
        user: selectedDocDetails.acknowledgedBy || selectedDocDetails.owner,
        status: selectedDocDetails.acknowledgedAt ? 'completed' : 'pending'
      },
      {
        stage: 'Submitted for Review',
        date: selectedDocDetails.submittedAt && selectedDocDetails.acknowledgedAt ? selectedDocDetails.submittedAt : null,
        user: selectedDocDetails.owner,
        status: selectedDocDetails.stage === 'REVIEW' || selectedDocDetails.reviewedAt ? 'completed' : 'pending'
      },
      {
        stage: 'Reviewed',
        date: selectedDocDetails.reviewedAt,
        user: selectedDocDetails.reviewedBy || selectedDocDetails.reviewer,
        status: selectedDocDetails.reviewedAt ? 'completed' : 'pending'
      },
      {
        stage: 'Submitted for Approval',
        date: selectedDocDetails.reviewedAt,
        user: selectedDocDetails.reviewedBy || selectedDocDetails.reviewer,
        status: ['APPROVAL', 'FIRST_APPROVAL', 'SECOND_APPROVAL', 'READY_TO_PUBLISH', 'PUBLISHED'].includes(selectedDocDetails.stage) || selectedDocDetails.firstApprovedAt || selectedDocDetails.secondApprovedAt || selectedDocDetails.publishedAt ? 'completed' : 'pending'
      },
      {
        stage: 'First Approval',
        date: selectedDocDetails.firstApprovedAt,
        user: selectedDocDetails.firstApprovedBy || selectedDocDetails.firstApprover,
        status: selectedDocDetails.firstApprovedAt ? 'completed' : (selectedDocDetails.stage === 'FIRST_APPROVAL' || selectedDocDetails.stage === 'Approval' ? 'pending' : null)
      },
      {
        stage: 'Second Approval',
        date: selectedDocDetails.secondApprovedAt,
        user: selectedDocDetails.secondApprovedBy || selectedDocDetails.secondApprover,
        status: selectedDocDetails.secondApprovedAt ? 'completed' : (selectedDocDetails.stage === 'SECOND_APPROVAL' ? 'pending' : null)
      },
      {
        stage: 'Ready to Publish',
        date: null,
        user: readyToPublishBy,
        status: ['READY_TO_PUBLISH', 'PUBLISHED'].includes(selectedDocDetails.stage) ? 'completed' : 'pending'
      },
      {
        stage: 'Published',
        date: selectedDocDetails.publishedAt,
        user: selectedDocDetails.publishedBy,
        status: selectedDocDetails.publishedAt ? 'completed' : 'pending'
      }
    ].filter(item => item.date || item.status === 'completed' || selectedDocDetails.rawStatus !== 'DRAFT')

    // Add obsolete/archived info if applicable
    if (selectedDocDetails.rawStatus === 'OBSOLETE' || selectedDocDetails.rawStatus === 'SUPERSEDED' || selectedDocDetails.rawStatus === 'ARCHIVED') {
      workflowHistory.push({
        stage: selectedDocDetails.rawStatus === 'SUPERSEDED' ? 'Superseded' : selectedDocDetails.rawStatus === 'OBSOLETE' ? 'Obsolete' : 'Archived',
        date: selectedDocDetails.obsoleteDate,
        user: selectedDocDetails.owner,
        status: 'completed'
      })
    }

    return (
      <div className="fixed inset-y-0 right-0 z-50 w-full transform overflow-y-auto border-l border-border bg-surface shadow-dms-lg transition-transform duration-300 ease-in-out sm:w-96">
        <div className="sticky top-0 border-b border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-ink">{t('doc_details')}</h3>
            <IconButton
              onClick={() => setShowDetailsPanel(false)}
              size="sm"
              aria-label="Close details"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </IconButton>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Document Info */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('file_code')}</label>
              <p className="mt-1 text-sm font-semibold text-ink">{getDisplayFileCode(selectedDocDetails)}</p>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('title')}</label>
              <p className="mt-1 text-sm font-semibold text-ink">{selectedDocDetails.title}</p>
            </div>
            {selectedDocDetails.description && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('description')}</label>
                <p className="mt-1 text-sm text-ink-secondary">{selectedDocDetails.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('version')}</label>
                <p className="mt-1 text-sm text-ink">{selectedDocDetails.version}</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('status')}</label>
                <div className="mt-1">
                  <StatusBadge status={selectedDocDetails.status} />
                </div>
              </div>
            </div>
            {selectedDocDetails.status === 'Return for Amendments' && (
              <Button
                onClick={() => handleViewRemarks(selectedDocDetails)}
                variant="secondary"
                className="w-full mt-2"
              >
                {t('view_remarks')}
              </Button>
            )}
            {selectedDocDetails.documentType && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('document_type')}</label>
                <p className="mt-1 text-sm text-ink">{selectedDocDetails.documentType}</p>
              </div>
            )}
            {selectedDocDetails.projectCategory && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('project_category')}</label>
                <p className="mt-1 text-sm text-ink">{selectedDocDetails.projectCategory}</p>
              </div>
            )}
            {selectedDocDetails.owner && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('owner')}</label>
                <p className="mt-1 text-sm text-ink">{selectedDocDetails.owner}</p>
              </div>
            )}
            {selectedDocDetails.fileName && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('file_name')}</label>
                <p className="mt-1 text-sm text-ink">{selectedDocDetails.fileName}</p>
              </div>
            )}
            {selectedDocDetails.obsoleteReason && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('obsolete_reason')}</label>
                <p className="mt-1 text-sm text-ink-secondary">{selectedDocDetails.obsoleteReason}</p>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-6">
            <h4 className="mb-4 text-sm font-semibold text-ink">{t('workflow_history')}</h4>
            <div className="space-y-4">
              {workflowHistory.map((item, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      item.status === 'completed'
                        ? 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]'
                        : 'bg-surface-muted text-ink-soft'
                    }`}>
                      {item.status === 'completed' ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-ink-soft"></div>
                      )}
                    </div>
                    {index < workflowHistory.length - 1 && (
                      <div className={`w-0.5 h-12 ${
                        item.status === 'completed'
                          ? 'bg-[var(--dms-color-success-soft)]'
                          : 'bg-border'
                      }`}></div>
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className={`text-sm font-medium ${
                      item.status === 'completed' ? 'text-ink' : 'text-ink-muted'
                    }`}>
                      {item.stage}
                    </p>
                    {item.date && (
                      <p className="mt-1 text-xs text-ink-soft">{formatDate(item.date)}</p>
                    )}
                    {item.user && item.status === 'completed' && (
                      <p className="mt-1 text-xs text-ink-muted">by {item.user}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <DocumentRemarksModal
        isOpen={remarksModalOpen}
        document={remarksDocument}
        remarks={remarks}
        loading={remarksLoading}
        onClose={() => {
          setRemarksModalOpen(false)
          setRemarksDocument(null)
          setRemarks([])
          setRemarksLoading(false)
        }}
      />

      {/* Overlay when details panel is open */}
      {showDetailsPanel && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={() => setShowDetailsPanel(false)}
        />
      )}

      {/* Document Details Panel */}
      {showDetailsPanel && <DocumentDetailsPanel />}

      <div className="space-y-6" data-tour-id="my-docs-page">
        <PageHeader
          title={t('my_docs_title')}
          subtitle={t('my_docs_status_desc')}
        />

        {loadError && (
          <AppSurface
            padding="md"
            className="border-[var(--dms-color-border-default)] bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]"
          >
            {loadError}
          </AppSurface>
        )}

        {!loading && documents.length > 0 && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {summaryCards(t).map((item) => {
              const count = documents.filter((doc) => matchesStatusFilter(doc, item.status)).length
              const isActive = statusFilter === item.status

              return (
                <AppSurface
                  key={item.status}
                  as="button"
                  type="button"
                  onClick={() => setStatusFilter(item.status)}
                  padding="md"
                  className={[
                    'text-left transition-all',
                    isActive ? summaryToneClassMap[item.tone] : 'border-border hover:border-brand/20 hover:bg-surface-muted'
                  ].join(' ')}
                >
                  <div className="text-2xl font-semibold text-ink">{count}</div>
                  <div className="mt-1 text-xs text-ink-muted">{item.label}</div>
                </AppSurface>
              )
            })}
          </div>
        )}

        {currentTracking ? (
          <ProgressTracker currentStage={currentStage} trackingId={currentTracking} />
        ) : (
          <AppSurface padding="lg">
            <EmptyPanelState
              title={t('select_doc_track')}
              description={t('click_doc_view')}
            />
          </AppSurface>
        )}

        <AppSurface padding="lg" className="space-y-6" data-tour-id="my-docs-list-card">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">{t('current_doc_status')}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''} found
              </p>
            </div>
            <Button variant="secondary" onClick={loadDocuments} title="Refresh documents list">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('refresh')}
            </Button>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft transition-colors hover:text-ink"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <SelectField
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="md:w-64"
            >
              {allStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </SelectField>
          </div>

          <div className="hidden md:block">
            <TableContainer>
              <Table>
                <thead>
                  <tr>
                    <Th>{t('file_code')}</Th>
                    <Th>{t('title')}</Th>
                    <Th>{t('project_category')}</Th>
                    <Th>{t('version')}</Th>
                    <Th>{t('last_updated')}</Th>
                    <Th>{t('status')}</Th>
                    <Th align="center">{t('actions')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-10">
                        <div className="flex items-center justify-center gap-2 text-sm text-ink-muted">
                          <InlineSpinner />
                          <span>{t('loading_docs')}</span>
                        </div>
                      </td>
                    </tr>
                  ) : currentDocuments.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-4">
                        <EmptyState
                          message={t('no_docs_found')}
                          description={searchQuery || statusFilter !== 'All' ? t('try_adjusting') : t('no_docs_yet')}
                          actionLabel={searchQuery ? t('clear_search') : (statusFilter !== 'All' ? t('clear_filter') : null)}
                          onAction={searchQuery ? () => setSearchQuery('') : (statusFilter !== 'All' ? () => setStatusFilter('All') : null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    currentDocuments.map((doc) => (
                      <Tr
                        key={doc.id}
                        onClick={() => handleDocumentClick(doc)}
                        className={selectedDocId === doc.id ? 'bg-brand/5' : 'cursor-pointer'}
                      >
                        <Td>
                          <div className="flex items-center gap-2">
                            {selectedDocId === doc.id && (
                              <svg className="h-4 w-4 text-brand" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            )}
                            <span className={selectedDocId === doc.id ? 'font-semibold text-brand' : 'font-medium text-ink'}>
                              {getDisplayFileCode(doc)}
                            </span>
                          </div>
                        </Td>
                        <Td className="text-ink-secondary">{doc.title}</Td>
                        <Td>{doc.projectCategory || '-'}</Td>
                        <Td>{doc.version}</Td>
                        <Td>{formatDate(doc.updatedAt || doc.lastUpdated)}</Td>
                        <Td><StatusBadge status={doc.status} /></Td>
                        <Td align="center">
                          <Button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDocumentClick(doc)
                            }}
                            variant="ghost"
                            size="sm"
                          >
                            {t('view_details')}
                          </Button>
                        </Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableContainer>
          </div>

          <div className="space-y-4 md:hidden">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
                <InlineSpinner />
                <span>{t('loading_docs')}</span>
              </div>
            ) : currentDocuments.length === 0 ? (
              <EmptyState
                message={t('no_docs_found')}
                description={searchQuery || statusFilter !== 'All' ? t('try_adjusting') : t('no_docs_yet')}
                actionLabel={searchQuery ? t('clear_search') : null}
                onAction={searchQuery ? () => setSearchQuery('') : null}
              />
            ) : (
              currentDocuments.map((doc) => (
                <AppSurface
                  key={doc.id}
                  variant="muted"
                  padding="md"
                  onClick={() => handleDocumentClick(doc)}
                  className={[
                    'cursor-pointer space-y-3 transition-all',
                    selectedDocId === doc.id ? 'border-brand/30 bg-brand/5 shadow-dms-soft' : 'hover:border-brand/20'
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {selectedDocId === doc.id && (
                          <svg className="h-4 w-4 shrink-0 text-brand" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                        <span className={selectedDocId === doc.id ? 'font-semibold text-brand' : 'font-semibold text-ink'}>
                          {getDisplayFileCode(doc)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-ink-muted">{doc.title}</div>
                    </div>
                    <StatusBadge status={doc.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-ink-soft">{t('version')}:</span>
                      <div className="font-medium text-ink">{doc.version}</div>
                    </div>
                    <div>
                      <span className="text-ink-soft">{t('last_updated')}:</span>
                      <div className="font-medium text-ink">{formatDate(doc.updatedAt || doc.lastUpdated)}</div>
                    </div>
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
