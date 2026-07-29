import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { getDefaultRoute } from '../utils/defaultRoute'
import { getUserPermissions } from '../utils/permissions'
import { readBranding } from '../utils/branding'
import PublicTopbar from '../components/PublicTopbar'
import PublicFooter from '../components/PublicFooter'
import BrandLogoImage from '../components/ui/BrandLogoImage'

export default function Maintenance() {
  const navigate = useNavigate()
  const permissions = useMemo(() => getUserPermissions(), [])
  const [branding] = useState(() => readBranding())
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState(() => {
    try {
      const cached = localStorage.getItem('maintenanceStatus')
      if (cached) return JSON.parse(cached)
    } catch {}
    return { enabled: true, message: 'System is under maintenance' }
  })

  const reloadStatus = async () => {
    setLoading(true)
    try {
      const res = await api.get('/public/maintenance-status', { timeout: 5000 })
      const enabled = Boolean(res?.data?.data?.enabled)
      const message =
        res?.data?.data?.message || res?.data?.message || 'System is under maintenance'
      const next = { enabled, message }
      setStatus(next)
      try {
        localStorage.setItem('maintenanceStatus', JSON.stringify(next))
      } catch {}
    } catch {
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reloadStatus()
  }, [])

  const canEnterSystem = permissions?.all === true

  return (
    <div className="min-h-screen bg-surface text-ink">
      <PublicTopbar branding={branding} />
      <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-16">
        <div className="mb-8 flex flex-col items-center gap-4">
          <BrandLogoImage
            src={branding?.theme?.mainLogo}
            alt={branding?.companyInfo?.companyName || 'DMS'}
            className="h-14 w-auto"
          />
          <h1 className="text-center text-2xl font-semibold">System Under Maintenance</h1>
          <p className="text-center text-sm text-ink-muted">
            {status?.message || 'System is under maintenance'}
          </p>
        </div>

        <div className="w-full rounded-xl border border-border bg-surface p-6">
          <div className="flex flex-col gap-3">
            <button
              onClick={reloadStatus}
              disabled={loading}
              className="w-full rounded-lg bg-surface-muted px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted/70 disabled:opacity-60"
            >
              {loading ? 'Checking status...' : 'Refresh'}
            </button>

            {status?.enabled ? (
              <button
                onClick={() => navigate('/login')}
                className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-brand-hover"
              >
                System Admin Login
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-brand-hover"
              >
                Go to Login
              </button>
            )}

            {status?.enabled && canEnterSystem ? (
              <button
                onClick={() => navigate(getDefaultRoute())}
                className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
              >
                Continue to System
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <PublicFooter branding={branding} />
    </div>
  )
}

