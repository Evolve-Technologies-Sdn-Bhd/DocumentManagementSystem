import React, { useEffect, useMemo, useState } from 'react'
import * as ReactDOM from 'react-dom'
import api from '../api/axios'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import SelectField from './ui/SelectField'

const statusOptions = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'KIV', label: 'KIV' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' }
]

export default function TenderEntryModal({ open, entry, onClose, onSaved }) {
  const isEdit = useMemo(() => Boolean(entry?.id), [entry])
  const [form, setForm] = useState({
    title: '',
    clientName: '',
    contactPerson: '',
    tenderValueRm: '',
    estimatedProfitRm: '',
    submissionDeadline: '',
    status: 'DRAFT',
    source: '',
    documentLink: '',
    followUpNotes: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const allowedStatuses = useMemo(() => new Set(statusOptions.map((s) => s.value)), [])

  useEffect(() => {
    if (!open) return
    setError('')
    setForm({
      title: entry?.title || '',
      clientName: entry?.clientName || '',
      contactPerson: entry?.contactPerson || '',
      tenderValueRm: entry?.tenderValueCents != null ? (Number(entry.tenderValueCents) / 100).toFixed(2) : '',
      estimatedProfitRm: entry?.estimatedProfitCents != null ? (Number(entry.estimatedProfitCents) / 100).toFixed(2) : '',
      submissionDeadline: entry?.submissionDeadline ? new Date(entry.submissionDeadline).toISOString().split('T')[0] : '',
      status: entry?.status || 'DRAFT',
      source: entry?.source || '',
      documentLink: entry?.documentLink || '',
      followUpNotes: entry?.followUpNotes || ''
    })
  }, [open, entry])

  const toCents = (rmText) => {
    const v = Number(String(rmText || '').replace(/,/g, ''))
    if (!Number.isFinite(v)) return 0
    return Math.round(v * 100)
  }

  const normalizeCurrencyInput = (value, allowNegative = false) => {
    const text = String(value ?? '').replace(/,/g, '')
    const sign = allowNegative && text.trim().startsWith('-') ? '-' : ''
    const raw = text.replace(/-/g, '').replace(/[^\d.]/g, '')
    const parts = raw.split('.')
    const normalized = parts.length === 1 ? parts[0] : `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`
    if (!normalized) return sign ? '-' : ''
    return `${sign}${normalized}`
  }

  const formatCurrencyDisplay = (value, allowNegative = false) => {
    const normalized = normalizeCurrencyInput(value, allowNegative)
    if (!normalized) return ''
    const numeric = Number(normalized)
    if (!Number.isFinite(numeric)) return ''
    return numeric.toLocaleString('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const handleCurrencyChange = (field, value) => {
    const allowNegative = field === 'estimatedProfitRm'
    setForm((prev) => ({ ...prev, [field]: normalizeCurrencyInput(value, allowNegative) }))
  }

  const handleCurrencyBlur = (field) => {
    const allowNegative = field === 'estimatedProfitRm'
    setForm((prev) => ({ ...prev, [field]: formatCurrencyDisplay(prev[field], allowNegative) }))
  }

  const isValidDateInput = (value) => {
    if (!value) return false
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false
    const date = new Date(`${value}T00:00:00`)
    return Number.isFinite(date.getTime())
  }

  const isValidHttpUrl = (value) => {
    if (!value) return false
    try {
      const url = new URL(String(value))
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  const isValidCurrency = (value, allowNegative = false) => {
    if (value === null || value === undefined) return true
    const raw = String(value).trim()
    if (!raw) return true
    if (raw === '-') return false
    const pattern = allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/
    if (!pattern.test(raw.replace(/,/g, ''))) return false
    const numeric = Number(raw.replace(/,/g, ''))
    return Number.isFinite(numeric) && (allowNegative || numeric >= 0)
  }

  const validatePayload = (payload) => {
    if (!payload.title) return 'Tender / Project Title is required.'

    if (payload.submissionDeadline && !isValidDateInput(payload.submissionDeadline)) {
      return 'Submission Deadline format is invalid.'
    }

    if (!allowedStatuses.has(payload.status)) return 'Status is invalid.'

    if (!isValidCurrency(form.tenderValueRm, false)) return 'Tender Value (RM) format is invalid.'
    if (!isValidCurrency(form.estimatedProfitRm, true)) return 'Estimated Profit (RM) format is invalid.'

    if (payload.documentLink && !isValidHttpUrl(payload.documentLink)) {
      return 'Documents (Link / Reference) must be a valid http(s) URL.'
    }

    if (payload.followUpNotes && String(payload.followUpNotes).length > 2000) {
      return 'Follow-up Notes is too long.'
    }

    if (payload.source && String(payload.source).length > 255) return 'Source is too long.'
    if (payload.clientName && String(payload.clientName).length > 255) return 'Client / Company is too long.'
    if (payload.contactPerson && String(payload.contactPerson).length > 255) return 'Contact Person is too long.'

    return ''
  }

  const handleSubmit = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        title: String(form.title || '').trim(),
        clientName: String(form.clientName || '').trim() || null,
        contactPerson: String(form.contactPerson || '').trim() || null,
        submissionDeadline: form.submissionDeadline || null,
        status: form.status,
        tenderValueCents: toCents(form.tenderValueRm),
        estimatedProfitCents: toCents(form.estimatedProfitRm),
        source: String(form.source || '').trim() || null,
        documentLink: String(form.documentLink || '').trim() || null,
        followUpNotes: String(form.followUpNotes || '').trim() || null
      }

      const validationError = validatePayload(payload)
      if (validationError) {
        setError(validationError)
        setSaving(false)
        return
      }

      if (isEdit) {
        await api.put(`/crm/tender-book/${entry.id}`, payload)
      } else {
        await api.post('/crm/tender-book', payload)
      }
      onSaved?.()
    } catch (e) {
      console.error('Failed to save tender entry:', e)
      setError('Unable to save entry. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const modal = (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-[95] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Tender' : 'Add New Tender'}</h3>
              <p className="text-xs text-gray-600 mt-1">Tender Book Register</p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 rounded-lg p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {isEdit && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-soft">Tender No / Ref</label>
                <TextInput value={entry?.tenderRefNo || '-'} disabled />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Tender / Project Title</label>
              <TextInput value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Client / Company</label>
              <TextInput value={form.clientName} onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Contact Person</label>
              <TextInput value={form.contactPerson} onChange={(e) => setForm((p) => ({ ...p, contactPerson: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Tender Value (RM)</label>
              <TextInput
                inputMode="decimal"
                placeholder="0.00"
                value={form.tenderValueRm}
                onChange={(e) => handleCurrencyChange('tenderValueRm', e.target.value)}
                onBlur={() => handleCurrencyBlur('tenderValueRm')}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Estimated Profit (RM)</label>
              <TextInput
                inputMode="decimal"
                placeholder="0.00"
                value={form.estimatedProfitRm}
                onChange={(e) => handleCurrencyChange('estimatedProfitRm', e.target.value)}
                onBlur={() => handleCurrencyBlur('estimatedProfitRm')}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Submission Deadline</label>
              <TextInput type="date" value={form.submissionDeadline} onChange={(e) => setForm((p) => ({ ...p, submissionDeadline: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Status</label>
              <SelectField value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SelectField>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Source</label>
              <TextInput value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Documents (Link / Reference)</label>
              <TextInput value={form.documentLink} onChange={(e) => setForm((p) => ({ ...p, documentLink: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Follow-up Notes</label>
              <TextArea rows={4} value={form.followUpNotes} onChange={(e) => setForm((p) => ({ ...p, followUpNotes: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving} loadingText="Saving...">
            Save Entry
          </Button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
