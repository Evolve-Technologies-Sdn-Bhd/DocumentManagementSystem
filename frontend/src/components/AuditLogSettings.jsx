import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import { usePreferences } from '../contexts/PreferencesContext'

// Main Component
export default function AuditLogSettings() {
  const { t } = usePreferences()
  const [settings, setSettings] = useState({
    retentionDays: 90,
    autoArchiveDays: 365,
    permanentRetention: false,
    trackAuth: true,
    trackDocuments: true,
    trackConfig: true,
    trackUsers: true,
    trackDownloads: true,
    trackPermissions: true,
    trackFailures: true,
    alertFailedLogins: true,
    alertUnauthorized: true,
    alertBulkExports: true,
    alertConfigChanges: true
  })
  const [loading, setLoading] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const res = await api.get('/audit/settings')
      setSettings(res.data.settings || settings)
    } catch (error) {
      console.error('Failed to load audit settings:', error)
      // Use default settings if load fails
    }
  }

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }))
    setSaveSuccess(false)
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      await api.put('/audit/settings', settings)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Failed to save audit settings:', error)
      alert('Failed to save settings. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    loadSettings()
    setSaveSuccess(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-ink">{t('als_title')}</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            {t('als_desc')}
          </p>
        </div>
      </div>

      <div className="rounded-[16px] border-2 border-[var(--dms-color-info-ink)]/20 bg-[color-mix(in_srgb,var(--dms-color-info-soft)_70%,var(--dms-color-bg-card))] p-5 flex items-start gap-3">
        <svg className="w-5 h-5 text-[var(--dms-color-info-ink)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--dms-color-info-ink)]">{t('als_view_activity')}</p>
          <p className="text-xs text-[var(--dms-color-info-ink)]/85 mt-1">{t('als_view_activity_desc')}</p>
        </div>
      </div>
      {/* Log Retention Settings */}
      <div className="border-2 border-[var(--dms-color-border-default)] rounded-[16px] p-5 bg-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_4%,var(--dms-color-bg-card))] space-y-4">
        <h3 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
          <span>⏱️</span>
          <span>{t('als_retention_period')}</span>
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-2">
              {t('als_keep_logs')}
            </label>
            <input
              type="number"
              min="1"
              value={settings.retentionDays}
              onChange={(e) => handleChange('retentionDays', parseInt(e.target.value))}
              className="w-full rounded-xl border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-4 py-3 text-ink outline-none transition-all duration-150 focus:border-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20"
            />
            <p className="mt-1 text-xs text-ink-muted">{t('als_auto_delete')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-2">
              {t('als_auto_archive')}
            </label>
            <input
              type="number"
              min="1"
              value={settings.autoArchiveDays}
              onChange={(e) => handleChange('autoArchiveDays', parseInt(e.target.value))}
              className="w-full rounded-xl border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-4 py-3 text-ink outline-none transition-all duration-150 focus:border-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20"
            />
            <p className="mt-1 text-xs text-ink-muted">{t('als_move_archive')}</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] transition-all duration-150 focus-within:border-[var(--dms-color-brand-primary)] focus-within:ring-2 focus-within:ring-[var(--dms-color-brand-primary)]/20">
              <input
                type="checkbox"
                id="permanentRetention"
                checked={settings.permanentRetention}
                onChange={(e) => handleChange('permanentRetention', e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-[var(--dms-color-border-default)] text-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20"
              />
            </span>
            <label htmlFor="permanentRetention" className="text-sm font-medium text-ink-secondary cursor-pointer">
              {t('als_permanent_retention')}
            </label>
          </div>
        </div>
      </div>

      {/* Events to Track */}
      <div className="border-2 border-[var(--dms-color-border-default)] rounded-[16px] p-5 bg-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_4%,var(--dms-color-bg-card))] space-y-4">
        <h3 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
          <span>🎯</span>
          <span>{t('als_events_track')}</span>
        </h3>
        <div className="space-y-3">
          {[
            { id: 'trackAuth', label: t('als_track_auth') },
            { id: 'trackDocuments', label: t('als_track_docs') },
            { id: 'trackConfig', label: t('als_track_config') },
            { id: 'trackUsers', label: t('als_track_users') },
            { id: 'trackDownloads', label: t('als_track_downloads') },
            { id: 'trackPermissions', label: t('als_track_permissions') },
            { id: 'trackFailures', label: t('als_track_failures') }
          ].map((event) => (
            <div key={event.id} className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] transition-all duration-150 focus-within:border-[var(--dms-color-brand-primary)] focus-within:ring-2 focus-within:ring-[var(--dms-color-brand-primary)]/20">
                <input
                  type="checkbox"
                  id={event.id}
                  checked={settings[event.id]}
                  onChange={(e) => handleChange(event.id, e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-[var(--dms-color-border-default)] text-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20"
                />
              </span>
              <label htmlFor={event.id} className="text-sm font-medium text-ink-secondary cursor-pointer">
                {event.label}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Security Alerts */}
      <div className="border-2 border-[var(--dms-color-border-default)] rounded-[16px] p-5 bg-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_4%,var(--dms-color-bg-card))] space-y-4">
        <h3 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
          <span>🔔</span>
          <span>{t('als_security_alerts')}</span>
        </h3>
        <div className="space-y-3">
          {[
            { id: 'alertFailedLogins', label: t('als_alert_failed') },
            { id: 'alertUnauthorized', label: t('als_alert_unauthorized') },
            { id: 'alertBulkExports', label: t('als_alert_bulk') },
            { id: 'alertConfigChanges', label: t('als_alert_config') }
          ].map((alert) => (
            <div key={alert.id} className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] transition-all duration-150 focus-within:border-[var(--dms-color-brand-primary)] focus-within:ring-2 focus-within:ring-[var(--dms-color-brand-primary)]/20">
                <input
                  type="checkbox"
                  id={alert.id}
                  checked={settings[alert.id]}
                  onChange={(e) => handleChange(alert.id, e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-[var(--dms-color-border-default)] text-[var(--dms-color-brand-primary)] focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20"
                />
              </span>
              <label htmlFor={alert.id} className="text-sm font-medium text-ink-secondary cursor-pointer">
                {alert.label}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={loading}
          className="rounded-xl h-11 px-5 bg-[var(--dms-color-brand-primary)] text-[var(--dms-color-text-ink-onBrand)] font-semibold transition-all duration-150 hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/30"
        >
          {loading ? t('saving') : t('als_save_settings')}
        </button>
        <button
          onClick={handleReset}
          className="rounded-xl h-11 px-5 border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] text-ink-secondary font-semibold transition-all duration-150 hover:border-[var(--dms-color-border-strong)] hover:text-ink focus:outline-none focus:ring-2 focus:ring-[var(--dms-color-brand-primary)]/20"
        >
          {t('als_reset_defaults')}
        </button>
        {saveSuccess && (
          <span className="text-[var(--dms-color-success-ink)] text-sm font-semibold flex items-center gap-1.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {t('als_saved_success')}
          </span>
        )}
      </div>
    </div>
  )
}
