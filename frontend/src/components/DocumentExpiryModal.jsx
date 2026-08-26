import React, { useEffect, useState } from 'react'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'

const toDateInputValue = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function Field({ label, children, hint = null }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-900">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  )
}

export default function DocumentExpiryModal({
  open,
  document,
  expirySettings,
  onClose,
  onSubmit,
  saving
}) {
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    startDate: '',
    expiryDate: '',
    remarks: '',
    renewalUrl: '',
    useGlobalRule: true,
    expiringSoonDays: 60,
    reminder1Days: 90,
    reminder2Days: 60,
    reminder3Days: 30,
    reminder4Days: 7
  })
  const [defaultChecklist, setDefaultChecklist] = useState([])
  const [newDefaultChecklistName, setNewDefaultChecklistName] = useState('')

  useEffect(() => {
    if (!open || !document) return
    setError('')
    const profileChecklist = Array.isArray(document.defaultChecklistItems)
      ? document.defaultChecklistItems.map((it, idx) => ({
          id: 'doc-expiry-default-' + idx + '-' + Date.now(),
          name: typeof it === 'string' ? it : (it?.name || ('Document ' + (idx + 1)))
        }))
      : []
    setDefaultChecklist(profileChecklist)
    setNewDefaultChecklistName('')
    setForm({
      startDate: toDateInputValue(document.startDate || new Date()),
      expiryDate: toDateInputValue(document.expiryDate),
      remarks: document.expiryRemarks || '',
      renewalUrl: document.renewalUrl || '',
      useGlobalRule: true,
      expiringSoonDays: expirySettings?.expiringSoonDays ?? 60,
      reminder1Days: expirySettings?.reminder1Days ?? 90,
      reminder2Days: expirySettings?.reminder2Days ?? 60,
      reminder3Days: expirySettings?.reminder3Days ?? 30,
      reminder4Days: expirySettings?.reminder4Days ?? 7
    })
  }, [open, document, expirySettings])

  if (!open || !document) return null

  const addDefaultChecklistItem = () => {
    const name = newDefaultChecklistName.trim()
    if (!name) return
    setDefaultChecklist((prev) => [...prev, { id: 'doc-expiry-checklist-' + Date.now(), name }])
    setNewDefaultChecklistName('')
  }

  const removeDefaultChecklistItem = (id) => {
    setDefaultChecklist((prev) => prev.filter((item) => item.id !== id))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!form.startDate || !form.expiryDate) {
      setError('Start date and expiry date are required.')
      return
    }

    if (new Date(form.expiryDate).getTime() < new Date(form.startDate).getTime()) {
      setError('Expiry date cannot be earlier than start date.')
      return
    }

    const checklistPayload = defaultChecklist.map((item) => item.name)
    onSubmit({ ...form, defaultChecklistItems: checklistPayload })
  }

  return (
    <Modal onClose={onClose} closeOnBackdrop={!saving} size="xl">
      <ModalHeader
        title={document.trackingEnabled ? 'Update Expiry' : 'Set Expiry'}
        subtitle={document.fileCode ? `${document.fileCode} - ${document.fileName}` : document.fileName}
        onClose={onClose}
      />
      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-6">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-[#003366]"></div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Document Information</h3>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Field label="Document Name">
                  <TextInput value={document.fileName || document.title || ''} readOnly className="bg-white text-gray-600" />
                </Field>
                <Field label="Document Type">
                  <TextInput value={document.documentType || '-'} readOnly className="bg-white text-gray-600" />
                </Field>
                <Field label="Owner">
                  <TextInput value={document.ownerName || '-'} readOnly className="bg-white text-gray-600" />
                </Field>
                <Field label="File Code">
                  <TextInput value={document.fileCode || '-'} readOnly className="bg-white text-gray-600" />
                </Field>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-[#003366]"></div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Expiry Dates</h3>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Start Date" required>
                  <TextInput
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                    required
                    disabled={saving}
                  />
                </Field>
                <Field label="Expiry Date" required>
                  <TextInput
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, expiryDate: e.target.value }))}
                    required
                    disabled={saving}
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-[#003366]"></div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Reminder Rules</h3>
              <p className="text-xs text-gray-500">Saving enables expiry tracking &amp; applies the schedule below.</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
              <label className="inline-flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors w-full">
                <input
                  type="checkbox"
                  checked={form.useGlobalRule}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setForm((prev) => ({
                      ...prev,
                      useGlobalRule: checked,
                      ...(checked
                        ? {
                            expiringSoonDays: expirySettings?.expiringSoonDays ?? 60,
                            reminder1Days: expirySettings?.reminder1Days ?? 90,
                            reminder2Days: expirySettings?.reminder2Days ?? 60,
                            reminder3Days: expirySettings?.reminder3Days ?? 30,
                            reminder4Days: expirySettings?.reminder4Days ?? 7
                          }
                        : {})
                    }))
                  }}
                  className="h-4 w-4 mt-0.5 rounded border-gray-300 text-[#003366] focus-visible:ring-2 focus-visible:ring-[#003366]/30"
                  disabled={saving}
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Use Global Defaults</p>
                  <p className="text-xs text-gray-500">Apply system-wide reminder thresholds to this document.</p>
                </div>
              </label>

              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                <Field label="Expiring Soon Days" hint="Status switches on this threshold.">
                  <TextInput
                    type="number"
                    min="0"
                    value={form.expiringSoonDays}
                    onChange={(e) => setForm((prev) => ({ ...prev, expiringSoonDays: e.target.value, useGlobalRule: false }))}
                    disabled={saving || form.useGlobalRule}
                  />
                </Field>
                <Field label="Reminder 1 (Days)">
                  <TextInput
                    type="number"
                    min="0"
                    value={form.reminder1Days}
                    onChange={(e) => setForm((prev) => ({ ...prev, reminder1Days: e.target.value, useGlobalRule: false }))}
                    disabled={saving || form.useGlobalRule}
                  />
                </Field>
                <Field label="Reminder 2 (Days)">
                  <TextInput
                    type="number"
                    min="0"
                    value={form.reminder2Days}
                    onChange={(e) => setForm((prev) => ({ ...prev, reminder2Days: e.target.value, useGlobalRule: false }))}
                    disabled={saving || form.useGlobalRule}
                  />
                </Field>
                <Field label="Reminder 3 (Days)">
                  <TextInput
                    type="number"
                    min="0"
                    value={form.reminder3Days}
                    onChange={(e) => setForm((prev) => ({ ...prev, reminder3Days: e.target.value, useGlobalRule: false }))}
                    disabled={saving || form.useGlobalRule}
                  />
                </Field>
                <Field label="Reminder 4 (Days)">
                  <TextInput
                    type="number"
                    min="0"
                    value={form.reminder4Days}
                    onChange={(e) => setForm((prev) => ({ ...prev, reminder4Days: e.target.value, useGlobalRule: false }))}
                    disabled={saving || form.useGlobalRule}
                  />
                </Field>
              </div>
            </div>
          </section>

          <details className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-5 py-4 marker:hidden hover:bg-gray-50 transition-colors">
              <div className="flex items-start gap-3">
                <div className="h-4 w-1 rounded-full bg-[#003366] mt-1 flex-shrink-0"></div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-wider text-gray-700">Advanced Settings</p>
                  <p className="text-xs text-gray-500 mt-1">Internal notes, renewal portal URL, and required documents checklist.</p>
                </div>
              </div>
              <p className="shrink-0 text-xs font-medium text-gray-500 pt-1.5">Click to expand</p>
            </summary>
            <div className="space-y-5 border-t border-gray-200 px-5 py-5">
              <Field label="Remarks">
                <TextArea
                  rows={3}
                  value={form.remarks}
                  onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
                  placeholder="Optional expiry remarks"
                  disabled={saving}
                />
              </Field>

              <Field
                label="Renewal Portal URL"
                hint="Default URL used for renewing this document/system. Populates the renewal modal automatically."
              >
                <TextInput
                  type="url"
                  placeholder="https://example.com/renew"
                  value={form.renewalUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, renewalUrl: e.target.value }))}
                  disabled={saving}
                />
              </Field>

              <Field
                label="Default Renewal Checklist"
                hint="Default documents required every time this document is renewed."
              >
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  {defaultChecklist.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500 bg-white">
                      No default documents configured. Add required documents below.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {defaultChecklist.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5"
                        >
                          <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900 truncate">{item.name}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDefaultChecklistItem(item.id)}
                            className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                            aria-label="Remove checklist item"
                            disabled={saving}
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
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
                      disabled={saving}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={addDefaultChecklistItem}
                      disabled={saving || !newDefaultChecklistName.trim()}
                      className="shrink-0"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </Field>
            </div>
          </details>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Expiry'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
