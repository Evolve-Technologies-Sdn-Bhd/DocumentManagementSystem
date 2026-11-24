import React, { useEffect, useState } from 'react'
import { usePreferences } from '../contexts/PreferencesContext'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import AppSurface from './ui/AppSurface'

// Add/Edit Modal for Document Type
function DocumentTypeModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  error = '',
  submitting = false
}) {
  const { t } = usePreferences()
  const [formData, setFormData] = useState({
    name: '',
    prefix: '',
    description: '',
    requiresExpiryTracking: false,
    allowRenewal: true
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        prefix: initialData.prefix || '',
        description: initialData.description || '',
        requiresExpiryTracking: Boolean(initialData.requiresExpiryTracking),
        allowRenewal: initialData.allowRenewal !== undefined ? Boolean(initialData.allowRenewal) : true
      })
    } else {
      setFormData({
        name: '',
        prefix: '',
        description: '',
        requiresExpiryTracking: false,
        allowRenewal: true
      })
    }
  }, [initialData, isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()
    await onSubmit(formData)
  }

  if (!isOpen) return null

  return (
    <Modal onClose={submitting ? undefined : onClose} closeOnBackdrop={!submitting} size="sm">
      <ModalHeader title={initialData ? t('mdm_edit_doc_type') : t('mdm_add_doc_type')} onClose={submitting ? undefined : onClose} />
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <ModalBody>
          <div className="space-y-5">
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
              >
                {error}
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('mdm_name')} <span className="text-[var(--dms-color-danger-ink)]">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Minutes of Meeting"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('mdm_prefix')} <span className="text-[var(--dms-color-danger-ink)]">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.prefix}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                placeholder="e.g., MoM"
              />
              <p className="mt-1.5 text-xs text-ink-soft">{t('mdm_prefix_help')}</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">{t('description')}</label>
              <TextArea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={t('mdm_optional_desc')}
              />
            </div>

            <AppSurface variant="panel" padding="md" className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-ink">Expiry Tracking</h4>
                <p className="mt-1 text-xs text-ink-soft">
                  Control whether documents of this type are enrolled into the expiry tracking module by default.
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
                <input
                  type="checkbox"
                  checked={formData.requiresExpiryTracking}
                  onChange={(e) => setFormData({ ...formData, requiresExpiryTracking: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                />
                <div>
                  <span className="block text-sm font-medium text-ink">Require Expiry Tracking</span>
                  <span className="mt-1 block text-xs text-ink-soft">
                    Published documents of this type will prompt for expiry information in the publish flow.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
                <input
                  type="checkbox"
                  checked={formData.allowRenewal}
                  onChange={(e) => setFormData({ ...formData, allowRenewal: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                />
                <div>
                  <span className="block text-sm font-medium text-ink">Allow Renewal</span>
                  <span className="mt-1 block text-xs text-ink-soft">
                    Lets tracked documents of this type use the renewal flow to create a new document version.
                  </span>
                </div>
              </label>
            </AppSurface>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
          >
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : initialData ? t('mdm_update') : t('mdm_create')}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default DocumentTypeModal
