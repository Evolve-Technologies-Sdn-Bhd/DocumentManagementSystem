import React, { useEffect, useState } from 'react'
import { usePreferences } from '../contexts/PreferencesContext'
import api from '../api/axios'
import Pagination from './Pagination'
import { formatDateTime } from '../utils/dateFormatter'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import EmptyPanelState from './ui/EmptyPanelState'
import InlineSpinner from './ui/InlineSpinner'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import SelectField from './ui/SelectField'
import { TableContainer, Table, Th, Td, Tr } from './ui/Table'
import TextInput from './ui/TextInput'

function UserActivityDetailModal({ activity, onClose }) {
  const { t } = usePreferences()

  return (
    <Modal onClose={onClose} size="xl">
      <ModalHeader title={`${t('ual_detail_title')} - ${activity.userName}`} onClose={onClose} />
      <ModalBody>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('alv_user')}</p>
              <p className="text-sm font-medium text-ink">{activity.userName}</p>
              <p className="text-xs text-ink-muted">{activity.email}</p>
              <p className="text-xs text-ink-muted">{activity.role}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('department')}</p>
              <p className="text-sm text-ink">{activity.department || 'N/A'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('ual_login_time')}</p>
              <p className="text-sm text-ink">{formatDateTime(activity.loginTime)}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('ual_logout_time')}</p>
              <p className="text-sm text-ink">{activity.logoutTime ? formatDateTime(activity.logoutTime) : t('ual_still_active')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('ual_session_duration')}</p>
              <p className="text-sm text-ink">{activity.duration}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('alv_ip_address')}</p>
              <p className="text-sm text-ink">{activity.ipAddress}</p>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('ual_device')}</p>
            <p className="text-sm text-ink">{activity.device}</p>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('ual_activity_summary')}</p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: t('ual_pages_viewed'), value: activity.pagesViewed || 0, tone: 'text-brand' },
                { label: t('ual_docs_accessed'), value: activity.documentsAccessed || 0, tone: 'text-emerald-600' },
                { label: t('ual_actions_performed'), value: activity.actionsPerformed || 0, tone: 'text-violet-600' },
                { label: t('ual_downloads'), value: activity.downloads || 0, tone: 'text-amber-600' }
              ].map((item) => (
                <AppSurface key={item.label} padding="md" variant="muted">
                  <p className="text-xs text-ink-muted">{item.label}</p>
                  <p className={`mt-2 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
                </AppSurface>
              ))}
            </div>
          </div>

          {activity.recentActions && activity.recentActions.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-soft">{t('ual_recent_actions')}</p>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {activity.recentActions.map((action, index) => (
                  <AppSurface key={index} className="flex items-center justify-between gap-3" padding="md" variant="muted">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink">{action.action}</p>
                      <p className="text-xs text-ink-muted">{action.entityName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-ink-muted">{formatDateTime(action.time)}</p>
                      <span className="mt-1 inline-flex rounded-full bg-surface px-2 py-1 text-xs text-ink-secondary">
                        {action.module}
                      </span>
                    </div>
                  </AppSurface>
                ))}
              </div>
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

function SummaryCard({ label, value, tone = 'text-brand' }) {
  return (
    <AppSurface padding="lg" variant="muted">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${tone}`}>{value}</p>
    </AppSurface>
  )
}

