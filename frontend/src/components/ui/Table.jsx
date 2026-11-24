import React from 'react'

export function TableContainer({ children, className = '', ...props }) {
  return (
    <div className={['ui-table-wrapper overflow-x-auto overscroll-x-contain rounded-2xl border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] shadow-[0_12px_30px_rgba(15,23,42,0.08)]', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </div>
  )
}

export function Table({ children, className = '', ...props }) {
  return (
    <table className={['w-full text-sm border-collapse caption-bottom', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </table>
  )
}

export function Th({
  children,
  className = '',
  align = 'left',
  stickyRight = false,
  sortable = false,
  sortDirection = null,
  onSort,
  sortKey,
  draggable = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  dragOver = false,
  ...props
}) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  const baseBg = stickyRight
    ? 'bg-[var(--dms-color-bg-surface-muted)] border-l-2 border-[var(--dms-color-border-default)]'
    : 'bg-[var(--dms-color-bg-surface-muted)]'
  const sortedActive = sortDirection != null
  const stickyZ = sortedActive ? 'z-40' : 'z-30'
  const stickyClass = stickyRight ? `sticky right-0 ${stickyZ} ${baseBg}` : ''
  const sortActiveBg = sortedActive
    ? 'bg-[color-mix(in_srgb,var(--dms-color-info-soft)_70%,var(--dms-color-bg-surface-muted))] text-[var(--dms-color-info-ink)] font-bold shadow-[inset_0_-2px_0_var(--dms-color-brand-primary)]'
    : ''
  const sortableClass =
    sortable && onSort
      ? `cursor-pointer select-none transition-colors focus:outline-none ${sortActiveBg || 'hover:bg-[color-mix(in_srgb,var(--dms-color-bg-surface-strong)_50%,var(--dms-color-bg-surface-muted))] focus:ring-1 focus:ring-inset focus:ring-[var(--dms-color-brand-primary)]/40'}`
      : sortActiveBg
  const draggableClass = draggable ? 'cursor-grab active:cursor-grabbing' : ''
  const dragOverClass = dragOver ? 'bg-[color-mix(in_srgb,var(--dms-color-info-soft)_60%,var(--dms-color-bg-surface-muted))] ring-2 ring-inset ring-[var(--dms-color-info-default)]/40' : ''

  const handleClick = (e) => {
    if (sortable && onSort) {
      onSort(sortKey, e)
    }
  }

  const SortIndicator = () => {
    if (!sortable) return null
    const icon = sortDirection === 'asc'
      ? (
          <svg className="w-3.5 h-3.5 text-[var(--dms-color-info-ink)] shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .55.24l5 5a.75.75 0 1 1-1.1 1.02L10.75 5.81V16a.75.75 0 0 1-1.5 0V5.81L5.55 9.26a.75.75 0 0 1-1.1-1.02l5-5A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
          </svg>
        )
      : sortDirection === 'desc'
        ? (
            <svg className="w-3.5 h-3.5 text-[var(--dms-color-info-ink)] shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.55-.24l-5-5a.75.75 0 1 1 1.1-1.02l4.2 4.2V4a.75.75 0 0 1 1.5 0v10.94l4.2-4.2a.75.75 0 1 1 1.1 1.02l-5 5A.75.75 0 0 1 10 17Z" clipRule="evenodd" />
            </svg>
          )
        : (
            <svg className="w-3.5 h-3.5 text-[var(--dms-color-text-muted)] shrink-0 group-hover:text-ink-secondary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 3.25a.75.75 0 0 1 .53.22l2.75 2.75a.75.75 0 0 1-1.06 1.06L10 5.06 7.78 7.28a.75.75 0 1 1-1.06-1.06l2.75-2.75A.75.75 0 0 1 10 3.25ZM10 16.75a.75.75 0 0 1-.53-.22L6.72 13.78a.75.75 0 1 1 1.06-1.06L10 14.94l2.22-2.22a.75.75 0 1 1 1.06 1.06l-2.75 2.75a.75.75 0 0 1-.53.22Z" />
            </svg>
          )
    return icon
  }

  return (
    <th
      className={[
        'px-4 py-3 !text-[11px] font-bold uppercase tracking-[0.08em] text-ink-secondary border-b-2 border-[var(--dms-color-border-default)] backdrop-blur-sm shadow-[inset_0_-1px_0_var(--dms-color-border-strong)]',
        alignClass,
        stickyClass || baseBg,
        sortableClass,
        draggableClass,
        dragOverClass,
        className
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      draggable={draggable || undefined}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      {...props}
    >
      <span className={[
        'inline-flex items-center w-full gap-1.5',
        align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
      ].join(' ')}>
        {draggable && (
          <span className="shrink-0 text-[var(--dms-color-text-muted)] opacity-70 hover:opacity-100" aria-hidden="true">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2Zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8Zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14Zm6-12a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 2Zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8Zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14Z" />
            </svg>
          </span>
        )}
        <span className="truncate">{children}</span>
        {sortable && <SortIndicator />}
      </span>
    </th>
  )
}

export function Td({ children, className = '', align = 'left', stickyRight = false, ...props }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  const stickyClass = stickyRight
    ? 'sticky right-0 z-20 bg-[var(--dms-color-bg-surface)]/98 group-hover:bg-[var(--dms-color-bg-surface-muted)]/95 border-l-2 border-[var(--dms-color-border-default)] backdrop-blur-sm shadow-[-2px_0_0_var(--dms-color-border-default)]'
    : ''
  const truncateClass = className ? '' : 'truncate'
  return (
    <td
      className={[
        'px-4 py-3 align-middle text-sm text-ink border-b border-[var(--dms-color-border-default)]',
        alignClass,
        stickyClass,
        truncateClass,
        className
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </td>
  )
}

export function Tr({ children, className = '', ...props }) {
  return (
    <tr className={['group transition-colors duration-100 hover:bg-[var(--dms-color-info-soft)]/25 even:bg-[var(--dms-color-bg-surface-muted)]/35', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </tr>
  )
}
