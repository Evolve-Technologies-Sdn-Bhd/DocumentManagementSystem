import React from 'react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from './ui/Modal'

const typeStyles = {
  info: {
    symbol: 'i',
    icon: 'bg-blue-50 text-blue-700 ring-blue-200',
    button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
  },
  warning: {
    symbol: '!',
    icon: 'bg-amber-50 text-amber-700 ring-amber-200',
    button: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500'
  },
  danger: {
    symbol: '!',
    icon: 'bg-red-50 text-red-700 ring-red-200',
    button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
  },
  success: {
    symbol: '✓',
    icon: 'bg-green-50 text-green-700 ring-green-200',
    button: 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
  }
}

function DialogMessage({ message, type }) {
  const style = typeStyles[type] || typeStyles.info

  return (
    <ModalBody className="flex flex-row items-start gap-3 sm:gap-4">
      <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold ring-1 ${style.icon}`}>
        {style.symbol}
      </div>
      <div className="min-w-0 flex-1 text-sm leading-6 text-[var(--dms-color-text-ink)]">
        {message}
      </div>
    </ModalBody>
  )
}

export default function ConfirmModal({
  show,
  title = 'Confirm Action',
  message,
  onConfirm,
  onCancel,
  confirmText = 'OK',
  cancelText = 'Cancel',
  type = 'info',
  loading = false
}) {
  if (!show) return null

  const style = typeStyles[type] || typeStyles.info

  return (
    <Modal isOpen={show} size="sm" onClose={onCancel}>
      <ModalHeader title={title} onClose={onCancel} />
      <DialogMessage message={message} type={type} />
      <ModalFooter className="flex-row justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--dms-color-text-ink)] transition-colors hover:bg-[var(--dms-color-bg-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${style.button}`}
        >
          {loading && (
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {confirmText}
        </button>
      </ModalFooter>
    </Modal>
  )
}

export function AlertModal({
  show,
  title = 'Alert',
  message,
  onClose,
  closeText = 'Close',
  type = 'error'
}) {
  if (!show) return null

  return (
    <Modal isOpen={show} size="sm" onClose={onClose}>
      <ModalHeader title={title} onClose={onClose} />
      <DialogMessage message={message} type={type} />
      <ModalFooter className="flex-row justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-lg bg-[var(--dms-color-brand-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[var(--dms-color-brand-primary)] focus:ring-offset-2"
        >
          {closeText}
        </button>
      </ModalFooter>
    </Modal>
  )
}
