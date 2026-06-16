import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import NewDraftModal from './NewDraftModal'
import ReuploadFileModal from './ReuploadFileModal'
import DocumentRemarksModal from './DocumentRemarksModal'
import StatusBadge from './StatusBadge'
import ActionMenu from './ActionMenu'
import EmptyState from './EmptyState'
import Pagination from './Pagination'
import { PermissionGate } from './PermissionGate'
import { hasPermission } from '../utils/permissions'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import { usePreferences } from '../contexts/PreferencesContext'

export default function DraftDocuments() {
  const { itemsPerPage, formatDate, formatDateTime, defaultView, t } = usePreferences()
  const [documents, setDocuments] = useState([])
  const [filteredDocuments, setFilteredDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [viewMode, setViewMode] = useState(defaultView) // 'list' or 'grid'
  const [showModal, setShowModal] = useState(false)
  const [showReuploadModal, setShowReuploadModal] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [remarksModalOpen, setRemarksModalOpen] = useState(false)
  const [remarksLoading, setRemarksLoading] = useState(false)
  const [remarksDocument, setRemarksDocument] = useState(null)
  const [remarks, setRemarks] = useState([])
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })

  useEffect(() => {
    loadDocuments()
  }, [])

  // Filter and search documents
  useEffect(() => {
    let filtered = documents

    // Apply status filter
    if (statusFilter !== 'All') {
      filtered = filtered.filter(doc => doc.status === statusFilter)
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
  }, [documents, statusFilter, searchQuery])

  const loadDocuments = async () => {
    try {
      const res = await api.get('/documents/drafts')
      const rawDocs = res.data.data || []
      
      // Transform data to match frontend format
      const docs = rawDocs.map(doc => {
        // Handle createdBy - could be string (from controller) or object (from raw API)
        let createdByName = 'Unknown'
        if (typeof doc.createdBy === 'string' && doc.createdBy) {
          createdByName = doc.createdBy
        } else if (doc.createdBy && typeof doc.createdBy === 'object') {
          createdByName = `${doc.createdBy.firstName || ''} ${doc.createdBy.lastName || ''}`.trim() || doc.createdBy.email || 'Unknown'
        } else if (typeof doc.owner === 'string' && doc.owner) {
          createdByName = doc.owner
        } else if (doc.owner && typeof doc.owner === 'object') {
          createdByName = `${doc.owner.firstName || ''} ${doc.owner.lastName || ''}`.trim() || doc.owner.email || 'Unknown'
        }
        
        return {
          id: doc.id,
          fileCode: doc.fileCode,
          title: doc.title,
          version: doc.version || '1.0',
          createdBy: createdByName,
          lastUpdated: doc.updatedAt 
            ? formatDate(doc.updatedAt)
            : formatDate(new Date()),
          status: doc.status,
          latestReturnRemark: doc.latestReturnRemark || null,
          latestReturnRemarkAt: doc.latestReturnRemarkAt || null,
          latestReturnRemarkBy: doc.latestReturnRemarkBy || null,
          hasFile: doc.hasFile || false,
          hasReviewers: false, // Will be populated from API
          reviewerIds: [] // Will be populated from API
        }
      })
      
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
    setCurrentPage(1)
  }

  const handleDelete = async (doc) => {
    setConfirmModal({
      show: true,
      title: 'Confirm Delete',
      message: `Are you sure you want to delete "${doc.title}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/documents/${doc.id}`)
          setAlertModal({ show: true, title: 'Success', message: `"${doc.title}" has been deleted successfully`, type: 'success' })
          await loadDocuments()
        } catch (error) {
          console.error('Failed to delete document:', error)
          setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to delete document. Please try again.', type: 'error' })
        }
      }
    })
  }

  const handleReupload = (doc) => {
    setSelectedDocument(doc)
    setShowReuploadModal(true)
  }

  const formatLatestRemarkMeta = (doc) => {
    const parts = []
    if (doc?.latestReturnRemarkBy) parts.push(doc.latestReturnRemarkBy)
    if (doc?.latestReturnRemarkAt) parts.push(formatDateTime(doc.latestReturnRemarkAt))
    return parts.length > 0 ? ` (${parts.join(', ')})` : ''
  }

  const normalizeRemarkSnippet = (v) => String(v || '').replace(/\s+/g, ' ').trim()

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
      setAlertModal({
        show: true,
        title: t('failed_load_doc'),
        message: error.response?.data?.message || t('failed_load_doc'),
        type: 'error'
      })
    } finally {
      setRemarksLoading(false)
    }
  }

  const handleNewDraftSubmit = async (formData, type) => {
    try {
      setLoading(true)
      
      if (type === 'review') {
        // Submit for review: create document, upload file, assign reviewers, submit
        const response = await api.post('/documents/drafts/submit-for-review', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
        
        setAlertModal({ show: true, title: 'Success', message: 'Document submitted for review successfully!', type: 'success' })
        setShowModal(false)
        await loadDocuments()
      } else {
        // Save as draft
        const response = await api.post('/documents/drafts', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
        
        setAlertModal({ show: true, title: 'Success', message: 'Draft saved successfully!', type: 'success' })
        setShowModal(false)
        await loadDocuments()
      }
    } catch (error) {
      console.error('Failed to submit draft:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to submit draft document', type: 'error' })
    } finally {
      setLoading(false)
    }
  }


  return (
    <>
      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false })}
      />
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false })}
      />
      
      <NewDraftModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)}
        onSubmit={handleNewDraftSubmit}
      />
      
      <ReuploadFileModal
        isOpen={showReuploadModal}
        onClose={() => setShowReuploadModal(false)}
        document={selectedDocument}
        onSuccess={loadDocuments}
      />

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
      
      <div className="p-6 space-y-6" data-tour-id="drafts-page">
      {/* Page Header */}
      <div className="card p-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('draft_documents')}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {t('draft_docs_desc')}
        </p>
      </div>

      {/* Document List */}
      <div className="card p-6" data-tour-id="drafts-list-card">
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{t('draft_docs_list')}</h2>
              <p className="text-sm text-gray-600 mt-1">
                {filteredDocuments.length} {t('documents_found')}
              </p>
            </div>
            
            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <PermissionGate module="documents.draft" action="create">
                <button 
                  onClick={() => setShowModal(true)}
                  data-tour-id="drafts-btn-new-draft"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('new_draft')}
                  </span>
                </button>
              </PermissionGate>
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

            {/* View Toggle */}
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 flex items-center gap-1 text-sm ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                title="List View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 flex items-center gap-1 text-sm ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                title="Grid View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Table (List View) */}
        {viewMode === 'list' && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('file_code')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('document_title_col')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('version')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('created_by')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('last_updated')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('status')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span>{t('loading_documents')}</span>
                    </div>
                  </td>
                </tr>
              ) : currentDocuments.length === 0 ? (
                <tr>
                  <td colSpan="7">
                    <EmptyState 
                      message={t('no_draft_docs')} 
                      description={searchQuery || statusFilter !== 'All' ? t('adjust_filters') : t('start_creating_draft')}
                      actionLabel={searchQuery ? t('clear_search') : (hasPermission('documents.draft', 'create') ? t('new_draft') : null)}
                      onAction={searchQuery ? () => setSearchQuery('') : (hasPermission('documents.draft', 'create') ? () => setShowModal(true) : null)}
                    />
                  </td>
                </tr>
              ) : (
                currentDocuments.map((doc) => (
                  <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4">
                      <a href="#" className="text-gray-900 font-medium hover:text-blue-600">
                        {doc.fileCode}
                      </a>
                    </td>
                    <td className="py-4 px-4 text-gray-700">{doc.title}</td>
                    <td className="py-4 px-4 text-gray-700">{doc.version}</td>
                    <td className="py-4 px-4 text-gray-700">{doc.createdBy}</td>
                    <td className="py-4 px-4 text-gray-700">{doc.lastUpdated}</td>
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        <StatusBadge status={doc.status} />
                        {doc.latestReturnRemark && doc.status === 'Return for Amendments' ? (
                          <button
                            onClick={() => handleViewRemarks(doc)}
                            className="block max-w-[240px] text-left text-xs text-blue-700 hover:text-blue-800 underline underline-offset-2 truncate"
                            title={`${t('latest_remark')}${formatLatestRemarkMeta(doc)}: ${doc.latestReturnRemark}`}
                          >
                            {t('latest_remark')}
                            {formatLatestRemarkMeta(doc)}: {normalizeRemarkSnippet(doc.latestReturnRemark)}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <ActionMenu
                        actions={[
                          ...(doc.status === 'Return for Amendments'
                            ? [{ label: t('view_remarks'), onClick: () => handleViewRemarks(doc) }]
                            : []
                          ),
                          ...(doc.status === 'Return for Amendments' && hasPermission('documents.draft', 'update')
                            ? [
                          { label: t('reupload_file'), onClick: () => handleReupload(doc) }
                              ]
                            : []
                          ),
                          ...(hasPermission('documents.draft', 'delete')
                            ? [
                                { label: t('delete'), onClick: () => handleDelete(doc), variant: 'destructive' }
                              ]
                            : []
                          )
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && (
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading ? (
            <div className="col-span-full text-center py-8 text-gray-500">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span>{t('loading_documents')}</span>
              </div>
            </div>
          ) : currentDocuments.length === 0 ? (
            <div className="col-span-full">
              <EmptyState 
                message={t('no_draft_docs')} 
                description={searchQuery || statusFilter !== 'All' ? t('adjust_filters') : t('start_creating_draft')}
                actionLabel={searchQuery ? t('clear_search') : (hasPermission('documents.draft', 'create') ? t('new_draft') : null)}
                onAction={searchQuery ? () => setSearchQuery('') : (hasPermission('documents.draft', 'create') ? () => setShowModal(true) : null)}
              />
            </div>
          ) : (
            currentDocuments.map((doc) => (
              <div key={doc.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
                <div className="flex justify-between items-start mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <ActionMenu
                    actions={[
                      ...(doc.status === 'Return for Amendments'
                        ? [{ label: t('view_remarks'), onClick: () => handleViewRemarks(doc) }]
                        : []
                      ),
                      ...(doc.status === 'Return for Amendments' && hasPermission('documents.draft', 'update')
                        ? [{ label: t('reupload_file'), onClick: () => handleReupload(doc) }]
                        : []
                      ),
                      ...(hasPermission('documents.draft', 'delete')
                        ? [{ label: t('delete'), onClick: () => handleDelete(doc), variant: 'destructive' }]
                        : []
                      )
                    ]}
                  />
                </div>
                <h3 className="font-medium text-gray-900 text-sm mb-1 truncate" title={doc.title}>{doc.title}</h3>
                <p className="text-xs text-blue-600 font-mono mb-2">{doc.fileCode}</p>
                <div className="flex items-center justify-between mb-2">
                  <StatusBadge status={doc.status} />
                  <span className="text-xs text-gray-500">v{doc.version}</span>
                </div>
                {doc.latestReturnRemark && doc.status === 'Return for Amendments' ? (
                  <button
                    onClick={() => handleViewRemarks(doc)}
                    className="w-full text-left text-xs text-blue-700 hover:text-blue-800 underline underline-offset-2 truncate"
                    title={`${t('latest_remark')}${formatLatestRemarkMeta(doc)}: ${doc.latestReturnRemark}`}
                  >
                    {t('latest_remark')}
                    {formatLatestRemarkMeta(doc)}: {normalizeRemarkSnippet(doc.latestReturnRemark)}
                  </button>
                ) : null}
                <div className="text-xs text-gray-500">
                  <p>{t('by_author')} {doc.createdBy}</p>
                  <p>{doc.lastUpdated}</p>
                </div>
              </div>
            ))
          )}
        </div>
        )}

        {/* Mobile Cards */}
        <div className="md:hidden space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span>{t('loading_documents')}</span>
              </div>
            </div>
          ) : currentDocuments.length === 0 ? (
            <EmptyState 
              message={t('no_draft_docs')} 
              description={searchQuery || statusFilter !== 'All' ? t('adjust_filters') : t('start_creating_draft')}
              actionLabel={searchQuery ? t('clear_search') : (hasPermission('documents.draft', 'create') ? t('new_draft') : null)}
              onAction={searchQuery ? () => setSearchQuery('') : (hasPermission('documents.draft', 'create') ? () => setShowModal(true) : null)}
            />
          ) : (
            currentDocuments.map((doc) => (
              <div key={doc.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <a href="#" className="text-gray-900 font-semibold hover:text-blue-600">
                      {doc.fileCode}
                    </a>
                    <div className="text-sm text-gray-600 mt-1">{doc.title}</div>
                  </div>
                  <ActionMenu
                    actions={[
                      ...(doc.status === 'Return for Amendments'
                        ? [{ label: t('view_remarks'), onClick: () => handleViewRemarks(doc) }]
                        : []
                      ),
                      ...(doc.status === 'Return for Amendments' && hasPermission('documents.draft', 'update')
                        ? [
                            { label: t('reupload_file'), onClick: () => handleReupload(doc) }
                          ]
                        : []
                      ),
                      ...(hasPermission('documents.draft', 'delete')
                        ? [
                            { label: t('delete'), onClick: () => handleDelete(doc), variant: 'destructive' }
                          ]
                        : []
                      )
                    ]}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={doc.status} />
                </div>
                {doc.latestReturnRemark && doc.status === 'Return for Amendments' ? (
                  <button
                    onClick={() => handleViewRemarks(doc)}
                    className="w-full text-left text-xs text-blue-700 hover:text-blue-800 underline underline-offset-2 truncate"
                    title={`${t('latest_remark')}${formatLatestRemarkMeta(doc)}: ${doc.latestReturnRemark}`}
                  >
                    {t('latest_remark')}
                    {formatLatestRemarkMeta(doc)}: {normalizeRemarkSnippet(doc.latestReturnRemark)}
                  </button>
                ) : null}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">{t('version')}:</span>
                    <div className="text-gray-900 font-medium">{doc.version}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('created_by')}:</span>
                    <div className="text-gray-900 font-medium">{doc.createdBy}</div>
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
