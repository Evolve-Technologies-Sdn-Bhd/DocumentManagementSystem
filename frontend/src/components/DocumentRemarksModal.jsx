import React from 'react'
import { createPortal } from 'react-dom'
import { usePreferences } from '../contexts/PreferencesContext'

export default function DocumentRemarksModal({ isOpen, document, remarks, loading, onClose }) {
  const { t, formatDateTime } = usePreferences()

  if (!isOpen) return null

  const docTitle = document?.title || document?.fileCode || ''
  const items = Array.isArray(remarks) ? remarks : []

  const modal = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t('return_remarks_title')}</h2>
            {docTitle ? <p className="text-sm text-gray-600 mt-1">{docTitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label={t('close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">
          {loading ? (
            <div className="text-center py-10 text-gray-500">
              <div className="inline-flex items-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span>{t('loading')}</span>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-gray-500">{t('no_remarks_found')}</div>
          ) : (
            <div className="space-y-4">
              {items.map((r) => (
                <div key={r.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-sm font-medium text-gray-900">
                      {t('returned_by')}: {r?.user?.name || '-'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('returned_at')}: {formatDateTime(r?.createdAt)}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {t('stage')}: {String(r?.stage || '-')}
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{r?.comments || '-'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )

  return typeof window !== 'undefined' && window.document?.body ? createPortal(modal, window.document.body) : modal
}
