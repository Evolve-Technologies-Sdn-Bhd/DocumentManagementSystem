import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import Pagination from './Pagination'
import { usePreferences } from '../contexts/PreferencesContext'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import EmptyPanelState from './ui/EmptyPanelState'
import InlineSpinner from './ui/InlineSpinner'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import SelectField from './ui/SelectField'
import { TableContainer, Table, Th, Td, Tr } from './ui/Table'
import TextInput from './ui/TextInput'

// Log Detail Modal Component
function LogDetailModal({ log, onClose }) {
  const { t, formatDateTime } = usePreferences()
  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader title={t('alv_detail_title')} />
      <ModalBody>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('alv_timestamp')}</p>
              <p className="text-sm text-ink">{formatDateTime(log.timestamp)}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('status')}</p>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{t('alv_success')}</span>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('alv_user')}</p>
            <p className="text-sm text-ink">{log.user || t('alv_system')}</p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('alv_ip_address')}</p>
            <p className="text-sm text-ink">{log.ipAddress || '-'}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('alv_module')}</p>
              <p className="text-sm text-ink">{log.module}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('action')}</p>
              <p className="text-sm text-ink">{log.action}</p>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('description')}</p>
            <p className="text-sm text-ink">{log.description || '-'}</p>
          </div>

          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('alv_additional_details')}</p>
              <AppSurface padding="md" variant="muted">
                <pre className="overflow-x-auto text-xs text-ink-secondary">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </AppSurface>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>{t('close')}</Button>
      </ModalFooter>
    </Modal>
  )
}

// All possible action types in the system
const ALL_ACTION_TYPES = [
  // Authentication
  'LOGIN',
  'LOGOUT',
  'PASSWORD_CHANGE',
  'PASSWORD_RESET',
  // Document actions
  'CREATE',
  'UPDATE',
  'DELETE',
  'UPLOAD',
  'DOWNLOAD',
  'VIEW',
  'ACKNOWLEDGE',
  'REJECT',
  // Workflow actions
  'SUBMIT_FOR_REVIEW',
  'REVIEW_APPROVE',
  'REVIEW_RETURN',
  'FIRST_APPROVE',
  'FIRST_RETURN',
  'SECOND_APPROVE',
  'SECOND_RETURN',
  'PUBLISH',
  'ARCHIVE',
  // Supersede/Obsolete actions
  'SUPERSEDE',
  'OBSOLETE',
  'SUPERSEDE_REQUEST',
  'SUPERSEDE_REVIEW_APPROVE',
  'SUPERSEDE_REVIEW_REJECT',
  'SUPERSEDE_FINAL_APPROVE',
  'SUPERSEDE_REJECT',
  // Version request actions
  'VERSION_REQUEST',
  'VERSION_ACKNOWLEDGE',
  'VERSION_REVIEW_APPROVE',
  'VERSION_REVIEW_REJECT',
  'VERSION_FINAL_APPROVE',
  'VERSION_REJECT',
  // User management
  'ACTIVATE',
  'DEACTIVATE',
  'ROLE_ASSIGN',
  'ROLE_REMOVE',
  // Role management
  'ROLE_CREATE',
  'ROLE_UPDATE',
  'ROLE_DELETE',
  'ROLE_PERMISSION_UPDATE',
  // Folder management
  'FOLDER_CREATE',
  'FOLDER_UPDATE',
  'FOLDER_DELETE',
]

