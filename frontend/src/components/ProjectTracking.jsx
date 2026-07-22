import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Timeline from '@mui/lab/Timeline'
import TimelineConnector from '@mui/lab/TimelineConnector'
import TimelineContent from '@mui/lab/TimelineContent'
import TimelineDot from '@mui/lab/TimelineDot'
import TimelineItem, { timelineItemClasses } from '@mui/lab/TimelineItem'
import TimelineSeparator from '@mui/lab/TimelineSeparator'
import api from '../api/axios'
import Pagination from './Pagination'
import EmptyState from './EmptyState'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import ShareDocumentModal from './ShareDocumentModal'
import { hasPermission } from '../utils/permissions'
import { usePreferences } from '../contexts/PreferencesContext'
import PageHeader from './ui/PageHeader'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import SelectField from './ui/SelectField'
import InlineSpinner from './ui/InlineSpinner'
import EmptyPanelState from './ui/EmptyPanelState'
import FolderTreePicker from './ui/FolderTreePicker'
import SectionHeader from './ui/SectionHeader'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import { TableContainer, Table, Th, Td, Tr } from './ui/Table'
import IconButton from './ui/IconButton'

function ItemStatusBadge({ status }) {
  const s = String(status || '').toUpperCase()
  const base = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'
  if (s === 'COMPLETE') return <span className={`${base} bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]`}>Complete</span>
  if (s === 'WAIVED') return <span className={`${base} bg-surface-muted text-ink-secondary`}>Waived</span>
  return <span className={`${base} bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]`}>Pending</span>
}

function ModalShell({ title, children, onClose, maxWidthClass = 'max-w-xl' }) {
  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4">
      <div className={`w-full rounded-dms-lg border border-border bg-surface shadow-dms-lg ${maxWidthClass}`}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          <IconButton size="sm" onClick={onClose} aria-label="Close">
            <span className="text-lg leading-none">×</span>
          </IconButton>
        </div>
        <div className="max-h-[85vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

function formatPersonLabel(user) {
  if (!user) return '-'
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim()
  return name || user.email || '-'
}

function AssignRequiredDocumentPicModal({
  requirement,
  loading,
  query,
  onQueryChange,
  onSearch,
  searching,
  userResults,
  selectedUser,
  onSelectUser,
  onClose,
  onSave,
  onUnassign
}) {
  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title="Assign PIC" subtitle={requirement?.documentType?.name || 'Required Document'} onClose={onClose} />
      <ModalBody className="space-y-4">
        <div className="rounded-dms border border-border bg-surface-muted p-3">
          <div className="text-xs text-ink-muted">Document Type</div>
          <div className="mt-1 text-sm font-medium text-ink">{requirement?.documentType?.name || '-'}</div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium text-ink">Search user</div>
          <div className="flex gap-2">
            <TextInput value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Type name or email" />
            <Button type="button" variant="secondary" onClick={onSearch} disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </Button>
          </div>
          {userResults.length > 0 ? (
            <div className="max-h-56 overflow-auto rounded-dms border border-border bg-surface">
              {userResults.map((user) => {
                const isSelected = String(selectedUser?.id || '') === String(user.id)
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => onSelectUser(user)}
                    className={[
                      'w-full px-3 py-2 text-left text-sm transition-colors',
                      isSelected ? 'bg-brand/10 text-brand' : 'hover:bg-surface-muted'
                    ].join(' ')}
                  >
                    {formatPersonLabel(user)}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
        <div className="rounded-dms border border-border bg-surface-muted p-3">
          <div className="text-xs text-ink-muted">Selected PIC</div>
          <div className="mt-1 text-sm font-medium text-ink">{formatPersonLabel(selectedUser)}</div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onUnassign} disabled={loading}>
          Unassign
        </Button>
        <Button onClick={onSave} disabled={loading || !selectedUser?.id}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function SearchableSelectField({
  values = [],
  options,
  onChange,
  searchValue,
  onSearchChange,
  placeholder = 'Select option',
  noResultsLabel = 'No results found'
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const selectedValues = Array.isArray(values) ? values.map((value) => String(value)) : []
  const selectedOptions = options.filter((option) => selectedValues.includes(String(option.id)))

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex min-h-[42px] w-full items-center justify-between rounded-2xl border border-border bg-surface px-3 py-2 text-left text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-brand/30 ${
          open ? 'ring-2 ring-brand/20' : ''
        }`}
      >
        <span className={selectedOptions.length > 0 ? 'text-ink' : 'text-ink-muted'}>
          {selectedOptions.length === 0
            ? placeholder
            : selectedOptions.length === 1
              ? selectedOptions[0].name
              : `${selectedOptions.length} document types selected`}
        </span>
        <span className="ml-3 text-xs text-ink-muted">{open ? '▲' : '▼'}</span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-border bg-surface shadow-dms-lg">
          <div className="border-b border-border p-3">
            <input
              ref={inputRef}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search document type..."
              className="h-10 w-full rounded-2xl border border-border bg-surface px-3 text-sm text-ink outline-none transition-shadow placeholder:text-ink-soft focus-visible:ring-2 focus-visible:ring-brand/30"
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-ink-muted">
              <span>{options.length} result{options.length === 1 ? '' : 's'}</span>
              {searchValue ? (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="rounded-lg px-2 py-1 font-medium transition hover:bg-surface-muted hover:text-ink"
                >
                  Clear
                </button>
              ) : (
                <span>Type to filter</span>
              )}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {options.length > 0 ? (
              options.map((option) => {
                const isSelected = selectedValues.includes(String(option.id))
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      const nextValues = isSelected
                        ? selectedValues.filter((value) => value !== String(option.id))
                        : [...selectedValues, String(option.id)]
                      onChange(nextValues)
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                      isSelected ? 'bg-[var(--dms-color-info-soft)] text-ink' : 'text-ink hover:bg-surface-muted'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${isSelected ? 'border-brand bg-brand text-white' : 'border-border bg-surface'}`}>
                        {isSelected ? '✓' : ''}
                      </span>
                      <span>{option.name}</span>
                    </span>
                    {isSelected ? <span className="text-xs font-medium text-brand">Selected</span> : null}
                  </button>
                )
              })
            ) : (
              <div className="rounded-xl px-3 py-4 text-sm text-ink-muted">{noResultsLabel}</div>
            )}
          </div>
          <div className="border-t border-border px-3 py-2 text-[11px] text-ink-muted">
            {selectedOptions.length > 0
              ? `${selectedOptions.length} document type${selectedOptions.length === 1 ? '' : 's'} selected`
              : 'Select one or more document types'}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function getPhaseTitle(phase, fallback = 'Project Phase') {
  if (!phase) return fallback
  const prefix = phase.iterationNo ? `Phase ${phase.iterationNo}` : 'Phase'
  return phase.name ? `${prefix} - ${phase.name}` : prefix
}

const formatLifecycleStatus = (status) => {
  const normalized = String(status || 'ACTIVE')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  return normalized || 'Active'
}

const formatDateLabel = (value) => {
  const iso = toDateInputValue(value)
  if (!iso) return '-'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

const toDateInputValue = (value) => {
  if (!value) return ''
  const raw = String(value)
  const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (directMatch) return directMatch[1]

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function ProjectField({ label, children, fullWidth = false }) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <label className="mb-1 block text-sm font-medium text-ink-secondary">{label}</label>
      {children}
    </div>
  )
}

function ProjectFormFields({
  form,
  setForm,
  users,
  showCategory = false,
  projectCategories = [],
  stageStatusLabel = 'Will follow workflow stage after creation',
  showLifecycleStatus = false
}) {
  const inputClass = 'w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-brand/30'

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ProjectField label="Project Code / Reference Number">
        <input
          value={form.code}
          onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
          className={inputClass}
          required
        />
      </ProjectField>

      <ProjectField label="Project Name">
        <input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          className={inputClass}
          required
        />
      </ProjectField>

      <ProjectField label="Client Name">
        <input
          value={form.clientName}
          onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))}
          className={inputClass}
        />
      </ProjectField>

      <ProjectField label="Client PIC">
        <input
          value={form.clientPic}
          onChange={(e) => setForm((p) => ({ ...p, clientPic: e.target.value }))}
          className={inputClass}
        />
      </ProjectField>

      {showCategory && (
        <ProjectField label="Project Category">
          <select
            value={form.projectCategoryId}
            onChange={(e) => setForm((p) => ({ ...p, projectCategoryId: e.target.value }))}
            className={inputClass}
            required
          >
            <option value="">Select</option>
            {projectCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </ProjectField>
      )}

      <ProjectField label="Internal Project Manager">
        <select
          value={form.managerId}
          onChange={(e) => setForm((p) => ({ ...p, managerId: e.target.value }))}
          className={inputClass}
          required
        >
          <option value="">Select</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}
            </option>
          ))}
        </select>
      </ProjectField>

      <ProjectField label="Project Start Date">
        <input
          type="date"
          value={form.startDate}
          onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
          className={inputClass}
        />
      </ProjectField>

      <ProjectField label="Planned Completion Date">
        <input
          type="date"
          value={form.plannedCompletionDate}
          onChange={(e) => setForm((p) => ({ ...p, plannedCompletionDate: e.target.value }))}
          className={inputClass}
        />
      </ProjectField>

      <ProjectField label="Actual Completion Date">
        <input
          type="date"
          value={form.actualCompletionDate}
          onChange={(e) => setForm((p) => ({ ...p, actualCompletionDate: e.target.value }))}
          className={inputClass}
        />
      </ProjectField>

      <ProjectField label="Project Status (based on stage)">
        <input value={stageStatusLabel} className={`${inputClass} bg-surface-muted text-ink-muted`} readOnly />
      </ProjectField>

      {showLifecycleStatus && (
        <ProjectField label="Lifecycle Status">
          <input value={formatLifecycleStatus(form.status)} className={`${inputClass} bg-surface-muted text-ink-muted`} readOnly />
        </ProjectField>
      )}

      <ProjectField label="Project Team Members" fullWidth>
        <textarea
          value={form.teamMembers}
          onChange={(e) => setForm((p) => ({ ...p, teamMembers: e.target.value }))}
          className={inputClass}
          rows={3}
          placeholder="List names, departments, or roles"
        />
      </ProjectField>

      <ProjectField label="Project Scope" fullWidth>
        <textarea
          value={form.scope}
          onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value }))}
          className={inputClass}
          rows={3}
        />
      </ProjectField>

      <ProjectField label="Project Objective" fullWidth>
        <textarea
          value={form.objective}
          onChange={(e) => setForm((p) => ({ ...p, objective: e.target.value }))}
          className={inputClass}
          rows={3}
        />
      </ProjectField>

      <ProjectField label="Deliverables" fullWidth>
        <textarea
          value={form.deliverables}
          onChange={(e) => setForm((p) => ({ ...p, deliverables: e.target.value }))}
          className={inputClass}
          rows={3}
        />
      </ProjectField>
    </div>
  )
}

function DocumentStatusBadge({ status }) {
  const s = String(status || '').toUpperCase()
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium'
  if (s === 'PUBLISHED') return <span className={`${base} bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]`}>Published</span>
  if (s === 'PENDING_REVIEW' || s === 'IN_REVIEW') return <span className={`${base} bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]`}>In Review</span>
  if (s === 'SUPERSEDED' || s === 'OBSOLETE') return <span className={`${base} bg-surface-muted text-ink-secondary`}>{s === 'SUPERSEDED' ? 'Superseded' : 'Obsolete'}</span>
  return <span className={`${base} bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]`}>Draft</span>
}

function ConfidentialBadge({ isConfidential }) {
  if (!isConfidential) return null
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]">Confidential</span>
}

