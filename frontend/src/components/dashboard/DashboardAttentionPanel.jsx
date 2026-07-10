import React from 'react'
import { Link } from 'react-router-dom'
import AppSurface from '../ui/AppSurface'
import SectionHeader from '../ui/SectionHeader'
import EmptyPanelState from '../ui/EmptyPanelState'

const toneClasses = {
  critical: {
    badge: 'bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]',
    accent: 'bg-[var(--dms-color-danger-default)]'
  },
  warning: {
    badge: 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]',
    accent: 'bg-[var(--dms-color-warning-default)]'
  },
  info: {
    badge: 'bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]',
    accent: 'bg-[var(--dms-color-info-default)]'
  },
  success: {
    badge: 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]',
    accent: 'bg-[var(--dms-color-success-default)]'
  }
}

export default function DashboardAttentionPanel({
  title,
  subtitle,
  items,
  emptyTitle,
  emptyDescription,
  actionLabel
}) {
  return (
    <AppSurface padding="lg" className="space-y-4">
      <SectionHeader title={title} subtitle={subtitle} />

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => {
            const tone = toneClasses[item.tone] || toneClasses.info

            return (
              <Link
                key={item.key}
                to={item.to}
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface-muted p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/20 hover:bg-surface hover:shadow-dms-soft"
              >
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface">
                  <span className={['block h-2.5 w-2.5 rounded-full', tone.accent].join(' ')} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">{item.label}</div>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">{item.description}</p>
                    </div>
                    <div className={['shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', tone.badge].join(' ')}>
                      {item.count}
                    </div>
                  </div>
                  <div className="mt-3 text-xs font-medium text-brand">{actionLabel} →</div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <EmptyPanelState title={emptyTitle} description={emptyDescription} />
      )}
    </AppSurface>
  )
}
