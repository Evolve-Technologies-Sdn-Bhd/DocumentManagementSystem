import React from 'react'
import * as ReactDOM from 'react-dom'

const sizeMap = {
  sm: 'max-w-lg',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  '2xl': 'max-w-4xl',
  '3xl': 'max-w-6xl',
  full: 'w-[96vw]'
}

export function ModalHeader({ title, subtitle, onClose, className = '' }) {
  return (
    <div className={['flex-shrink-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-6 py-4 shadow-[0_1px_0_var(--dms-color-border-strong)]', className].filter(Boolean).join(' ')}>
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-[var(--dms-color-text-ink)]">{title}</h2>
        {subtitle ? <p className="mt-2 text-sm text-[var(--dms-color-text-ink-secondary)]">{subtitle}</p> : null}
      </div>
      {onClose ? (
        <button type="button" onClick={onClose} className="text-[var(--dms-color-text-muted)] hover:text-[var(--dms-color-text-ink)] transition-colors" aria-label="Close">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  )
}

export function ModalBody({ children, className = '' }) {
  return <div className={['flex-1 min-h-0 overflow-y-auto px-6 py-4 dms-scrollbar', className].filter(Boolean).join(' ')}>{children}</div>
}

export function ModalFooter({ children, className = '' }) {
  return <div className={['flex-shrink-0 flex items-center justify-end gap-3 border-t border-[var(--dms-color-border-default)] bg-[color-mix(in_srgb,var(--dms-color-bg-surface)_95%,var(--dms-color-bg-surface-muted))] px-6 py-4 shadow-[0_-1px_0_var(--dms-color-border-strong)]', className].filter(Boolean).join(' ')}>{children}</div>
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
      <div className="relative inset-0 flex h-full w-full items-center justify-center p-4 overflow-y-auto">
        <div
          role="dialog"
          aria-modal="true"
          className={[
            'modal-uniform relative z-10 my-auto w-full max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden rounded-[16px] shadow-[0_30px_80px_rgba(15,23,42,0.30)] ring-1 ring-black/10 border-2 border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)]',
            sizeMap[size] || sizeMap.lg,
            className
          ].filter(Boolean).join(' ')}
          {...domProps}
        >
          {children}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
