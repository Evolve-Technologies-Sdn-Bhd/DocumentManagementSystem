import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import Pagination from './Pagination'
import EmptyState from './EmptyState'
import ConfirmModal, { AlertModal } from './ConfirmModal'
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

    const phaseLabel = phase?.iterationNo ? `Phase ${phase.iterationNo}` : ''
    return {
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
    }
  }, [initialItem, phase])

  const [rows, setRows] = useState([initialRow])

  useEffect(() => {
    setRows([initialRow])
  }, [initialRow])

  const addRow = () => {
    const phaseLabel = phase?.iterationNo ? `Phase ${phase.iterationNo}` : ''
    setRows((prev) => prev.concat({
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
    }))
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
        await api.put(`/project-tracking/change-requests/${row.serverId}`, payload)
      } else {
        await api.post(`/project-tracking/projects/${projectId}/change-requests`, payload)
      }

      await onSaved?.()

      if (row.mode === 'edit') {
        onClose?.()
      } else {
        removeRow(row.key)
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to save change request'
      updateRow(row.key, { error: msg })
    } finally {
      updateRow(row.key, { saving: false })
    }
  }

  return (
    <ModalShell title="Key In Change Request" onClose={onClose} maxWidthClass="max-w-6xl">
      <div className="space-y-4">
        <div className="text-sm text-ink-muted">
          Add approved changes for the selected project phase. Each row can be saved individually.
        </div>
        <TableContainer>
          <Table>
            <thead>
              <Tr>
                <Th>Change ID</Th>
                <Th>Phase Ref</Th>
                <Th>Description of Amendment</Th>
                <Th>Impact (Cost / Schedule / Scope)</Th>
                <Th>Authorized By</Th>
                <Th>Compliance Sign-Off</Th>
                <Th>Date Approved</Th>
                <Th className="w-[140px]">Actions</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <React.Fragment key={r.key}>
                  <Tr>
                    <Td>
                      <TextInput value={r.changeId} onChange={(e) => updateRow(r.key, { changeId: e.target.value })} placeholder="CR-01" />
                    </Td>
                    <Td>
                      <TextInput value={r.phaseRef} onChange={(e) => updateRow(r.key, { phaseRef: e.target.value })} placeholder="Phase 2" />
                    </Td>
                    <Td>
                      <TextArea value={r.description} onChange={(e) => updateRow(r.key, { description: e.target.value })} rows={2} placeholder="Describe amendment..." />
                    </Td>
                    <Td>
                      <TextArea value={r.impact} onChange={(e) => updateRow(r.key, { impact: e.target.value })} rows={2} placeholder="Impact..." />
                    </Td>
                    <Td>
                      <TextInput value={r.authorizedBy} onChange={(e) => updateRow(r.key, { authorizedBy: e.target.value })} placeholder="Name" />
                    </Td>
                    <Td>
                      <TextInput value={r.complianceSignOff} onChange={(e) => updateRow(r.key, { complianceSignOff: e.target.value })} placeholder="Signature / Ref" />
                    </Td>
                    <Td>
                      <TextInput type="date" value={r.dateApproved} onChange={(e) => updateRow(r.key, { dateApproved: e.target.value })} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Button type="button" disabled={r.saving} onClick={() => saveRow(r)}>
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
              ))}
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

