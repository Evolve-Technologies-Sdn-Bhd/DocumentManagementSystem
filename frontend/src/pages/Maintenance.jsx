import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

const maintenanceApi = axios.create({
  baseURL: api.defaults.baseURL,
  timeout: 5000
})
import { getDefaultRoute } from '../utils/defaultRoute'
import { isSystemAdmin } from '../utils/permissions'
import { readBranding } from '../utils/branding'
import PublicTopbar from '../components/PublicTopbar'
import PublicFooter from '../components/PublicFooter'

const formatCountdown = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [
    { label: 'Days', value: days },
    { label: 'Hours', value: hours },
    { label: 'Minutes', value: minutes },
    { label: 'Seconds', value: seconds }
  ]
}

export default function Maintenance() {
  const navigate = useNavigate()
  const [branding] = useState(() => readBranding())
  const [loading, setLoading] = useState(true)
  const [refreshError, setRefreshError] = useState('')
  const requestInFlight = useRef(false)
  const [now, setNow] = useState(Date.now())
  const [status, setStatus] = useState(() => {
    try {
      const cached = localStorage.getItem('maintenanceStatus')
      if (cached) return JSON.parse(cached)
    } catch {}
    return {
      enabled: true,
      message: 'System is under maintenance',
      manualEnabled: false,
      scheduleStatus: 'disabled',
      schedule: { enabled: false, startAt: null, endAt: null }
    }
  })

  const refreshQueued = useRef(false)
  const queuedShowLoading = useRef(false)

  const reloadStatus = async (showLoading = false) => {
    if (requestInFlight.current) {
      refreshQueued.current = true
      queuedShowLoading.current = queuedShowLoading.current || showLoading
      if (showLoading) setLoading(true)
      return false
    }

    requestInFlight.current = true
    if (showLoading) setLoading(true)

    try {
      const res = await maintenanceApi.get('/public/maintenance-status')

      const data = res?.data?.data || {}
      const enabled = Boolean(data.enabled)
      const message =
        data.message || res?.data?.message || 'System is under maintenance'

      const next = {
        enabled,
        manualEnabled: Boolean(data.manualEnabled),
        message,
        manualMessage: data.manualMessage || message,
        scheduleStatus: data.scheduleStatus || 'disabled',
        schedule: data.schedule || {
          enabled: false,
          startAt: null,
          endAt: null,
          message
        }
      }

      setStatus(next)
      setRefreshError('')

      try {
        localStorage.setItem('maintenanceStatus', JSON.stringify(next))
      } catch {}

      if (!enabled) {
        navigate(getDefaultRoute(), { replace: true })
      }

      return true
    } catch (error) {
      if (showLoading) {
        setRefreshError(
          error?.response?.data?.message ||
          error?.message ||
          'Unable to refresh maintenance status. Please try again.'
        )
      }
      return false
    } finally {
      requestInFlight.current = false
      if (showLoading) setLoading(false)

      if (refreshQueued.current) {
        const nextShowLoading = queuedShowLoading.current
        refreshQueued.current = false
        queuedShowLoading.current = false
        Promise.resolve().then(() => reloadStatus(nextShowLoading))
      }
    }
  }

  useEffect(() => {
    reloadStatus(true)

    // Retry status checks frequently so an expired schedule does not leave
    // users on the maintenance page until a long polling interval completes.
    const statusTimer = setInterval(() => {
      reloadStatus(false)
    }, 5000)

    const clockTimer = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reloadStatus(false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(statusTimer)
      clearInterval(clockTimer)
    }
  }, [])

  // Check the backend at the exact scheduled transition, not at the next polling interval.
  useEffect(() => {
    if (status?.manualEnabled) return

    const schedule = status?.schedule || {}
    const transitionAt = status?.scheduleStatus === 'pending'
      ? Date.parse(schedule.startAt)
      : status?.scheduleStatus === 'active'
        ? Date.parse(schedule.endAt)
        : NaN

    if (!Number.isFinite(transitionAt)) return

    const delay = Math.max(0, transitionAt - Date.now()) + 150
    const timer = setTimeout(() => {
      reloadStatus(false)
    }, delay)

    return () => clearTimeout(timer)
  }, [
    status?.scheduleStatus,
    status?.schedule?.startAt,
    status?.schedule?.endAt,
    status?.manualEnabled
  ])

  // Retry every second after the scheduled end until the server confirms
  // that maintenance is no longer active. This timer is not reset by clock ticks.
  useEffect(() => {
    const endAt = status?.schedule?.endAt
    const endTime = endAt ? Date.parse(endAt) : NaN

    if (
      status?.manualEnabled ||
      status?.scheduleStatus !== 'active' ||
      !Number.isFinite(endTime)
    ) return

    const checkExpiredSchedule = () => {
      if (Date.now() >= endTime) reloadStatus(false)
    }

    checkExpiredSchedule()
    const timer = setInterval(checkExpiredSchedule, 1000)

    return () => clearInterval(timer)
  }, [
    status?.manualEnabled,
    status?.scheduleStatus,
    status?.schedule?.endAt
  ])

  const canEnterSystem = isSystemAdmin()
  const endAt = status?.schedule?.endAt
  const endTime = endAt ? Date.parse(endAt) : NaN
  const showCountdown =
    status?.scheduleStatus === 'active' &&
    !status?.manualEnabled &&
    Number.isFinite(endTime)

  const countdown = showCountdown
    ? formatCountdown(endTime - now)
    : []

  const malaysiaEndTime = showCountdown
    ? new Intl.DateTimeFormat('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        dateStyle: 'medium',
        timeStyle: 'short',
        hour12: true
      }).format(new Date(endTime))
    : null

  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <PublicTopbar branding={branding} />
      <main className="flex w-full flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex w-full max-w-2xl flex-col items-center">
          <div className="mb-8 flex flex-col items-center gap-4">
            <div
              className="flex items-center justify-center text-brand"
              role="img"
              aria-label="Maintenance"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="168"
                height="168"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />
              </svg>
            </div>

            <h1 className="text-center text-2xl font-semibold">
              System Under Maintenance
            </h1>

            <p className="text-center text-sm text-ink-muted">
              {status?.message || 'System is under maintenance'}
            </p>
          </div>

          {showCountdown ? (
            <div className="mb-6 w-full rounded-xl border border-border bg-surface p-6">
              <p className="mb-4 text-center text-sm font-medium text-ink-muted">
                Scheduled maintenance ends in
              </p>

              <div className="grid grid-cols-4 gap-2 sm:gap-4">
                {countdown.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg bg-surface-muted px-2 py-4 text-center"
                  >
                    <div className="text-2xl font-semibold tabular-nums sm:text-3xl">
                      {String(item.value).padStart(2, '0')}
                    </div>
                    <div className="mt-1 text-xs text-ink-muted">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-center text-xs text-ink-muted">
                Expected completion: {malaysiaEndTime} (Malaysia Time)
              </p>
            </div>
          ) : null}

          <div className="w-full rounded-xl border border-border bg-surface p-6">
            <div className="flex flex-col gap-3">
              <button
                onClick={() => reloadStatus(true)}
                disabled={loading}
                className="w-full rounded-lg bg-surface-muted px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted/70 disabled:opacity-60"
              >
                {loading ? 'Checking status...' : 'Refresh'}
              </button>

              {refreshError ? (
                <p className="text-center text-sm text-danger" role="alert">
                  {refreshError}
                </p>
              ) : null}

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
      </main>
      <PublicFooter branding={branding} />
    </div>
  )
}
