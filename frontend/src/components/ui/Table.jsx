import React from 'react'

export function TableContainer({ children, className = '', ...props }) {
  return (
    <div className={['ui-table-wrapper overflow-x-auto overscroll-x-contain', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </div>
  )
}

export function Table({ children, className = '', ...props }) {
  return (
    <table className={['w-full text-sm', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </table>
  )
}

export function Th({ children, className = '', align = 'left', stickyRight = false, ...props }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  const stickyClass = stickyRight ? 'sticky right-0 z-30 bg-gray-50 border-l border-gray-200' : ''
  return (
    <th
      className={[
        'px-4 py-3 text-xs font-semibold text-gray-700 uppercase tracking-wider',
        alignClass,
        stickyClass,
        className
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '', align = 'left', stickyRight = false, ...props }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  const stickyClass = stickyRight
    ? 'sticky right-0 z-20 bg-white group-hover:bg-gray-50 border-l border-gray-200'
    : ''
  return (
    <td
      className={[
        'px-4 py-4 align-middle text-sm text-gray-700',
        alignClass,
        stickyClass,
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
    <tr className={['group transition-colors hover:bg-gray-50', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </tr>
  )
}
