import React, { useState } from 'react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from './ui/Modal'
import { usePreferences } from '../contexts/PreferencesContext'

export default function GettingStartedModal({ open, onClose, showAdminGuide, onStartTour }) {
  const [activeTab, setActiveTab] = useState('user')
  const { t } = usePreferences()

  if (!open) return null

  const modal = (
    <Modal isOpen size="xl" onClose={onClose}>
        <ModalHeader
          title={t('getting_started')}
          subtitle={t('gs_subtitle')}
          onClose={onClose}
        />

        <ModalBody className="space-y-6">
          <div>
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

          <div>
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

        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t('close')}
          </button>
        </ModalFooter>
    </Modal>
  )
}
