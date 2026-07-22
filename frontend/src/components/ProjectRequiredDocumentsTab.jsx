import React, { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import { usePreferences } from '../contexts/PreferencesContext'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import EmptyPanelState from './ui/EmptyPanelState'
import InlineSpinner from './ui/InlineSpinner'
import TextInput from './ui/TextInput'
import { Table, TableContainer, Td, Th, Tr } from './ui/Table'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'

function RequirementStatusBadge({ responded }) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
  if (responded) {
    return <span className={`${base} bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]`}>Responded</span>
  }
  return <span className={`${base} bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]`}>No Upload</span>
}

function formatUserLabel(user) {
  if (!user) return '-'
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim()
  return name || user.email || '-'
}

export default function ProjectRequiredDocumentsTab({ projectId }) {
  const { formatDate } = usePreferences()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [canAssign, setCanAssign] = useState(false)
  const [rows, setRows] = useState([])
  const [assignModal, setAssignModal] = useState(null)
  const [accessQuery, setAccessQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [userResults, setUserResults] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!projectId) return
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/project-tracking/projects/${projectId}/required-documents`)
      setCanAssign(Boolean(res?.data?.data?.canAssign))
      setRows(res?.data?.data?.requiredDocuments || [])
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load required documents')
      setRows([])
      setCanAssign(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [projectId])

  const openAssign = (row) => {
    setAssignModal({ documentTypeId: row?.documentType?.id, title: row?.documentType?.name || 'Document Type' })
    setAccessQuery('')
    setUserResults([])
    setSelectedUser(row?.assignment?.picUser || null)
  }

  const closeAssign = () => {
    if (saving) return
    setAssignModal(null)
    setAccessQuery('')
    setUserResults([])
    setSelectedUser(null)
  }

  const searchUsers = async () => {
    const q = String(accessQuery || '').trim()
    if (!q) return
    setSearching(true)
    try {
      const res = await api.get('/folders/access/subjects', { params: { q } })
      setUserResults(res?.data?.data?.users || [])
    } finally {
      setSearching(false)
    }
  }

  const saveAssignment = async (mode) => {
    if (!assignModal?.documentTypeId) return
    if (mode === 'assign' && !selectedUser?.id) return
    setSaving(true)
    try {
      await api.post(`/project-tracking/projects/${projectId}/required-documents/pic`, {
        documentTypeId: assignModal.documentTypeId,
        picUserId: mode === 'unassign' ? null : selectedUser.id
      })
      await load()
      closeAssign()
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save PIC assignment')
    } finally {
      setSaving(false)
    }
  }

  const visibleRows = useMemo(() => rows || [], [rows])

  if (!projectId) {
    return <EmptyPanelState title="No project selected" message="Open a project to manage required documents." />
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <InlineSpinner />
        <span>Loading required documents...</span>
      </div>
    )
  }

  if (error) {
    return <EmptyPanelState title="Unable to load" message={error} />
  }

  if (!visibleRows.length) {
    return <EmptyPanelState title="No requirements" message="No required document types found for this project." />
  }

  return (
    <div className="space-y-4">
      <AppSurface>
        <div className="text-sm text-ink-muted">
          Manage project-specific PIC assignments per required document type. Anyone can upload/link, but assigned PIC is accountable for follow-up.
        </div>
      </AppSurface>

      <TableContainer>
        <Table>
          <thead>
            <Tr>
              <Th>Document Type</Th>
              <Th>Assigned PIC</Th>
              <Th>Assigned Date</Th>
              <Th>Status</Th>
              {canAssign ? <Th className="text-right">Action</Th> : null}
            </Tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const docType = row.documentType
              const assignment = row.assignment
              const responded = Boolean(row?.status?.responded)
              return (
                <Tr key={docType?.id || Math.random()}>
                  <Td>
                    <div className="font-medium text-ink">{docType?.name || '-'}</div>
                    <div className="text-xs text-ink-muted">{docType?.prefix ? `Prefix: ${docType.prefix}` : ''}</div>
                  </Td>
                  <Td>{formatUserLabel(assignment?.picUser)}</Td>
                  <Td>{assignment?.assignedAt ? formatDate(assignment.assignedAt) : '-'}</Td>
                  <Td>
                    <RequirementStatusBadge responded={responded} />
                  </Td>
                  {canAssign ? (
                    <Td className="text-right">
                      <Button size="sm" variant="secondary" onClick={() => openAssign(row)}>
                        {assignment?.picUser ? 'Reassign' : 'Assign'}
                      </Button>
                    </Td>
                  ) : null}
                </Tr>
              )
            })}
          </tbody>
        </Table>
      </TableContainer>

      {assignModal ? (
        <Modal onClose={closeAssign} size="md">
          <ModalHeader title="Assign PIC" subtitle={assignModal.title} onClose={closeAssign} />
          <ModalBody className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-ink">Search user</div>
              <div className="flex gap-2">
                <TextInput value={accessQuery} onChange={(e) => setAccessQuery(e.target.value)} placeholder="Type name or email" />
                <Button type="button" variant="secondary" onClick={searchUsers} disabled={searching}>
                  {searching ? 'Searching...' : 'Search'}
                </Button>
              </div>
              {userResults.length > 0 ? (
                <div className="max-h-56 overflow-auto rounded-dms border border-border bg-surface">
                  {userResults.map((u) => {
                    const label = formatUserLabel(u)
                    const isSelected = String(selectedUser?.id || '') === String(u.id)
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setSelectedUser(u)}
                        className={[
                          'w-full px-3 py-2 text-left text-sm transition-colors',
                          isSelected ? 'bg-brand/10 text-brand' : 'hover:bg-surface-muted'
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>

            <div className="rounded-dms border border-border bg-surface-muted p-3">
              <div className="text-xs text-ink-muted">Selected PIC</div>
              <div className="mt-1 text-sm font-medium text-ink">{formatUserLabel(selectedUser)}</div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={closeAssign} disabled={saving}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => saveAssignment('unassign')} disabled={saving}>
              Unassign
            </Button>
            <Button onClick={() => saveAssignment('assign')} disabled={saving || !selectedUser?.id}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </div>
  )
}

