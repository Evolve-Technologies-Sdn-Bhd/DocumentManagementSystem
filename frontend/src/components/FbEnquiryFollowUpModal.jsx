import React, { useEffect, useMemo, useState } from 'react'
import * as ReactDOM from 'react-dom'
import api from '../api/axios'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import SelectField from './ui/SelectField'

export default function FbEnquiryFollowUpModal({ open, entry, onClose, onSaved }) {
  const entryId = useMemo(() => Number(entry?.id || 0), [entry])
  const isReady = useMemo(() => Boolean(open && entryId), [open, entryId])
  const [users, setUsers] = useState([])
  const [assigneeIds, setAssigneeIds] = useState([])
  const [assigneesLoading, setAssigneesLoading] = useState(false)
  const [followUps, setFollowUps] = useState([])
  const [followUpsLoading, setFollowUpsLoading] = useState(false)
  const [followUpDraft, setFollowUpDraft] = useState({ followUpAt: '', assignedToId: '', note: '' })
  const [addingFollowUp, setAddingFollowUp] = useState(false)
  const [error, setError] = useState('')

  const getUserLabel = (user) => {
    if (!user) return ''
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim()
    return name || user.email || ''
  }

  const toggleAssignee = (userId) => {
    const id = Number(userId)
    if (!id) return
    setAssigneeIds((prev) => {
      const exists = prev.includes(id)
      if (exists) return prev.filter((v) => v !== id)
      return [...prev, id]
    })
  }

  useEffect(() => {
    if (!open) return
    let active = true
    const loadUsers = async () => {
      try {
        const res = await api.get('/users')
        const list = res.data?.data?.users || res.data?.users || []
        const activeUsers = Array.isArray(list)
          ? list.filter((u) => u && u.status === 'ACTIVE')
          : []
        activeUsers.sort((a, b) => {
          const aName = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email || ''
          const bName = `${b.firstName || ''} ${b.lastName || ''}`.trim() || b.email || ''
          return aName.localeCompare(bName)
        })
        if (!active) return
        setUsers(activeUsers)
      } catch (e) {
        console.error('Failed to load users:', e)
        if (!active) return
        setUsers([])
      }
    }
    loadUsers()
    return () => { active = false }
  }, [open])

  const refreshAssignees = async () => {
    if (!isReady) return
    setAssigneesLoading(true)
    try {
      const res = await api.get(`/crm/fb-enquiries/${entryId}/assignees`)
      const rows = res.data?.data?.assignees || []
      const ids = rows.map((r) => r?.userId).filter(Boolean)
      setAssigneeIds(ids)
    } catch (e) {
      console.error('Failed to load assignees:', e)
      setAssigneeIds([])
    } finally {
      setAssigneesLoading(false)
    }
  }

  const refreshFollowUps = async () => {
    if (!isReady) return
    setFollowUpsLoading(true)
    try {
      const res = await api.get(`/crm/fb-enquiries/${entryId}/follow-ups`)
      const rows = res.data?.data?.followUps || []
      setFollowUps(Array.isArray(rows) ? rows : [])
    } catch (e) {
      console.error('Failed to load follow-ups:', e)
      setFollowUps([])
    } finally {
      setFollowUpsLoading(false)
    }
  }

  useEffect(() => {
    if (!isReady) return
    setError('')
    setFollowUpDraft({ followUpAt: '', assignedToId: '', note: '' })
    refreshAssignees()
    refreshFollowUps()
  }, [isReady, entryId])

  const saveAssignees = async () => {
    if (!isReady) return
    setAssigneesLoading(true)
    setError('')
    try {
      await api.put(`/crm/fb-enquiries/${entryId}/assignees`, { userIds: assigneeIds })
      onSaved?.()
    } catch (e) {
      console.error('Failed to save assignees:', e)
      setError(e.response?.data?.message || 'Unable to save assignees. Please try again.')
    } finally {
      setAssigneesLoading(false)
    }
  }

  const submitFollowUp = async () => {
    if (!isReady) return
    setAddingFollowUp(true)
    setError('')
    try {
      const payload = {
        followUpAt: followUpDraft.followUpAt || null,
        assignedToId: followUpDraft.assignedToId ? Number(followUpDraft.assignedToId) : null,
        note: String(followUpDraft.note || '').trim()
      }
      if (!payload.note) {
        setError('Follow-up note is required.')
        setAddingFollowUp(false)
        return
      }

      await api.post(`/crm/fb-enquiries/${entryId}/follow-ups`, payload)
      setFollowUpDraft({ followUpAt: '', assignedToId: '', note: '' })
      await refreshFollowUps()
      onSaved?.()
    } catch (e) {
      console.error('Failed to add follow-up:', e)
      setError(e.response?.data?.message || 'Unable to add follow-up. Please try again.')
    } finally {
      setAddingFollowUp(false)
    }
  }

  if (!open) return null

  const modal = (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-[95] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Follow-up Update</h3>
              <p className="text-xs text-gray-600 mt-1">
                {entry?.contact ? `FB Enquiry · ${entry.contact}` : 'FB Enquiry'}
              </p>
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

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Assign Follow-up</div>
                <div className="text-xs text-gray-600">Assign multiple users and notify them automatically.</div>
              </div>
              <Button size="sm" onClick={saveAssignees} loading={assigneesLoading} loadingText="Saving...">
                Save
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    checked={assigneeIds.includes(u.id)}
                    onChange={() => toggleAssignee(u.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{getUserLabel(u)}</div>
                    <div className="truncate text-xs text-gray-600">{u.email}</div>
                  </div>
                </label>
              ))}
              {users.length === 0 && <div className="text-sm text-gray-600">No users available.</div>}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
            <div className="text-sm font-semibold text-gray-900">Follow-up Notes</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-soft">Follow-up Date</label>
                <TextInput
                  type="date"
                  value={followUpDraft.followUpAt}
                  onChange={(e) => setFollowUpDraft((p) => ({ ...p, followUpAt: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-soft">Who Need To</label>
                <SelectField
                  value={followUpDraft.assignedToId}
                  onChange={(e) => setFollowUpDraft((p) => ({ ...p, assignedToId: e.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {getUserLabel(u)}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Note</label>
              <TextArea
                rows={3}
                value={followUpDraft.note}
                onChange={(e) => setFollowUpDraft((p) => ({ ...p, note: e.target.value }))}
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={submitFollowUp} loading={addingFollowUp} loadingText="Adding...">
                Add
              </Button>
            </div>

            <div className="border-t border-gray-200 pt-3">
              <div className="text-xs font-semibold text-gray-700">History</div>
              {followUpsLoading ? (
                <div className="mt-2 text-sm text-gray-600">Loading...</div>
              ) : followUps.length === 0 ? (
                <div className="mt-2 text-sm text-gray-600">No follow-up history yet.</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {followUps.map((f) => (
                    <div key={f.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-gray-700">
                          {f.followUpAt ? new Date(f.followUpAt).toISOString().split('T')[0] : 'No date'}
                          {f.assignedTo ? ` · ${getUserLabel(f.assignedTo)}` : ''}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {f.createdAt ? new Date(f.createdAt).toLocaleString('en-MY') : ''}
                        </div>
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{f.note}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}

