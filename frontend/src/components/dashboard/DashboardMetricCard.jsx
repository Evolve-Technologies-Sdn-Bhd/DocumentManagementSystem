import React from 'react'
import AppSurface from '../ui/AppSurface'

const toneMap = {
  indigo: 'bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]',
  warning: 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]',
  success: 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]',
  neutral: 'bg-surface-muted text-ink-muted'
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
