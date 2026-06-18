import React, { useState, useEffect } from 'react'
import { usePreferences } from '../contexts/PreferencesContext'
import api from '../api/axios'
import AppSurface from './ui/AppSurface'
import EmptyPanelState from './ui/EmptyPanelState'
import InlineSpinner from './ui/InlineSpinner'
import SelectField from './ui/SelectField'

export default function AnalyticsDashboard() {
  const { t } = usePreferences()
  const [timeRange, setTimeRange] = useState('30days')
  const [analytics, setAnalytics] = useState({
    totalEvents: 0,
    totalEventsTrend: { percent: 0, direction: 'same' },
    activeUsers: 0,
    successfulLogins: 0,
    failedLogins: 0,
    failedLoginsTrend: { percent: 0, direction: 'same' },
    documentsProcessed: 0,
    documentsTrend: { percent: 0, direction: 'same' }
  })
  const [activityTimeline, setActivityTimeline] = useState([])
  const [moduleUsage, setModuleUsage] = useState([])
  const [documentStatus, setDocumentStatus] = useState([])
  const [topUsers, setTopUsers] = useState([])
  const [topActivities, setTopActivities] = useState([])
  const [loading, setLoading] = useState(false)

  // Format string to Title Case (e.g., "REVIEW_APPROVE" -> "Review Approve")
  const formatToTitleCase = (str) => {
    if (!str) return ''
    return str
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }

  useEffect(() => {
    loadAnalytics()
  }, [timeRange])

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/audit/analytics?range=${timeRange}`)
      const data = res.data.data?.analytics || {}
      
      setAnalytics({
        totalEvents: data.overview?.totalEvents || 0,
        totalEventsTrend: data.overview?.totalEventsTrend || { percent: 0, direction: 'same' },
        activeUsers: data.overview?.activeUsers || 0,
        successfulLogins: data.overview?.successfulLogins || 0,
        failedLogins: data.overview?.failedLogins || 0,
        failedLoginsTrend: data.overview?.failedLoginsTrend || { percent: 0, direction: 'same' },
        documentsProcessed: data.overview?.documentsProcessed || 0,
        documentsTrend: data.overview?.documentsTrend || { percent: 0, direction: 'same' }
      })
      
      setActivityTimeline(data.activityTimeline || [])
      setModuleUsage(data.moduleUsage || [])
      setDocumentStatus(data.documentStatus || [])
      setTopUsers(data.topUsers || [])
      setTopActivities(data.topActivities || [])
    } catch (error) {
      console.error('Failed to load analytics:', error)
      setAnalytics({
        totalEvents: 0,
        totalEventsTrend: { percent: 0, direction: 'same' },
        activeUsers: 0,
        successfulLogins: 0,
        failedLogins: 0,
        failedLoginsTrend: { percent: 0, direction: 'same' },
        documentsProcessed: 0,
        documentsTrend: { percent: 0, direction: 'same' }
      })
      setActivityTimeline([])
      setModuleUsage([])
      setDocumentStatus([])
      setTopUsers([])
      setTopActivities([])
    } finally {
      setLoading(false)
    }
  }


  const getTrendIcon = (trend) => {
    if (trend === 'up') return (
      <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
      </svg>
    )
    if (trend === 'down') return (
      <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    )
    return (
      <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    )
  }

  const metricCards = [
    {
      label: t('ad_total_events'),
      value: analytics.totalEvents.toLocaleString(),
      tone: 'text-brand',
      helper: `${analytics.totalEventsTrend.direction === 'up' ? '↑' : analytics.totalEventsTrend.direction === 'down' ? '↓' : '→'} ${analytics.totalEventsTrend.percent}% ${t('ad_from_last_period')}`
    },
    {
      label: t('ad_active_users'),
      value: analytics.activeUsers,
      tone: 'text-emerald-600',
      helper: `${analytics.successfulLogins} ${t('ad_logins_period')}`
    },
    {
      label: t('ad_failed_logins'),
      value: analytics.failedLogins,
      tone: 'text-amber-600',
      helper: `${analytics.failedLoginsTrend.direction === 'up' ? '↑' : analytics.failedLoginsTrend.direction === 'down' ? '↓' : '→'} ${analytics.failedLoginsTrend.percent}% ${t('ad_from_last_period')}`
    },
    {
      label: t('ad_documents'),
      value: analytics.documentsProcessed.toLocaleString(),
      tone: 'text-violet-600',
      helper: `${analytics.documentsTrend.direction === 'up' ? '↑' : analytics.documentsTrend.direction === 'down' ? '↓' : '→'} ${analytics.documentsTrend.percent}% ${t('ad_from_last_period')}`
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-ink">{t('ad_title')}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('ad_desc')}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-ink-secondary">{t('ad_time_period')}</label>
          <SelectField
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="min-w-[170px]"
          >
            <option value="7days">{t('ad_last_7')}</option>
            <option value="30days">{t('ad_last_30')}</option>
            <option value="90days">{t('ad_last_90')}</option>
            <option value="year">{t('ad_this_year')}</option>
          </SelectField>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <AppSurface key={card.label} padding="lg" variant="muted">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{card.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${card.tone}`}>{card.value}</p>
            <p className="mt-2 text-xs text-ink-muted">{card.helper}</p>
          </AppSurface>
        ))}
      </div>

      <AppSurface padding="lg">
        <h3 className="mb-4 text-lg font-semibold text-ink">{t('ad_activity_timeline')}</h3>
        {loading ? (
          <div className="flex h-64 items-center justify-center text-ink-muted">
            <span className="inline-flex items-center gap-2">
              <InlineSpinner />
              {t('loading')}...
            </span>
          </div>
        ) : activityTimeline.length === 0 ? (
          <EmptyPanelState
            title={t('ad_activity_timeline')}
            description="Analytics data will appear here when events are available."
            className="h-64"
          />
        ) : (
          <>
            <div className="flex h-64 items-end justify-between gap-2">
              {activityTimeline.map((data, index) => {
                const maxValue = Math.max(...activityTimeline.map(d => d.events))
                const height = (data.events / maxValue) * 100
                return (
                  <div key={index} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full flex-col items-center gap-1">
                      <div className="relative w-full">
                        <div
                          className="w-full rounded-t bg-brand transition-colors"
                          style={{ height: `${height * 2}px` }}
                          title={`${data.events} events`}
                        />
                      </div>
                      <div
                        className="w-full rounded-t bg-emerald-500 transition-colors"
                        style={{ height: `${(data.documents / maxValue) * 200}px` }}
                        title={`${data.documents} documents`}
                      />
                    </div>
                    <p className="mt-2 text-xs font-medium text-ink-muted">{data.day}</p>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex items-center justify-center gap-6">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-brand"></div>
                <span className="text-xs text-ink-muted">{t('ad_events')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-emerald-500"></div>
                <span className="text-xs text-ink-muted">{t('ad_documents')}</span>
              </div>
            </div>
          </>
        )}
      </AppSurface>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AppSurface padding="lg">
          <h3 className="mb-4 text-lg font-semibold text-ink">{t('ad_module_usage')}</h3>
          <div className="space-y-4">
            {moduleUsage.map((module, index) => (
              <div key={index}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-ink-secondary">{module.name}</span>
                  <span className="text-ink-muted">{module.value}%</span>
                </div>
                <div className="w-full rounded-full bg-surface-muted h-2">
                  <div
                    className={`${module.color} h-2 rounded-full transition-all`}
                    style={{ width: `${module.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </AppSurface>

        <AppSurface padding="lg">
          <h3 className="mb-4 text-lg font-semibold text-ink">{t('ad_doc_status')}</h3>
          <div className="space-y-3">
            {documentStatus.map((status, index) => (
              <div key={index} className="flex items-center justify-between rounded-2xl bg-surface-muted p-3">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 ${status.color} rounded-full`}></div>
                  <span className="text-sm font-medium text-ink-secondary">{formatToTitleCase(status.status)}</span>
                </div>
                <span className="text-sm font-bold text-ink">{status.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-secondary">Total Documents</span>
              <span className="text-lg font-bold text-ink">
                {documentStatus.reduce((sum, s) => sum + s.count, 0)}
              </span>
            </div>
          </div>
        </AppSurface>
      </div>


      {/* Top Users & Activities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Most Active Users */}
        <AppSurface padding="lg">
          <h3 className="mb-4 text-lg font-semibold text-ink">{t('ad_top_users')}</h3>
          <div className="space-y-3">
            {topUsers.map((user, index) => (
              <div key={index} className="flex items-center justify-between rounded-2xl bg-surface-muted p-3 transition-colors hover:bg-surface">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-subtle">
                    <span className="text-sm font-bold text-brand">{user.avatar}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">{user.name}</p>
                    <p className="text-xs text-ink-muted">{user.actions} actions</p>
                  </div>
                </div>
                {getTrendIcon(user.trend)}
              </div>
            ))}
          </div>
        </AppSurface>

        <AppSurface padding="lg">
          <h3 className="mb-4 text-lg font-semibold text-ink">{t('ad_top_activities')}</h3>
          <div className="space-y-3">
            {topActivities.map((activity, index) => (
              <div key={index}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-ink-secondary">
                    {index + 1}. {formatToTitleCase(activity.name)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{activity.count}</span>
                    <span className="text-ink-muted">({activity.percentage}%)</span>
                  </div>
                </div>
                <div className="w-full rounded-full bg-surface-muted h-2">
                  <div
                    className="h-2 rounded-full bg-brand transition-all"
                    style={{ width: `${activity.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </AppSurface>
      </div>

    </div>
  )
}
