import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import Pagination from './Pagination'
import EmptyState from './EmptyState'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import { hasPermission } from '../utils/permissions'
import { usePreferences } from '../contexts/PreferencesContext'

function ItemStatusBadge({ status }) {
  const s = String(status || '').toUpperCase()
  const base = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'
  if (s === 'COMPLETE') return <span className={`${base} bg-green-100 text-green-800`}>Complete</span>
  if (s === 'WAIVED') return <span className={`${base} bg-gray-100 text-gray-800`}>Waived</span>
  return <span className={`${base} bg-yellow-100 text-yellow-800`}>Pending</span>
}

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function getPhaseTitle(phase, fallback = 'Project Phase') {
  if (!phase) return fallback
  const prefix = phase.iterationNo ? `Phase ${phase.iterationNo}` : 'Phase'
  return phase.name ? `${prefix} - ${phase.name}` : prefix
}

function DocumentStatusBadge({ status }) {
  const s = String(status || '').toUpperCase()
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium'
  if (s === 'PUBLISHED') return <span className={`${base} bg-green-100 text-green-800`}>Published</span>
  if (s === 'PENDING_REVIEW' || s === 'IN_REVIEW') return <span className={`${base} bg-amber-100 text-amber-800`}>In Review</span>
  if (s === 'SUPERSEDED' || s === 'OBSOLETE') return <span className={`${base} bg-gray-100 text-gray-700`}>{s === 'SUPERSEDED' ? 'Superseded' : 'Obsolete'}</span>
  return <span className={`${base} bg-blue-100 text-blue-800`}>Draft</span>
}

