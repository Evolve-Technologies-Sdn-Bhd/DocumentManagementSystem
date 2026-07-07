import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { usePreferences } from '../contexts/PreferencesContext'

export default function GettingStartedModal({ open, onClose, showAdminGuide, onStartTour }) {
  const [activeTab, setActiveTab] = useState('user')
  const { t } = usePreferences()

  if (!open) return null

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t('getting_started')}</h3>
            <p className="text-sm text-gray-600 mt-1">{t('gs_subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex gap-2 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('user')}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === 'user' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('gs_user_tab')}
            </button>
            {showAdminGuide && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-2 text-sm font-medium border-b-2 ${
                  activeTab === 'admin' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('gs_admin_tab')}
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="border border-gray-200 rounded-lg p-5">
            <div className="text-sm text-gray-700">
              {activeTab === 'admin' ? t('tour_admin_intro') : t('tour_user_intro')}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  onClose?.()
                  onStartTour?.(activeTab)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                {t('tour_start')}
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}
