import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import ActionMenu from '../components/ActionMenu'
import ConfirmModal, { AlertModal } from '../components/ConfirmModal'
import EmptyState from '../components/EmptyState'
import Pagination from '../components/Pagination'
import AppSurface from '../components/ui/AppSurface'
import Button from '../components/ui/Button'
import EmptyPanelState from '../components/ui/EmptyPanelState'
import InlineSpinner from '../components/ui/InlineSpinner'
import PageHeader from '../components/ui/PageHeader'
import SelectField from '../components/ui/SelectField'
import { TableContainer, Table, Th, Td, Tr } from '../components/ui/Table'
import TextInput from '../components/ui/TextInput'
import { usePreferences } from '../contexts/PreferencesContext'
import { isAdmin } from '../utils/permissions'

const MASTER_RECORD_DEBUG_URL = 'http://127.0.0.1:7777/event'
const reportMasterRecordDebug = (hypothesisId, location, msg, data = {}, runId = 'pre-fix') => {
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

const escapeHtmlCell = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const downloadExcelTable = (fileName, headers, rows) => {
  const html = `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtmlCell(header)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtmlCell(cell)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const link = window.document.createElement('a')
  link.href = window.URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  window.URL.revokeObjectURL(link.href)
}

// Tab Navigation Component
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

// New Document Register Component
function NewDocumentRegister({ projectCategories = [], documentTypes = [], users = [] }) {
  const { itemsPerPage, t } = usePreferences()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    loadDocuments()
  }, [filters, currentPage])

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const res = await api.get('/reports/master-record/new-documents', { params: filters })
      setDocuments(res.data.data?.documents || [])
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

  const handleExport = async () => {
    try {
      const res = await api.get('/reports/master-record/new-documents', { params: filters })
      const exportRows = res.data?.data?.documents || []
      const rows = exportRows.map((doc) => [
        doc.fileCode || '',
        doc.title || '',
        doc.type || '',
        doc.projectCategory || '',
        doc.version || '',
        doc.registeredDate || '',
        doc.owner || '',
        doc.department || '',
        doc.status || ''
      ])

      downloadExcelTable(
        `new_document_register_${new Date().toISOString().slice(0, 10)}.xls`,
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

  // Pagination calculations
  const filteredDocuments = documents.filter((doc) => {
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
        <div className="mt-4 flex justify-end">
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
              <tr>
                <Th>
                  {t('file_code')}
                </Th>
                <Th>
                  {t('mr_doc_title')}
                </Th>
                <Th>
                  {t('type')}
                </Th>
                <Th>
                  {t('project_category')}
                </Th>
                <Th>
                  {t('version')}
                </Th>
                <Th>
                  {t('mr_registered_date')}
                </Th>
                <Th>
                  {t('owner')}
                </Th>
                <Th>
                  {t('status')}
                </Th>
                <Th>
                  {t('actions')}
                </Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <Td colSpan="9" className="py-10 text-center">
                    <span className="inline-flex items-center gap-2 text-ink-muted">
                      <InlineSpinner />
                      {t('mr_loading_documents')}
                    </span>
                  </Td>
                </tr>
              ) : paginatedDocuments.length === 0 ? (
                <tr>
                  <Td colSpan="9" className="py-8">
                    <EmptyPanelState
                      title={t('mr_no_docs_found')}
                      description={filters.search ? t('mr_try_adjust') : t('mr_no_docs_registered')}
                    />
                  </Td>
                </tr>
              ) : (
                paginatedDocuments.map((doc) => (
                  <Tr key={doc.id}>
                    <Td className="font-medium text-brand">
                      {doc.fileCode}
                    </Td>
                    <Td className="text-ink">
                      {doc.title}
                    </Td>
                    <Td>
                      {doc.type}
                    </Td>
                    <Td>
                      {doc.projectCategory || ''}
                    </Td>
                    <Td>
                      {(() => {
                        const seg = String(doc.fileCode || '').split('/')[1] || ''
                        const m = /^(\d+)([a-zA-Z]*)$/.exec(String(seg || '').trim())
                        if (!m) return doc.version
                        const digitsStr = m[1]
                        const suffix = (m[2] || '').toLowerCase()
                        const digitsLen = Math.max(2, digitsStr.length)
                        return `${digitsStr.padStart(digitsLen, '0')}${suffix}` || doc.version
                      })()}
                    </Td>
                    <Td>
                      {doc.registeredDate}
                    </Td>
                    <Td>
                      <div>{doc.owner}</div>
                      <div className="text-xs text-ink-muted">{doc.department}</div>
                    </Td>
                    <Td>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {doc.status}
                      </span>
                    </Td>
                    <Td>
                      <ActionMenu
                        actions={[
                          { label: 'View', onClick: () => console.log('View document:', doc) },
                          { label: 'Download', onClick: () => console.log('Download document:', doc) },
                          ...(isAdmin() ? [{
                            label: 'Delete',
                            variant: 'destructive',
                            onClick: () => setConfirmModal({
                              show: true,
                              title: 'Delete document records?',
                              message: `This will permanently delete ALL records for "${doc.fileCode}" (document, versions, registers, and stored files). This action cannot be undone.`,
                              onConfirm: () => purgeByFileCode(doc.fileCode)
                            })
                          }] : [])
                        ]}
                      />
                    </Td>
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
  )
}

// New Version Register Component
function NewVersionRegister({ projectCategories = [], users = [] }) {
  const { itemsPerPage, t } = usePreferences()
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    loadVersions()
  }, [filters])

  const loadVersions = async () => {
    setLoading(true)
    try {
      const res = await api.get('/reports/master-record/version-register', { params: filters })
      const data = res.data.data?.records || []
      
      // Format for frontend
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
    // #region debug-point B:new-version-export
    reportMasterRecordDebug('B', 'MasterRecord.jsx:handleExport:new-versions', '[DEBUG] New Version export clicked', {
      totalRows: versions.length,
      filters
    })
    // #endregion
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

      downloadExcelTable(
        `new_version_register_${new Date().toISOString().slice(0, 10)}.xls`,
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

  // Pagination calculations
  const filteredVersions = versions.filter((v) => {
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
      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_version_date_from')}</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_version_date_to')}</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_previous_version')}</label>
            <input
              type="text"
              placeholder="e.g., 02a"
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_updated_by')}</label>
            <select
              value={filters.owner}
              onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('project_category')}</label>
            <select
              value={filters.projectCategoryId}
              onChange={(e) => setFilters({ ...filters, projectCategoryId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_search')}</label>
            <input
              type="text"
              placeholder={t('mr_file_code_placeholder')}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('mr_export_excel')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('file_code')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_doc_title')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('project_category')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_previous_version')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_new_version')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_version_date')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_updated_by')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_change_summary')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                    {t('mr_loading_versions')}
                  </td>
                </tr>
              ) : paginatedVersions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8">
                    {/* #region debug-point A:new-version-empty */}
                    {(() => {
                      reportMasterRecordDebug('A', 'MasterRecord.jsx:empty:new-versions', '[DEBUG] Rendering New Version empty state', {
                        totalRows: versions.length,
                        filteredRows: paginatedVersions.length,
                        filters
                      })
                      return null
                    })()}
                    {/* #endregion */}
                    <EmptyState
                      message={t('mr_no_versions')}
                      description={filters.search ? t('mr_try_adjust') : t('mr_no_new_versions')}
                      actionLabel={filters.search ? 'Clear Search' : null}
                      onAction={filters.search ? () => setFilters({ ...filters, search: '' }) : null}
                    />
                  </td>
                </tr>
              ) : (
                paginatedVersions.map((version) => (
                <tr key={version.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">{version.fileCode}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{version.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{version.projectCategory}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{version.previousVersion}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      {version.newVersion}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{version.versionDate}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{version.updatedBy}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{version.changeSummary}</td>
                  <td className="px-4 py-3 text-sm">
                    <ActionMenu
                      actions={[
                        { label: t('mr_compare'), onClick: () => console.log('Compare version:', version) }
                      ]}
                    />
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
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
    </div>
  )
}

// Obsolete Register Component
function ObsoleteRegister({ projectCategories = [] }) {
  const { itemsPerPage, t } = usePreferences()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    loadObsoleteDocuments()
  }, [filters])

  const loadObsoleteDocuments = async () => {
    setLoading(true)
    try {
      const res = await api.get('/reports/master-record/obsolete-register', { params: filters })
      const data = res.data.data?.records || []
      
      // Format for frontend
      const formattedDocs = data.map(record => ({
        id: record.id,
        fileCode: record.fileCode,
        title: record.documentTitle,
        type: record.documentType,
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
    // #region debug-point A:obsolete-export
    reportMasterRecordDebug('A', 'MasterRecord.jsx:handleExport:obsolete', '[DEBUG] Obsolete export clicked', {
      totalRows: documents.length,
      filters
    })
    // #endregion
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

        downloadExcelTable(
          `obsolete_register_${new Date().toISOString().slice(0, 10)}.xls`,
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

  // Pagination calculations
  const filteredDocuments = documents.filter((doc) => {
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
      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_obsolete_date_from')}</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_obsolete_date_to')}</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('document_type')}</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">{t('mr_all_types')}</option>
              <option value="procedure">Procedure</option>
              <option value="policy">Policy</option>
              <option value="manual">Manual</option>
              <option value="form">Form</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_reason')}</label>
            <select
              value={filters.reason}
              onChange={(e) => setFilters({ ...filters, reason: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">{t('mr_all_reasons')}</option>
              <option value="decommissioned">System decommissioned</option>
              <option value="outdated">Outdated</option>
              <option value="replaced">Replaced by new document</option>
              <option value="merged">Merged with another document</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('project_category')}</label>
            <select
              value={filters.projectCategoryId}
              onChange={(e) => setFilters({ ...filters, projectCategoryId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_search')}</label>
            <input
              type="text"
              placeholder={t('mr_file_code_placeholder')}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('mr_export_excel')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('file_code')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_doc_title')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('type')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('project_category')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_obsolete_date')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_reason')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_replaced_by')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                    {t('mr_loading_documents')}
                  </td>
                </tr>
              ) : paginatedDocuments.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8">
                    {/* #region debug-point A:obsolete-empty */}
                    {(() => {
                      reportMasterRecordDebug('A', 'MasterRecord.jsx:empty:obsolete', '[DEBUG] Rendering Obsolete empty state', {
                        totalRows: documents.length,
                        filteredRows: paginatedDocuments.length,
                        filters
                      })
                      return null
                    })()}
                    {/* #endregion */}
                    <EmptyState
                      message={t('mr_no_obsolete_docs')}
                      description={filters.search ? t('mr_try_adjust') : t('mr_no_obsolete_yet')}
                      actionLabel={filters.search ? 'Clear Search' : null}
                      onAction={filters.search ? () => setFilters({ ...filters, search: '' }) : null}
                    />
                  </td>
                </tr>
              ) : (
                paginatedDocuments.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-600">{doc.fileCode}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{doc.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{doc.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{doc.projectCategory}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{doc.obsoleteDate}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{doc.reason}</td>
                  <td className="px-4 py-3 text-sm text-blue-600 font-medium">{doc.replacedBy}</td>
                  <td className="px-4 py-3 text-sm">
                    <ActionMenu
                      actions={[
                        { label: t('mr_view_archive'), onClick: () => console.log('View archive:', doc) }
                      ]}
                    />
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
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
  )
}

// Old Version Register Component
function OldVersionRegister({ projectCategories = [] }) {
  const { itemsPerPage, t } = usePreferences()
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    loadArchivedVersions()
  }, [filters])

  const loadArchivedVersions = async () => {
    setLoading(true)
    try {
      const res = await api.get('/reports/master-record/archive-register', { params: filters })
      const data = res.data.data?.records || []
      
      // Format for frontend
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
    // #region debug-point A:old-version-export
    reportMasterRecordDebug('A', 'MasterRecord.jsx:handleExport:old-versions', '[DEBUG] Old Version export clicked', {
      totalRows: versions.length,
      filters
    })
    // #endregion
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

        downloadExcelTable(
          `old_version_register_${new Date().toISOString().slice(0, 10)}.xls`,
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

  // Pagination calculations
  const filteredVersions = versions.filter((v) => {
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
      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_archived_date_from')}</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_archived_date_to')}</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_old_version')}</label>
            <input
              type="text"
              placeholder="e.g., 1.0"
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_current_version')}</label>
            <input
              type="text"
              placeholder="e.g., 2.2"
              value={filters.owner}
              onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('project_category')}</label>
            <select
              value={filters.projectCategoryId}
              onChange={(e) => setFilters({ ...filters, projectCategoryId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_search')}</label>
            <input
              type="text"
              placeholder={t('mr_file_code_placeholder')}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('mr_export_excel')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('file_code')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_doc_title')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('project_category')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_old_version')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_current_version')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_archived_date')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('mr_retention_until')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                    {t('mr_loading_versions')}
                  </td>
                </tr>
              ) : paginatedVersions.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8">
                    {/* #region debug-point A:old-version-empty */}
                    {(() => {
                      reportMasterRecordDebug('A', 'MasterRecord.jsx:empty:old-versions', '[DEBUG] Rendering Old Version empty state', {
                        totalRows: versions.length,
                        filteredRows: paginatedVersions.length,
                        filters
                      })
                      return null
                    })()}
                    {/* #endregion */}
                    <EmptyState
                      message={t('mr_no_old_versions')}
                      description={filters.search ? t('mr_try_adjust') : t('mr_no_archived_versions')}
                      actionLabel={filters.search ? 'Clear Search' : null}
                      onAction={filters.search ? () => setFilters({ ...filters, search: '' }) : null}
                    />
                  </td>
                </tr>
              ) : (
                paginatedVersions.map((version) => (
                <tr key={version.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">{version.fileCode}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{version.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{version.projectCategory}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{version.version}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                      {version.currentVersion}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{version.archivedDate}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{version.retentionUntil}</td>
                  <td className="px-4 py-3 text-sm">
                    <ActionMenu
                      actions={[
                        { label: t('mr_restore'), onClick: () => console.log('Restore version:', version) }
                      ]}
                    />
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
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
    // #region debug-point B:consolidated-export
    reportMasterRecordDebug('B', 'MasterRecord.jsx:handleExport:consolidated', '[DEBUG] Consolidated export clicked', {
      totalRows: rows.length,
      filters,
      pagination
    })
    // #endregion
    try {
      const res = await api.get('/reports/master-record/consolidated', {
        params: {
          search: filters.search,
          projectCategoryId: filters.projectCategoryId,
          export: 'excel'
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
        row.rev || '',
        row.register || ''
      ])

      downloadExcelTable(
        `consolidated_registry_${new Date().toISOString().slice(0, 10)}.xls`,
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


  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pageSize))

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('mr_search')}</label>
            <input
              type="text"
              placeholder={t('mr_file_code_placeholder')}
              value={filters.search}
              onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setCurrentPage(1) }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('project_category')}</label>
            <select
              value={filters.projectCategoryId}
              onChange={(e) => { setFilters({ ...filters, projectCategoryId: e.target.value }); setCurrentPage(1) }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
          <div className="md:col-span-2 flex items-end justify-end gap-3">
            <button
              onClick={exportExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              {t('mr_export_excel')}
            </button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('file_code')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('mr_doc_title')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('type')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('project_category')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('date')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('status')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('mr_rev')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('mr_register')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">{t('loading')}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8">
                    {/* #region debug-point A:consolidated-empty */}
                    {(() => {
                      reportMasterRecordDebug('A', 'MasterRecord.jsx:empty:consolidated', '[DEBUG] Rendering Consolidated empty state', {
                        totalRows: rows.length,
                        filters,
                        pagination
                      })
                      return null
                    })()}
                    {/* #endregion */}
                    <EmptyState title={t('no_data')} message={t('no_records')} />
                  </td>
                </tr>
              ) : rows.map((r) => (
                <tr key={r.fileCode}>
                  <td className="px-4 py-3 text-sm font-mono text-blue-600">{r.fileCode}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{r.documentTitle}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.documentType}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.projectCategory}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.date ? new Date(r.date).toLocaleDateString('en-GB') : ''}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.status}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.rev}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.register}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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

// Main Master Record Component
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
      
      // Calculate new this month
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

      {/* Tab Navigation */}
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
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
