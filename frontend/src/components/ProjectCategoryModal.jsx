import React, { useEffect, useState } from 'react'
import { usePreferences } from '../contexts/PreferencesContext'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'

const suggestProjectCategoryCode = (name) => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)

  if (!words.length) return ''

  if (words.length > 1) {
    return words.map((word) => word[0]).join('').toUpperCase().slice(0, 12)
  }

  return words[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3)
}

export default function ProjectCategoryModal({
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
    code: '',
    description: ''
  })
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false)

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        code: initialData.code || '',
        description: initialData.description || ''
      })
      setCodeManuallyEdited(true)
    } else {
      setFormData({
        name: '',
        code: '',
        description: ''
      })
      setCodeManuallyEdited(false)
    }
  }, [initialData, isOpen])

  const handleNameChange = (e) => {
    const name = e.target.value

    setFormData((prev) => ({
      ...prev,
      name,
      ...(!codeManuallyEdited
        ? { code: suggestProjectCategoryCode(name) }
        : {})
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    await onSubmit({
      ...formData,
      name: formData.name.trim(),
      code: formData.code.trim().toUpperCase()
    })
  }

  if (!isOpen) return null

  return (
    <Modal onClose={onClose} closeOnBackdrop={!submitting} size="sm">
      <ModalHeader
        title={initialData ? t('mdm_edit_project_cat') : t('mdm_add_project_cat')}
        onClose={submitting ? undefined : onClose}
      />

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
                onChange={handleNameChange}
                placeholder="e.g., Internal Project"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('mdm_code')} <span className="text-[var(--dms-color-danger-ink)]">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.code}
                onChange={(e) => {
                  setCodeManuallyEdited(true)
                  setFormData((prev) => ({
                    ...prev,
                    code: e.target.value.toUpperCase()
                  }))
                }}
                placeholder="e.g., INT"
              />
              <p className="mt-1.5 text-xs text-ink-soft">
                {t('mdm_code_project_help')}
              </p>
              {!codeManuallyEdited && formData.code ? (
                <p className="mt-1 text-xs text-gray-500">
                  Suggested automatically. You can edit this code.
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('description')}
              </label>
              <TextArea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({
                  ...prev,
                  description: e.target.value
                }))}
                rows={3}
                placeholder={t('mdm_optional_desc')}
              />
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
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
