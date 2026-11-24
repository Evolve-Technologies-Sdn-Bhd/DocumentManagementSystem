import React, { useEffect, useMemo, useState } from 'react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from './ui/Modal'
import api from '../api/axios'

function DocumentStatusBadge({ status }) {
  const s = String(status || '').toUpperCase()
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium'
  if (s === 'PUBLISHED') return <span className={`${base} bg-green-100 text-green-800`}>Published</span>
  if (s === 'PENDING_REVIEW' || s === 'IN_REVIEW') return <span className={`${base} bg-amber-100 text-amber-800`}>In Review</span>
  if (s === 'SUPERSEDED' || s === 'OBSOLETE') return <span className={`${base} bg-gray-100 text-gray-700`}>{s === 'SUPERSEDED' ? 'Superseded' : 'Obsolete'}</span>
  return <span className={`${base} bg-blue-100 text-blue-800`}>Draft</span>
}

export default function DocumentAccessModal({ document, onClose, onSaved, onError }) {
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
  }, [document?.id, onClose, onError])

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

  const renderedResults = useMemo(() => {
    return [
      ...(subjectResults.users || []).map((u) => ({
        key: `USER-${u.id}`,
        label: `${`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email} (User)`,
        entry: { subjectType: 'USER', subjectId: u.id, label: `${`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email} (User)` }
      })),
      ...(subjectResults.roles || []).map((r) => ({
        key: `ROLE-${r.id}`,
        label: `${r.displayName || r.name} (Role)`,
        entry: { subjectType: 'ROLE', subjectId: r.id, label: `${r.displayName || r.name} (Role)` }
      }))
    ]
  }, [subjectResults])

  return (
    <Modal isOpen size="lg" onClose={onClose}>
      <ModalHeader
        title="Manage Confidential Access"
        subtitle="Control which users and roles can view this confidential document."
        onClose={onClose}
      />
      <ModalBody className="space-y-4">
      {loading ? (
        <div className="text-sm text-ink-secondary">Loading access settings...</div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="text-sm font-semibold text-gray-900">{document.fileCode || 'Draft document'}</div>
            <div className="text-sm text-gray-600 mt-1">{document.title || 'Untitled document'}</div>
            <div className="mt-2 flex items-center gap-2">
              <DocumentStatusBadge status={document.status} />
              <span className="text-xs text-gray-500">{`Workflow stage: ${document.stage || '-'}`}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={isConfidential} onChange={(e) => setIsConfidential(e.target.checked)} />
            Mark this document as confidential
          </label>

          {!isConfidential ? (
            <div className="text-xs text-gray-500">When confidentiality is turned off, access will follow normal document visibility rules.</div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Add allowed users or roles</label>
                <div className="flex gap-2">
                  <input
                    value={accessQuery}
                    onChange={(e) => setAccessQuery(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Search users or roles"
                  />
                  <button type="button" onClick={searchSubjects} className="px-4 py-2 text-sm font-medium text-white bg-[#003366] rounded-lg hover:bg-[#002244] transition-colors">
                    Search
                  </button>
                </div>
                {loadingSubjects && <div className="text-xs text-gray-500">Searching subjects...</div>}
                {renderedResults.length > 0 && (
                  <div className="max-h-44 overflow-auto border border-gray-200 rounded-lg divide-y">
                    {renderedResults.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => addAccessEntry(item.entry)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Allowed viewers</div>
                {accessEntries.length === 0 ? (
                  <div className="text-sm text-gray-500">No viewers added yet. Only the creator and owner will be able to access until you add users or roles.</div>
                ) : (
                  <div className="space-y-2">
                    {accessEntries.map((entry) => (
                      <div key={`${entry.subjectType}-${entry.subjectId}`} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                        <span>{entry.label}</span>
                        <button type="button" onClick={() => removeAccessEntry(entry)} className="text-red-600 hover:underline">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}


        </div>
      )}
      </ModalBody>

      {!loading && (
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg h-10 px-4 border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] text-ink-secondary font-medium hover:bg-[var(--dms-color-bg-surface-muted)] transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            type="button"
            onClick={save}
            className="rounded-lg h-10 px-4 bg-[var(--dms-color-brand-primary)] text-white font-semibold hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Access'}
          </button>
        </ModalFooter>
      )}
    </Modal>
  )
}
