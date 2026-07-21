import React, { useEffect, useState } from 'react'
import api from '../api/axios'
import { usePreferences } from '../contexts/PreferencesContext'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import DashboardHeader from './dashboard/DashboardHeader'
import DashboardMetricCard from './dashboard/DashboardMetricCard'
import DashboardQuickActions from './dashboard/DashboardQuickActions'
import DashboardActivityTable from './dashboard/DashboardActivityTable'
import DashboardStatusChart from './dashboard/DashboardStatusChart'
import DashboardExpiryOverview from './dashboard/DashboardExpiryOverview'
import DashboardSkeleton from './dashboard/DashboardSkeleton'

// Inline SVG icons
const DocumentTextIcon = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
)
const ClockIcon = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
)
const ArchiveBoxIcon = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
)
const BadgeCheckIcon = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
)
const ClipboardListIcon = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 5H7a2 2 0 00-2 2v11a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 104 0M9 5a2 2 0 014 0m-6 5h6m-6 4h6m-6 4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
)

const getCurrentUserFromStorage = () => {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const getUserRoleNames = (user) => {
  if (!user?.roles || !Array.isArray(user.roles)) return []

  return user.roles
    .map((roleData) => {
      const role = roleData?.role || roleData
      return String(role?.displayName || role?.name || '').trim()
    })
    .filter(Boolean)
}

const isAdminFocusedUser = (user) => {
  const roleNames = getUserRoleNames(user).map((name) => name.toLowerCase())
  return roleNames.some((name) => ['administrator', 'admin', 'document controller', 'document_controller'].includes(name))
}

const getUserDisplayName = (user) => {
  if (!user) return ''
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return fullName || user.name || user.email || ''
}

const isDraftStatus = (status = '') => ['Draft', 'Drafting', 'Acknowledged'].includes(status)
const isWaitingReviewStatus = (status = '') => ['Waiting for Review', 'Pending Review', 'In Review'].includes(status)
const isWaitingApprovalStatus = (status = '') => [
  'Waiting for Approval',
  'Pending Approval',
  'In Approval',
  'Pending First Approval',
  'In First Approval',
  'Pending Second Approval',
  'In Second Approval',
  'Ready to Publish',
  'Approved'
].includes(status)
const isPublishedStatus = (status = '') => ['Published', 'PUBLISHED'].includes(status)
const isArchivedStatus = (status = '') => ['Obsolete', 'Superseded', 'Archived'].includes(status)
const isReturnedStatus = (status = '') => ['Return for Amendments', 'Rejected'].includes(status)
const isPendingAcknowledgmentStatus = (status = '') => status === 'Pending Acknowledgment'

const toTimestamp = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0
}

const getActivityActionLabel = (document, t) => {
  const status = String(document?.status || '')
  if (isReturnedStatus(status)) return t('dashboard_activity_returned')
  if (isPublishedStatus(status)) return t('dashboard_activity_published')
  if (isWaitingApprovalStatus(status)) return t('dashboard_activity_waiting_approval')
  if (isWaitingReviewStatus(status)) return t('dashboard_activity_waiting_review')
  if (isPendingAcknowledgmentStatus(status)) return t('dashboard_activity_pending_ack')
  if (isDraftStatus(status)) return t('dashboard_activity_draft')
  if (isArchivedStatus(status)) return t('dashboard_activity_archived')
  return t('dashboard_activity_updated')
}

