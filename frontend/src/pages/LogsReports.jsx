import React, { useEffect, useMemo, useState, Component } from 'react'
import { usePreferences } from '../contexts/PreferencesContext'
import { usePermissions } from '../hooks/usePermissions'
import AuditLogsViewer from '../components/AuditLogsViewer'
import UserActivityLogs from '../components/UserActivityLogs'
import SystemReports from '../components/SystemReports'
import AnalyticsDashboard from '../components/AnalyticsDashboard'
import AppSurface from '../components/ui/AppSurface'
import Button from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'

// Error Fallback with translations
function ErrorDisplay({ error, onRetry }) {
  const { t } = usePreferences()
  return (
    <AppSurface className="m-4 border border-red-200 bg-red-50" padding="lg">
      <h3 className="text-lg font-semibold text-red-800">{t('lr_error_title')}</h3>
      <p className="mt-2 text-sm text-red-700">{error?.message || 'Unknown error'}</p>
      <Button
        onClick={onRetry}
        variant="danger"
        className="mt-4"
      >
        {t('lr_try_again')}
      </Button>
    </AppSurface>
  )
}

// Error Boundary for catching render errors
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('LogsReports Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorDisplay
          error={this.state.error}
          onRetry={() => this.setState({ hasError: false, error: null })}
        />
      )
    }
    return this.props.children
  }
}

// Tab Navigation Component
function TabNavigation({ activeTab, onTabChange, tabs }) {
  const { t } = usePreferences()

  return (
    <AppSurface
      className="overflow-x-auto"
      padding="sm"
      variant="muted"
      data-tour-id="logs-tabbar"
    >
      <nav className="flex min-w-max gap-2" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            data-tour-id={`logs-tab-${tab.id}`}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === tab.id
                ? 'rounded-2xl bg-brand px-4 py-2 text-ink-inverse shadow-dms-soft'
                : 'rounded-2xl px-4 py-2 text-ink-muted hover:bg-surface hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </AppSurface>
  )
}

// Main Logs & Reports Page Component
export default function LogsReports() {
  const { t } = usePreferences()
  const { hasAnyPermission } = usePermissions()
  const availableTabs = useMemo(() => {
    const tabs = []

    if (hasAnyPermission('logsReport.activityLogs')) {
      tabs.push({ id: 'activity', label: t('lr_activity_logs') })
    }
    if (hasAnyPermission('logsReport.userActivity')) {
      tabs.push({ id: 'users', label: t('lr_user_activity') })
    }
    if (hasAnyPermission('logsReport.reports')) {
      tabs.push({ id: 'reports', label: t('lr_system_reports') })
    }
    if (hasAnyPermission('logsReport.analytics')) {
      tabs.push({ id: 'analytics', label: t('lr_analytics') })
    }

    return tabs
  }, [hasAnyPermission, t])
  const [activeTab, setActiveTab] = useState(availableTabs[0]?.id || 'activity')

  useEffect(() => {
    if (!availableTabs.length) return
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0].id)
    }
  }, [activeTab, availableTabs])

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('lr_title')}
        subtitle={t('lr_desc')}
      />

      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} tabs={availableTabs} />

      <div className="mt-6">
        <ErrorBoundary>
          {activeTab === 'activity' && <AuditLogsViewer />}
          {activeTab === 'users' && <UserActivityLogs />}
          {activeTab === 'reports' && <SystemReports />}
          {activeTab === 'analytics' && <AnalyticsDashboard />}
        </ErrorBoundary>
      </div>
    </div>
  )
}
