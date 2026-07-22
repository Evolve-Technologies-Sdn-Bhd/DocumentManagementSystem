import React, { useEffect, useMemo, useState } from 'react'
import * as ReactDOM from 'react-dom'
import AppSurface from './AppSurface'
import InlineSpinner from './InlineSpinner'
import { getGlobalLoading, subscribeGlobalLoading } from '../../utils/globalLoadingStore'
import { getUploadProgress, subscribeUploadProgress } from '../../utils/uploadProgressStore'

export default function GlobalLoadingOverlay() {
  const [globalLoading, setGlobalLoading] = useState(() => getGlobalLoading())
  const [uploadProgress, setUploadProgress] = useState(() => getUploadProgress())

  useEffect(() => {
    const unsubGlobal = subscribeGlobalLoading(setGlobalLoading)
    const unsubUpload = subscribeUploadProgress(setUploadProgress)
    return () => {
      unsubGlobal()
      unsubUpload()
    }
  }, [])

  const isUploadActive = Boolean(uploadProgress?.active)
  const isGlobalActive = Boolean(globalLoading?.active)
  const open = isUploadActive || isGlobalActive

  const percent = useMemo(() => {
    if (!isUploadActive) return null
    return typeof uploadProgress?.percent === 'number' ? uploadProgress.percent : null
  }, [isUploadActive, uploadProgress?.percent])

  const label = useMemo(() => {
    if (isUploadActive) return uploadProgress?.label || 'Uploading...'
    return globalLoading?.label || 'Working...'
  }, [globalLoading?.label, isUploadActive, uploadProgress?.label])

  const countText = useMemo(() => {
    if (isUploadActive) return null
    const count = typeof globalLoading?.count === 'number' ? globalLoading.count : 0
    if (count > 1) return `${count} actions in progress`
    return null
  }, [globalLoading?.count, isUploadActive])

  const clampedPercent = typeof percent === 'number'
    ? Math.max(0, Math.min(100, Math.round(percent)))
    : null

  if (!open) return null

  const overlay = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-4">
      <AppSurface
        variant="panel"
        padding="lg"
        className="w-full max-w-sm border border-border shadow-dms-lg"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          {clampedPercent === null ? (
            <InlineSpinner className="mt-0.5 h-5 w-5 border-2" />
          ) : (
            <div className="mt-0.5 h-5 w-5 rounded-full border-2 border-border border-t-brand animate-spin" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{label}</div>
                {countText ? <div className="mt-0.5 text-xs text-ink-muted">{countText}</div> : null}
              </div>
              {clampedPercent !== null ? (
                <div className="shrink-0 text-xs font-semibold text-ink">{clampedPercent}%</div>
              ) : null}
            </div>
            {clampedPercent !== null ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-150 ease-out"
                  style={{ width: `${clampedPercent}%` }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </AppSurface>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return overlay
  return ReactDOM.createPortal(overlay, document.body)
}
