import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePreferences } from '../contexts/PreferencesContext'
import api from '../api/axios'
import { AlertModal } from './ConfirmModal'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import EmptyPanelState from './ui/EmptyPanelState'
import InlineSpinner from './ui/InlineSpinner'
import { TableContainer, Table, Th, Td, Tr } from './ui/Table'

// Main System Reports Component
export default function SystemReports() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [recentReports, setRecentReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [stats, setStats] = useState({
    availableReports: 6,
    generatedToday: 0,
    scheduledReports: 0,
    totalSize: '0 MB'
  })

  useEffect(() => {
    loadStats()
    loadRecentReports()
  }, [])

  const loadStats = async () => {
    try {
      const res = await api.get('/reports/system/stats')
      setStats(res.data.data?.stats || {})
    } catch (error) {
      console.error('Failed to load report stats:', error)
    }
  }

  const loadRecentReports = async () => {
    try {
      setLoading(true)
      const res = await api.get('/reports/system/recent?limit=10')
      setRecentReports(res.data.data?.reports || [])
    } catch (error) {
      console.error('Failed to load recent reports:', error)
      setRecentReports([])
    } finally {
      setLoading(false)
    }
  }

  // Only include reports that are applicable to this DMS system
  const reportTypes = [
    {
      id: 'document-stats',
      name: 'Document Statistics Report',
      description: 'Overview of document creation, approval rates, and lifecycle metrics across all document types',
      category: 'Documents',
      estimatedTime: '1-2 minutes',
      metrics: ['Total documents', 'By document type', 'By status', 'Approval rates', 'Processing time']
    },
    {
      id: 'user-activity',
      name: 'User Activity Report',
      description: 'Analysis of user actions, document submissions, reviews, and approvals',
      category: 'Users',
      estimatedTime: '1-2 minutes',
      metrics: ['Active users', 'Actions by user', 'Documents created', 'Reviews completed', 'Approvals given']
    },
    {
      id: 'document-request',
      name: 'Document Request Report',
      description: 'Summary of new document, version, supersede, and obsolete requests across the request lifecycle',
      category: 'Requests',
      estimatedTime: '1 minute',
      metrics: ['Total requests', 'By request type', 'By status', 'By document type', 'By requester']
    },
    {
      id: 'security-audit',
      name: 'Security & Audit Report',
      description: 'Security events, login history, permission changes, and system audit trail',
      category: 'Security',
      estimatedTime: '2-3 minutes',
      metrics: ['Login history', 'Failed logins', 'Permission changes', 'Document access logs', 'System changes']
    },
    {
      id: 'template-usage',
      name: 'Template Usage Report',
      description: 'Statistics on document template downloads and utilization by document type',
      category: 'Templates',
      estimatedTime: '1 minute',
      metrics: ['Template downloads', 'Most used templates', 'By document type', 'Upload history']
    },
    {
      id: 'storage-usage',
      name: 'Storage Usage Report',
      description: 'File storage consumption, document sizes, and storage distribution analysis',
      category: 'System',
      estimatedTime: '1-2 minutes',
      metrics: ['Total storage used', 'By document type', 'By file format', 'Largest documents', 'Growth trend']
    }
  ]

  const handleViewReport = (reportId) => {
    navigate(`/reports/${reportId}`)
  }

  const handleDownloadReport = async (report) => {
    try {
      const res = await api.get(`/reports/system/${report.id}/download`, {
        responseType: 'blob'
      })
      
      // Create blob with correct MIME type for CSV
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      // Use the format from the report, default to csv
      const format = (report.format || 'CSV').toLowerCase()
      link.setAttribute('download', `${report.name.replace(/\s+/g, '_')}.${format}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download report:', error)
      setAlertModal({
        show: true,
        title: 'Download Failed',
        message: 'Failed to download report. The file may not exist or has expired.',
        type: 'error'
      })
    }
  }

  const getCategoryColor = (category) => {
    const colors = {
      Documents: 'bg-brand-subtle text-brand border-brand/20',
      Users: 'bg-surface-muted text-ink border-border',
      Requests: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      Security: 'bg-amber-50 text-amber-700 border-amber-200',
      Templates: 'bg-violet-50 text-violet-700 border-violet-200',
      System: 'bg-surface-muted text-ink-secondary border-border'
    }
    return colors[category] || colors.System
  }

  const statCards = [
    { label: t('sr_available_reports'), value: stats.availableReports, tone: 'text-brand' },
    { label: t('sr_generated_today'), value: stats.generatedToday, tone: 'text-emerald-600' },
    { label: t('sr_scheduled_reports'), value: stats.scheduledReports, tone: 'text-violet-600' },
    { label: t('sr_total_size'), value: stats.totalSize, tone: 'text-amber-600' }
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">{t('sr_title')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('sr_desc')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <AppSurface key={card.label} padding="lg" variant="muted">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{card.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${card.tone}`}>{card.value}</p>
          </AppSurface>
        ))}
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold text-ink">Available Reports</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reportTypes.map((report) => (
            <AppSurface key={report.id} className="h-full" padding="lg" variant="interactive">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-ink">{report.name}</h4>
                  <p className="mt-1 text-xs text-ink-muted">{report.description}</p>
                </div>
                <span className={`inline-block text-xs px-2 py-0.5 rounded border ${getCategoryColor(report.category)}`}>
                  {report.category}
                </span>
              </div>

              <div className="mb-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">Includes</p>
                <div className="flex flex-wrap gap-1">
                  {report.metrics.slice(0, 3).map((metric, index) => (
                    <span key={index} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-secondary">
                      {metric}
                    </span>
                  ))}
                  {report.metrics.length > 3 && (
                    <span className="text-xs text-ink-muted">+{report.metrics.length - 3} more</span>
                  )}
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between text-xs text-ink-muted">
                <span>Est. {report.estimatedTime}</span>
              </div>

              <Button
                onClick={() => handleViewReport(report.id)}
                className="w-full"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {t('sr_generate_view')}
              </Button>
            </AppSurface>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink">{t('sr_recent_reports')}</h3>
          <Button variant="ghost" size="sm">
            View All
          </Button>
        </div>

        <TableContainer>
          <Table>
            <thead className="bg-surface-muted/80">
              <tr>
                <Th>
                  Report Name
                </Th>
                <Th>
                  Generated At
                </Th>
                <Th>
                  Status
                </Th>
                <Th>
                  Actions
                </Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <Td colSpan="4" className="py-10 text-center">
                    <span className="inline-flex items-center gap-2 text-ink-muted">
                      <InlineSpinner />
                      {t('loading')}...
                    </span>
                  </Td>
                </tr>
              ) : recentReports.length === 0 ? (
                <tr>
                  <Td colSpan="4" className="py-8">
                    <EmptyPanelState
                      title={t('sr_no_recent')}
                      description="Generated reports will appear here once they are available."
                    />
                  </Td>
                </tr>
              ) : (
                recentReports.map((report) => (
                  <Tr key={report.id}>
                    <Td className="font-medium text-ink">
                      {report.name}
                    </Td>
                    <Td>
                      {report.generatedAt}
                    </Td>
                    <Td>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {report.status}
                      </span>
                    </Td>
                    <Td>
                      <Button
                        onClick={() => handleDownloadReport(report)}
                        variant="ghost"
                        size="sm"
                      >
                        Download
                      </Button>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </TableContainer>
      </div>

      {/* Alert Modal */}
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false })}
      />
    </div>
  )
}