export default function Dashboard() {
  const { t, formatRelativeTime } = usePreferences()
  const [dashboardMode, setDashboardMode] = useState('user')
  const [myDocuments, setMyDocuments] = useState([])
  const [assignedQueue, setAssignedQueue] = useState([])
  const [adminMetrics, setAdminMetrics] = useState(null)
  const [adminStats, setAdminStats] = useState(null)
  const [expiryStats, setExpiryStats] = useState(null)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadDashboard = async (mountedRef) => {
    try {
      setError(false)
      setLoading(true)
      const currentUser = getCurrentUserFromStorage()
      const nextMode = isAdminFocusedUser(currentUser) ? 'admin' : 'user'
      setDashboardMode(nextMode)

      if (nextMode === 'admin') {
        const [dashboardRes, statsRes, expiryRes, myDocsRes, assignedRes] = await Promise.allSettled([
          api.get('/reports/dashboard'),
          api.get('/reports/dashboard-stats'),
          api.get('/expiry-tracking/dashboard'),
          api.get('/documents/my-status'),
          api.get('/documents/review-approval')
        ])

        if (mountedRef && !mountedRef.current) return

        if (dashboardRes.status !== 'fulfilled') {
          throw dashboardRes.reason
        }

        const dashboardData = dashboardRes.value.data.data || dashboardRes.value.data || {}
        const statsData = statsRes.status === 'fulfilled'
          ? (statsRes.value.data.data?.stats || statsRes.value.data.stats || null)
          : null
        const expiryData = expiryRes.status === 'fulfilled'
          ? (expiryRes.value.data.data?.dashboard || expiryRes.value.data.dashboard || null)
          : null
        const personalDocuments = myDocsRes.status === 'fulfilled'
          ? (myDocsRes.value.data.data?.documents || myDocsRes.value.data.documents || [])
          : []
        const personalAssigned = assignedRes.status === 'fulfilled'
          ? (assignedRes.value.data.data?.documents || assignedRes.value.data.documents || [])
          : []

        setAdminMetrics(dashboardData.metrics || null)
        setAdminStats(statsData)
        setExpiryStats(expiryData)
        setRecent(dashboardData.recentActivity || [])
        setMyDocuments(personalDocuments)
        setAssignedQueue(personalAssigned)

        if (statsRes.status !== 'fulfilled') {
          console.warn('Failed to load dashboard stats', statsRes.reason)
        }

        if (expiryRes.status !== 'fulfilled') {
          console.warn('Expiry dashboard is unavailable for this user', expiryRes.reason)
        }

        if (myDocsRes.status !== 'fulfilled') {
          console.warn('Failed to load personal dashboard documents', myDocsRes.reason)
        }

        if (assignedRes.status !== 'fulfilled') {
          console.warn('Failed to load personal assigned queue', assignedRes.reason)
        }

        return
      }

      const expiryRequest = currentUser?.id
        ? api.get('/expiry-tracking/dashboard', { params: { ownerId: currentUser.id } })
        : Promise.resolve({ data: { data: { dashboard: null } } })

      const [myDocsRes, assignedRes, expiryRes] = await Promise.allSettled([
        api.get('/documents/my-status'),
        api.get('/documents/review-approval'),
        expiryRequest
      ])

      if (mountedRef && !mountedRef.current) return

      if (myDocsRes.status !== 'fulfilled') {
        throw myDocsRes.reason
      }

      const documents = myDocsRes.value.data.data?.documents || myDocsRes.value.data.documents || []
      const assigned = assignedRes.status === 'fulfilled'
        ? (assignedRes.value.data.data?.documents || assignedRes.value.data.documents || [])
        : []
      const expiryData = expiryRes.status === 'fulfilled'
        ? (expiryRes.value.data.data?.dashboard || expiryRes.value.data.dashboard || null)
        : null

      const currentUserName = getUserDisplayName(currentUser) || t('dashboard_you')
      const recentDocuments = [...documents]
        .sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))
        .slice(0, 10)
        .map((doc) => ({
          user: currentUserName,
          document: doc.fileCode && doc.fileCode !== '-' ? `${doc.fileCode} - ${doc.title}` : doc.title,
          action: getActivityActionLabel(doc, t),
          updatedAt: doc.updatedAt
        }))

      setMyDocuments(documents)
      setAssignedQueue(assigned)
      setAdminMetrics(null)
      setAdminStats(null)
      setExpiryStats(expiryData)
      setRecent(recentDocuments)

      if (assignedRes.status !== 'fulfilled') {
        console.warn('Failed to load assigned queue', assignedRes.reason)
      }

      if (expiryRes.status !== 'fulfilled') {
        console.warn('Expiry dashboard is unavailable for this user', expiryRes.reason)
      }
    } catch (e) {
      if (mountedRef && !mountedRef.current) return
      setAdminMetrics(null)
      setAdminStats(null)
      setMyDocuments([])
      setAssignedQueue([])
      setExpiryStats(null)
      setRecent([])
      setError(true)
      console.error('Failed to load dashboard', e)
    } finally {
      if (mountedRef && mountedRef.current) setLoading(false)
      if (!mountedRef) setLoading(false)
    }
  }

  useEffect(() => {
    const mountedRef = { current: true }
    loadDashboard(mountedRef)
    return () => { mountedRef.current = false }
  }, [])

  const draftsCount = myDocuments.filter((doc) => isDraftStatus(doc.status)).length
  const waitingReviewCount = myDocuments.filter((doc) => isWaitingReviewStatus(doc.status)).length
  const waitingApprovalCount = myDocuments.filter((doc) => isWaitingApprovalStatus(doc.status)).length
  const publishedCount = myDocuments.filter((doc) => isPublishedStatus(doc.status)).length
  const archivedCount = myDocuments.filter((doc) => isArchivedStatus(doc.status)).length
  const returnedCount = myDocuments.filter((doc) => isReturnedStatus(doc.status)).length
  const pendingAcknowledgmentCount = myDocuments.filter((doc) => isPendingAcknowledgmentStatus(doc.status)).length
  const needsMyActionCount = assignedQueue.length + returnedCount + pendingAcknowledgmentCount

  const metrics = {
    drafts: draftsCount,
    needsMyAction: needsMyActionCount,
    awaitingReview: waitingReviewCount + waitingApprovalCount,
    published: publishedCount
  }

  const statusChartItems = [
    {
      key: 'draft',
      label: t('dashboard_chart_draft'),
      value: draftsCount,
      color: '#60a5fa'
    },
    {
      key: 'review',
      label: t('dashboard_chart_pending_review'),
      value: waitingReviewCount,
      color: '#f59e0b'
    },
    {
      key: 'approval',
      label: t('dashboard_chart_pending_approval'),
      value: waitingApprovalCount,
      color: '#f97316'
    },
    {
      key: 'published',
      label: t('dashboard_chart_published'),
      value: publishedCount,
      color: '#10b981'
    },
    {
      key: 'obsolete',
      label: t('dashboard_chart_obsolete'),
      value: archivedCount,
      color: '#94a3b8'
    }
  ]

  const documentStats = adminStats?.documents || {}
  const activeMetrics = dashboardMode === 'admin'
    ? {
        drafts: adminMetrics?.drafts ?? 0,
        queue: (documentStats.pendingReview ?? adminMetrics?.pendingReviews ?? 0) + (documentStats.pendingApproval ?? 0),
        published: documentStats.published ?? adminMetrics?.published ?? 0,
        superseded: documentStats.obsolete ?? adminMetrics?.superseded ?? 0
      }
    : metrics
  const activeStatusChartItems = dashboardMode === 'admin'
    ? [
        {
          key: 'draft',
          label: t('dashboard_chart_draft'),
          value: documentStats.draft ?? adminMetrics?.drafts ?? 0,
          color: '#60a5fa'
        },
        {
          key: 'review',
          label: t('dashboard_chart_pending_review'),
          value: documentStats.pendingReview ?? adminMetrics?.pendingReviews ?? 0,
          color: '#f59e0b'
        },
        {
          key: 'approval',
          label: t('dashboard_chart_pending_approval'),
          value: documentStats.pendingApproval ?? 0,
          color: '#f97316'
        },
        {
          key: 'published',
          label: t('dashboard_chart_published'),
          value: documentStats.published ?? adminMetrics?.published ?? 0,
          color: '#10b981'
        },
        {
          key: 'obsolete',
          label: t('dashboard_chart_obsolete'),
          value: documentStats.obsolete ?? adminMetrics?.superseded ?? 0,
          color: '#94a3b8'
        }
      ]
    : statusChartItems
  const activeRecentViewAllLabel = dashboardMode === 'admin' ? t('view_all_logs') : t('dashboard_open_my_documents')
  const activeRecentViewAllTo = dashboardMode === 'admin' ? '/logs' : '/my-documents'
  const personalMetricCards = [
    {
      key: 'drafts',
      title: t('dashboard_metric_my_drafts'),
      value: metrics.drafts ?? 0,
      description: t('dashboard_metric_my_drafts_desc'),
      icon: DocumentTextIcon,
      tone: 'indigo',
      surfaceStyle: { backgroundColor: 'var(--dms-color-info-soft)' }
    },
    {
      key: 'needs-action',
      title: t('dashboard_metric_needs_action'),
      value: metrics.needsMyAction ?? 0,
      description: t('dashboard_metric_needs_action_desc'),
      icon: ClockIcon,
      tone: 'warning',
      surfaceStyle: { backgroundColor: 'var(--dms-color-info-soft)' }
    },
    {
      key: 'waiting',
      title: t('dashboard_metric_waiting'),
      value: metrics.awaitingReview ?? 0,
      description: t('dashboard_metric_waiting_desc'),
      icon: ClipboardListIcon,
      tone: 'success',
      surfaceStyle: { backgroundColor: 'var(--dms-color-info-soft)' }
    },
    {
      key: 'published',
      title: t('dashboard_metric_published'),
      value: metrics.published ?? 0,
      description: t('dashboard_metric_published_desc'),
      icon: BadgeCheckIcon,
      tone: 'neutral',
      surfaceStyle: { backgroundColor: 'var(--dms-color-info-soft)' }
    }
  ]
  const systemMetricCards = [
    {
      key: 'queue',
      title: t('dashboard_metric_global_queue'),
      value: activeMetrics.queue ?? 0,
      description: t('dashboard_metric_global_queue_desc'),
      icon: ClockIcon,
      tone: 'indigo',
      surfaceStyle: { backgroundColor: 'var(--dms-color-info-soft)' }
    },
    {
      key: 'published',
      title: t('dashboard_metric_global_published'),
      value: activeMetrics.published ?? 0,
      description: t('dashboard_metric_global_published_desc'),
      icon: BadgeCheckIcon,
      tone: 'indigo',
      surfaceStyle: { backgroundColor: 'var(--dms-color-info-soft)' }
    },
    {
      key: 'superseded',
      title: t('superseded_archived'),
      value: activeMetrics.superseded ?? 0,
      description: t('archived_desc'),
      icon: ArchiveBoxIcon,
      tone: 'indigo',
      surfaceStyle: { backgroundColor: 'var(--dms-color-info-soft)' }
    }
  ]
  const activeMetricCards = dashboardMode === 'admin' ? systemMetricCards : personalMetricCards

  const expiryItems = [
    {
      key: 'expired',
      label: t('dashboard_expiry_expired'),
      value: expiryStats?.expired || 0,
      color: 'bg-[var(--dms-color-danger-default)]'
    },
    {
      key: 'expiring-today',
      label: t('dashboard_expiry_today'),
      value: expiryStats?.expiringToday || 0,
      color: 'bg-[var(--dms-color-warning-default)]'
    },
    {
      key: 'expiring-soon',
      label: t('dashboard_expiry_soon'),
      value: expiryStats?.expiringSoon || 0,
      color: 'bg-[var(--dms-color-info-default)]'
    },
    {
      key: 'renewal',
      label: t('dashboard_expiry_renewal'),
      value: expiryStats?.renewalInProgress || 0,
      color: 'bg-[var(--dms-color-success-default)]'
    }
  ]

  return (
    <div className="space-y-6">
      <DashboardHeader
        title={t('dashboard_overview')}
        subtitle={t('dashboard_welcome')}
        className="mb-1"
      />

      {loading && <DashboardSkeleton />}

      {!loading && !error && (
        <>
          {dashboardMode === 'admin' && (
            <section className="space-y-3" data-tour-id="dashboard-personal-metrics">
              <AppSurface
                variant="muted"
                padding="lg"
                className="border-l-4 border-l-[var(--dms-color-info-ink)]"
              >
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-[var(--dms-color-info-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--dms-color-info-ink)]">
                        {t('dashboard_metric_personal_label')}
                      </span>
                    </div>
                    <p className="text-sm text-ink-secondary">
                      {t('dashboard_metric_personal_desc')}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {personalMetricCards.map((card) => (
                    <DashboardMetricCard
                      key={card.key}
                      title={card.title}
                      value={card.value}
                      description={card.description}
                      icon={card.icon}
                      tone={card.tone}
                      surfaceStyle={card.surfaceStyle}
                    />
                  ))}
                </div>
              </AppSurface>
            </section>
          )}

          <section className="space-y-3" data-tour-id="dashboard-metrics">
            {dashboardMode === 'admin' ? (
              <AppSurface
                variant="muted"
                padding="lg"
                className="border-l-4 border-l-[var(--dms-color-border-strong)]"
              >
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                        {t('dashboard_metric_system_label')}
                      </span>
                    </div>
                    <p className="text-sm text-ink-secondary">
                      {t('dashboard_metric_system_desc')}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {systemMetricCards.map((card) => (
                    <DashboardMetricCard
                      key={card.key}
                      title={card.title}
                      value={card.value}
                      description={card.description}
                      icon={card.icon}
                      tone={card.tone}
                      surfaceStyle={card.surfaceStyle}
                    />
                  ))}
                </div>
              </AppSurface>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {activeMetricCards.map((card) => (
                  <DashboardMetricCard
                    key={card.key}
                    title={card.title}
                    value={card.value}
                    description={card.description}
                    icon={card.icon}
                    tone={card.tone}
                    surfaceStyle={card.surfaceStyle}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div data-tour-id="dashboard-expiry-overview">
              <DashboardExpiryOverview
                title={t('dashboard_expiry_title')}
                subtitle={t('dashboard_expiry_subtitle')}
                stats={expiryStats}
                items={expiryItems}
                totalLabel={t('dashboard_expiry_total')}
                actionLabel={t('dashboard_expiry_action')}
                emptyTitle={t('dashboard_expiry_empty_title')}
                emptyDescription={t('dashboard_expiry_empty_desc')}
              />
            </div>
            <div data-tour-id="dashboard-status-chart">
              <DashboardStatusChart
                title={dashboardMode === 'admin' ? t('dashboard_status_chart_admin_title') : t('dashboard_status_chart_title')}
                subtitle={dashboardMode === 'admin' ? t('dashboard_status_chart_admin_subtitle') : t('dashboard_status_chart_subtitle')}
                items={activeStatusChartItems}
                totalLabel={t('dashboard_status_total')}
                emptyTitle={t('dashboard_status_empty_title')}
                emptyDescription={t('dashboard_status_empty_desc')}
              />
            </div>
          </section>

          <div data-tour-id="dashboard-quick-actions">
            <DashboardQuickActions />
          </div>

          <div data-tour-id="dashboard-recent-activity">
            <DashboardActivityTable
              title={t('recent_activity')}
              subtitle={dashboardMode === 'admin' ? t('recent_activity_admin_desc') : t('recent_activity_desc')}
              recent={recent}
              formatRelativeTime={formatRelativeTime}
              viewAllLabel={activeRecentViewAllLabel}
              viewAllTo={activeRecentViewAllTo}
              columns={{
                userDocument: t('user_document'),
                action: t('action'),
                time: t('time')
              }}
              emptyTitle={t('no_recent_activity_title')}
              emptyDescription={t('no_recent_activity_desc')}
            />
          </div>
        </>
      )}

      {!loading && (error || !metrics) && (
        <AppSurface
          padding="lg"
          className="border-[var(--dms-color-border-default)] bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold">Failed to load dashboard.</div>
            <Button type="button" variant="secondary" onClick={() => loadDashboard()}>
              Retry
            </Button>
          </div>
        </AppSurface>
      )}
    </div>
  )
}
