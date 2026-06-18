import React from 'react'

export function TableContainer({ children, className = '', ...props }) {
  return (
    <div className={['dms-scrollbar overflow-x-auto overscroll-x-contain rounded-2xl border border-border bg-surface', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </div>
  )
}

export function Table({ children, className = '', ...props }) {
  return (
    <table className={['w-full text-[13px] leading-5', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </table>
  )
}

export function Th({ children, className = '', align = 'left', ...props }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <th
      className={[
        'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft border-b border-border',
        alignClass,
        className
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '', align = 'left', ...props }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <td
      className={[
        'px-4 py-3.5 align-middle text-[13px] text-ink-secondary border-b border-border/70',
        alignClass,
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
    <tr className={['transition-colors hover:bg-surface-muted', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </tr>
  )
}
