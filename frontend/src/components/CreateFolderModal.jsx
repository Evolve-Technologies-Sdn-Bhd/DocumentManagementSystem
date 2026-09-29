import React, { useEffect, useState } from 'react'
import api from '../api/axios'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import AsyncActionStatus from './ui/AsyncActionStatus'

export default function CreateFolderModal({
  isOpen,
  onClose,
  parentFolder = null,
  onCreated,
  title = null,
  subtitle = null
}) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setName('')
    setLoading(false)
    setError('')
  }, [isOpen, parentFolder])

  const handleSubmit = async (e) => {
    e.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(parentFolder ? 'Please enter a subfolder name' : 'Please enter a folder name')
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = { name: trimmedName }
      if (parentFolder?.id) {
        payload.parentId = Number(parentFolder.id)
      }
      const resp = await api.post('/folders', payload)
      const createdFolder = resp?.data?.data?.folder
      if (onCreated) onCreated(createdFolder)
      onClose?.()
    } catch (submitError) {
      console.error('Error creating folder:', submitError)
      setError(submitError.response?.data?.message || 'Failed to create folder')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const effectiveTitle = title || (parentFolder?.id ? 'Create Subfolder' : 'Create New Folder')
  const effectiveSubtitle = subtitle || (
    parentFolder?.id
      ? `New subfolder will be created under: ${parentFolder.fullPathLabel || parentFolder.name || '(selected folder)'}`
      : 'Create a new root-level folder. You can assign access permissions later in Workspace.'
  )

  return (
    <Modal
      onClose={loading ? undefined : onClose}
      closeOnBackdrop={!loading}
      size="md"
    >
      <ModalHeader
        title={effectiveTitle}
        subtitle={effectiveSubtitle}
        onClose={loading ? undefined : onClose}
      />
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <ModalBody className="space-y-5">
          {error ? (
            <AsyncActionStatus
              title="Unable to create folder"
              message={error}
              tone="error"
            />
          ) : null}

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              {parentFolder?.id ? 'Subfolder Name' : 'Folder Name'}
            </label>
            <TextInput
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError('')
              }}
              placeholder={parentFolder?.id ? 'Enter subfolder name' : 'Enter folder name'}
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="rounded-lg border border-border bg-surface-muted p-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">
              {parentFolder?.id ? 'Parent Location' : 'Creation Location'}
            </div>
            <div className="mt-1 text-sm font-medium text-ink">
              {parentFolder?.id ? (parentFolder.fullPathLabel || parentFolder.name) : 'Root level'}
            </div>
            {!parentFolder?.id && (
              <div className="mt-1 text-xs text-ink-secondary">
                Tip: To create a subfolder, first select a parent folder in the publish form,
                then click the subfolder button.
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={loading}
            loadingText={parentFolder?.id ? 'Creating subfolder...' : 'Creating folder...'}
            disabled={loading}
          >
            {parentFolder?.id ? 'Create Subfolder' : 'Create Folder'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
