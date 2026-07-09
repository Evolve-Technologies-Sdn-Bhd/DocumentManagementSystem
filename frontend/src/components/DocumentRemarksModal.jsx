import React from 'react'
import * as ReactDOM from 'react-dom'
import { usePreferences } from '../contexts/PreferencesContext'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import InlineSpinner from './ui/InlineSpinner'

export default function DocumentRemarksModal({ isOpen, document, remarks, loading, onClose, onViewReviewedFile, onDownloadReviewedFile }) {
  const { t, formatDateTime } = usePreferences()

  if (!isOpen) return null

  const docTitle = document?.title || document?.fileCode || ''
  const items = Array.isArray(remarks) ? remarks : []

  const modal = (
    <Modal onClose={onClose} closeOnBackdrop size="lg">
      <ModalHeader
        title={t('return_remarks_title')}
        subtitle={docTitle || undefined}
        onClose={onClose}
      />

      <ModalBody>
          {loading ? (
            <div className="text-center py-10">
              <div className="inline-flex items-center gap-2 text-ink-muted">
                <InlineSpinner className="h-5 w-5 border-2" />
                <span>{t('loading')}</span>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-ink-muted">{t('no_remarks_found')}</div>
          ) : (
            <div className="space-y-4">
              {document?.latestReturnFileVersionId ? (
                <div className="border border-blue-200 rounded-2xl p-4 bg-blue-50">
                  <div className="text-sm font-medium text-blue-900">{t('reviewed_file_available')}</div>
                  <div className="text-xs text-blue-800 mt-1">{document?.latestReturnFileName || '-'}</div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {typeof onViewReviewedFile === 'function' ? (
                      <Button
                        onClick={() => onViewReviewedFile(document)}
                        size="sm"
                        variant="secondary"
                        className="border-blue-300 text-blue-700 hover:text-blue-800"
                      >
                        {t('view_reviewed_file')}
                      </Button>
                    ) : null}
                    {typeof onDownloadReviewedFile === 'function' ? (
                      <Button
                        onClick={() => onDownloadReviewedFile(document)}
                        size="sm"
                        variant="secondary"
                        className="border-blue-300 text-blue-700 hover:text-blue-800"
                      >
                        {t('download_reviewed_file')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {items.map((r) => (
                <AppSurface key={r.id} variant="muted" padding="md" className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-sm font-semibold text-ink">
                      {t('returned_by')}: {r?.user?.name || '-'}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {t('returned_at')}: {formatDateTime(r?.createdAt)}
                    </div>
                  </div>
                  <div className="text-xs text-ink-muted">
                    {t('stage')}: {String(r?.stage || '-')}
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-ink-secondary">{r?.comments || '-'}</div>
                </AppSurface>
              ))}
            </div>
          )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          {t('close')}
        </Button>
      </ModalFooter>
    </Modal>
  )

  if (typeof window === 'undefined' || !ReactDOM?.createPortal || !window.document?.body) return modal
  return ReactDOM.createPortal(modal, window.document.body)
}
