import React from 'react'
import * as ReactDOM from 'react-dom'
import AppSurface from './AppSurface'
import IconButton from './IconButton'

const sizeMap = {
  sm: 'max-w-lg',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl'
}

export function ModalHeader({ title, subtitle, onClose, className = '' }) {
  return (
    <div className={['sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface-muted px-6 py-4', className].filter(Boolean).join(' ')}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {onClose ? (
        <IconButton type="button" size="sm" onClick={onClose} aria-label="Close">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </IconButton>
      ) : null}
    </div>
  )
}

export function ModalBody({ children, className = '' }) {
  return <div className={['px-6 py-5', className].filter(Boolean).join(' ')}>{children}</div>
}

export function ModalFooter({ children, className = '' }) {
  return <div className={['flex items-center justify-end gap-3 border-t border-border bg-surface px-6 py-4', className].filter(Boolean).join(' ')}>{children}</div>
}

export default function Modal({
  children,
  onClose,
  closeOnBackdrop = false,
  size = 'lg',
  className = '',
  ...props
}) {
  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="fixed inset-0" onClick={closeOnBackdrop ? onClose : undefined} />
      <AppSurface
        padding="none"
        className={['relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-[18px]', sizeMap[size] || sizeMap.lg, className].filter(Boolean).join(' ')}
        {...props}
      >
        {children}
      </AppSurface>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