// Main Audit Logs Viewer Component
export default function AuditLogsViewer() {
  const { t, itemsPerPage, formatDateTime } = usePreferences()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    dateRange: '7days',
    module: 'all',
    action: 'all',
    user: 'all',
    search: ''
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [totalRecords, setTotalRecords] = useState(0)
  const [selectedLog, setSelectedLog] = useState(null)
  const [filterOptions, setFilterOptions] = useState({
    modules: [],
    actions: ALL_ACTION_TYPES,
    users: []
  })

  // Load filter options on mount
  useEffect(() => {
    loadFilterOptions()
  }, [])

  // Load logs when filters or page changes
  useEffect(() => {
    loadLogs()
  }, [filters, currentPage, pageSize])

  const loadFilterOptions = async () => {
    try {
      const res = await api.get('/reports/activity-logs/filters')
      const data = res.data?.data || {}
      
      // Merge API actions with predefined actions (remove duplicates)
      const apiActions = Array.isArray(data.actions) ? data.actions : []
      const allActions = [...new Set([...ALL_ACTION_TYPES, ...apiActions])]
      
      setFilterOptions({
        modules: Array.isArray(data.modules) ? data.modules : [],
        actions: allActions,
        users: Array.isArray(data.users) ? data.users : []
      })
    } catch (error) {
      console.error('Failed to load filter options:', error)
      setFilterOptions({ modules: [], actions: ALL_ACTION_TYPES, users: [] })
    }
  }

  const loadLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: pageSize,
        dateRange: filters.dateRange,
        ...(filters.module !== 'all' && { module: filters.module }),
        ...(filters.action !== 'all' && { action: filters.action }),
        ...(filters.user !== 'all' && { user: filters.user }),
        ...(filters.search && { search: filters.search })
      })
      const res = await api.get(`/reports/activity-logs?${params}`)
      setLogs(res.data?.data?.logs || [])
      setTotalRecords(res.data?.data?.pagination?.total || 0)
    } catch (error) {
      console.error('Failed to load logs:', error)
      setLogs([])
      setTotalRecords(0)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }))
    setCurrentPage(1)
  }

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
  }

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
  }

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        dateRange: filters.dateRange,
        ...(filters.module !== 'all' && { module: filters.module }),
        ...(filters.action !== 'all' && { action: filters.action }),
        ...(filters.user !== 'all' && { user: filters.user }),
        ...(filters.search && { search: filters.search })
      })
      const res = await api.get(`/reports/activity-logs/export?${params}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `activity_logs_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      console.error('Failed to export logs:', error)
      alert('Export failed. Please try again.')
    }
  }

  const getActionBadge = (action) => {
    const colors = {
      // Document actions
      CREATE: 'bg-blue-100 text-blue-800',
      UPDATE: 'bg-yellow-100 text-yellow-800',
      DELETE: 'bg-red-100 text-red-800',
      UPLOAD: 'bg-purple-100 text-purple-800',
      DRAFT_UPLOAD: 'bg-purple-100 text-purple-800',
      DOWNLOAD: 'bg-green-100 text-green-800',
      VIEW: 'bg-gray-100 text-gray-800',
      ACKNOWLEDGE: 'bg-green-100 text-green-800',
      REJECT: 'bg-orange-100 text-orange-800',
      // Workflow actions
      SUBMIT_FOR_REVIEW: 'bg-blue-100 text-blue-800',
      APPROVE: 'bg-teal-100 text-teal-800',
      REVIEW_APPROVE: 'bg-teal-100 text-teal-800',
      REVIEW_RETURN: 'bg-orange-100 text-orange-800',
      FIRST_APPROVE: 'bg-teal-100 text-teal-800',
      FIRST_RETURN: 'bg-orange-100 text-orange-800',
      SECOND_APPROVE: 'bg-teal-100 text-teal-800',
      SECOND_RETURN: 'bg-orange-100 text-orange-800',
      PUBLISH: 'bg-emerald-100 text-emerald-800',
      ARCHIVE: 'bg-slate-100 text-slate-800',
      // Supersede/Obsolete actions
      SUPERSEDE: 'bg-amber-100 text-amber-800',
      OBSOLETE: 'bg-gray-100 text-gray-800',
      SUPERSEDE_REQUEST: 'bg-amber-100 text-amber-800',
      SUPERSEDE_REVIEW_APPROVE: 'bg-teal-100 text-teal-800',
      SUPERSEDE_REVIEW_REJECT: 'bg-orange-100 text-orange-800',
      SUPERSEDE_FINAL_APPROVE: 'bg-emerald-100 text-emerald-800',
      SUPERSEDE_REJECT: 'bg-red-100 text-red-800',
      // Version request actions
      VERSION_REQUEST: 'bg-blue-100 text-blue-800',
      VERSION_ACKNOWLEDGE: 'bg-green-100 text-green-800',
      VERSION_REVIEW_APPROVE: 'bg-teal-100 text-teal-800',
      VERSION_REVIEW_REJECT: 'bg-orange-100 text-orange-800',
      VERSION_FINAL_APPROVE: 'bg-emerald-100 text-emerald-800',
      VERSION_REJECT: 'bg-red-100 text-red-800',
      // Auth actions
      LOGIN: 'bg-indigo-100 text-indigo-800',
      LOGOUT: 'bg-gray-100 text-gray-800',
      PASSWORD_CHANGE: 'bg-purple-100 text-purple-800',
      PASSWORD_RESET: 'bg-purple-100 text-purple-800',
      // User management
      ACTIVATE: 'bg-green-100 text-green-800',
      DEACTIVATE: 'bg-red-100 text-red-800',
      ROLE_ASSIGN: 'bg-blue-100 text-blue-800',
      ROLE_REMOVE: 'bg-orange-100 text-orange-800',
      // Role management
      ROLE_CREATE: 'bg-blue-100 text-blue-800',
      ROLE_UPDATE: 'bg-yellow-100 text-yellow-800',
      ROLE_DELETE: 'bg-red-100 text-red-800',
      ROLE_PERMISSION_UPDATE: 'bg-yellow-100 text-yellow-800',
      // Folder management
      FOLDER_CREATE: 'bg-blue-100 text-blue-800',
      FOLDER_UPDATE: 'bg-yellow-100 text-yellow-800',
      FOLDER_DELETE: 'bg-red-100 text-red-800',
    }
    const colorClass = colors[action] || 'bg-gray-100 text-gray-800'
    return <span className={`px-2 py-1 text-xs font-medium rounded ${colorClass}`}>{action}</span>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">{t('alv_header')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('alv_header_desc')}</p>
      </div>

      <AppSurface padding="lg" variant="muted">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('alv_date_range')}</label>
            <SelectField
              value={filters.dateRange}
              onChange={(e) => handleFilterChange('dateRange', e.target.value)}
            >
              <option value="today">{t('alv_today')}</option>
              <option value="7days">{t('alv_7days')}</option>
              <option value="30days">{t('alv_30days')}</option>
              <option value="90days">{t('alv_90days')}</option>
              <option value="custom">{t('alv_custom_range')}</option>
            </SelectField>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('alv_module')}</label>
            <SelectField
              value={filters.module}
              onChange={(e) => handleFilterChange('module', e.target.value)}
            >
              <option value="all">{t('alv_all_modules')}</option>
              {filterOptions.modules.map(module => (
                <option key={module} value={module}>{module}</option>
              ))}
            </SelectField>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('action')}</label>
            <SelectField
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
            >
              <option value="all">{t('alv_all_actions')}</option>
              <optgroup label={t('alv_auth_group')}>
                <option value="LOGIN">LOGIN</option>
                <option value="LOGOUT">LOGOUT</option>
                <option value="PASSWORD_CHANGE">PASSWORD_CHANGE</option>
                <option value="PASSWORD_RESET">PASSWORD_RESET</option>
              </optgroup>
              <optgroup label={t('alv_doc_actions_group')}>
                <option value="CREATE">CREATE</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
                <option value="UPLOAD">UPLOAD</option>
                <option value="DRAFT_UPLOAD">DRAFT_UPLOAD</option>
                <option value="DOWNLOAD">DOWNLOAD</option>
                <option value="VIEW">VIEW</option>
                <option value="ACKNOWLEDGE">ACKNOWLEDGE</option>
                <option value="REJECT">REJECT</option>
              </optgroup>
              <optgroup label={t('alv_workflow_group')}>
                <option value="SUBMIT_FOR_REVIEW">SUBMIT_FOR_REVIEW</option>
                <option value="REVIEW_APPROVE">REVIEW_APPROVE</option>
                <option value="REVIEW_RETURN">REVIEW_RETURN</option>
                <option value="FIRST_APPROVE">FIRST_APPROVE</option>
                <option value="FIRST_RETURN">FIRST_RETURN</option>
                <option value="SECOND_APPROVE">SECOND_APPROVE</option>
                <option value="SECOND_RETURN">SECOND_RETURN</option>
                <option value="PUBLISH">PUBLISH</option>
                <option value="ARCHIVE">ARCHIVE</option>
              </optgroup>
              <optgroup label={t('alv_supersede_group')}>
                <option value="SUPERSEDE">SUPERSEDE</option>
                <option value="OBSOLETE">OBSOLETE</option>
                <option value="SUPERSEDE_REQUEST">SUPERSEDE_REQUEST</option>
                <option value="SUPERSEDE_REVIEW_APPROVE">SUPERSEDE_REVIEW_APPROVE</option>
                <option value="SUPERSEDE_REVIEW_REJECT">SUPERSEDE_REVIEW_REJECT</option>
                <option value="SUPERSEDE_FINAL_APPROVE">SUPERSEDE_FINAL_APPROVE</option>
                <option value="SUPERSEDE_REJECT">SUPERSEDE_REJECT</option>
              </optgroup>
              <optgroup label={t('alv_version_group')}>
                <option value="VERSION_REQUEST">VERSION_REQUEST</option>
                <option value="VERSION_ACKNOWLEDGE">VERSION_ACKNOWLEDGE</option>
                <option value="VERSION_REVIEW_APPROVE">VERSION_REVIEW_APPROVE</option>
                <option value="VERSION_REVIEW_REJECT">VERSION_REVIEW_REJECT</option>
                <option value="VERSION_FINAL_APPROVE">VERSION_FINAL_APPROVE</option>
                <option value="VERSION_REJECT">VERSION_REJECT</option>
              </optgroup>
              <optgroup label={t('alv_user_mgmt_group')}>
                <option value="ACTIVATE">ACTIVATE</option>
                <option value="DEACTIVATE">DEACTIVATE</option>
                <option value="ROLE_ASSIGN">ROLE_ASSIGN</option>
                <option value="ROLE_REMOVE">ROLE_REMOVE</option>
              </optgroup>
              <optgroup label={t('alv_role_mgmt_group')}>
                <option value="ROLE_CREATE">ROLE_CREATE</option>
                <option value="ROLE_UPDATE">ROLE_UPDATE</option>
                <option value="ROLE_DELETE">ROLE_DELETE</option>
                <option value="ROLE_PERMISSION_UPDATE">ROLE_PERMISSION_UPDATE</option>
              </optgroup>
              <optgroup label={t('alv_folder_mgmt_group')}>
                <option value="FOLDER_CREATE">FOLDER_CREATE</option>
                <option value="FOLDER_UPDATE">FOLDER_UPDATE</option>
                <option value="FOLDER_DELETE">FOLDER_DELETE</option>
              </optgroup>
            </SelectField>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('alv_user')}</label>
            <SelectField
              value={filters.user}
              onChange={(e) => handleFilterChange('user', e.target.value)}
            >
              <option value="all">{t('alv_all_users')}</option>
              {filterOptions.users.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </SelectField>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <div className="flex-1">
            <TextInput
              placeholder={t('alv_search_placeholder')}
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </div>
          <Button
            onClick={handleExport}
            data-tour-id="logs-export-activity"
            className="md:self-end"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>{t('alv_export_csv')}</span>
          </Button>
        </div>
      </AppSurface>

      <TableContainer>
        <Table>
          <thead className="bg-surface-muted/80">
              <tr>
                <Th>
                  {t('alv_timestamp')}
                </Th>
                <Th>
                  {t('alv_user')}
                </Th>
                <Th>
                  {t('alv_module')}
                </Th>
                <Th>
                  {t('action')}
                </Th>
                <Th>
                  {t('description')}
                </Th>
                <Th>
                  {t('view_details')}
                </Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <Td colSpan="6" className="py-10 text-center">
                    <span className="inline-flex items-center gap-2 text-ink-muted">
                      <InlineSpinner />
                      {t('loading')}...
                    </span>
                  </Td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <Td colSpan="6" className="py-8">
                    <EmptyPanelState
                      title={t('alv_no_logs')}
                      description={filters.search ? t('alv_no_logs_search_desc') : t('alv_no_logs_filter_desc')}
                    />
                  </Td>
                </tr>
              ) : (
                logs.map((log) => (
                  <Tr key={log.id}>
                    <Td className="whitespace-nowrap text-ink">
                      {formatDateTime(log.timestamp)}
                    </Td>
                    <Td className="font-medium text-ink">
                      {log.user || t('alv_system')}
                    </Td>
                    <Td>
                      {log.module}
                    </Td>
                    <Td>
                      {getActionBadge(log.action)}
                    </Td>
                    <Td className="text-ink">
                      <div className="max-w-xs truncate" title={log.description}>{log.description || '-'}</div>
                    </Td>
                    <Td>
                      <Button
                        onClick={() => setSelectedLog(log)}
                        variant="ghost"
                        size="sm"
                      >
                        {t('alv_view')}
                      </Button>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>

        {!loading && totalRecords > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(totalRecords / pageSize)}
            totalRecords={totalRecords}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        )}
      </TableContainer>

      {selectedLog && (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  )
}
