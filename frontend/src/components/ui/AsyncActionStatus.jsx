import React from 'react'
import AppSurface from './AppSurface'
import InlineSpinner from './InlineSpinner'

const toneStyles = {
  info: {
    panel: 'border-[var(--dms-color-info-soft)] bg-[var(--dms-color-info-soft)]/40 text-[var(--dms-color-info-ink)]',
    bar: 'bg-[var(--dms-color-info-ink)]/80'
  },
  error: {
    panel: 'border-[var(--dms-color-danger-soft)] bg-[var(--dms-color-danger-soft)]/40 text-[var(--dms-color-danger-ink)]',
    bar: 'bg-[var(--dms-color-danger-ink)]/80'
  }
}

export default function AsyncActionStatus({
  title,
  message = '',
  progress = null,
  tone = 'info',
  busy = false,
  className = ''
}) {
  const styles = toneStyles[tone] || toneStyles.info
  const clampedProgress = typeof progress === 'number'
    ? Math.max(0, Math.min(100, Math.round(progress)))
    : null

  return (
    <AppSurface
      padding="md"
      variant="panel"
      className={['border text-sm', styles.panel, className].filter(Boolean).join(' ')}
    >
      <div className="flex items-start gap-3">
        {busy ? <InlineSpinner className="mt-0.5 h-4 w-4 border-2" /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{title}</p>
            {clampedProgress !== null ? <span className="text-xs font-semibold">{clampedProgress}%</span> : null}
          </div>
          {message ? <p className="mt-1 text-xs opacity-90">{message}</p> : null}
          {clampedProgress !== null ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/60">
              <div
                className={['h-full rounded-full transition-[width] duration-200 ease-out', styles.bar].join(' ')}
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </AppSurface>
  )
}
