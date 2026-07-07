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
  const toneClass = {
    default: 'text-ink',
    success: 'text-[var(--dms-color-success-ink)]',
    warning: 'text-[var(--dms-color-warning-ink)]',
    danger: 'text-[var(--dms-color-danger-ink)]',
    info: 'text-[var(--dms-color-info-ink)]'
  }[tone] || 'text-ink'

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

function ExpiryEditModal({ open, profile, globalSettings, onClose, onSubmit, saving }) {
  const [useGlobalRule, setUseGlobalRule] = useState(false)
  const [form, setForm] = useState({
    startDate: '',
    expiryDate: '',
    remarks: '',
    expiringSoonDays: 60,
    reminder1Days: 90,
    reminder2Days: 60,
    reminder3Days: 30,
    reminder4Days: 7
  })

  useEffect(() => {
    if (!profile || !open) return
    setUseGlobalRule(false)
    setForm({
      startDate: toDateInputValue(profile.startDate),
      expiryDate: toDateInputValue(profile.expiryDate),
      remarks: profile.remarks || '',
      expiringSoonDays: profile.expiringSoonDays ?? 60,
      reminder1Days: profile.reminderRule?.reminder1Days ?? 90,
      reminder2Days: profile.reminderRule?.reminder2Days ?? 60,
      reminder3Days: profile.reminderRule?.reminder3Days ?? 30,
      reminder4Days: profile.reminderRule?.reminder4Days ?? 7
    })
  }, [profile, open])

  if (!open || !profile) return null

  return (
    <Modal onClose={onClose} closeOnBackdrop size="md">
      <ModalHeader
        title="Update Expiry Profile"
        subtitle={profile.document ? `${profile.document.fileCode} - ${profile.document.title}` : ''}
        onClose={onClose}
      />
      <form onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ ...form, useGlobalRule })
      }}>
        <ModalBody>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Document Name">
              <TextInput value={profile.document?.title || ''} readOnly className="bg-surface-muted text-ink-muted" />
            </Field>
            <Field label="Document Type">
              <TextInput value={profile.document?.documentType || ''} readOnly className="bg-surface-muted text-ink-muted" />
            </Field>
            <Field label="Owner">
              <TextInput value={profile.document?.ownerName || '-'} readOnly className="bg-surface-muted text-ink-muted" />
            </Field>
            <Field label="Department">
              <TextInput value={profile.department || '-'} readOnly className="bg-surface-muted text-ink-muted" />
            </Field>
            <Field label="Start Date">
              <TextInput type="date" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} required />
            </Field>
            <Field label="Expiry Date">
              <TextInput type="date" value={form.expiryDate} onChange={(e) => setForm((prev) => ({ ...prev, expiryDate: e.target.value }))} required />
            </Field>
            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
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
                  className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                />
                Use Global Defaults
              </label>
            </div>
            <Field label="Expiring Soon Days" hint="Document status switches to Expiring Soon based on this threshold.">
              <TextInput type="number" min="0" value={form.expiringSoonDays} onChange={(e) => setForm((prev) => ({ ...prev, expiringSoonDays: e.target.value }))} required disabled={useGlobalRule} />
            </Field>
            <Field label="Reminder 1">
              <TextInput type="number" min="0" value={form.reminder1Days} onChange={(e) => setForm((prev) => ({ ...prev, reminder1Days: e.target.value }))} required disabled={useGlobalRule} />
            </Field>
            <Field label="Reminder 2">
              <TextInput type="number" min="0" value={form.reminder2Days} onChange={(e) => setForm((prev) => ({ ...prev, reminder2Days: e.target.value }))} required disabled={useGlobalRule} />
            </Field>
            <Field label="Reminder 3">
              <TextInput type="number" min="0" value={form.reminder3Days} onChange={(e) => setForm((prev) => ({ ...prev, reminder3Days: e.target.value }))} required disabled={useGlobalRule} />
            </Field>
            <Field label="Reminder 4">
              <TextInput type="number" min="0" value={form.reminder4Days} onChange={(e) => setForm((prev) => ({ ...prev, reminder4Days: e.target.value }))} required disabled={useGlobalRule} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Remarks">
                <TextArea rows={4} value={form.remarks} onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))} />
              </Field>
            </div>
          </div>
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
    file: null
  })

  useEffect(() => {
    if (!profile || !open) return
    setForm({
      startDate: toDateInputValue(new Date()),
      newExpiryDate: '',
      remarks: '',
      file: null
    })
  }, [profile, open])

  if (!open || !profile) return null

  return (
    <Modal onClose={onClose} closeOnBackdrop size="md">
      <ModalHeader
        title="Complete Renewal"
        subtitle={profile.document ? `${profile.document.fileCode} - ${profile.document.title}` : ''}
        onClose={onClose}
      />
      <form onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}>
        <ModalBody>
          <div className="space-y-4">
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
            </div>
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

