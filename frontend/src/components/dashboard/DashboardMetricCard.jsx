import React from 'react'
import AppSurface from '../ui/AppSurface'

const toneMap = {
  indigo: 'bg-white text-[var(--dms-color-info-ink)] ring-1 ring-[var(--dms-color-info-ink)]/12 shadow-[0_8px_18px_rgba(20,81,123,0.12)]',
  warning: 'bg-white text-[var(--dms-color-warning-ink)] ring-1 ring-[var(--dms-color-warning-ink)]/12 shadow-[0_8px_18px_rgba(180,83,9,0.12)]',
  success: 'bg-white text-[var(--dms-color-success-ink)] ring-1 ring-[var(--dms-color-success-ink)]/12 shadow-[0_8px_18px_rgba(5,150,105,0.12)]',
  neutral: 'bg-white text-ink-muted ring-1 ring-black/8 shadow-[0_8px_18px_rgba(15,23,42,0.10)]'
}

export default function DashboardMetricCard({
  title,
  value,
  description,
  icon: Icon,
  tone = 'indigo',
  surfaceClassName = '',
  surfaceStyle
}) {
  return (
    <AppSurface variant="interactive" padding="md" className={['h-full', surfaceClassName].filter(Boolean).join(' ')} style={surfaceStyle}>
      <div className="flex h-full flex-col">
        <div className="mb-4 flex items-start gap-3">
          <div className={['flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', toneMap[tone] || toneMap.indigo].join(' ')}>
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="min-w-0 flex-1 text-[13px] font-semibold leading-5 text-ink-secondary">{title}</h3>
        </div>
        <div className="mb-2 text-[1.875rem] font-semibold leading-none text-ink">{value}</div>
        <p className="mt-auto text-xs leading-5 text-ink-muted">{description}</p>
      </div>
    </AppSurface>
  )
}
