import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import StatusBadge from './StatusBadge'
import EmptyState from './EmptyState'
import Pagination from './Pagination'
import DocumentRemarksModal from './DocumentRemarksModal'
import { usePreferences } from '../contexts/PreferencesContext'

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
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {t('tracking')}: {trackingId}
      </h2>
      
      {/* Progress Bar - Desktop */}
      <div className="hidden md:flex items-center gap-0.5">
        {stages.map((stage, index) => {
          const isActive = index <= currentIndex
          const isFirst = index === 0
          const isLast = index === stages.length - 1
          
          return (
            <div
              key={stage.id}
              className={`relative flex-1 h-12 flex items-center justify-center text-sm font-medium transition-all ${
                isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
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

      {/* Progress Bar - Mobile (Vertical) */}
      <div className="md:hidden space-y-2">
        {stages.map((stage, index) => {
          const isActive = index <= currentIndex
          
          return (
            <div
              key={stage.id}
              className={`p-3 rounded-lg text-sm font-medium transition-all ${
                isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}
            >
              {stage.label}
            </div>
          )
        })}
      </div>
    </div>
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

export default function MyDocumentsStatus() {
  const { itemsPerPage, t, formatDate } = usePreferences()
  const [documents, setDocuments] = useState([])
  const [filteredDocuments, setFilteredDocuments] = useState([])
  const [loading, setLoading] = useState(true)
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
    try {
      const res = await api.get('/documents/my-status')
      const docs = res.data.data?.documents || res.data.documents || []
      console.log('Loaded documents:', docs.length)
      console.log('Document statuses:', docs.map(d => ({ id: d.id, fileCode: d.fileCode, status: d.status, rawStatus: d.rawStatus })))
      setDocuments(docs)
      setFilteredDocuments(docs)
      
      // Auto-select first document
      if (docs.length > 0) {
        setCurrentTracking(docs[0].fileCode)
        setCurrentStage(mapStatusToStage(docs[0].status, docs[0].stage, docs[0].reviewedAt, docs[0].approvedAt, docs[0].publishedAt))
        setSelectedDocId(docs[0].id)
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
      // Mock data for demonstration
      const mockDocs = [
        {
          id: 1,
          fileCode: 'MoM01250821001',
          title: 'Minutes of Meeting - Q4 2024',
          version: '1.0',
          lastUpdated: '2024-11-15T00:00:00.000Z',
          status: 'Draft Saved'
        },
        {
          id: 2,
          fileCode: 'PP01250821001',
          title: 'Project Implementation Plan',
          version: '2.0',
          lastUpdated: '2024-11-17T00:00:00.000Z',
          status: 'Pending Review'
        },
        {
          id: 3,
          fileCode: 'PRA01250821001',
          title: 'System Requirements Analysis',
          version: '1.1',
          lastUpdated: '2024-11-10T00:00:00.000Z',
          status: 'Pending Approval'
        },
        {
          id: 4,
          fileCode: 'DD01250821001',
          title: 'Technical Design Document',
          version: '1.2',
          lastUpdated: '2024-11-18T00:00:00.000Z',
          status: 'Return for Amendments'
        },
        {
          id: 5,
          fileCode: 'SOP-QA-1124001',
          title: 'Quality Assurance Procedures',
          version: '3.0',
          lastUpdated: '2024-11-20T00:00:00.000Z',
          status: 'Published'
        },
        {
          id: 6,
          fileCode: 'POL-SEC-0924001',
          title: 'Security Policy Document',
          version: '2.1',
          lastUpdated: '2024-09-05T00:00:00.000Z',
          status: 'Superseded'
        }
      ]
      setDocuments(mockDocs)
      setFilteredDocuments(mockDocs)
      
      // Auto-select first document
      setCurrentTracking(mockDocs[0].fileCode)
      setCurrentStage(mapStatusToStage(mockDocs[0].status, null, null, null, null))
      setSelectedDocId(mockDocs[0].id)
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
        user: selectedDocDetails.owner,
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
        user: selectedDocDetails.owner,
        status: selectedDocDetails.reviewedAt ? 'completed' : 'pending'
      },
      {
        stage: 'Submitted for Approval',
        date: selectedDocDetails.reviewedAt,
        user: selectedDocDetails.owner,
        status: ['APPROVAL', 'FIRST_APPROVAL', 'SECOND_APPROVAL', 'READY_TO_PUBLISH'].includes(selectedDocDetails.stage) || selectedDocDetails.approvedAt || selectedDocDetails.firstApprovedAt ? 'completed' : 'pending'
      },
      {
        stage: 'First Approval',
        date: selectedDocDetails.firstApprovedAt,
        user: selectedDocDetails.owner,
        status: selectedDocDetails.firstApprovedAt ? 'completed' : (selectedDocDetails.stage === 'FIRST_APPROVAL' || selectedDocDetails.stage === 'Approval' ? 'pending' : null)
      },
      {
        stage: 'Second Approval',
        date: selectedDocDetails.secondApprovedAt,
        user: selectedDocDetails.owner,
        status: selectedDocDetails.secondApprovedAt ? 'completed' : (selectedDocDetails.stage === 'SECOND_APPROVAL' ? 'pending' : null)
      },
      {
        stage: 'Ready to Publish',
        date: null,
        user: selectedDocDetails.owner,
        status: selectedDocDetails.stage === 'READY_TO_PUBLISH' ? 'completed' : 'pending'
      },
      {
        stage: 'Published',
        date: selectedDocDetails.publishedAt,
        user: selectedDocDetails.owner,
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
      <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-300 ease-in-out overflow-y-auto z-50">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{t('doc_details')}</h3>
            <button
              onClick={() => setShowDetailsPanel(false)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Document Info */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('file_code')}</label>
              <p className="mt-1 text-sm font-medium text-gray-900">{selectedDocDetails.fileCode}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('title')}</label>
              <p className="mt-1 text-sm font-medium text-gray-900">{selectedDocDetails.title}</p>
            </div>
            {selectedDocDetails.description && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('description')}</label>
                <p className="mt-1 text-sm text-gray-600">{selectedDocDetails.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('version')}</label>
                <p className="mt-1 text-sm text-gray-900">{selectedDocDetails.version}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('status')}</label>
                <div className="mt-1">
                  <StatusBadge status={selectedDocDetails.status} />
                </div>
              </div>
            </div>
            {selectedDocDetails.status === 'Return for Amendments' && (
              <button
                onClick={() => handleViewRemarks(selectedDocDetails)}
                className="w-full mt-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                {t('view_remarks')}
              </button>
            )}
            {selectedDocDetails.documentType && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('document_type')}</label>
                <p className="mt-1 text-sm text-gray-900">{selectedDocDetails.documentType}</p>
              </div>
            )}
            {selectedDocDetails.projectCategory && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('project_category')}</label>
                <p className="mt-1 text-sm text-gray-900">{selectedDocDetails.projectCategory}</p>
              </div>
            )}
            {selectedDocDetails.owner && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('owner')}</label>
                <p className="mt-1 text-sm text-gray-900">{selectedDocDetails.owner}</p>
              </div>
            )}
            {selectedDocDetails.fileName && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('file_name')}</label>
                <p className="mt-1 text-sm text-gray-900">{selectedDocDetails.fileName}</p>
              </div>
            )}
            {selectedDocDetails.obsoleteReason && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('obsolete_reason')}</label>
                <p className="mt-1 text-sm text-gray-600">{selectedDocDetails.obsoleteReason}</p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">{t('workflow_history')}</h4>
            <div className="space-y-4">
              {workflowHistory.map((item, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      item.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {item.status === 'completed' ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      )}
                    </div>
                    {index < workflowHistory.length - 1 && (
                      <div className={`w-0.5 h-12 ${
                        item.status === 'completed' ? 'bg-green-200' : 'bg-gray-200'
                      }`}></div>
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className={`text-sm font-medium ${
                      item.status === 'completed' ? 'text-gray-900' : 'text-gray-500'
                    }`}>
                      {item.stage}
                    </p>
                    {item.date && (
                      <p className="text-xs text-gray-500 mt-1">{item.date}</p>
                    )}
                    {item.user && item.status === 'completed' && (
                      <p className="text-xs text-gray-600 mt-1">by {item.user}</p>
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
          className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
          onClick={() => setShowDetailsPanel(false)}
        />
      )}

      {/* Document Details Panel */}
      {showDetailsPanel && <DocumentDetailsPanel />}

      <div className="p-6 space-y-6">
        {/* Page Header */}
        <div className="card p-6">
          <h1 className="text-2xl font-bold text-gray-900">{t('my_docs_title')}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {t('my_docs_status_desc')}
          </p>
        </div>

        {/* Status Summary Cards */}
        {!loading && documents.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: t('status_pending_ack'), status: 'Pending Acknowledgment', color: 'yellow' },
              { label: t('status_draft'), status: 'Draft', color: 'gray' },
              { label: t('status_in_review'), status: 'Waiting for Review', color: 'blue' },
              { label: t('status_in_approval'), status: 'Waiting for Approval', color: 'purple' },
              { label: t('status_published'), status: 'Published', color: 'green' },
              { label: t('status_archived'), status: 'Obsolete', color: 'red' }
            ].map((item) => {
              const count = documents.filter(doc => {
                // Handle specific status matching
                if (item.status === 'Obsolete') {
                  return ['Obsolete', 'Superseded', 'Archived'].includes(doc.status)
                }
                if (item.status === 'Waiting for Review') {
                  return ['Waiting for Review', 'Pending Review', 'In Review', 'Return for Amendments'].includes(doc.status)
                }
                if (item.status === 'Waiting for Approval') {
                  return [
                    'Waiting for Approval', 'Pending Approval', 'In Approval',
                    'PENDING_FIRST_APPROVAL', 'IN_FIRST_APPROVAL', 'Pending First Approval', 'In First Approval',
                    'PENDING_SECOND_APPROVAL', 'IN_SECOND_APPROVAL', 'Pending Second Approval', 'In Second Approval',
                    'READY_TO_PUBLISH', 'Ready to Publish'
                  ].includes(doc.status)
                }
                if (item.status === 'Published') {
                  return ['Published', 'PUBLISHED', 'Approved'].includes(doc.status)
                }
                if (item.status === 'Draft') {
                  return ['Draft', 'Draft Saved', 'Acknowledged', 'Drafting'].includes(doc.status)
                }
                return doc.status === item.status
              }).length
              
              const colorClasses = {
                yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
                gray: 'bg-gray-50 text-gray-700 border-gray-200',
                blue: 'bg-blue-50 text-blue-700 border-blue-200',
                purple: 'bg-purple-50 text-purple-700 border-purple-200',
                green: 'bg-green-50 text-green-700 border-green-200',
                red: 'bg-red-50 text-red-700 border-red-200'
              }
              
              return (
                <button
                  key={item.status}
                  onClick={() => setStatusFilter(item.status)}
                  className={`card p-4 text-left border-2 transition-all hover:shadow-md ${
                    statusFilter === item.status ? colorClasses[item.color] : 'border-transparent'
                  }`}
                >
                  <div className="text-2xl font-bold text-gray-900">{count}</div>
                  <div className="text-xs text-gray-600 mt-1">{item.label}</div>
                </button>
              )
            })}
          </div>
        )}

      {/* Progress Tracker */}
      {currentTracking ? (
        <ProgressTracker currentStage={currentStage} trackingId={currentTracking} />
      ) : (
        <div className="card p-6">
          <div className="text-center py-8 text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="font-medium text-gray-700">{t('select_doc_track')}</p>
            <p className="text-sm mt-1">{t('click_doc_view')}</p>
          </div>
        </div>
      )}

      {/* Current Document Status */}
      <div className="card p-6">
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{t('current_doc_status')}</h2>
              <p className="text-sm text-gray-600 mt-1">
                {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''} found
              </p>
            </div>
            
            {/* Actions */}
            <div className="flex gap-2">
              <button 
                onClick={loadDocuments}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Refresh documents list"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t('refresh')}
                </span>
              </button>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder={t('search_docs_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white min-w-[200px]"
            >
              {allStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('file_code')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('title')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('project_category')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('version')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('last_updated')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('status')}</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span>{t('loading_docs')}</span>
                    </div>
                  </td>
                </tr>
              ) : currentDocuments.length === 0 ? (
                <tr>
                  <td colSpan="7">
                    <EmptyState 
                      message={t('no_docs_found')} 
                      description={
                        searchQuery || statusFilter !== 'All' 
                          ? t('try_adjusting') 
                          : t('no_docs_yet')
                      }
                      actionLabel={searchQuery ? t('clear_search') : (statusFilter !== 'All' ? t('clear_filter') : null)}
                      onAction={
                        searchQuery 
                          ? () => setSearchQuery('') 
                          : (statusFilter !== 'All' ? () => setStatusFilter('All') : null)
                      }
                    />
                  </td>
                </tr>
              ) : (
                currentDocuments.map((doc) => (
                  <tr 
                    key={doc.id} 
                    onClick={() => handleDocumentClick(doc)}
                    className={`border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer ${
                      selectedDocId === doc.id ? 'bg-blue-50 ring-2 ring-blue-200' : ''
                    }`}
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        {selectedDocId === doc.id && (
                          <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                        <span className={`font-medium ${
                          selectedDocId === doc.id ? 'text-blue-600' : 'text-gray-900'
                        }`}>
                          {(doc.rawStatus === 'PENDING_ACKNOWLEDGMENT' || (doc.fileCode && doc.fileCode.startsWith('PENDING-'))) ? '-' : doc.fileCode}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700">{doc.title}</td>
                    <td className="py-4 px-4 text-gray-700">{doc.projectCategory || '-'}</td>
                    <td className="py-4 px-4 text-gray-700">{doc.version}</td>
                    <td className="py-4 px-4 text-gray-700">{formatDate(doc.updatedAt || doc.lastUpdated)}</td>
                    <td className="py-4 px-4">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDocumentClick(doc)
                        }}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm px-3 py-1 rounded hover:bg-blue-50 transition-colors"
                      >
                        {t('view_details')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span>{t('loading_docs')}</span>
              </div>
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
              <div 
                key={doc.id} 
                onClick={() => handleDocumentClick(doc)}
                className={`border rounded-lg p-4 space-y-3 cursor-pointer transition-all ${
                  selectedDocId === doc.id 
                    ? 'border-blue-500 bg-blue-50 shadow-md' 
                    : 'border-gray-200 hover:border-blue-300 hover:shadow'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {selectedDocId === doc.id && (
                        <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                      <span className={`font-semibold ${
                        selectedDocId === doc.id ? 'text-blue-600' : 'text-gray-900'
                      }`}>
                        {(doc.rawStatus === 'PENDING_ACKNOWLEDGMENT' || (doc.fileCode && doc.fileCode.startsWith('PENDING-'))) ? '-' : doc.fileCode}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">{doc.title}</div>
                  </div>
                  <StatusBadge status={doc.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">{t('version')}:</span>
                    <div className="text-gray-900 font-medium">{doc.version}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('last_updated')}:</span>
                    <div className="text-gray-900 font-medium">{doc.lastUpdated}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

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
