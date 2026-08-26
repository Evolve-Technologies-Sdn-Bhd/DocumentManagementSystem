import React, { useState, useEffect, useMemo } from 'react'
import api from '../api/axios'
import ActionMenu from '../components/ActionMenu'
import ConfirmModal, { AlertModal } from '../components/ConfirmModal'
import DocumentViewerModal from '../components/DocumentViewerModal'
import EmptyState from '../components/EmptyState'
import Pagination from '../components/Pagination'
import AppSurface from '../components/ui/AppSurface'
import Button from '../components/ui/Button'
import ColumnSettingsButton from '../components/ui/ColumnSettingsButton'
import EmptyPanelState from '../components/ui/EmptyPanelState'
import InlineSpinner from '../components/ui/InlineSpinner'
import PageHeader from '../components/ui/PageHeader'
import SelectField from '../components/ui/SelectField'
import { TableContainer, Table, Th, Td, Tr } from '../components/ui/Table'
import TextInput from '../components/ui/TextInput'
import { usePreferences } from '../contexts/PreferencesContext'
import useTableFeatures from '../hooks/useTableFeatures'
import { isAdmin } from '../utils/permissions'

const MASTER_RECORD_DEBUG_URL = 'http://127.0.0.1:7777/event'
const getFriendlyMasterRecordDownloadError = (error, doc) => {
  const statusCode = error?.response?.status
  const documentStatus = String(doc?.status || '').toUpperCase()

  if (statusCode === 404 && documentStatus === 'ACKNOWLEDGED') {
    return 'File is not uploaded yet'
  }

  return error?.response?.data?.message || 'Failed to download document. Please try again.'
}

const reportMasterRecordDebug = (hypothesisId, location, msg, data = {}, runId = 'pre-fix') => {
  try {
    if (localStorage.getItem('dms_debug') !== '1') return
  } catch {
    return
  }
  fetch(MASTER_RECORD_DEBUG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'master-record-tabs',
      runId,
      hypothesisId,
      location,
      msg,
      data,
      ts: Date.now()
    })
  }).catch(() => {})
}

const escapeCsvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
const normalizeRevision = (rev, fileCode) => {
  const raw = String(rev || '').trim()
  const fallback = String(fileCode || '').split('/')[1] || ''
  const candidate = raw || String(fallback || '').trim()
  const m = /^0*(\d+)(?:\.(\d+))?([a-z]*)$/i.exec(candidate)
  if (!m) return raw || candidate
  const major = parseInt(m[1], 10)
  const minor = typeof m[2] === 'string' ? m[2] : null
  const suffix = String(m[3] || '').toLowerCase()
  if (!Number.isFinite(major)) return raw || candidate
  if (minor !== null) return `${major}.${minor}${suffix}`
  if (suffix) return `${major}${suffix}`
  return `${major}.0`
}

const downloadCsv = (fileName, headers, rows) => {
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
  const link = window.document.createElement('a')
  link.href = window.URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  window.URL.revokeObjectURL(link.href)
}

function TabNavigation({ activeTab, onTabChange }) {
  const { t } = usePreferences()
  const tabs = [
    { id: 'new-documents', label: t('mr_new_doc_register') },
    { id: 'new-versions', label: t('mr_new_version_register') },
    { id: 'obsolete', label: t('mr_obsolete_register') },
    { id: 'old-versions', label: t('mr_old_version_register') },
    { id: 'consolidated', label: t('mr_consolidated_register') }
  ]

  return (
    <AppSurface className="overflow-x-auto" padding="sm" variant="muted" data-tour-id="mr-tabbar">
      <nav className="flex min-w-max gap-2" aria-label="Register Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            data-tour-id={`mr-tab-${tab.id}`}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-brand text-ink-inverse shadow-dms-soft'
                : 'text-ink-muted hover:bg-surface hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </AppSurface>
  )
}