function ConfidentialBadge({ isConfidential }) {
  if (!isConfidential) return null
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700">Confidential</span>
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
        <div className="text-sm text-gray-500">Loading access settings...</div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="text-sm font-semibold text-gray-900">{document.fileCode}</div>
            <div className="text-sm text-gray-600 mt-1">{document.title}</div>
            <div className="mt-2 flex items-center gap-2">
              <DocumentStatusBadge status={document.status} />
              <span className="text-xs text-gray-500">{`Workflow stage: ${document.stage || '-'}`}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isConfidential}
              onChange={(e) => setIsConfidential(e.target.checked)}
            />
            Mark this document as confidential
          </label>

          {!isConfidential ? (
            <div className="text-sm text-gray-500">When confidential is off, normal document visibility rules apply.</div>
          ) : (
            <>
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Allowed viewers</div>
                {accessEntries.length === 0 ? (
                  <div className="text-sm text-gray-500">No extra viewers added yet. Only creator/owner and users with global confidential permission will have access.</div>
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

                {(subjectResults.roles.length > 0 || subjectResults.users.length > 0) && (
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
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
              Close
            </button>
            <button type="button" disabled={saving} onClick={save} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Access'}
            </button>
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
    <ModalShell title="Project Activity" onClose={onClose}>
      {loading ? (
        <div className="text-sm text-gray-500">Loading activity...</div>
      ) : logs.length === 0 ? (
        <div className="text-sm text-gray-500">No activity recorded for this project yet.</div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{l.user}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{l.action}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{l.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">{`Page ${page} of ${totalPages}`}</div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => load(page - 1)}
                className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => load(page + 1)}
                className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
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
        <div className="text-sm text-gray-600">
          Add a new stage for the selected project category. This stage will appear in the stage flow and can be reordered after creation.
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stage Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Example: UAT"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Display Label</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Optional label shown to users"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button disabled={loading} type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Adding...' : 'Add Stage'}
          </button>
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
        <div className="text-sm text-gray-600">
          {isEdit
            ? 'Update the name shown to users for this project phase.'
            : `Create Phase ${nextPhaseNo || '-'} with a custom name instead of the default iteration label.`}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phase Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Example: Pilot Rollout, Wave 2, UAT"
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button disabled={loading} type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Phase' : 'Create Phase')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function AssignmentSummary({ phaseLabel, stageLabel, documentTypeLabel, modeLabel }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">{modeLabel}</div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <div className="text-xs font-medium text-gray-500">Phase</div>
          <div className="text-sm font-semibold text-gray-900">{phaseLabel || '-'}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500">Stage</div>
          <div className="text-sm font-semibold text-gray-900">{stageLabel || '-'}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500">Document Type</div>
          <div className="text-sm font-semibold text-gray-900">{documentTypeLabel || 'Choose in form below'}</div>
        </div>
      </div>
    </div>
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
          <label className="block text-sm font-medium text-gray-700">Find Existing Document</label>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Search globally by file code or title..."
            />
            <button type="button" onClick={() => search(query)} className="px-4 py-2 rounded-md bg-gray-800 text-white hover:bg-gray-900">
              Search All
            </button>
          </div>
          <div className="text-xs text-gray-500">Search covers all accessible documents in the system, including published documents outside this project.</div>
          <div className="flex flex-wrap gap-2 pt-1">
            {['ALL', 'PUBLISHED', 'DRAFT'].map((filterValue) => (
              <button
                key={filterValue}
                type="button"
                onClick={() => setStatusFilter(filterValue)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  statusFilter === filterValue ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filterValue === 'ALL' ? 'All' : filterValue === 'PUBLISHED' ? 'Published' : 'Draft'}
              </button>
            ))}
          </div>
          {filteredResults.length > 0 && (
            <div className="max-h-56 overflow-auto border border-gray-200 rounded-md">
              {filteredResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDocumentId(String(r.id))}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0 ${
                    String(r.id) === String(documentId) ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900">{getDocumentCodeLabel(r.document || r)}</div>
                  <div className="text-gray-600">{getDocumentTitleLabel(r.document || r)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {r.document?.documentType?.name || r.item?.documentType?.name || 'Document type unavailable'}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-2">
                    <ConfidentialBadge isConfidential={r.document?.isConfidential || r.isConfidential} />
                    <DocumentStatusBadge status={r.document?.status || r.status} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {`${r.iteration?.project?.code || '-'} • ${getPhaseTitle(r.iteration, 'Phase')} • ${r.stage?.name || '-'}`}
                  </div>
                </button>
              ))}
            </div>
          )}
          {!loading && query.trim().length >= 2 && filteredResults.length === 0 && (
            <div className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500">
              {results.length === 0
                ? 'No matching documents found. Try file code prefix, full file code, or part of the title.'
                : 'No documents match the selected status filter.'}
            </div>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {documentId
            ? matchingItem
              ? `Selected document will be linked under required item: ${matchingItem.documentType?.name || 'Document Type'}.`
              : 'Selected document will be linked under Other Documents for this stage.'
            : 'Search and select one document from the list above.'}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button disabled={loading || !documentId} type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Attaching...' : 'Attach'}
          </button>
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
        <div className="text-xs text-gray-500">
          {matchingItem
            ? `This document type matches a required checklist item, so the new document will appear under ${matchingItem.documentType?.name || 'that required row'}.`
            : 'No required checklist item matches this document type, so the new document will be linked under Other Documents for this stage.'}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
          <select
            value={documentTypeId}
            onChange={(e) => setDocumentTypeId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          >
            <option value="">Select</option>
            {documentTypes.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button disabled={loading} type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function CreateProjectModal({ onClose, onCreated }) {
  const { t } = usePreferences()
  const [loading, setLoading] = useState(false)
  const [projectCategories, setProjectCategories] = useState([])
  const [users, setUsers] = useState([])

  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
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
    <ModalShell title="Create Project" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Code</label>
          <input
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Category</label>
          <select
            value={form.projectCategoryId}
            onChange={(e) => setForm((p) => ({ ...p, projectCategoryId: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          >
            <option value="">Select</option>
            {projectCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Manager</label>
          <select
            value={form.managerId}
            onChange={(e) => setForm((p) => ({ ...p, managerId: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          >
            <option value="">Select</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button disabled={loading} type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Creating...' : 'Create'}
          </button>
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
          <label className="block text-sm font-medium text-gray-700">Find Existing Document</label>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Search globally by file code or title..."
            />
            <button type="button" onClick={() => search(query)} className="px-4 py-2 rounded-md bg-gray-800 text-white hover:bg-gray-900">
              Search All
            </button>
          </div>
          <div className="text-xs text-gray-500">Search covers all accessible documents in the system, including published documents outside this project.</div>
          <div className="flex flex-wrap gap-2 pt-1">
            {['ALL', 'PUBLISHED', 'DRAFT'].map((filterValue) => (
              <button
                key={filterValue}
                type="button"
                onClick={() => setStatusFilter(filterValue)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  statusFilter === filterValue ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filterValue === 'ALL' ? 'All' : filterValue === 'PUBLISHED' ? 'Published' : 'Draft'}
              </button>
            ))}
          </div>
          {filteredResults.length > 0 && (
            <div className="max-h-56 overflow-auto border border-gray-200 rounded-md">
              {filteredResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDocumentId(String(r.id))}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0 ${
                    String(r.id) === String(documentId) ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900">{getDocumentCodeLabel(r.document || r)}</div>
                  <div className="text-gray-600">{getDocumentTitleLabel(r.document || r)}</div>
                  <div className="mt-1 inline-flex items-center gap-2">
                    <ConfidentialBadge isConfidential={r.document?.isConfidential || r.isConfidential} />
                    <DocumentStatusBadge status={r.document?.status || r.status} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {`${r.iteration?.project?.code || '-'} • ${getPhaseTitle(r.iteration, 'Phase')} • ${r.stage?.name || '-'}`}
                  </div>
                </button>
              ))}
            </div>
          )}
          {!loading && query.trim().length >= 2 && filteredResults.length === 0 && (
            <div className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500">
              {results.length === 0
                ? 'No matching documents found. Try file code prefix, full file code, or part of the title.'
                : 'No documents match the selected status filter.'}
            </div>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {documentId ? 'Selected document ready to attach.' : 'Search and select one document from the list above.'}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button disabled={loading || !documentId} type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Attaching...' : 'Attach'}
          </button>
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
        <div className="text-xs text-gray-500">Create a new document for this required item and link it automatically.</div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button disabled={loading} type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Creating...' : 'Create'}
          </button>
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t ? t('search') : 'Search...'}
            className="w-full sm:max-w-md px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
            Create Project
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-6 bg-white rounded-lg shadow">Loading...</div>
      ) : totalItems === 0 ? (
        <EmptyState title="No projects" message="Create a project to start tracking documents by stage." />
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manager</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latest Phase</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginated.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpenProject(p.id)}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">{p.code}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{p.projectCategory?.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {`${p.manager?.firstName || ''} ${p.manager?.lastName || ''}`.trim() || p.manager?.email || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {p.iterations?.[0] ? `Phase ${p.iterations[0].iterationNo} • ${p.iterations[0].currentStage?.name || '-'}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        </div>
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
  const uiVersionStamp = 'PT-20260617-R2'
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

  useEffect(() => {
    loadProject()
  }, [projectId])

  useEffect(() => {
    if (selectedIterationId) loadItems(selectedIterationId)
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
    if (!stages.length) {
      setActiveStageTab(consolidatedTabId)
      return
    }

    setActiveStageTab((prev) => {
      if (prev && stages.some((s) => s.id === prev)) return prev
      if (selectedPhase?.currentStage?.id && stages.some((s) => s.id === selectedPhase.currentStage.id)) return selectedPhase.currentStage.id
      return stages[0].id
    })
  }, [stages, selectedPhase?.currentStage?.id, selectedIterationId])

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

  if (loading) return <div className="p-6 bg-white rounded-lg shadow">Loading...</div>
  if (!project) return <EmptyState title="Project not found" message="The project may have been deleted." />

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 shadow-lg">
        <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
          <div className="max-w-3xl">
            <div className="text-sm text-blue-100/90">
              <button className="text-blue-200 hover:text-white hover:underline" onClick={() => navigate('/project-tracking')}>Projects</button>
              <span className="mx-2 text-blue-200/60">/</span>
              <span className="text-white/90">{project.code}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white lg:text-4xl">{project.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-blue-50/90">
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1">{project.projectCategory?.name || '-'}</span>
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1">{`Manager: ${`${project.manager?.firstName || ''} ${project.manager?.lastName || ''}`.trim() || project.manager?.email || '-'}`}</span>
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1">{`Current Stage: ${selectedPhase?.currentStage?.name || 'Not set'}`}</span>
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 font-mono text-[11px]">{`UI ${uiVersionStamp}`}</span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-blue-100/80">
              Track required documents, extra stage files, reviewer workflow, and confidential access for every phase under the same project.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button
              onClick={() => setShowActivity(true)}
              className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur hover:bg-white/15"
            >
              Activity
            </button>
            {canEdit && (
              <button
                onClick={() => setShowEditProject(true)}
                className="rounded-lg border border-white/15 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
              >
                Edit
              </button>
            )}
            {canCreate && (
              <button onClick={() => setShowCreatePhase(true)} className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400">
                Add Next Phase
              </button>
            )}
            {canAdvance && (
              <button
                onClick={() =>
                  setConfirmModal({
                    show: true,
                    title: 'Move To Next Stage',
                    message: 'Move the current phase to the next stage? This is only allowed when all required items in the current stage are completed.',
                    onConfirm: advanceStage
                  })
                }
                disabled={advancing || !selectedIterationId}
                className="rounded-lg border border-white/15 bg-slate-950/40 px-4 py-2 text-sm font-medium text-white hover:bg-slate-950/60 disabled:opacity-50"
              >
                {advancing ? 'Moving...' : 'Move To Next Stage'}
              </button>
            )}
            {canDelete && (
              <button
                onClick={() =>
                  setConfirmModal({
                    show: true,
                    title: 'Delete Project',
                    message: 'Delete this project? All iterations and tracking links under it will be removed.',
                    onConfirm: deleteProject
                  })
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Selected Phase</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{selectedPhase ? getPhaseTitle(selectedPhase, '-') : '-'}</div>
          <div className="mt-2 text-sm text-slate-600">{selectedPhase?.currentStage?.name || 'No current stage set'}</div>
          {canEdit && selectedPhase && (
            <button
              type="button"
              onClick={() => setShowEditPhase(selectedPhase)}
              className="mt-3 text-sm font-medium text-blue-600 hover:underline"
            >
              Rename Phase
            </button>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Required Completion</div>
          <div className="mt-2 flex items-end gap-2">
            <div className="text-3xl font-semibold text-slate-900">{overallStats.pct}%</div>
            <div className="pb-1 text-sm text-slate-500">{`${overallStats.complete}/${overallStats.total} complete`}</div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-600" style={{ width: `${overallStats.pct}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending Items</div>
          <div className="mt-2 text-3xl font-semibold text-amber-600">{overallStats.pending}</div>
          <div className="mt-2 text-sm text-slate-500">Checklist items still waiting for published evidence.</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Waived Items</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{overallStats.waived}</div>
          <div className="mt-2 text-sm text-slate-500">Items excluded from phase completion requirements.</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          Use "Add Next Phase" for enhancement, extension, or the next rollout under the same project.
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Project Phases</div>
            <div className="mt-1 text-sm text-slate-500">Switch between iterations under the same project and review each stage flow separately.</div>
          </div>
          <div className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:inline-flex">{`${phases.length} phase${phases.length === 1 ? '' : 's'}`}</div>
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
                      ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm ring-1 ring-blue-100'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{`Phase ${phase.iterationNo}`}</div>
                      <div className="mt-2 text-base font-semibold text-slate-900">{phase.name || 'Project Phase'}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {isSelected ? 'Active' : 'Open'}
                    </span>
                  </div>
                  <div className="mt-4 text-sm text-slate-600">{`Current Stage: ${phase.currentStage?.name || '-'}`}</div>
                </button>
              )
            })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Stage Flow</div>
            <div className="mt-1 text-sm text-slate-500">Use the stage tabs below to keep each stage isolated. Consolidated Documents shows every linked document in this project phase with its stage label.</div>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {selectedPhase ? getPhaseTitle(selectedPhase, '') : ''}
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {stageFlow.map((stage) => {
            const isActiveTab = activeStageTab === stage.id
            const tone =
              isActiveTab
                ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm ring-1 ring-blue-100'
                : stage.state === 'done'
                  ? 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50'
                  : 'border-slate-200 bg-slate-50'

            const badgeTone =
              stage.state === 'current'
                ? 'bg-blue-100 text-blue-700'
                : stage.state === 'done'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-200 text-gray-700'

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
                className={`min-w-[240px] rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-base font-semibold text-slate-900">{stage.name}</div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${isActiveTab ? 'bg-blue-600 text-white' : badgeTone}`}>{isActiveTab ? 'Active Tab' : badgeLabel}</span>
                </div>
                <div className="mt-4 text-sm text-slate-600">
                  {stage.metrics
                    ? `Required documents completed: ${stage.metrics.complete}/${stage.metrics.total}`
                    : 'No checklist configured for this stage yet.'}
                </div>
                <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                  <span>{isActiveTab ? 'Viewing this stage' : 'Open stage tab'}</span>
                  <span aria-hidden="true">→</span>
                </div>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setActiveStageTab(consolidatedTabId)}
            className={`min-w-[240px] rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
              activeStageTab === consolidatedTabId
                ? 'border-slate-900 bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-sm'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`text-base font-semibold ${activeStageTab === consolidatedTabId ? 'text-white' : 'text-slate-900'}`}>Consolidated Documents</div>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${activeStageTab === consolidatedTabId ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {`${consolidatedDocuments.length} docs`}
              </span>
            </div>
            <div className={`mt-4 text-sm ${activeStageTab === consolidatedTabId ? 'text-slate-200' : 'text-slate-600'}`}>
              Cross-stage view of all required and extra documents linked in this project phase.
            </div>
            <div className={`mt-4 inline-flex items-center gap-1 text-xs font-medium ${activeStageTab === consolidatedTabId ? 'text-slate-100' : 'text-slate-500'}`}>
              <span>{activeStageTab === consolidatedTabId ? 'Viewing consolidated tab' : 'Open consolidated tab'}</span>
              <span aria-hidden="true">→</span>
            </div>
          </button>
        </div>
      </div>

      {itemsLoading ? (
        <div className="p-6 bg-white rounded-lg shadow">Loading checklist...</div>
      ) : items.length === 0 && stageDocuments.length === 0 ? (
        <EmptyState title="No required documents yet" message="No required document template has been set for this project category yet. Go to Category Setup to configure it." />
      ) : activeStageTab === consolidatedTabId ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="text-lg font-semibold text-slate-900">Consolidated Documents</div>
            <div className="mt-1 text-sm text-slate-500">All linked documents for this project phase, grouped in one list with stage and checklist context.</div>
          </div>
          {consolidatedDocuments.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">No linked documents found for this project phase yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Document</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Stage</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Context</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {consolidatedDocuments.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm">
                        <Link to={`/documents/${entry.document.id}`} className="font-medium text-blue-600 hover:underline">
                          {getDocumentCodeLabel(entry.document)}
                        </Link>
                        <div className="mt-1 text-slate-600">{getDocumentTitleLabel(entry.document)}</div>
                        <div className="mt-2 inline-flex items-center gap-2">
                          <ConfidentialBadge isConfidential={entry.document.isConfidential} />
                          <DocumentStatusBadge status={entry.document.status} />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">{entry.stageName}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        <div>{entry.source}</div>
                        <div className="mt-1 text-xs text-slate-500">{entry.documentTypeName}</div>
                        {entry.itemStatus ? <div className="mt-1 text-xs text-slate-500">{`Checklist status: ${entry.itemStatus}`}</div> : null}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <DocumentStatusBadge status={entry.document.status} />
                      </td>
                      <td className="px-6 py-4 text-right text-sm">
                        <button type="button" onClick={() => openDocumentWorkspace(entry.document)} className="text-blue-600 hover:underline">
                          {String(entry.document.status || '').toUpperCase() === 'DRAFT' ? 'Continue Draft' : 'Open Workflow'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
              <div key={st.id} id={`stage-panel-${st.id}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="w-full border-b px-6 py-5 text-left bg-slate-50">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="text-base font-semibold text-slate-900">{st.name}</div>
                      <span className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium bg-blue-100 text-blue-700">
                        Active Tab
                      </span>
                    </div>
                    <div className="text-sm text-slate-600">{`Complete ${complete}/${total} • Pending ${pending} • Waived ${waived}`}</div>
                    <div className="w-full sm:w-56">
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-2.5 bg-gradient-to-r from-emerald-500 to-green-600" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-500">{summary}</div>
                    <div className="inline-flex items-center gap-2 text-sm text-slate-400">
                      <span>Only documents under this stage are shown here</span>
                    </div>
                  </div>
                </div>
                <>
                    <div className="flex flex-col gap-3 border-b bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Other Documents Under This Stage</div>
                        <div className="mt-1 text-sm text-slate-500">Add extra stage documents here even if they are not listed in the required checklist. Matching document types still route into checklist rows automatically.</div>
                      </div>
                      <div className="flex gap-2">
                        {canLink && (
                          <button
                            onClick={() => setShowStageLink(st)}
                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                          >
                            Attach Existing
                          </button>
                        )}
                        {canCreate && (
                          <button
                            onClick={() => setShowStageCreate(st)}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                          >
                            Create New
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="border-b bg-white px-6 py-5">
                      {links.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">No extra documents added for this stage yet.</div>
                      ) : (
                        <div className="space-y-2">
                          {links.map((l) => (
                            <div key={l.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm">
                              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                  <Link to={`/documents/${l.document.id}`} className="font-medium text-blue-600 hover:underline">
                                    {getDocumentCodeLabel(l.document)}
                                  </Link>
                                  <span className="text-slate-600">{` • ${getDocumentTitleLabel(l.document)}`}</span>
                                  <span className="ml-2 inline-flex items-center gap-2 align-middle">
                                    <ConfidentialBadge isConfidential={l.document.isConfidential} />
                                    <DocumentStatusBadge status={l.document.status} />
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => openDocumentWorkspace(l.document)}
                                    className="font-medium text-slate-700 hover:underline"
                                  >
                                    {String(l.document.status || '').toUpperCase() === 'DRAFT' ? 'Continue Draft' : 'Open Workflow'}
                                  </button>
                                  {canLink && (
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
                                      className="font-medium text-blue-600 hover:underline"
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
                    <div className="overflow-x-auto bg-white">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Document Type</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Completed Documents</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Action</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {stageItems.map((it) => (
                            <tr key={it.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{it.documentType?.name || '-'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <ItemStatusBadge status={it.status} />
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-700">
                                {it.links?.length ? (
                                  <div className="space-y-1">
                                    {it.links.map((l) => (
                                      <div key={l.id}>
                                        <Link to={`/documents/${l.document.id}`} className="text-blue-600 hover:underline">
                                          {getDocumentCodeLabel(l.document)}
                                        </Link>
                                        <span className="text-gray-500">{` • ${getDocumentTitleLabel(l.document)}`}</span>
                                        <span className="ml-2 inline-flex items-center gap-2 align-middle">
                                          <ConfidentialBadge isConfidential={l.document.isConfidential} />
                                          <DocumentStatusBadge status={l.document.status} />
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => openDocumentWorkspace(l.document)}
                                          className="ml-3 text-xs text-gray-700 hover:underline"
                                        >
                                          {String(l.document.status || '').toUpperCase() === 'DRAFT' ? 'Continue Draft' : 'Open Workflow'}
                                        </button>
                                        {canLink && (
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
                                            className="ml-3 text-xs text-blue-600 hover:underline"
                                          >
                                            Access
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                {canLink ? (
                                  <div className="flex items-center justify-end gap-3">
                                    <button onClick={() => setShowLink(it)} className="text-blue-600 hover:underline">
                                      Attach Existing
                                    </button>
                                    {canCreate && (
                                      <button onClick={() => setShowCreateDoc(it)} className="text-gray-800 hover:underline">
                                        Create New
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                </>
              </div>
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
        <ModalShell title="Edit Project" onClose={() => setShowEditProject(false)}>
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
  const [name, setName] = useState(project?.name || '')
  const [description, setDescription] = useState(project?.description || '')
  const [managerId, setManagerId] = useState(project?.manager?.id ? String(project.manager.id) : '')

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
      await onSave({ name, description: description || null, managerId: Number(managerId) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Project Manager</label>
        <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" required>
          <option value="">Select</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" rows={3} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button disabled={loading} type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Saving...' : 'Save'}
        </button>
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
      <div className="bg-white rounded-lg shadow p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md sm:w-64"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{`${p.code} • ${p.name}`}</option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search documents across all projects or by selected project..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
        />
        <button onClick={search} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
          Search
        </button>
      </div>

      {loading ? (
        <div className="p-6 bg-white rounded-lg shadow">Searching...</div>
      ) : results.length === 0 ? (
        <EmptyState title="No results" message="Try another keyword or search criteria." />
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Iteration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">
                      <Link to={`/documents/${r.document.id}`} className="text-blue-600 hover:underline">
                        {r.document.fileCode}
                      </Link>
                      <div className="text-gray-500">{r.document.title}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {r.iteration?.project?.code} • {r.iteration?.project?.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{`#${r.iteration?.iterationNo || '-'}`}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{r.stage?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Setup() {
  const [projectCategories, setProjectCategories] = useState([])
  const [documentTypes, setDocumentTypes] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
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
    const [cats, docTypes] = await Promise.all([
      api.get('/system/config/project-categories'),
      api.get('/system/config/document-types')
    ])
    setProjectCategories(cats?.data?.data?.projectCategories || [])
    setDocumentTypes(docTypes?.data?.data?.documentTypes || [])
  }

  const loadCategory = async (categoryId) => {
    if (!categoryId) return
    setLoading(true)
    try {
      const [st, req] = await Promise.all([
        api.get(`/project-tracking/categories/${categoryId}/stages`),
        api.get(`/project-tracking/categories/${categoryId}/requirements`)
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
    if (selectedCategoryId) loadCategory(selectedCategoryId)
  }, [selectedCategoryId])

  const saveStages = async () => {
    if (!selectedCategoryId) return
    setSavingStages(true)
    try {
      const payload = {
        stages: stages.map((s) => ({
          stageId: s.stageId,
          displayName: s.displayName || null,
          sortOrder: s.sortOrder,
          isEnabled: s.isEnabled
        }))
      }
      const res = await api.put(`/project-tracking/categories/${selectedCategoryId}/stages`, payload)
      setStages(res?.data?.data?.stages || [])
    } finally {
      setSavingStages(false)
    }
  }

  const createStage = async (payload) => {
    if (!selectedCategoryId) return
    await api.post(`/project-tracking/categories/${selectedCategoryId}/stages`, payload)
    await loadCategory(selectedCategoryId)
    setShowAddStage(false)
  }

  const addRequirement = async (e) => {
    e.preventDefault()
    if (!selectedCategoryId) return
    setAddingReq(true)
    try {
      await api.post(`/project-tracking/categories/${selectedCategoryId}/requirements`, {
        stageId: Number(newReq.stageId),
        documentTypeId: Number(newReq.documentTypeId),
        isRequired: Boolean(newReq.isRequired),
        isConfidentialDefault: Boolean(newReq.isConfidentialDefault)
      })
      setNewReq({ stageId: '', documentTypeId: '', isRequired: true, isConfidentialDefault: false })
      await loadCategory(selectedCategoryId)
    } finally {
      setAddingReq(false)
    }
  }

  const deleteRequirement = async (id) => {
    if (!selectedCategoryId) return
    await api.delete(`/project-tracking/requirements/${id}`)
    await loadCategory(selectedCategoryId)
  }

  const loadRequirementAccess = async (requirementId) => {
    const res = await api.get(`/project-tracking/requirements/${requirementId}/confidential-access`)
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
      await api.put(`/project-tracking/requirements/${accessRequirement.id}/confidential-access`, {
        entries: accessEntries.map((e) => ({
          subjectType: e.subjectType,
          subjectId: e.subjectId,
          canView: true
        }))
      })
      setAccessRequirement(null)
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
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-700">Project Category</div>
            <div className="text-xs text-gray-500 mt-1">Choose a category first, then set the stage flow and required documents for that category.</div>
          </div>
          <div className="w-full lg:w-80">
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select category</option>
              {projectCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {!!selectedCategoryId && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium text-gray-500">Total Stages</div>
              <div className="text-lg font-semibold text-gray-900">{sortedStages.length}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium text-gray-500">Active Stages</div>
              <div className="text-lg font-semibold text-gray-900">{activeStageCount}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium text-gray-500">Required Documents</div>
              <div className="text-lg font-semibold text-gray-900">{requirements.length}</div>
            </div>
          </div>
        )}
      </div>

      {!selectedCategoryId ? (
        <EmptyState title="Select a project category" message="Choose a category first. Then set the stage flow and required documents for that category." />
      ) : loading ? (
        <div className="p-6 bg-white rounded-lg shadow">Loading...</div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Stage Flow</div>
                <div className="text-xs text-gray-500 mt-1">Rename stage labels, turn stages on or off, and reorder the flow using the move buttons.</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddStage(true)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Add Stage
                </button>
                <button
                  onClick={saveStages}
                  disabled={savingStages}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingStages ? 'Saving...' : 'Save Stage Flow'}
                </button>
              </div>
            </div>

            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {sortedStages.map((s, idx) => {
                const displayLabel = s.displayName || s.stage?.name || '-'
                return (
                  <div
                    key={s.stageId}
                    className={`min-w-[250px] rounded-xl border p-4 ${
                      s.isEnabled ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{`Stage ${idx + 1}`}</div>
                        <div className="text-sm font-semibold text-gray-900 mt-1">{s.stage?.name || '-'}</div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.isEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                        {s.isEnabled ? 'Active' : 'Hidden'}
                      </span>
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Display Label</label>
                      <input
                        value={s.displayName || ''}
                        onChange={(e) => updateStage(s.stageId, { displayName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                        placeholder={s.stage?.name || 'Enter label'}
                      />
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={!!s.isEnabled}
                          onChange={(e) => updateStage(s.stageId, { isEnabled: e.target.checked })}
                        />
                        Active in flow
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveStage(s.stageId, 'up')}
                          disabled={idx === 0}
                          className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStage(s.stageId, 'down')}
                          disabled={idx === sortedStages.length - 1}
                          className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Down
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b bg-gray-50">
              <div className="text-sm font-semibold text-gray-900">Required Documents By Stage</div>
              <div className="text-xs text-gray-500 mt-1">Add document types that must appear in the checklist when a new project phase is created.</div>
            </div>

            <div className="p-5 border-b bg-white">
              <form onSubmit={addRequirement} className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.2fr_auto_auto] gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Stage</label>
                  <select
                    value={newReq.stageId}
                    onChange={(e) => setNewReq((p) => ({ ...p, stageId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="">Select stage</option>
                    {stageOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Document Type</label>
                  <select
                    value={newReq.documentTypeId}
                    onChange={(e) => setNewReq((p) => ({ ...p, documentTypeId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="">Select document type</option>
                    {documentTypes.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 h-10 px-1">
                  <input
                    type="checkbox"
                    checked={!!newReq.isConfidentialDefault}
                    onChange={(e) => setNewReq((p) => ({ ...p, isConfidentialDefault: e.target.checked }))}
                  />
                  Confidential
                </label>
                <button
                  disabled={addingReq}
                  type="submit"
                  className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {addingReq ? 'Adding...' : 'Add Requirement'}
                </button>
              </form>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {sortedStages.map((s) => {
                  const stageRequirements = requirementsByStage.get(s.stageId) || []
                  const stageLabel = s.displayName || s.stage?.name || '-'
                  return (
                    <div key={s.stageId} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                      <div className={`px-4 py-3 border-b ${s.isEnabled ? 'bg-white' : 'bg-gray-50'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{stageLabel}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {s.isEnabled ? 'Active stage in project flow' : 'Hidden stage in project flow'}
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {`${stageRequirements.length} required`}
                          </span>
                        </div>
                      </div>

                      <div className="p-4">
                        {stageRequirements.length === 0 ? (
                          <div className="text-sm text-gray-500">No required document type added for this stage yet.</div>
                        ) : (
                          <div className="space-y-2">
                            {stageRequirements.map((r) => (
                              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900">{r.documentType?.name || '-'}</div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {r.isConfidentialDefault ? 'Confidential by default' : 'Standard visibility'}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  {r.isConfidentialDefault && (
                                    <button
                                      type="button"
                                      onClick={() => openRequirementAccess(r)}
                                      className="text-sm text-blue-600 hover:underline"
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
          </div>
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
      base.push({ id: 'setup', label: 'Category Setup' })
    }
    return base
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Project Tracking</h1>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b px-4">
          <nav className="flex gap-6" aria-label="Tabs">
            {tabs.map((t) => {
              const isActive = activeTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`py-3 text-sm font-medium border-b-2 ${
                    isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </nav>
        </div>
        <div className="p-4">
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
      </div>
    </div>
  )
}
