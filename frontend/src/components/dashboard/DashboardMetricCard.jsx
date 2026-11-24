import React from 'react'
import { useNavigate } from 'react-router-dom'
import AppSurface from '../ui/AppSurface'

const toneMap = {
  indigo:
    'bg-[color-mix(in_srgb,var(--dms-color-info-soft)_70%,var(--dms-color-bg-surface-strong))] text-[var(--dms-color-info-ink)] ring-1 ring-[var(--dms-color-info-ink)]/20 shadow-[0_8px_18px_rgba(15,23,42,0.14)]',
  warning:
    'bg-[color-mix(in_srgb,var(--dms-color-warning-soft)_70%,var(--dms-color-bg-surface-strong))] text-[var(--dms-color-warning-ink)] ring-1 ring-[var(--dms-color-warning-ink)]/20 shadow-[0_8px_18px_rgba(15,23,42,0.14)]',
  success:
    'bg-[color-mix(in_srgb,var(--dms-color-success-soft)_70%,var(--dms-color-bg-surface-strong))] text-[var(--dms-color-success-ink)] ring-1 ring-[var(--dms-color-success-ink)]/20 shadow-[0_8px_18px_rgba(15,23,42,0.14)]',
  neutral:
    'bg-[color-mix(in_srgb,var(--dms-color-bg-surface-strong)_75%,var(--dms-color-border-default))] text-ink ring-1 ring-[var(--dms-color-border-strong)]/25 shadow-[0_8px_18px_rgba(15,23,42,0.12)]'
}

export default function DashboardMetricCard({
  title,
  value,
  description,
  icon: Icon,
  tone = 'indigo',
  surfaceClassName = '',
  surfaceStyle,
  to,
  onClick
}) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (onClick) {
      onClick()
    } else if (to) {
      navigate(to)
    }
  }

  const isClickable = Boolean(to || onClick)

  return (
    <AppSurface
      variant="interactive"
      padding="md"
      className={[
        'h-full',
        isClickable ? 'cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0' : '',
        surfaceClassName
      ].filter(Boolean).join(' ')}
      style={surfaceStyle}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'link' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      } : undefined}
    >
      <div className="flex h-full flex-col">
        <div className="mb-4 flex items-start gap-3">
          <div className={['flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', toneMap[tone] || toneMap.indigo].join(' ')}>
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="min-w-0 flex-1 text-[13px] font-semibold leading-5 text-ink">{title}</h3>
        </div>
        <div className="mb-2 text-[1.875rem] font-semibold leading-none text-ink">{value}</div>
        <p className="mt-auto text-xs leading-5 text-ink-secondary">
          {description}
          {isClickable && (
            <span className="mt-1 block font-semibold text-[var(--dms-color-brand-primary)]">View all →</span>
          )}
        </p>
      </div>
    </AppSurface>
  )
}