function NewDocumentRegister({ projectCategories = [], documentTypes = [], users = [] }) {
  const { itemsPerPage, t } = usePreferences()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [deleting, setDeleting] = useState(false)
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    documentTypeId: 'all',
    projectCategoryId: 'all',
    ownerId: 'all',
    search: ''
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  const handleViewRef = { current: null }
  const handleDownloadRef = { current: null }
  const purgeByFileCodeRef = { current: null }

  const tab1Columns = useMemo(() => [
    {
      id: 'fileCode',
      key: 'fileCode',
      accessor: 'fileCode',
      label: t('file_code'),
      header: t('file_code'),
      className: 'font-medium text-brand',
      required: true,
      sortable: true
    },
    {
      id: 'title',
      key: 'title',
      accessor: 'title',
      label: t('mr_doc_title'),
      header: t('mr_doc_title'),
      className: 'text-ink',
      required: true,
      sortable: true
    },
    {
      id: 'type',
      key: 'type',
      accessor: 'type',
      label: t('type'),
      header: t('type'),
      sortable: true
    },
    {
      id: 'projectCategory',
      key: 'projectCategory',
      accessor: (row) => row.projectCategory || '',
      label: t('project_category'),
      header: t('project_category'),
      sortable: true
    },
    {
      id: 'version',
      key: 'version',
      accessor: (row) => normalizeRevision(row.version, row.fileCode),
      label: t('version'),
      header: t('version'),
      sortable: true
    },
    {
      id: 'registeredDate',
      key: 'registeredDate',
      accessor: 'registeredDate',
      label: t('mr_registered_date'),
      header: t('mr_registered_date'),
      sortType: 'date',
      sortable: true
    },
    {
      id: 'owner',
      key: 'owner',
      accessor: (row) => ({ owner: row.owner, department: row.department }),
      label: t('owner'),
      header: t('owner'),
      sortable: true,
      render: (value) => (
        <>
          <div>{value.owner}</div>
          <div className="text-xs text-ink-muted">{value.department}</div>
        </>
      )
    },
    {
      id: 'status',
      key: 'status',
      accessor: 'status',
      label: t('status'),
      header: t('status'),
      sortable: true,
      render: (value) => (
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          {value}
        </span>
      )
    },
    {
      id: 'actions',
      key: 'actions',
      accessor: (row) => row,
      label: t('actions'),
      header: t('actions'),
      className: 'sticky-right',
      stickyRight: true,
      required: true,
      render: (doc) => (
        <ActionMenu
          actions={[
            { label: 'View', onClick: () => handleViewRef.current(doc) },
            { label: 'Download', onClick: () => handleDownloadRef.current(doc) },
            ...(isAdmin() ? [{
              label: 'Delete',
              variant: 'destructive',
              onClick: () => setConfirmModal({
                show: true,
                title: 'Delete document records?',
                message: `This will permanently delete ALL records for "${doc.fileCode}" (document, versions, registers, and stored files). This action cannot be undone.`,
                onConfirm: () => purgeByFileCodeRef.current(doc.fileCode)
              })
            }] : [])
          ]}
        />
      )
    }
  ], [t])

  const {
    sortedData,
    orderedColumns,
    visibleColumns,
    hiddenColumns,
    getSortDirectionFor,
    toggleSort,
    moveColumn,
    toggleColumnVisibility,
    resetTableSettings
  } = useTableFeatures({
    tableId: 'masterrecord-newdocs',
    columns: tab1Columns,
    data: documents,
    defaultSortKey: 'registeredDate',
    defaultSortDirection: 'desc'
  })

  useEffect(() => {
    loadDocuments()
  }, [filters, currentPage])

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const res = await api.get('/reports/master-record/new-documents', { params: filters })
      const docs = res.data.data?.documents || []
      reportMasterRecordDebug('A', 'MasterRecord.jsx:loadDocuments:new-documents', '[DEBUG] Loaded new document register rows', {
        totalRows: docs.length,
        sampleRows: docs.slice(0, 10).map((doc) => ({
          id: doc.id,
          documentId: doc.documentId ?? null,
          fileCode: doc.fileCode,
          projectCategoryId: doc.projectCategoryId ?? null,
          title: doc.title,
          status: doc.status
        })),
        filters
      }, 'pre-fix')
      setDocuments(docs)
    } catch (error) {
      console.error('Failed to load documents:', error)
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  const purgeByFileCode = async (fileCode) => {
    setDeleting(true)
    try {
      await api.delete(`/documents/code/${encodeURIComponent(fileCode)}/purge`)
      setConfirmModal({ show: false, title: '', message: '', onConfirm: null })
      setAlertModal({
        show: true,
        title: 'Deleted',
        message: `All records for "${fileCode}" have been deleted.`,
        type: 'success'
      })
      await loadDocuments()
    } catch (error) {
      setConfirmModal({ show: false, title: '', message: '', onConfirm: null })
      setAlertModal({
        show: true,
        title: 'Delete failed',
        message: error.response?.data?.message || 'Failed to delete document records. Please try again.',
        type: 'error'
      })
    } finally {
      setDeleting(false)
    }
  }

  purgeByFileCodeRef.current = purgeByFileCode

  const handleExport = async () => {
    try {
      const res = await api.get('/reports/master-record/new-documents', { params: filters })
      const exportRows = res.data?.data?.documents || []
      const rows = exportRows.map((doc) => [
        doc.fileCode || '',
        doc.title || '',
        doc.type || '',
        doc.projectCategory || '',
        normalizeRevision(doc.version, doc.fileCode),
        doc.registeredDate || '',
        doc.owner || '',
        doc.department || '',
        doc.status || ''
      ])

      downloadCsv(
        `new_document_register_${new Date().toISOString().slice(0, 10)}.csv`,
        [
          t('file_code'),
          t('mr_doc_title'),
          t('type'),
          t('project_category'),
          t('version'),
          t('mr_registered_date'),
          t('owner'),
          t('department'),
          t('status')
        ],
        rows
      )
    } catch (error) {
      console.error('Failed to export:', error)
      alert(t('mr_export_failed_desc'))
    }
  }

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
  }

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
  }

  const handleView = (doc) => {
    reportMasterRecordDebug('B', 'MasterRecord.jsx:handleView:new-documents', '[DEBUG] User clicked View on master record row', {
      id: doc?.id ?? null,
      documentId: doc?.documentId ?? null,
      fileCode: doc?.fileCode ?? null,
      projectCategoryId: doc?.projectCategoryId ?? null,
      title: doc?.title ?? null,
      status: doc?.status ?? null
    }, 'pre-fix')
    if (!doc?.documentId && !doc?.id) {
      setAlertModal({
        show: true,
        title: 'Preview unavailable',
        message: 'No linked document preview is available for this record.',
        type: 'error'
      })
      return
    }
    setSelectedDocument(doc)
    setShowViewModal(true)
  }

  handleViewRef.current = handleView

  const handleDownload = async (doc) => {
    try {
      const effectiveDocumentId = doc?.documentId ?? doc?.id
      if (!effectiveDocumentId) {
        throw new Error('Missing document id')
      }

      const res = await api.get(`/documents/${effectiveDocumentId}/download`, {
        responseType: 'blob'
      })

      const contentDisposition = res.headers?.['content-disposition'] || ''
      const contentType = res.headers?.['content-type'] || ''
      const fallbackName = doc.fileName || doc.title || `document-${effectiveDocumentId}`
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

      const downloadName = getFileNameFromContentDisposition(contentDisposition) || fallbackName
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentType || undefined }))
      const link = window.document.createElement('a')
      link.href = url
      link.setAttribute('download', downloadName)
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download document:', error)
      setAlertModal({
        show: true,
        title: 'Download failed',
        message: getFriendlyMasterRecordDownloadError(error, doc),
        type: 'error'
      })
    }
  }

  handleDownloadRef.current = handleDownload

  const visibleToGlobalIndex = (visibleIdx) => {
    const visColId = visibleColumns[visibleIdx]?.id || visibleColumns[visibleIdx]?.key || visibleColumns[visibleIdx]?.accessor
    return orderedColumns.findIndex((c) => (c.id || c.key || c.accessor) === visColId)
  }

  const handleDragStart = (e, visibleIdx) => {
    const globalIdx = visibleToGlobalIndex(visibleIdx)
    if (globalIdx === -1) return
    setDragColIndex(globalIdx)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, visibleIdx) => {
    e.preventDefault()
    const globalIdx = visibleToGlobalIndex(visibleIdx)
    if (globalIdx === -1) return
    setDragOverColIndex(globalIdx)
  }

  const handleDragLeave = () => {
    setDragOverColIndex(null)
  }

  const handleDrop = (e, visibleIdx) => {
    e.preventDefault()
    const toGlobalIdx = visibleToGlobalIndex(visibleIdx)
    if (dragColIndex === null || toGlobalIdx === -1 || dragColIndex === toGlobalIdx) {
      setDragColIndex(null)
      setDragOverColIndex(null)
      return
    }
    moveColumn(dragColIndex, toGlobalIdx)
    setDragColIndex(null)
    setDragOverColIndex(null)
  }

  const handleDragEnd = () => {
    setDragColIndex(null)
    setDragOverColIndex(null)
  }

  const filteredDocuments = sortedData.filter((doc) => {
    if (filters.search && !doc.fileCode.toLowerCase().includes(filters.search.toLowerCase()) && 
        !doc.title.toLowerCase().includes(filters.search.toLowerCase())) {
      return false
    }
    return true
  })
  const totalPages = Math.ceil(filteredDocuments.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedDocuments = filteredDocuments.slice(startIndex, startIndex + pageSize)

  return (
    <div className="space-y-6">
      <AppSurface padding="lg" variant="muted">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('mr_date_from')}</label>
            <TextInput
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('mr_date_to')}</label>
            <TextInput
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('document_type')}</label>
            <SelectField
              value={filters.documentTypeId}
              onChange={(e) => setFilters({ ...filters, documentTypeId: e.target.value })}
              disabled={documentTypes.length === 0}
            >
              <option value="all">{t('mr_all_types')}</option>
              {documentTypes.map((dt) => (
                <option key={dt.id} value={dt.id}>
                  {dt.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('project_category')}</label>
            <SelectField
              value={filters.projectCategoryId}
              onChange={(e) => setFilters({ ...filters, projectCategoryId: e.target.value })}
              disabled={projectCategories.length === 0}
            >
              <option value="all">All Categories</option>
              {projectCategories.map((pc) => (
                <option key={pc.id} value={pc.id}>
                  {pc.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('owner')}</label>
            <SelectField
              value={filters.ownerId}
              onChange={(e) => setFilters({ ...filters, ownerId: e.target.value })}
              disabled={users.length === 0}
            >
              <option value="all">{t('mr_all_owners')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('mr_search')}</label>
            <TextInput
              placeholder={t('mr_file_code_placeholder')}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <ColumnSettingsButton
            orderedColumns={orderedColumns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={toggleColumnVisibility}
            onReset={resetTableSettings}
          />
          <Button
            onClick={handleExport}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('mr_export_excel')}
          </Button>
        </div>
      </AppSurface>

      <TableContainer>
        <Table>
          <thead className="bg-surface-muted/80">
              <Tr>
                {visibleColumns.map((col, visibleIdx) => {
                  const colId = col.id || col.key || col.accessor
                  const globalIdx = orderedColumns.findIndex((c) => (c.id || c.key || c.accessor) === colId)
                  return (
                    <Th
                      key={colId}
                      stickyRight={col.stickyRight}
                      sortable={col.sortable}
                      sortDirection={getSortDirectionFor(colId)}
                      onSort={() => toggleSort(colId)}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, visibleIdx)}
                      onDragOver={(e) => handleDragOver(e, visibleIdx)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, visibleIdx)}
                      onDragEnd={handleDragEnd}
                      dragOver={dragOverColIndex === globalIdx}
                      className={col.className}
                    >
                      {col.label || col.header}
                    </Th>
                  )
                })}
              </Tr>
            </thead>
            <tbody>
              {loading ? (
                <Tr>
                  <Td colSpan={visibleColumns.length} className="py-10 text-center">
                    <span className="inline-flex items-center gap-2 text-ink-muted">
                      <InlineSpinner />
                      {t('mr_loading_documents')}
                    </span>
                  </Td>
                </Tr>
              ) : paginatedDocuments.length === 0 ? (
                <Tr>
                  <Td colSpan={visibleColumns.length} className="py-8">
                    <EmptyPanelState
                      title={t('mr_no_docs_found')}
                      description={filters.search ? t('mr_try_adjust') : t('mr_no_docs_registered')}
                    />
                  </Td>
                </Tr>
              ) : (
                paginatedDocuments.map((doc) => (
                  <Tr key={doc.id}>
                    {visibleColumns.map((col) => {
                      const colId = col.id || col.key || col.accessor
                      let cellValue
                      if (typeof col.accessor === 'function') {
                        cellValue = col.accessor(doc, col)
                      } else {
                        cellValue = doc?.[col.accessor]
                      }
                      const rendered = col.render ? col.render(cellValue, doc) : cellValue
                      return (
                        <Td
                          key={colId}
                          stickyRight={col.stickyRight}
                          className={col.className}
                        >
                          {rendered}
                        </Td>
                      )
                    })}
                  </Tr>
                ))
              )}
            </tbody>
        </Table>
      </TableContainer>

      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false, title: '', message: '', onConfirm: null })}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        loading={deleting}
      />

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />

      {showViewModal && selectedDocument && (
        <DocumentViewerModal
          document={selectedDocument}
          onClose={() => {
            setShowViewModal(false)
            setSelectedDocument(null)
          }}
        />
      )}

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
  )
}

