import React from 'react'

export function TableContainer({ children, className = '', ...props }) {
  return (
    <div className={['ui-table-wrapper overflow-x-auto overscroll-x-contain rounded-lg border border-gray-200 bg-white shadow-sm', className].filter(Boolean).join(' ')} {...props}>
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
  const baseBg = stickyRight ? 'bg-gray-50/95 border-l border-gray-200' : 'bg-gray-50/95'
  const sortedActive = sortDirection != null
  const stickyZ = sortedActive ? 'z-40' : 'z-30'
  const stickyClass = stickyRight ? `sticky right-0 ${stickyZ} ${baseBg}` : ''
  const sortActiveBg = sortedActive ? (stickyRight ? 'bg-blue-50/90 text-blue-900 font-semibold' : 'bg-blue-50/70 text-blue-900 font-semibold') : ''
  const sortableClass = sortable && onSort ? `cursor-pointer select-none hover:bg-gray-100 transition-colors focus:outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 ${sortActiveBg}` : sortActiveBg
  const draggableClass = draggable ? 'cursor-grab active:cursor-grabbing' : ''
  const dragOverClass = dragOver ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''

  const handleClick = (e) => {
    if (sortable && onSort) {
      onSort(sortKey, e)
    }
  }

  const SortIndicator = () => {
    if (!sortable) return null
    const icon = sortDirection === 'asc'
      ? (
          <svg className="w-3.5 h-3.5 text-blue-700 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .55.24l5 5a.75.75 0 1 1-1.1 1.02L10.75 5.81V16a.75.75 0 0 1-1.5 0V5.81L5.55 9.26a.75.75 0 0 1-1.1-1.02l5-5A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
          </svg>
        )
      : sortDirection === 'desc'
        ? (
            <svg className="w-3.5 h-3.5 text-blue-700 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.55-.24l-5-5a.75.75 0 1 1 1.1-1.02l4.2 4.2V4a.75.75 0 0 1 1.5 0v10.94l4.2-4.2a.75.75 0 1 1 1.1 1.02l-5 5A.75.75 0 0 1 10 17Z" clipRule="evenodd" />
            </svg>
          )
        : (
            <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 3.25a.75.75 0 0 1 .53.22l2.75 2.75a.75.75 0 0 1-1.06 1.06L10 5.06 7.78 7.28a.75.75 0 1 1-1.06-1.06l2.75-2.75A.75.75 0 0 1 10 3.25ZM10 16.75a.75.75 0 0 1-.53-.22L6.72 13.78a.75.75 0 1 1 1.06-1.06L10 14.94l2.22-2.22a.75.75 0 1 1 1.06 1.06l-2.75 2.75a.75.75 0 0 1-.53.22Z" />
            </svg>
          )
    return icon
  }

  return (
    <th
      className={[
        'px-4 py-2.5 text-xs font-semibold text-gray-700 uppercase tracking-[0.04em] group border-b border-gray-200 backdrop-blur-[1px]',
        alignClass,
        stickyClass,
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
        'inline-flex items-center w-full gap-1',
        align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
      ].join(' ')}>
        {draggable && (
          <span className="shrink-0 text-gray-400 opacity-60 hover:opacity-100" aria-hidden="true">
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
    ? 'sticky right-0 z-20 bg-white/95 group-hover:bg-gray-50/95 border-l border-gray-200 backdrop-blur-[1px]'
    : ''
  const truncateClass = className ? '' : 'truncate'
  return (
    <td
      className={[
        'px-4 py-3 align-middle text-sm text-gray-800 border-b border-gray-100',
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
    <tr className={['group transition-colors duration-100 hover:bg-gray-50 even:bg-gray-50/30', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </tr>
  )
}
