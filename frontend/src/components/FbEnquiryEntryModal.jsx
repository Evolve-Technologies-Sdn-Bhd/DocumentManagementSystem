import React, { useEffect, useMemo, useState } from 'react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from './ui/Modal'
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
  const [activeLookupModal, setActiveLookupModal] = useState(null)
  const [newLookup, setNewLookup] = useState({ channel: '', industryType: '' })
  const [addLookupError, setAddLookupError] = useState('')
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
      setAddLookupError(field === 'channel' ? 'Enquiry Channel is required.' : 'Industry Type is required.')
      return
    }

    const list = field === 'channel' ? channelOptions : industryOptions
    if (list.some((item) => String(item).toLowerCase() === value.toLowerCase())) {
      setAddLookupError('This value already exists.')
      return
    }

    setAddingLookup((prev) => ({ ...prev, [field]: true }))
    setAddLookupError('')

    try {
      const payload = {
        channels: field === 'channel' ? [...channelOptions, value] : channelOptions,
        industryTypes: field === 'industryType' ? [...industryOptions, value] : industryOptions
      }

      const res = await api.put('/system/config/crm-fb-enquiry-lookups', payload)
      const lookups = res.data?.data?.lookups || payload
      const baseChannels = Array.isArray(lookups.channels) && lookups.channels.length ? lookups.channels : payload.channels
      const baseIndustries = Array.isArray(lookups.industryTypes) && lookups.industryTypes.length ? lookups.industryTypes : payload.industryTypes

      setChannelOptions(baseChannels.slice().sort((a, b) => String(a).localeCompare(String(b))))
      setIndustryOptions(baseIndustries.slice().sort((a, b) => String(a).localeCompare(String(b))))
      setForm((prev) => ({ ...prev, [field]: value }))
      setNewLookup((prev) => ({ ...prev, [field]: '' }))
      setActiveLookupModal(null)
      setAddLookupError('')
    } catch (e) {
      console.error('Failed to add lookup value:', e)
      setAddLookupError(e.response?.data?.message || 'Unable to add value. Please try again.')
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
    <>
    <Modal isOpen size="xl" onClose={onClose}>
        <ModalHeader
          title={isEdit ? 'Edit Enquiry' : 'Add New Enquiry'}
          subtitle="FB Enquiry Register"
          onClose={onClose}
        />

        <ModalBody className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
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
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-900">Address</label>
              <TextInput value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">State</label>
              <TextInput value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Enquiry Channel</label>
              <div className="flex items-center gap-2">
                <SelectField
                  className="h-[38px] min-w-0 flex-1 cursor-pointer shadow-sm"
                  value={form.channel}
                  onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}
                >
                  {channelOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </SelectField>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-[38px] w-[38px] shrink-0 px-0 text-lg"
                  aria-label="Add enquiry channel"
                  onClick={() => {
                    setAddLookupError('')
                    setNewLookup((prev) => ({ ...prev, channel: '' }))
                    setActiveLookupModal('channel')
                  }}
                >
                  +
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Industry Type</label>
              <div className="flex items-center gap-2">
                <SelectField
                  className="h-[38px] min-w-0 flex-1 cursor-pointer shadow-sm"
                  value={form.industryType}
                  onChange={(e) => setForm((p) => ({ ...p, industryType: e.target.value }))}
                >
                  <option value="">Select industry...</option>
                  {industryOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </SelectField>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-[38px] w-[38px] shrink-0 px-0 text-lg"
                  aria-label="Add industry type"
                  onClick={() => {
                    setAddLookupError('')
                    setNewLookup((prev) => ({ ...prev, industryType: '' }))
                    setActiveLookupModal('industryType')
                  }}
                >
                  +
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Enquiry Date</label>
              <TextInput type="date" value={form.enquiryDate} onChange={(e) => setForm((p) => ({ ...p, enquiryDate: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Interested Product / Service</label>
              <TextInput value={form.interestedProduct} onChange={(e) => setForm((p) => ({ ...p, interestedProduct: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-900">Pain Point / Customer Need</label>
              <TextArea rows={3} value={form.painPoint} onChange={(e) => setForm((p) => ({ ...p, painPoint: e.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900">Status</label>
              <SelectField className="h-[38px] cursor-pointer shadow-sm" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-900">Documents (Link / Reference)</label>
              <TextInput value={form.documentLink} onChange={(e) => setForm((p) => ({ ...p, documentLink: e.target.value }))} />
            </div>
          </div>
        </ModalBody>

<ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving} loadingText="Saving...">
            Save Entry
          </Button>
        </ModalFooter>
    </Modal>

    {activeLookupModal && (
      <Modal
        isOpen
        size="sm"
        onClose={() => {
          if (addingLookup[activeLookupModal]) return
          setActiveLookupModal(null)
          setAddLookupError('')
        }}
      >
        <ModalHeader
          title={activeLookupModal === 'channel' ? 'Add Enquiry Channel' : 'Add Industry Type'}
          subtitle="FB Enquiry Register"
          onClose={() => {
            if (addingLookup[activeLookupModal]) return
            setActiveLookupModal(null)
            setAddLookupError('')
          }}
        />
        <ModalBody className="space-y-4">
          {addLookupError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {addLookupError}
            </div>
          )}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-900">
              {activeLookupModal === 'channel' ? 'Enquiry Channel Name' : 'Industry Type Name'}
            </label>
            <TextInput
              autoFocus
              value={newLookup[activeLookupModal]}
              placeholder={activeLookupModal === 'channel' ? 'Enter enquiry channel...' : 'Enter industry type...'}
              onChange={(e) => {
                setNewLookup((prev) => ({ ...prev, [activeLookupModal]: e.target.value }))
                setAddLookupError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addLookupValue(activeLookupModal)
              }}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setActiveLookupModal(null)
              setAddLookupError('')
            }}
            disabled={addingLookup[activeLookupModal]}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => addLookupValue(activeLookupModal)}
            loading={addingLookup[activeLookupModal]}
            loadingText="Saving..."
          >
            Save
          </Button>
        </ModalFooter>
      </Modal>
    )}
    </>
  )

  return modal
}
