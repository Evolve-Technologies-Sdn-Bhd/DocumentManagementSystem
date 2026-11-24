import React from 'react'

export default function PageHeader({
  title,
  subtitle,
  actions = null,
  className = '',
  compact = false
}) {
  return (
    <header className={[
      compact ? 'flex flex-col gap-2 md:flex-row md:items-center md:justify-between'
              : 'flex flex-col gap-4 md:flex-row md:items-start md:justify-between',
      className
    ].filter(Boolean).join(' ')}>
      <div className="min-w-0">
        <h1 className={compact ? 'text-lg font-semibold leading-tight text-ink' : 'text-[1.625rem] font-semibold leading-tight text-ink'}>{title}</h1>
        {subtitle && (
          <p className={compact ? 'mt-0.5 text-xs leading-5 text-ink-muted' : 'mt-1 text-sm leading-6 text-ink-muted'}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  )
}
