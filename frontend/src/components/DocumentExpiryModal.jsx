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
      <label className="mb-2 block text-sm font-semibold text-ink">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
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
    useGlobalRule: true,
    expiringSoonDays: 60,
    reminder1Days: 90,
    reminder2Days: 60,
    reminder3Days: 30,
    reminder4Days: 7
  })

  useEffect(() => {
    if (!open || !document) return
    setError('')
    setForm({
      startDate: toDateInputValue(document.startDate || new Date()),
      expiryDate: toDateInputValue(document.expiryDate),
      remarks: document.expiryRemarks || '',
      useGlobalRule: true,
      expiringSoonDays: expirySettings?.expiringSoonDays ?? 60,
      reminder1Days: expirySettings?.reminder1Days ?? 90,
      reminder2Days: expirySettings?.reminder2Days ?? 60,
      reminder3Days: expirySettings?.reminder3Days ?? 30,
      reminder4Days: expirySettings?.reminder4Days ?? 7
    })
  }, [open, document, expirySettings])

  if (!open || !document) return null

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

    onSubmit(form)
  }

  return (
    <Modal onClose={onClose} closeOnBackdrop={!saving} size="lg">
      <ModalHeader
        title={document.trackingEnabled ? 'Update Expiry' : 'Set Expiry'}
        subtitle={document.fileCode ? `${document.fileCode} - ${document.fileName}` : document.fileName}
        onClose={onClose}
      />
      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-6">
          {error ? (
            <AppSurface padding="md" variant="panel" className="border border-red-200 bg-red-50 text-sm text-red-700">
              {error}
            </AppSurface>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Document Name">
              <TextInput value={document.fileName || document.title || ''} readOnly className="bg-surface-muted text-ink-muted" />
            </Field>
            <Field label="Document Type">
              <TextInput value={document.documentType || '-'} readOnly className="bg-surface-muted text-ink-muted" />
            </Field>
            <Field label="Start Date">
              <TextInput
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                required
                disabled={saving}
              />
            </Field>
            <Field label="Expiry Date">
              <TextInput
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm((prev) => ({ ...prev, expiryDate: e.target.value }))}
                required
                disabled={saving}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Remarks">
                <TextArea
                  rows={3}
                  value={form.remarks}
                  onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
                  placeholder="Optional expiry remarks"
                  disabled={saving}
                />
              </Field>
            </div>
          </div>

          <AppSurface padding="lg" variant="panel" className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-ink">Reminder Rules</h3>
              <p className="text-sm text-ink-muted">
                Saving here enables expiry tracking for this document and applies the reminder schedule below.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
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
                className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                disabled={saving}
              />
              Use Global Defaults
            </label>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Field label="Expiring Soon Days">
                <TextInput
                  type="number"
                  min="0"
                  value={form.expiringSoonDays}
                  onChange={(e) => setForm((prev) => ({ ...prev, expiringSoonDays: e.target.value, useGlobalRule: false }))}
                  disabled={saving || form.useGlobalRule}
                />
              </Field>
              <Field label="Reminder 1">
                <TextInput
                  type="number"
                  min="0"
                  value={form.reminder1Days}
                  onChange={(e) => setForm((prev) => ({ ...prev, reminder1Days: e.target.value, useGlobalRule: false }))}
                  disabled={saving || form.useGlobalRule}
                />
              </Field>
              <Field label="Reminder 2">
                <TextInput
                  type="number"
                  min="0"
                  value={form.reminder2Days}
                  onChange={(e) => setForm((prev) => ({ ...prev, reminder2Days: e.target.value, useGlobalRule: false }))}
                  disabled={saving || form.useGlobalRule}
                />
              </Field>
              <Field label="Reminder 3">
                <TextInput
                  type="number"
                  min="0"
                  value={form.reminder3Days}
                  onChange={(e) => setForm((prev) => ({ ...prev, reminder3Days: e.target.value, useGlobalRule: false }))}
                  disabled={saving || form.useGlobalRule}
                />
              </Field>
              <Field label="Reminder 4">
                <TextInput
                  type="number"
                  min="0"
                  value={form.reminder4Days}
                  onChange={(e) => setForm((prev) => ({ ...prev, reminder4Days: e.target.value, useGlobalRule: false }))}
                  disabled={saving || form.useGlobalRule}
                />
              </Field>
            </div>
          </AppSurface>
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
