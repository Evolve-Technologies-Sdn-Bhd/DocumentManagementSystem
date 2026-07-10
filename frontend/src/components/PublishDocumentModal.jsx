import React, { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import SelectField from './ui/SelectField'

const REMINDER_LEVELS = [
  { key: 'reminder1', label: 'Reminder 1', daysField: 'reminder1Days' },
  { key: 'reminder2', label: 'Reminder 2', daysField: 'reminder2Days' },
  { key: 'reminder3', label: 'Reminder 3', daysField: 'reminder3Days' },
  { key: 'reminder4', label: 'Reminder 4', daysField: 'reminder4Days' }
]

const toDateInputValue = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const formatUserLabel = (user) => `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || '-'

function Field({ label, children, hint = null }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-ink">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  )
}

export default function PublishDocumentModal({ isOpen, onClose, document, onPublish }) {
  const [folders, setFolders] = useState([])
  const [users, setUsers] = useState([])
  const [selectedFolder, setSelectedFolder] = useState('')
  const [newFileName, setNewFileName] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recipientSearch, setRecipientSearch] = useState({
    reminder1: '',
    reminder2: '',
    reminder3: '',
    reminder4: ''
  })
  const [expirySettings, setExpirySettings] = useState({
    expiringSoonDays: 60,
    reminder1Days: 90,
    reminder2Days: 60,
    reminder3Days: 30,
    reminder4Days: 7
  })
  const [expiryInfo, setExpiryInfo] = useState({
    trackingEnabled: false,
    useGlobalRule: true,
    startDate: '',
    expiryDate: '',
    remarks: '',
    expiringSoonDays: 60,
    reminder1Days: 90,
    reminder2Days: 60,
    reminder3Days: 30,
    reminder4Days: 7,
    reminderRecipients: {
      reminder1: [],
      reminder2: [],
      reminder3: [],
      reminder4: []
    }
  })

  useEffect(() => {
    if (!isOpen) return
    const requiresExpiryTracking = Boolean(document?.documentTypeConfig?.requiresExpiryTracking)
    setSelectedFolder('')
    setNewFileName(document?.fileName || '')
    setNotes('')
    setError('')
    setRecipientSearch({
      reminder1: '',
      reminder2: '',
      reminder3: '',
      reminder4: ''
    })
    setExpiryInfo({
      trackingEnabled: requiresExpiryTracking,
      useGlobalRule: true,
      startDate: toDateInputValue(new Date()),
      expiryDate: '',
      remarks: '',
      expiringSoonDays: expirySettings.expiringSoonDays,
      reminder1Days: expirySettings.reminder1Days,
      reminder2Days: expirySettings.reminder2Days,
      reminder3Days: expirySettings.reminder3Days,
      reminder4Days: expirySettings.reminder4Days,
      reminderRecipients: {
        reminder1: [],
        reminder2: [],
        reminder3: [],
        reminder4: []
      }
    })
    void fetchFolders()
    void fetchExpirySettings()
    void fetchUsers()
  }, [isOpen, document])

  const flattenFolders = (folderList, level = 0) => {
    const result = []
    folderList.forEach((folder) => {
      const prefix = level > 0 ? `${'  '.repeat(level - 1)}└─ ` : ''
      result.push({
        id: folder.id,
        displayName: `${prefix}${folder.name}`
      })
      if (folder.children?.length) {
        result.push(...flattenFolders(folder.children, level + 1))
      }
    })
    return result
  }

  const flatFolders = useMemo(() => flattenFolders(folders), [folders])
  const ownerId = document?.ownerId || document?.owner?.id || null
  const ownerName = document?.ownerName
    || formatUserLabel(document?.owner)
    || '-'
  const activeUsers = useMemo(() => {
    if (!Array.isArray(users)) return []
    return users
      .filter((u) => String(u.status || '').toUpperCase() === 'ACTIVE')
      .sort((left, right) => formatUserLabel(left).localeCompare(formatUserLabel(right)))
  }, [users])

  const fetchFolders = async () => {
    try {
      const response = await api.get('/folders')
      setFolders(response.data?.data?.folders || response.data?.folders || [])
    } catch (fetchError) {
      console.error('Error fetching folders:', fetchError)
      setError('Failed to load folders')
    }
  }

  const fetchExpirySettings = async () => {
    try {
      const response = await api.get('/system/config/expiry-tracking')
      const nextSettings = response.data?.data?.settings || expirySettings
      setExpirySettings(nextSettings)
      setExpiryInfo((prev) => {
        if (!prev.useGlobalRule) return prev
        return {
          ...prev,
          expiringSoonDays: nextSettings.expiringSoonDays,
          reminder1Days: nextSettings.reminder1Days,
          reminder2Days: nextSettings.reminder2Days,
          reminder3Days: nextSettings.reminder3Days,
          reminder4Days: nextSettings.reminder4Days
        }
      })
    } catch (fetchError) {
      console.error('Error fetching expiry settings:', fetchError)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users')
      setUsers(response.data?.data?.users || response.data?.users || [])
    } catch (fetchError) {
      console.error('Error fetching users:', fetchError)
    }
  }

  const toggleRecipient = (levelKey, userId) => {
    if (ownerId && userId === ownerId) return
    setExpiryInfo((prev) => {
      const existing = new Set(prev.reminderRecipients?.[levelKey] || [])
      if (existing.has(userId)) existing.delete(userId)
      else existing.add(userId)
      return {
        ...prev,
        reminderRecipients: {
          ...prev.reminderRecipients,
          [levelKey]: Array.from(existing)
        }
      }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!selectedFolder) {
      setError('Please select a destination folder')
      return
    }

    if (expiryInfo.trackingEnabled && (!expiryInfo.startDate || !expiryInfo.expiryDate)) {
      setError('Start date and expiry date are required when expiry tracking is enabled')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await api.post(`/workflow/publish/${document.id}`, {
        folderId: parseInt(selectedFolder, 10),
        notes,
        newFileName: newFileName.trim() || null,
        expiryInfo: expiryInfo.trackingEnabled
          ? {
              trackingEnabled: true,
              startDate: expiryInfo.startDate,
              expiryDate: expiryInfo.expiryDate,
              remarks: expiryInfo.remarks,
              expiringSoonDays: parseInt(expiryInfo.expiringSoonDays, 10) || 0,
              reminder1Days: parseInt(expiryInfo.reminder1Days, 10) || 0,
              reminder2Days: parseInt(expiryInfo.reminder2Days, 10) || 0,
              reminder3Days: parseInt(expiryInfo.reminder3Days, 10) || 0,
              reminder4Days: parseInt(expiryInfo.reminder4Days, 10) || 0,
              reminderRecipients: expiryInfo.reminderRecipients
            }
          : { trackingEnabled: false }
      })

      onPublish(response.data?.data?.document)
      onClose()
    } catch (submitError) {
      console.error('Error publishing document:', submitError)
      setError(submitError.response?.data?.message || 'Failed to publish document')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal onClose={onClose} closeOnBackdrop size="lg">
      <ModalHeader
        title="Publish Document"
        subtitle="Finalize publication destination and optional expiry tracking setup."
        onClose={onClose}
      />
      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-6">
          {error ? (
            <AppSurface padding="md" variant="panel" className="border border-[var(--dms-color-danger-soft)] bg-[var(--dms-color-danger-soft)]/40 text-sm text-[var(--dms-color-danger-ink)]">
              {error}
            </AppSurface>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="File Code">
              <TextInput value={document?.fileCode || ''} readOnly className="bg-surface-muted text-ink-muted" />
            </Field>
            <Field label="Version">
              <TextInput value={document?.version || ''} readOnly className="bg-surface-muted text-ink-muted" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Document Title">
                <TextInput value={document?.title || ''} readOnly className="bg-surface-muted text-ink-muted" />
              </Field>
            </div>
            <Field label="Document Type">
              <TextInput value={document?.documentType || ''} readOnly className="bg-surface-muted text-ink-muted" />
            </Field>
            <Field label="File Name" hint="You may rename the file before publishing.">
              <TextInput value={newFileName} onChange={(e) => setNewFileName(e.target.value)} placeholder="Enter published file name" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Destination Folder">
                <SelectField value={selectedFolder} onChange={(e) => setSelectedFolder(e.target.value)} required>
                  <option value="">Select folder</option>
                  {flatFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.displayName}</option>
                  ))}
                </SelectField>
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Publication Notes">
                <TextArea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add publication notes if needed" />
              </Field>
            </div>
          </div>

          <AppSurface padding="lg" variant="panel" className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-ink">Expiry Info</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  Expiry tracking is linked directly to this document. You can keep the global reminder schedule or adjust it for this document only.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={expiryInfo.trackingEnabled}
                  onChange={(e) => setExpiryInfo((prev) => ({ ...prev, trackingEnabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                />
                Track Expiry
              </label>
            </div>

            {expiryInfo.trackingEnabled ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Start Date">
                    <TextInput type="date" value={expiryInfo.startDate} onChange={(e) => setExpiryInfo((prev) => ({ ...prev, startDate: e.target.value }))} required />
                  </Field>
                  <Field label="Expiry Date">
                    <TextInput type="date" value={expiryInfo.expiryDate} onChange={(e) => setExpiryInfo((prev) => ({ ...prev, expiryDate: e.target.value }))} required />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Expiry Remarks">
                      <TextArea rows={3} value={expiryInfo.remarks} onChange={(e) => setExpiryInfo((prev) => ({ ...prev, remarks: e.target.value }))} placeholder="Optional expiry remarks" />
                    </Field>
                  </div>
                </div>

                <AppSurface padding="md" variant="panel" className="space-y-4">
                  <p className="text-sm text-ink-muted">
                    Global defaults: expiring soon in {expirySettings.expiringSoonDays} day(s), reminders at {expirySettings.reminder1Days}, {expirySettings.reminder2Days}, {expirySettings.reminder3Days}, and {expirySettings.reminder4Days} day(s) before expiry.
                  </p>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                    <input
                      type="checkbox"
                      checked={expiryInfo.useGlobalRule}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setExpiryInfo((prev) => ({
                          ...prev,
                          useGlobalRule: checked,
                          ...(checked
                            ? {
                                expiringSoonDays: expirySettings.expiringSoonDays,
                                reminder1Days: expirySettings.reminder1Days,
                                reminder2Days: expirySettings.reminder2Days,
                                reminder3Days: expirySettings.reminder3Days,
                                reminder4Days: expirySettings.reminder4Days
                              }
                            : {})
                        }))
                      }}
                      className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                    />
                    Use Global Defaults
                  </label>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <Field label="Expiring Soon Days">
                      <TextInput type="number" min="0" value={expiryInfo.expiringSoonDays} onChange={(e) => setExpiryInfo((prev) => ({ ...prev, expiringSoonDays: e.target.value, useGlobalRule: false }))} disabled={expiryInfo.useGlobalRule} />
                    </Field>
                    <Field label="Reminder 1">
                      <TextInput type="number" min="0" value={expiryInfo.reminder1Days} onChange={(e) => setExpiryInfo((prev) => ({ ...prev, reminder1Days: e.target.value, useGlobalRule: false }))} disabled={expiryInfo.useGlobalRule} />
                    </Field>
                    <Field label="Reminder 2">
                      <TextInput type="number" min="0" value={expiryInfo.reminder2Days} onChange={(e) => setExpiryInfo((prev) => ({ ...prev, reminder2Days: e.target.value, useGlobalRule: false }))} disabled={expiryInfo.useGlobalRule} />
                    </Field>
                    <Field label="Reminder 3">
                      <TextInput type="number" min="0" value={expiryInfo.reminder3Days} onChange={(e) => setExpiryInfo((prev) => ({ ...prev, reminder3Days: e.target.value, useGlobalRule: false }))} disabled={expiryInfo.useGlobalRule} />
                    </Field>
                    <Field label="Reminder 4">
                      <TextInput type="number" min="0" value={expiryInfo.reminder4Days} onChange={(e) => setExpiryInfo((prev) => ({ ...prev, reminder4Days: e.target.value, useGlobalRule: false }))} disabled={expiryInfo.useGlobalRule} />
                    </Field>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-ink">Reminder Recipients</h4>
                      <p className="text-xs text-ink-soft">Owner always receives every reminder. Add extra recipients for each reminder level below.</p>
                    </div>
                    {REMINDER_LEVELS.map((level) => {
                      const selectedIds = new Set(expiryInfo.reminderRecipients?.[level.key] || [])
                      const searchTerm = (recipientSearch[level.key] || '').trim().toLowerCase()
                      const selectedUsers = activeUsers.filter((user) => selectedIds.has(user.id))
                      const filteredUsers = activeUsers.filter((user) => {
                        if (!searchTerm) return true
                        return formatUserLabel(user).toLowerCase().includes(searchTerm)
                      })
                      const selectedSummary = selectedUsers.length > 0
                        ? selectedUsers.slice(0, 2).map((user) => formatUserLabel(user)).join(', ')
                        : ''
                      const selectedOverflow = selectedUsers.length > 2 ? ` +${selectedUsers.length - 2} more` : ''

                      return (
                        <details key={level.key} className="rounded-xl border border-border bg-surface">
                          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:hidden">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink">{level.label}</p>
                              <p className="text-xs text-ink-soft">{expiryInfo[level.daysField] ?? '-'} day(s) before expiry</p>
                              <p className="mt-1 truncate text-xs text-ink-soft">
                                Owner + {selectedIds.size} extra recipient(s)
                                {selectedSummary ? ` | ${selectedSummary}${selectedOverflow}` : ' | No extra recipients selected'}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs font-medium text-ink-soft">Click to expand</p>
                              <p className="text-xs text-ink-soft">Owner included automatically</p>
                            </div>
                          </summary>
                          <div className="space-y-3 border-t border-border px-4 py-3">
                            <TextInput
                              value={recipientSearch[level.key] || ''}
                              onChange={(e) => setRecipientSearch((prev) => ({ ...prev, [level.key]: e.target.value }))}
                              placeholder="Search user name"
                            />
                            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                              <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                                <input
                                  type="checkbox"
                                  checked
                                  disabled
                                  className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                                />
                                <span>{ownerName} (Owner)</span>
                              </label>
                              {filteredUsers.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-ink-soft">
                                  No matching user found.
                                </div>
                              ) : (
                                filteredUsers.map((user) => {
                                  const isOwner = ownerId && user.id === ownerId
                                  if (isOwner) return null
                                  return (
                                    <label key={`${level.key}-${user.id}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink">
                                      <input
                                        type="checkbox"
                                        checked={selectedIds.has(user.id)}
                                        onChange={() => toggleRecipient(level.key, user.id)}
                                        className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                                      />
                                      <span>{formatUserLabel(user)}</span>
                                    </label>
                                  )
                                })
                              )}
                            </div>
                          </div>
                        </details>
                      )
                    })}
                  </div>
                </AppSurface>
              </>
            ) : (
              <AppSurface padding="md" variant="panel" className="text-sm text-ink-muted">
                Expiry tracking is disabled for this publication. The document will still publish normally and other flows remain unaffected.
              </AppSurface>
            )}
          </AppSurface>

          <AppSurface padding="md" variant="panel" className="text-sm text-ink-muted">
            Publishing will move the document into the selected folder, mark it as published, update the document register, and create or update the expiry profile when tracking is enabled.
          </AppSurface>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Publishing...' : 'Publish Document'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
