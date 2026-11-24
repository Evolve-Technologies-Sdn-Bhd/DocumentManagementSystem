import React from 'react'

export default function EmptyPanelState({
  title,
  description,
  icon = null,
  className = ''
}) {
  return (
    <div className={['flex flex-col items-center justify-center rounded-dms border-2 border-dashed border-[var(--dms-color-border-default)] bg-[color-mix(in_srgb,var(--dms-color-bg-surface)_95%,var(--dms-color-bg-surface-muted))] px-6 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', className].filter(Boolean).join(' ')}>
      {icon && <div className="mb-4 h-12 w-12 flex items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--dms-color-bg-surface-muted)_70%,var(--dms-color-bg-surface-strong))] text-ink-secondary ring-1 ring-[var(--dms-color-border-default)] shadow-[0_4px_14px_rgba(15,23,42,0.10)]">{icon}</div>}
      <p className="text-[15px] font-bold text-ink">{title}</p>
      {description && <p className="mt-2 max-w-sm text-sm leading-6 text-ink-secondary">{description}</p>}
    </div>
  )
}