function DetailModal({ open, profile, onClose, canEdit, onManageWatchers }) {
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
              <div className="flex flex-wrap gap-2"><ExpiryStatusBadge status={profile.expiryStatus} /><RenewalStatusBadge status={profile.renewalStatus} /></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Remarks</p><p className="mt-1 text-sm text-ink">{profile.remarks || '-'}</p></div>
            </div>
          </AppSurface>
        </div>
        <AppSurface padding="lg" variant="panel" className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">Reminder Rules</h3>
          <div className="grid gap-3 md:grid-cols-5">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Expiring Soon</p><p className="mt-1 text-sm text-ink">{profile.expiringSoonDays ?? '-'} day(s)</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Reminder 1</p><p className="mt-1 text-sm text-ink">{profile.reminderRule?.reminder1Days ?? '-'} day(s)</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Reminder 2</p><p className="mt-1 text-sm text-ink">{profile.reminderRule?.reminder2Days ?? '-'} day(s)</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Reminder 3</p><p className="mt-1 text-sm text-ink">{profile.reminderRule?.reminder3Days ?? '-'} day(s)</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Reminder 4</p><p className="mt-1 text-sm text-ink">{profile.reminderRule?.reminder4Days ?? '-'} day(s)</p></div>
          </div>
        </AppSurface>
        <AppSurface padding="lg" variant="panel" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Subscribers</h3>
            {canEdit ? <Button type="button" variant="secondary" onClick={onManageWatchers}>Manage</Button> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Owner</p>
              <p className="mt-1 text-sm text-ink">{profile.document?.ownerName || '-'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Watchers</p>
              {Array.isArray(profile.watchers) && profile.watchers.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {profile.watchers.map((w) => (
                    <p key={w.id} className="text-sm text-ink">
                      {`${w.firstName || ''} ${w.lastName || ''}`.trim() || w.email || '-'}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-ink">-</p>
              )}
            </div>
          </div>
        </AppSurface>
        <AppSurface padding="lg" variant="panel">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Renewal History</h3>
            <span className="text-xs text-ink-soft">{profile.renewalHistory?.length || 0} record(s)</span>
          </div>
          <TableContainer>
            <Table>
              <thead>
                <tr>
                  <Th>From Version</Th>
                  <Th>To Version</Th>
                  <Th>Previous Expiry</Th>
                  <Th>New Expiry</Th>
                  <Th>Renewed At</Th>
                  <Th>Remarks</Th>
                </tr>
              </thead>
              <tbody>
                {(profile.renewalHistory || []).length === 0 ? (
                  <Tr>
                    <Td colSpan={6} className="py-8 text-center text-sm text-ink-muted">No renewal history yet.</Td>
                  </Tr>
                ) : (
                  (profile.renewalHistory || []).map((entry) => (
                    <Tr key={entry.id}>
                      <Td>{entry.fromVersion || '-'}</Td>
                      <Td>{entry.toVersion || '-'}</Td>
                      <Td>{formatDate(entry.previousExpiryDate)}</Td>
                      <Td>{formatDate(entry.newExpiryDate)}</Td>
                      <Td>{formatDate(entry.renewedAt)}</Td>
                      <Td>{entry.remarks || '-'}</Td>
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

function WatchersModal({ open, profile, users, onClose, onSave, saving }) {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])

  useEffect(() => {
    if (!open || !profile) return
    setSearch('')
    setSelectedIds(Array.isArray(profile.watchers) ? profile.watchers.map((u) => u.id) : [])
  }, [open, profile])

  if (!open || !profile) return null

  const ownerId = profile.document?.ownerId || null
  const normalizedUsers = Array.isArray(users) ? users : []
  const activeUsers = normalizedUsers.filter((u) => String(u.status || '').toUpperCase() === 'ACTIVE')
  const keyword = String(search || '').trim().toLowerCase()
  const filteredUsers = keyword
    ? activeUsers.filter((u) => {
        const name = `${u.firstName || ''} ${u.lastName || ''}`.trim().toLowerCase()
        const email = String(u.email || '').toLowerCase()
        const dept = String(u.department || '').toLowerCase()
        return name.includes(keyword) || email.includes(keyword) || dept.includes(keyword)
      })
    : activeUsers

  const selectedSet = new Set(selectedIds)

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const set = new Set(prev)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return Array.from(set)
    })
  }

  return (
    <Modal onClose={onClose} closeOnBackdrop size="lg">
      <ModalHeader
        title="Manage Subscribers"
        subtitle={profile.document ? `${profile.document.fileCode} - ${profile.document.title}` : ''}
        onClose={onClose}
      />
      <ModalBody className="space-y-4">
        <AppSurface padding="lg" variant="panel" className="space-y-4">
          <p className="text-sm text-ink-muted">Owner will always receive expiry notifications. Watchers will also receive reminders based on expiry tracking configuration.</p>
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name, email, or department"
          />
        </AppSurface>
        <TableContainer>
          <Table>
            <thead>
              <tr>
                <Th className="w-16">Select</Th>
                <Th>User</Th>
                <Th>Email</Th>
                <Th>Department</Th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <Tr>
                  <Td colSpan={4} className="py-8 text-center text-sm text-ink-muted">No users found.</Td>
                </Tr>
              ) : (
                filteredUsers.map((u) => {
                  const isOwner = ownerId && u.id === ownerId
                  const label = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || '-'
                  return (
                    <Tr key={u.id}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={isOwner ? true : selectedSet.has(u.id)}
                          disabled={isOwner}
                          onChange={() => toggle(u.id)}
                          className="h-4 w-4"
                        />
                      </Td>
                      <Td className="font-medium text-ink">{isOwner ? `${label} (Owner)` : label}</Td>
                      <Td className="text-ink-muted">{u.email || '-'}</Td>
                      <Td className="text-ink-muted">{u.department || '-'}</Td>
                    </Tr>
                  )
                })
              )}
            </tbody>
          </Table>
        </TableContainer>
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="button" onClick={() => onSave(selectedIds)} disabled={saving}>{saving ? 'Saving...' : 'Save Subscribers'}</Button>
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
  const [watchersOpen, setWatchersOpen] = useState(false)
  const [saving, setSaving] = useState(false)

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
        remarks: form.remarks
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

  const handleStartRenewal = async (record) => {
    try {
      await api.post(`/expiry-tracking/${record.documentId}/renew/start`, {})
      refresh()
    } catch (error) {
      console.error('Failed to start renewal:', error)
      alert(error.response?.data?.message || 'Failed to start renewal')
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

  const openManageWatchers = () => {
    if (!selectedProfile) return
    setWatchersOpen(true)
  }

  const handleSaveWatchers = async (watcherIds) => {
    if (!selectedProfile) return
    setSaving(true)
    try {
      const res = await api.put(`/expiry-tracking/${selectedProfile.documentId}/watchers`, { watcherIds })
      setSelectedProfile(res.data?.data?.profile || null)
      setWatchersOpen(false)
      refresh()
    } catch (error) {
      console.error('Failed to update watchers:', error)
      alert(error.response?.data?.message || 'Failed to update subscribers')
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expiry Tracking Management"
        subtitle="Track enrolled documents, expiry status, and renewal progress without duplicating document metadata."
        actions={
          <>
            <Button variant="secondary" onClick={refresh}>Refresh</Button>
            {canExport ? <Button variant="secondary" onClick={exportExcel}>Export Excel</Button> : null}
            {canExport ? <Button onClick={exportPdf}>Export PDF</Button> : null}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Total Tracked Documents" value={dashboard.totalTrackedDocuments} />
        <StatCard label="Active" value={dashboard.active} tone="success" />
        <StatCard label="Expiring Soon" value={dashboard.expiringSoon} tone="warning" />
        <StatCard label="Expiring Today" value={dashboard.expiringToday} tone="info" />
        <StatCard label="Expired" value={dashboard.expired} tone="danger" />
        <StatCard label="Renewal In Progress" value={dashboard.renewalInProgress} tone="info" />
      </div>

      <AppSurface padding="lg" variant="panel" className="space-y-4">
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

      <AppSurface padding="none" variant="panel">
        {loading ? (
          <div className="flex items-center justify-center px-6 py-16">
            <InlineSpinner label="Loading expiry tracking records..." />
          </div>
        ) : (
          <>
            <TableContainer>
              <Table>
                <thead>
                  <tr>
                    <Th>Document Name</Th>
                    <Th>Type</Th>
                    <Th>Owner</Th>
                    <Th>Start Date</Th>
                    <Th>Expiry Date</Th>
                    <Th>Days Left</Th>
                    <Th>Expiry Status</Th>
                    <Th>Renewal Status</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <Tr>
                      <Td colSpan={9} className="py-10 text-center text-sm text-ink-muted">No tracked documents found for the selected filters.</Td>
                    </Tr>
                  ) : (
                    records.map((record) => (
                      <Tr key={record.id}>
                        <Td>
                          <div className="space-y-1">
                            <p className="font-semibold text-ink">{record.document?.title || '-'}</p>
                            <p className="text-xs text-ink-soft">{record.document?.fileCode || '-'}</p>
                          </div>
                        </Td>
                        <Td>{record.document?.documentType || '-'}</Td>
                        <Td>{record.document?.ownerName || '-'}</Td>
                        <Td>{formatDate(record.startDate)}</Td>
                        <Td>{formatDate(record.expiryDate)}</Td>
                        <Td>{record.daysLeft ?? '-'}</Td>
                        <Td><ExpiryStatusBadge status={record.expiryStatus} /></Td>
                        <Td><RenewalStatusBadge status={record.renewalStatus} /></Td>
                        <Td>
                          <div className="flex justify-end">
                            <ActionMenu
                              actions={[
                                { label: 'View', onClick: () => openProfileDetail(record) },
                                ...(canEdit ? [{ label: 'Update', onClick: () => openEdit(record) }] : []),
                                ...(canRenew && record.document?.allowRenewal
                                  ? [
                                      { label: 'Start Renewal', onClick: () => handleStartRenewal(record) },
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
                        </Td>
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

      <DetailModal open={detailOpen} profile={selectedProfile} canEdit={canEdit} onManageWatchers={openManageWatchers} onClose={() => {
        setDetailOpen(false)
        setSelectedProfile(null)
      }} />

      <WatchersModal open={watchersOpen} profile={selectedProfile} users={owners} saving={saving} onSave={handleSaveWatchers} onClose={() => setWatchersOpen(false)} />

      <ExpiryEditModal open={editOpen} profile={selectedProfile} globalSettings={globalExpirySettings} onClose={() => {
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