function ProjectStatusBadge({ status }) {
  const value = String(status || 'ACTIVE').toUpperCase()
  const config =
    value === 'CLOSED'
      ? { label: 'Closed', className: 'bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]' }
      : value === 'ON_HOLD'
        ? { label: 'On Hold', className: 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]' }
        : value === 'ARCHIVED'
          ? { label: 'Archived', className: 'bg-surface-muted text-ink-secondary' }
          : { label: 'Active', className: 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]' }

  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${config.className}`}>{config.label}</span>
}

function getDocumentCodeLabel(document) {
  return document?.fileCode || 'Draft document'
}

function getDocumentTitleLabel(document) {
  return document?.title || 'Untitled document'
}

function buildStageDocumentGroups(items = [], stageLinks = []) {
  const grouped = new Map()

  const upsertEntry = (stageId, entry) => {
    if (stageId == null || !entry?.document?.id) return

    if (!grouped.has(stageId)) grouped.set(stageId, new Map())
    const stageMap = grouped.get(stageId)
    const existing = stageMap.get(entry.document.id)

    if (!existing) {
      stageMap.set(entry.document.id, entry)
      return
    }

    const existingTime = new Date(existing.linkedAt || 0).getTime()
    const nextTime = new Date(entry.linkedAt || 0).getTime()

    if (nextTime >= existingTime) {
      stageMap.set(entry.document.id, entry)
    }
  }

  items.forEach((item) => {
    ;(item.links || []).forEach((link) => {
      if (!link?.document?.id) return

      upsertEntry(item.stageId, {
        id: `item-${link.id}`,
        document: link.document,
        source: 'Required Checklist',
        documentTypeName: item.documentType?.name || link.document?.documentType?.name || 'Required Document',
        itemStatus: item.status,
        linkedAt: link.linkedAt || link.document.updatedAt
      })
    })
  })

  stageLinks.forEach((link) => {
    if (!link?.document?.id) return

    upsertEntry(link.stageId, {
      id: `stage-${link.id}`,
      document: link.document,
      source: 'Other Documents',
      documentTypeName: link.document?.documentType?.name || 'Other Document',
      itemStatus: null,
      linkedAt: link.linkedAt || link.document.updatedAt
    })
  })

  const normalized = new Map()
  grouped.forEach((docs, stageId) => {
    normalized.set(
      stageId,
      Array.from(docs.values()).sort((a, b) => new Date(b.linkedAt || 0).getTime() - new Date(a.linkedAt || 0).getTime())
    )
  })

  return normalized
}

function DocumentAccessModal({ document, onClose, onSaved, onError }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isConfidential, setIsConfidential] = useState(Boolean(document?.isConfidential))
  const [accessEntries, setAccessEntries] = useState([])
  const [accessQuery, setAccessQuery] = useState('')
  const [subjectResults, setSubjectResults] = useState({ users: [], roles: [] })
  const [loadingSubjects, setLoadingSubjects] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      try {
        const res = await api.get(`/documents/${document.id}/confidential-access`)
        if (!mounted) return
        const payload = res?.data?.data || {}
        setIsConfidential(Boolean(payload?.document?.isConfidential))
        setAccessEntries(
          (payload?.entries || [])
            .map((e) => {
              if (e.user) {
                return {
                  subjectType: 'USER',
                  subjectId: e.user.id,
                  label: `${`${e.user.firstName || ''} ${e.user.lastName || ''}`.trim() || e.user.email} (User)`
                }
              }
              if (e.role) {
                return {
                  subjectType: 'ROLE',
                  subjectId: e.role.id,
                  label: `${e.role.displayName || e.role.name} (Role)`
                }
              }
              return null
            })
            .filter(Boolean)
        )
      } catch (e) {
        onError?.(e?.response?.data?.message || e?.message || 'Failed to load confidential access')
        onClose()
      } finally {
        if (mounted) setLoading(false)
      }
    }
    if (document?.id) load()
    return () => {
      mounted = false
    }
  }, [document?.id])

  const searchSubjects = async () => {
    if (!accessQuery.trim()) return
    setLoadingSubjects(true)
    try {
      const res = await api.get('/folders/access/subjects', { params: { q: accessQuery.trim() } })
      setSubjectResults(res?.data?.data || { users: [], roles: [] })
    } finally {
      setLoadingSubjects(false)
    }
  }

  const addAccessEntry = (entry) => {
    setAccessEntries((prev) => {
      if (prev.some((x) => x.subjectType === entry.subjectType && String(x.subjectId) === String(entry.subjectId))) return prev
      return [...prev, entry].sort((a, b) => a.label.localeCompare(b.label))
    })
  }

  const removeAccessEntry = (entry) => {
    setAccessEntries((prev) => prev.filter((x) => !(x.subjectType === entry.subjectType && String(x.subjectId) === String(entry.subjectId))))
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/documents/${document.id}`, { isConfidential })
      await api.put(`/documents/${document.id}/confidential-access`, {
        entries: isConfidential
          ? accessEntries.map((e) => ({
              subjectType: e.subjectType,
              subjectId: e.subjectId,
              canView: true
            }))
          : []
      })
      onSaved?.()
      onClose()
    } catch (e) {
      onError?.(e?.response?.data?.message || e?.message || 'Failed to save confidential access')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Manage Confidential Access" onClose={onClose}>
      {loading ? (
        <div className="text-sm text-ink-muted">Loading access settings...</div>
      ) : (
        <div className="space-y-4">
          <AppSurface padding="md" variant="muted">
            <div className="text-sm font-semibold text-ink">{document.fileCode}</div>
            <div className="mt-1 text-sm text-ink-muted">{document.title}</div>
            <div className="mt-2 flex items-center gap-2">
              <DocumentStatusBadge status={document.status} />
              <span className="text-xs text-ink-soft">{`Workflow stage: ${document.stage || '-'}`}</span>
            </div>
          </AppSurface>

          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={isConfidential}
              onChange={(e) => setIsConfidential(e.target.checked)}
              className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
            />
            Mark this document as confidential
          </label>

          {!isConfidential ? (
            <div className="text-sm text-ink-muted">When confidential is off, normal document visibility rules apply.</div>
          ) : (
            <>
              <div>
                <div className="mb-1 text-xs font-semibold text-ink-soft">Allowed viewers</div>
                {accessEntries.length === 0 ? (
                  <div className="text-sm text-ink-muted">No extra viewers added yet. Only creator/owner and users with global confidential permission will have access.</div>
                ) : (
                  <div className="space-y-2">
                    {accessEntries.map((e) => (
                      <div key={`${e.subjectType}:${e.subjectId}`} className="flex items-center justify-between gap-3 rounded-dms border border-border bg-surface px-3 py-2">
                        <div className="text-sm text-ink-secondary">{e.label}</div>
                        <button type="button" onClick={() => removeAccessEntry(e)} className="text-sm font-semibold text-[var(--dms-color-danger-ink)] hover:underline">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <AppSurface padding="md" variant="panel" className="space-y-3">
                <div className="text-xs font-semibold text-ink-soft">Add user or role</div>
                <div className="flex gap-2">
                  <TextInput
                    value={accessQuery}
                    onChange={(e) => setAccessQuery(e.target.value)}
                    placeholder="Search user email/name or role..."
                    className="flex-1"
                  />
                  <Button type="button" variant="secondary" onClick={searchSubjects} disabled={loadingSubjects}>
                    {loadingSubjects && <InlineSpinner className="h-4 w-4" />}
                    {loadingSubjects ? 'Searching...' : 'Search'}
                  </Button>
                </div>

                {(subjectResults.roles.length > 0 || subjectResults.users.length > 0) && (
                  <AppSurface padding="none" variant="panel" className="max-h-56 overflow-auto">
                    {subjectResults.roles.map((r) => (
                      <button
                        key={`role:${r.id}`}
                        type="button"
                        onClick={() => addAccessEntry({ subjectType: 'ROLE', subjectId: r.id, label: `${r.displayName || r.name} (Role)` })}
                        className="w-full border-b border-border px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted last:border-b-0"
                      >
                        <div className="font-semibold text-ink">{r.displayName || r.name}</div>
                        <div className="text-xs text-ink-soft">Role</div>
                      </button>
                    ))}
                    {subjectResults.users.map((u) => (
                      <button
                        key={`user:${u.id}`}
                        type="button"
                        onClick={() => addAccessEntry({ subjectType: 'USER', subjectId: u.id, label: `${`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email} (User)` })}
                        className="w-full border-b border-border px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted last:border-b-0"
                      >
                        <div className="font-semibold text-ink">{`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}</div>
                        <div className="text-xs text-ink-soft">{u.email}</div>
                      </button>
                    ))}
                  </AppSurface>
                )}
              </AppSurface>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
            <Button type="button" disabled={saving} onClick={save}>
              {saving && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
              {saving ? 'Saving...' : 'Save Access'}
            </Button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}

function ActivityModal({ projectId, onClose }) {
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [total, setTotal] = useState(0)
  const [logs, setLogs] = useState([])

  const load = async (p) => {
    setLoading(true)
    try {
      const res = await api.get(`/project-tracking/projects/${projectId}/activity-logs`, {
        params: { page: p, limit }
      })
      const data = res?.data?.data || {}
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setPage(data.page || p)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!projectId) return
    load(1)
  }, [projectId])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <ModalShell title="Project Activity Logs" onClose={onClose}>
      {loading ? (
        <div className="text-sm text-ink-muted">Loading project activity logs...</div>
      ) : logs.length === 0 ? (
        <div className="text-sm text-ink-muted">No project activity logs recorded yet.</div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-ink-muted">This view only shows logs recorded for this specific project and its phases.</div>
          <TableContainer>
            <Table>
              <thead>
                <Tr className="hover:bg-transparent">
                  <Th>Time</Th>
                  <Th>User</Th>
                  <Th>Scope</Th>
                  <Th>Action</Th>
                  <Th>Description</Th>
                </Tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <Tr key={l.id}>
                    <Td className="whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</Td>
                    <Td className="whitespace-nowrap">{l.user}</Td>
                    <Td className="whitespace-nowrap">{l.entity === 'ProjectIteration' ? 'Phase' : 'Project'}</Td>
                    <Td className="whitespace-nowrap">{l.action}</Td>
                    <Td>{l.description}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>

          <div className="flex items-center justify-between">
            <div className="text-xs text-ink-soft">{`Page ${page} of ${totalPages}`}</div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>Prev</Button>
              <Button type="button" variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => load(page + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  )
}

function AddStageModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onCreate({
        name: name.trim(),
        displayName: displayName.trim() || null
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="Add New Stage" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm text-ink-muted">
          Add a new stage for the selected project category. This stage will appear in the stage flow and can be reordered after creation.
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Stage Name</label>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Example: UAT"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Display Label</label>
          <TextInput
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Optional label shown to users"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={loading} type="submit">
            {loading && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
            {loading ? 'Adding...' : 'Add Stage'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

function PhaseModal({ mode, phase, nextPhaseNo, onClose, onSubmit }) {
  const isEdit = mode === 'edit'
  const [name, setName] = useState(phase?.name || '')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit({ name: name.trim() })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title={isEdit ? 'Rename Phase' : 'Add New Phase'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm text-ink-muted">
          {isEdit
            ? 'Update the name shown to users for this project phase.'
            : `Create Phase ${nextPhaseNo || '-'} with a custom name instead of the default iteration label.`}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Phase Name</label>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Example: Pilot Rollout, Wave 2, UAT"
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={loading} type="submit">
            {loading && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
            {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Phase' : 'Create Phase')}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

function ChangeRequestModal({ projectId, iterationId, phase, initialItem, onClose, onSaved }) {
  const makeCreateRow = (phaseValue = phase) => {
    const phaseLabel = phaseValue?.iterationNo ? `Phase ${phaseValue.iterationNo}` : ''
    return {
      key: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      mode: 'create',
      serverId: null,
      changeId: '',
      phaseRef: phaseLabel,
      description: '',
      impact: '',
      authorizedBy: '',
      complianceSignOff: '',
      dateApproved: '',
      saving: false,
      error: null
    }
  }

  const initialRow = useMemo(() => {
    if (initialItem) {
      return {
        key: `edit-${initialItem.id}`,
        mode: 'edit',
        serverId: initialItem.id,
        changeId: initialItem.changeId || '',
        phaseRef: initialItem.phaseRef || '',
        description: initialItem.description || '',
        impact: initialItem.impact || '',
        authorizedBy: initialItem.authorizedBy || '',
        complianceSignOff: initialItem.complianceSignOff || '',
        dateApproved: toDateInputValue(initialItem.dateApproved),
        saving: false,
        error: null
      }
    }
    return makeCreateRow(phase)
  }, [initialItem, phase])

  const [rows, setRows] = useState([initialRow])
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [loadingExistingError, setLoadingExistingError] = useState('')

  useEffect(() => {
    let active = true
    const loadExisting = async () => {
      if (initialItem) {
        setRows([initialRow])
        return
      }

      setLoadingExisting(true)
      setLoadingExistingError('')
      try {
        const res = await api.get(`/project-tracking/projects/${projectId}/change-requests`, {
          params: iterationId ? { iterationId: Number(iterationId) } : undefined
        })
        if (!active) return
        const changeRequests = res?.data?.data?.changeRequests || []
        const mapped = changeRequests.map((cr) => ({
          key: `saved-${cr.id}`,
          mode: 'edit',
          serverId: cr.id,
          changeId: cr.changeId || '',
          phaseRef: cr.phaseRef || '',
          description: cr.description || '',
          impact: cr.impact || '',
          authorizedBy: cr.authorizedBy || '',
          complianceSignOff: cr.complianceSignOff || '',
          dateApproved: toDateInputValue(cr.dateApproved),
          saving: false,
          error: null
        }))
        setRows(mapped.concat([makeCreateRow(phase)]))
      } catch (e) {
        if (!active) return
        const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to load change requests'
        setLoadingExistingError(msg)
        setRows([makeCreateRow(phase)])
      } finally {
        if (active) setLoadingExisting(false)
      }
    }

    loadExisting()
    return () => {
      active = false
    }
  }, [initialItem, initialRow, iterationId, phase, projectId])

  const addRow = () => {
    setRows((prev) => prev.concat(makeCreateRow(phase)))
  }

  const updateRow = (key, patch) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const removeRow = (key) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key)
      if (initialItem || next.length > 0) return next
      const phaseLabel = phase?.iterationNo ? `Phase ${phase.iterationNo}` : ''
      return [{
        key: `new-${Date.now()}`,
        mode: 'create',
        serverId: null,
        changeId: '',
        phaseRef: phaseLabel,
        description: '',
        impact: '',
        authorizedBy: '',
        complianceSignOff: '',
        dateApproved: '',
        saving: false,
        error: null
      }]
    })
  }

  const saveRow = async (row) => {
    const changeId = String(row.changeId || '').trim()
    const description = String(row.description || '').trim()
    if (!changeId || !description) {
      updateRow(row.key, { error: 'Change ID and Description are required.' })
      return
    }

    updateRow(row.key, { saving: true, error: null })
    try {
      const payload = {
        projectIterationId: iterationId ? Number(iterationId) : null,
        changeId,
        phaseRef: row.phaseRef || null,
        description,
        impact: row.impact || null,
        authorizedBy: row.authorizedBy || null,
        complianceSignOff: row.complianceSignOff || null,
        dateApproved: row.dateApproved || null
      }

      if (row.mode === 'edit' && row.serverId) {
        const res = await api.put(`/project-tracking/change-requests/${row.serverId}`, payload)
        const saved = res?.data?.data?.changeRequest
        if (saved?.id) {
          updateRow(row.key, {
            serverId: saved.id,
            mode: 'edit',
            changeId: saved.changeId || row.changeId,
            phaseRef: saved.phaseRef || row.phaseRef,
            description: saved.description || row.description,
            impact: saved.impact || row.impact,
            authorizedBy: saved.authorizedBy || row.authorizedBy,
            complianceSignOff: saved.complianceSignOff || row.complianceSignOff,
            dateApproved: toDateInputValue(saved.dateApproved),
            error: null
          })
        }
      } else {
        const res = await api.post(`/project-tracking/projects/${projectId}/change-requests`, payload)
        const saved = res?.data?.data?.changeRequest
        if (saved?.id) {
          updateRow(row.key, {
            serverId: saved.id,
            mode: 'edit',
            changeId: saved.changeId || row.changeId,
            phaseRef: saved.phaseRef || row.phaseRef,
            description: saved.description || row.description,
            impact: saved.impact || row.impact,
            authorizedBy: saved.authorizedBy || row.authorizedBy,
            complianceSignOff: saved.complianceSignOff || row.complianceSignOff,
            dateApproved: toDateInputValue(saved.dateApproved),
            error: null
          })
        }
      }

      await onSaved?.()

      if (row.mode === 'edit') {
        onClose?.()
      } else {
        setRows((prev) => {
          const hasEmptyCreateRow = prev.some((r) => (
            r.mode === 'create' &&
            !r.serverId &&
            !String(r.changeId || '').trim() &&
            !String(r.description || '').trim()
          ))
          return hasEmptyCreateRow ? prev : prev.concat(makeCreateRow(phase))
        })
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to save change request'
      updateRow(row.key, { error: msg })
    } finally {
      updateRow(row.key, { saving: false })
    }
  }

  return (
    <ModalShell title="Key In Change Request" onClose={onClose} maxWidthClass="w-[98vw] max-w-[1700px]">
      <div className="space-y-4">
        <div className="text-sm text-ink-muted">
          Add approved changes for the selected project phase. Each row can be saved individually.
        </div>
        {loadingExistingError ? (
          <div className="rounded-2xl border border-[var(--dms-color-danger-soft)] bg-[var(--dms-color-danger-soft)] px-4 py-3 text-sm text-[var(--dms-color-danger-ink)]">
            {loadingExistingError}
          </div>
        ) : null}
        <TableContainer className="max-h-[60vh] overflow-y-auto">
          <Table className="table-fixed">
            <thead>
              <Tr>
                <Th className="sticky top-0 z-10 bg-surface w-[110px] !px-3">Change ID *</Th>
                <Th className="sticky top-0 z-10 bg-surface w-[120px] !px-3">Phase Ref</Th>
                <Th className="sticky top-0 z-10 bg-surface w-[260px] !px-3">Description of Amendment *</Th>
                <Th className="sticky top-0 z-10 bg-surface w-[220px] !px-3">Impact (Cost / Schedule / Scope)</Th>
                <Th className="sticky top-0 z-10 bg-surface w-[150px] !px-3">Authorized By</Th>
                <Th className="sticky top-0 z-10 bg-surface w-[170px] !px-3">Compliance Sign-Off</Th>
                <Th className="sticky top-0 z-10 bg-surface w-[150px] !px-3">Date Approved</Th>
                <Th className="sticky top-0 z-10 bg-surface w-[140px] !px-3">Actions</Th>
              </Tr>
            </thead>
            <tbody>
              {loadingExisting ? (
                <Tr>
                  <Td colSpan={8} className="py-6">
                    <div className="flex items-center gap-2 text-sm text-ink-muted">
                      <InlineSpinner className="h-4 w-4" />
                      <span>Loading change requests...</span>
                    </div>
                  </Td>
                </Tr>
              ) : null}
              {rows.map((r) => {
                const changeIdTrim = String(r.changeId || '').trim()
                const descriptionTrim = String(r.description || '').trim()
                const showRequired = Boolean(r.error) && /required/i.test(String(r.error))
                const canSave = Boolean(changeIdTrim && descriptionTrim)

                return (
                  <React.Fragment key={r.key}>
                    <Tr>
                      <Td className="!px-3">
                        <TextInput
                          value={r.changeId}
                          onChange={(e) => updateRow(r.key, { changeId: e.target.value })}
                          placeholder="CR-01"
                          invalid={showRequired && !changeIdTrim}
                        />
                      </Td>
                      <Td className="!px-3">
                        <TextInput value={r.phaseRef} onChange={(e) => updateRow(r.key, { phaseRef: e.target.value })} placeholder="Phase 2" />
                      </Td>
                      <Td className="!px-3">
                        <TextArea
                          value={r.description}
                          onChange={(e) => updateRow(r.key, { description: e.target.value })}
                          rows={3}
                          placeholder="Describe amendment..."
                          invalid={showRequired && !descriptionTrim}
                        />
                      </Td>
                      <Td className="!px-3">
                        <TextArea value={r.impact} onChange={(e) => updateRow(r.key, { impact: e.target.value })} rows={3} placeholder="Impact..." />
                      </Td>
                      <Td className="!px-3">
                        <TextInput value={r.authorizedBy} onChange={(e) => updateRow(r.key, { authorizedBy: e.target.value })} placeholder="Name" />
                      </Td>
                      <Td className="!px-3">
                        <TextInput value={r.complianceSignOff} onChange={(e) => updateRow(r.key, { complianceSignOff: e.target.value })} placeholder="Signature / Ref" />
                      </Td>
                      <Td className="!px-3">
                        <TextInput type="date" value={r.dateApproved} onChange={(e) => updateRow(r.key, { dateApproved: e.target.value })} />
                      </Td>
                      <Td className="!px-3">
                        <div className="flex items-center gap-2">
                          <Button type="button" disabled={r.saving || !canSave} onClick={() => saveRow(r)}>
                            {r.saving && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
                            {r.mode === 'edit' ? 'Update' : 'Save'}
                          </Button>
                          {r.mode === 'create' && (
                            <Button type="button" variant="secondary" onClick={() => removeRow(r.key)} disabled={r.saving}>
                              Remove
                            </Button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                    {r.error && (
                      <Tr>
                        <Td colSpan={8} className="text-sm text-[var(--dms-color-danger-ink)]">{r.error}</Td>
                      </Tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </Table>
        </TableContainer>
        {!initialItem && (
          <div className="flex justify-between gap-2">
            <Button type="button" variant="secondary" onClick={addRow}>Add Row</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          </div>
        )}
        {initialItem && (
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

function AssignmentSummary({ phaseLabel, stageLabel, documentTypeLabel, modeLabel }) {
  return (
    <AppSurface padding="md" variant="panel" className="border border-[var(--dms-color-border-default)] bg-[var(--dms-color-info-soft)]">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--dms-color-info-ink)]">{modeLabel}</div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <div className="text-xs font-semibold text-ink-soft">Phase</div>
          <div className="text-sm font-semibold text-ink">{phaseLabel || '-'}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-ink-soft">Stage</div>
          <div className="text-sm font-semibold text-ink">{stageLabel || '-'}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-ink-soft">Document Type</div>
          <div className="text-sm font-semibold text-ink">{documentTypeLabel || 'Choose in form below'}</div>
        </div>
      </div>
    </AppSurface>
  )
}

const getApiErrorMessage = (error, fallback = 'Unable to complete this request right now.') => (
  error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback
)

const buildAttachSummaryMessage = ({ linkedCount = 0, failedCount = 0, failures = [] } = {}) => {
  if (linkedCount > 0 && failedCount === 0) {
    return linkedCount === 1
      ? '1 document attached successfully.'
      : `${linkedCount} documents attached successfully.`
  }

  if (linkedCount > 0 && failedCount > 0) {
    const firstFailure = failures[0]?.message
    return `${linkedCount} document${linkedCount === 1 ? '' : 's'} attached. ${failedCount} failed.${firstFailure ? ` First issue: ${firstFailure}` : ''}`
  }

  return failures[0]?.message || 'Unable to attach the selected documents right now.'
}

// #region debug-point A:attach-folder-debug-reporter
const reportAttachFolderDebug = ({ hypothesisId, location, msg, data }) => {
  try {
    if (window?.localStorage?.getItem('dms_debug') !== '1') return
    const url = window?.localStorage?.getItem('dms_debug_server_url') || 'http://127.0.0.1:7777/event'
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'attach-folder-empty',
        runId: 'pre',
        hypothesisId,
        location,
        msg,
        data: data || {},
        ts: Date.now()
      })
    }).catch(() => {})
  } catch {}
}
// #endregion

function StageLinkDocumentModal({ projectId, iterationId, phase, stage, stageItems = [], onClose, onLinked }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [folders, setFolders] = useState([])
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [selectedDocuments, setSelectedDocuments] = useState({})
  const [submitError, setSubmitError] = useState('')

  const resolveMatchingItem = (result) => {
    const selectedDocumentTypeId = result?.document?.documentTypeId || result?.documentTypeId || null
    return stageItems.find((it) => String(it.documentTypeId) === String(selectedDocumentTypeId)) || null
  }

  const filteredResults = useMemo(() => {
    if (statusFilter === 'ALL') return results
    return results.filter((r) => String(r.document?.status || r.status || '').toUpperCase() === statusFilter)
  }, [results, statusFilter])

  const selectedEntries = useMemo(() => Object.values(selectedDocuments), [selectedDocuments])
  const selectedCount = selectedEntries.length

  const attachmentBreakdown = useMemo(() => {
    return selectedEntries.reduce((acc, result) => {
      const matchingItem = resolveMatchingItem(result)
      if (matchingItem) {
        acc.required += 1
      } else {
        acc.other += 1
      }

      if (
        matchingItem?.isConfidentialDefault &&
        !(result?.document?.isConfidential || result?.isConfidential)
      ) {
        acc.autoConfidential += 1
      }
      return acc
    }, { required: 0, other: 0, autoConfidential: 0 })
  }, [selectedEntries, stageItems])

  const canSearch = Boolean(selectedFolderId) || query.trim().length >= 2
  const handleFolderSelect = (...args) => {
    const folderId = args.length > 1 ? args[0] : args[0]?.id
    const node = args.length > 1 ? args[1] : args[0]
    const nextId = String(folderId || '')
    reportAttachFolderDebug({
      hypothesisId: 'A',
      location: 'ProjectTracking.jsx:StageLinkDocumentModal:handleFolderSelect',
      msg: '[DEBUG] Folder selected in stage attach modal',
      data: { nextId: nextId || null, fullPathLabel: node?.fullPathLabel || null }
    })
    setSelectedFolderId(nextId)
  }

  useEffect(() => {
    let active = true
    const loadFolders = async () => {
      setFoldersLoading(true)
      try {
        const res = await api.get('/folders')
        if (!active) return
        setFolders(res?.data?.data?.folders || res?.data?.folders || [])
      } catch {
        if (!active) return
        setFolders([])
      } finally {
        if (active) setFoldersLoading(false)
      }
    }
    loadFolders()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (results.length === 0) return
    setSelectedDocuments((prev) => {
      let changed = false
      const next = { ...prev }
      results.forEach((result) => {
        const key = String(result.id)
        if (next[key]) {
          next[key] = result
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [results])

  const search = async (searchText = query, folderId = selectedFolderId) => {
    const trimmedQuery = String(searchText || '').trim()
    const normalizedFolderId = String(folderId || '').trim()

    if (!normalizedFolderId && trimmedQuery.length < 2) {
      reportAttachFolderDebug({
        hypothesisId: 'B',
        location: 'ProjectTracking.jsx:StageLinkDocumentModal:search',
        msg: '[DEBUG] Search skipped (no folderId and query too short)',
        data: { trimmedQuery, normalizedFolderId: normalizedFolderId || null }
      })
      setResults([])
      return
    }

    setSearching(true)
    try {
      const params = {}
      if (trimmedQuery) params.q = trimmedQuery
      if (normalizedFolderId) params.folderId = Number(normalizedFolderId)
      reportAttachFolderDebug({
        hypothesisId: 'B',
        location: 'ProjectTracking.jsx:StageLinkDocumentModal:search',
        msg: '[DEBUG] Calling /project-tracking/documents/search',
        data: { params }
      })
      const res = await api.get('/project-tracking/documents/search', { params })
      const docs = res?.data?.data?.documents || []
      reportAttachFolderDebug({
        hypothesisId: 'C',
        location: 'ProjectTracking.jsx:StageLinkDocumentModal:search',
        msg: '[DEBUG] Search response received',
        data: { count: Array.isArray(docs) ? docs.length : null }
      })
      setResults(docs)
    } catch (error) {
      reportAttachFolderDebug({
        hypothesisId: 'E',
        location: 'ProjectTracking.jsx:StageLinkDocumentModal:search',
        msg: '[DEBUG] Search request failed',
        data: { message: error?.response?.data?.message || error?.message || 'unknown', status: error?.response?.status || null }
      })
      throw error
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (!selectedFolderId && query.trim().length < 2) {
      setResults([])
      return
    }

    const timer = window.setTimeout(() => {
      search(query, selectedFolderId)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, selectedFolderId])

  const toggleDocument = (result) => {
    const key = String(result.id)
    setSelectedDocuments((prev) => {
      if (prev[key]) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: result }
    })
    setSubmitError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (selectedEntries.length === 0) return

    setSubmitError('')
    setSubmitting(true)
    const successes = []
    const failures = []

    try {
      for (const result of selectedEntries) {
        const matchingItem = resolveMatchingItem(result)
        const endpoint = matchingItem
          ? `/project-tracking/items/${matchingItem.id}/link-document`
          : `/project-tracking/iterations/${iterationId}/stages/${stage.id}/link-document`

        try {
          await api.post(endpoint, { documentId: Number(result.id) })
          successes.push(result)
        } catch (error) {
          failures.push({
            id: result.id,
            title: getDocumentTitleLabel(result.document || result),
            message: getApiErrorMessage(error, 'Unable to attach one of the selected documents.')
          })
        }
      }
    } finally {
      setSubmitting(false)
    }

    if (successes.length > 0) {
      onLinked({
        linkedCount: successes.length,
        failedCount: failures.length,
        failures
      })
      return
    }

    setSubmitError(buildAttachSummaryMessage({ linkedCount: 0, failedCount: failures.length, failures }))
  }

  return (
    <ModalShell title="Attach Existing Document" onClose={onClose} maxWidthClass="max-w-4xl">
      <form onSubmit={submit} className="space-y-4">
        <AssignmentSummary
          modeLabel="Attach existing document to stage"
          phaseLabel={getPhaseTitle(phase, '-')}
          stageLabel={stage?.name}
          documentTypeLabel="Keep original document type"
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-semibold text-ink-secondary">Browse Folder</label>
              {selectedFolderId && (
                <button
                  type="button"
                  onClick={() => setSelectedFolderId('')}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <AppSurface padding="sm" variant="panel">
              {foldersLoading ? (
                <div className="flex items-center justify-center py-6 text-sm text-ink-soft">
                  <InlineSpinner className="h-4 w-4" />
                  <span className="ml-2">Loading folders...</span>
                </div>
              ) : (
                <FolderTreePicker
                  folders={folders}
                  selectedId={selectedFolderId}
                  onSelect={handleFolderSelect}
                  searchPlaceholder="Search folder name or path"
                  emptySelectionText="All folders"
                  selectedLabel="Selected folder"
                  treeClassName="max-h-72"
                />
              )}
            </AppSurface>
            <div className="text-xs text-ink-soft">
              {selectedFolderId
                ? 'Listing documents from the selected folder. Add a keyword to narrow the result.'
                : 'Pick a folder to list files under it, or leave it empty and search globally.'}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-ink-secondary">Find Existing Document</label>
            <div className="flex gap-2">
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
                placeholder={selectedFolderId ? 'Search within selected folder by file code or title...' : 'Search globally by file code or title...'}
              />
              <Button type="button" variant="secondary" onClick={() => search(query, selectedFolderId)} disabled={searching || !canSearch}>
                {searching && <InlineSpinner className="h-4 w-4" />}
                {selectedFolderId ? 'Search Folder' : 'Search All'}
              </Button>
            </div>
            <div className="text-xs text-ink-soft">
              {selectedFolderId
                ? 'Search covers accessible documents inside the chosen folder.'
                : 'Search covers all accessible documents in the system, including published documents outside this project.'}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {['ALL', 'PUBLISHED', 'DRAFT'].map((filterValue) => (
                <button
                  key={filterValue}
                  type="button"
                  onClick={() => setStatusFilter(filterValue)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    statusFilter === filterValue
                      ? 'border-white/10 bg-brand text-ink-inverse'
                      : 'border-border bg-surface text-ink-secondary hover:bg-surface-muted hover:text-ink'
                  }`}
                >
                  {filterValue === 'ALL' ? 'All' : filterValue === 'PUBLISHED' ? 'Published' : 'Draft'}
                </button>
              ))}
            </div>
            {filteredResults.length > 0 && (
              <AppSurface padding="none" variant="panel" className="max-h-72 overflow-auto">
                {filteredResults.map((r) => {
                  const isSelected = Boolean(selectedDocuments[String(r.id)])
                  const matchingItem = resolveMatchingItem(r)

                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleDocument(r)}
                      className={`w-full border-b border-border px-3 py-3 text-left text-sm transition-colors hover:bg-surface-muted last:border-b-0 ${
                        isSelected ? 'bg-brand/5 ring-1 ring-inset ring-brand/20' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input type="checkbox" readOnly checked={isSelected} className="mt-1 h-4 w-4" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-ink">{getDocumentCodeLabel(r.document || r)}</div>
                          <div className="text-ink-secondary">{getDocumentTitleLabel(r.document || r)}</div>
                          <div className="mt-1 text-xs text-ink-soft">
                            {r.document?.documentType?.name || r.item?.documentType?.name || 'Document type unavailable'}
                          </div>
                          <div className="mt-1 inline-flex items-center gap-2">
                            <ConfidentialBadge isConfidential={r.document?.isConfidential || r.isConfidential} />
                            <DocumentStatusBadge status={r.document?.status || r.status} />
                          </div>
                          <div className="mt-1 text-xs text-ink-soft">
                            {`${r.iteration?.project?.code || '-'} • ${getPhaseTitle(r.iteration, 'Phase')} • ${r.stage?.name || '-'}`}
                          </div>
                          <div className="mt-2 text-xs font-medium text-brand">
                            {matchingItem
                              ? `Will attach under required item: ${matchingItem.documentType?.name || 'Document Type'}`
                              : 'Will attach under Other Documents for this stage'}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </AppSurface>
            )}
            {!searching && canSearch && filteredResults.length === 0 && (
              <EmptyPanelState
                title={results.length === 0 ? 'No matching documents found' : 'No documents match the selected status'}
                description={results.length === 0
                  ? (selectedFolderId
                    ? 'Try another keyword or switch to a different folder.'
                    : 'Try file code prefix, full file code, or part of the title.')
                  : 'Try switching the status filter.'}
              />
            )}
          </div>
        </div>
        <div className="text-xs text-ink-soft">
          {selectedCount > 0
            ? `${selectedCount} document${selectedCount === 1 ? '' : 's'} selected. ${attachmentBreakdown.required > 0 ? `${attachmentBreakdown.required} will go to required item${attachmentBreakdown.required === 1 ? '' : 's'}. ` : ''}${attachmentBreakdown.other > 0 ? `${attachmentBreakdown.other} will go to Other Documents.` : ''}`
            : 'Search and select one or more documents from the list above.'}
        </div>
        {attachmentBreakdown.autoConfidential > 0 && (
          <div className="rounded-xl border border-[var(--dms-color-danger-soft)] bg-[var(--dms-color-danger-soft)] px-3 py-2 text-xs text-[var(--dms-color-danger-ink)]">
            {attachmentBreakdown.autoConfidential} selected document{attachmentBreakdown.autoConfidential === 1 ? '' : 's'} will be updated to confidential automatically after attach.
          </div>
        )}
        {submitError && (
          <div className="rounded-xl border border-[var(--dms-color-danger-soft)] bg-[var(--dms-color-danger-soft)] px-3 py-2 text-xs text-[var(--dms-color-danger-ink)]">
            {submitError}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={submitting || selectedCount === 0} type="submit">
            {submitting && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
            {submitting ? 'Attaching...' : attachmentBreakdown.autoConfidential > 0 ? `Attach ${selectedCount} as Needed` : `Attach ${selectedCount || ''}`.trim()}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

function StageCreateDocumentModal({ iterationId, phase, stage, stageItems = [], documentTypes, onClose, onCreated }) {
  const [documentTypeId, setDocumentTypeId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dateOfDocument, setDateOfDocument] = useState('')
  const [loading, setLoading] = useState(false)

  const matchingItem = stageItems.find((it) => String(it.documentTypeId) === String(documentTypeId)) || null
  const willCreateConfidential = Boolean(matchingItem?.isConfidentialDefault)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const endpoint = matchingItem
        ? `/project-tracking/items/${matchingItem.id}/create-document`
        : `/project-tracking/iterations/${iterationId}/stages/${stage.id}/create-document`
      const payload = matchingItem
        ? { title, description: description || null, dateOfDocument: dateOfDocument || null }
        : { documentTypeId: Number(documentTypeId), title, description: description || null, dateOfDocument: dateOfDocument || null }
      const res = await api.post(endpoint, payload)
      onCreated(res?.data?.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setTitle(`${stage.name} - Document`)
  }, [stage?.id])

  return (
    <ModalShell title="Create New Document" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <AssignmentSummary
          modeLabel="Create new document under stage"
          phaseLabel={getPhaseTitle(phase, '-')}
          stageLabel={stage?.name}
          documentTypeLabel={documentTypes.find((d) => String(d.id) === String(documentTypeId))?.name || null}
        />
        <div className="rounded-xl border border-[var(--dms-color-info-soft)] bg-[var(--dms-color-info-soft)] px-3 py-2 text-xs text-[var(--dms-color-info-ink)]">
          This follows the NDR concept more closely: the system auto-generates a file code, assigns you as owner, and creates the document directly in Draft for this project stage.
        </div>
        <div className="text-xs text-ink-soft">
          {matchingItem
            ? `This document type matches a required checklist item, so the new document will appear under ${matchingItem.documentType?.name || 'that required row'}.`
            : 'No required checklist item matches this document type, so the new document will be linked under Other Documents for this stage.'}
        </div>
        {willCreateConfidential && (
          <div className="rounded-xl border border-[var(--dms-color-danger-soft)] bg-[var(--dms-color-danger-soft)] px-3 py-2 text-xs text-[var(--dms-color-danger-ink)]">
            This required item is confidential by default. The new draft will be created as confidential automatically.
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Document Type</label>
          <SelectField
            value={documentTypeId}
            onChange={(e) => setDocumentTypeId(e.target.value)}
            required
          >
            <option value="">Select</option>
            {documentTypes.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </SelectField>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Title</label>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Date of Document</label>
          <TextInput
            type="date"
            value={dateOfDocument}
            onChange={(e) => setDateOfDocument(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Remarks / Description</label>
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={loading} type="submit">
            {loading && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
            {loading ? 'Creating...' : willCreateConfidential ? 'Create Confidential Draft' : 'Create Draft'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

function CreateProjectModal({ onClose, onCreated }) {
  const [loading, setLoading] = useState(false)
  const [projectCategories, setProjectCategories] = useState([])
  const [users, setUsers] = useState([])

  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    clientName: '',
    clientPic: '',
    teamMembers: '',
    startDate: '',
    plannedCompletionDate: '',
    actualCompletionDate: '',
    scope: '',
    objective: '',
    deliverables: '',
    projectCategoryId: '',
    managerId: ''
  })

  useEffect(() => {
    const load = async () => {
      const [cats, usersRes] = await Promise.all([
        api.get('/system/config/project-categories'),
        api.get('/users')
      ])
      setProjectCategories(cats?.data?.data?.projectCategories || [])
      setUsers(usersRes?.data?.data?.users || [])
    }
    load()
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        code: form.code,
        name: form.name,
        description: form.description || null,
        clientName: form.clientName || null,
        clientPic: form.clientPic || null,
        teamMembers: form.teamMembers || null,
        startDate: form.startDate || null,
        plannedCompletionDate: form.plannedCompletionDate || null,
        actualCompletionDate: form.actualCompletionDate || null,
        scope: form.scope || null,
        objective: form.objective || null,
        deliverables: form.deliverables || null,
        projectCategoryId: Number(form.projectCategoryId),
        managerId: Number(form.managerId)
      }
      const res = await api.post('/project-tracking/projects', payload)
      const project = res?.data?.data?.project
      if (project) onCreated(project)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="Create Project" onClose={onClose} maxWidthClass="max-w-5xl">
      <form onSubmit={submit} className="space-y-4">
        <AppSurface padding="md" variant="panel" className="border border-[var(--dms-color-border-default)] bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]">
          Capture the core project brief here. `Project Category` is kept because it drives the workflow stages and document checklist templates.
        </AppSurface>
        <ProjectFormFields
          form={form}
          setForm={setForm}
          users={users}
          showCategory
          projectCategories={projectCategories}
          stageStatusLabel="Will follow the initial workflow stage after creation"
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={loading} type="submit">
            {loading && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

function LinkDocumentModal({ projectId, item, phase, onClose, onLinked }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [folders, setFolders] = useState([])
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [selectedDocuments, setSelectedDocuments] = useState({})
  const [submitError, setSubmitError] = useState('')

  const filteredResults = useMemo(() => {
    if (statusFilter === 'ALL') return results
    return results.filter((r) => String(r.document?.status || r.status || '').toUpperCase() === statusFilter)
  }, [results, statusFilter])

  const selectedEntries = useMemo(() => Object.values(selectedDocuments), [selectedDocuments])
  const selectedCount = selectedEntries.length
  const canSearch = Boolean(selectedFolderId) || query.trim().length >= 2
  const handleFolderSelect = (...args) => {
    const folderId = args.length > 1 ? args[0] : args[0]?.id
    const node = args.length > 1 ? args[1] : args[0]
    const nextId = String(folderId || '')
    reportAttachFolderDebug({
      hypothesisId: 'A',
      location: 'ProjectTracking.jsx:LinkDocumentModal:handleFolderSelect',
      msg: '[DEBUG] Folder selected in required item attach modal',
      data: { nextId: nextId || null, fullPathLabel: node?.fullPathLabel || null }
    })
    setSelectedFolderId(nextId)
  }

  useEffect(() => {
    let active = true
    const loadFolders = async () => {
      setFoldersLoading(true)
      try {
        const res = await api.get('/folders')
        if (!active) return
        setFolders(res?.data?.data?.folders || res?.data?.folders || [])
      } catch {
        if (!active) return
        setFolders([])
      } finally {
        if (active) setFoldersLoading(false)
      }
    }
    loadFolders()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (results.length === 0) return
    setSelectedDocuments((prev) => {
      let changed = false
      const next = { ...prev }
      results.forEach((result) => {
        const key = String(result.id)
        if (next[key]) {
          next[key] = result
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [results])

  const search = async (searchText = query, folderId = selectedFolderId) => {
    const trimmedQuery = String(searchText || '').trim()
    const normalizedFolderId = String(folderId || '').trim()

    if (!normalizedFolderId && trimmedQuery.length < 2) {
      reportAttachFolderDebug({
        hypothesisId: 'B',
        location: 'ProjectTracking.jsx:LinkDocumentModal:search',
        msg: '[DEBUG] Search skipped (no folderId and query too short)',
        data: { trimmedQuery, normalizedFolderId: normalizedFolderId || null }
      })
      setResults([])
      return
    }

    setSearching(true)
    try {
      const params = {}
      if (trimmedQuery) params.q = trimmedQuery
      if (normalizedFolderId) params.folderId = Number(normalizedFolderId)
      reportAttachFolderDebug({
        hypothesisId: 'B',
        location: 'ProjectTracking.jsx:LinkDocumentModal:search',
        msg: '[DEBUG] Calling /project-tracking/documents/search',
        data: { params }
      })
      const res = await api.get('/project-tracking/documents/search', { params })
      const docs = res?.data?.data?.documents || []
      reportAttachFolderDebug({
        hypothesisId: 'C',
        location: 'ProjectTracking.jsx:LinkDocumentModal:search',
        msg: '[DEBUG] Search response received',
        data: { count: Array.isArray(docs) ? docs.length : null }
      })
      setResults(docs)
    } catch (error) {
      reportAttachFolderDebug({
        hypothesisId: 'E',
        location: 'ProjectTracking.jsx:LinkDocumentModal:search',
        msg: '[DEBUG] Search request failed',
        data: { message: error?.response?.data?.message || error?.message || 'unknown', status: error?.response?.status || null }
      })
      throw error
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (!selectedFolderId && query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = window.setTimeout(() => {
      search(query, selectedFolderId)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, selectedFolderId])

  const toggleDocument = (result) => {
    const key = String(result.id)
    setSelectedDocuments((prev) => {
      if (prev[key]) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: result }
    })
    setSubmitError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (selectedEntries.length === 0) return

    setSubmitError('')
    setSubmitting(true)
    const successes = []
    const failures = []

    try {
      for (const result of selectedEntries) {
        try {
          await api.post(`/project-tracking/items/${item.id}/link-document`, { documentId: Number(result.id) })
          successes.push(result)
        } catch (error) {
          failures.push({
            id: result.id,
            title: getDocumentTitleLabel(result.document || result),
            message: getApiErrorMessage(error, 'Unable to attach one of the selected documents.')
          })
        }
      }
    } finally {
      setSubmitting(false)
    }

    if (successes.length > 0) {
      onLinked({
        linkedCount: successes.length,
        failedCount: failures.length,
        failures
      })
      return
    }

    setSubmitError(buildAttachSummaryMessage({ linkedCount: 0, failedCount: failures.length, failures }))
  }

  return (
    <ModalShell title="Attach Existing Document" onClose={onClose} maxWidthClass="max-w-4xl">
      <form onSubmit={submit} className="space-y-4">
        <AssignmentSummary
          modeLabel="Attach existing document to required item"
          phaseLabel={getPhaseTitle(phase, '-')}
          stageLabel={item.stage?.name}
          documentTypeLabel={item.documentType?.name}
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-semibold text-ink-secondary">Browse Folder</label>
              {selectedFolderId && (
                <button
                  type="button"
                  onClick={() => setSelectedFolderId('')}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <AppSurface padding="sm" variant="panel">
              {foldersLoading ? (
                <div className="flex items-center justify-center py-6 text-sm text-ink-soft">
                  <InlineSpinner className="h-4 w-4" />
                  <span className="ml-2">Loading folders...</span>
                </div>
              ) : (
                <FolderTreePicker
                  folders={folders}
                  selectedId={selectedFolderId}
                  onSelect={handleFolderSelect}
                  searchPlaceholder="Search folder name or path"
                  emptySelectionText="All folders"
                  selectedLabel="Selected folder"
                  treeClassName="max-h-72"
                />
              )}
            </AppSurface>
            <div className="text-xs text-ink-soft">
              {selectedFolderId
                ? 'Listing documents from the selected folder. Add a keyword to narrow the result.'
                : 'Pick a folder to list files under it, or leave it empty and search globally.'}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-ink-secondary">Find Existing Document</label>
            <div className="flex gap-2">
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
                placeholder={selectedFolderId ? 'Search within selected folder by file code or title...' : 'Search globally by file code or title...'}
              />
              <Button type="button" variant="secondary" onClick={() => search(query, selectedFolderId)} disabled={searching || !canSearch}>
                {searching && <InlineSpinner className="h-4 w-4" />}
                {selectedFolderId ? 'Search Folder' : 'Search All'}
              </Button>
            </div>
            <div className="text-xs text-ink-soft">
              {selectedFolderId
                ? 'Search covers accessible documents inside the chosen folder.'
                : 'Search covers all accessible documents in the system, including published documents outside this project.'}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {['ALL', 'PUBLISHED', 'DRAFT'].map((filterValue) => (
                <button
                  key={filterValue}
                  type="button"
                  onClick={() => setStatusFilter(filterValue)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    statusFilter === filterValue
                      ? 'border-white/10 bg-brand text-ink-inverse'
                      : 'border-border bg-surface text-ink-secondary hover:bg-surface-muted hover:text-ink'
                  }`}
                >
                  {filterValue === 'ALL' ? 'All' : filterValue === 'PUBLISHED' ? 'Published' : 'Draft'}
                </button>
              ))}
            </div>
            {filteredResults.length > 0 && (
              <AppSurface padding="none" variant="panel" className="max-h-72 overflow-auto">
                {filteredResults.map((r) => {
                  const isSelected = Boolean(selectedDocuments[String(r.id)])
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleDocument(r)}
                      className={`w-full border-b border-border px-3 py-3 text-left text-sm transition-colors hover:bg-surface-muted last:border-b-0 ${
                        isSelected ? 'bg-brand/5 ring-1 ring-inset ring-brand/20' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input type="checkbox" readOnly checked={isSelected} className="mt-1 h-4 w-4" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-ink">{getDocumentCodeLabel(r.document || r)}</div>
                          <div className="text-ink-secondary">{getDocumentTitleLabel(r.document || r)}</div>
                          <div className="mt-1 inline-flex items-center gap-2">
                            <ConfidentialBadge isConfidential={r.document?.isConfidential || r.isConfidential} />
                            <DocumentStatusBadge status={r.document?.status || r.status} />
                          </div>
                          <div className="mt-1 text-xs text-ink-soft">
                            {`${r.iteration?.project?.code || '-'} • ${getPhaseTitle(r.iteration, 'Phase')} • ${r.stage?.name || '-'}`}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </AppSurface>
            )}
            {!searching && canSearch && filteredResults.length === 0 && (
              <EmptyPanelState
                title={results.length === 0 ? 'No matching documents found' : 'No documents match the selected status'}
                description={results.length === 0
                  ? (selectedFolderId
                    ? 'Try another keyword or switch to a different folder.'
                    : 'Try file code prefix, full file code, or part of the title.')
                  : 'Try switching the status filter.'}
              />
            )}
          </div>
        </div>
        <div className="text-xs text-ink-soft">
          {selectedCount > 0
            ? `${selectedCount} document${selectedCount === 1 ? '' : 's'} selected and ready to attach to this required item.`
            : 'Search and select one or more documents from the list above.'}
        </div>
        {submitError && (
          <div className="rounded-xl border border-[var(--dms-color-danger-soft)] bg-[var(--dms-color-danger-soft)] px-3 py-2 text-xs text-[var(--dms-color-danger-ink)]">
            {submitError}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={submitting || selectedCount === 0} type="submit">
            {submitting && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
            {submitting ? 'Attaching...' : `Attach ${selectedCount || ''}`.trim()}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

function CreateDocumentModal({ item, phase, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dateOfDocument, setDateOfDocument] = useState('')
  const [loading, setLoading] = useState(false)
  const willCreateConfidential = Boolean(item?.isConfidentialDefault)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post(`/project-tracking/items/${item.id}/create-document`, {
        title,
        description: description || null,
        dateOfDocument: dateOfDocument || null
      })
      onCreated(res?.data?.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const base = `${item.documentType?.name || 'Document'} - ${item.stage?.name || ''}`.trim()
    setTitle(base)
  }, [item?.id])

  return (
    <ModalShell title="Create New Document" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <AssignmentSummary
          modeLabel="Create new document for required item"
          phaseLabel={getPhaseTitle(phase, '-')}
          stageLabel={item.stage?.name}
          documentTypeLabel={item.documentType?.name}
        />
        <div className="rounded-xl border border-[var(--dms-color-info-soft)] bg-[var(--dms-color-info-soft)] px-3 py-2 text-xs text-[var(--dms-color-info-ink)]">
          This follows the NDR concept more closely: the system auto-generates a file code, assigns you as owner, and creates the document directly in Draft for this required item.
        </div>
        {willCreateConfidential && (
          <div className="rounded-xl border border-[var(--dms-color-danger-soft)] bg-[var(--dms-color-danger-soft)] px-3 py-2 text-xs text-[var(--dms-color-danger-ink)]">
            This required item is confidential by default. The new draft will be created as confidential automatically.
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Title</label>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Date of Document</label>
          <TextInput
            type="date"
            value={dateOfDocument}
            onChange={(e) => setDateOfDocument(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Remarks / Description</label>
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={loading} type="submit">
            {loading && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
            {loading ? 'Creating...' : willCreateConfidential ? 'Create Confidential Draft' : 'Create Draft'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

function ProjectsList({ onOpenProject }) {
  const { itemsPerPage, t } = usePreferences()
  const [projects, setProjects] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [showCreate, setShowCreate] = useState(false)

  const canCreate = hasPermission('projectTracking', 'create')

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/project-tracking/projects')
      const data = res?.data?.data?.projects || []
      setProjects(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    let next = projects
    if (search) {
      const q = search.toLowerCase()
      next = next.filter((p) => String(p.code || '').toLowerCase().includes(q) || String(p.name || '').toLowerCase().includes(q))
    }
    setFiltered(next)
    setCurrentPage(1)
  }, [projects, search])

  const totalItems = filtered.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t ? t('search') : 'Search...'}
            className="w-full sm:max-w-md"
          />
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)}>
            Create Project
          </Button>
        )}
      </div>

      {loading ? (
        <AppSurface padding="lg">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <InlineSpinner />
            <span>Loading projects...</span>
          </div>
        </AppSurface>
      ) : totalItems === 0 ? (
        <EmptyState title="No projects" message="Create a project to start tracking documents by stage." />
      ) : (
        <AppSurface padding="none" className="overflow-hidden">
          <TableContainer className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th>Category</Th>
                  <Th>Manager</Th>
                  <Th>Latest Phase</Th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p) => (
                  <Tr key={p.id} className="cursor-pointer" onClick={() => onOpenProject(p.id)}>
                    <Td className="font-medium text-brand">{p.code}</Td>
                    <Td className="text-ink">{p.name}</Td>
                    <Td><ProjectStatusBadge status={p.status} /></Td>
                    <Td>{p.projectCategory?.name || '-'}</Td>
                    <Td>
                      {`${p.manager?.firstName || ''} ${p.manager?.lastName || ''}`.trim() || p.manager?.email || '-'}
                    </Td>
                    <Td>
                      {p.iterations?.[0] ? `Phase ${p.iterations[0].iterationNo} • ${p.iterations[0].currentStage?.name || '-'}` : '-'}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalRecords={totalItems}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          )}
        </AppSurface>
      )}

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(project) => {
            setShowCreate(false)
            load()
            if (project?.id) onOpenProject(project.id)
          }}
        />
      )}
    </div>
  )
}

function ProjectStageBulletTimeline({
  stages,
  currentStageId,
  documentsByStage = new Map(),
  documentsLoading = false,
  documentsError = ''
}) {
  const ordered = Array.isArray(stages) ? stages : []
  const currentIndex = ordered.findIndex((s) => String(s.id) === String(currentStageId))
  const orderedStageIds = ordered.map((stage) => String(stage.id)).join('|')
  const [expandedStageIds, setExpandedStageIds] = useState([])

  useEffect(() => {
    const defaultStage = currentIndex >= 0 ? ordered[currentIndex] : ordered[0]
    setExpandedStageIds(defaultStage?.id != null ? [String(defaultStage.id)] : [])
  }, [currentIndex, orderedStageIds])

  if (ordered.length === 0) {
    return <div className="text-sm text-ink-muted">No stages configured for this project.</div>
  }

  return (
    <Timeline
      sx={{
        p: 0,
        m: 0,
        [`& .${timelineItemClasses.root}:before`]: {
          flex: 0,
          padding: 0
        }
      }}
    >
      {ordered.map((stage, index) => {
        const state =
          currentIndex >= 0
            ? index < currentIndex
              ? 'done'
              : index === currentIndex
                ? 'current'
                : 'upcoming'
            : 'upcoming'

        const lineTone =
          state === 'done'
            ? 'var(--dms-color-success-ink)'
            : state === 'current'
              ? 'var(--dms-color-brand)'
              : 'var(--dms-color-border)'

        const cardTone =
          state === 'done'
            ? 'border-[var(--dms-color-success-ink)]/20 bg-[var(--dms-color-success-soft)]/35'
            : state === 'current'
              ? 'border-brand/25 bg-[var(--dms-color-info-soft)]/40 shadow-[0_0_0_1px_rgba(59,130,246,0.08)]'
              : 'border-border bg-surface-muted'

        const badgeTone =
          state === 'done'
            ? 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]'
            : state === 'current'
              ? 'bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]'
              : 'border border-border bg-surface text-ink-secondary'

        const badgeLabel = state === 'done' ? 'Completed' : state === 'current' ? 'Current' : 'Upcoming'
        const stageDocuments = documentsByStage.get(stage.id) || []
        const isExpanded = expandedStageIds.includes(String(stage.id))
        const dotVariant = state === 'upcoming' ? 'outlined' : 'filled'
        const dotSx =
          state === 'done'
            ? {
                borderColor: 'var(--dms-color-success-ink)',
                backgroundColor: 'var(--dms-color-success-ink)',
                boxShadow: 'none'
              }
            : state === 'current'
              ? {
                  borderColor: 'var(--dms-color-brand)',
                  backgroundColor: 'var(--dms-color-brand)',
                  boxShadow: '0 0 0 6px rgba(59,130,246,0.12)'
                }
              : {
                  borderColor: 'var(--dms-color-border-strong)',
                  backgroundColor: 'var(--dms-color-surface)',
                  boxShadow: 'none'
                }

        return (
          <TimelineItem
            key={stage.id}
            sx={{
              alignItems: 'stretch',
              minHeight: 'unset',
              '&:not(:last-child)': {
                pb: 2
              }
            }}
          >
            <TimelineSeparator sx={{ mr: 2, minWidth: '20px' }}>
              <TimelineDot
                variant={dotVariant}
                sx={{
                  my: 0.5,
                  mx: 0,
                  p: 0,
                  width: '14px',
                  height: '14px',
                  borderWidth: '2px',
                  ...dotSx
                }}
              />
              {index < ordered.length - 1 ? (
                <TimelineConnector
                  sx={{
                    width: '2px',
                    borderRadius: '9999px',
                    backgroundColor: lineTone,
                    opacity: state === 'upcoming' ? 0.6 : 0.28
                  }}
                />
              ) : null}
            </TimelineSeparator>
            <TimelineContent sx={{ py: 0, px: 0, minWidth: 0 }}>
              <div className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${cardTone}`}>
                <div>
                  <div className="text-sm font-semibold text-ink">{stage.label}</div>
                  <div className="mt-1 text-xs text-ink-muted">
                    {state === 'done'
                      ? 'This stage is completed.'
                      : state === 'current'
                        ? 'This is the current active stage.'
                        : 'This stage has not started yet.'}
                  </div>
                  <div className="mt-2 text-xs font-medium text-ink-secondary">
                    {`${stageDocuments.length} attached document${stageDocuments.length === 1 ? '' : 's'}`}
                  </div>
                </div>
                <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${badgeTone}`}>
                  {badgeLabel}
                </span>
              </div>

              <div className="pl-0">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedStageIds((prev) =>
                      prev.includes(String(stage.id))
                        ? prev.filter((id) => id !== String(stage.id))
                        : [...prev, String(stage.id)]
                    )
                  }
                  className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-brand hover:underline"
                >
                  {isExpanded ? 'Collapse documents' : `Expand documents (${stageDocuments.length})`}
                </button>

                {isExpanded && (
                  <div className="mt-3 space-y-2">
                    {documentsLoading ? (
                      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-3 py-3 text-xs text-ink-muted">
                        <InlineSpinner className="h-3.5 w-3.5" />
                        <span>Loading attached documents...</span>
                      </div>
                    ) : documentsError ? (
                      <div className="rounded-xl border border-[var(--dms-color-warning-ink)]/20 bg-[var(--dms-color-warning-soft)]/40 px-3 py-3 text-xs text-[var(--dms-color-warning-ink)]">
                        {documentsError}
                      </div>
                    ) : stageDocuments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-surface px-3 py-3 text-xs text-ink-muted">
                        No documents attached to this stage yet.
                      </div>
                    ) : (
                      stageDocuments.map((entry) => (
                        <div key={entry.id} className="rounded-xl border border-border bg-surface px-3 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-ink">{getDocumentCodeLabel(entry.document)}</span>
                                <DocumentStatusBadge status={entry.document?.status} />
                                <ConfidentialBadge isConfidential={entry.document?.isConfidential} />
                              </div>
                              <div className="mt-1 text-sm text-ink-secondary">{getDocumentTitleLabel(entry.document)}</div>
                              <div className="mt-1 text-xs text-ink-muted">{entry.documentTypeName}</div>
                              {entry.itemStatus ? (
                                <div className="mt-1 text-xs text-ink-muted">{`Checklist status: ${entry.itemStatus}`}</div>
                              ) : null}
                              {entry.document?.isConfidential && entry.document?.canAccess !== true ? (
                                <div className="mt-1 text-xs font-medium text-ink-muted">Confidential access required for full document access.</div>
                              ) : null}
                            </div>
                            <span className="inline-flex w-fit rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-medium text-ink-secondary">
                              {entry.source}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </TimelineContent>
          </TimelineItem>
        )
      })}
    </Timeline>
  )
}

function ProjectPhaseTimeline({ events }) {
  const rows = Array.isArray(events) ? events : []
  if (rows.length === 0) {
    return <div className="text-sm text-ink-muted">No timeline recorded yet.</div>
  }

  return (
    <div className="space-y-3">
      {rows.map((e) => (
        <div key={e.key} className="flex items-start gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3">
          <div className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-brand" />
          <div className="flex-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-ink">{e.title}</div>
              <div className="text-xs text-ink-muted">{e.timeLabel}</div>
            </div>
            {e.subtitle && <div className="mt-1 text-xs text-ink-secondary">{e.subtitle}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function ProjectDashboard({ onOpenProject }) {
  const { itemsPerPage } = usePreferences()
  const [projects, setProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectQuery, setProjectQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)
  const [activityLogs, setActivityLogs] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [expandedPhaseIds, setExpandedPhaseIds] = useState([])
  const [phaseStageData, setPhaseStageData] = useState({})

  useEffect(() => {
    setPageSize(itemsPerPage)
  }, [itemsPerPage])

  const loadProjects = async () => {
    setLoadingProjects(true)
    try {
      const res = await api.get('/project-tracking/projects')
      const data = res?.data?.data?.projects || []
      setProjects(data)
    } finally {
      setLoadingProjects(false)
    }
  }

  const loadProjectDetail = async (id) => {
    if (!id) return
    setLoadingDetail(true)
    try {
      const [projectRes, logRes] = await Promise.all([
        api.get(`/project-tracking/projects/${id}`),
        api.get(`/project-tracking/projects/${id}/activity-logs`, { params: { page: 1, limit: 250 } })
      ])
      setSelectedProject(projectRes?.data?.data?.project || null)
      setActivityLogs(logRes?.data?.data?.logs || [])
    } finally {
      setLoadingDetail(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const filteredProjects = useMemo(() => {
    if (!projectQuery) return projects
    const q = projectQuery.toLowerCase()
    return projects.filter((p) => String(p.code || '').toLowerCase().includes(q) || String(p.name || '').toLowerCase().includes(q))
  }, [projectQuery, projects])

  useEffect(() => {
    setCurrentPage(1)
  }, [projectQuery])

  const totalItems = filteredProjects.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const paginated = filteredProjects.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const dashboardMetrics = useMemo(() => {
    const totalProjects = projects.length
    const activeProjects = projects.filter((project) => String(project.status || '').toUpperCase() === 'ACTIVE').length
    const categoryCount = new Set(
      projects
        .map((project) => String(project.projectCategory?.name || '').trim())
        .filter(Boolean)
    ).size

    const stageCounts = new Map()
    projects.forEach((project) => {
      const latestPhase = project.iterations?.[0]
      const stageName = String(latestPhase?.currentStage?.name || '').trim()
      if (!stageName) return
      stageCounts.set(stageName, (stageCounts.get(stageName) || 0) + 1)
    })

    const topStageEntry = Array.from(stageCounts.entries()).sort((a, b) => b[1] - a[1])[0] || null

    return {
      totalProjects,
      activeProjects,
      categoryCount,
      topStageLabel: topStageEntry ? topStageEntry[0] : '-',
      topStageCount: topStageEntry ? topStageEntry[1] : 0
    }
  }, [projects])

  const stageSteps = useMemo(() => {
    const enabled = Array.isArray(selectedProject?.enabledStages) ? selectedProject.enabledStages : []
    return enabled
      .slice()
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((s) => ({ id: s.stageId, label: s.name }))
  }, [selectedProject])

  const stageNameMap = useMemo(() => {
    const map = new Map()
    ;(selectedProject?.enabledStages || []).forEach((s) => {
      map.set(String(s.stageId), s.name)
    })
    return map
  }, [selectedProject])

  const timelinesByIteration = useMemo(() => {
    const map = new Map()
    const rows = Array.isArray(activityLogs) ? activityLogs : []
    const phaseRe = /phase\s+(\d+)/i

    rows.forEach((log) => {
      if (String(log.entity || '') !== 'ProjectIteration') return
      const meta = log.metadata || {}
      const iterationNo =
        Number.isFinite(parseInt(meta.iterationNo, 10))
          ? parseInt(meta.iterationNo, 10)
          : phaseRe.test(String(log.description || ''))
            ? parseInt(String(log.description || '').match(phaseRe)?.[1] || '', 10)
            : null
      if (!iterationNo) return

      if (!map.has(iterationNo)) map.set(iterationNo, [])

      if (String(log.action || '') === 'CREATE') {
        map.get(iterationNo).push({
          key: `${log.id}:create`,
          timestamp: log.timestamp,
          title: 'Phase created',
          subtitle: log.user ? `By ${log.user}` : null
        })
        return
      }

      const fromStageId = meta.fromStageId
      const toStageId = meta.toStageId
      if (String(log.action || '') === 'UPDATE' && fromStageId && toStageId) {
        const fromName = stageNameMap.get(String(fromStageId)) || `Stage ${fromStageId}`
        const toName = stageNameMap.get(String(toStageId)) || `Stage ${toStageId}`
        map.get(iterationNo).push({
          key: `${log.id}:move`,
          timestamp: log.timestamp,
          title: `Moved to ${toName}`,
          subtitle: `${fromName} → ${toName}${log.user ? ` • By ${log.user}` : ''}`
        })
      }
    })

    for (const [iterNo, events] of map.entries()) {
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      map.set(
        iterNo,
        events.map((e) => ({
          ...e,
          timeLabel: e.timestamp ? new Date(e.timestamp).toLocaleString() : '-'
        }))
      )
    }

    return map
  }, [activityLogs, stageNameMap])

  const phases = useMemo(() => {
    const list = Array.isArray(selectedProject?.iterations) ? selectedProject.iterations : []
    return list.slice().sort((a, b) => (a.iterationNo || 0) - (b.iterationNo || 0))
  }, [selectedProject])

  useEffect(() => {
    if (!phases.length) {
      setExpandedPhaseIds([])
      return
    }
    const latestPhaseId = phases[phases.length - 1]?.id
    setExpandedPhaseIds(latestPhaseId ? [latestPhaseId] : [])
  }, [selectedProject?.id, phases])

  useEffect(() => {
    setPhaseStageData({})
  }, [selectedProject?.id])

  async function loadPhaseStageData(phaseId) {
    if (!phaseId) return

    const existing = phaseStageData[phaseId]
    if (existing?.loading || existing?.loaded) return

    setPhaseStageData((prev) => ({
      ...prev,
      [phaseId]: {
        items: prev[phaseId]?.items || [],
        stageLinks: prev[phaseId]?.stageLinks || [],
        loading: true,
        loaded: false,
        error: ''
      }
    }))

    try {
      const [itemsRes, docsRes] = await Promise.all([
        api.get(`/project-tracking/iterations/${phaseId}/items`),
        api.get(`/project-tracking/iterations/${phaseId}/stage-documents`)
      ])

      setPhaseStageData((prev) => ({
        ...prev,
        [phaseId]: {
          items: itemsRes?.data?.data?.items || [],
          stageLinks: docsRes?.data?.data?.documents || [],
          loading: false,
          loaded: true,
          error: ''
        }
      }))
    } catch (error) {
      console.error('Failed to load phase stage documents:', error)
      setPhaseStageData((prev) => ({
        ...prev,
        [phaseId]: {
          items: [],
          stageLinks: [],
          loading: false,
          loaded: true,
          error: 'Unable to load attached documents for this phase right now.'
        }
      }))
    }
  }

  const openProject = async (id) => {
    if (!id) return
    setSelectedProjectId(id)
    await loadProjectDetail(id)
  }

  const togglePhase = (phaseId) => {
    setExpandedPhaseIds((prev) =>
      prev.includes(phaseId)
        ? prev.filter((id) => id !== phaseId)
        : [...prev, phaseId]
    )
  }

  useEffect(() => {
    expandedPhaseIds.forEach((phaseId) => {
      void loadPhaseStageData(phaseId)
    })
  }, [expandedPhaseIds])

  return (
    <div className="space-y-5">
      <AppSurface padding="none" className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-ink">Project Dashboard</div>
            <div className="mt-1 text-sm text-ink-muted">List all projects and click one to see the current stage and timeline.</div>
          </div>
          <Button type="button" onClick={loadProjects} disabled={loadingProjects}>
            {loadingProjects ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Total Projects</div>
            <div className="mt-2 text-2xl font-semibold text-ink">{dashboardMetrics.totalProjects}</div>
            <div className="mt-1 text-sm text-ink-secondary">All tracked projects in the module.</div>
          </div>

          <div className="rounded-2xl border border-border bg-[var(--dms-color-success-soft)] px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--dms-color-success-ink)]/80">Active Projects</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--dms-color-success-ink)]">{dashboardMetrics.activeProjects}</div>
            <div className="mt-1 text-sm text-[var(--dms-color-success-ink)]/80">Projects currently marked as active.</div>
          </div>

          <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Categories</div>
            <div className="mt-2 text-2xl font-semibold text-ink">{dashboardMetrics.categoryCount}</div>
            <div className="mt-1 text-sm text-ink-secondary">Unique project categories in use.</div>
          </div>

          <div className="rounded-2xl border border-border bg-[var(--dms-color-info-soft)] px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--dms-color-info-ink)]/80">Most Common Stage</div>
            <div className="mt-2 text-lg font-semibold text-[var(--dms-color-info-ink)]">{dashboardMetrics.topStageLabel}</div>
            <div className="mt-1 text-sm text-[var(--dms-color-info-ink)]/80">
              {dashboardMetrics.topStageCount > 0
                ? `${dashboardMetrics.topStageCount} project${dashboardMetrics.topStageCount > 1 ? 's' : ''} currently at this stage.`
                : 'No latest phase stage data available yet.'}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-6 py-4">
          <TextInput
            value={projectQuery}
            onChange={(e) => setProjectQuery(e.target.value)}
            placeholder="Search project code/name..."
            className="w-full sm:max-w-md"
          />
        </div>

        {loadingProjects ? (
          <div className="px-6 pb-6">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <InlineSpinner />
              <span>Loading projects...</span>
            </div>
          </div>
        ) : totalItems === 0 ? (
          <div className="px-6 pb-6">
            <EmptyPanelState title="No projects found" message="Try clearing the search or create a new project." />
          </div>
        ) : (
          <>
            <TableContainer className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>Name</Th>
                    <Th>Status</Th>
                    <Th>Category</Th>
                    <Th>Manager</Th>
                    <Th>Latest Phase</Th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((p) => (
                    <Tr
                      key={p.id}
                      className={`cursor-pointer ${String(selectedProjectId) === String(p.id) ? 'bg-[var(--dms-color-info-soft)]/60' : ''}`}
                      onClick={() => openProject(p.id)}
                    >
                      <Td className="font-medium text-brand">{p.code}</Td>
                      <Td className="text-ink">{p.name}</Td>
                      <Td><ProjectStatusBadge status={p.status} /></Td>
                      <Td>{p.projectCategory?.name || '-'}</Td>
                      <Td>
                        {`${p.manager?.firstName || ''} ${p.manager?.lastName || ''}`.trim() || p.manager?.email || '-'}
                      </Td>
                      <Td>
                        {p.iterations?.[0] ? `Phase ${p.iterations[0].iterationNo} • ${p.iterations[0].currentStage?.name || '-'}` : '-'}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
            {totalPages > 1 && (
              <div className="px-6 py-4">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  totalRecords={totalItems}
                  pageSize={pageSize}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </>
        )}
      </AppSurface>

      {loadingDetail ? (
        <AppSurface padding="lg" className="flex items-center gap-3">
          <InlineSpinner className="h-4 w-4" />
          <span className="text-sm text-ink-muted">Loading project...</span>
        </AppSurface>
      ) : !selectedProject ? (
        <EmptyPanelState title="Select a project" message="Click a project from the list above to see the current stage and timeline." />
      ) : (
        <div className="space-y-5">
          <AppSurface padding="lg">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-lg font-semibold text-ink">{selectedProject.name}</div>
                <div className="mt-1 text-sm text-ink-muted">
                  {selectedProject.code ? `${selectedProject.code} • ` : ''}
                  {formatLifecycleStatus(selectedProject.status)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ProjectStatusBadge status={selectedProject.status} />
                <Button type="button" variant="secondary" onClick={() => onOpenProject(selectedProject.id)}>
                  Open Project Detail
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Category</div>
                <div className="mt-1 text-sm font-semibold text-ink">{selectedProject.projectCategory?.name || '-'}</div>
              </div>
              <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Manager</div>
                <div className="mt-1 text-sm font-semibold text-ink">
                  {`${selectedProject.manager?.firstName || ''} ${selectedProject.manager?.lastName || ''}`.trim() || selectedProject.manager?.email || '-'}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Latest Phase</div>
                <div className="mt-1 text-sm font-semibold text-ink">
                  {selectedProject.iterations?.[0]
                    ? `Phase ${selectedProject.iterations[0].iterationNo} • ${selectedProject.iterations[0].currentStage?.name || '-'}`
                    : '-'}
                </div>
              </div>
            </div>
          </AppSurface>

          {phases.length === 0 ? (
            <EmptyPanelState title="No phases yet" message="Create a phase to start tracking stage progress and timeline." />
          ) : (
            phases.map((phase) => (
              <AppSurface key={phase.id} padding="lg" className="space-y-4">
                <button
                  type="button"
                  onClick={() => togglePhase(phase.id)}
                  className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-base font-semibold text-ink">{getPhaseTitle(phase, 'Phase')}</div>
                    <div className="mt-1 text-sm text-ink-muted">{`Current Stage: ${phase.currentStage?.name || '-'}`}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-medium text-ink-muted">
                      {phase.visibleDocumentLinksCount != null ? `${phase.visibleDocumentLinksCount} linked docs` : ''}
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                      {expandedPhaseIds.includes(phase.id) ? 'Collapse' : 'Expand'}
                    </span>
                  </div>
                </button>

                {expandedPhaseIds.includes(phase.id) && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-ink">Stage Timeline</div>
                      <ProjectStageBulletTimeline
                        stages={stageSteps}
                        currentStageId={phase.currentStageId}
                        documentsByStage={buildStageDocumentGroups(
                          phaseStageData[phase.id]?.items || [],
                          phaseStageData[phase.id]?.stageLinks || []
                        )}
                        documentsLoading={phaseStageData[phase.id]?.loading === true}
                        documentsError={phaseStageData[phase.id]?.error || ''}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-ink">Activity Timeline</div>
                      <ProjectPhaseTimeline events={timelinesByIteration.get(phase.iterationNo) || []} />
                    </div>
                  </div>
                )}
              </AppSurface>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ProjectDetail({ projectId }) {
  const navigate = useNavigate()
  const uiVersionStamp = 'PT-20260617-R3'
  const consolidatedTabId = '__consolidated__'
  const { itemsPerPage } = usePreferences()
  const canOpenProjectSetup = hasPermission('projectTracking', 'projectSetup')
  const canCreate = hasPermission('projectTracking', 'create')
  const canLink = hasPermission('projectTracking', 'linkDocument')
  const canAdvance = hasPermission('projectTracking', 'advanceStage')
  const canEdit = hasPermission('projectTracking', 'edit')
  const canDelete = hasPermission('projectTracking', 'delete')
  const canManageLinkedDocumentAccess = hasPermission('projectTracking', 'manageConfidentialAccess')
  const canOpenProjectControls = hasPermission('projectTracking', 'projectControls') || canEdit || canDelete
  const canViewActivityLogs = hasPermission('projectTracking', 'activityLogs') || hasPermission('projectTracking', 'view')
  const canKeyInChangeRequest = hasPermission('projectTracking', 'keyInChangeRequest') || canEdit
  const canEditProject = hasPermission('projectTracking', 'editProject') || canEdit
  const canOpenMoreActions = canOpenProjectControls || canViewActivityLogs || canKeyInChangeRequest || canEditProject
  const canAddNextPhase = hasPermission('projectTracking', 'addNextPhase') || canCreate
  const canMoveToNextStage = hasPermission('projectTracking', 'moveToNextStage') || canAdvance

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedIterationId, setSelectedIterationId] = useState(null)
  const [activeStageTab, setActiveStageTab] = useState(null)
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [stageDocuments, setStageDocuments] = useState([])
  const [docTypes, setDocTypes] = useState([])
  const [showLink, setShowLink] = useState(null)
  const [showCreateDoc, setShowCreateDoc] = useState(null)
  const [showStageLink, setShowStageLink] = useState(null)
  const [showStageCreate, setShowStageCreate] = useState(null)
  const [showCreatePhase, setShowCreatePhase] = useState(false)
  const [showEditPhase, setShowEditPhase] = useState(null)
  const [showDocumentAccess, setShowDocumentAccess] = useState(null)
  const [showActivity, setShowActivity] = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [showProjectControls, setShowProjectControls] = useState(false)
  const [showShareDocument, setShowShareDocument] = useState(null)
  const [showProjectInfo, setShowProjectInfo] = useState(false)
  const overallDocsPageSizeOptions = useMemo(() => [5, 10, 20, 50], [])
  const normalizeOverallDocsPageSize = useCallback((value) => {
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return overallDocsPageSizeOptions[0]
    }
    const exactMatch = overallDocsPageSizeOptions.find((option) => option === numericValue)
    if (exactMatch) return exactMatch
    return overallDocsPageSizeOptions.find((option) => option > numericValue) || overallDocsPageSizeOptions[overallDocsPageSizeOptions.length - 1]
  }, [overallDocsPageSizeOptions])
  const [overallDocsPage, setOverallDocsPage] = useState(1)
  const [overallDocsPageSize, setOverallDocsPageSize] = useState(() => normalizeOverallDocsPageSize(itemsPerPage))
  const [focusRequiredItemId, setFocusRequiredItemId] = useState('')
  const [requiredDocumentAssignments, setRequiredDocumentAssignments] = useState({})
  const [canAssignRequiredDocumentPic, setCanAssignRequiredDocumentPic] = useState(false)
  const [showAssignRequiredDocumentPic, setShowAssignRequiredDocumentPic] = useState(null)
  const [assignPicQuery, setAssignPicQuery] = useState('')
  const [assignPicResults, setAssignPicResults] = useState([])
  const [assignPicSearching, setAssignPicSearching] = useState(false)
  const [selectedRequirementPicUser, setSelectedRequirementPicUser] = useState(null)
  const [savingRequirementPic, setSavingRequirementPic] = useState(false)
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [advancing, setAdvancing] = useState(false)
  const [changeRequests, setChangeRequests] = useState([])
  const [changeRequestsLoading, setChangeRequestsLoading] = useState(false)
  const [isChangeLogExpanded, setIsChangeLogExpanded] = useState(false)
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false)
  const [editChangeRequest, setEditChangeRequest] = useState(null)

  const loadProject = async (preferredIterationId = null) => {
    setLoading(true)
    try {
      const res = await api.get(`/project-tracking/projects/${projectId}`)
      const p = res?.data?.data?.project
      setProject(p)
      const nextSelectedId =
        p?.iterations?.find((it) => it.id === preferredIterationId)?.id ||
        p?.iterations?.find((it) => it.id === selectedIterationId)?.id ||
        p?.iterations?.[0]?.id ||
        null
      setSelectedIterationId(nextSelectedId)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setOverallDocsPageSize(normalizeOverallDocsPageSize(itemsPerPage))
  }, [itemsPerPage, normalizeOverallDocsPageSize])

  useEffect(() => {
    setOverallDocsPage(1)
  }, [selectedIterationId])

  const loadItems = async (iterationId) => {
    if (!iterationId) return
    setItemsLoading(true)
    try {
      const res = await api.get(`/project-tracking/iterations/${iterationId}/items`)
      setItems(res?.data?.data?.items || [])
      const docsRes = await api.get(`/project-tracking/iterations/${iterationId}/stage-documents`)
      setStageDocuments(docsRes?.data?.data?.documents || [])
    } finally {
      setItemsLoading(false)
    }
  }

  const loadChangeRequests = async (iterationId) => {
    if (!iterationId) {
      setChangeRequests([])
      return
    }
    setChangeRequestsLoading(true)
    try {
      const res = await api.get(`/project-tracking/projects/${projectId}/change-requests`, {
        params: { iterationId }
      })
      setChangeRequests(res?.data?.data?.changeRequests || [])
    } finally {
      setChangeRequestsLoading(false)
    }
  }

  const loadRequiredDocumentAssignments = async () => {
    try {
      const res = await api.get(`/project-tracking/projects/${projectId}/required-documents`)
      const rows = res?.data?.data?.requiredDocuments || []
      const assignmentMap = rows.reduce((acc, row) => {
        if (row?.stageId && row?.documentType?.id) {
          acc[`${row.stageId}:${row.documentType.id}`] = row.assignment || null
        }
        return acc
      }, {})
      setRequiredDocumentAssignments(assignmentMap)
      setCanAssignRequiredDocumentPic(Boolean(res?.data?.data?.canAssign))
    } catch {
      setRequiredDocumentAssignments({})
      setCanAssignRequiredDocumentPic(false)
    }
  }

  useEffect(() => {
    loadProject()
  }, [projectId])

  useEffect(() => {
    loadRequiredDocumentAssignments()
  }, [projectId])

  useEffect(() => {
    if (selectedIterationId) loadItems(selectedIterationId)
  }, [selectedIterationId])

  useEffect(() => {
    if (selectedIterationId) loadChangeRequests(selectedIterationId)
  }, [selectedIterationId])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/system/config/document-types')
        setDocTypes(res?.data?.data?.documentTypes || [])
      } catch {
        setDocTypes([])
      }
    }
    load()
  }, [])

  const selectedPhase = useMemo(() => {
    return (project?.iterations || []).find((it) => it.id === selectedIterationId) || null
  }, [project, selectedIterationId])

  const enabledStageIds = useMemo(
    () => (project?.enabledStages || []).map((stage) => stage.stageId),
    [project?.enabledStages]
  )
  const hasEnabledStageConfig = Array.isArray(project?.enabledStages)

  const visibleItems = useMemo(() => {
    if (!hasEnabledStageConfig) return items
    if (!enabledStageIds.length) return []
    return items.filter((item) => enabledStageIds.includes(item.stageId))
  }, [items, enabledStageIds, hasEnabledStageConfig])

  const visibleStageDocuments = useMemo(() => {
    if (!hasEnabledStageConfig) return stageDocuments
    if (!enabledStageIds.length) return []
    return stageDocuments.filter((link) => enabledStageIds.includes(link.stageId))
  }, [stageDocuments, enabledStageIds, hasEnabledStageConfig])

  const stages = useMemo(() => {
    return (project?.enabledStages || [])
      .map((stage) => ({
        id: stage.stageId,
        stageId: stage.stageId,
        name: stage.name,
        sortOrder: stage.sortOrder
      }))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  }, [project?.enabledStages])

  useEffect(() => {
    setActiveStageTab(consolidatedTabId)
  }, [selectedIterationId])

  useEffect(() => {
    if (!stages.length) {
      setActiveStageTab(consolidatedTabId)
      return
    }

    setActiveStageTab((prev) => {
      if (prev === consolidatedTabId) return consolidatedTabId
      if (prev && stages.some((s) => s.id === prev)) return prev
      return consolidatedTabId
    })
  }, [stages])

  const stageDocumentsByStage = useMemo(() => {
    const grouped = new Map()
    visibleStageDocuments.forEach((l) => {
      const sid = l.stageId
      if (!grouped.has(sid)) grouped.set(sid, [])
      grouped.get(sid).push(l)
    })
    return grouped
  }, [visibleStageDocuments])

  const itemsByStage = useMemo(() => {
    const grouped = new Map()
    visibleItems.forEach((it) => {
      const key = it.stageId
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(it)
    })
    return grouped
  }, [visibleItems])

  const phases = useMemo(() => {
    return [...(project?.iterations || [])].sort((a, b) => (a.iterationNo || 0) - (b.iterationNo || 0))
  }, [project])

  const stageFlow = useMemo(() => {
    if (!stages.length) {
      return selectedPhase?.currentStage
        ? [{
            id: selectedPhase.currentStage.id,
            name: selectedPhase.currentStage.name,
            state: 'current',
            metrics: null
          }]
        : []
    }

    const currentSort = selectedPhase?.currentStage?.sortOrder ?? null

    return stages.map((st) => {
      const stageItems = itemsByStage.get(st.id) || []
      const total = stageItems.length
      const complete = stageItems.filter((x) => String(x.status).toUpperCase() === 'COMPLETE').length
      const state =
        selectedPhase?.currentStage?.id === st.id
          ? 'current'
          : currentSort !== null && (st.sortOrder || 0) < currentSort
            ? 'done'
            : 'upcoming'

      return {
        id: st.id,
        name: st.name,
        state,
        metrics: { total, complete }
      }
    })
  }, [stages, selectedPhase, itemsByStage])

  const openStage = (stageId) => {
    setActiveStageTab(stageId)
  }

  const openAssignRequiredDocumentPic = (item) => {
    const currentAssignment = requiredDocumentAssignments[`${item.stageId}:${item.documentTypeId}`] || null
    setShowAssignRequiredDocumentPic(item)
    setAssignPicQuery('')
    setAssignPicResults([])
    setSelectedRequirementPicUser(currentAssignment?.picUser || null)
  }

  const closeAssignRequiredDocumentPic = () => {
    if (savingRequirementPic) return
    setShowAssignRequiredDocumentPic(null)
    setAssignPicQuery('')
    setAssignPicResults([])
    setSelectedRequirementPicUser(null)
  }

  const searchAssignableUsers = async () => {
    const q = String(assignPicQuery || '').trim()
    if (!q) return
    setAssignPicSearching(true)
    try {
      const res = await api.get('/folders/access/subjects', { params: { q } })
      setAssignPicResults(res?.data?.data?.users || [])
    } finally {
      setAssignPicSearching(false)
    }
  }

  const saveRequiredDocumentPic = async (picUserId = null) => {
    if (!showAssignRequiredDocumentPic?.documentTypeId || !showAssignRequiredDocumentPic?.stageId) return
    const assignmentKey = `${showAssignRequiredDocumentPic.stageId}:${showAssignRequiredDocumentPic.documentTypeId}`
    if (picUserId === null && !requiredDocumentAssignments[assignmentKey]) {
      closeAssignRequiredDocumentPic()
      return
    }
    setSavingRequirementPic(true)
    try {
      await api.post(`/project-tracking/projects/${projectId}/required-documents/pic`, {
        stageId: showAssignRequiredDocumentPic.stageId,
        documentTypeId: showAssignRequiredDocumentPic.documentTypeId,
        picUserId
      })
      await loadRequiredDocumentAssignments()
      closeAssignRequiredDocumentPic()
      setAlertModal({
        show: true,
        title: 'Success',
        message: picUserId ? 'Required document PIC updated successfully.' : 'Required document PIC unassigned successfully.',
        type: 'success'
      })
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to update required document PIC'
      setAlertModal({ show: true, title: 'Unable to update PIC', message: msg, type: 'warning' })
    } finally {
      setSavingRequirementPic(false)
    }
  }

  const activeStage = useMemo(() => {
    return stages.find((stage) => stage.id === activeStageTab) || null
  }, [activeStageTab, stages])

  const canInteractWithDocument = (document) => {
    if (document?.canAccess === false) return false
    if (document?.isConfidential) return document?.canAccess === true
    return true
  }

  const getRequiredDocumentAssignment = (stageId, documentTypeId) => requiredDocumentAssignments[`${stageId}:${documentTypeId}`] || null

  const currentStageId = selectedPhase?.currentStage?.id || null

  const currentStageItems = useMemo(() => {
    if (!currentStageId) return []
    return itemsByStage.get(currentStageId) || []
  }, [currentStageId, itemsByStage])

  const currentStagePendingItems = useMemo(() => (
    currentStageItems.filter((item) => String(item.status || '').toUpperCase() === 'PENDING')
  ), [currentStageItems])

  const currentStageBlockingItems = useMemo(() => {
    return currentStagePendingItems.map((item) => {
      const links = Array.isArray(item.links) ? item.links : []
      const publishedLinks = links.filter((link) => String(link.document?.status || '').toUpperCase() === 'PUBLISHED')
      const draftLinks = links.filter((link) => String(link.document?.status || '').toUpperCase() === 'DRAFT')
      const reviewLinks = links.filter((link) => ['PENDING_REVIEW', 'IN_REVIEW'].includes(String(link.document?.status || '').toUpperCase()))
      const accessibleDraftLink = draftLinks.find((link) => canInteractWithDocument(link.document)) || null

      let reason = 'Waiting for published evidence.'
      if (links.length === 0) {
        reason = 'No linked document yet.'
      } else if (accessibleDraftLink) {
        reason = 'Draft available and still needs completion.'
      } else if (reviewLinks.length > 0) {
        reason = 'Document is in review and not published yet.'
      } else if (publishedLinks.length > 0) {
        reason = 'Published evidence exists but checklist has not refreshed yet.'
      } else if (links.some((link) => link.document?.isConfidential && !canInteractWithDocument(link.document))) {
        reason = 'Linked document is confidential and access is restricted.'
      }

      return {
        id: item.id,
        item,
        label: item.documentType?.name || 'Required document',
        links,
        accessibleDraftLink,
        reason
      }
    })
  }, [currentStagePendingItems])

  const currentStageHasChecklist = currentStageItems.length > 0
  const currentStageReadyToAdvance = currentStageHasChecklist && currentStagePendingItems.length === 0

  useEffect(() => {
    const nextFirstId = currentStageBlockingItems[0]?.id != null ? String(currentStageBlockingItems[0].id) : ''
    setFocusRequiredItemId((prev) => {
      if (!prev) return nextFirstId
      const stillExists = currentStageBlockingItems.some((entry) => String(entry.id) === String(prev))
      return stillExists ? prev : nextFirstId
    })
  }, [currentStageBlockingItems])

  const focusBlockingEntry = useMemo(() => {
    if (!focusRequiredItemId) return currentStageBlockingItems[0] || null
    return currentStageBlockingItems.find((entry) => String(entry.id) === String(focusRequiredItemId)) || currentStageBlockingItems[0] || null
  }, [currentStageBlockingItems, focusRequiredItemId])

  const focusBlockingItem = focusBlockingEntry?.item || null
  const focusBlockingDraftDocument = focusBlockingEntry?.accessibleDraftLink?.document || null

  const consolidatedDocuments = useMemo(() => {
    const byDocumentId = new Map()

    stageDocuments.forEach((link) => {
      if (!link?.document?.id) return
      byDocumentId.set(link.document.id, {
        id: `stage-${link.id}`,
        document: link.document,
        stageId: link.stageId,
        stageName: link.stage?.name || 'Unknown Stage',
        documentTypeName: link.document?.documentType?.name || 'Extra Document',
        source: 'Other Documents',
        itemStatus: null,
        linkedAt: link.linkedAt || link.document.updatedAt
      })
    })

    items.forEach((item) => {
      ;(item.links || []).forEach((link) => {
        if (!link?.document?.id) return
        byDocumentId.set(link.document.id, {
          id: `item-${link.id}`,
          document: link.document,
          stageId: item.stageId,
          stageName: item.stage?.name || 'Unknown Stage',
          documentTypeName: item.documentType?.name || link.document?.documentType?.name || 'Required Document',
          source: 'Required Checklist',
          itemStatus: item.status,
          linkedAt: link.linkedAt || link.document.updatedAt
        })
      })
    })

    return Array.from(byDocumentId.values()).sort((a, b) => new Date(b.linkedAt || 0).getTime() - new Date(a.linkedAt || 0).getTime())
  }, [items, stageDocuments])

  const overallDocsTotalRecords = consolidatedDocuments.length
  const overallDocsEffectivePageSize = normalizeOverallDocsPageSize(overallDocsPageSize)
  const overallDocsTotalPages = Math.max(1, Math.ceil(overallDocsTotalRecords / overallDocsEffectivePageSize))
  const overallDocsPaginated = useMemo(() => {
    const pageSize = overallDocsEffectivePageSize
    const currentPage = Math.min(Math.max(1, overallDocsPage), overallDocsTotalPages)
    return consolidatedDocuments.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [consolidatedDocuments, overallDocsEffectivePageSize, overallDocsPage, overallDocsTotalPages])

  useEffect(() => {
    if (overallDocsPage > overallDocsTotalPages) setOverallDocsPage(overallDocsTotalPages)
  }, [overallDocsPage, overallDocsTotalPages])

  const getFileNameFromContentDisposition = (value) => {
    const headerValue = String(value || '')
    const utf8Match = headerValue.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''))
      } catch {
        return utf8Match[1].trim().replace(/^"|"$/g, '')
      }
    }

    const plainMatch = headerValue.match(/filename\s*=\s*("?)([^";]+)\1/i)
    if (plainMatch?.[2]) return plainMatch[2].trim()
    return null
  }

  const downloadDocument = async (document) => {
    if (!document?.id) return
    if (!canInteractWithDocument(document)) {
      showRestrictedDocumentAlert('download this file')
      return
    }

    try {
      const res = await api.get(`/documents/${document.id}/download`, {
        responseType: 'blob'
      })

      const contentDisposition = res.headers?.['content-disposition'] || ''
      const contentType = res.headers?.['content-type'] || ''
      const fallbackName = document.fileName || document.title || document.fileCode || `document-${document.id}`
      const downloadName = getFileNameFromContentDisposition(contentDisposition) || fallbackName
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentType || undefined }))
      const link = window.document.createElement('a')

      link.href = url
      link.setAttribute('download', downloadName)
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download linked document:', error)
      const statusCode = error?.response?.status
      let serverMessage = ''
      const responseData = error?.response?.data

      if (typeof Blob !== 'undefined' && responseData instanceof Blob) {
        try {
          const text = await responseData.text()
          try {
            serverMessage = String(JSON.parse(text)?.message || '').trim()
          } catch {
            serverMessage = String(text || '').trim()
          }
        } catch {
          serverMessage = ''
        }
      } else {
        serverMessage = String(error?.response?.data?.message || '').trim()
      }

      const isRestrictedAccessError = statusCode === 403

      setAlertModal({
        show: true,
        title: isRestrictedAccessError ? 'Access Restricted' : 'Download Failed',
        message: isRestrictedAccessError
          ? 'Access to this file is restricted. You are not authorized to view or download it.'
          : 'Unable to download this file right now.',
        type: 'warning'
      })
    }
  }

  const openDocumentWorkspace = async (document) => {
    if (!document?.id) return
    if (!canInteractWithDocument(document)) {
      showRestrictedDocumentAlert('view this file')
      return
    }
    navigate(`/documents/${document.id}`)
  }

  const openDocumentDirectory = async (document) => {
    if (!document?.id) return
    if (!canInteractWithDocument(document)) {
      showRestrictedDocumentAlert('go to this file directory')
      return
    }

    const currentStatus = String(document.status || '').toUpperCase()
    if (currentStatus === 'DRAFT') {
      navigate(`/drafts?docId=${document.id}&origin=project-tracking`)
      return
    }

    try {
      const res = await api.get(`/documents/${document.id}`)
      const detailedDocument =
        res.data?.data?.document ||
        res.data?.document ||
        res.data?.data ||
        res.data

      const stage = String(detailedDocument?.stage || document.stage || '').toUpperCase()
      const folderId = Number.isFinite(parseInt(detailedDocument?.folderId, 10))
        ? parseInt(detailedDocument.folderId, 10)
        : null

      if (stage === 'DRAFT') {
        navigate(`/drafts?docId=${document.id}&origin=project-tracking`)
        return
      }

      if (stage === 'PUBLISHED' && folderId) {
        navigate(`/published?folderId=${folderId}&docId=${document.id}&origin=project-tracking`)
        return
      }

      if (stage === 'PUBLISHED') {
        navigate(`/published?docId=${document.id}&origin=project-tracking`)
        return
      }

      navigate(`/review-approval?docId=${document.id}`)
    } catch (error) {
      console.error('Failed to resolve linked document route:', error)
      navigate(`/documents/${document.id}`)
    }
  }

  const handoffCreatedDraft = async (result) => {
    const docId = result?.document?.id
    if (!docId) return
    if (selectedIterationId) await loadItems(selectedIterationId)
    navigate(`/drafts?docId=${docId}&origin=project-tracking`)
  }

  const createNamedIteration = async ({ name }) => {
    const res = await api.post(`/project-tracking/projects/${projectId}/iterations`, { name })
    const iter = res?.data?.data?.iteration
    await loadProject(iter?.id)
    if (iter?.id) setSelectedIterationId(iter.id)
  }

  const renameIteration = async (iterationId, { name }) => {
    await api.put(`/project-tracking/iterations/${iterationId}`, { name })
    await loadProject(iterationId)
  }

  const unlinkItemDocument = async (itemId, linkId) => {
    try {
      await api.delete(`/project-tracking/items/${itemId}/links/${linkId}`)
      if (selectedIterationId) await loadItems(selectedIterationId)
    } catch (error) {
      console.error('Failed to unlink item document:', error)
      const message = error?.response?.data?.message || error?.response?.data?.error || 'Unable to unlink this document right now.'
      setAlertModal({
        show: true,
        title: 'Unlink Failed',
        message,
        type: 'warning'
      })
    }
  }

  const updateChecklistItemStatus = async (itemId, status) => {
    try {
      await api.put(`/project-tracking/items/${itemId}/status`, { status })
      if (selectedIterationId) await loadItems(selectedIterationId)
    } catch (error) {
      console.error('Failed to update checklist item status:', error)
      const message = error?.response?.data?.message || error?.response?.data?.error || 'Unable to update this checklist item right now.'
      setAlertModal({
        show: true,
        title: 'Update Failed',
        message,
        type: 'warning'
      })
    }
  }

  const unlinkStageDocument = async (stageId, linkId) => {
    if (!selectedIterationId) return
    try {
      await api.delete(`/project-tracking/iterations/${selectedIterationId}/stages/${stageId}/links/${linkId}`)
      await loadItems(selectedIterationId)
    } catch (error) {
      console.error('Failed to unlink stage document:', error)
      const message = error?.response?.data?.message || error?.response?.data?.error || 'Unable to unlink this document right now.'
      setAlertModal({
        show: true,
        title: 'Unlink Failed',
        message,
        type: 'warning'
      })
    }
  }

  const getDocumentWorkspaceLabel = () => 'Open Document'

  const getDocumentDirectoryLabel = () => 'Open Location'

  const showRestrictedDocumentAlert = (actionLabel = 'interact with this document') => {
    setAlertModal({
      show: true,
      title: 'Access Restricted',
      message: `Access to this file is restricted. You are not authorized to ${actionLabel}.`,
      type: 'warning'
    })
  }

  const getLinkedDocumentTypeLabel = (link) => (
    link?.document?.documentType?.name || link?.documentType?.name || 'Other Document'
  )

  const saveProject = async (payload) => {
    const res = await api.put(`/project-tracking/projects/${projectId}`, payload)
    const p = res?.data?.data?.project
    if (p) setProject(p)
  }

  const deleteProject = async () => {
    await api.delete(`/project-tracking/projects/${projectId}`)
    navigate('/project-tracking')
  }

  const advanceStage = async () => {
    if (!selectedIterationId) return
    setAdvancing(true)
    try {
      await api.post(`/project-tracking/iterations/${selectedIterationId}/advance-stage`, {})
      await loadProject(selectedIterationId)
      await loadItems(selectedIterationId)
      setAlertModal({ show: true, title: 'Success', message: 'Moved to the next stage successfully.', type: 'success' })
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to advance stage'
      setAlertModal({ show: true, title: 'Unable to move stage', message: msg, type: 'warning' })
    } finally {
      setAdvancing(false)
    }
  }

  const overallStats = useMemo(() => {
    const total = visibleItems.length
    const complete = visibleItems.filter((x) => String(x.status).toUpperCase() === 'COMPLETE').length
    const pending = visibleItems.filter((x) => String(x.status).toUpperCase() === 'PENDING').length
    const waived = visibleItems.filter((x) => String(x.status).toUpperCase() === 'WAIVED').length
    const pct = total > 0 ? Math.round((complete / total) * 100) : 0
    return { total, complete, pending, waived, pct }
  }, [visibleItems])

  const projectStatus = String(project?.status || 'ACTIVE').toUpperCase()
  const isProjectActive = projectStatus === 'ACTIVE'
  const isProjectOnHold = projectStatus === 'ON_HOLD'
  const isProjectClosed = projectStatus === 'CLOSED'
  const isProjectFrozen = !isProjectActive
  const progressLockMessage = isProjectClosed
    ? 'This project is closed. Linked documents stay available, but no further progress actions are needed.'
    : isProjectOnHold
      ? 'This project is on hold. Progress actions are paused until the project is resumed.'
      : 'Use "Add Next Phase" for enhancement, extension, or the next rollout under the same project.'

  const managerLabel = `${`${project?.manager?.firstName || ''} ${project?.manager?.lastName || ''}`.trim() || project?.manager?.email || '-'}`.trim()
  const currentStageLabel = selectedPhase?.currentStage?.name || 'Not set'
  const openProjectControlConfirm = (config) => {
    setShowProjectControls(false)
    setConfirmModal(config)
  }

  if (loading) {
    return (
      <AppSurface padding="lg" className="flex items-center gap-3">
        <InlineSpinner className="h-4 w-4" />
        <span className="text-sm text-ink-muted">Loading...</span>
      </AppSurface>
    )
  }
  if (!project) return <EmptyState title="Project not found" message="The project may have been deleted." />

  const updateProjectStatus = async (nextStatus) => {
    try {
      await saveProject({
        name: project.name,
        description: project.description || null,
        managerId: project.manager?.id,
        status: nextStatus
      })
      setAlertModal({
        show: true,
        title: 'Success',
        message:
          nextStatus === 'ON_HOLD'
            ? 'Project is now on hold.'
            : nextStatus === 'CLOSED'
              ? 'Project has been closed. Documents remain available, but progress is now stopped.'
              : 'Project is active again.',
        type: 'success'
      })
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to update project status'
      setAlertModal({ show: true, title: 'Unable to update project status', message: msg, type: 'warning' })
    }
  }

  return (
    <div className="space-y-6" data-tour-id="pt-page">
      <AppSurface padding="lg" className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <button type="button" className="text-brand hover:underline" onClick={() => navigate('/project-tracking')}>Projects</button>
          <span className="text-ink-soft">/</span>
          <span className="font-medium text-ink-secondary">{project.code}</span>
          <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 font-mono text-[11px] text-ink-muted">{`UI ${uiVersionStamp}`}</span>
        </div>

        <PageHeader
          title={project.name}
          subtitle="Track required documents, stage evidence, and confidential access for each phase."
          actions={(
            <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:justify-end">
              {canOpenProjectSetup ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(`/project-tracking?tab=setup&projectId=${encodeURIComponent(String(projectId))}&step=requirements`)}
                >
                  Project Setup
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => setShowProjectInfo(true)}>
                Project Info
              </Button>
              {canOpenMoreActions ? (
                <Button size="sm" variant="secondary" onClick={() => setShowProjectControls(true)}>
                  More Actions
                </Button>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {canAddNextPhase ? (
                  <Button size="sm" variant="primary" onClick={() => setShowCreatePhase(true)} disabled={!isProjectActive}>
                    Add Next Phase
                  </Button>
                ) : null}
                {canMoveToNextStage ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setConfirmModal({
                        show: true,
                        title: 'Move To Next Stage',
                        message: 'Move the current phase to the next stage? This is only allowed when all required items in the current stage are completed.',
                        onConfirm: advanceStage
                      })
                    }
                    disabled={advancing || !selectedIterationId || !isProjectActive || currentStagePendingItems.length > 0}
                  >
                    {advancing ? <><InlineSpinner className="h-4 w-4" />Moving...</> : 'Move To Next Stage'}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        />

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl border border-[var(--dms-color-success-soft)] bg-[linear-gradient(135deg,var(--dms-color-success-soft),var(--dms-color-surface))] px-5 py-4 shadow-sm">
            <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-white/20 blur-2xl" />
            <div className="relative flex h-full flex-col justify-between gap-4">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--dms-color-success-ink)]/80">Status</div>
                <div className="text-sm text-ink-secondary">Live project condition for this workspace.</div>
              </div>
              <div className="flex items-end gap-3">
                <div className="text-xl font-semibold text-ink">{formatLifecycleStatus(project.status)}</div>
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-[var(--dms-color-info-soft)] bg-[linear-gradient(135deg,var(--dms-color-info-soft),var(--dms-color-surface))] px-5 py-4 shadow-sm">
            <div className="pointer-events-none absolute bottom-0 right-0 h-24 w-24 translate-x-8 translate-y-8 rounded-full bg-white/20 blur-2xl" />
            <div className="relative flex h-full flex-col justify-between gap-4">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--dms-color-info-ink)]/80">Current Stage</div>
                <div className="text-sm text-ink-secondary">Current workflow checkpoint for the selected phase.</div>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="truncate text-xl font-semibold text-ink" title={currentStageLabel}>{currentStageLabel}</div>
                <span className="inline-flex items-center rounded-full border border-[var(--dms-color-info-ink)]/15 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dms-color-info-ink)]">
                  In Progress
                </span>
              </div>
            </div>
          </div>
        </div>

        <AppSurface
          padding="lg"
          className={`border ${
            !selectedPhase
              ? 'border-border bg-surface'
              : isProjectFrozen
                ? 'border-[var(--dms-color-warning-ink)]/20 bg-[var(--dms-color-warning-soft)]/35'
                : currentStageReadyToAdvance
                  ? 'border-[var(--dms-color-success-ink)]/20 bg-[var(--dms-color-success-soft)]/35'
                  : 'border-[var(--dms-color-info-ink)]/15 bg-[var(--dms-color-info-soft)]/35'
          }`}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  !selectedPhase
                    ? 'bg-surface-muted text-ink-secondary'
                    : isProjectFrozen
                      ? 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]'
                      : currentStageReadyToAdvance
                        ? 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]'
                        : 'bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]'
                }`}>
                  {!selectedPhase
                    ? 'No Active Phase'
                    : isProjectFrozen
                      ? 'Progress Paused'
                      : currentStageReadyToAdvance
                        ? 'Ready To Move'
                        : `${currentStagePendingItems.length} Blocking Item${currentStagePendingItems.length === 1 ? '' : 's'}`}
                </span>
                {selectedPhase ? (
                  <span className="text-xs font-medium text-ink-secondary">
                    {`${getPhaseTitle(selectedPhase, 'Phase')} • ${currentStageLabel}`}
                  </span>
                ) : null}
              </div>

              <div>
                <div className="text-lg font-semibold text-ink">Current Focus</div>
                <div className="mt-1 text-sm text-ink-secondary">
                  {!selectedPhase
                    ? 'Select a project phase to review the current stage and required evidence.'
                    : isProjectClosed
                      ? 'This project is closed. Review linked evidence if needed, but no further progress action is expected.'
                      : isProjectOnHold
                        ? 'This project is on hold. Resume the project before continuing document completion or stage progression.'
                        : !currentStageHasChecklist
                          ? 'No required checklist items are configured for the current stage yet. You can still review linked stage documents below.'
                          : currentStageReadyToAdvance
                            ? 'All required items for the current stage are complete. The phase is ready to move forward.'
                            : `The current stage is blocked by ${currentStagePendingItems.length} pending required item${currentStagePendingItems.length === 1 ? '' : 's'}.`}
                </div>
              </div>

              {currentStageBlockingItems.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {currentStageBlockingItems.slice(0, 4).map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-border bg-surface px-4 py-3">
                      <div className="text-sm font-semibold text-ink">{entry.label}</div>
                      <div className="mt-1 text-xs text-ink-muted">{entry.reason}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex w-full flex-col items-stretch gap-2 xl:max-w-sm xl:items-end">
              <div className="flex flex-wrap gap-2 xl:justify-end">
              {currentStageId && activeStageTab !== currentStageId ? (
                <Button size="sm" variant="secondary" onClick={() => setActiveStageTab(currentStageId)}>
                  Open Current Stage
                </Button>
              ) : null}
              {canLink && isProjectActive && focusBlockingItem ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowLink(focusBlockingItem)}
                  title={focusBlockingItem?.documentType?.name ? `Attach evidence for: ${focusBlockingItem.documentType.name}` : 'Attach evidence'}
                >
                  Attach Evidence
                </Button>
              ) : null}
              {canCreate && isProjectActive && focusBlockingItem ? (
                <Button
                  size="sm"
                  onClick={() => setShowCreateDoc(focusBlockingItem)}
                  title={focusBlockingItem?.documentType?.name ? `Create draft for: ${focusBlockingItem.documentType.name}` : 'Create draft'}
                >
                  Create Draft
                </Button>
              ) : null}
              {focusBlockingDraftDocument ? (
                <Button size="sm" variant="secondary" onClick={() => openDocumentWorkspace(focusBlockingDraftDocument)}>
                  Open Draft
                </Button>
              ) : null}
              {canMoveToNextStage && currentStageReadyToAdvance && isProjectActive ? (
                <Button
                  size="sm"
                  onClick={() =>
                    setConfirmModal({
                      show: true,
                      title: 'Move To Next Stage',
                      message: 'Move the current phase to the next stage? All required items in the current stage are already complete.',
                      onConfirm: advanceStage
                    })
                  }
                >
                  Move To Next Stage
                </Button>
              ) : null}
              </div>
              {focusBlockingItem ? (
                <div className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-ink-secondary">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Actions apply to</div>
                  <div className="mt-1 text-sm font-semibold text-ink">{focusBlockingItem.documentType?.name || 'Required document'}</div>
                  {currentStagePendingItems.length > 1 ? (
                    <div className="mt-1 text-xs text-ink-muted">{`${currentStagePendingItems.length} pending required items in this stage`}</div>
                  ) : null}
                  {currentStageBlockingItems.length > 1 ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Pick item</span>
                      <SelectField
                        value={focusRequiredItemId || String(currentStageBlockingItems[0]?.id || '')}
                        onChange={(e) => setFocusRequiredItemId(e.target.value)}
                        className="h-9"
                      >
                        {currentStageBlockingItems.map((entry) => (
                          <option key={entry.id} value={String(entry.id)}>
                            {entry.label}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                  ) : null}
                  {focusBlockingEntry?.reason ? (
                    <div className="mt-2 text-xs text-ink-muted">{focusBlockingEntry.reason}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </AppSurface>
      </AppSurface>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AppSurface padding="lg" className="h-full">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Selected Phase</div>
          <div className="mt-2 text-lg font-semibold text-ink">{selectedPhase ? getPhaseTitle(selectedPhase, '-') : '-'}</div>
          <div className="mt-2 text-sm text-ink-secondary">{selectedPhase?.currentStage?.name || 'No current stage set'}</div>
          {canEdit && selectedPhase && (
            <button
              type="button"
              onClick={() => setShowEditPhase(selectedPhase)}
              className="mt-3 text-sm font-medium text-brand hover:underline"
            >
              Rename Phase
            </button>
          )}
        </AppSurface>
        <AppSurface padding="lg" className="h-full">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Required Completion</div>
          <div className="mt-2 flex items-end gap-2">
            <div className="text-3xl font-semibold text-ink">{overallStats.pct}%</div>
            <div className="pb-1 text-sm text-ink-muted">{`${overallStats.complete}/${overallStats.total} complete`}</div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-[var(--dms-color-success-ink)]" style={{ width: `${overallStats.pct}%` }} />
          </div>
        </AppSurface>
        <AppSurface padding="lg" className="h-full">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Pending Items</div>
          <div className="mt-2 text-3xl font-semibold text-[var(--dms-color-warning-ink)]">{overallStats.pending}</div>
          <div className="mt-2 text-sm text-ink-muted">Checklist items still waiting for published evidence.</div>
        </AppSurface>
        <AppSurface padding="lg" className="h-full">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Waived Items</div>
          <div className="mt-2 text-3xl font-semibold text-ink">{overallStats.waived}</div>
          <div className="mt-2 text-sm text-ink-muted">Items excluded from phase completion requirements.</div>
        </AppSurface>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
          isProjectClosed
            ? 'bg-[var(--dms-color-danger-soft)] text-[var(--dms-color-danger-ink)]'
            : isProjectOnHold
              ? 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]'
              : 'bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]'
        }`}>
          {progressLockMessage}
        </div>
      </div>

      <AppSurface padding="lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink">Change Control & Amendment Log</div>
            <div className="mt-1 text-sm text-ink-muted">Approved changes recorded for the selected phase.</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-ink-secondary">
              {selectedPhase ? getPhaseTitle(selectedPhase, '') : ''}
            </div>
            <IconButton
              size="sm"
              onClick={() => setIsChangeLogExpanded((prev) => !prev)}
              aria-label={isChangeLogExpanded ? 'Collapse change control log' : 'Expand change control log'}
              aria-expanded={isChangeLogExpanded}
              aria-controls="change-control-log"
            >
              <svg
                className={`h-4 w-4 transition-transform ${isChangeLogExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </IconButton>
          </div>
        </div>
        <div id="change-control-log" className={isChangeLogExpanded ? 'mt-4' : 'hidden'}>
          {changeRequestsLoading ? (
            <div className="flex items-center gap-2 text-sm text-ink-secondary">
              <InlineSpinner className="h-4 w-4" />
              Loading change requests...
            </div>
          ) : changeRequests.length === 0 ? (
            <EmptyPanelState
              title="No change requests yet"
              description="Use the “Key In Change Request” button to add the first record."
            />
          ) : (
            <TableContainer>
              <Table>
                <thead>
                  <Tr>
                    <Th>Change ID</Th>
                    <Th>Phase Ref</Th>
                    <Th>Description of Amendment</Th>
                    <Th>Impact</Th>
                    <Th>Authorized By</Th>
                    <Th>Compliance Sign-Off</Th>
                    <Th>Date Approved</Th>
                    {canEdit && <Th className="w-[140px]">Actions</Th>}
                  </Tr>
                </thead>
                <tbody>
                  {changeRequests.map((cr) => (
                    <Tr key={cr.id}>
                      <Td className="whitespace-nowrap font-semibold">{cr.changeId}</Td>
                      <Td className="whitespace-nowrap">{cr.phaseRef || (cr.iteration?.iterationNo ? `Phase ${cr.iteration.iterationNo}` : '-')}</Td>
                      <Td className="min-w-[260px]">{cr.description}</Td>
                      <Td className="min-w-[200px]">{cr.impact || '-'}</Td>
                      <Td className="whitespace-nowrap">{cr.authorizedBy || '-'}</Td>
                      <Td className="whitespace-nowrap">{cr.complianceSignOff || '-'}</Td>
                      <Td className="whitespace-nowrap">{formatDateLabel(cr.dateApproved)}</Td>
                      {canEdit && (
                        <Td>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                setEditChangeRequest(cr)
                                setShowChangeRequestModal(true)
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              onClick={() =>
                                setConfirmModal({
                                  show: true,
                                  title: 'Delete Change Request',
                                  message: `Delete ${cr.changeId}?`,
                                  onConfirm: async () => {
                                    await api.delete(`/project-tracking/change-requests/${cr.id}`)
                                    await loadChangeRequests(selectedIterationId)
                                  }
                                })
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          )}
        </div>
      </AppSurface>

      <AppSurface padding="lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink">Project Phases</div>
            <div className="mt-1 text-sm text-ink-muted">Switch between iterations under the same project and review each stage flow separately.</div>
          </div>
          <div className="hidden rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-ink-secondary sm:inline-flex">{`${phases.length} phase${phases.length === 1 ? '' : 's'}`}</div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 dms-scrollbar">
            {phases.map((phase) => {
              const isSelected = phase.id === selectedIterationId
              return (
                <button
                  key={phase.id}
                  type="button"
                  onClick={() => setSelectedIterationId(phase.id)}
                  className={`min-w-[190px] rounded-2xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? 'border-brand bg-[var(--dms-color-info-soft)] shadow-dms-soft ring-1 ring-brand/10'
                      : 'border-border bg-surface hover:border-border-strong hover:bg-surface-muted'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">{`Phase ${phase.iterationNo}`}</div>
                      <div className="mt-1 truncate text-sm font-semibold text-ink" title={phase.name || ''}>{phase.name || 'Project Phase'}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${isSelected ? 'bg-brand text-ink-inverse' : 'border border-border bg-surface-muted text-ink-secondary'}`}>
                      {isSelected ? 'Active' : 'Open'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-ink-secondary">{`Current Stage: ${phase.currentStage?.name || '-'}`}</div>
                </button>
              )
            })}
        </div>
      </AppSurface>

      <AppSurface padding="lg">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-ink">Stage Flow</div>
            <div className="mt-1 text-sm text-ink-muted">Use the stage tabs below to keep each stage isolated. Overall Project Documents shows every linked document in this project phase with its stage label.</div>
          </div>
          <div className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-ink-secondary">
            {selectedPhase ? getPhaseTitle(selectedPhase, '') : ''}
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3 dms-scrollbar">
          <button
            type="button"
            onClick={() => setActiveStageTab(consolidatedTabId)}
            className={`flex min-w-[190px] max-w-[190px] flex-col rounded-2xl border px-4 py-3 text-left transition hover:border-border-strong hover:shadow-dms-soft ${
              activeStageTab === consolidatedTabId
                ? 'border-brand bg-[var(--dms-color-info-soft)] shadow-dms-soft ring-1 ring-brand/10'
                : 'border-border bg-surface'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-base font-semibold text-ink">Documents</div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${activeStageTab === consolidatedTabId ? 'bg-brand text-ink-inverse' : 'border border-border bg-surface-muted text-ink-secondary'}`}>
                {`${consolidatedDocuments.length} docs`}
              </span>
            </div>
            <div className="mt-2 text-sm text-ink-secondary">Overall list (all stages).</div>
          </button>
          {stageFlow.map((stage) => {
            const isActiveTab = activeStageTab === stage.id
            const tone =
              isActiveTab
                ? 'border-brand bg-[var(--dms-color-info-soft)] shadow-dms-soft ring-1 ring-brand/10'
                : stage.state === 'done'
                  ? 'border-[var(--dms-color-success-ink)]/20 bg-[var(--dms-color-success-soft)]'
                  : 'border-border bg-surface-muted'

            const badgeTone =
              stage.state === 'current'
                ? 'bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]'
                : stage.state === 'done'
                  ? 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]'
                  : 'border border-border bg-surface text-ink-secondary'

            const badgeLabel =
              stage.state === 'current'
                ? 'Current'
                : stage.state === 'done'
                  ? 'Completed'
                  : 'Upcoming'

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => openStage(stage.id)}
                className={`flex min-w-[190px] max-w-[190px] flex-col rounded-2xl border px-4 py-3 text-left transition hover:border-border-strong hover:shadow-dms-soft ${tone}`}
              >
                <div className="text-base font-semibold text-ink">{stage.name}</div>
                <div className="mt-2">
                  <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${isActiveTab ? 'bg-brand text-ink-inverse' : badgeTone}`}>{isActiveTab ? 'Active Tab' : badgeLabel}</span>
                </div>
                <div className="mt-2 text-sm font-medium text-ink">
                  {stage.metrics ? `Required: ${stage.metrics.complete}/${stage.metrics.total}` : 'No checklist'}
                </div>
              </button>
            )
          })}
        </div>
      </AppSurface>

      {itemsLoading ? (
        <AppSurface padding="lg" className="flex items-center gap-3">
          <InlineSpinner className="h-4 w-4" />
          <span className="text-sm text-ink-muted">Loading checklist...</span>
        </AppSurface>
      ) : activeStageTab === consolidatedTabId ? (
        <AppSurface padding="none">
          <div className="border-b border-border px-6 py-5">
            <div className="text-lg font-semibold text-ink">Overall Project Documents</div>
            <div className="mt-1 text-sm text-ink-muted">All linked documents for this project phase, grouped in one list with stage and checklist context.</div>
          </div>
          {consolidatedDocuments.length === 0 ? (
            <div className="px-6 py-8 text-sm text-ink-muted">No linked documents found for this project phase yet.</div>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <thead>
                    <Tr>
                      <Th>Document</Th>
                      <Th>Stage</Th>
                      <Th>Context</Th>
                      <Th>Status</Th>
                      <Th align="right">Action</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {overallDocsPaginated.map((entry) => (
                      <Tr key={entry.id} className="hover:bg-surface-muted">
                        <Td>
                          {canInteractWithDocument(entry.document) ? (
                            <button
                              type="button"
                              onClick={() => openDocumentWorkspace(entry.document)}
                              className="font-medium text-brand hover:underline"
                            >
                              {getDocumentCodeLabel(entry.document)}
                            </button>
                          ) : (
                            <span className="font-medium text-ink">{getDocumentCodeLabel(entry.document)}</span>
                          )}
                          <div className="mt-1">
                            {canInteractWithDocument(entry.document) ? (
                              <button
                                type="button"
                                onClick={() => openDocumentWorkspace(entry.document)}
                                className="text-left text-ink-secondary hover:underline"
                              >
                                {getDocumentTitleLabel(entry.document)}
                              </button>
                            ) : (
                              <span className="text-left text-ink-secondary">{getDocumentTitleLabel(entry.document)}</span>
                            )}
                          </div>
                          <div className="mt-2 inline-flex items-center gap-2">
                            <ConfidentialBadge isConfidential={entry.document.isConfidential} />
                            <DocumentStatusBadge status={entry.document.status} />
                          </div>
                        </Td>
                        <Td className="text-ink-secondary">{entry.stageName}</Td>
                        <Td className="text-ink-secondary">
                          <div>{entry.source}</div>
                          <div className="mt-1 text-xs text-ink-muted">{entry.documentTypeName}</div>
                          {entry.itemStatus ? <div className="mt-1 text-xs text-ink-muted">{`Checklist status: ${entry.itemStatus}`}</div> : null}
                        </Td>
                        <Td>
                          <DocumentStatusBadge status={entry.document.status} />
                        </Td>
                        <Td align="right">
                          {canInteractWithDocument(entry.document) ? (
                            <div className="inline-flex items-center justify-end gap-3">
                              <button type="button" onClick={() => openDocumentWorkspace(entry.document)} className="text-brand hover:underline">
                                {getDocumentWorkspaceLabel(entry.document)}
                              </button>
                              <button type="button" onClick={() => downloadDocument(entry.document)} className="text-ink-secondary hover:text-ink hover:underline">
                                Download
                              </button>
                              <button type="button" onClick={() => openDocumentDirectory(entry.document)} className="text-brand hover:underline">
                                {getDocumentDirectoryLabel(entry.document)}
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowShareDocument(entry.document)}
                                className="text-ink-secondary hover:text-ink hover:underline"
                              >
                                Share
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-ink-muted">Confidential access required</span>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>
              <Pagination
                currentPage={Math.min(Math.max(1, overallDocsPage), overallDocsTotalPages)}
                totalPages={overallDocsTotalPages}
                totalRecords={overallDocsTotalRecords}
                pageSize={overallDocsEffectivePageSize}
                onPageChange={setOverallDocsPage}
                onPageSizeChange={(nextSize) => {
                  setOverallDocsPageSize(normalizeOverallDocsPageSize(nextSize))
                  setOverallDocsPage(1)
                }}
                pageSizeOptions={overallDocsPageSizeOptions}
              />
            </>
          )}
        </AppSurface>
      ) : (
        <div className="space-y-4">
          {activeStage ? (() => {
            const st = activeStage
            const stageItems = itemsByStage.get(st.id) || []
            const links = stageDocumentsByStage.get(st.id) || []
            const total = stageItems.length
            const complete = stageItems.filter((x) => String(x.status).toUpperCase() === 'COMPLETE').length
            const pending = stageItems.filter((x) => String(x.status).toUpperCase() === 'PENDING').length
            const waived = stageItems.filter((x) => String(x.status).toUpperCase() === 'WAIVED').length
            const pct = total > 0 ? Math.round((complete / total) * 100) : 0
            const linkedRequiredCount = stageItems.reduce((acc, it) => acc + (it.links?.length || 0), 0)
            const summary = `Extra docs: ${links.length} • Required linked: ${linkedRequiredCount}`

            return (
              <AppSurface key={st.id} padding="none" id={`stage-panel-${st.id}`} className="overflow-hidden">
                <div className="w-full border-b border-border bg-surface-muted px-6 py-5 text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="text-base font-semibold text-ink">{st.name}</div>
                      <span className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]">
                        Active Tab
                      </span>
                    </div>
                    <div className="text-sm text-ink-secondary">{`Complete ${complete}/${total} • Pending ${pending} • Waived ${waived}`}</div>
                    <div className="w-full sm:w-56">
                      <div className="h-2.5 overflow-hidden rounded-full bg-surface">
                        <div className="h-2.5 bg-[var(--dms-color-success-ink)]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-sm text-ink-muted">{summary}</div>
                    <div className="inline-flex items-center gap-2 text-sm text-ink-soft">
                      <span>Only documents under this stage are shown here</span>
                    </div>
                  </div>
                </div>
                <div className="border-b border-border bg-surface px-6 py-5">
                  <div className="text-sm font-semibold text-ink">Required Documents</div>
                </div>
                <TableContainer className="rounded-none border-0 border-b border-border">
                  <Table>
                    <thead>
                      <Tr>
                        <Th>Document Type</Th>
                        <Th>Status</Th>
                        <Th>Completed Documents</Th>
                        <Th>Assigned PIC</Th>
                        <Th>Action</Th>
                      </Tr>
                    </thead>
                    <tbody>
                      {stageItems.length === 0 ? (
                        <Tr>
                          <Td colSpan={5} className="px-6 py-8 text-sm text-ink-muted">
                            No required checklist items for this stage yet. Add requirements in Project Setup, or attach extra documents using the buttons below.
                          </Td>
                        </Tr>
                      ) : null}
                      {stageItems.map((it) => (
                        <Tr key={it.id} className="align-top hover:bg-surface-muted">
                          <Td className="whitespace-nowrap text-sm font-medium text-ink">{it.documentType?.name || '-'}</Td>
                          <Td className="whitespace-nowrap text-sm">
                            <div className="flex flex-col items-start gap-2">
                              <ItemStatusBadge status={it.status} />
                              {canEdit && isProjectActive ? (
                                String(it.status || '').toUpperCase() === 'PENDING' ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmModal({
                                        show: true,
                                        title: 'Waive Required Document',
                                        message: 'Waive this checklist item for this phase? It will no longer block stage progression.',
                                        onConfirm: () => updateChecklistItemStatus(it.id, 'WAIVED')
                                      })
                                    }
                                    className="text-xs font-medium text-red-600 hover:underline"
                                  >
                                    Waive
                                  </button>
                                ) : String(it.status || '').toUpperCase() === 'WAIVED' ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmModal({
                                        show: true,
                                        title: 'Make Required Again',
                                        message: 'Make this checklist item required again for this phase?',
                                        onConfirm: () => updateChecklistItemStatus(it.id, 'PENDING')
                                      })
                                    }
                                    className="text-xs font-medium text-brand hover:underline"
                                  >
                                    Make Required
                                  </button>
                                ) : null
                              ) : null}
                            </div>
                          </Td>
                          <Td className="min-w-[260px] text-sm text-ink-secondary">
                            <div className="space-y-3">
                              {it.links?.length ? (
                                it.links.map((l) => (
                                  <div key={l.id} className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {canInteractWithDocument(l.document) ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => openDocumentWorkspace(l.document)}
                                            className="font-medium text-brand hover:underline"
                                          >
                                            {getDocumentCodeLabel(l.document)}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => openDocumentWorkspace(l.document)}
                                            className="text-left text-ink-muted hover:underline"
                                          >
                                            {getDocumentTitleLabel(l.document)}
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <span className="font-medium text-ink">{getDocumentCodeLabel(l.document)}</span>
                                          <span className="text-left text-ink-muted">{getDocumentTitleLabel(l.document)}</span>
                                        </>
                                      )}
                                    </div>
                                    <div className="inline-flex flex-wrap items-center gap-2">
                                      <ConfidentialBadge isConfidential={l.document.isConfidential} />
                                      <DocumentStatusBadge status={l.document.status} />
                                      {!canInteractWithDocument(l.document) ? (
                                        <span className="text-xs font-medium text-ink-muted">Visible only</span>
                                      ) : null}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <span className="text-ink-soft">-</span>
                              )}
                              {canLink && isProjectActive ? (
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-sm">
                                  <button type="button" onClick={() => setShowLink(it)} className="font-medium text-brand hover:underline">
                                    Attach Existing
                                  </button>
                                  {canCreate ? (
                                    <button type="button" onClick={() => setShowCreateDoc(it)} className="font-medium text-ink-secondary hover:text-ink hover:underline">
                                      Add New File
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </Td>
                          <Td className="min-w-[180px] text-sm text-ink-secondary">
                            {(() => {
                              const assignment = getRequiredDocumentAssignment(it.stageId, it.documentTypeId)
                              return (
                                <div className="space-y-2">
                                  <div className="font-medium text-ink">{formatPersonLabel(assignment?.picUser)}</div>
                                  <div className="text-xs text-ink-muted">
                                    {assignment?.assignedAt ? `Assigned ${new Date(assignment.assignedAt).toLocaleDateString()}` : 'Not assigned'}
                                  </div>
                                  {canAssignRequiredDocumentPic ? (
                                    <button
                                      type="button"
                                      onClick={() => openAssignRequiredDocumentPic(it)}
                                      className="text-xs font-medium text-brand hover:underline"
                                    >
                                      {assignment?.picUser ? 'Reassign PIC' : 'Assign PIC'}
                                    </button>
                                  ) : null}
                                </div>
                              )
                            })()}
                          </Td>
                          <Td className="min-w-[220px] text-sm">
                            {it.links?.length ? (
                              <div className="space-y-3">
                                {it.links.map((l) => (
                                  <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                    {canLink && isProjectActive && canInteractWithDocument(l.document) ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmModal({
                                            show: true,
                                            title: 'Remove Linked Document',
                                            message: 'Remove this linked document from the required item? If no published document remains, the checklist item will become pending again.',
                                            onConfirm: () => unlinkItemDocument(it.id, l.id)
                                          })
                                        }
                                        className="font-medium text-red-600 hover:underline"
                                      >
                                        Unlink
                                      </button>
                                    ) : null}
                                    {canInteractWithDocument(l.document) ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => openDocumentWorkspace(l.document)}
                                          className="font-medium text-ink-secondary hover:text-ink hover:underline"
                                        >
                                          {getDocumentWorkspaceLabel(l.document)}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => downloadDocument(l.document)}
                                          className="font-medium text-ink-secondary hover:text-ink hover:underline"
                                        >
                                          Download
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => openDocumentDirectory(l.document)}
                                          className="font-medium text-ink-secondary hover:text-ink hover:underline"
                                        >
                                          {getDocumentDirectoryLabel(l.document)}
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-xs font-medium text-ink-muted">Confidential access required</span>
                                    )}
                                    {canManageLinkedDocumentAccess && String(l.document.stage || '').toUpperCase() === 'DRAFT' ? (
                                      <button
                                        type="button"
                                        onClick={() => setShowDocumentAccess(l.document)}
                                        className="font-medium text-brand hover:underline"
                                      >
                                        Access
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-ink-soft">-</span>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableContainer>
                <div className="flex flex-col gap-4 bg-surface px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-ink">Other Documents Under This Stage</div>
                    <div className="mt-1 max-w-3xl text-sm text-ink-muted">Add extra stage documents here even if they are not listed in the required checklist. Matching document types still route into checklist rows automatically.</div>
                  </div>
                  <div className="flex gap-2">
                    {canLink && isProjectActive ? (
                      <Button onClick={() => setShowStageLink(st)} variant="secondary">
                        Attach Existing
                      </Button>
                    ) : null}
                    {canCreate && isProjectActive ? (
                      <Button onClick={() => setShowStageCreate(st)}>
                        Create New
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="px-6 pb-6">
                  {links.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-surface-muted px-4 py-5 text-sm text-ink-muted">No extra documents added for this stage yet.</div>
                  ) : (
                    <TableContainer className="overflow-hidden rounded-2xl">
                      <Table>
                        <thead>
                          <Tr>
                            <Th>Document Type</Th>
                            <Th>Status</Th>
                            <Th>Completed Documents</Th>
                            <Th>Action</Th>
                          </Tr>
                        </thead>
                        <tbody>
                          {links.map((l) => (
                            <Tr key={l.id} className="align-top hover:bg-surface-muted">
                              <Td className="whitespace-nowrap text-sm font-medium text-ink">{getLinkedDocumentTypeLabel(l)}</Td>
                              <Td className="whitespace-nowrap text-sm">
                                <DocumentStatusBadge status={l.document?.status} />
                              </Td>
                              <Td className="min-w-[260px] text-sm text-ink-secondary">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {canInteractWithDocument(l.document) ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => openDocumentWorkspace(l.document)}
                                          className="font-medium text-brand hover:underline"
                                        >
                                          {getDocumentCodeLabel(l.document)}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => openDocumentWorkspace(l.document)}
                                          className="text-left text-ink-muted hover:underline"
                                        >
                                          {getDocumentTitleLabel(l.document)}
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="font-medium text-ink">{getDocumentCodeLabel(l.document)}</span>
                                        <span className="text-left text-ink-muted">{getDocumentTitleLabel(l.document)}</span>
                                      </>
                                    )}
                                  </div>
                                  <div className="inline-flex flex-wrap items-center gap-2">
                                    <ConfidentialBadge isConfidential={l.document.isConfidential} />
                                    <DocumentStatusBadge status={l.document.status} />
                                    {!canInteractWithDocument(l.document) ? (
                                      <span className="text-xs font-medium text-ink-muted">Visible only</span>
                                    ) : null}
                                  </div>
                                </div>
                              </Td>
                              <Td className="min-w-[220px] text-sm">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                  {canLink && isProjectActive && canInteractWithDocument(l.document) ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmModal({
                                          show: true,
                                          title: 'Remove Linked Document',
                                          message: 'Remove this linked document from the stage? The document record will stay in the system.',
                                          onConfirm: () => unlinkStageDocument(st.id, l.id)
                                        })
                                      }
                                      className="font-medium text-red-600 hover:underline"
                                    >
                                      Unlink
                                    </button>
                                  ) : null}
                                  {canInteractWithDocument(l.document) ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => openDocumentWorkspace(l.document)}
                                        className="font-medium text-ink-secondary hover:text-ink hover:underline"
                                      >
                                        {getDocumentWorkspaceLabel(l.document)}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => downloadDocument(l.document)}
                                        className="font-medium text-ink-secondary hover:text-ink hover:underline"
                                      >
                                        Download
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openDocumentDirectory(l.document)}
                                        className="font-medium text-ink-secondary hover:text-ink hover:underline"
                                      >
                                        {getDocumentDirectoryLabel(l.document)}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setShowShareDocument(l.document)}
                                        className="font-medium text-ink-secondary hover:text-ink hover:underline"
                                      >
                                        Share
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-xs font-medium text-ink-muted">Confidential access required</span>
                                  )}
                                  {canManageLinkedDocumentAccess && String(l.document.stage || '').toUpperCase() === 'DRAFT' ? (
                                    <button
                                      type="button"
                                      onClick={() => setShowDocumentAccess(l.document)}
                                      className="font-medium text-brand hover:underline"
                                    >
                                      Access
                                    </button>
                                  ) : null}
                                </div>
                              </Td>
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                    </TableContainer>
                  )}
                </div>
              </AppSurface>
            )
          })() : null}
        </div>
      )}

      {showLink && (
        <LinkDocumentModal
          projectId={projectId}
          item={showLink}
          phase={selectedPhase}
          onClose={() => setShowLink(null)}
          onLinked={async (summary) => {
            setShowLink(null)
            if (selectedIterationId) await loadItems(selectedIterationId)
            setAlertModal({
              show: true,
              title: summary?.failedCount ? 'Attach Completed with Notes' : 'Success',
              message: buildAttachSummaryMessage(summary),
              type: summary?.failedCount ? 'warning' : 'success'
            })
          }}
        />
      )}

      {showProjectInfo && (
        <Modal onClose={() => setShowProjectInfo(false)} size="xl">
          <ModalHeader
            title="Project Information"
            subtitle={project?.code ? `${project.code} • ${project.name}` : project?.name || 'Project'}
            onClose={() => setShowProjectInfo(false)}
          />
          <ModalBody className="space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Overview</div>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Code / Reference Number</div>
                  <div className="mt-2 font-mono text-sm text-ink">{project.code || '-'}</div>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Client Name</div>
                  <div className="mt-2 text-sm font-medium text-ink">{project.clientName || '-'}</div>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Client PIC</div>
                  <div className="mt-2 text-sm font-medium text-ink">{project.clientPic || '-'}</div>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Internal Project Manager</div>
                  <div className="mt-2 text-sm font-medium text-ink">{managerLabel}</div>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Category</div>
                  <div className="mt-2 text-sm font-medium text-ink">{project.projectCategory?.name || '-'}</div>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Current Stage</div>
                  <div className="mt-2 text-sm font-medium text-ink">{selectedPhase?.currentStage?.name || 'Not set'}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Dates</div>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Start Date</div>
                  <div className="mt-2 text-sm font-medium text-ink">{formatDateLabel(project.startDate)}</div>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Planned Completion Date</div>
                  <div className="mt-2 text-sm font-medium text-ink">{formatDateLabel(project.plannedCompletionDate)}</div>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Actual Completion Date</div>
                  <div className="mt-2 text-sm font-medium text-ink">{formatDateLabel(project.actualCompletionDate)}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Team</div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Team Members</div>
                  <div className="mt-2 whitespace-pre-line text-sm text-ink">{project.teamMembers || '-'}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Scope</div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Scope</div>
                  <div className="mt-2 whitespace-pre-line text-sm text-ink">{project.scope || '-'}</div>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Objective</div>
                  <div className="mt-2 whitespace-pre-line text-sm text-ink">{project.objective || '-'}</div>
                </div>
                <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Deliverables</div>
                  <div className="mt-2 whitespace-pre-line text-sm text-ink">{project.deliverables || '-'}</div>
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setShowProjectInfo(false)}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {showCreateDoc && (
        <CreateDocumentModal
          item={showCreateDoc}
          phase={selectedPhase}
          onClose={() => setShowCreateDoc(null)}
          onCreated={async (result) => {
            setShowCreateDoc(null)
            await handoffCreatedDraft(result)
          }}
        />
      )}

      {showAssignRequiredDocumentPic && (
        <AssignRequiredDocumentPicModal
          requirement={showAssignRequiredDocumentPic}
          loading={savingRequirementPic}
          query={assignPicQuery}
          onQueryChange={setAssignPicQuery}
          onSearch={searchAssignableUsers}
          searching={assignPicSearching}
          userResults={assignPicResults}
          selectedUser={selectedRequirementPicUser}
          onSelectUser={setSelectedRequirementPicUser}
          onClose={closeAssignRequiredDocumentPic}
          onSave={() => saveRequiredDocumentPic(selectedRequirementPicUser?.id || null)}
          onUnassign={() => saveRequiredDocumentPic(null)}
        />
      )}

      {showStageLink && selectedIterationId && (
        <StageLinkDocumentModal
          projectId={projectId}
          iterationId={selectedIterationId}
          phase={selectedPhase}
          stage={showStageLink}
          stageItems={itemsByStage.get(showStageLink.id) || []}
          onClose={() => setShowStageLink(null)}
          onLinked={async (summary) => {
            setShowStageLink(null)
            if (selectedIterationId) await loadItems(selectedIterationId)
            setAlertModal({
              show: true,
              title: summary?.failedCount ? 'Attach Completed with Notes' : 'Success',
              message: buildAttachSummaryMessage(summary),
              type: summary?.failedCount ? 'warning' : 'success'
            })
          }}
        />
      )}

      {showStageCreate && selectedIterationId && (
        <StageCreateDocumentModal
          iterationId={selectedIterationId}
          phase={selectedPhase}
          stage={showStageCreate}
          stageItems={itemsByStage.get(showStageCreate.id) || []}
          documentTypes={docTypes}
          onClose={() => setShowStageCreate(null)}
          onCreated={async (result) => {
            setShowStageCreate(null)
            await handoffCreatedDraft(result)
          }}
        />
      )}

      {showCreatePhase && (
        <PhaseModal
          mode="create"
          nextPhaseNo={(phases[phases.length - 1]?.iterationNo || 0) + 1}
          onClose={() => setShowCreatePhase(false)}
          onSubmit={async (payload) => {
            await createNamedIteration(payload)
            setShowCreatePhase(false)
          }}
        />
      )}

      {showEditPhase && (
        <PhaseModal
          mode="edit"
          phase={showEditPhase}
          onClose={() => setShowEditPhase(null)}
          onSubmit={async (payload) => {
            await renameIteration(showEditPhase.id, payload)
            setShowEditPhase(null)
          }}
        />
      )}

      {showDocumentAccess && (
        <DocumentAccessModal
          document={showDocumentAccess}
          onClose={() => setShowDocumentAccess(null)}
          onSaved={() => {
            if (selectedIterationId) loadItems(selectedIterationId)
            setAlertModal({ show: true, title: 'Success', message: 'Confidential access updated successfully.', type: 'success' })
          }}
          onError={(message) => {
            setAlertModal({ show: true, title: 'Unable to update access', message, type: 'error' })
          }}
        />
      )}

      {showActivity && (
        <ActivityModal
          projectId={projectId}
          onClose={() => setShowActivity(false)}
        />
      )}

      {showProjectControls && (
        <ModalShell title="More Actions" onClose={() => setShowProjectControls(false)} maxWidthClass="max-w-lg">
          <div className="space-y-4">
            <div className="text-sm text-ink-muted">Open supporting project actions or update the project lifecycle.</div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Project Actions</div>
              <div className="flex flex-wrap gap-2">
                {canViewActivityLogs ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowProjectControls(false)
                      setShowActivity(true)
                    }}
                  >
                    Activity Logs
                  </Button>
                ) : null}
                {canKeyInChangeRequest ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowProjectControls(false)
                      setEditChangeRequest(null)
                      setShowChangeRequestModal(true)
                    }}
                    disabled={!selectedIterationId}
                  >
                    Key In Change Request
                  </Button>
                ) : null}
                {canEditProject ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowProjectControls(false)
                      setShowEditProject(true)
                    }}
                  >
                    Edit Project
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Lifecycle Controls</div>
              <div className="flex flex-wrap gap-2">
              {canEdit && isProjectActive ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)] hover:opacity-90"
                  onClick={() =>
                    openProjectControlConfirm({
                      show: true,
                      title: 'Put Project On Hold',
                      message: 'Pause project progress for now? Existing documents stay available and you can resume later.',
                      onConfirm: () => updateProjectStatus('ON_HOLD')
                    })
                  }
                >
                  Put On Hold
                </Button>
              ) : null}
              {canEdit && isProjectOnHold ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)] hover:opacity-90"
                  onClick={() =>
                    openProjectControlConfirm({
                      show: true,
                      title: 'Resume Project',
                      message: 'Resume this project and allow progress actions again?',
                      onConfirm: () => updateProjectStatus('ACTIVE')
                    })
                  }
                >
                  Resume Project
                </Button>
              ) : null}
              {canEdit && isProjectClosed ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)] hover:opacity-90"
                  onClick={() =>
                    openProjectControlConfirm({
                      show: true,
                      title: 'Reopen Project',
                      message: 'Reopen this closed project and allow progress actions again?',
                      onConfirm: () => updateProjectStatus('ACTIVE')
                    })
                  }
                >
                  Reopen Project
                </Button>
              ) : null}
              {canEdit && !isProjectClosed ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    openProjectControlConfirm({
                      show: true,
                      title: 'Close Project',
                      message: 'Close this project? Linked documents will remain available, but no further progress actions will be required.',
                      onConfirm: () => updateProjectStatus('CLOSED')
                    })
                  }
                >
                  Close Project
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  size="sm"
                  variant="danger"
                  className="border-black bg-black text-white hover:border-black hover:bg-neutral-900 hover:text-white"
                  onClick={() =>
                    openProjectControlConfirm({
                      show: true,
                      title: 'Delete Project',
                      message: 'Delete this project? All iterations and tracking links under it will be removed.',
                      onConfirm: deleteProject
                    })
                  }
                >
                  Delete Project
                </Button>
              ) : null}
              </div>
            </div>
          </div>
        </ModalShell>
      )}

      {showEditProject && (
        <ModalShell title="Edit Project" onClose={() => setShowEditProject(false)} maxWidthClass="max-w-5xl">
          <EditProjectForm
            project={project}
            usersEndpoint="/users"
            onCancel={() => setShowEditProject(false)}
            onSave={async (payload) => {
              await saveProject(payload)
              setShowEditProject(false)
            }}
          />
        </ModalShell>
      )}

      {showChangeRequestModal && (
        <ChangeRequestModal
          projectId={projectId}
          iterationId={selectedIterationId}
          phase={selectedPhase}
          initialItem={editChangeRequest}
          onClose={() => {
            setShowChangeRequestModal(false)
            setEditChangeRequest(null)
          }}
          onSaved={async () => {
            await loadChangeRequests(selectedIterationId)
          }}
        />
      )}

      <ShareDocumentModal
        open={Boolean(showShareDocument)}
        document={showShareDocument}
        onClose={() => setShowShareDocument(null)}
      />

      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={async () => {
          const fn = confirmModal.onConfirm
          setConfirmModal({ show: false, title: '', message: '', onConfirm: null })
          await fn?.()
        }}
        onCancel={() => setConfirmModal({ show: false, title: '', message: '', onConfirm: null })}
        confirmText="Confirm"
        cancelText="Cancel"
        type="warning"
        loading={advancing}
      />
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
    </div>
  )
}

function EditProjectForm({ project, usersEndpoint, onCancel, onSave }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    code: project?.code || '',
    name: project?.name || '',
    description: project?.description || '',
    clientName: project?.clientName || '',
    clientPic: project?.clientPic || '',
    teamMembers: project?.teamMembers || '',
    startDate: toDateInputValue(project?.startDate),
    plannedCompletionDate: toDateInputValue(project?.plannedCompletionDate),
    actualCompletionDate: toDateInputValue(project?.actualCompletionDate),
    scope: project?.scope || '',
    objective: project?.objective || '',
    deliverables: project?.deliverables || '',
    managerId: project?.manager?.id ? String(project.manager.id) : '',
    status: project?.status || 'ACTIVE'
  })

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(usersEndpoint)
        setUsers(res?.data?.data?.users || [])
      } catch {
        setUsers([])
      }
    }
    load()
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSave({
        name: form.name,
        description: form.description || null,
        clientName: form.clientName || null,
        clientPic: form.clientPic || null,
        teamMembers: form.teamMembers || null,
        startDate: form.startDate || null,
        plannedCompletionDate: form.plannedCompletionDate || null,
        actualCompletionDate: form.actualCompletionDate || null,
        scope: form.scope || null,
        objective: form.objective || null,
        deliverables: form.deliverables || null,
        managerId: Number(form.managerId)
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ProjectFormFields
        form={form}
        setForm={setForm}
        users={users}
        stageStatusLabel={project?.iterations?.[0]?.currentStage?.name || 'No active stage'}
        showLifecycleStatus
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={loading} type="submit">
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

function DocumentsSearch() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [results, setResults] = useState([])
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/project-tracking/projects')
        setProjects(res?.data?.data?.projects || [])
      } catch {
        setProjects([])
      }
    }
    load()
  }, [])

  const search = async () => {
    setLoading(true)
    setHasSearched(true)
    setNotice(null)
    try {
      const params = { q, attachedOnly: true }
      if (projectId) params.projectId = projectId
      const res = await api.get('/project-tracking/documents/search', { params })
      setResults(res?.data?.data?.documents || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    search()
  }, [projectId])

  const openSearchDocument = async (document) => {
    if (!document?.id) return
    const canAccess = document?.canAccess !== false && (!document?.isConfidential || document?.canAccess === true)
    if (!canAccess) {
      setNotice({
        tone: 'warning',
        message: 'You do not have permission to open this confidential document.'
      })
      return
    }
    setNotice(null)
    navigate(`/documents/${document.id}`)
  }

  const downloadSearchDocument = async (document) => {
    if (!document?.id) return
    const canAccess = document?.canAccess !== false && (!document?.isConfidential || document?.canAccess === true)
    if (!canAccess) {
      setNotice({
        tone: 'warning',
        message: 'You do not have permission to download this confidential document.'
      })
      return
    }
    try {
      setNotice(null)
      const res = await api.get(`/documents/${document.id}/download`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: res.headers?.['content-type'] || undefined }))
      const link = window.document.createElement('a')
      link.href = url
      link.setAttribute('download', document.fileName || document.title || document.fileCode || `document-${document.id}`)
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      const status = error?.response?.status
      const serverMessage = error?.response?.data?.message
      setNotice({
        tone: status === 403 ? 'warning' : 'error',
        message: serverMessage || (status === 403
          ? 'You do not have permission to download this document.'
          : 'Download failed. Please try again or open the document first.')
      })
    }
  }

  return (
    <div className="space-y-4">
      <AppSurface padding="md" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SelectField
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="sm:w-64"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{`${p.code} • ${p.name}`}</option>
          ))}
        </SelectField>
        <TextInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search documents attached to projects (or by selected project)..."
          className="flex-1"
        />
        <Button onClick={search}>
          Search
        </Button>
      </AppSurface>

      {notice ? (
        <AppSurface
          padding="md"
          className={notice.tone === 'warning'
            ? 'border border-[var(--dms-color-warning-ink)]/20 bg-[var(--dms-color-warning-soft)]/35'
            : 'border border-[var(--dms-color-danger-ink)]/20 bg-[var(--dms-color-danger-soft)]/35'}
        >
          <div className="text-sm font-medium text-ink">{notice.message}</div>
        </AppSurface>
      ) : null}

      {loading ? (
        <AppSurface padding="lg" className="flex items-center gap-3">
          <InlineSpinner className="h-4 w-4" />
          <span className="text-sm text-ink-muted">Searching...</span>
        </AppSurface>
      ) : !hasSearched ? (
        <EmptyState title="Search documents" message="Use the filters and keyword search to find documents." />
      ) : results.length === 0 ? (
        <EmptyState title="No results" message="Try another keyword or search criteria." />
      ) : (
        <AppSurface padding="none" className="overflow-hidden">
          <TableContainer className="rounded-none border-0">
            <Table>
              <thead>
                <Tr>
                  <Th>Document</Th>
                  <Th>Project</Th>
                  <Th>Iteration</Th>
                  <Th>Stage</Th>
                  <Th>Action</Th>
                </Tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <Tr key={r.id} className="hover:bg-surface-muted">
                    <Td>
                      <button type="button" onClick={() => openSearchDocument(r.document)} className="text-brand hover:underline">
                        {r.document.fileCode}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-ink-muted">
                        <span>{r.document.title}</span>
                        <ConfidentialBadge isConfidential={r.document.isConfidential} />
                      </div>
                    </Td>
                    <Td className="text-ink-secondary">
                      {r.iteration?.project ? `${r.iteration.project.code} • ${r.iteration.project.name}` : '-'}
                    </Td>
                    <Td className="text-ink-secondary">{`#${r.iteration?.iterationNo || '-'}`}</Td>
                    <Td className="text-ink-secondary">{r.stage?.name || '-'}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        {r.document?.canAccess === false ? (
                          <span className="font-medium text-[var(--dms-color-warning-ink)]">Access Restricted</span>
                        ) : (
                          <>
                            <button type="button" onClick={() => openSearchDocument(r.document)} className="font-medium text-brand hover:underline">
                              Open Document
                            </button>
                            <button type="button" onClick={() => downloadSearchDocument(r.document)} className="font-medium text-ink-secondary hover:text-ink hover:underline">
                              Download
                            </button>
                          </>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        </AppSurface>
      )}
    </div>
  )
}

const buildSetupStageSignature = (stageList = []) => JSON.stringify(
  stageList.map((stage) => ({
    stageId: stage.stageId,
    displayName: stage.displayName || '',
    sortOrder: stage.sortOrder,
    isEnabled: Boolean(stage.isEnabled)
  }))
)

function Setup() {
  const [searchParams] = useSearchParams()
  const [documentTypes, setDocumentTypes] = useState([])
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [stages, setStages] = useState([])
  const [requirements, setRequirements] = useState([])
  const [loading, setLoading] = useState(false)
  const [savingStages, setSavingStages] = useState(false)
  const [addingReq, setAddingReq] = useState(false)
  const [showAddStage, setShowAddStage] = useState(false)
  const [documentTypeSearch, setDocumentTypeSearch] = useState('')
  const [newReq, setNewReq] = useState({ stageId: '', documentTypeIds: [], isRequired: true, isConfidentialDefault: false })
  const [accessRequirement, setAccessRequirement] = useState(null)
  const [accessEntries, setAccessEntries] = useState([])
  const [accessQuery, setAccessQuery] = useState('')
  const [subjectResults, setSubjectResults] = useState({ users: [], roles: [] })
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [savingAccess, setSavingAccess] = useState(false)
  const [setupStep, setSetupStep] = useState('scope')
  const [selectedRequirementStageId, setSelectedRequirementStageId] = useState('')
  const [savedStageSignature, setSavedStageSignature] = useState('[]')
  const appliedInitialScopeRef = useRef(false)

  const initialProjectIdParam = String(searchParams.get('projectId') || '')
  const initialSetupStepParam = String(searchParams.get('step') || '')

  const filteredDocumentTypes = useMemo(() => {
    const keyword = String(documentTypeSearch || '').trim().toLowerCase()
    if (!keyword) return documentTypes

    return documentTypes.filter((docType) => {
      if ((newReq.documentTypeIds || []).map((id) => String(id)).includes(String(docType.id))) return true
      return String(docType.name || '').toLowerCase().includes(keyword)
    })
  }, [documentTypes, documentTypeSearch, newReq.documentTypeIds])

  const loadBase = async () => {
    const [proj, docTypes] = await Promise.all([api.get('/project-tracking/projects'), api.get('/system/config/document-types')])
    setProjects(proj?.data?.data?.projects || [])
    setDocumentTypes(docTypes?.data?.data?.documentTypes || [])
  }

  const loadSetup = async (projectId) => {
    setLoading(true)
    try {
      const isProjectScope = !!projectId
      const [st, req] = await Promise.all([
        api.get(isProjectScope ? `/project-tracking/projects/${projectId}/setup/stages` : '/project-tracking/setup/stages'),
        api.get(isProjectScope ? `/project-tracking/projects/${projectId}/setup/requirements` : '/project-tracking/setup/requirements')
      ])
      const nextStages = st?.data?.data?.stages || []
      setStages(nextStages)
      setSavedStageSignature(buildSetupStageSignature(nextStages))
      setRequirements(req?.data?.data?.requirements || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBase()
  }, [])

  useEffect(() => {
    if (appliedInitialScopeRef.current) return
    if (!initialProjectIdParam) return
    if (!projects.length) return
    const exists = projects.some((p) => String(p.id) === initialProjectIdParam)
    if (!exists) return
    appliedInitialScopeRef.current = true
    setSelectedProjectId(initialProjectIdParam)
    if (initialSetupStepParam) setSetupStep(initialSetupStepParam)
  }, [initialProjectIdParam, initialSetupStepParam, projects])

  useEffect(() => {
    loadSetup(selectedProjectId)
  }, [selectedProjectId])

  const saveStages = async () => {
    setSavingStages(true)
    try {
      const isProjectScope = !!selectedProjectId
      const payload = {
        stages: stages.map((s) => ({
          stageId: s.stageId,
          displayName: s.displayName || null,
          sortOrder: s.sortOrder,
          isEnabled: s.isEnabled
        }))
      }
      const res = await api.put(
        isProjectScope ? `/project-tracking/projects/${selectedProjectId}/setup/stages` : '/project-tracking/setup/stages',
        payload
      )
      const nextStages = res?.data?.data?.stages || []
      setStages(nextStages)
      setSavedStageSignature(buildSetupStageSignature(nextStages))
    } finally {
      setSavingStages(false)
    }
  }

  const createStage = async (payload) => {
    const isProjectScope = !!selectedProjectId
    await api.post(isProjectScope ? `/project-tracking/projects/${selectedProjectId}/setup/stages` : '/project-tracking/setup/stages', payload)
    await loadSetup(selectedProjectId)
    setShowAddStage(false)
  }

  const addRequirement = async (e) => {
    e.preventDefault()
    const targetStageId = newReq.stageId || selectedRequirementStageId
    if (!targetStageId || !(newReq.documentTypeIds || []).length) return
    setAddingReq(true)
    try {
      const isProjectScope = !!selectedProjectId
      const endpoint = isProjectScope ? `/project-tracking/projects/${selectedProjectId}/setup/requirements` : '/project-tracking/setup/requirements'
      await Promise.all(
        (newReq.documentTypeIds || []).map((documentTypeId) =>
          api.post(endpoint, {
            stageId: Number(targetStageId),
            documentTypeId: Number(documentTypeId),
            isRequired: Boolean(newReq.isRequired),
            isConfidentialDefault: Boolean(newReq.isConfidentialDefault)
          })
        )
      )
      setNewReq({ stageId: String(targetStageId), documentTypeIds: [], isRequired: true, isConfidentialDefault: false })
      setDocumentTypeSearch('')
      await loadSetup(selectedProjectId)
    } finally {
      setAddingReq(false)
    }
  }

  const deleteRequirement = async (id) => {
    if (!window.confirm('Remove this requirement from the setup?')) return
    const isProjectScope = !!selectedProjectId
    await api.delete(
      isProjectScope ? `/project-tracking/projects/${selectedProjectId}/setup/requirements/${id}` : `/project-tracking/setup/requirements/${id}`
    )
    await loadSetup(selectedProjectId)
  }

  const loadRequirementAccess = async (requirementId) => {
    const isProjectScope = !!selectedProjectId
    const res = await api.get(
      isProjectScope
        ? `/project-tracking/projects/${selectedProjectId}/setup/requirements/${requirementId}/confidential-access`
        : `/project-tracking/setup/requirements/${requirementId}/confidential-access`
    )
    const entries = res?.data?.data?.entries || []
    setAccessEntries(
      entries
        .map((e) => {
          if (e.user) {
            const label = `${`${e.user.firstName || ''} ${e.user.lastName || ''}`.trim() || e.user.email} (User)`
            return { subjectType: 'USER', subjectId: e.user.id, label }
          }
          if (e.role) {
            const label = `${e.role.displayName || e.role.name} (Role)`
            return { subjectType: 'ROLE', subjectId: e.role.id, label }
          }
          return null
        })
        .filter(Boolean)
    )
  }

  const openRequirementAccess = async (req) => {
    setAccessRequirement(req)
    setAccessQuery('')
    setSubjectResults({ users: [], roles: [] })
    await loadRequirementAccess(req.id)
  }

  const searchSubjects = async () => {
    if (!accessQuery.trim()) return
    setLoadingSubjects(true)
    try {
      const res = await api.get('/folders/access/subjects', { params: { q: accessQuery } })
      setSubjectResults(res?.data?.data || { users: [], roles: [] })
    } finally {
      setLoadingSubjects(false)
    }
  }

  const addAccessEntry = (entry) => {
    setAccessEntries((prev) => {
      if (prev.some((x) => x.subjectType === entry.subjectType && String(x.subjectId) === String(entry.subjectId))) return prev
      return [...prev, entry].sort((a, b) => a.label.localeCompare(b.label))
    })
  }

  const removeAccessEntry = (entry) => {
    setAccessEntries((prev) => prev.filter((x) => !(x.subjectType === entry.subjectType && String(x.subjectId) === String(entry.subjectId))))
  }

  const saveRequirementAccess = async () => {
    if (!accessRequirement) return
    setSavingAccess(true)
    try {
      const isProjectScope = !!selectedProjectId
      await api.put(
        isProjectScope
          ? `/project-tracking/projects/${selectedProjectId}/setup/requirements/${accessRequirement.id}/confidential-access`
          : `/project-tracking/setup/requirements/${accessRequirement.id}/confidential-access`,
        {
        entries: accessEntries.map((e) => ({
          subjectType: e.subjectType,
          subjectId: e.subjectId,
          canView: true
        }))
        }
      )
      setAccessRequirement(null)
      await loadSetup(selectedProjectId)
    } finally {
      setSavingAccess(false)
    }
  }

  const stageOptions = useMemo(() => {
    return stages
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((s) => ({
        id: s.stageId,
        label: s.displayName || s.stage?.name || '-'
      }))
  }, [stages])

  const sortedStages = useMemo(() => {
    return stages.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }, [stages])

  const activeStageCount = useMemo(() => sortedStages.filter((s) => s.isEnabled).length, [sortedStages])
  const isProjectScope = Boolean(selectedProjectId)
  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === String(selectedProjectId)) || null,
    [projects, selectedProjectId]
  )
  const scopeLabel = isProjectScope ? 'Project Override' : 'Default Template'
  const currentStageSignature = useMemo(() => buildSetupStageSignature(stages), [stages])
  const hasStageChanges = currentStageSignature !== savedStageSignature

  const setupSteps = useMemo(() => ([
    { id: 'scope', label: '1. Scope', description: 'Choose default template or project override.' },
    { id: 'stages', label: '2. Stage Flow', description: 'Arrange the stage order and labels.' },
    { id: 'requirements', label: '3. Required Documents', description: 'Assign required documents for each stage.' },
    { id: 'review', label: '4. Review', description: 'Preview the generated setup before use.' }
  ]), [])

  const requirementsByStage = useMemo(() => {
    const grouped = new Map()
    sortedStages.forEach((s) => grouped.set(s.stageId, []))
    requirements.forEach((r) => {
      const key = r.stageId
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(r)
    })
    return grouped
  }, [requirements, sortedStages])

  const isRequiredRequirement = (req) => Boolean(req?.isRequired !== false && req?.isExcluded !== true)

  const requiredDocumentsCount = useMemo(() => {
    return sortedStages.reduce((sum, stage) => {
      const stageReqs = requirementsByStage.get(stage.stageId) || []
      return sum + stageReqs.filter(isRequiredRequirement).length
    }, 0)
  }, [requirementsByStage, sortedStages])

  const orphanRequirementsCount = useMemo(() => {
    const stageIdSet = new Set(sortedStages.map((s) => String(s.stageId)))
    return requirements.filter((r) => !stageIdSet.has(String(r.stageId))).length
  }, [requirements, sortedStages])

  const focusedStageId = String(newReq.stageId || selectedRequirementStageId || stageOptions.find((s) => {
    const stage = sortedStages.find((row) => String(row.stageId) === String(s.id))
    return stage?.isEnabled
  })?.id || stageOptions[0]?.id || '')

  const focusedStage = useMemo(
    () => sortedStages.find((stage) => String(stage.stageId) === focusedStageId) || null,
    [focusedStageId, sortedStages]
  )

  const focusedStageRequirements = useMemo(
    () => (focusedStage ? requirementsByStage.get(focusedStage.stageId) || [] : []),
    [focusedStage, requirementsByStage]
  )

  const enabledStages = useMemo(() => sortedStages.filter((stage) => stage.isEnabled), [sortedStages])

  useEffect(() => {
    if (!stageOptions.length) {
      setSelectedRequirementStageId('')
      return
    }

    const fallbackStageId = String(
      enabledStages[0]?.stageId ||
      sortedStages[0]?.stageId ||
      stageOptions[0]?.id ||
      ''
    )

    if (!fallbackStageId) return

    const currentExists = stageOptions.some((option) => String(option.id) === String(selectedRequirementStageId))
    if (!currentExists) {
      setSelectedRequirementStageId(fallbackStageId)
    }

    const newReqExists = stageOptions.some((option) => String(option.id) === String(newReq.stageId))
    if (!newReq.stageId || !newReqExists) {
      setNewReq((prev) => ({ ...prev, stageId: fallbackStageId }))
    }
  }, [stageOptions, enabledStages, sortedStages, selectedRequirementStageId, newReq.stageId])

  const updateStage = (stageId, patch) => {
    setStages((prev) => prev.map((x) => (x.stageId === stageId ? { ...x, ...patch } : x)))
  }

  const moveStage = (stageId, direction) => {
    const ordered = sortedStages.slice()
    const index = ordered.findIndex((s) => s.stageId === stageId)
    if (index < 0) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= ordered.length) return

    const next = ordered.slice()
    ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]

    setStages(
      next.map((s, idx) => ({
        ...s,
        sortOrder: idx + 1
      }))
    )
  }

  const selectRequirementStage = (stageId) => {
    const normalizedStageId = String(stageId || '')
    setSelectedRequirementStageId(normalizedStageId)
    setNewReq((prev) => ({ ...prev, stageId: normalizedStageId }))
  }

  const handleScopeChange = (nextProjectId) => {
    if (String(nextProjectId) === String(selectedProjectId)) return
    if (hasStageChanges) {
      const confirmed = window.confirm('You have unsaved stage flow changes. Switch scope and discard those stage edits?')
      if (!confirmed) return
    }
    setSelectedProjectId(nextProjectId)
    setSetupStep('scope')
  }

  return (
    <div className="space-y-4">
      <AppSurface padding="lg">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-sm font-medium text-ink-secondary">Project Setup</div>
            <div className="mt-1 text-xl font-semibold text-ink">Configure stage flow and required documents with a guided setup.</div>
            <div className="mt-2 text-sm text-ink-muted">
              Follow the setup steps from scope to review. Stage flow changes need to be saved, while requirement changes are applied immediately after add, remove, or access updates.
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
            <div className="text-xs font-medium text-ink-muted">Current Step</div>
            <div className="mt-1 text-sm font-semibold text-ink">
              {(setupSteps.find((step) => step.id === setupStep)?.label || '1. Scope').replace(/^\d+\.\s*/, '')}
            </div>
            <div className="mt-1 text-xs text-ink-muted">
              {setupSteps.find((step) => step.id === setupStep)?.description}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-4">
          {setupSteps.map((step) => {
            const isActive = setupStep === step.id
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setSetupStep(step.id)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  isActive
                    ? 'border-brand bg-[var(--dms-color-info-soft)]/45 shadow-sm'
                    : 'border-border bg-surface hover:border-brand/40 hover:bg-surface-muted'
                }`}
              >
                <div className="text-sm font-semibold text-ink">{step.label}</div>
                <div className="mt-1 text-xs text-ink-muted">{step.description}</div>
              </button>
            )
          })}
        </div>

        <div className="mt-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-ink-secondary">Setup Scope</div>
            <div className="mt-1 text-xs text-ink-muted">
              Default setup applies to all projects. Select a project only when you need a customized setup that will not affect other projects.
            </div>
          </div>
          <div className="w-full lg:w-80">
            <SelectField
              value={selectedProjectId}
              onChange={(e) => handleScopeChange(e.target.value)}
            >
              <option value="">Default (All Projects)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{`${p.code} • ${p.name}`}</option>
              ))}
            </SelectField>
          </div>
        </div>

        <div className={`mt-4 rounded-2xl border px-4 py-4 ${
          isProjectScope
            ? 'border-[var(--dms-color-info-ink)]/20 bg-[var(--dms-color-info-soft)]/45'
            : 'border-[var(--dms-color-warning-ink)]/20 bg-[var(--dms-color-warning-soft)]/35'
        }`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-ink">
                {isProjectScope ? 'Editing Project-Specific Override' : 'Editing Default Setup For All Projects'}
              </div>
              <div className="mt-1 text-sm text-ink-secondary">
                {isProjectScope
                  ? `Changes here apply only to ${selectedProject?.code || 'the selected project'}${selectedProject?.name ? ` • ${selectedProject.name}` : ''} and will not change the default template.`
                  : 'Changes here become the default setup for all projects unless a project has its own override.'}
              </div>
            </div>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              isProjectScope
                ? 'bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]'
                : 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]'
            }`}>
              {scopeLabel}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
            <div className="text-xs font-medium text-ink-muted">Total Stages</div>
            <div className="text-lg font-semibold text-ink">{sortedStages.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
            <div className="text-xs font-medium text-ink-muted">Active Stages</div>
            <div className="text-lg font-semibold text-ink">{activeStageCount}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
            <div className="text-xs font-medium text-ink-muted">Required Documents</div>
            <div className="text-lg font-semibold text-ink">{requiredDocumentsCount}</div>
          </div>
        </div>

        {orphanRequirementsCount > 0 ? (
          <div className="mt-4 rounded-xl border border-[var(--dms-color-warning-ink)]/20 bg-[var(--dms-color-warning-soft)]/35 px-4 py-3">
            <div className="text-sm font-semibold text-ink">Some setup rules need attention</div>
            <div className="mt-1 text-xs text-ink-secondary">
              {`${orphanRequirementsCount} requirement${orphanRequirementsCount === 1 ? '' : 's'} are linked to stages that are not present in the current stage flow.`}
            </div>
          </div>
        ) : null}

        {hasStageChanges ? (
          <div className="mt-4 rounded-xl border border-[var(--dms-color-warning-ink)]/20 bg-[var(--dms-color-warning-soft)]/35 px-4 py-3">
            <div className="text-sm font-semibold text-ink">Stage flow has unsaved changes</div>
            <div className="mt-1 text-xs text-ink-secondary">
              Save the stage flow before switching scope or handing this setup to end users.
            </div>
          </div>
        ) : null}
      </AppSurface>

      {loading ? (
        <AppSurface padding="lg" className="flex items-center gap-3">
          <InlineSpinner className="h-4 w-4" />
          <span className="text-sm text-ink-muted">Loading...</span>
        </AppSurface>
      ) : (
        <div className="space-y-4">
          {setupStep === 'scope' ? (
            <AppSurface padding="lg">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <div className="text-sm font-semibold text-ink">Choose the setup mode first</div>
                  <div className="mt-2 text-sm text-ink-secondary">
                    Use the default template when most projects follow the same stage flow and document checklist. Choose a project override only when one project needs its own setup without changing everyone else.
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" onClick={() => setSetupStep('stages')}>
                    Continue To Stage Flow
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleScopeChange('')}
                  className={`rounded-2xl border px-5 py-5 text-left ${
                    !isProjectScope ? 'border-brand bg-[var(--dms-color-warning-soft)]/35' : 'border-border bg-surface hover:border-brand/30'
                  }`}
                >
                  <div className="text-sm font-semibold text-ink">Default Template</div>
                  <div className="mt-2 text-sm text-ink-secondary">
                    Best when every new project should inherit the same stage order and required documents.
                  </div>
                </button>
                <div className={`rounded-2xl border px-5 py-5 ${isProjectScope ? 'border-brand bg-[var(--dms-color-info-soft)]/35' : 'border-border bg-surface'}`}>
                  <div className="text-sm font-semibold text-ink">Project Override</div>
                  <div className="mt-2 text-sm text-ink-secondary">
                    Best when one project needs a different stage flow or different required documents from the shared template.
                  </div>
                  <div className="mt-4">
                    <SelectField
                      value={selectedProjectId}
                      onChange={(e) => handleScopeChange(e.target.value)}
                    >
                      <option value="">Select project override</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{`${p.code} • ${p.name}`}</option>
                      ))}
                    </SelectField>
                  </div>
                </div>
              </div>
            </AppSurface>
          ) : null}

          {setupStep === 'stages' ? (
            <AppSurface padding="lg">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink">{`Stage Flow - ${scopeLabel}`}</div>
                  <div className="mt-1 text-xs text-ink-muted">
                    {isProjectScope
                      ? 'Adjust only this project override by renaming stage labels, turning stages on or off, or reordering the flow.'
                      : 'Adjust the shared default template by renaming stage labels, turning stages on or off, or reordering the flow.'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => setShowAddStage(true)}
                    variant="secondary"
                  >
                    Add Stage
                  </Button>
                  <Button
                    onClick={saveStages}
                    disabled={savingStages}
                  >
                    {savingStages ? 'Saving...' : isProjectScope ? 'Save Project Override' : 'Save Default Stage Flow'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setSetupStep('requirements')}>
                    Continue To Required Documents
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                {sortedStages.map((s, idx) => {
                  const displayLabel = s.displayName || s.stage?.name || '-'
                  const stageRequirementCount = (requirementsByStage.get(s.stageId) || []).filter(isRequiredRequirement).length
                  return (
                    <div
                      key={s.stageId}
                      className={`min-w-[270px] rounded-xl border p-4 ${
                        s.isEnabled ? 'border-brand bg-[var(--dms-color-info-soft)]/70' : 'border-border bg-surface-muted'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{`Stage ${idx + 1}`}</div>
                          <div className="mt-1 text-sm font-semibold text-ink">{s.stage?.name || '-'}</div>
                          <div className="mt-1 text-xs text-ink-muted">{`${stageRequirementCount} required document${stageRequirementCount === 1 ? '' : 's'}`}</div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.isEnabled ? 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]' : 'border border-border bg-surface text-ink-secondary'}`}>
                          {s.isEnabled ? 'Active' : 'Hidden'}
                        </span>
                      </div>

                      <div className="mt-4">
                        <label className="mb-1 block text-xs font-medium text-ink-muted">Display Label</label>
                        <TextInput
                          value={s.displayName || ''}
                          onChange={(e) => updateStage(s.stageId, { displayName: e.target.value })}
                          placeholder={s.stage?.name || 'Enter label'}
                        />
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
                          <input
                            type="checkbox"
                            checked={!!s.isEnabled}
                            onChange={(e) => updateStage(s.stageId, { isEnabled: e.target.checked })}
                            className="rounded border-border text-brand focus-visible:ring-brand/30"
                          />
                          Active in flow
                        </label>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => moveStage(s.stageId, 'up')}
                            disabled={idx === 0}
                            variant="secondary"
                            size="sm"
                          >
                            Up
                          </Button>
                          <Button
                            type="button"
                            onClick={() => moveStage(s.stageId, 'down')}
                            disabled={idx === sortedStages.length - 1}
                            variant="secondary"
                            size="sm"
                          >
                            Down
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </AppSurface>
          ) : null}

          {setupStep === 'requirements' ? (
            <AppSurface padding="none" className="overflow-hidden">
              <div className="border-b border-border bg-surface-muted px-6 py-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-ink">{`Required Documents By Stage - ${scopeLabel}`}</div>
                    <div className="mt-1 text-xs text-ink-muted">
                      Pick a stage, add the document types that must appear in the checklist, and mark confidential requirements only when needed.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={() => setSetupStep('stages')}>
                      Back To Stage Flow
                    </Button>
                    <Button type="button" onClick={() => setSetupStep('review')}>
                      Continue To Review
                    </Button>
                  </div>
                </div>
              </div>

              <div className="border-b border-border bg-surface px-5 py-4">
                <div className="text-xs font-medium text-ink-muted">Choose stage to configure</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sortedStages.map((s) => {
                    const stageLabel = s.displayName || s.stage?.name || '-'
                    const active = String(s.stageId) === String(focusedStageId)
                    const reqCount = (requirementsByStage.get(s.stageId) || []).filter(isRequiredRequirement).length
                    return (
                      <button
                        key={s.stageId}
                        type="button"
                        onClick={() => selectRequirementStage(s.stageId)}
                        className={`rounded-full border px-3 py-2 text-sm ${
                          active
                            ? 'border-brand bg-[var(--dms-color-info-soft)] text-ink'
                            : 'border-border bg-surface hover:border-brand/30'
                        }`}
                      >
                        {`${stageLabel} (${reqCount})`}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-ink">{focusedStage?.displayName || focusedStage?.stage?.name || 'Select a stage'}</div>
                        <div className="mt-1 text-xs text-ink-muted">
                          {focusedStage?.isEnabled
                            ? 'New phases will show these required documents in this active stage.'
                            : 'This stage is currently hidden in the flow. You can still prepare its requirements here.'}
                        </div>
                      </div>
                      {focusedStage ? (
                        <span className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-secondary">
                          {`${focusedStageRequirements.length} required`}
                        </span>
                      ) : null}
                    </div>

                    <form onSubmit={addRequirement} className="mt-4 grid grid-cols-1 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-ink-muted">Document Type</label>
                        <SearchableSelectField
                          values={newReq.documentTypeIds}
                          options={filteredDocumentTypes}
                          onChange={(values) => setNewReq((p) => ({ ...p, documentTypeIds: values, stageId: focusedStageId }))}
                          searchValue={documentTypeSearch}
                          onSearchChange={setDocumentTypeSearch}
                          placeholder={focusedStage ? `Select document type for ${focusedStage.displayName || focusedStage.stage?.name || 'this stage'}` : 'Select one or more document types'}
                          noResultsLabel="No document type found"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3">
                        <label className="flex items-center gap-2 text-sm text-ink-secondary">
                          <input
                            type="checkbox"
                            checked={!!newReq.isConfidentialDefault}
                            onChange={(e) => setNewReq((p) => ({ ...p, isConfidentialDefault: e.target.checked, stageId: focusedStageId }))}
                            className="rounded border-border text-brand focus-visible:ring-brand/30"
                          />
                          Mark as confidential by default
                        </label>
                        <Button
                          disabled={addingReq || !focusedStageId || !(newReq.documentTypeIds || []).length}
                          type="submit"
                        >
                          {addingReq
                            ? 'Adding...'
                            : `Add${(newReq.documentTypeIds || []).length ? ` ${(newReq.documentTypeIds || []).length}` : ''} Requirement${(newReq.documentTypeIds || []).length > 1 ? 's' : ''}`}
                        </Button>
                      </div>
                    </form>
                  </div>

                  <div className="rounded-xl border border-border bg-surface p-4">
                    <div className="text-sm font-semibold text-ink">Requirements for this stage</div>
                    <div className="mt-1 text-xs text-ink-muted">
                      Review, adjust confidential access when required, and remove items you no longer want in the checklist.
                    </div>
                    <div className="mt-4">
                      {!focusedStage ? (
                        <div className="text-sm text-ink-muted">Select a stage to manage its required documents.</div>
                      ) : focusedStageRequirements.filter(isRequiredRequirement).length === 0 ? (
                        <div className="text-sm text-ink-muted">No required document type added for this stage yet.</div>
                      ) : (
                        <div className="space-y-2">
                          {focusedStageRequirements.filter(isRequiredRequirement).map((r) => (
                            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-3 py-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-ink">{r.documentType?.name || '-'}</div>
                                <div className="mt-1 text-xs text-ink-muted">
                                  {r.isConfidentialDefault ? 'Confidential by default' : 'Standard visibility'}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {r.isConfidentialDefault ? (
                                  <button
                                    type="button"
                                    onClick={() => openRequirementAccess(r)}
                                    className="text-sm text-brand hover:underline"
                                  >
                                    Access
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => deleteRequirement(r.id)}
                                  className="text-sm text-red-600 hover:underline"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-surface p-4">
                    <div className="text-sm font-semibold text-ink">Checklist Preview</div>
                    <div className="mt-1 text-xs text-ink-muted">
                      This shows what a new phase will receive based on the current setup.
                    </div>
                    <div className="mt-4 space-y-3">
                      {enabledStages.length === 0 ? (
                        <div className="text-sm text-ink-muted">No active stages in the flow yet. Enable at least one stage first.</div>
                      ) : (
                        enabledStages.map((stage, index) => {
                          const stageLabel = stage.displayName || stage.stage?.name || '-'
                          const stageRequirements = (requirementsByStage.get(stage.stageId) || []).filter(isRequiredRequirement)
                          return (
                            <div key={stage.stageId} className="rounded-lg border border-border bg-surface-muted px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold text-ink">{`Stage ${index + 1}: ${stageLabel}`}</div>
                                <span className="text-xs text-ink-muted">{`${stageRequirements.length} required`}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {stageRequirements.length === 0 ? (
                                  <span className="text-xs text-ink-muted">No requirements yet</span>
                                ) : (
                                  stageRequirements.map((req) => (
                                    <span
                                      key={req.id}
                                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                        req.isConfidentialDefault
                                          ? 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]'
                                          : 'bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]'
                                      }`}
                                    >
                                      {req.documentType?.name || '-'}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-surface p-4">
                    <div className="text-sm font-semibold text-ink">Good practice</div>
                    <div className="mt-2 space-y-2 text-xs text-ink-muted">
                      <div>Keep only business-critical requirements in the default template.</div>
                      <div>Use project override only when one project genuinely needs a different setup.</div>
                      <div>Use confidential defaults only for evidence that truly needs restricted visibility.</div>
                    </div>
                  </div>
                </div>
              </div>
            </AppSurface>
          ) : null}

          {setupStep === 'review' ? (
            <AppSurface padding="lg">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink">Review Setup Before Hand-Off</div>
                  <div className="mt-1 text-xs text-ink-muted">
                    Confirm the stage flow, required documents, and confidential defaults before end users start creating new phases.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => setSetupStep('requirements')}>
                    Back To Required Documents
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setSetupStep('stages')}>
                    Open Stage Flow
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  {sortedStages.map((stage, index) => {
                    const stageLabel = stage.displayName || stage.stage?.name || '-'
                    const stageRequirements = (requirementsByStage.get(stage.stageId) || []).filter(isRequiredRequirement)
                    return (
                      <div key={stage.stageId} className="rounded-xl border border-border bg-surface p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-ink">{`Stage ${index + 1}: ${stageLabel}`}</div>
                            <div className="mt-1 text-xs text-ink-muted">
                              {stage.isEnabled ? 'Included in the active flow.' : 'Hidden from the active flow.'}
                            </div>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${stage.isEnabled ? 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]' : 'border border-border bg-surface-muted text-ink-secondary'}`}>
                            {stage.isEnabled ? 'Active' : 'Hidden'}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {stageRequirements.length === 0 ? (
                            <span className="text-xs text-ink-muted">No required documents configured.</span>
                          ) : (
                            stageRequirements.map((req) => (
                              <span
                                key={req.id}
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  req.isConfidentialDefault
                                    ? 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]'
                                    : 'bg-[var(--dms-color-info-soft)] text-[var(--dms-color-info-ink)]'
                                }`}
                              >
                                {req.documentType?.name || '-'}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-surface-muted px-4 py-4">
                    <div className="text-sm font-semibold text-ink">Review Checklist</div>
                    <div className="mt-3 space-y-2 text-xs text-ink-muted">
                      <div>{hasStageChanges ? 'Stage flow still has unsaved edits.' : 'Stage flow is saved.'}</div>
                      <div>{`${activeStageCount} active stage${activeStageCount === 1 ? '' : 's'} in flow.`}</div>
                      <div>{`${requiredDocumentsCount} required document rule${requiredDocumentsCount === 1 ? '' : 's'} configured.`}</div>
                      <div>{isProjectScope ? 'This setup only affects the selected project.' : 'This setup affects all projects without override.'}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-surface px-4 py-4">
                    <div className="text-sm font-semibold text-ink">Next Action</div>
                    <div className="mt-2 text-sm text-ink-secondary">
                      {hasStageChanges
                        ? 'Save the stage flow before handing this setup to users.'
                        : 'Setup is ready for end-user validation. New phases will use this configuration immediately.'}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" onClick={saveStages} disabled={savingStages || !hasStageChanges}>
                        {savingStages ? 'Saving...' : 'Save Stage Flow'}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setSetupStep('requirements')}>
                        Edit Required Documents
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </AppSurface>
          ) : null}
        </div>
      )}

      {showAddStage && (
        <AddStageModal
          onClose={() => setShowAddStage(false)}
          onCreate={createStage}
        />
      )}

      {accessRequirement && (
        <ModalShell title="Confidential Access" onClose={() => setAccessRequirement(null)}>
          <div className="space-y-4">
            <div className="text-sm text-ink-secondary">
              {`Requirement: ${accessRequirement.documentType?.name || '-'} • ${stageOptions.find((x) => String(x.id) === String(accessRequirement.stageId))?.label || '-'}`}
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-ink-muted">Allowed viewers</div>
              {accessEntries.length === 0 ? (
                <div className="text-sm text-ink-muted">No viewers added yet. Only creator/owner will be able to view confidential documents created from this requirement.</div>
              ) : (
                <div className="space-y-2">
                  {accessEntries.map((e) => (
                    <div key={`${e.subjectType}:${e.subjectId}`} className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2">
                      <div className="text-sm text-ink">{e.label}</div>
                      <button type="button" onClick={() => removeAccessEntry(e)} className="text-sm text-red-600 hover:underline">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
              <div className="text-xs font-medium text-ink-muted">Add user or role</div>
              <div className="flex gap-2">
                <TextInput
                  value={accessQuery}
                  onChange={(e) => setAccessQuery(e.target.value)}
                  placeholder="Search user email/name or role..."
                  className="flex-1"
                />
                <Button type="button" variant="secondary" onClick={searchSubjects}>
                  {loadingSubjects ? 'Searching...' : 'Search'}
                </Button>
              </div>

              {(subjectResults.users.length > 0 || subjectResults.roles.length > 0) && (
                <div className="max-h-56 overflow-auto rounded-md border border-border bg-surface-muted">
                  {subjectResults.roles.map((r) => (
                    <button
                      key={`role:${r.id}`}
                      type="button"
                      onClick={() => addAccessEntry({ subjectType: 'ROLE', subjectId: r.id, label: `${r.displayName || r.name} (Role)` })}
                      className="w-full border-b border-border px-3 py-2 text-left text-sm hover:bg-surface last:border-b-0"
                    >
                      <div className="font-medium text-ink">{r.displayName || r.name}</div>
                      <div className="text-xs text-ink-muted">Role</div>
                    </button>
                  ))}
                  {subjectResults.users.map((u) => (
                    <button
                      key={`user:${u.id}`}
                      type="button"
                      onClick={() => addAccessEntry({ subjectType: 'USER', subjectId: u.id, label: `${`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email} (User)` })}
                      className="w-full border-b border-border px-3 py-2 text-left text-sm hover:bg-surface last:border-b-0"
                    >
                      <div className="font-medium text-ink">{`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}</div>
                      <div className="text-xs text-ink-muted">{u.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setAccessRequirement(null)}>
                Close
              </Button>
              <Button
                type="button"
                disabled={savingAccess}
                onClick={saveRequirementAccess}
              >
                {savingAccess ? 'Saving...' : 'Save Access'}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

export default function ProjectTracking() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const canSearchProjects = hasPermission('projectTracking', 'searchProject')
  const canOpenProjectSetup = hasPermission('projectTracking', 'projectSetup')
  const canViewProjectDetail = hasPermission('projectTracking', 'view')

  const activeTab = String(searchParams.get('tab') || 'dashboard')

  const setTab = (tab) => {
    if (tab === 'dashboard') {
      navigate('/project-tracking')
      return
    }

    const basePath = projectId ? `/project-tracking/${projectId}` : '/project-tracking'
    navigate(`${basePath}?tab=${encodeURIComponent(tab)}`)
  }

  useEffect(() => {
    if (projectId && activeTab !== 'projects') setTab('projects')
  }, [projectId])

  const tabs = useMemo(() => {
    const base = []
    if (canSearchProjects) {
      base.push({ id: 'dashboard', label: 'Dashboard' })
      base.push({ id: 'projects', label: 'Project Lists' })
      base.push({ id: 'search', label: 'Search Documents' })
    }
    if (canOpenProjectSetup) {
      base.push({ id: 'setup', label: 'Project Setup' })
    }
    return base
  }, [canOpenProjectSetup, canSearchProjects])

  const fallbackTab = tabs[0]?.id || 'dashboard'

  useEffect(() => {
    if (projectId) return
    const allowedTabIds = new Set(tabs.map((tab) => tab.id))
    if (!allowedTabIds.size) return
    if (!allowedTabIds.has(activeTab)) {
      setTab(fallbackTab)
    }
  }, [activeTab, fallbackTab, projectId, tabs])

  return (
    <div className="space-y-6" data-tour-id="pt-page">
      <PageHeader
        title="Project Tracking"
        subtitle="Track project phases, linked documents, and setup flows under the shared design system."
      />

      <AppSurface padding="none" data-tour-id="pt-shell-card">
        <div className="border-b border-border px-4">
          <nav className="flex gap-2 overflow-x-auto py-2" aria-label="Tabs" data-tour-id="pt-tabbar">
            {tabs.map((t) => {
              const isActive = activeTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  data-tour-id={`pt-tab-${t.id}`}
                  className={`rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-brand/10 text-brand' : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </nav>
        </div>
        <div className="p-4 md:p-5">
          {activeTab === 'setup' && canOpenProjectSetup ? (
            <div data-tour-id="pt-setup-panel">
              <Setup />
            </div>
          ) : activeTab === 'dashboard' && canSearchProjects ? (
            <div data-tour-id="pt-dashboard-panel">
              <ProjectDashboard onOpenProject={(id) => navigate(`/project-tracking/${id}`)} />
            </div>
          ) : activeTab === 'search' && canSearchProjects ? (
            <div data-tour-id="pt-search-panel">
              <DocumentsSearch />
            </div>
          ) : projectId && canViewProjectDetail ? (
            <div data-tour-id="pt-detail-panel">
              <ProjectDetail projectId={Number(projectId)} />
            </div>
          ) : projectId ? (
            <EmptyState title="No access" message="You do not have permission to view this project." />
          ) : activeTab === 'projects' && canSearchProjects ? (
            <div data-tour-id="pt-projects-panel">
              <ProjectsList onOpenProject={(id) => navigate(`/project-tracking/${id}`)} />
            </div>
          ) : tabs.length === 0 ? (
            <EmptyState title="No access" message="You do not have permission to access Project Tracking tabs." />
          ) : (
            <EmptyState title="No access" message="You do not have permission to open this tab." />
          )}
        </div>
      </AppSurface>
    </div>
  )
}
