import React from 'react'
import * as ReactDOM from 'react-dom'

const sizeMap = {
  sm: 'max-w-full sm:max-w-md md:max-w-lg',
  md: 'max-w-full sm:max-w-lg md:max-w-2xl',
  lg: 'max-w-full sm:max-w-2xl md:max-w-3xl',
  xl: 'max-w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl',
  '2xl': 'max-w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl',
  '3xl': 'max-w-full sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl',
  full: 'w-[96vw]'
}

export function ModalHeader({ title, subtitle, onClose, className = '' }) {
  return (
    <div className={['flex-shrink-0 z-10 flex items-start justify-between gap-3 sm:gap-4 border-b border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] sm:px-6 px-4 sm:py-4 py-3 shadow-[0_1px_0_var(--dms-color-border-strong)]', className].filter(Boolean).join(' ')}>
      <div className="min-w-0">
        <h2 className="sm:text-xl text-lg font-bold text-[var(--dms-color-text-ink)]">{title}</h2>
        {subtitle ? <p className="mt-1.5 sm:text-sm text-xs text-[var(--dms-color-text-ink-secondary)]">{subtitle}</p> : null}
      </div>
      {onClose ? (
        <button type="button" onClick={onClose} className="text-[var(--dms-color-text-muted)] hover:text-[var(--dms-color-text-ink)] transition-colors shrink-0" aria-label="Close">
          <svg className="sm:w-6 sm:h-6 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  )
}

export function ModalBody({ children, className = '' }) {
  return <div className={['flex-1 min-h-0 overflow-y-auto sm:px-6 px-4 sm:py-4 py-3 dms-scrollbar', className].filter(Boolean).join(' ')}>{children}</div>
}

export function ModalFooter({ children, className = '' }) {
  return <div className={['flex-shrink-0 flex-wrap flex items-center justify-end gap-2 sm:gap-3 border-t border-[var(--dms-color-border-default)] bg-[color-mix(in_srgb,var(--dms-color-bg-surface)_95%,var(--dms-color-bg-surface-muted))] sm:px-6 px-4 sm:py-4 py-3 shadow-[0_-1px_0_var(--dms-color-border-strong)]', className].filter(Boolean).join(' ')}>{children}</div>
}

export default function Modal({
  children,
  isOpen = true,
  open,
  onClose,
  closeOnBackdrop = false,
  size = 'lg',
  className = '',
  ...props
}) {
  const show = isOpen && (open === undefined || open)

  if (!show) return null

  const domProps = props
  const modal = (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-overlay"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div className="relative inset-0 flex h-full w-full sm:items-center items-start justify-center sm:p-4 p-2 overflow-y-auto">
        <div
          role="dialog"
          aria-modal="true"
          className={[
            'modal-uniform relative z-10 sm:my-auto my-0 w-full max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden sm:rounded-[16px] rounded-lg shadow-[0_30px_80px_rgba(15,23,42,0.30)] ring-1 ring-black/10 sm:border-2 border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)]',
            sizeMap[size] || sizeMap.lg,
            className
          ].filter(Boolean).join(' ')}
          {...domProps}
        >
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden [&>*]:flex [&>*]:flex-col [&>*]:min-h-0 [&>*]:overflow-hidden [&>*:has(.overflow-y-auto)]:flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