function StageLinkDocumentModal({ projectId, iterationId, phase, stage, stageItems = [], onClose, onLinked }) {
  const [documentId, setDocumentId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ALL')

  const selectedResult = results.find((r) => String(r.id) === String(documentId)) || null
  const selectedDocumentTypeId = selectedResult?.document?.documentTypeId || selectedResult?.documentTypeId || null
  const matchingItem = stageItems.find((it) => String(it.documentTypeId) === String(selectedDocumentTypeId)) || null
  const filteredResults = useMemo(() => {
    if (statusFilter === 'ALL') return results
    return results.filter((r) => String(r.document?.status || r.status || '').toUpperCase() === statusFilter)
  }, [results, statusFilter])

  const search = async (searchText = query) => {
    if (!searchText || searchText.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const params = { q: searchText.trim() }
      const res = await api.get('/project-tracking/documents/search', { params })
      setResults(res?.data?.data?.documents || [])
    } catch (error) {
      throw error
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = window.setTimeout(() => {
      search(query)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const endpoint = matchingItem
        ? `/project-tracking/items/${matchingItem.id}/link-document`
        : `/project-tracking/iterations/${iterationId}/stages/${stage.id}/link-document`
      const res = await api.post(endpoint, { documentId: Number(documentId) })
      onLinked(res?.data?.data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="Attach Existing Document" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <AssignmentSummary
          modeLabel="Attach existing document to stage"
          phaseLabel={getPhaseTitle(phase, '-')}
          stageLabel={stage?.name}
          documentTypeLabel="Keep original document type"
        />
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-ink-secondary">Find Existing Document</label>
          <div className="flex gap-2">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
              placeholder="Search globally by file code or title..."
            />
            <Button type="button" variant="secondary" onClick={() => search(query)} disabled={loading}>
              {loading && <InlineSpinner className="h-4 w-4" />}
              Search All
            </Button>
          </div>
          <div className="text-xs text-ink-soft">Search covers all accessible documents in the system, including published documents outside this project.</div>
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
            <AppSurface padding="none" variant="panel" className="max-h-56 overflow-auto">
              {filteredResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDocumentId(String(r.id))}
                  className={`w-full border-b border-border px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted last:border-b-0 ${
                    String(r.id) === String(documentId) ? 'bg-surface-muted' : ''
                  }`}
                >
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
                </button>
              ))}
            </AppSurface>
          )}
          {!loading && query.trim().length >= 2 && filteredResults.length === 0 && (
            <EmptyPanelState
              title={results.length === 0 ? 'No matching documents found' : 'No documents match the selected status'}
              description={results.length === 0
                ? 'Try file code prefix, full file code, or part of the title.'
                : 'Try switching the status filter.'}
            />
          )}
        </div>
        <div className="text-xs text-ink-soft">
          {documentId
            ? matchingItem
              ? `Selected document will be linked under required item: ${matchingItem.documentType?.name || 'Document Type'}.`
              : 'Selected document will be linked under Other Documents for this stage.'
            : 'Search and select one document from the list above.'}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={loading || !documentId} type="submit">
            {loading && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
            {loading ? 'Attaching...' : 'Attach'}
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
  const [loading, setLoading] = useState(false)

  const matchingItem = stageItems.find((it) => String(it.documentTypeId) === String(documentTypeId)) || null

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const endpoint = matchingItem
        ? `/project-tracking/items/${matchingItem.id}/create-document`
        : `/project-tracking/iterations/${iterationId}/stages/${stage.id}/create-document`
      const payload = matchingItem
        ? { title, description: description || null }
        : { documentTypeId: Number(documentTypeId), title, description: description || null }
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
        <div className="text-xs text-ink-soft">
          {matchingItem
            ? `This document type matches a required checklist item, so the new document will appear under ${matchingItem.documentType?.name || 'that required row'}.`
            : 'No required checklist item matches this document type, so the new document will be linked under Other Documents for this stage.'}
        </div>
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
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Description</label>
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
            {loading ? 'Creating...' : 'Create'}
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
  const [documentId, setDocumentId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ALL')

  const filteredResults = useMemo(() => {
    if (statusFilter === 'ALL') return results
    return results.filter((r) => String(r.document?.status || r.status || '').toUpperCase() === statusFilter)
  }, [results, statusFilter])

  const search = async (searchText = query) => {
    if (!searchText || searchText.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const params = { q: searchText.trim() }
      const res = await api.get('/project-tracking/documents/search', { params })
      setResults(res?.data?.data?.documents || [])
    } catch (error) {
      throw error
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = window.setTimeout(() => {
      search(query)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post(`/project-tracking/items/${item.id}/link-document`, { documentId: Number(documentId) })
      onLinked(res?.data?.data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="Attach Existing Document" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <AssignmentSummary
          modeLabel="Attach existing document to required item"
          phaseLabel={getPhaseTitle(phase, '-')}
          stageLabel={item.stage?.name}
          documentTypeLabel={item.documentType?.name}
        />
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-ink-secondary">Find Existing Document</label>
          <div className="flex gap-2">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
              placeholder="Search globally by file code or title..."
            />
            <Button type="button" variant="secondary" onClick={() => search(query)} disabled={loading}>
              {loading && <InlineSpinner className="h-4 w-4" />}
              Search All
            </Button>
          </div>
          <div className="text-xs text-ink-soft">Search covers all accessible documents in the system, including published documents outside this project.</div>
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
            <AppSurface padding="none" variant="panel" className="max-h-56 overflow-auto">
              {filteredResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDocumentId(String(r.id))}
                  className={`w-full border-b border-border px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted last:border-b-0 ${
                    String(r.id) === String(documentId) ? 'bg-surface-muted' : ''
                  }`}
                >
                  <div className="font-semibold text-ink">{getDocumentCodeLabel(r.document || r)}</div>
                  <div className="text-ink-secondary">{getDocumentTitleLabel(r.document || r)}</div>
                  <div className="mt-1 inline-flex items-center gap-2">
                    <ConfidentialBadge isConfidential={r.document?.isConfidential || r.isConfidential} />
                    <DocumentStatusBadge status={r.document?.status || r.status} />
                  </div>
                  <div className="mt-1 text-xs text-ink-soft">
                    {`${r.iteration?.project?.code || '-'} • ${getPhaseTitle(r.iteration, 'Phase')} • ${r.stage?.name || '-'}`}
                  </div>
                </button>
              ))}
            </AppSurface>
          )}
          {!loading && query.trim().length >= 2 && filteredResults.length === 0 && (
            <EmptyPanelState
              title={results.length === 0 ? 'No matching documents found' : 'No documents match the selected status'}
              description={results.length === 0
                ? 'Try file code prefix, full file code, or part of the title.'
                : 'Try switching the status filter.'}
            />
          )}
        </div>
        <div className="text-xs text-ink-soft">
          {documentId ? 'Selected document ready to attach.' : 'Search and select one document from the list above.'}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={loading || !documentId} type="submit">
            {loading && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
            {loading ? 'Attaching...' : 'Attach'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

function CreateDocumentModal({ item, phase, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post(`/project-tracking/items/${item.id}/create-document`, {
        title,
        description: description || null
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
        <div className="text-xs text-ink-soft">Create a new document for this required item and link it automatically.</div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Title</label>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-soft">Description</label>
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
            {loading ? 'Creating...' : 'Create'}
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
              itemsPerPage={pageSize}
              onItemsPerPageChange={setPageSize}
              totalItems={totalItems}
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

function ProjectDetail({ projectId }) {
  const navigate = useNavigate()
  const uiVersionStamp = 'PT-20260617-R3'
  const consolidatedTabId = '__consolidated__'
  const canCreate = hasPermission('projectTracking', 'create')
  const canLink = hasPermission('projectTracking', 'linkDocument')
  const canAdvance = hasPermission('projectTracking', 'advanceStage')
  const canEdit = hasPermission('projectTracking', 'edit')
  const canDelete = hasPermission('projectTracking', 'delete')
  const canManageLinkedDocumentAccess = hasPermission('projectTracking', 'manageConfidentialAccess')

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
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [advancing, setAdvancing] = useState(false)
  const [changeRequests, setChangeRequests] = useState([])
  const [changeRequestsLoading, setChangeRequestsLoading] = useState(false)
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

  useEffect(() => {
    loadProject()
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

  const stages = useMemo(() => {
    const map = new Map()
    ;(project?.enabledStages || []).forEach((stage) => {
      map.set(stage.stageId, {
        id: stage.stageId,
        stageId: stage.stageId,
        name: stage.name,
        sortOrder: stage.sortOrder
      })
    })
    items.forEach((it) => {
      if (!it.stage) return
      map.set(it.stageId, { ...map.get(it.stageId), ...it.stage })
    })
    stageDocuments.forEach((link) => {
      if (!link.stage) return
      map.set(link.stageId, { ...map.get(link.stageId), ...link.stage })
    })
    if (selectedPhase?.currentStage) {
      map.set(selectedPhase.currentStage.id, {
        ...map.get(selectedPhase.currentStage.id),
        ...selectedPhase.currentStage
      })
    }
    return Array.from(map.values()).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  }, [items, project?.enabledStages, selectedPhase?.currentStage, stageDocuments])

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
    stageDocuments.forEach((l) => {
      const sid = l.stageId
      if (!grouped.has(sid)) grouped.set(sid, [])
      grouped.get(sid).push(l)
    })
    return grouped
  }, [stageDocuments])

  const itemsByStage = useMemo(() => {
    const grouped = new Map()
    items.forEach((it) => {
      const key = it.stageId
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(it)
    })
    return grouped
  }, [items])

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

  const activeStage = useMemo(() => {
    return stages.find((stage) => stage.id === activeStageTab) || null
  }, [activeStageTab, stages])

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

  const openDocumentWorkspace = (document) => {
    if (!document?.id) return
    navigate(`/documents/${document.id}`)
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
    await api.delete(`/project-tracking/items/${itemId}/links/${linkId}`)
    if (selectedIterationId) await loadItems(selectedIterationId)
  }

  const unlinkStageDocument = async (stageId, linkId) => {
    if (!selectedIterationId) return
    await api.delete(`/project-tracking/iterations/${selectedIterationId}/stages/${stageId}/links/${linkId}`)
    await loadItems(selectedIterationId)
  }

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
    const total = items.length
    const complete = items.filter((x) => String(x.status).toUpperCase() === 'COMPLETE').length
    const pending = items.filter((x) => String(x.status).toUpperCase() === 'PENDING').length
    const waived = items.filter((x) => String(x.status).toUpperCase() === 'WAIVED').length
    const pct = total > 0 ? Math.round((complete / total) * 100) : 0
    return { total, complete, pending, waived, pct }
  }, [items])

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
    <div className="space-y-6">
      <AppSurface padding="lg" className="space-y-4">
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
            <>
              <Button variant="secondary" onClick={() => setShowActivity(true)}>Activity Logs</Button>
              {canEdit && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditChangeRequest(null)
                    setShowChangeRequestModal(true)
                  }}
                  disabled={!selectedIterationId}
                >
                  Key In Change Request
                </Button>
              )}
              {canEdit && isProjectActive && (
                <Button
                  variant="secondary"
                  className="bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)] hover:opacity-90"
                  onClick={() =>
                    setConfirmModal({
                      show: true,
                      title: 'Put Project On Hold',
                      message: 'Pause project progress for now? Existing documents stay available and you can resume later.',
                      onConfirm: () => updateProjectStatus('ON_HOLD')
                    })
                  }
                >
                  Put On Hold
                </Button>
              )}
              {canEdit && isProjectOnHold && (
                <Button
                  variant="secondary"
                  className="bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)] hover:opacity-90"
                  onClick={() =>
                    setConfirmModal({
                      show: true,
                      title: 'Resume Project',
                      message: 'Resume this project and allow progress actions again?',
                      onConfirm: () => updateProjectStatus('ACTIVE')
                    })
                  }
                >
                  Resume Project
                </Button>
              )}
              {canEdit && isProjectClosed && (
                <Button
                  variant="secondary"
                  className="bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)] hover:opacity-90"
                  onClick={() =>
                    setConfirmModal({
                      show: true,
                      title: 'Reopen Project',
                      message: 'Reopen this closed project and allow progress actions again?',
                      onConfirm: () => updateProjectStatus('ACTIVE')
                    })
                  }
                >
                  Reopen Project
                </Button>
              )}
              {canEdit && !isProjectClosed && (
                <Button
                  variant="danger"
                  className="bg-[var(--dms-color-danger-ink)] text-ink-inverse hover:opacity-90"
                  onClick={() =>
                    setConfirmModal({
                      show: true,
                      title: 'Close Project',
                      message: 'Close this project? Linked documents will remain available, but no further progress actions will be required.',
                      onConfirm: () => updateProjectStatus('CLOSED')
                    })
                  }
                >
                  Close Project
                </Button>
              )}
              {canEdit && (
                <Button variant="secondary" onClick={() => setShowEditProject(true)}>Edit</Button>
              )}
              {canCreate && (
                <Button variant="primary" onClick={() => setShowCreatePhase(true)} disabled={!isProjectActive}>
                  Add Next Phase
                </Button>
              )}
              {canAdvance && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setConfirmModal({
                      show: true,
                      title: 'Move To Next Stage',
                      message: 'Move the current phase to the next stage? This is only allowed when all required items in the current stage are completed.',
                      onConfirm: advanceStage
                    })
                  }
                  disabled={advancing || !selectedIterationId || !isProjectActive}
                >
                  {advancing ? <><InlineSpinner className="h-4 w-4" />Moving...</> : 'Move To Next Stage'}
                </Button>
              )}
              {canDelete && (
                <Button variant="danger" onClick={() =>
                  setConfirmModal({
                    show: true,
                    title: 'Delete Project',
                    message: 'Delete this project? All iterations and tracking links under it will be removed.',
                    onConfirm: deleteProject
                  })
                }>
                  Delete
                </Button>
              )}
            </>
          )}
        />

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ProjectStatusBadge status={project.status} />
          <span className="inline-flex items-center rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-ink-secondary">{project.projectCategory?.name || '-'}</span>
          <span className="inline-flex items-center rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-ink-secondary">{`Manager: ${managerLabel}`}</span>
          <span className="inline-flex items-center rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-ink-secondary">{`Current Stage: ${selectedPhase?.currentStage?.name || 'Not set'}`}</span>
        </div>
      </AppSurface>

      <AppSurface padding="lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-ink">Project Card Information</div>
            <div className="mt-1 text-sm text-ink-muted">All details captured in the project form are shown here for quick reference.</div>
          </div>
          <div className="text-sm text-ink-secondary">{`Lifecycle Status: ${formatLifecycleStatus(project.status)}`}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Code / Reference Number</div>
              <div className="mt-1 font-mono text-sm text-ink">{project.code || '-'}</div>
            </div>

            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Client Name</div>
              <div className="mt-1 text-sm text-ink">{project.clientName || '-'}</div>
            </div>

            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Client PIC</div>
              <div className="mt-1 text-sm text-ink">{project.clientPic || '-'}</div>
            </div>

            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Internal Project Manager</div>
              <div className="mt-1 text-sm text-ink">{managerLabel}</div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Start Date</div>
                <div className="mt-1 text-sm text-ink">{formatDateLabel(project.startDate)}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Planned Completion Date</div>
                <div className="mt-1 text-sm text-ink">{formatDateLabel(project.plannedCompletionDate)}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Actual Completion Date</div>
                <div className="mt-1 text-sm text-ink">{formatDateLabel(project.actualCompletionDate)}</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Team Members</div>
              <div className="mt-1 whitespace-pre-line text-sm text-ink">{project.teamMembers || '-'}</div>
            </div>

            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Scope</div>
              <div className="mt-1 whitespace-pre-line text-sm text-ink">{project.scope || '-'}</div>
            </div>

            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Objective</div>
              <div className="mt-1 whitespace-pre-line text-sm text-ink">{project.objective || '-'}</div>
            </div>

            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Deliverables</div>
              <div className="mt-1 whitespace-pre-line text-sm text-ink">{project.deliverables || '-'}</div>
            </div>

            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Project Description</div>
              <div className="mt-1 whitespace-pre-line text-sm text-ink">{project.description || '-'}</div>
            </div>
          </div>
        </div>
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
          <div className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-ink-secondary">
            {selectedPhase ? getPhaseTitle(selectedPhase, '') : ''}
          </div>
        </div>
        <div className="mt-4">
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
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
            {phases.map((phase) => {
              const isSelected = phase.id === selectedIterationId
              return (
                <button
                  key={phase.id}
                  type="button"
                  onClick={() => setSelectedIterationId(phase.id)}
                  className={`min-w-[250px] rounded-2xl border p-5 text-left transition ${
                    isSelected
                      ? 'border-brand bg-[var(--dms-color-info-soft)] shadow-dms-soft ring-1 ring-brand/10'
                      : 'border-border bg-surface hover:border-border-strong hover:bg-surface-muted'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">{`Phase ${phase.iterationNo}`}</div>
                      <div className="mt-2 text-base font-semibold text-ink">{phase.name || 'Project Phase'}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${isSelected ? 'bg-brand text-ink-inverse' : 'border border-border bg-surface-muted text-ink-secondary'}`}>
                      {isSelected ? 'Active' : 'Open'}
                    </span>
                  </div>
                  <div className="mt-4 text-sm text-ink-secondary">{`Current Stage: ${phase.currentStage?.name || '-'}`}</div>
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
            className={`flex min-h-[152px] min-w-[210px] max-w-[210px] flex-col rounded-2xl border px-4 py-4 text-left transition hover:border-border-strong hover:shadow-dms-soft ${
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
            <div className="mt-2 text-sm font-medium text-ink">Cross-stage view</div>
            <div className="mt-2 text-sm text-ink-secondary">
              Cross-stage view of all required and extra documents linked in this project phase.
            </div>
            <div className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-ink-muted">
              <span>{activeStageTab === consolidatedTabId ? 'Viewing overall project documents' : 'Open overall project documents'}</span>
              <span aria-hidden="true">→</span>
            </div>
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
                className={`flex min-h-[152px] min-w-[210px] max-w-[210px] flex-col rounded-2xl border px-4 py-4 text-left transition hover:border-border-strong hover:shadow-dms-soft ${tone}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-base font-semibold text-ink">{stage.name}</div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${isActiveTab ? 'bg-brand text-ink-inverse' : badgeTone}`}>{isActiveTab ? 'Active Tab' : badgeLabel}</span>
                </div>
                <div className="mt-2 text-sm font-medium text-ink">
                  {stage.metrics
                    ? `Required documents completed: ${stage.metrics.complete}/${stage.metrics.total}`
                    : 'Checklist not configured yet'}
                </div>
                <div className="mt-2 text-sm text-ink-secondary">
                  {stage.metrics
                    ? stage.state === 'done'
                      ? 'This stage is completed and ready for review.'
                      : stage.state === 'current'
                        ? 'Only documents under this stage are shown when this tab is active.'
                        : 'Prepare documents linked to this stage before it becomes active.'
                    : 'No checklist configured for this stage yet.'}
                </div>
                <div className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-ink-muted">
                  <span>{isActiveTab ? 'Viewing this stage' : 'Open stage tab'}</span>
                  <span aria-hidden="true">→</span>
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
                  {consolidatedDocuments.map((entry) => (
                    <Tr key={entry.id} className="hover:bg-surface-muted">
                      <Td>
                        <Link to={`/documents/${entry.document.id}`} className="font-medium text-brand hover:underline">
                          {getDocumentCodeLabel(entry.document)}
                        </Link>
                        <div className="mt-1 text-ink-secondary">{getDocumentTitleLabel(entry.document)}</div>
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
                        <button type="button" onClick={() => openDocumentWorkspace(entry.document)} className="text-brand hover:underline">
                          {String(entry.document.status || '').toUpperCase() === 'DRAFT' ? 'Continue Draft' : 'Open Workflow'}
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
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
                <>
                    <div className="flex flex-col gap-3 border-b border-border bg-surface px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-ink">Other Documents Under This Stage</div>
                        <div className="mt-1 text-sm text-ink-muted">Add extra stage documents here even if they are not listed in the required checklist. Matching document types still route into checklist rows automatically.</div>
                      </div>
                      <div className="flex gap-2">
                        {canLink && isProjectActive && (
                          <Button
                            onClick={() => setShowStageLink(st)}
                            variant="secondary"
                          >
                            Attach Existing
                          </Button>
                        )}
                        {canCreate && isProjectActive && (
                          <Button
                            onClick={() => setShowStageCreate(st)}
                          >
                            Create New
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="border-b border-border bg-surface px-6 py-5">
                      {links.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-surface-muted px-4 py-5 text-sm text-ink-muted">No extra documents added for this stage yet.</div>
                      ) : (
                        <div className="space-y-2">
                          {links.map((l) => (
                            <div key={l.id} className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm">
                              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                  <Link to={`/documents/${l.document.id}`} className="font-medium text-brand hover:underline">
                                    {getDocumentCodeLabel(l.document)}
                                  </Link>
                                  <span className="text-ink-secondary">{` • ${getDocumentTitleLabel(l.document)}`}</span>
                                  <span className="ml-2 inline-flex items-center gap-2 align-middle">
                                    <ConfidentialBadge isConfidential={l.document.isConfidential} />
                                    <DocumentStatusBadge status={l.document.status} />
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => openDocumentWorkspace(l.document)}
                                    className="font-medium text-ink-secondary hover:text-ink hover:underline"
                                  >
                                    {String(l.document.status || '').toUpperCase() === 'DRAFT' ? 'Continue Draft' : 'Open Workflow'}
                                  </button>
                                  {canLink && isProjectActive && (
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
                                      Remove Link
                                    </button>
                                  )}
                                  {canManageLinkedDocumentAccess && String(l.document.stage || '').toUpperCase() === 'DRAFT' && (
                                    <button
                                      type="button"
                                      onClick={() => setShowDocumentAccess(l.document)}
                                      className="font-medium text-brand hover:underline"
                                    >
                                      Access
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <TableContainer className="rounded-none border-0">
                      <Table>
                        <thead>
                          <Tr>
                            <Th>Document Type</Th>
                            <Th>Status</Th>
                            <Th>Completed Documents</Th>
                            <Th align="right">Action</Th>
                          </Tr>
                        </thead>
                        <tbody>
                          {stageItems.length === 0 ? (
                            <Tr>
                              <Td colSpan={4} className="px-6 py-8 text-sm text-ink-muted">
                                No required checklist items for this stage yet. Add requirements in Project Setup, or attach extra documents using the buttons above.
                              </Td>
                            </Tr>
                          ) : null}
                          {stageItems.map((it) => (
                            <Tr key={it.id} className="hover:bg-surface-muted">
                              <Td className="whitespace-nowrap text-sm text-ink">{it.documentType?.name || '-'}</Td>
                              <Td className="whitespace-nowrap text-sm">
                                <ItemStatusBadge status={it.status} />
                              </Td>
                              <Td className="text-sm text-ink-secondary">
                                {it.links?.length ? (
                                  <div className="space-y-1">
                                    {it.links.map((l) => (
                                      <div key={l.id}>
                                        <Link to={`/documents/${l.document.id}`} className="text-brand hover:underline">
                                          {getDocumentCodeLabel(l.document)}
                                        </Link>
                                        <span className="text-ink-muted">{` • ${getDocumentTitleLabel(l.document)}`}</span>
                                        <span className="ml-2 inline-flex items-center gap-2 align-middle">
                                          <ConfidentialBadge isConfidential={l.document.isConfidential} />
                                          <DocumentStatusBadge status={l.document.status} />
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => openDocumentWorkspace(l.document)}
                                          className="ml-3 text-xs text-ink-secondary hover:text-ink hover:underline"
                                        >
                                          {String(l.document.status || '').toUpperCase() === 'DRAFT' ? 'Continue Draft' : 'Open Workflow'}
                                        </button>
                                        {canLink && isProjectActive && (
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
                                            className="ml-3 text-xs text-red-600 hover:underline"
                                          >
                                            Remove Link
                                          </button>
                                        )}
                                        {canManageLinkedDocumentAccess && String(l.document.stage || '').toUpperCase() === 'DRAFT' && (
                                          <button
                                            type="button"
                                            onClick={() => setShowDocumentAccess(l.document)}
                                            className="ml-3 text-xs text-brand hover:underline"
                                          >
                                            Access
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-ink-soft">-</span>
                                )}
                              </Td>
                              <Td align="right" className="whitespace-nowrap text-sm">
                                {canLink && isProjectActive ? (
                                  <div className="flex items-center justify-end gap-3">
                                    <button onClick={() => setShowLink(it)} className="text-brand hover:underline">
                                      Attach Existing
                                    </button>
                                    {canCreate && (
                                      <button onClick={() => setShowCreateDoc(it)} className="text-ink-secondary hover:text-ink hover:underline">
                                        Create New
                                      </button>
                                    )}
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
                </>
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
          onLinked={() => {
            setShowLink(null)
            if (selectedIterationId) loadItems(selectedIterationId)
          }}
        />
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

      {showStageLink && selectedIterationId && (
        <StageLinkDocumentModal
          projectId={projectId}
          iterationId={selectedIterationId}
          phase={selectedPhase}
          stage={showStageLink}
          stageItems={itemsByStage.get(showStageLink.id) || []}
          onClose={() => setShowStageLink(null)}
          onLinked={() => {
            setShowStageLink(null)
            if (selectedIterationId) loadItems(selectedIterationId)
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
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])

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
    try {
      const params = { q }
      if (projectId) params.projectId = projectId
      const res = await api.get('/project-tracking/documents/search', { params })
      setResults(res?.data?.data?.documents || [])
    } finally {
      setLoading(false)
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
          placeholder="Search documents across all projects or by selected project..."
          className="flex-1"
        />
        <Button onClick={search}>
          Search
        </Button>
      </AppSurface>

      {loading ? (
        <AppSurface padding="lg" className="flex items-center gap-3">
          <InlineSpinner className="h-4 w-4" />
          <span className="text-sm text-ink-muted">Searching...</span>
        </AppSurface>
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
                </Tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <Tr key={r.id} className="hover:bg-surface-muted">
                    <Td>
                      <Link to={`/documents/${r.document.id}`} className="text-brand hover:underline">
                        {r.document.fileCode}
                      </Link>
                      <div className="text-ink-muted">{r.document.title}</div>
                    </Td>
                    <Td className="text-ink-secondary">
                      {r.iteration?.project?.code} • {r.iteration?.project?.name}
                    </Td>
                    <Td className="text-ink-secondary">{`#${r.iteration?.iterationNo || '-'}`}</Td>
                    <Td className="text-ink-secondary">{r.stage?.name || '-'}</Td>
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

function Setup() {
  const [documentTypes, setDocumentTypes] = useState([])
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [stages, setStages] = useState([])
  const [requirements, setRequirements] = useState([])
  const [loading, setLoading] = useState(false)
  const [savingStages, setSavingStages] = useState(false)
  const [addingReq, setAddingReq] = useState(false)
  const [showAddStage, setShowAddStage] = useState(false)
  const [newReq, setNewReq] = useState({ stageId: '', documentTypeId: '', isRequired: true, isConfidentialDefault: false })
  const [accessRequirement, setAccessRequirement] = useState(null)
  const [accessEntries, setAccessEntries] = useState([])
  const [accessQuery, setAccessQuery] = useState('')
  const [subjectResults, setSubjectResults] = useState({ users: [], roles: [] })
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [savingAccess, setSavingAccess] = useState(false)

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
      setStages(st?.data?.data?.stages || [])
      setRequirements(req?.data?.data?.requirements || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBase()
  }, [])

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
      setStages(res?.data?.data?.stages || [])
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
    setAddingReq(true)
    try {
      const isProjectScope = !!selectedProjectId
      await api.post(isProjectScope ? `/project-tracking/projects/${selectedProjectId}/setup/requirements` : '/project-tracking/setup/requirements', {
        stageId: Number(newReq.stageId),
        documentTypeId: Number(newReq.documentTypeId),
        isRequired: Boolean(newReq.isRequired),
        isConfidentialDefault: Boolean(newReq.isConfidentialDefault)
      })
      setNewReq({ stageId: '', documentTypeId: '', isRequired: true, isConfidentialDefault: false })
      await loadSetup(selectedProjectId)
    } finally {
      setAddingReq(false)
    }
  }

  const deleteRequirement = async (id) => {
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

  return (
    <div className="space-y-4">
      <AppSurface padding="lg">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-ink-secondary">Setup Scope</div>
            <div className="mt-1 text-xs text-ink-muted">
              Default setup applies to all projects. Select a project only when you need a customized setup that will not affect other projects.
            </div>
          </div>
          <div className="w-full lg:w-80">
            <SelectField
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="">Default (All Projects)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{`${p.code} • ${p.name}`}</option>
              ))}
            </SelectField>
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
            <div className="text-lg font-semibold text-ink">{requirements.length}</div>
          </div>
        </div>
      </AppSurface>

      {loading ? (
        <AppSurface padding="lg" className="flex items-center gap-3">
          <InlineSpinner className="h-4 w-4" />
          <span className="text-sm text-ink-muted">Loading...</span>
        </AppSurface>
      ) : (
        <div className="space-y-4">
          <AppSurface padding="lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-ink">Stage Flow</div>
                <div className="mt-1 text-xs text-ink-muted">Rename stage labels, turn stages on or off, and reorder the flow using the move buttons.</div>
              </div>
              <div className="flex gap-2">
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
                  {savingStages ? 'Saving...' : 'Save Stage Flow'}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {sortedStages.map((s, idx) => {
                const displayLabel = s.displayName || s.stage?.name || '-'
                return (
                  <div
                    key={s.stageId}
                    className={`min-w-[250px] rounded-xl border p-4 ${
                      s.isEnabled ? 'border-brand bg-[var(--dms-color-info-soft)]/70' : 'border-border bg-surface-muted'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{`Stage ${idx + 1}`}</div>
                        <div className="mt-1 text-sm font-semibold text-ink">{s.stage?.name || '-'}</div>
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

          <AppSurface padding="none" className="overflow-hidden">
            <div className="border-b border-border bg-surface-muted px-6 py-4">
              <div className="text-sm font-semibold text-ink">Required Documents By Stage</div>
              <div className="mt-1 text-xs text-ink-muted">Add document types that must appear in the checklist when a new project phase is created.</div>
            </div>

            <div className="border-b border-border bg-surface p-5">
              <form onSubmit={addRequirement} className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.2fr_auto_auto] gap-3 items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Stage</label>
                  <SelectField
                    value={newReq.stageId}
                    onChange={(e) => setNewReq((p) => ({ ...p, stageId: e.target.value }))}
                    required
                  >
                    <option value="">Select stage</option>
                    {stageOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </SelectField>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Document Type</label>
                  <SelectField
                    value={newReq.documentTypeId}
                    onChange={(e) => setNewReq((p) => ({ ...p, documentTypeId: e.target.value }))}
                    required
                  >
                    <option value="">Select document type</option>
                    {documentTypes.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </SelectField>
                </div>
                <label className="flex h-10 items-center gap-2 px-1 text-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={!!newReq.isConfidentialDefault}
                    onChange={(e) => setNewReq((p) => ({ ...p, isConfidentialDefault: e.target.checked }))}
                    className="rounded border-border text-brand focus-visible:ring-brand/30"
                  />
                  Confidential
                </label>
                <Button
                  disabled={addingReq}
                  type="submit"
                >
                  {addingReq ? 'Adding...' : 'Add Requirement'}
                </Button>
              </form>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {sortedStages.map((s) => {
                  const stageRequirements = requirementsByStage.get(s.stageId) || []
                  const stageLabel = s.displayName || s.stage?.name || '-'
                  return (
                    <div key={s.stageId} className="overflow-hidden rounded-xl border border-border bg-surface">
                      <div className={`border-b border-border px-4 py-3 ${s.isEnabled ? 'bg-surface' : 'bg-surface-muted'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-ink">{stageLabel}</div>
                            <div className="mt-1 text-xs text-ink-muted">
                              {s.isEnabled ? 'Active stage in project flow' : 'Hidden stage in project flow'}
                            </div>
                          </div>
                          <span className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-secondary">
                            {`${stageRequirements.length} required`}
                          </span>
                        </div>
                      </div>

                      <div className="p-4">
                        {stageRequirements.length === 0 ? (
                          <div className="text-sm text-ink-muted">No required document type added for this stage yet.</div>
                        ) : (
                          <div className="space-y-2">
                            {stageRequirements.map((r) => (
                              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-ink">{r.documentType?.name || '-'}</div>
                                  <div className="mt-1 text-xs text-ink-muted">
                                    {r.isConfidentialDefault ? 'Confidential by default' : 'Standard visibility'}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  {r.isConfidentialDefault && (
                                    <button
                                      type="button"
                                      onClick={() => openRequirementAccess(r)}
                                      className="text-sm text-brand hover:underline"
                                    >
                                      Access
                                    </button>
                                  )}
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
                  )
                })}
              </div>
            </div>
          </AppSurface>
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
            <div className="text-sm text-gray-700">
              {`Requirement: ${accessRequirement.documentType?.name || '-'} • ${stageOptions.find((x) => String(x.id) === String(accessRequirement.stageId))?.label || '-'}`}
            </div>

            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Allowed viewers</div>
              {accessEntries.length === 0 ? (
                <div className="text-sm text-gray-500">No viewers added yet. Only creator/owner will be able to view confidential documents created from this requirement.</div>
              ) : (
                <div className="space-y-2">
                  {accessEntries.map((e) => (
                    <div key={`${e.subjectType}:${e.subjectId}`} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
                      <div className="text-sm text-gray-800">{e.label}</div>
                      <button type="button" onClick={() => removeAccessEntry(e)} className="text-sm text-red-600 hover:underline">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 p-3 space-y-3">
              <div className="text-xs font-medium text-gray-500">Add user or role</div>
              <div className="flex gap-2">
                <input
                  value={accessQuery}
                  onChange={(e) => setAccessQuery(e.target.value)}
                  placeholder="Search user email/name or role..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                />
                <button type="button" onClick={searchSubjects} className="px-4 py-2 rounded-md bg-gray-800 text-white hover:bg-gray-900">
                  {loadingSubjects ? 'Searching...' : 'Search'}
                </button>
              </div>

              {(subjectResults.users.length > 0 || subjectResults.roles.length > 0) && (
                <div className="max-h-56 overflow-auto border border-gray-200 rounded-md">
                  {subjectResults.roles.map((r) => (
                    <button
                      key={`role:${r.id}`}
                      type="button"
                      onClick={() => addAccessEntry({ subjectType: 'ROLE', subjectId: r.id, label: `${r.displayName || r.name} (Role)` })}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0"
                    >
                      <div className="font-medium text-gray-900">{r.displayName || r.name}</div>
                      <div className="text-xs text-gray-500">Role</div>
                    </button>
                  ))}
                  {subjectResults.users.map((u) => (
                    <button
                      key={`user:${u.id}`}
                      type="button"
                      onClick={() => addAccessEntry({ subjectType: 'USER', subjectId: u.id, label: `${`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email} (User)` })}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0"
                    >
                      <div className="font-medium text-gray-900">{`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAccessRequirement(null)} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
                Close
              </button>
              <button
                type="button"
                disabled={savingAccess}
                onClick={saveRequirementAccess}
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingAccess ? 'Saving...' : 'Save Access'}
              </button>
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
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = String(searchParams.get('tab') || 'projects')

  const setTab = (tab) => {
    if (tab === 'projects') {
      navigate('/project-tracking')
      return
    }

    navigate(`/project-tracking?tab=${encodeURIComponent(tab)}`)
  }

  useEffect(() => {
    if (projectId && activeTab !== 'projects') {
      setTab('projects')
    }
  }, [projectId])

  const tabs = useMemo(() => {
    const base = [
      { id: 'projects', label: 'Projects' },
      { id: 'search', label: 'Search' }
    ]
    if (hasPermission('projectTracking', 'manageTemplates')) {
      base.push({ id: 'setup', label: 'Project Setup' })
    }
    return base
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Tracking"
        subtitle="Track project phases, linked documents, and setup flows under the shared design system."
      />

      <AppSurface padding="none">
        <div className="border-b border-border px-4">
          <nav className="flex gap-2 overflow-x-auto py-2" aria-label="Tabs">
            {tabs.map((t) => {
              const isActive = activeTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
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
          {activeTab === 'setup' ? (
            <Setup />
          ) : activeTab === 'search' ? (
            <DocumentsSearch />
          ) : projectId ? (
            <ProjectDetail projectId={Number(projectId)} />
          ) : (
            <ProjectsList onOpenProject={(id) => navigate(`/project-tracking/${id}`)} />
          )}
        </div>
      </AppSurface>
    </div>
  )
}
