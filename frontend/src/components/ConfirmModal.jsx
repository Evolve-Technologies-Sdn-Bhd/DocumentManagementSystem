import React from 'react'
import * as ReactDOM from 'react-dom'

/**
 * Reusable Confirmation Modal Component
 * 
 * Usage:
 * const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
 * 
 * <ConfirmModal
 *   show={confirmModal.show}
 *   title={confirmModal.title}
 *   message={confirmModal.message}
 *   onConfirm={() => { confirmModal.onConfirm?.(); setConfirmModal({ show: false }) }}
 *   onCancel={() => setConfirmModal({ show: false })}
 *   confirmText="Confirm"
 *   cancelText="Cancel"
 *   type="info" // 'info', 'warning', 'danger', 'success'
 * />
 */
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

  const typeStyles = {
    info: {
      header: 'bg-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    warning: {
      header: 'bg-yellow-500',
      button: 'bg-yellow-500 hover:bg-yellow-600',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    danger: {
      header: 'bg-red-600',
      button: 'bg-red-600 hover:bg-red-700',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    success: {
      header: 'bg-green-600',
      button: 'bg-green-600 hover:bg-green-700',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    }
  }

  const style = typeStyles[type] || typeStyles.info

  const modal = (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-[95] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden animate-fadeIn">
        <div className={`${style.header} px-6 py-4`}>
          <div className="flex items-center gap-3">
            {style.icon}
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          </div>
        </div>
        <div className="px-6 py-4">
          <p className="text-gray-700">{message}</p>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 ${style.button} text-white rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center gap-2`}
          >
            {loading && (
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}

/**
 * Reusable Alert/Error Modal Component
 */
export function AlertModal({
  show,
  title = 'Alert',
  message,
  onClose,
  closeText = 'Close',
  type = 'error' // 'error', 'warning', 'info', 'success'
}) {
  if (!show) return null

  const typeStyles = {
    error: {
      header: 'bg-red-600',
      button: 'bg-red-600 hover:bg-red-700',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    warning: {
      header: 'bg-yellow-500',
      button: 'bg-yellow-500 hover:bg-yellow-600',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    info: {
      header: 'bg-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    success: {
      header: 'bg-green-600',
      button: 'bg-green-600 hover:bg-green-700',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )
    }
  }

  const style = typeStyles[type] || typeStyles.error

  const modal = (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-[95] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden animate-fadeIn">
        <div className={`${style.header} px-6 py-4`}>
          <div className="flex items-center gap-3">
            {style.icon}
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          </div>
        </div>
        <div className="px-6 py-4">
          <p className="text-gray-700">{message}</p>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className={`px-4 py-2 ${style.button} text-white rounded-lg transition-colors font-medium`}
          >
            {closeText}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
