import React, { useEffect, useState } from 'react'
import api from '../api/axios'
import { usePreferences } from '../contexts/PreferencesContext'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import DashboardHeader from './dashboard/DashboardHeader'
import DashboardMetricCard from './dashboard/DashboardMetricCard'
import DashboardQuickActions from './dashboard/DashboardQuickActions'
import DashboardActivityTable from './dashboard/DashboardActivityTable'
import DashboardAttentionPanel from './dashboard/DashboardAttentionPanel'
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
        const [dashboardRes, statsRes, expiryRes] = await Promise.allSettled([
          api.get('/reports/dashboard'),
          api.get('/reports/dashboard-stats'),
          api.get('/expiry-tracking/dashboard')
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

        setAdminMetrics(dashboardData.metrics || null)
        setAdminStats(statsData)
        setExpiryStats(expiryData)
        setRecent(dashboardData.recentActivity || [])
        setMyDocuments([])
        setAssignedQueue([])

        if (statsRes.status !== 'fulfilled') {
          console.warn('Failed to load dashboard stats', statsRes.reason)
        }

        if (expiryRes.status !== 'fulfilled') {
          console.warn('Expiry dashboard is unavailable for this user', expiryRes.reason)
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

  const attentionItems = [
    {
      key: 'assigned-action',
      label: t('dashboard_attention_assigned'),
      description: t('dashboard_attention_assigned_desc'),
      count: assignedQueue.length,
      tone: 'critical',
      to: '/review-approval'
    },
    {
      key: 'returned',
      label: t('dashboard_attention_returned'),
      description: t('dashboard_attention_returned_desc'),
      count: returnedCount,
      tone: 'warning',
      to: '/my-documents'
    },
    {
      key: 'pending-ack',
      label: t('dashboard_attention_pending_ack'),
      description: t('dashboard_attention_pending_ack_desc'),
      count: pendingAcknowledgmentCount,
      tone: 'warning',
      to: '/my-documents'
    },
    {
      key: 'expired',
      label: t('dashboard_attention_expired'),
      description: t('dashboard_attention_expired_desc'),
      count: expiryStats?.expired ?? 0,
      tone: 'critical',
      to: '/expiry-tracking'
    },
    {
      key: 'expiring-today',
      label: t('dashboard_attention_expiring_today'),
      description: t('dashboard_attention_expiring_today_desc'),
      count: expiryStats?.expiringToday ?? 0,
      tone: 'critical',
      to: '/expiry-tracking'
    },
    {
      key: 'expiring-soon',
      label: t('dashboard_attention_expiring_soon'),
      description: t('dashboard_attention_expiring_soon_desc'),
      count: expiryStats?.expiringSoon ?? 0,
      tone: 'info',
      to: '/expiry-tracking'
    },
    {
      key: 'drafts',
      label: t('dashboard_attention_drafts'),
      description: t('dashboard_attention_drafts_desc'),
      count: draftsCount,
      tone: 'info',
      to: '/drafts'
    }
  ]
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

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
  const activeAttentionItems = dashboardMode === 'admin'
    ? [
        {
          key: 'pending-review',
          label: t('dashboard_attention_pending_review'),
          description: t('dashboard_attention_pending_review_desc'),
          count: documentStats.pendingReview ?? adminMetrics?.pendingReviews ?? 0,
          tone: 'warning',
          to: '/review-approval'
        },
        {
          key: 'pending-approval',
          label: t('dashboard_attention_pending_approval'),
          description: t('dashboard_attention_pending_approval_desc'),
          count: documentStats.pendingApproval ?? 0,
          tone: 'warning',
          to: '/review-approval'
        },
        {
          key: 'expired',
          label: t('dashboard_attention_expired'),
          description: t('dashboard_attention_expired_desc'),
          count: expiryStats?.expired ?? 0,
          tone: 'critical',
          to: '/expiry-tracking'
        },
        {
          key: 'expiring-today',
          label: t('dashboard_attention_expiring_today'),
          description: t('dashboard_attention_expiring_today_desc'),
          count: expiryStats?.expiringToday ?? 0,
          tone: 'critical',
          to: '/expiry-tracking'
        },
        {
          key: 'expiring-soon',
          label: t('dashboard_attention_expiring_soon'),
          description: t('dashboard_attention_expiring_soon_desc'),
          count: expiryStats?.expiringSoon ?? 0,
          tone: 'info',
          to: '/expiry-tracking'
        },
        {
          key: 'drafts',
          label: t('dashboard_attention_drafts'),
          description: t('dashboard_attention_drafts_desc'),
          count: documentStats.draft ?? adminMetrics?.drafts ?? 0,
          tone: 'info',
          to: '/drafts'
        }
      ]
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    : attentionItems
  const activeRecentViewAllLabel = dashboardMode === 'admin' ? t('view_all_logs') : t('dashboard_open_my_documents')
  const activeRecentViewAllTo = dashboardMode === 'admin' ? '/logs' : '/my-documents'

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
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-tour-id="dashboard-metrics">
            <DashboardMetricCard
              title={dashboardMode === 'admin' ? t('docs_in_draft') : t('dashboard_metric_my_drafts')}
              value={activeMetrics.drafts ?? 0}
              description={dashboardMode === 'admin' ? t('draft_desc') : t('dashboard_metric_my_drafts_desc')}
              icon={DocumentTextIcon}
              tone="indigo"
            />
            <DashboardMetricCard
              title={dashboardMode === 'admin' ? t('dashboard_metric_global_queue') : t('dashboard_metric_needs_action')}
              value={dashboardMode === 'admin' ? (activeMetrics.queue ?? 0) : (activeMetrics.needsMyAction ?? 0)}
              description={dashboardMode === 'admin' ? t('dashboard_metric_global_queue_desc') : t('dashboard_metric_needs_action_desc')}
              icon={ClockIcon}
              tone="warning"
            />
            <DashboardMetricCard
              title={dashboardMode === 'admin' ? t('dashboard_metric_global_published') : t('dashboard_metric_waiting')}
              value={dashboardMode === 'admin' ? (activeMetrics.published ?? 0) : (activeMetrics.awaitingReview ?? 0)}
              description={dashboardMode === 'admin' ? t('dashboard_metric_global_published_desc') : t('dashboard_metric_waiting_desc')}
              icon={dashboardMode === 'admin' ? BadgeCheckIcon : ClipboardListIcon}
              tone="success"
            />
            <DashboardMetricCard
              title={dashboardMode === 'admin' ? t('superseded_archived') : t('dashboard_metric_published')}
              value={dashboardMode === 'admin' ? (activeMetrics.superseded ?? 0) : (activeMetrics.published ?? 0)}
              description={dashboardMode === 'admin' ? t('archived_desc') : t('dashboard_metric_published_desc')}
              icon={dashboardMode === 'admin' ? ArchiveBoxIcon : BadgeCheckIcon}
              tone="neutral"
            />
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <DashboardAttentionPanel
              title={dashboardMode === 'admin' ? t('dashboard_attention_admin_title') : t('dashboard_attention_title')}
              subtitle={dashboardMode === 'admin' ? t('dashboard_attention_admin_subtitle') : t('dashboard_attention_subtitle')}
              items={activeAttentionItems}
              emptyTitle={t('dashboard_attention_empty_title')}
              emptyDescription={t('dashboard_attention_empty_desc')}
              actionLabel={t('dashboard_attention_action')}
            />
            <DashboardStatusChart
              title={dashboardMode === 'admin' ? t('dashboard_status_chart_admin_title') : t('dashboard_status_chart_title')}
              subtitle={dashboardMode === 'admin' ? t('dashboard_status_chart_admin_subtitle') : t('dashboard_status_chart_subtitle')}
              items={activeStatusChartItems}
              totalLabel={t('dashboard_status_total')}
              emptyTitle={t('dashboard_status_empty_title')}
              emptyDescription={t('dashboard_status_empty_desc')}
            />
          </section>

          <DashboardQuickActions />

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
