import React, { useEffect, useMemo, useState } from 'react'
import * as ReactDOM from 'react-dom'
import api from '../api/axios'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import SelectField from './ui/SelectField'

const statusOptions = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'FOLLOW_UP', label: 'Follow Up' },
  { value: 'NO_RESPONSE', label: 'No Response' },
  { value: 'QUOTATION_ISSUED', label: 'Quotation Issued' }
]

const defaultChannelOptions = [
  'Facebook Post/Ad',
  'Messenger',
  'Comment',
  'Referral from FB'
]

const defaultIndustryOptions = [
  'Construction',
  'Manufacturing',
  'Retail',
  'Services',
  'Education',
  'Healthcare',
  'Other'
]

export default function FbEnquiryEntryModal({ open, entry, onClose, onSaved }) {
  const isEdit = useMemo(() => Boolean(entry?.id), [entry])
  const [channelOptions, setChannelOptions] = useState(defaultChannelOptions)
  const [industryOptions, setIndustryOptions] = useState(defaultIndustryOptions)
  const [addingLookup, setAddingLookup] = useState({ channel: false, industryType: false })
  const [showAddLookup, setShowAddLookup] = useState({ channel: false, industryType: false })
  const [newLookup, setNewLookup] = useState({ channel: '', industryType: '' })
  const [form, setForm] = useState({
    name: '',
    enquiryDate: '',
    email: '',
    company: '',
    contact: '',
    address: '',
    state: '',
    channel: 'Facebook Post/Ad',
    industryType: '',
    interestedProduct: '',
    painPoint: '',
    status: 'NEW',
    documentLink: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const allowedStatuses = useMemo(() => new Set(statusOptions.map((s) => s.value)), [])
  const allowedChannels = useMemo(() => new Set(channelOptions.map((v) => String(v))), [channelOptions])
  const allowedIndustries = useMemo(() => new Set(industryOptions.map((v) => String(v))), [industryOptions])

  useEffect(() => {
    if (!open) return
    let active = true
    const loadLookups = async () => {
      try {
        const res = await api.get('/system/config/crm-fb-enquiry-lookups')
        const lookups = res.data?.data?.lookups || {}
        const baseChannels = Array.isArray(lookups.channels) && lookups.channels.length ? lookups.channels : defaultChannelOptions
        const baseIndustries = Array.isArray(lookups.industryTypes) && lookups.industryTypes.length ? lookups.industryTypes : defaultIndustryOptions
        const nextChannels = baseChannels.slice().sort((a, b) => String(a).localeCompare(String(b)))
        const nextIndustries = baseIndustries.slice().sort((a, b) => String(a).localeCompare(String(b)))
        if (!active) return
        setChannelOptions(nextChannels)
        setIndustryOptions(nextIndustries)
      } catch (e) {
        console.error('Failed to load CRM enquiry lookups:', e)
        if (!active) return
        setChannelOptions(defaultChannelOptions.slice().sort((a, b) => String(a).localeCompare(String(b))))
        setIndustryOptions(defaultIndustryOptions.slice().sort((a, b) => String(a).localeCompare(String(b))))
      }
    }

    loadLookups()
    return () => { active = false }
  }, [open])

  useEffect(() => {
    if (!open) return
    setError('')
    const preferredChannel = entry?.channel || channelOptions[0] || ''
    if (entry?.channel && !channelOptions.includes(entry.channel)) {
      setChannelOptions((prev) => [...prev, entry.channel].slice().sort((a, b) => String(a).localeCompare(String(b))))
    }
    if (entry?.industryType && !industryOptions.includes(entry.industryType)) {
      setIndustryOptions((prev) => [...prev, entry.industryType].slice().sort((a, b) => String(a).localeCompare(String(b))))
    }
    setForm({
      name: entry?.name || '',
      enquiryDate: entry?.enquiryDate ? new Date(entry.enquiryDate).toISOString().split('T')[0] : '',
      email: entry?.email || '',
      company: entry?.company || '',
      contact: entry?.contact || '',
      address: entry?.address || '',
      state: entry?.state || '',
      channel: preferredChannel,
      industryType: entry?.industryType || '',
      interestedProduct: entry?.interestedProduct || '',
      painPoint: entry?.painPoint || '',
      status: entry?.status || 'NEW',
      documentLink: entry?.documentLink || ''
    })
  }, [open, entry, channelOptions])

  const isValidDateInput = (value) => {
    if (!value) return false
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false
    const date = new Date(`${value}T00:00:00`)
    return Number.isFinite(date.getTime())
  }

  const isValidEmail = (value) => {
    if (!value) return true
    const email = String(value).trim()
    if (!email) return true
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  const isValidHttpUrl = (value) => {
    if (!value) return true
    const urlText = String(value).trim()
    if (!urlText) return true
    try {
      const url = new URL(urlText)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  const validatePayload = (payload) => {
    if (!payload.contact) return 'Contact No. is required.'
    if (!payload.enquiryDate) return 'Enquiry Date is required.'
    if (!isValidDateInput(payload.enquiryDate)) return 'Enquiry Date format is invalid.'

    if (!allowedStatuses.has(payload.status)) return 'Status is invalid.'
    if (payload.channel && !allowedChannels.has(payload.channel)) return 'Enquiry Channel is invalid.'
    if (payload.industryType && !allowedIndustries.has(payload.industryType)) return 'Industry Type is invalid.'

    if (!isValidEmail(payload.email)) return 'Email format is invalid.'
    if (!isValidHttpUrl(payload.documentLink)) return 'Documents (Link / Reference) must be a valid http(s) URL.'

    const max255 = [
      ['Company', payload.company],
      ['Contact', payload.contact],
      ['Address', payload.address],
      ['State', payload.state],
      ['Interested Product / Service', payload.interestedProduct]
    ]
    for (const [label, value] of max255) {
      if (value && String(value).length > 255) return `${label} is too long.`
    }

    if (payload.painPoint && String(payload.painPoint).length > 2000) return 'Pain Point / Customer Need is too long.'

    return ''
  }

  const normalizeLookupText = (value) => String(value || '').trim()

  const addLookupValue = async (field) => {
    const value = normalizeLookupText(newLookup[field])
    if (!value) {
      setError(field === 'channel' ? 'Enquiry Channel is required.' : 'Industry Type is required.')
      return
    }

    const list = field === 'channel' ? channelOptions : industryOptions
    const exists = list.some((item) => String(item).toLowerCase() === value.toLowerCase())
    if (exists) {
      setError('This value already exists.')
      return
    }

    setAddingLookup((prev) => ({ ...prev, [field]: true }))
    setError('')
    try {
      const payload = {
        channels: field === 'channel' ? [...channelOptions, value] : channelOptions,
        industryTypes: field === 'industryType' ? [...industryOptions, value] : industryOptions
      }
      const res = await api.put('/system/config/crm-fb-enquiry-lookups', payload)
      const lookups = res.data?.data?.lookups || payload
      const baseChannels = Array.isArray(lookups.channels) && lookups.channels.length ? lookups.channels : payload.channels
      const baseIndustries = Array.isArray(lookups.industryTypes) && lookups.industryTypes.length ? lookups.industryTypes : payload.industryTypes
      const nextChannels = baseChannels.slice().sort((a, b) => String(a).localeCompare(String(b)))
      const nextIndustries = baseIndustries.slice().sort((a, b) => String(a).localeCompare(String(b)))

      setChannelOptions(nextChannels)
      setIndustryOptions(nextIndustries)
      setForm((prev) => ({ ...prev, [field]: value }))
      setNewLookup((prev) => ({ ...prev, [field]: '' }))
      setShowAddLookup((prev) => ({ ...prev, [field]: false }))
    } catch (e) {
      console.error('Failed to add lookup value:', e)
      setError(e.response?.data?.message || 'Unable to add value. Please try again.')
    } finally {
      setAddingLookup((prev) => ({ ...prev, [field]: false }))
    }
  }

  const handleSubmit = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: String(form.name || '').trim() || null,
        enquiryDate: form.enquiryDate,
        email: String(form.email || '').trim() || null,
        company: String(form.company || '').trim() || null,
        contact: String(form.contact || '').trim(),
        address: String(form.address || '').trim() || null,
        state: String(form.state || '').trim() || null,
        channel: String(form.channel || '').trim() || null,
        industryType: String(form.industryType || '').trim() || null,
        interestedProduct: String(form.interestedProduct || '').trim() || null,
        painPoint: String(form.painPoint || '').trim() || null,
        status: form.status,
        documentLink: String(form.documentLink || '').trim() || null
      }

      const validationError = validatePayload(payload)
      if (validationError) {
        setError(validationError)
        setSaving(false)
        return
      }

      if (isEdit) {
        await api.put(`/crm/fb-enquiries/${entry.id}`, payload)
      } else {
        await api.post('/crm/fb-enquiries', payload)
      }
      onSaved?.()
    } catch (e) {
      console.error('Failed to save enquiry entry:', e)
      setError('Unable to save entry. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const modal = (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-[90] modal-uniform p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Enquiry' : 'Add New Enquiry'}</h3>
              <p className="text-xs text-gray-600 mt-1">FB Enquiry Register</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-2 transition-colors">
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
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Contact No.</label>
              <TextInput value={form.contact} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Enquirer Name (Optional)</label>
              <TextInput value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Email (Optional)</label>
              <TextInput type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Company (Optional)</label>
              <TextInput value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Address</label>
              <TextInput value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">State</label>
              <TextInput value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-gray-900">Enquiry Channel</label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setError('')
                    setShowAddLookup((prev) => ({ ...prev, channel: !prev.channel }))
                    setNewLookup((prev) => ({ ...prev, channel: '' }))
                  }}
                >
                  +
                </Button>
              </div>
              <SelectField value={form.channel} onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}>
                {channelOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </SelectField>
              {showAddLookup.channel && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TextInput
                    value={newLookup.channel}
                    placeholder="Add new channel..."
                    onChange={(e) => setNewLookup((prev) => ({ ...prev, channel: e.target.value }))}
                  />
                  <Button size="sm" onClick={() => addLookupValue('channel')} loading={addingLookup.channel} loadingText="Adding...">
                    Save
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAddLookup((prev) => ({ ...prev, channel: false }))
                      setNewLookup((prev) => ({ ...prev, channel: '' }))
                    }}
                    disabled={addingLookup.channel}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-gray-900">Industry Type</label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setError('')
                    setShowAddLookup((prev) => ({ ...prev, industryType: !prev.industryType }))
                    setNewLookup((prev) => ({ ...prev, industryType: '' }))
                  }}
                >
                  +
                </Button>
              </div>
              <SelectField value={form.industryType} onChange={(e) => setForm((p) => ({ ...p, industryType: e.target.value }))}>
                <option value="">Select industry...</option>
                {industryOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </SelectField>
              {showAddLookup.industryType && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TextInput
                    value={newLookup.industryType}
                    placeholder="Add new industry..."
                    onChange={(e) => setNewLookup((prev) => ({ ...prev, industryType: e.target.value }))}
                  />
                  <Button size="sm" onClick={() => addLookupValue('industryType')} loading={addingLookup.industryType} loadingText="Adding...">
                    Save
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAddLookup((prev) => ({ ...prev, industryType: false }))
                      setNewLookup((prev) => ({ ...prev, industryType: '' }))
                    }}
                    disabled={addingLookup.industryType}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Enquiry Date</label>
              <TextInput type="date" value={form.enquiryDate} onChange={(e) => setForm((p) => ({ ...p, enquiryDate: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Interested Product / Service</label>
              <TextInput value={form.interestedProduct} onChange={(e) => setForm((p) => ({ ...p, interestedProduct: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Pain Point / Customer Need</label>
              <TextArea rows={3} value={form.painPoint} onChange={(e) => setForm((p) => ({ ...p, painPoint: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Status</label>
              <SelectField value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SelectField>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Documents (Link / Reference)</label>
              <TextInput value={form.documentLink} onChange={(e) => setForm((p) => ({ ...p, documentLink: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 sticky bottom-0 flex justify-end gap-3">
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