function NewVersionRegister({ projectCategories = [], users = [] }) {
  const { itemsPerPage, t } = usePreferences()
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    type: 'all',
    reason: 'all',
    owner: 'all',
    projectCategoryId: 'all',
    search: ''
  })
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  const handleCompareRef = { current: null }

  const tab2Columns = useMemo(() => [
    {
      id: 'fileCode',
      key: 'fileCode',
      accessor: 'fileCode',
      label: t('file_code'),
      header: t('file_code'),
      className: 'font-medium text-brand',
      required: true,
      sortable: true
    },
    {
      id: 'title',
      key: 'title',
      accessor: 'title',
      label: t('mr_doc_title'),
      header: t('mr_doc_title'),
      className: 'text-ink',
      required: true,
      sortable: true
    },
    {
      id: 'projectCategory',
      key: 'projectCategory',
      accessor: (row) => row.projectCategory || '',
      label: t('project_category'),
      header: t('project_category'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'previousVersion',
      key: 'previousVersion',
      accessor: 'previousVersion',
      label: t('mr_previous_version'),
      header: t('mr_previous_version'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'newVersion',
      key: 'newVersion',
      accessor: 'newVersion',
      label: t('mr_new_version'),
      header: t('mr_new_version'),
      sortable: true,
      render: (value) => (
        <span className="px-2 py-1 text-xs font-medium bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)] rounded">
          {value}
        </span>
      )
    },
    {
      id: 'versionDate',
      key: 'versionDate',
      accessor: 'versionDate',
      label: t('mr_version_date'),
      header: t('mr_version_date'),
      className: 'text-ink-secondary',
      sortType: 'date',
      sortable: true
    },
    {
      id: 'updatedBy',
      key: 'updatedBy',
      accessor: 'updatedBy',
      label: t('mr_updated_by'),
      header: t('mr_updated_by'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'changeSummary',
      key: 'changeSummary',
      accessor: 'changeSummary',
      label: t('mr_change_summary'),
      header: t('mr_change_summary'),
      className: 'text-ink-secondary max-w-xs truncate',
      sortable: true
    },
    {
      id: 'actions',
      key: 'actions',
      accessor: (row) => row,
      label: t('actions'),
      header: t('actions'),
      stickyRight: true,
      required: true,
      render: (version) => (
        <ActionMenu
          actions={[
            { label: t('mr_compare'), onClick: () => handleCompareRef.current(version) }
          ]}
        />
      )
    }
  ], [t])

  const {
    sortedData,
    orderedColumns,
    visibleColumns,
    hiddenColumns,
    getSortDirectionFor,
    toggleSort,
    moveColumn,
    toggleColumnVisibility,
    resetTableSettings
  } = useTableFeatures({
    tableId: 'masterrecord-newversions',
    columns: tab2Columns,
    data: versions
  })

  useEffect(() => {
    loadVersions()
  }, [filters])

  const loadVersions = async () => {
    setLoading(true)
    try {
      const res = await api.get('/reports/master-record/version-register', { params: filters })
      const data = res.data.data?.records || []
      const formattedVersions = data.map(record => ({
        id: record.id,
        fileCode: record.fileCode,
        title: record.documentTitle,
        projectCategory: record.projectCategory || '',
        previousVersion: record.previousVersion,
        newVersion: record.newVersion,
        versionDate: new Date(record.versionDate).toLocaleDateString('en-GB'),
        updatedBy: record.updatedBy,
        changeSummary: record.changeSummary || 'No summary provided'
      }))
      setVersions(formattedVersions)
    } catch (error) {
      console.error('Failed to load versions:', error)
      setVersions([])
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    reportMasterRecordDebug('B', 'MasterRecord.jsx:handleExport:new-versions', '[DEBUG] New Version export clicked', {
      totalRows: versions.length,
      filters
    })
    try {
      const res = await api.get('/reports/master-record/version-register', { params: filters })
      const exportRows = res.data?.data?.records || []
      const rows = exportRows.map((record) => [
        record.fileCode || '',
        record.documentTitle || '',
        record.projectCategory || '',
        record.previousVersion || '',
        record.newVersion || '',
        record.versionDate ? new Date(record.versionDate).toLocaleDateString('en-GB') : '',
        record.updatedBy || '',
        record.changeSummary || ''
      ])

      downloadCsv(
        `new_version_register_${new Date().toISOString().slice(0, 10)}.csv`,
        [
          t('file_code'),
          t('mr_doc_title'),
          t('project_category'),
          t('mr_previous_version'),
          t('mr_new_version'),
          t('mr_version_date'),
          t('mr_updated_by'),
          t('mr_change_summary')
        ],
        rows
      )
    } catch (error) {
      console.error('Failed to export new version register:', error)
      alert(t('mr_export_failed_desc'))
    }
  }

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
  }

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
  }

  const handleCompare = (version) => {
    setAlertModal({
      show: true,
      title: 'Compare unavailable',
      message: `Comparison view is not connected for "${version.fileCode}" yet.`,
      type: 'info'
    })
  }

  handleCompareRef.current = handleCompare

  const visibleToGlobalIndex = (visibleIdx) => {
    const visColId = visibleColumns[visibleIdx]?.id || visibleColumns[visibleIdx]?.key || visibleColumns[visibleIdx]?.accessor
    return orderedColumns.findIndex((c) => (c.id || c.key || c.accessor) === visColId)
  }

  const handleDragStart = (e, visibleIdx) => {
    const globalIdx = visibleToGlobalIndex(visibleIdx)
    if (globalIdx === -1) return
    setDragColIndex(globalIdx)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, visibleIdx) => {
    e.preventDefault()
    const globalIdx = visibleToGlobalIndex(visibleIdx)
    if (globalIdx === -1) return
    setDragOverColIndex(globalIdx)
  }

  const handleDragLeave = () => {
    setDragOverColIndex(null)
  }

  const handleDrop = (e, visibleIdx) => {
    e.preventDefault()
    const toGlobalIdx = visibleToGlobalIndex(visibleIdx)
    if (dragColIndex === null || toGlobalIdx === -1 || dragColIndex === toGlobalIdx) {
      setDragColIndex(null)
      setDragOverColIndex(null)
      return
    }
    moveColumn(dragColIndex, toGlobalIdx)
    setDragColIndex(null)
    setDragOverColIndex(null)
  }

  const handleDragEnd = () => {
    setDragColIndex(null)
    setDragOverColIndex(null)
  }

  const filteredVersions = sortedData.filter((v) => {
    if (filters.search && !v.fileCode.toLowerCase().includes(filters.search.toLowerCase()) && 
        !v.title.toLowerCase().includes(filters.search.toLowerCase())) {
      return false
    }
    return true
  })
  const totalPages = Math.ceil(filteredVersions.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedVersions = filteredVersions.slice(startIndex, startIndex + pageSize)

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_version_date_from')}</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_version_date_to')}</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_previous_version')}</label>
            <input
              type="text"
              placeholder="e.g., 02a"
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_updated_by')}</label>
            <select
              value={filters.owner}
              onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
              disabled={users.length === 0}
            >
              <option value="all">{t('mr_all_users')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('project_category')}</label>
            <select
              value={filters.projectCategoryId}
              onChange={(e) => setFilters({ ...filters, projectCategoryId: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
              disabled={projectCategories.length === 0}
            >
              <option value="all">All Categories</option>
              {projectCategories.map((pc) => (
                <option key={pc.id} value={pc.id}>
                  {pc.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_search')}</label>
            <input
              type="text"
              placeholder={t('mr_file_code_placeholder')}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <ColumnSettingsButton
            orderedColumns={orderedColumns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={toggleColumnVisibility}
            onReset={resetTableSettings}
          />
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-[var(--dms-color-success-ink)] text-[color:var(--dms-color-bg-canvas)] rounded-lg hover:opacity-90 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('mr_export_excel')}
          </button>
        </div>
      </div>

      <TableContainer className="card overflow-hidden">
        <Table>
          <thead className="bg-surface-muted">
            <Tr>
              {visibleColumns.map((col, visibleIdx) => {
                const colId = col.id || col.key || col.accessor
                const globalIdx = orderedColumns.findIndex((c) => (c.id || c.key || c.accessor) === colId)
                return (
                  <Th
                    key={colId}
                    stickyRight={col.stickyRight}
                    sortable={col.sortable}
                    sortDirection={getSortDirectionFor(colId)}
                    onSort={() => toggleSort(colId)}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, visibleIdx)}
                    onDragOver={(e) => handleDragOver(e, visibleIdx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, visibleIdx)}
                    onDragEnd={handleDragEnd}
                    dragOver={dragOverColIndex === globalIdx}
                    className={col.className}
                  >
                    {col.label || col.header}
                  </Th>
                )
              })}
            </Tr>
          </thead>
          <tbody className="bg-surface divide-y divide-border">
            {loading ? (
              <Tr>
                <Td colSpan={visibleColumns.length} className="py-8 text-center text-ink-muted">
                  {t('mr_loading_versions')}
                </Td>
              </Tr>
            ) : paginatedVersions.length === 0 ? (
              <Tr>
                <Td colSpan={visibleColumns.length} className="py-8">
                  {(() => {
                    reportMasterRecordDebug('A', 'MasterRecord.jsx:empty:new-versions', '[DEBUG] Rendering New Version empty state', {
                      totalRows: versions.length,
                      filteredRows: paginatedVersions.length,
                      filters
                    })
                    return null
                  })()}
                  <EmptyState
                    message={t('mr_no_versions')}
                    description={filters.search ? t('mr_try_adjust') : t('mr_no_new_versions')}
                    actionLabel={filters.search ? 'Clear Search' : null}
                    onAction={filters.search ? () => setFilters({ ...filters, search: '' }) : null}
                  />
                </Td>
              </Tr>
            ) : (
              paginatedVersions.map((version) => (
                <Tr key={version.id}>
                  {visibleColumns.map((col) => {
                    const colId = col.id || col.key || col.accessor
                    let cellValue
                    if (typeof col.accessor === 'function') {
                      cellValue = col.accessor(version, col)
                    } else {
                      cellValue = version?.[col.accessor]
                    }
                    const rendered = col.render ? col.render(cellValue, version) : cellValue
                    return (
                      <Td
                        key={colId}
                        stickyRight={col.stickyRight}
                        className={col.className}
                      >
                        {rendered}
                      </Td>
                    )
                  })}
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableContainer>

      {!loading && filteredVersions.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={filteredVersions.length}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </div>
  )
}

function ObsoleteRegister({ projectCategories = [] }) {
  const { itemsPerPage, t } = usePreferences()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    type: 'all',
    reason: 'all',
    owner: 'all',
    projectCategoryId: 'all',
    search: ''
  })
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  const handleViewArchiveRef = { current: null }

  const tab3Columns = useMemo(() => [
    {
      id: 'fileCode',
      key: 'fileCode',
      accessor: 'fileCode',
      label: t('file_code'),
      header: t('file_code'),
      className: 'font-medium text-ink-secondary',
      required: true,
      sortable: true
    },
    {
      id: 'title',
      key: 'title',
      accessor: 'title',
      label: t('mr_doc_title'),
      header: t('mr_doc_title'),
      className: 'text-ink',
      required: true,
      sortable: true
    },
    {
      id: 'type',
      key: 'type',
      accessor: 'type',
      label: t('type'),
      header: t('type'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'projectCategory',
      key: 'projectCategory',
      accessor: (row) => row.projectCategory || '',
      label: t('project_category'),
      header: t('project_category'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'obsoleteDate',
      key: 'obsoleteDate',
      accessor: 'obsoleteDate',
      label: t('mr_obsolete_date'),
      header: t('mr_obsolete_date'),
      className: 'text-ink-secondary',
      sortType: 'date',
      sortable: true
    },
    {
      id: 'reason',
      key: 'reason',
      accessor: 'reason',
      label: t('mr_reason'),
      header: t('mr_reason'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'replacedBy',
      key: 'replacedBy',
      accessor: 'replacedBy',
      label: t('mr_replaced_by'),
      header: t('mr_replaced_by'),
      className: 'text-brand font-medium',
      sortable: true
    },
    {
      id: 'actions',
      key: 'actions',
      accessor: (row) => row,
      label: t('actions'),
      header: t('actions'),
      stickyRight: true,
      required: true,
      render: (doc) => (
        <ActionMenu
          actions={[
            { label: t('mr_view_archive'), onClick: () => handleViewArchiveRef.current(doc) }
          ]}
        />
      )
    }
  ], [t])

  const {
    sortedData,
    orderedColumns,
    visibleColumns,
    hiddenColumns,
    getSortDirectionFor,
    toggleSort,
    moveColumn,
    toggleColumnVisibility,
    resetTableSettings
  } = useTableFeatures({
    tableId: 'masterrecord-obsolete',
    columns: tab3Columns,
    data: documents
  })

  useEffect(() => {
    loadObsoleteDocuments()
  }, [filters])

  const loadObsoleteDocuments = async () => {
    setLoading(true)
    try {
      const res = await api.get('/reports/master-record/obsolete-register', { params: filters })
      const data = res.data.data?.records || []
      const formattedDocs = data.map(record => ({
        id: record.id,
        fileCode: record.fileCode,
        title: record.documentTitle,
        type: record.documentType,
        projectCategoryId: record.projectCategoryId ?? null,
        projectCategory: record.projectCategory || '',
        obsoleteDate: new Date(record.obsoleteDate).toLocaleDateString('en-GB'),
        reason: record.reason,
        replacedBy: record.replacedBy || 'N/A',
        lastOwner: record.lastOwner
      }))
      setDocuments(formattedDocs)
    } catch (error) {
      console.error('Failed to load obsolete documents:', error)
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  const handleExport = () => {
    reportMasterRecordDebug('A', 'MasterRecord.jsx:handleExport:obsolete', '[DEBUG] Obsolete export clicked', {
      totalRows: documents.length,
      filters
    })
    ;(async () => {
      try {
        const res = await api.get('/reports/master-record/obsolete-register', { params: filters })
        const exportRows = res.data?.data?.records || []
        const needle = String(filters.search || '').trim().toLowerCase()
        const filteredExportRows = needle
          ? exportRows.filter((record) => {
              const fc = String(record.fileCode || '').toLowerCase()
              const title = String(record.documentTitle || '').toLowerCase()
              return fc.includes(needle) || title.includes(needle)
            })
          : exportRows
        const rows = filteredExportRows.map((record) => [
          record.fileCode || '',
          record.documentTitle || '',
          record.documentType || '',
          record.projectCategory || '',
          record.obsoleteDate ? new Date(record.obsoleteDate).toLocaleDateString('en-GB') : '',
          record.reason || '',
          record.replacedBy || '',
          record.lastOwner || ''
        ])

        downloadCsv(
          `obsolete_register_${new Date().toISOString().slice(0, 10)}.csv`,
          [
            t('file_code'),
            t('mr_doc_title'),
            t('type'),
            t('project_category'),
            t('mr_obsolete_date'),
            t('mr_reason'),
            t('mr_replaced_by'),
            t('owner')
          ],
          rows
        )
      } catch (error) {
        console.error('Failed to export obsolete register:', error)
        alert(t('mr_export_failed_desc'))
      }
    })()
  }

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
  }

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
  }

  const handleViewArchive = async (doc) => {
    try {
      const res = await api.get(`/documents/code/${encodeURIComponent(doc.fileCode)}`, {
        params: doc.projectCategoryId ? { projectCategoryId: doc.projectCategoryId } : undefined
      })
      const fullDocument = res.data?.data?.document || res.data?.document
      if (!fullDocument?.id) {
        throw new Error('Document record not found')
      }

      setSelectedDocument({
        id: fullDocument.id,
        fileCode: fullDocument.fileCode,
        title: fullDocument.title,
        fileName: fullDocument.versions?.[0]?.fileName || fullDocument.title,
        version: fullDocument.version,
        status: fullDocument.status
      })
      setShowViewModal(true)
    } catch (error) {
      console.error('Failed to open archived document:', error)
      setAlertModal({
        show: true,
        title: 'Unable to open archive',
        message: error.response?.data?.message || 'No linked document preview is available for this archive record.',
        type: 'error'
      })
    }
  }

  handleViewArchiveRef.current = handleViewArchive

  const visibleToGlobalIndex = (visibleIdx) => {
    const visColId = visibleColumns[visibleIdx]?.id || visibleColumns[visibleIdx]?.key || visibleColumns[visibleIdx]?.accessor
    return orderedColumns.findIndex((c) => (c.id || c.key || c.accessor) === visColId)
  }

  const handleDragStart = (e, visibleIdx) => {
    const globalIdx = visibleToGlobalIndex(visibleIdx)
    if (globalIdx === -1) return
    setDragColIndex(globalIdx)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, visibleIdx) => {
    e.preventDefault()
    const globalIdx = visibleToGlobalIndex(visibleIdx)
    if (globalIdx === -1) return
    setDragOverColIndex(globalIdx)
  }

  const handleDragLeave = () => {
    setDragOverColIndex(null)
  }

  const handleDrop = (e, visibleIdx) => {
    e.preventDefault()
    const toGlobalIdx = visibleToGlobalIndex(visibleIdx)
    if (dragColIndex === null || toGlobalIdx === -1 || dragColIndex === toGlobalIdx) {
      setDragColIndex(null)
      setDragOverColIndex(null)
      return
    }
    moveColumn(dragColIndex, toGlobalIdx)
    setDragColIndex(null)
    setDragOverColIndex(null)
  }

  const handleDragEnd = () => {
    setDragColIndex(null)
    setDragOverColIndex(null)
  }

  const filteredDocuments = sortedData.filter((doc) => {
    if (filters.search && !doc.fileCode.toLowerCase().includes(filters.search.toLowerCase()) && 
        !doc.title.toLowerCase().includes(filters.search.toLowerCase())) {
      return false
    }
    return true
  })
  const totalPages = Math.ceil(filteredDocuments.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedDocuments = filteredDocuments.slice(startIndex, startIndex + pageSize)

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_obsolete_date_from')}</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_obsolete_date_to')}</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('document_type')}</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            >
              <option value="all">{t('mr_all_types')}</option>
              <option value="procedure">Procedure</option>
              <option value="policy">Policy</option>
              <option value="manual">Manual</option>
              <option value="form">Form</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_reason')}</label>
            <select
              value={filters.reason}
              onChange={(e) => setFilters({ ...filters, reason: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            >
              <option value="all">{t('mr_all_reasons')}</option>
              <option value="decommissioned">System decommissioned</option>
              <option value="outdated">Outdated</option>
              <option value="replaced">Replaced by new document</option>
              <option value="merged">Merged with another document</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('project_category')}</label>
            <select
              value={filters.projectCategoryId}
              onChange={(e) => setFilters({ ...filters, projectCategoryId: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
              disabled={projectCategories.length === 0}
            >
              <option value="all">All Categories</option>
              {projectCategories.map((pc) => (
                <option key={pc.id} value={pc.id}>
                  {pc.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_search')}</label>
            <input
              type="text"
              placeholder={t('mr_file_code_placeholder')}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <ColumnSettingsButton
            orderedColumns={orderedColumns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={toggleColumnVisibility}
            onReset={resetTableSettings}
          />
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-[var(--dms-color-success-ink)] text-[color:var(--dms-color-bg-canvas)] rounded-lg hover:opacity-90 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('mr_export_excel')}
          </button>
        </div>
      </div>

      <TableContainer className="card overflow-hidden">
        <Table>
          <thead className="bg-surface-muted">
            <Tr>
              {visibleColumns.map((col, visibleIdx) => {
                const colId = col.id || col.key || col.accessor
                const globalIdx = orderedColumns.findIndex((c) => (c.id || c.key || c.accessor) === colId)
                return (
                  <Th
                    key={colId}
                    stickyRight={col.stickyRight}
                    sortable={col.sortable}
                    sortDirection={getSortDirectionFor(colId)}
                    onSort={() => toggleSort(colId)}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, visibleIdx)}
                    onDragOver={(e) => handleDragOver(e, visibleIdx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, visibleIdx)}
                    onDragEnd={handleDragEnd}
                    dragOver={dragOverColIndex === globalIdx}
                    className={col.className}
                  >
                    {col.label || col.header}
                  </Th>
                )
              })}
            </Tr>
          </thead>
          <tbody className="bg-surface divide-y divide-border">
            {loading ? (
              <Tr>
                <Td colSpan={visibleColumns.length} className="py-8 text-center text-ink-muted">
                  {t('mr_loading_documents')}
                </Td>
              </Tr>
            ) : paginatedDocuments.length === 0 ? (
              <Tr>
                <Td colSpan={visibleColumns.length} className="py-8">
                  {(() => {
                    reportMasterRecordDebug('A', 'MasterRecord.jsx:empty:obsolete', '[DEBUG] Rendering Obsolete empty state', {
                      totalRows: documents.length,
                      filteredRows: paginatedDocuments.length,
                      filters
                    })
                    return null
                  })()}
                  <EmptyState
                    message={t('mr_no_obsolete_docs')}
                    description={filters.search ? t('mr_try_adjust') : t('mr_no_obsolete_yet')}
                    actionLabel={filters.search ? 'Clear Search' : null}
                    onAction={filters.search ? () => setFilters({ ...filters, search: '' }) : null}
                  />
                </Td>
              </Tr>
            ) : (
              paginatedDocuments.map((doc) => (
                <Tr key={doc.id}>
                  {visibleColumns.map((col) => {
                    const colId = col.id || col.key || col.accessor
                    let cellValue
                    if (typeof col.accessor === 'function') {
                      cellValue = col.accessor(doc, col)
                    } else {
                      cellValue = doc?.[col.accessor]
                    }
                    const rendered = col.render ? col.render(cellValue, doc) : cellValue
                    return (
                      <Td
                        key={colId}
                        stickyRight={col.stickyRight}
                        className={col.className}
                      >
                        {rendered}
                      </Td>
                    )
                  })}
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableContainer>

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

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />

      {showViewModal && selectedDocument && (
        <DocumentViewerModal
          document={selectedDocument}
          onClose={() => {
            setShowViewModal(false)
            setSelectedDocument(null)
          }}
        />
      )}
    </div>
  )
}

function OldVersionRegister({ projectCategories = [] }) {
  const { itemsPerPage, t } = usePreferences()
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    type: 'all',
    owner: 'all',
    projectCategoryId: 'all',
    search: ''
  })
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  const handleRestoreRef = { current: null }

  const tab4Columns = useMemo(() => [
    {
      id: 'fileCode',
      key: 'fileCode',
      accessor: 'fileCode',
      label: t('file_code'),
      header: t('file_code'),
      className: 'font-medium text-brand',
      required: true,
      sortable: true
    },
    {
      id: 'title',
      key: 'title',
      accessor: 'title',
      label: t('mr_doc_title'),
      header: t('mr_doc_title'),
      className: 'text-ink',
      required: true,
      sortable: true
    },
    {
      id: 'projectCategory',
      key: 'projectCategory',
      accessor: (row) => row.projectCategory || '',
      label: t('project_category'),
      header: t('project_category'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'version',
      key: 'version',
      accessor: 'version',
      label: t('mr_old_version'),
      header: t('mr_old_version'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'currentVersion',
      key: 'currentVersion',
      accessor: 'currentVersion',
      label: t('mr_current_version'),
      header: t('mr_current_version'),
      sortable: true,
      render: (value) => (
        <span className="px-2 py-1 text-xs font-medium bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)] rounded">
          {value}
        </span>
      )
    },
    {
      id: 'archivedDate',
      key: 'archivedDate',
      accessor: 'archivedDate',
      label: t('mr_archived_date'),
      header: t('mr_archived_date'),
      className: 'text-ink-secondary',
      sortType: 'date',
      sortable: true
    },
    {
      id: 'retentionUntil',
      key: 'retentionUntil',
      accessor: 'retentionUntil',
      label: t('mr_retention_until'),
      header: t('mr_retention_until'),
      className: 'text-ink-secondary',
      sortType: 'date',
      sortable: true
    },
    {
      id: 'actions',
      key: 'actions',
      accessor: (row) => row,
      label: t('actions'),
      header: t('actions'),
      stickyRight: true,
      required: true,
      render: (version) => (
        <ActionMenu
          actions={[
            { label: t('mr_restore'), onClick: () => handleRestoreRef.current(version) }
          ]}
        />
      )
    }
  ], [t])

  const {
    sortedData,
    orderedColumns,
    visibleColumns,
    hiddenColumns,
    getSortDirectionFor,
    toggleSort,
    moveColumn,
    toggleColumnVisibility,
    resetTableSettings
  } = useTableFeatures({
    tableId: 'masterrecord-oldversions',
    columns: tab4Columns,
    data: versions
  })

  useEffect(() => {
    loadArchivedVersions()
  }, [filters])

  const loadArchivedVersions = async () => {
    setLoading(true)
    try {
      const res = await api.get('/reports/master-record/archive-register', { params: filters })
      const data = res.data.data?.records || []
      const formattedVersions = data.map(record => ({
        id: record.id,
        fileCode: record.fileCode,
        title: record.documentTitle,
        projectCategory: record.projectCategory || '',
        version: record.version,
        archivedDate: new Date(record.archivedDate).toLocaleDateString('en-GB'),
        archivedBy: record.archivedBy,
        currentVersion: record.currentVersion,
        retentionUntil: record.retentionUntil ? new Date(record.retentionUntil).toLocaleDateString('en-GB') : 'N/A'
      }))
      setVersions(formattedVersions)
    } catch (error) {
      console.error('Failed to load archived versions:', error)
      setVersions([])
    } finally {
      setLoading(false)
    }
  }

  const handleExport = () => {
    reportMasterRecordDebug('A', 'MasterRecord.jsx:handleExport:old-versions', '[DEBUG] Old Version export clicked', {
      totalRows: versions.length,
      filters
    })
    ;(async () => {
      try {
        const res = await api.get('/reports/master-record/archive-register', { params: filters })
        const exportRows = res.data?.data?.records || []
        const rows = exportRows.map((record) => [
          record.fileCode || '',
          record.documentTitle || '',
          record.projectCategory || '',
          record.version || '',
          record.currentVersion || '',
          record.archivedDate ? new Date(record.archivedDate).toLocaleDateString('en-GB') : '',
          record.retentionUntil ? new Date(record.retentionUntil).toLocaleDateString('en-GB') : '',
          record.archivedBy || ''
        ])

        downloadCsv(
          `old_version_register_${new Date().toISOString().slice(0, 10)}.csv`,
          [
            t('file_code'),
            t('mr_doc_title'),
            t('project_category'),
            t('mr_old_version'),
            t('mr_current_version'),
            t('mr_archived_date'),
            t('mr_retention_until'),
            t('mr_updated_by')
          ],
          rows
        )
      } catch (error) {
        console.error('Failed to export old version register:', error)
        alert(t('mr_export_failed_desc'))
      }
    })()
  }

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
  }

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
  }

  const handleRestore = (version) => {
    setAlertModal({
      show: true,
      title: 'Restore unavailable',
      message: `Restore flow is not connected for archived version "${version.fileCode}" yet.`,
      type: 'info'
    })
  }

  handleRestoreRef.current = handleRestore

  const visibleToGlobalIndex = (visibleIdx) => {
    const visColId = visibleColumns[visibleIdx]?.id || visibleColumns[visibleIdx]?.key || visibleColumns[visibleIdx]?.accessor
    return orderedColumns.findIndex((c) => (c.id || c.key || c.accessor) === visColId)
  }

  const handleDragStart = (e, visibleIdx) => {
    const globalIdx = visibleToGlobalIndex(visibleIdx)
    if (globalIdx === -1) return
    setDragColIndex(globalIdx)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, visibleIdx) => {
    e.preventDefault()
    const globalIdx = visibleToGlobalIndex(visibleIdx)
    if (globalIdx === -1) return
    setDragOverColIndex(globalIdx)
  }

  const handleDragLeave = () => {
    setDragOverColIndex(null)
  }

  const handleDrop = (e, visibleIdx) => {
    e.preventDefault()
    const toGlobalIdx = visibleToGlobalIndex(visibleIdx)
    if (dragColIndex === null || toGlobalIdx === -1 || dragColIndex === toGlobalIdx) {
      setDragColIndex(null)
      setDragOverColIndex(null)
      return
    }
    moveColumn(dragColIndex, toGlobalIdx)
    setDragColIndex(null)
    setDragOverColIndex(null)
  }

  const handleDragEnd = () => {
    setDragColIndex(null)
    setDragOverColIndex(null)
  }

  const filteredVersions = sortedData.filter((v) => {
    if (filters.search && !v.fileCode.toLowerCase().includes(filters.search.toLowerCase()) && 
        !v.title.toLowerCase().includes(filters.search.toLowerCase())) {
      return false
    }
    return true
  })
  const totalPages = Math.ceil(filteredVersions.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedVersions = filteredVersions.slice(startIndex, startIndex + pageSize)

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_archived_date_from')}</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_archived_date_to')}</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_old_version')}</label>
            <input
              type="text"
              placeholder="e.g., 1.0"
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_current_version')}</label>
            <input
              type="text"
              placeholder="e.g., 2.2"
              value={filters.owner}
              onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('project_category')}</label>
            <select
              value={filters.projectCategoryId}
              onChange={(e) => setFilters({ ...filters, projectCategoryId: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
              disabled={projectCategories.length === 0}
            >
              <option value="all">All Categories</option>
              {projectCategories.map((pc) => (
                <option key={pc.id} value={pc.id}>
                  {pc.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_search')}</label>
            <input
              type="text"
              placeholder={t('mr_file_code_placeholder')}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <ColumnSettingsButton
            orderedColumns={orderedColumns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={toggleColumnVisibility}
            onReset={resetTableSettings}
          />
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-[var(--dms-color-success-ink)] text-[color:var(--dms-color-bg-canvas)] rounded-lg hover:opacity-90 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('mr_export_excel')}
          </button>
        </div>
      </div>

      <TableContainer className="card overflow-hidden">
        <Table>
          <thead className="bg-surface-muted">
            <Tr>
              {visibleColumns.map((col, visibleIdx) => {
                const colId = col.id || col.key || col.accessor
                const globalIdx = orderedColumns.findIndex((c) => (c.id || c.key || c.accessor) === colId)
                return (
                  <Th
                    key={colId}
                    stickyRight={col.stickyRight}
                    sortable={col.sortable}
                    sortDirection={getSortDirectionFor(colId)}
                    onSort={() => toggleSort(colId)}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, visibleIdx)}
                    onDragOver={(e) => handleDragOver(e, visibleIdx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, visibleIdx)}
                    onDragEnd={handleDragEnd}
                    dragOver={dragOverColIndex === globalIdx}
                    className={col.className}
                  >
                    {col.label || col.header}
                  </Th>
                )
              })}
            </Tr>
          </thead>
          <tbody className="bg-surface divide-y divide-border">
            {loading ? (
              <Tr>
                <Td colSpan={visibleColumns.length} className="py-8 text-center text-ink-muted">
                  {t('mr_loading_versions')}
                </Td>
              </Tr>
            ) : paginatedVersions.length === 0 ? (
              <Tr>
                <Td colSpan={visibleColumns.length} className="py-8">
                  {(() => {
                    reportMasterRecordDebug('A', 'MasterRecord.jsx:empty:old-versions', '[DEBUG] Rendering Old Version empty state', {
                      totalRows: versions.length,
                      filteredRows: paginatedVersions.length,
                      filters
                    })
                    return null
                  })()}
                  <EmptyState
                    message={t('mr_no_old_versions')}
                    description={filters.search ? t('mr_try_adjust') : t('mr_no_archived_versions')}
                    actionLabel={filters.search ? 'Clear Search' : null}
                    onAction={filters.search ? () => setFilters({ ...filters, search: '' }) : null}
                  />
                </Td>
              </Tr>
            ) : (
              paginatedVersions.map((version) => (
                <Tr key={version.id}>
                  {visibleColumns.map((col) => {
                    const colId = col.id || col.key || col.accessor
                    let cellValue
                    if (typeof col.accessor === 'function') {
                      cellValue = col.accessor(version, col)
                    } else {
                      cellValue = version?.[col.accessor]
                    }
                    const rendered = col.render ? col.render(cellValue, version) : cellValue
                    return (
                      <Td
                        key={colId}
                        stickyRight={col.stickyRight}
                        className={col.className}
                      >
                        {rendered}
                      </Td>
                    )
                  })}
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableContainer>

      {!loading && filteredVersions.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={filteredVersions.length}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </div>
  )
}

function ConsolidatedRegister() {
  const { itemsPerPage, t } = usePreferences()
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: itemsPerPage, total: 0 })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ search: '', projectCategoryId: 'all' })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [importError, setImportError] = useState('')
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [documentTypes, setDocumentTypes] = useState([])
  const [projectCategories, setProjectCategories] = useState([])
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  const tab5Columns = useMemo(() => [
    {
      id: 'fileCode',
      key: 'fileCode',
      accessor: 'fileCode',
      label: t('file_code'),
      header: t('file_code'),
      className: 'font-mono text-brand',
      required: true,
      sortable: true
    },
    {
      id: 'documentTitle',
      key: 'documentTitle',
      accessor: 'documentTitle',
      label: t('mr_doc_title'),
      header: t('mr_doc_title'),
      className: 'text-ink',
      required: true,
      sortable: true
    },
    {
      id: 'documentType',
      key: 'documentType',
      accessor: 'documentType',
      label: t('type'),
      header: t('type'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'projectCategory',
      key: 'projectCategory',
      accessor: (row) => row.projectCategory || '',
      label: t('project_category'),
      header: t('project_category'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'date',
      key: 'date',
      accessor: (row) => row.date ? new Date(row.date).toLocaleDateString('en-GB') : '',
      label: t('date'),
      header: t('date'),
      className: 'text-ink-secondary',
      sortType: 'date',
      sortable: true
    },
    {
      id: 'status',
      key: 'status',
      accessor: 'status',
      label: t('status'),
      header: t('status'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'rev',
      key: 'rev',
      accessor: (row) => normalizeRevision(row.rev, row.fileCode),
      label: t('mr_rev'),
      header: t('mr_rev'),
      className: 'text-ink-secondary',
      sortable: true
    },
    {
      id: 'register',
      key: 'register',
      accessor: 'register',
      label: t('mr_register'),
      header: t('mr_register'),
      className: 'text-ink-secondary',
      sortable: true
    }
  ], [t])

  const {
    sortedData,
    orderedColumns,
    visibleColumns,
    hiddenColumns,
    getSortDirectionFor,
    toggleSort,
    moveColumn,
    toggleColumnVisibility,
    resetTableSettings
  } = useTableFeatures({
    tableId: 'masterrecord-consolidated',
    columns: tab5Columns,
    data: rows
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [typesRes, projRes] = await Promise.all([
          api.get('/system/config/document-types'),
          api.get('/system/config/project-categories')
        ])
        if (cancelled) return
        setDocumentTypes(typesRes.data?.data?.documentTypes || [])
        setProjectCategories(projRes.data?.data?.projectCategories || [])
      } catch (_) {
        if (cancelled) return
        setDocumentTypes([])
        setProjectCategories([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    loadRows()
  }, [filters, currentPage, pageSize])

  const loadRows = async () => {
    setLoading(true)
    try {
      const res = await api.get('/reports/master-record/consolidated', {
        params: { search: filters.search, projectCategoryId: filters.projectCategoryId, page: currentPage, limit: pageSize }
      })
      const data = res.data?.data || {}
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setPagination(data.pagination || { page: currentPage, limit: pageSize, total: 0 })
    } catch (_) {
      setRows([])
      setPagination({ page: currentPage, limit: pageSize, total: 0 })
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    if (Number.isNaN(dt.getTime())) return ''
    return dt.toISOString().split('T')[0]
  }

  const exportExcel = async () => {
    reportMasterRecordDebug('B', 'MasterRecord.jsx:handleExport:consolidated', '[DEBUG] Consolidated export clicked', {
      totalRows: rows.length,
      filters,
      pagination
    })
    try {
      const res = await api.get('/reports/master-record/consolidated', {
        params: {
          search: filters.search,
          projectCategoryId: filters.projectCategoryId,
          export: '1'
        }
      })
      const exportRows = res.data?.data?.rows || []
      const rowsForExport = exportRows.map((row) => [
        row.fileCode || '',
        row.documentTitle || '',
        row.documentType || '',
        row.projectCategory || '',
        row.date ? new Date(row.date).toLocaleDateString('en-GB') : '',
        row.status || '',
        normalizeRevision(row.rev, row.fileCode),
        row.register || ''
      ])

      downloadCsv(
        `consolidated_registry_${new Date().toISOString().slice(0, 10)}.csv`,
        [
          t('file_code'),
          t('mr_doc_title'),
          t('type'),
          t('project_category'),
          t('date'),
          t('status'),
          t('mr_rev'),
          t('mr_register')
        ],
        rowsForExport
      )
    } catch (error) {
      console.error('Failed to export consolidated register:', error)
      setAlertModal({
        show: true,
        title: t('mr_export_failed'),
        message: t('mr_export_failed_desc'),
        type: 'error'
      })
    }
  }

  const visibleToGlobalIndex = (visibleIdx) => {
    const visColId = visibleColumns[visibleIdx]?.id || visibleColumns[visibleIdx]?.key || visibleColumns[visibleIdx]?.accessor
    return orderedColumns.findIndex((c) => (c.id || c.key || c.accessor) === visColId)
  }

  const handleDragStart = (e, visibleIdx) => {
    const globalIdx = visibleToGlobalIndex(visibleIdx)
    if (globalIdx === -1) return
    setDragColIndex(globalIdx)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, visibleIdx) => {
    e.preventDefault()
    const globalIdx = visibleToGlobalIndex(visibleIdx)
    if (globalIdx === -1) return
    setDragOverColIndex(globalIdx)
  }

  const handleDragLeave = () => {
    setDragOverColIndex(null)
  }

  const handleDrop = (e, visibleIdx) => {
    e.preventDefault()
    const toGlobalIdx = visibleToGlobalIndex(visibleIdx)
    if (dragColIndex === null || toGlobalIdx === -1 || dragColIndex === toGlobalIdx) {
      setDragColIndex(null)
      setDragOverColIndex(null)
      return
    }
    moveColumn(dragColIndex, toGlobalIdx)
    setDragColIndex(null)
    setDragOverColIndex(null)
  }

  const handleDragEnd = () => {
    setDragColIndex(null)
    setDragOverColIndex(null)
  }

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pageSize))
  const displayRows = sortedData

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('mr_search')}</label>
            <input
              type="text"
              placeholder={t('mr_file_code_placeholder')}
              value={filters.search}
              onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setCurrentPage(1) }}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-ink-secondary mb-1">{t('project_category')}</label>
            <select
              value={filters.projectCategoryId}
              onChange={(e) => { setFilters({ ...filters, projectCategoryId: e.target.value }); setCurrentPage(1) }}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
              disabled={projectCategories.length === 0}
            >
              <option value="all">All Categories</option>
              {projectCategories.map((pc) => (
                <option key={pc.id} value={pc.id}>
                  {pc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 flex items-end justify-between gap-3">
            <ColumnSettingsButton
              orderedColumns={orderedColumns}
              hiddenColumns={hiddenColumns}
              onToggleColumn={toggleColumnVisibility}
              onReset={resetTableSettings}
            />
            <button
              onClick={exportExcel}
              className="px-4 py-2 bg-[var(--dms-color-success-ink)] text-[color:var(--dms-color-bg-canvas)] rounded-lg hover:opacity-90 transition-colors"
            >
              {t('mr_export_excel')}
            </button>
          </div>
        </div>
      </div>

      <TableContainer className="card overflow-hidden">
        <Table>
          <thead className="bg-surface-muted">
            <Tr>
              {visibleColumns.map((col, visibleIdx) => {
                const colId = col.id || col.key || col.accessor
                const globalIdx = orderedColumns.findIndex((c) => (c.id || c.key || c.accessor) === colId)
                return (
                  <Th
                    key={colId}
                    stickyRight={col.stickyRight}
                    sortable={col.sortable}
                    sortDirection={getSortDirectionFor(colId)}
                    onSort={() => toggleSort(colId)}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, visibleIdx)}
                    onDragOver={(e) => handleDragOver(e, visibleIdx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, visibleIdx)}
                    onDragEnd={handleDragEnd}
                    dragOver={dragOverColIndex === globalIdx}
                    className={col.className}
                  >
                    {col.label || col.header}
                  </Th>
                )
              })}
            </Tr>
          </thead>
          <tbody className="bg-surface divide-y divide-border">
            {loading ? (
              <Tr>
                <Td colSpan={visibleColumns.length} className="py-8 text-center text-ink-muted">{t('loading')}</Td>
              </Tr>
            ) : displayRows.length === 0 ? (
              <Tr>
                <Td colSpan={visibleColumns.length} className="py-8">
                  {(() => {
                    reportMasterRecordDebug('A', 'MasterRecord.jsx:empty:consolidated', '[DEBUG] Rendering Consolidated empty state', {
                      totalRows: rows.length,
                      filters,
                      pagination
                    })
                    return null
                  })()}
                  <EmptyState title={t('no_data')} message={t('no_records')} />
                </Td>
              </Tr>
            ) : displayRows.map((r) => (
              <Tr key={r.fileCode}>
                {visibleColumns.map((col) => {
                  const colId = col.id || col.key || col.accessor
                  let cellValue
                  if (typeof col.accessor === 'function') {
                    cellValue = col.accessor(r, col)
                  } else {
                    cellValue = r?.[col.accessor]
                  }
                  const rendered = col.render ? col.render(cellValue, r) : cellValue
                  return (
                    <Td
                      key={colId}
                      stickyRight={col.stickyRight}
                      className={col.className}
                    >
                      {rendered}
                    </Td>
                  )
                })}
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableContainer>

      {!loading && (pagination.total || 0) > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={pagination.total || 0}
          pageSize={pageSize}
          onPageChange={(p) => setCurrentPage(p)}
          onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1) }}
        />
      )}

      {alertModal.show && (
        <AlertModal
          show={alertModal.show}
          onClose={() => setAlertModal({ ...alertModal, show: false })}
          title={alertModal.title}
          message={alertModal.message}
          type={alertModal.type}
        />
      )}

    </div>
  )
}

export default function MasterRecord() {
  const { t } = usePreferences()
  const [activeTab, setActiveTab] = useState('new-documents')
  const [projectCategories, setProjectCategories] = useState([])
  const [documentTypes, setDocumentTypes] = useState([])
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({
    totalDocuments: 0,
    active: 0,
    newThisMonth: 0,
    obsolete: 0
  })

  useEffect(() => {
    loadStats()
    loadProjectCategories()
    loadDocumentTypes()
    loadUsers()
  }, [])

  const loadProjectCategories = async () => {
    try {
      const res = await api.get('/system/config/project-categories')
      setProjectCategories(res.data?.data?.projectCategories || [])
    } catch (_) {
      setProjectCategories([])
    }
  }

  const loadDocumentTypes = async () => {
    try {
      const res = await api.get('/system/config/document-types')
      setDocumentTypes(res.data?.data?.documentTypes || [])
    } catch (_) {
      setDocumentTypes([])
    }
  }

  const loadUsers = async () => {
    try {
      const res = await api.get('/reports/config/users', { params: { status: 'ACTIVE' } })
      const raw = res.data?.data?.users || []
      const formatted = raw.map((u) => ({
        id: u.id,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || `User ${u.id}`
      }))
      setUsers(formatted)
    } catch (_) {
      setUsers([])
    }
  }

  const loadStats = async () => {
    try {
      const res = await api.get('/reports/dashboard-stats')
      const data = res.data.data?.stats || {}
      
      const now = new Date()
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const newDocsRes = await api.get('/reports/master-record/new-documents', {
        params: {
          dateFrom: firstDayOfMonth.toISOString().split('T')[0]
        }
      })
      const newThisMonth = newDocsRes.data.data?.documents?.length || 0

      setStats({
        totalDocuments: data.documents?.total || 0,
        active: data.documents?.published || 0,
        newThisMonth,
        obsolete: data.documents?.obsolete || 0
      })
    } catch (error) {
      console.error('Failed to load master record stats:', error)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('mr_title')}
        subtitle={t('mr_desc')}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t('mr_total_documents'), value: stats.totalDocuments.toLocaleString(), helper: t('mr_all_registered'), tone: 'text-ink' },
          { label: t('mr_active'), value: stats.active.toLocaleString(), helper: t('mr_currently_in_use'), tone: 'text-emerald-600' },
          { label: t('mr_new_this_month'), value: stats.newThisMonth, helper: t('mr_recently_registered'), tone: 'text-brand' },
          { label: t('status_obsolete'), value: stats.obsolete, helper: t('mr_deprecated_docs'), tone: 'text-amber-600' }
        ].map((card) => (
          <AppSurface key={card.label} padding="lg" variant="muted">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{card.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${card.tone}`}>{card.value}</p>
            <p className="mt-1 text-xs text-ink-muted">{card.helper}</p>
          </AppSurface>
        ))}
      </div>

      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="mt-6">
        {activeTab === 'new-documents' && (
          <NewDocumentRegister
            projectCategories={projectCategories}
            documentTypes={documentTypes}
            users={users}
          />
        )}
        {activeTab === 'new-versions' && (
          <NewVersionRegister projectCategories={projectCategories} users={users} />
        )}
        {activeTab === 'obsolete' && <ObsoleteRegister projectCategories={projectCategories} />}
        {activeTab === 'old-versions' && <OldVersionRegister projectCategories={projectCategories} />}
        {activeTab === 'consolidated' && <ConsolidatedRegister />}
      </div>
    </div>
  )
}
