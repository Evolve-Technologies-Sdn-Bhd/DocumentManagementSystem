import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import api from '../api/axios'
import { hasPermission } from '../utils/permissions'
import Pagination from './Pagination'
import PageHeader from './ui/PageHeader'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import SelectField from './ui/SelectField'
import InlineSpinner from './ui/InlineSpinner'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import { Table, TableContainer, Td, Th, Tr } from './ui/Table'
import ActionMenu from './ActionMenu'
import ColumnSettingsButton from './ui/ColumnSettingsButton'
import DataTableToolbar from './ui/DataTableToolbar'
import useTableFeatures from '../hooks/useTableFeatures'

const toDateInputValue = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const formatDate = (value) => {
  const iso = toDateInputValue(value)
  if (!iso) return '-'
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

const REMINDER_LEVELS = [
  { key: 'reminder1', label: 'Reminder 1', daysField: 'reminder1Days', recipientsField: 'reminder1Recipients' },
  { key: 'reminder2', label: 'Reminder 2', daysField: 'reminder2Days', recipientsField: 'reminder2Recipients' },
  { key: 'reminder3', label: 'Reminder 3', daysField: 'reminder3Days', recipientsField: 'reminder3Recipients' },
  { key: 'reminder4', label: 'Reminder 4', daysField: 'reminder4Days', recipientsField: 'reminder4Recipients' }
]

const formatUserLabel = (user) => `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || '-'

function ExpiryStatusBadge({ status }) {
  const normalized = String(status || '').toUpperCase()
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold'
  if (normalized === 'ACTIVE') return <span className={`${base} bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]`}>Active</span>
  if (normalized === 'EXPIRING_SOON') return <span className={`${base} bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]`}>Expiring Soon</span>
  if (normalized === 'EXPIRING_TODAY') return <span className={`${base} bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]`}>Expiring Today</span>
  return <span className={`${base} bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]`}>Expired</span>
}

function RenewalStatusBadge({ status }) {
  const normalized = String(status || '').toUpperCase()
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold'
  if (normalized === 'IN_PROGRESS') return <span className={`${base} bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]`}>Renewal In Progress</span>
  if (normalized === 'COMPLETED') return <span className={`${base} bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]`}>Completed</span>
  if (normalized === 'REJECTED') return <span className={`${base} bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]`}>Rejected</span>
  return <span className={`${base} bg-surface-muted text-ink-secondary`}>Not Started</span>
}

function StatCard({ label, value, tone = 'default' }) {
  const toneClass = 'text-ink'

  return (
    <AppSurface padding="lg" variant="panel" className="space-y-2">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className={`text-3xl font-semibold ${toneClass}`}>{value}</p>
    </AppSurface>
  )
}

function Field({ label, children, hint = null }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-ink">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  )
}

function ExpiryEditModal({ open, profile, globalSettings, users, onClose, onSubmit, saving }) {
  const [useGlobalRule, setUseGlobalRule] = useState(false)
  const [recipientSearch, setRecipientSearch] = useState({
    reminder1: '',
    reminder2: '',
    reminder3: '',
    reminder4: ''
  })
  const [form, setForm] = useState({
    startDate: '',
    expiryDate: '',
    remarks: '',
    renewalUrl: '',
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
  const [defaultChecklist, setDefaultChecklist] = useState([])
  const [newDefaultChecklistName, setNewDefaultChecklistName] = useState('')

  useEffect(() => {
    if (!profile || !open) return
    setUseGlobalRule(false)
    setRecipientSearch({
      reminder1: '',
      reminder2: '',
      reminder3: '',
      reminder4: ''
    })
    const profileChecklist = Array.isArray(profile.defaultChecklistItems)
      ? profile.defaultChecklistItems.map((it, idx) => ({
          id: 'profile-default-' + idx + '-' + Date.now(),
          name: typeof it === 'string' ? it : (it?.name || ('Document ' + (idx + 1)))
        }))
      : []
    setDefaultChecklist(profileChecklist)
    setForm({
      startDate: toDateInputValue(profile.startDate),
      expiryDate: toDateInputValue(profile.expiryDate),
      remarks: profile.remarks || '',
      renewalUrl: profile.renewalUrl || '',
      expiringSoonDays: profile.expiringSoonDays ?? 60,
      reminder1Days: profile.reminderRule?.reminder1Days ?? 90,
      reminder2Days: profile.reminderRule?.reminder2Days ?? 60,
      reminder3Days: profile.reminderRule?.reminder3Days ?? 30,
      reminder4Days: profile.reminderRule?.reminder4Days ?? 7,
      reminderRecipients: {
        reminder1: Array.isArray(profile.reminderRule?.reminder1Recipients) ? profile.reminderRule.reminder1Recipients.map((u) => u.id) : [],
        reminder2: Array.isArray(profile.reminderRule?.reminder2Recipients) ? profile.reminderRule.reminder2Recipients.map((u) => u.id) : [],
        reminder3: Array.isArray(profile.reminderRule?.reminder3Recipients) ? profile.reminderRule.reminder3Recipients.map((u) => u.id) : [],
        reminder4: Array.isArray(profile.reminderRule?.reminder4Recipients) ? profile.reminderRule.reminder4Recipients.map((u) => u.id) : []
      }
    })
    setNewDefaultChecklistName('')
  }, [profile, open])

  const ownerId = profile?.document?.ownerId || null
  const activeUsers = useMemo(() => {
    if (!Array.isArray(users)) return []
    return users
      .filter((u) => String(u.status || '').toUpperCase() === 'ACTIVE')
      .sort((left, right) => formatUserLabel(left).localeCompare(formatUserLabel(right)))
  }, [users])

  if (!open || !profile) return null

  const toggleRecipient = (levelKey, userId) => {
    if (ownerId && userId === ownerId) return
    setForm((prev) => {
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

  const addDefaultChecklistItem = () => {
    const name = newDefaultChecklistName.trim()
    if (!name) return
    setDefaultChecklist((prev) => [...prev, { id: 'edit-checklist-' + Date.now(), name }])
    setNewDefaultChecklistName('')
  }

  const removeDefaultChecklistItem = (id) => {
    setDefaultChecklist((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <Modal onClose={onClose} closeOnBackdrop size="xl">
      <ModalHeader
        title="Update Expiry Profile"
        subtitle={profile.document ? `${profile.document.fileCode} - ${profile.document.title}` : ''}
        onClose={onClose}
      />
      <form onSubmit={(e) => {
        e.preventDefault()
        const checklistPayload = defaultChecklist.map((item) => item.name)
        onSubmit({ ...form, useGlobalRule, defaultChecklistItems: checklistPayload })
      }}>
        <ModalBody className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-[#003366]"></div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Document Information</h3>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Field label="Document Name">
                  <TextInput value={profile.document?.title || ''} readOnly className="bg-white text-gray-600" />
                </Field>
                <Field label="Document Type">
                  <TextInput value={profile.document?.documentType || ''} readOnly className="bg-white text-gray-600" />
                </Field>
                <Field label="Owner">
                  <TextInput value={profile.document?.ownerName || '-'} readOnly className="bg-white text-gray-600" />
                </Field>
                <Field label="Department">
                  <TextInput value={profile.department || '-'} readOnly className="bg-white text-gray-600" />
                </Field>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-[#003366]"></div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Expiry Dates &amp; Portal</h3>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Start Date" required>
                  <TextInput type="date" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} required />
                </Field>
                <Field label="Expiry Date" required>
                  <TextInput type="date" value={form.expiryDate} onChange={(e) => setForm((prev) => ({ ...prev, expiryDate: e.target.value }))} required />
                </Field>
              </div>
              <Field label="Renewal Portal URL" hint="Default URL used for renewing this document/system. Populates the renewal modal automatically.">
                <TextInput
                  type="url"
                  placeholder="https://example.com/renew"
                  value={form.renewalUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, renewalUrl: e.target.value }))}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-[#003366]"></div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Default Renewal Checklist</h3>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-xs text-gray-500 -mt-1 mb-1">Default documents required every time this document is renewed.</p>
              {defaultChecklist.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                  No default documents configured. Add required documents below.
                </div>
              ) : (
                <div className="space-y-2">
                  {defaultChecklist.map((item) => (
                    <div
                      key={item.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#003366]/10 text-[#003366]">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDefaultChecklistItem(item.id)}
                        className="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label="Remove checklist item"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-stretch gap-2 border-t border-gray-200 pt-3">
                <TextInput
                  value={newDefaultChecklistName}
                  onChange={(e) => setNewDefaultChecklistName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addDefaultChecklistItem()
                    }
                  }}
                  placeholder="Add required document…"
                  className="flex-1 min-w-0"
                />
                <Button type="button" onClick={addDefaultChecklistItem} disabled={!newDefaultChecklistName.trim()} className="shrink-0 px-4">
                  Add
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-[#003366]"></div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Reminder Rules</h3>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
              <label className="inline-flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors w-full">
                <input
                  type="checkbox"
                  checked={useGlobalRule}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setUseGlobalRule(checked)
                    if (checked && globalSettings) {
                      setForm((prev) => ({
                        ...prev,
                        expiringSoonDays: globalSettings.expiringSoonDays,
                        reminder1Days: globalSettings.reminder1Days,
                        reminder2Days: globalSettings.reminder2Days,
                        reminder3Days: globalSettings.reminder3Days,
                        reminder4Days: globalSettings.reminder4Days
                      }))
                    }
                  }}
                  className="h-4 w-4 mt-0.5 rounded border-gray-300 text-[#003366] focus-visible:ring-2 focus-visible:ring-[#003366]/30"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Use Global Defaults</p>
                  <p className="text-xs text-gray-500">Apply system-wide reminder thresholds to this expiry profile.</p>
                </div>
              </label>
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                <Field label="Expiring Soon Days" hint="Status switches on this threshold.">
                  <TextInput type="number" min="0" value={form.expiringSoonDays} onChange={(e) => setForm((prev) => ({ ...prev, expiringSoonDays: e.target.value }))} required disabled={useGlobalRule} />
                </Field>
                <Field label="Reminder 1 (Days)">
                  <TextInput type="number" min="0" value={form.reminder1Days} onChange={(e) => setForm((prev) => ({ ...prev, reminder1Days: e.target.value }))} required disabled={useGlobalRule} />
                </Field>
                <Field label="Reminder 2 (Days)">
                  <TextInput type="number" min="0" value={form.reminder2Days} onChange={(e) => setForm((prev) => ({ ...prev, reminder2Days: e.target.value }))} required disabled={useGlobalRule} />
                </Field>
                <Field label="Reminder 3 (Days)">
                  <TextInput type="number" min="0" value={form.reminder3Days} onChange={(e) => setForm((prev) => ({ ...prev, reminder3Days: e.target.value }))} required disabled={useGlobalRule} />
                </Field>
                <Field label="Reminder 4 (Days)">
                  <TextInput type="number" min="0" value={form.reminder4Days} onChange={(e) => setForm((prev) => ({ ...prev, reminder4Days: e.target.value }))} required disabled={useGlobalRule} />
                </Field>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-[#003366]"></div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Reminder Recipients</h3>
              <p className="text-xs text-gray-500">Owner always receives every reminder.</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              {REMINDER_LEVELS.map((level) => {
                const selectedIds = new Set(form.reminderRecipients?.[level.key] || [])
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
                  <details key={level.key} className="rounded-xl border border-gray-200 bg-gray-50 group">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:hidden">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{level.label}</p>
                        <p className="text-xs text-gray-500">{form[level.daysField] ?? '-'} day(s) before expiry</p>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          Owner + {selectedIds.size} extra recipient(s)
                          {selectedSummary ? ` | ${selectedSummary}${selectedOverflow}` : ' | No extra recipients selected'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <svg className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        <p className="text-[11px] text-gray-400 mt-1">Owner auto-included</p>
                      </div>
                    </summary>
                    <div className="space-y-3 border-t border-gray-200 px-4 py-3 bg-white rounded-b-xl">
                      <TextInput
                        value={recipientSearch[level.key] || ''}
                        onChange={(e) => setRecipientSearch((prev) => ({ ...prev, [level.key]: e.target.value }))}
                        placeholder="Search user name"
                      />
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                          <input
                            type="checkbox"
                            checked
                            disabled
                            className="h-4 w-4 rounded border-gray-300 text-[#003366] focus-visible:ring-2 focus-visible:ring-[#003366]/30"
                          />
                          <span>{profile.document?.ownerName || 'Owner'} (Owner)</span>
                        </label>
                        {filteredUsers.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500">
                            No matching user found.
                          </div>
                        ) : (
                          filteredUsers.map((user) => {
                            const isOwner = ownerId && user.id === ownerId
                            if (isOwner) return null
                            return (
                              <label key={`${level.key}-${user.id}`} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(user.id)}
                                  onChange={() => toggleRecipient(level.key, user.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-[#003366] focus-visible:ring-2 focus-visible:ring-[#003366]/30"
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
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-[#003366]"></div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Remarks</h3>
            </div>
            <TextArea rows={4} placeholder="Add any notes about this expiry profile…" value={form.remarks} onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))} />
          </section>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

function RenewalModal({ open, profile, onClose, onSubmit, saving }) {
  const [form, setForm] = useState({
    startDate: '',
    newExpiryDate: '',
    remarks: '',
    file: null,
    renewalUrl: ''
  })
  const [checklistItems, setChecklistItems] = useState([])

  useEffect(() => {
    if (!profile || !open) return
    const typeDefault = Array.isArray(profile.documentTypeDefaultChecklist)
      ? profile.documentTypeDefaultChecklist.map((name, idx) => ({
          id: 'default-' + idx,
          name: typeof name === 'string' ? name : (name?.name || ('Document ' + (idx + 1))),
          checked: false
        }))
      : []
    const profileDefault = Array.isArray(profile.defaultChecklistItems)
      ? profile.defaultChecklistItems.map((it, idx) => ({
          id: 'profile-' + idx,
          name: typeof it === 'string' ? it : (it?.name || ('Document ' + (idx + 1))),
          checked: false
        }))
      : []
    const merged = [...typeDefault, ...profileDefault]
    const seen = new Set()
    const deduped = merged.filter((item) => {
      const key = item.name.toLowerCase().trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    setChecklistItems(deduped)
    setForm({
      startDate: toDateInputValue(new Date()),
      newExpiryDate: '',
      remarks: '',
      file: null,
      renewalUrl: profile.renewalUrl || ''
    })
  }, [profile, open])

  const toggleChecklistItem = (id) => {
    setChecklistItems((prev) => prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)))
  }

  const openRenewalUrl = () => {
    const url = form.renewalUrl?.trim()
    if (!url) return
    const normalized = /^https?:\/\//i.test(url) ? url : 'https://' + url
    window.open(normalized, '_blank', 'noopener,noreferrer')
  }

  const completedCount = checklistItems.filter((it) => it.checked).length
  const totalCount = checklistItems.length

  if (!open || !profile) return null

  return (
    <Modal onClose={onClose} closeOnBackdrop size="lg">
      <ModalHeader
        title="Complete Renewal"
        subtitle={profile.document ? `${profile.document.fileCode} - ${profile.document.title}` : ''}
        onClose={onClose}
      />
      <form onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ ...form, checklistItems })
      }}>
        <ModalBody>
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Current Version">
                <TextInput value={profile.currentVersion || profile.document?.version || '-'} readOnly className="bg-surface-muted text-ink-muted" />
              </Field>
              <Field label="Current Expiry Date">
                <TextInput value={formatDate(profile.expiryDate)} readOnly className="bg-surface-muted text-ink-muted" />
              </Field>
              <Field label="Renewal Start Date">
                <TextInput type="date" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} required />
              </Field>
              <Field label="New Expiry Date">
                <TextInput type="date" value={form.newExpiryDate} onChange={(e) => setForm((prev) => ({ ...prev, newExpiryDate: e.target.value }))} required />
              </Field>
              <div className="md:col-span-2">
                <Field label="Renewal Portal URL" hint="Link to external system or portal used to perform this renewal (configured in Expiry Profile settings).">
                  <div className="flex items-stretch gap-2">
                    <div className="flex-1 min-w-0">
                      <TextInput
                        value={form.renewalUrl || '(not configured)'}
                        readOnly
                        className={form.renewalUrl ? 'bg-surface-muted text-ink' : 'bg-surface-muted text-ink-muted italic'}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={openRenewalUrl}
                      disabled={!form.renewalUrl?.trim()}
                      className="shrink-0"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
                      <span className="ml-1.5">Open Link</span>
                    </Button>
                  </div>
                </Field>
              </div>
            </div>
            <Field
              label={
                <div className="flex items-center justify-between gap-3">
                  <span>Required Documents Checklist</span>
                  {totalCount > 0 ? (
                    <span className="text-xs font-normal text-ink-soft">
                      {completedCount}/{totalCount} completed
                    </span>
                  ) : null}
                </div>
              }
              hint="List of documents to prepare before completing the renewal (configured in Expiry Profile settings)."
            >
              <AppSurface padding="md" variant="panel" className="space-y-3">
                {checklistItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-ink-soft">
                    No required documents configured for this expiry profile.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {checklistItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors ${item.checked ? 'bg-[var(--dms-color-success-soft)]/40 border-[var(--dms-color-success-soft)]' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => toggleChecklistItem(item.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm ${item.checked ? 'text-ink-muted line-through' : 'text-ink'}`}>
                            {item.name}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AppSurface>
            </Field>
            <Field label="Upload New File" hint="Renewal creates a new document version on the same document.">
              <TextInput
                type="file"
                onChange={(e) => setForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))}
                required
              />
            </Field>
            <Field label="Remarks">
              <TextArea rows={4} value={form.remarks} onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))} />
            </Field>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Processing...' : 'Complete Renewal'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

