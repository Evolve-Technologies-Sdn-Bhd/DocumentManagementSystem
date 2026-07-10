import React from 'react'
import { Link } from 'react-router-dom'
import AppSurface from '../ui/AppSurface'
import SectionHeader from '../ui/SectionHeader'
import EmptyPanelState from '../ui/EmptyPanelState'

export default function DashboardExpiryOverview({
  title,
  subtitle,
  stats,
  items = [],
  totalLabel,
  actionLabel,
  emptyTitle,
  emptyDescription
}) {
  const total = stats?.totalTrackedDocuments || 0
  const hasData = Boolean(stats)

  return (
    <AppSurface padding="lg" className="space-y-4">
      <SectionHeader
        title={title}
        subtitle={subtitle}
        actions={hasData ? (
          <Link className="text-sm font-medium text-brand transition-colors hover:text-brand-hover hover:underline" to="/expiry-tracking">
            {actionLabel} →
          </Link>
        ) : null}
      />

      {total > 0 ? (
        <>
          <div className="rounded-2xl border border-border bg-surface-muted p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">{totalLabel}</div>
            <div className="mt-2 text-3xl font-semibold text-ink">{total}</div>
          </div>

          <div className="space-y-3">
            {items.map((item) => {
              const percentage = total > 0 ? Math.min((item.value / total) * 100, 100) : 0

              return (
                <div key={item.key} className="rounded-2xl border border-border bg-surface-muted p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={['h-3 w-3 rounded-full', item.color].join(' ')} />
                      <span className="text-sm font-medium text-ink-secondary">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-ink">{item.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface">
                    <div
                      className={['h-2 rounded-full transition-all duration-300', item.color].join(' ')}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <EmptyPanelState title={emptyTitle} description={emptyDescription} />
      )}
    </AppSurface>
  )
}