export default function UserActivityLogs() {
  const { t } = usePreferences()
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    dateRange: '7days',
    user: 'all',
    department: 'all',
    status: 'all',
    search: ''
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [totalRecords, setTotalRecords] = useState(0)
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [stats, setStats] = useState({
    activeUsers: 0,
    totalSessionsToday: 0,
    avgSessionDuration: '0h 0m',
    totalActionsToday: 0
  })
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])

  useEffect(() => {
    loadUsers()
    loadStats()
  }, [])

  useEffect(() => {
    loadActivities()
  }, [filters, currentPage])

  const loadUsers = async () => {
    try {
      const res = await api.get('/users')
      const userList = res.data.data?.users || res.data.data || []
      setUsers(userList)
      setDepartments([...new Set(userList.map((u) => u.department).filter(Boolean))])
    } catch (error) {
      console.error('Failed to load users:', error)
      setUsers([])
      setDepartments([])
    }
  }

  const loadStats = async () => {
    try {
      const res = await api.get('/audit/user-activities/stats')
      setStats(res.data.data?.stats || res.data.data || {})
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const loadActivities = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: pageSize,
        dateRange: filters.dateRange,
        user: filters.user,
        department: filters.department,
        status: filters.status,
        search: filters.search
      })
      const res = await api.get(`/audit/user-activities?${params}`)
      const data = res.data.data
      setActivities(data.activities || [])
      setTotalRecords(data.total || 0)
    } catch (error) {
      console.error('Failed to load user activities:', error)
      setActivities([])
      setTotalRecords(0)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
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
      const params = new URLSearchParams(filters)
      const res = await api.get(`/audit/user-activities/export?${params}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `user_activities_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export user activities:', error)
      alert('Export failed. Please try again.')
    }
  }

  const getStatusBadge = (status) => {
    if (status === 'Active') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {t('ual_active')}
        </span>
      )
    }
    return <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-secondary">{t('ual_completed')}</span>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={t('ual_active_users')} value={stats.activeUsers} tone="text-emerald-600" />
        <SummaryCard label={t('ual_total_sessions')} value={stats.totalSessionsToday} tone="text-brand" />
        <SummaryCard label={t('ual_avg_duration')} value={stats.avgSessionDuration} tone="text-violet-600" />
        <SummaryCard label={t('ual_total_actions')} value={stats.totalActionsToday.toLocaleString()} tone="text-amber-600" />
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
            </SelectField>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('alv_user')}</label>
            <SelectField
              value={filters.user}
              onChange={(e) => handleFilterChange('user', e.target.value)}
            >
              <option value="all">{t('ual_all_users')}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email}
                </option>
              ))}
            </SelectField>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('department')}</label>
            <SelectField
              value={filters.department}
              onChange={(e) => handleFilterChange('department', e.target.value)}
            >
              <option value="all">{t('ual_all_departments')}</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </SelectField>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">{t('status')}</label>
            <SelectField
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="all">{t('ual_all_status')}</option>
              <option value="active">{t('ual_active_sessions_filter')}</option>
              <option value="completed">{t('ual_completed_sessions')}</option>
            </SelectField>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <div className="flex-1">
            <TextInput
              placeholder={t('ual_search_placeholder')}
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </div>
          <Button
            onClick={handleExport}
            data-tour-id="logs-export-users"
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
              <Th>{t('alv_user')}</Th>
              <Th>{t('ual_login_time')}</Th>
              <Th>{t('ual_session_duration')}</Th>
              <Th>{t('alv_ip_address')}</Th>
              <Th>{t('actions')}</Th>
              <Th>{t('status')}</Th>
              <Th>{t('view_details')}</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <Td colSpan="7" className="py-10 text-center">
                  <span className="inline-flex items-center gap-2 text-ink-muted">
                    <InlineSpinner />
                    {t('ual_loading')}
                  </span>
                </Td>
              </tr>
            ) : activities.length === 0 ? (
              <tr>
                <Td colSpan="7" className="py-8">
                  <EmptyPanelState
                    title={t('ual_no_activities')}
                    description={filters.search ? t('ual_no_activities_search_desc') : t('ual_no_activities_filter_desc')}
                  />
                </Td>
              </tr>
            ) : (
              activities.map((activity) => (
                <Tr key={activity.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-subtle text-sm font-semibold text-brand">
                        {activity.userName.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <div className="font-medium text-ink">{activity.userName}</div>
                        <div className="text-xs text-ink-muted">{activity.role}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-ink">{formatDateTime(activity.loginTime)}</Td>
                  <Td className="text-ink">{activity.duration}</Td>
                  <Td className="text-ink">{activity.ipAddress}</Td>
                  <Td className="text-ink">{activity.actionsPerformed}</Td>
                  <Td>{getStatusBadge(activity.status)}</Td>
                  <Td>
                    <Button
                      onClick={() => setSelectedActivity(activity)}
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

      {selectedActivity && (
        <UserActivityDetailModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
        />
      )}
    </div>
  )
}