function DetailModal({ open, profile, onClose }) {
  const [rhDragColIndex, setRhDragColIndex] = useState(null)
  const [rhDragOverColIndex, setRhDragOverColIndex] = useState(null)

  const renewalHistoryData = useMemo(() => profile?.renewalHistory || [], [profile?.renewalHistory])

  const renewalColumns = useMemo(() => [
    { id: 'fromVersion', key: 'fromVersion', accessor: 'fromVersion', label: 'From Version', sortable: true, required: true, render: (v) => v || '-' },
    { id: 'toVersion', key: 'toVersion', accessor: 'toVersion', label: 'To Version', sortable: true, required: true, render: (v) => v || '-' },
    { id: 'previousExpiryDate', key: 'previousExpiryDate', accessor: 'previousExpiryDate', label: 'Previous Expiry', sortable: true, sortType: 'date', render: (v) => formatDate(v) },
    { id: 'newExpiryDate', key: 'newExpiryDate', accessor: 'newExpiryDate', label: 'New Expiry', sortable: true, sortType: 'date', render: (v) => formatDate(v) },
    {
      id: 'renewalUrl',
      key: 'renewalUrl',
      accessor: 'renewalUrl',
      label: 'Portal URL',
      sortable: false,
      render: (v) => {
        if (!v) return <span className="text-ink-soft">—</span>
        const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`
        return (
          <a
            href={normalized}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 truncate text-xs font-medium text-[var(--color-brand, #003366)] hover:underline max-w-[220px]"
            title={v}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
            <span className="truncate">Open</span>
          </a>
        )
      }
    },
    {
      id: 'checklistItems',
      key: 'checklistItems',
      accessor: 'checklistItems',
      label: 'Checklist',
      sortable: false,
      render: (v) => {
        if (!Array.isArray(v) || v.length === 0) return <span className="text-ink-soft">—</span>
        const total = v.length
        const done = v.filter((it) => it?.checked).length
        const pct = total > 0 ? Math.round((done / total) * 100) : 0
        return (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`font-semibold ${done === total ? 'text-[var(--dms-color-success)]' : 'text-ink'}`}>{done}/{total}</span>
              <span className="text-ink-soft">done</span>
            </div>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-muted">
              <div
                className={`h-full rounded-full transition-all ${done === total ? 'bg-[var(--dms-color-success)]' : 'bg-[var(--color-brand, #003366)]'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      }
    },
    { id: 'renewedAt', key: 'renewedAt', accessor: 'renewedAt', label: 'Renewed At', sortable: true, sortType: 'date', render: (v) => formatDate(v) },
    { id: 'remarks', key: 'remarks', accessor: 'remarks', label: 'Remarks', sortable: false, render: (v) => v || '-' }
  ], [])

  const rhTableFeatures = useTableFeatures({
    tableId: 'expiry-profile-renewal-history',
    columns: renewalColumns,
    data: renewalHistoryData,
    defaultSortKey: 'renewedAt',
    defaultSortDirection: 'desc'
  })

  const {
    sortedData: rhSortedData,
    visibleColumns: rhVisibleColumns,
    orderedColumns: rhOrderedColumns,
    getSortDirectionFor: rhGetSortDirectionFor,
    toggleSort: rhToggleSort,
    moveColumn: rhMoveColumn,
    hiddenColumns: rhHiddenColumns,
    toggleColumnVisibility: rhToggleColumnVisibility,
    resetTableSettings: rhResetTableSettings
  } = rhTableFeatures

  const rhColDragStart = (idx, e) => {
    const col = rhVisibleColumns[idx]
    if (!col || col.stickyRight) { e.preventDefault(); return }
    setRhDragColIndex(idx)
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)) } catch {}
  }
  const rhColDragOver = (idx, e) => {
    e.preventDefault()
    const col = rhVisibleColumns[idx]
    if (!col || col.stickyRight) return
    setRhDragOverColIndex(idx)
  }
  const rhColDragLeave = () => setRhDragOverColIndex(null)
  const rhColDrop = (toIdx, e) => {
    e.preventDefault()
    const fromIdx = rhDragColIndex
    setRhDragColIndex(null)
    setRhDragOverColIndex(null)
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return
    const fromId = rhVisibleColumns[fromIdx]?.id
    const toId = rhVisibleColumns[toIdx]?.id
    if (!fromId || !toId) return
    const gf = rhOrderedColumns.findIndex((c) => c.id === fromId)
    const gt = rhOrderedColumns.findIndex((c) => c.id === toId)
    if (gf >= 0 && gt >= 0) rhMoveColumn(gf, gt)
  }
  const rhColDragEnd = () => { setRhDragColIndex(null); setRhDragOverColIndex(null) }

  if (!open || !profile) return null

  return (
    <Modal onClose={onClose} closeOnBackdrop size="lg">
      <ModalHeader
        title="Expiry Detail"
        subtitle={profile.document ? `${profile.document.fileCode} - ${profile.document.title}` : ''}
        onClose={onClose}
      />
      <ModalBody className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <AppSurface padding="lg" variant="panel" className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Document Information</h3>
            <div className="grid gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Owner</p><p className="mt-1 text-sm text-ink">{profile.document?.ownerName || '-'}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Department</p><p className="mt-1 text-sm text-ink">{profile.department || '-'}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Folder</p><p className="mt-1 text-sm text-ink">{profile.folder || '-'}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Current Version</p><p className="mt-1 text-sm text-ink">{profile.currentVersion || '-'}</p></div>
            </div>
          </AppSurface>
          <AppSurface padding="lg" variant="panel" className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Expiry Profile</h3>
            <div className="grid gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Start Date</p><p className="mt-1 text-sm text-ink">{formatDate(profile.startDate)}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Expiry Date</p><p className="mt-1 text-sm text-ink">{formatDate(profile.expiryDate)}</p></div>
              {profile.renewalUrl ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Renewal Portal URL</p>
                  <p className="mt-1">
                    {(() => {
                      const url = profile.renewalUrl
                      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
                      return (
                        <a
                          href={normalized}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-brand, #003366)] hover:underline break-all"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
                          {url}
                        </a>
                      )
                    })()}
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2"><ExpiryStatusBadge status={profile.expiryStatus} /><RenewalStatusBadge status={profile.renewalStatus} /></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Remarks</p><p className="mt-1 text-sm text-ink">{profile.remarks || '-'}</p></div>
            </div>
          </AppSurface>
        </div>
        <AppSurface padding="lg" variant="panel" className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">Reminder Rules</h3>
          <div className="grid gap-3 md:grid-cols-1 xl:grid-cols-5">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Expiring Soon</p><p className="mt-1 text-sm text-ink">{profile.expiringSoonDays ?? '-'} day(s)</p></div>
            {REMINDER_LEVELS.map((level) => {
              const recipients = profile.reminderRule?.[level.recipientsField] || []
              return (
                <div key={level.key}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{level.label}</p>
                  <p className="mt-1 text-sm text-ink">{profile.reminderRule?.[level.daysField] ?? '-'} day(s)</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Recipients</p>
                  <div className="mt-1 space-y-1 text-sm text-ink">
                    <p>{profile.document?.ownerName || '-'} (Owner)</p>
                    {recipients.length > 0 ? recipients.map((user) => (
                      <p key={`${level.key}-${user.id}`}>{formatUserLabel(user)}</p>
                    )) : <p>-</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </AppSurface>
        <AppSurface padding="lg" variant="panel">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Renewal History</h3>
            <span className="text-xs text-ink-soft">{profile.renewalHistory?.length || 0} record(s)</span>
          </div>
          <div className="mb-3 flex justify-end">
            <ColumnSettingsButton
              orderedColumns={rhOrderedColumns}
              hiddenColumns={rhHiddenColumns}
              onToggleColumn={rhToggleColumnVisibility}
              onReset={rhResetTableSettings}
            />
          </div>
          <TableContainer>
            <Table>
              <thead>
                <tr>
                  {rhVisibleColumns.map((col, idx) => {
                    const id = col.id || col.key
                    const canDrag = !col.stickyRight
                    const isDragOver = canDrag && rhDragOverColIndex === idx
                    return (
                      <Th
                        key={id}
                        align={col.align || 'left'}
                        stickyRight={col.stickyRight || false}
                        sortable={Boolean(col.sortable)}
                        sortDirection={rhGetSortDirectionFor(id)}
                        sortKey={id}
                        onSort={col.sortable ? rhToggleSort : undefined}
                        draggable={canDrag}
                        dragOver={isDragOver}
                        onDragStart={(e) => rhColDragStart(idx, e)}
                        onDragOver={(e) => rhColDragOver(idx, e)}
                        onDragLeave={rhColDragLeave}
                        onDrop={(e) => rhColDrop(idx, e)}
                        onDragEnd={rhColDragEnd}
                        className={col.className || ''}
                        title={canDrag ? 'Click to sort • Drag to reorder' : col.sortable ? 'Click to sort' : undefined}
                      >
                        {typeof col.headerRender === 'function' ? col.headerRender() : (col.label || col.header || id)}
                      </Th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rhSortedData.length === 0 ? (
                  <Tr>
                    <Td colSpan={Math.max(rhVisibleColumns.length, 1)} className="py-8 text-center text-sm text-ink-muted">No renewal history yet.</Td>
                  </Tr>
                ) : (
                  rhSortedData.map((entry) => (
                    <Tr key={entry.id}>
                      {rhVisibleColumns.map((col) => {
                        const id = col.id || col.key || col.accessor
                        const accessor = col.accessor || id
                        let value
                        if (typeof accessor === 'function') value = accessor(entry, col)
                        else value = entry?.[accessor]
                        const content = typeof col.render === 'function' ? col.render(value, entry) : (value != null ? value : '')
                        return (
                          <Td
                            key={id}
                            align={col.align || 'left'}
                            stickyRight={col.stickyRight || false}
                            className={col.className || ''}
                          >
                            {content}
                          </Td>
                        )
                      })}
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableContainer>
        </AppSurface>
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  )
}

export default function ExpiryTracking() {
  const location = useLocation()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [dashboard, setDashboard] = useState({
    totalTrackedDocuments: 0,
    active: 0,
    expiringSoon: 0,
    expiringToday: 0,
    expired: 0,
    renewalInProgress: 0
  })
  const [owners, setOwners] = useState([])
  const [documentTypes, setDocumentTypes] = useState([])
  const [filters, setFilters] = useState({
    search: '',
    ownerId: '',
    department: '',
    company: '',
    documentTypeId: '',
    expiryStatus: '',
    renewalStatus: '',
    expiryDateFrom: '',
    expiryDateTo: ''
  })
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [globalExpirySettings, setGlobalExpirySettings] = useState({
    expiringSoonDays: 60,
    reminder1Days: 90,
    reminder2Days: 60,
    reminder3Days: 30,
    reminder4Days: 7
  })
  const [detailOpen, setDetailOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [renewalOpen, setRenewalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mainDragColIndex, setMainDragColIndex] = useState(null)
  const [mainDragOverColIndex, setMainDragOverColIndex] = useState(null)

  const canEdit = hasPermission('expiryTracking', 'edit')
  const canRenew = hasPermission('expiryTracking', 'renew')
  const canExport = hasPermission('expiryTracking', 'export')

  const loadLookups = async () => {
    try {
      const [usersRes, docTypesRes, expiryRes] = await Promise.all([
        api.get('/users'),
        api.get('/system/config/document-types'),
        api.get('/system/config/expiry-tracking')
      ])
      setOwners(usersRes.data?.data?.users || usersRes.data?.users || [])
      setDocumentTypes(docTypesRes.data?.data?.documentTypes || [])
      setGlobalExpirySettings(expiryRes.data?.data?.settings || globalExpirySettings)
    } catch (error) {
      console.error('Failed to load expiry tracking lookups:', error)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const params = {
        ...filters,
        page: pagination.page,
        limit: pagination.limit
      }
      const [listRes, dashboardRes] = await Promise.all([
        api.get('/expiry-tracking', { params }),
        api.get('/expiry-tracking/dashboard', { params: filters })
      ])
      setRecords(listRes.data?.data?.records || [])
      setPagination((prev) => ({
        ...prev,
        total: listRes.data?.data?.pagination?.total || 0
      }))
      setDashboard(dashboardRes.data?.data?.dashboard || {
        totalTrackedDocuments: 0,
        active: 0,
        expiringSoon: 0,
        expiringToday: 0,
        expired: 0,
        renewalInProgress: 0
      })
    } catch (error) {
      console.error('Failed to load expiry tracking data:', error)
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLookups()
  }, [])

  useEffect(() => {
    loadData()
  }, [filters, pagination.page, pagination.limit, refreshKey])

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    const docId = params.get('docId')
    const renew = params.get('renew')
    if (!docId || renew !== '1') return
    if (!canRenew) return
    openRenewalByDocumentId(docId)
    navigate('/expiry-tracking', { replace: true })
  }, [location.search, canRenew, navigate])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 15)))
  }, [pagination.limit, pagination.total])

  const refresh = () => setRefreshKey((prev) => prev + 1)

  const openProfileDetail = async (record) => {
    try {
      const res = await api.get(`/expiry-tracking/${record.documentId}`)
      setSelectedProfile(res.data?.data?.profile || null)
      setDetailOpen(true)
    } catch (error) {
      console.error('Failed to load expiry detail:', error)
    }
  }

  const openEdit = async (record) => {
    try {
      const res = await api.get(`/expiry-tracking/${record.documentId}`)
      const profile = res.data?.data?.profile || null
      setSelectedProfile(profile)
      setEditOpen(true)
    } catch (error) {
      console.error('Failed to load expiry profile:', error)
    }
  }

  const openRenewal = async (record) => {
    try {
      const res = await api.get(`/expiry-tracking/${record.documentId}`)
      setSelectedProfile(res.data?.data?.profile || null)
      setRenewalOpen(true)
    } catch (error) {
      console.error('Failed to load renewal profile:', error)
    }
  }

  const openRenewalByDocumentId = async (documentId) => {
    const id = parseInt(documentId, 10)
    if (!Number.isFinite(id) || id <= 0) return
    try {
      const res = await api.get(`/expiry-tracking/${id}`)
      setSelectedProfile(res.data?.data?.profile || null)
      setRenewalOpen(true)
    } catch (error) {
      console.error('Failed to load renewal profile:', error)
    }
  }

  const handleProfileUpdate = async (form) => {
    if (!selectedProfile) return
    setSaving(true)
    try {
      const payload = {
        startDate: form.startDate,
        expiryDate: form.expiryDate,
        remarks: form.remarks,
        renewalUrl: form.renewalUrl?.trim() || null,
        defaultChecklistItems: Array.isArray(form.defaultChecklistItems) ? form.defaultChecklistItems : null
      }

      if (form.useGlobalRule) {
        payload.expiringSoonDays = parseInt(globalExpirySettings.expiringSoonDays, 10) || 0
        payload.reminder1Days = parseInt(globalExpirySettings.reminder1Days, 10) || 0
        payload.reminder2Days = parseInt(globalExpirySettings.reminder2Days, 10) || 0
        payload.reminder3Days = parseInt(globalExpirySettings.reminder3Days, 10) || 0
        payload.reminder4Days = parseInt(globalExpirySettings.reminder4Days, 10) || 0
      } else {
        payload.expiringSoonDays = parseInt(form.expiringSoonDays, 10) || 0
        payload.reminder1Days = parseInt(form.reminder1Days, 10) || 0
        payload.reminder2Days = parseInt(form.reminder2Days, 10) || 0
        payload.reminder3Days = parseInt(form.reminder3Days, 10) || 0
        payload.reminder4Days = parseInt(form.reminder4Days, 10) || 0
      }
      payload.reminderRecipients = form.reminderRecipients

      await api.patch(`/expiry-tracking/${selectedProfile.documentId}`, payload)
      setEditOpen(false)
      setSelectedProfile(null)
      refresh()
    } catch (error) {
      console.error('Failed to update expiry profile:', error)
      alert(error.response?.data?.message || 'Failed to update expiry profile')
    } finally {
      setSaving(false)
    }
  }

  const handleRejectRenewal = async (record) => {
    try {
      await api.post(`/expiry-tracking/${record.documentId}/renew/reject`, {})
      refresh()
    } catch (error) {
      console.error('Failed to reject renewal:', error)
      alert(error.response?.data?.message || 'Failed to reject renewal')
    }
  }

  const handleCompleteRenewal = async (form) => {
    if (!selectedProfile) return
    setSaving(true)
    try {
      const payload = new FormData()
      payload.append('startDate', form.startDate)
      payload.append('newExpiryDate', form.newExpiryDate)
      payload.append('remarks', form.remarks || '')
      payload.append('renewalUrl', form.renewalUrl?.trim() || '')
      if (Array.isArray(form.checklistItems) && form.checklistItems.length > 0) {
        payload.append('checklistItems', JSON.stringify(form.checklistItems))
      }
      payload.append('file', form.file)
      await api.post(`/expiry-tracking/${selectedProfile.documentId}/renew/complete`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setRenewalOpen(false)
      setSelectedProfile(null)
      refresh()
    } catch (error) {
      console.error('Failed to complete renewal:', error)
      alert(error.response?.data?.message || 'Failed to complete renewal')
    } finally {
      setSaving(false)
    }
  }

  const handleDisableTracking = async (record) => {
    try {
      await api.post(`/expiry-tracking/${record.documentId}/disable`, {})
      refresh()
    } catch (error) {
      console.error('Failed to disable tracking:', error)
      alert(error.response?.data?.message || 'Failed to disable tracking')
    }
  }

  const exportExcel = async () => {
    try {
      const res = await api.get('/expiry-tracking/export', { params: filters })
      const exportRows = res.data?.data?.records || []
      const headers = ['File Code', 'Document Name', 'Type', 'Owner', 'Department', 'Start Date', 'Expiry Date', 'Days Left', 'Expiry Status', 'Renewal Status']
      const rows = exportRows.map((row) => [
        row.document?.fileCode || '',
        row.document?.title || '',
        row.document?.documentType || '',
        row.document?.ownerName || '',
        row.department || '',
        formatDate(row.startDate),
        formatDate(row.expiryDate),
        row.daysLeft ?? '',
        row.expiryStatus || '',
        row.renewalStatus || ''
      ])

      const escapeCsvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
      const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
      const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
      const link = window.document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `expiry-tracking-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (error) {
      console.error('Failed to export Excel:', error)
      alert('Failed to export Excel')
    }
  }

  const exportPdf = async () => {
    try {
      const res = await api.get('/expiry-tracking/export', { params: filters })
      const exportRows = res.data?.data?.records || []
      const doc = new jsPDF('landscape')
      const headers = [['File Code', 'Document Name', 'Type', 'Owner', 'Start Date', 'Expiry Date', 'Days Left', 'Expiry Status', 'Renewal Status']]
      const body = exportRows.map((row) => [
        row.document?.fileCode || '',
        row.document?.title || '',
        row.document?.documentType || '',
        row.document?.ownerName || '',
        formatDate(row.startDate),
        formatDate(row.expiryDate),
        row.daysLeft ?? '',
        row.expiryStatus || '',
        row.renewalStatus || ''
      ])

      doc.setFontSize(16)
      doc.text('Expiry Tracking Report', 14, 16)
      doc.setFontSize(9)
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22)

      autoTable(doc, {
        startY: 28,
        head: headers,
        body,
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [240, 240, 240], textColor: [30, 30, 30] },
        alternateRowStyles: { fillColor: [250, 250, 250] }
      })

      doc.save(`expiry-tracking-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (error) {
      console.error('Failed to export PDF:', error)
      alert('Failed to export PDF')
    }
  }

  const mainColumns = useMemo(() => [
    {
      id: 'documentName',
      key: 'documentName',
      accessor: (row) => row.document?.title,
      label: 'Document Name',
      sortable: true,
      required: true,
      sortComparer: (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' }),
      render: (_v, record) => (
        <div className="space-y-1">
          <p className="font-semibold text-ink">{record.document?.title || '-'}</p>
          <p className="text-xs text-ink-soft">{record.document?.fileCode || '-'}</p>
        </div>
      )
    },
    {
      id: 'type',
      key: 'type',
      accessor: (row) => row.document?.documentType,
      label: 'Type',
      sortable: true,
      render: (v) => v || '-'
    },
    {
      id: 'owner',
      key: 'owner',
      accessor: (row) => row.document?.ownerName,
      label: 'Owner',
      sortable: true,
      render: (v) => v || '-'
    },
    {
      id: 'startDate',
      key: 'startDate',
      accessor: 'startDate',
      label: 'Start Date',
      sortable: true,
      sortType: 'date',
      render: (v) => formatDate(v)
    },
    {
      id: 'expiryDate',
      key: 'expiryDate',
      accessor: 'expiryDate',
      label: 'Expiry Date',
      sortable: true,
      sortType: 'date',
      render: (v) => formatDate(v)
    },
    {
      id: 'daysLeft',
      key: 'daysLeft',
      accessor: 'daysLeft',
      label: 'Days Left',
      sortable: true,
      sortType: 'number',
      sortComparer: (a, b) => (Number(a ?? 0) - Number(b ?? 0)),
      render: (v) => v ?? '-'
    },
    {
      id: 'expiryStatus',
      key: 'expiryStatus',
      accessor: 'expiryStatus',
      label: 'Expiry Status',
      sortable: true,
      render: (v) => <ExpiryStatusBadge status={v} />
    },
    {
      id: 'renewalStatus',
      key: 'renewalStatus',
      accessor: 'renewalStatus',
      label: 'Renewal Status',
      sortable: true,
      render: (v) => <RenewalStatusBadge status={v} />
    },
    {
      id: 'action',
      key: 'action',
      accessor: '__action',
      label: 'Action',
      required: true,
      align: 'right',
      stickyRight: true,
      render: (_v, record) => (
        <div className="flex justify-end">
          <ActionMenu
            dataTourId="expiry-action-menu"
            actions={[
              { label: 'View', onClick: () => openProfileDetail(record) },
              ...(canEdit ? [{ label: 'Update', onClick: () => openEdit(record) }] : []),
              ...(canRenew && record.document?.allowRenewal
                ? [
                    { label: 'Renew', onClick: () => openRenewal(record) }
                  ]
                : []
              ),
              ...(canRenew && record.renewalStatus === 'IN_PROGRESS'
                ? [{ label: 'Reject', onClick: () => handleRejectRenewal(record), variant: 'destructive', dividerAfter: true }]
                : []
              ),
              ...(canEdit && record.trackingEnabled
                ? [{ label: 'Disable', onClick: () => handleDisableTracking(record), variant: 'destructive' }]
                : []
              )
            ]}
          />
        </div>
      )
    }
  ], [canEdit, canRenew, openProfileDetail, openEdit, openRenewal, handleRejectRenewal, handleDisableTracking])

  const mainTableFeatures = useTableFeatures({
    tableId: 'expiry-tracking-main',
    columns: mainColumns,
    data: records,
    defaultSortKey: 'daysLeft',
    defaultSortDirection: 'asc'
  })

  const {
    sortedData: mainSortedData,
    visibleColumns: mainVisibleColumns,
    orderedColumns: mainOrderedColumns,
    getSortDirectionFor: mainGetSortDirectionFor,
    toggleSort: mainToggleSort,
    moveColumn: mainMoveColumn,
    hiddenColumns: mainHiddenColumns,
    toggleColumnVisibility: mainToggleColumnVisibility,
    resetTableSettings: mainResetTableSettings
  } = mainTableFeatures

  const mainColDragStart = (idx, e) => {
    const col = mainVisibleColumns[idx]
    if (!col || col.stickyRight) { e.preventDefault(); return }
    setMainDragColIndex(idx)
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)) } catch {}
  }
  const mainColDragOver = (idx, e) => {
    e.preventDefault()
    const col = mainVisibleColumns[idx]
    if (!col || col.stickyRight) return
    setMainDragOverColIndex(idx)
  }
  const mainColDragLeave = () => setMainDragOverColIndex(null)
  const mainColDrop = (toIdx, e) => {
    e.preventDefault()
    const fromIdx = mainDragColIndex
    setMainDragColIndex(null)
    setMainDragOverColIndex(null)
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return
    const fromId = mainVisibleColumns[fromIdx]?.id
    const toId = mainVisibleColumns[toIdx]?.id
    if (!fromId || !toId) return
    const gf = mainOrderedColumns.findIndex((c) => c.id === fromId)
    const gt = mainOrderedColumns.findIndex((c) => c.id === toId)
    if (gf >= 0 && gt >= 0) mainMoveColumn(gf, gt)
  }
  const mainColDragEnd = () => { setMainDragColIndex(null); setMainDragOverColIndex(null) }

  return (
    <div className="space-y-6" data-tour-id="expiry-page">
      <PageHeader
        title="Expiry Tracking Management"
        subtitle="Track enrolled documents, expiry status, and renewal progress without duplicating document metadata."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2" data-tour-id="expiry-header-actions">
            <Button variant="secondary" onClick={refresh}>Refresh</Button>
            {canExport ? <Button variant="secondary" onClick={exportExcel}>Export Excel</Button> : null}
            {canExport ? <Button onClick={exportPdf}>Export PDF</Button> : null}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6" data-tour-id="expiry-stats">
        <StatCard label="Total Tracked Documents" value={dashboard.totalTrackedDocuments} />
        <StatCard label="Active" value={dashboard.active} tone="success" />
        <StatCard label="Expiring Soon" value={dashboard.expiringSoon} tone="warning" />
        <StatCard label="Expiring Today" value={dashboard.expiringToday} tone="info" />
        <StatCard label="Expired" value={dashboard.expired} tone="danger" />
        <StatCard label="Renewal In Progress" value={dashboard.renewalInProgress} tone="info" />
      </div>

      <AppSurface padding="lg" variant="panel" className="space-y-4" data-tour-id="expiry-filters-card">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Search">
            <TextInput
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="Search by file code or document name"
            />
          </Field>
          <Field label="Owner">
            <SelectField value={filters.ownerId} onChange={(e) => setFilters((prev) => ({ ...prev, ownerId: e.target.value }))}>
              <option value="">All owners</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {`${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Department">
            <TextInput value={filters.department} onChange={(e) => setFilters((prev) => ({ ...prev, department: e.target.value }))} placeholder="Department" />
          </Field>
          <Field label="Company">
            <TextInput value={filters.company} onChange={(e) => setFilters((prev) => ({ ...prev, company: e.target.value }))} placeholder="Company" />
          </Field>
          <Field label="Document Type">
            <SelectField value={filters.documentTypeId} onChange={(e) => setFilters((prev) => ({ ...prev, documentTypeId: e.target.value }))}>
              <option value="">All document types</option>
              {documentTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Expiry Status">
            <SelectField value={filters.expiryStatus} onChange={(e) => setFilters((prev) => ({ ...prev, expiryStatus: e.target.value }))}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRING_SOON">Expiring Soon</option>
              <option value="EXPIRING_TODAY">Expiring Today</option>
              <option value="EXPIRED">Expired</option>
            </SelectField>
          </Field>
          <Field label="Renewal Status">
            <SelectField value={filters.renewalStatus} onChange={(e) => setFilters((prev) => ({ ...prev, renewalStatus: e.target.value }))}>
              <option value="">All renewal statuses</option>
              <option value="NOT_STARTED">Not Started</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </SelectField>
          </Field>
          <div className="grid gap-4 md:grid-cols-2 xl:col-span-1">
            <Field label="Expiry From">
              <TextInput type="date" value={filters.expiryDateFrom} onChange={(e) => setFilters((prev) => ({ ...prev, expiryDateFrom: e.target.value }))} />
            </Field>
            <Field label="Expiry To">
              <TextInput type="date" value={filters.expiryDateTo} onChange={(e) => setFilters((prev) => ({ ...prev, expiryDateTo: e.target.value }))} />
            </Field>
          </div>
        </div>
      </AppSurface>

      <AppSurface padding="none" variant="panel" data-tour-id="expiry-table-card">
        {loading ? (
          <div className="flex items-center justify-center px-6 py-16">
            <InlineSpinner label="Loading expiry tracking records..." />
          </div>
        ) : (
          <>
            <DataTableToolbar paddingClassName="px-6 pt-4 pb-2" rightSlot={<>
              <ColumnSettingsButton
                orderedColumns={mainOrderedColumns}
                hiddenColumns={mainHiddenColumns}
                onToggleColumn={mainToggleColumnVisibility}
                onReset={mainResetTableSettings}
              />
            </>} />

            <TableContainer>
              <Table>
                <thead>
                  <tr>
                    {mainVisibleColumns.map((col, idx) => {
                      const id = col.id || col.key
                      const canDrag = !col.stickyRight
                      const isDragOver = canDrag && mainDragOverColIndex === idx
                      return (
                        <Th
                          key={id}
                          align={col.align || 'left'}
                          stickyRight={col.stickyRight || false}
                          sortable={Boolean(col.sortable)}
                          sortDirection={mainGetSortDirectionFor(id)}
                          sortKey={id}
                          onSort={col.sortable ? mainToggleSort : undefined}
                          draggable={canDrag}
                          dragOver={isDragOver}
                          onDragStart={(e) => mainColDragStart(idx, e)}
                          onDragOver={(e) => mainColDragOver(idx, e)}
                          onDragLeave={mainColDragLeave}
                          onDrop={(e) => mainColDrop(idx, e)}
                          onDragEnd={mainColDragEnd}
                          className={col.className || ''}
                          title={canDrag ? 'Click to sort • Drag to reorder' : col.sortable ? 'Click to sort' : undefined}
                        >
                          {typeof col.headerRender === 'function' ? col.headerRender() : (col.label || col.header || id)}
                        </Th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {mainSortedData.length === 0 ? (
                    <Tr>
                      <Td colSpan={Math.max(mainVisibleColumns.length, 1)} className="py-10 text-center text-sm text-ink-muted">No tracked documents found for the selected filters.</Td>
                    </Tr>
                  ) : (
                    mainSortedData.map((record) => (
                      <Tr key={record.id}>
                        {mainVisibleColumns.map((col) => {
                          const id = col.id || col.key || col.accessor
                          const accessor = col.accessor || id
                          let value
                          if (typeof accessor === 'function') value = accessor(record, col)
                          else if (accessor === '__action') value = null
                          else value = record?.[accessor]
                          const content = typeof col.render === 'function' ? col.render(value, record) : (value != null ? value : '')
                          return (
                            <Td
                              key={id}
                              align={col.align || 'left'}
                              stickyRight={col.stickyRight || false}
                              className={col.className || ''}
                            >
                              {content}
                            </Td>
                          )
                        })}
                      </Tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableContainer>
            <Pagination
              currentPage={pagination.page}
              totalPages={totalPages}
              totalRecords={pagination.total}
              pageSize={pagination.limit}
              onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
              onPageSizeChange={(limit) => setPagination((prev) => ({ ...prev, limit, page: 1 }))}
            />
          </>
        )}
      </AppSurface>

      <DetailModal open={detailOpen} profile={selectedProfile} onClose={() => {
        setDetailOpen(false)
        setSelectedProfile(null)
      }} />

      <ExpiryEditModal open={editOpen} profile={selectedProfile} globalSettings={globalExpirySettings} users={owners} onClose={() => {
        setEditOpen(false)
        setSelectedProfile(null)
      }} onSubmit={handleProfileUpdate} saving={saving} />

      <RenewalModal open={renewalOpen} profile={selectedProfile} onClose={() => {
        setRenewalOpen(false)
        setSelectedProfile(null)
      }} onSubmit={handleCompleteRenewal} saving={saving} />
    </div>
  )
}
