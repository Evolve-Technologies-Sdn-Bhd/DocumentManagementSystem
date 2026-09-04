import React from 'react'
import * as ReactDOM from 'react-dom'

const sizeMap = {
  sm: 'max-w-lg',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  '2xl': 'max-w-4xl',
  '3xl': 'max-w-6xl'
}

export function ModalHeader({ title, subtitle, onClose, className = '' }) {
  return (
    <div className={['sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4', className].filter(Boolean).join(' ')}>
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        {subtitle ? <p className="mt-2 text-sm text-gray-600">{subtitle}</p> : null}
      </div>
      {onClose ? (
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  )
}

export function ModalBody({ children, className = '' }) {
  return <div className={['px-6 py-4', className].filter(Boolean).join(' ')}>{children}</div>
}

export function ModalFooter({ children, className = '' }) {
  return <div className={['flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sticky bottom-0', className].filter(Boolean).join(' ')}>{children}</div>
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

  // Early return: do NOT render the modal (nor the portal) when it's not open.
  // This fixes state-closed-but-UI-still-visible issues with nested modals and portals.
  if (!show) return null

  // Remove boolean-ish props that React warns about when spread onto raw DOM elements.
  const domProps = props
  const modal = (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay p-4">
      <div className="fixed inset-0" onClick={closeOnBackdrop ? onClose : undefined} />
      <div
        role="dialog"
        aria-modal="true"
        className={[
          'modal-uniform relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-lg shadow-xl bg-white border border-gray-200',
          sizeMap[size] || sizeMap.lg,
          className
        ].filter(Boolean).join(' ')}
        {...domProps}
      >
        {children}
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
