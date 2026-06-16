import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import Pagination from './Pagination'
import EmptyState from './EmptyState'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import UploadFileModal from './UploadFileModal'
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
    <ModalShell title="Add Custom Stage" onClose={onClose}>
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

function StageLinkDocumentModal({ iterationId, phase, stage, onClose, onLinked }) {
  const [documentId, setDocumentId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (!query || query.trim().length < 2) return
    setLoading(true)
    try {
      const res = await api.get('/documents/search', { params: { query } })
      setResults(res?.data?.data?.documents || [])
    } finally {
      setLoading(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post(`/project-tracking/iterations/${iterationId}/stages/${stage.id}/link-document`, {
        documentId: Number(documentId)
      })
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
          phaseLabel={phase ? `Phase ${phase.iterationNo}${phase.name ? ` - ${phase.name}` : ''}` : '-'}
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
              placeholder="Type file code or title..."
            />
            <button type="button" onClick={search} className="px-4 py-2 rounded-md bg-gray-800 text-white hover:bg-gray-900">
              Search
            </button>
          </div>
          {results.length > 0 && (
            <div className="max-h-56 overflow-auto border border-gray-200 rounded-md">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDocumentId(String(r.id))}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0 ${
                    String(r.id) === String(documentId) ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900">{r.fileCode}</div>
                  <div className="text-gray-600">{r.title}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Document ID</label>
          <input
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button disabled={loading} type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Attaching...' : 'Attach'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function StageCreateDocumentModal({ iterationId, phase, stage, documentTypes, onClose, onCreated }) {
  const [documentTypeId, setDocumentTypeId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post(`/project-tracking/iterations/${iterationId}/stages/${stage.id}/create-document`, {
        documentTypeId: Number(documentTypeId),
        title,
        description: description || null
      })
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
          phaseLabel={phase ? `Phase ${phase.iterationNo}${phase.name ? ` - ${phase.name}` : ''}` : '-'}
          stageLabel={stage?.name}
          documentTypeLabel={documentTypes.find((d) => String(d.id) === String(documentTypeId))?.name || null}
        />
        <div className="text-xs text-gray-500">Create a new document under this stage and link it to this project.</div>
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
    <ModalShell title={t ? t('project_tracking_create_project') : 'Create Project'} onClose={onClose}>
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

function LinkDocumentModal({ item, phase, onClose, onLinked }) {
  const [documentId, setDocumentId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (!query || query.trim().length < 2) return
    setLoading(true)
    try {
      const res = await api.get('/documents/search', { params: { query } })
      setResults(res?.data?.data?.documents || [])
    } finally {
      setLoading(false)
    }
  }

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
          phaseLabel={phase ? `Phase ${phase.iterationNo}${phase.name ? ` - ${phase.name}` : ''}` : '-'}
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
              placeholder="Type file code or title..."
            />
            <button type="button" onClick={search} className="px-4 py-2 rounded-md bg-gray-800 text-white hover:bg-gray-900">
              Search
            </button>
          </div>
          {results.length > 0 && (
            <div className="max-h-56 overflow-auto border border-gray-200 rounded-md">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDocumentId(String(r.id))}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0 ${
                    String(r.id) === String(documentId) ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900">{r.fileCode}</div>
                  <div className="text-gray-600">{r.title}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Document ID</label>
          <input
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button disabled={loading} type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
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
          phaseLabel={phase ? `Phase ${phase.iterationNo}${phase.name ? ` - ${phase.name}` : ''}` : '-'}
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
  const canCreate = hasPermission('projectTracking', 'create')
  const canLink = hasPermission('projectTracking', 'linkDocument')
  const canAdvance = hasPermission('projectTracking', 'advanceStage')
  const canEdit = hasPermission('projectTracking', 'edit')
  const canDelete = hasPermission('projectTracking', 'delete')

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedIterationId, setSelectedIterationId] = useState(null)
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [stageDocuments, setStageDocuments] = useState([])
  const [docTypes, setDocTypes] = useState([])
  const [showLink, setShowLink] = useState(null)
  const [showCreateDoc, setShowCreateDoc] = useState(null)
  const [showStageLink, setShowStageLink] = useState(null)
  const [showStageCreate, setShowStageCreate] = useState(null)
  const [showEditProject, setShowEditProject] = useState(false)
  const [uploadDocument, setUploadDocument] = useState(null)
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [advancing, setAdvancing] = useState(false)

  const loadProject = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/project-tracking/projects/${projectId}`)
      const p = res?.data?.data?.project
      setProject(p)
      const firstIter = p?.iterations?.[0]
      setSelectedIterationId(firstIter?.id || null)
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

  const stages = useMemo(() => {
    const map = new Map()
    items.forEach((it) => {
      if (!it.stage) return
      map.set(it.stageId, it.stage)
    })
    return Array.from(map.values()).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  }, [items])

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

  const selectedPhase = useMemo(() => {
    return (project?.iterations || []).find((it) => it.id === selectedIterationId) || null
  }, [project, selectedIterationId])

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

  const createIteration = async () => {
    const res = await api.post(`/project-tracking/projects/${projectId}/iterations`, {})
    const iter = res?.data?.data?.iteration
    await loadProject()
    if (iter?.id) setSelectedIterationId(iter.id)
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
      await loadProject()
      await loadItems(selectedIterationId)
      setAlertModal({ show: true, title: 'Success', message: 'Stage advanced successfully.', type: 'success' })
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Failed to advance stage'
      setAlertModal({ show: true, title: 'Unable to advance', message: msg, type: 'warning' })
    } finally {
      setAdvancing(false)
    }
  }

  if (loading) return <div className="p-6 bg-white rounded-lg shadow">Loading...</div>
  if (!project) return <EmptyState title="Project not found" message="The project may have been deleted." />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-gray-500">
            <button className="text-blue-600 hover:underline" onClick={() => navigate('/project-tracking')}>Projects</button>
            <span className="mx-2">/</span>
            <span className="text-gray-700">{project.code}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <div className="text-sm text-gray-600">
            {project.projectCategory?.name || '-'} • Manager:{' '}
            {`${project.manager?.firstName || ''} ${project.manager?.lastName || ''}`.trim() || project.manager?.email || '-'}
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button
              onClick={() => setShowEditProject(true)}
              className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Edit
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
              className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </button>
          )}
          {canAdvance && (
            <button
              onClick={() =>
                setConfirmModal({
                  show: true,
                  title: 'Move To Next Stage',
                  message: 'Move the current project phase to the next stage? This is only allowed when all required documents in the current stage are completed.',
                  onConfirm: advanceStage
                })
              }
              disabled={advancing || !selectedIterationId}
              className="px-4 py-2 rounded-md bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50"
            >
              {advancing ? 'Moving...' : 'Move To Next Stage'}
            </button>
          )}
          {canCreate && (
            <button onClick={createIteration} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
              Add Next Phase
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        {(() => {
          const total = items.length
          const complete = items.filter((x) => String(x.status).toUpperCase() === 'COMPLETE').length
          const pending = items.filter((x) => String(x.status).toUpperCase() === 'PENDING').length
          const waived = items.filter((x) => String(x.status).toUpperCase() === 'WAIVED').length
          const pct = total > 0 ? Math.round((complete / total) * 100) : 0
          return (
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium text-gray-700">Selected Project Phase</div>
              <div className="text-lg font-semibold text-gray-900">
                {selectedPhase ? `Phase ${selectedPhase.iterationNo}${selectedPhase.name ? ` - ${selectedPhase.name}` : ''}` : '-'}
              </div>
              <div className="text-sm text-gray-600">
                {`Current Stage: ${selectedPhase?.currentStage?.name || 'Not set'}`}
              </div>
              <div className="text-xs text-gray-600">{`Overall ${complete}/${total} complete • Pending ${pending} • Waived ${waived}`}</div>
              <div className="text-xs text-gray-500">Use "Add Next Phase" for enhancement, extension, or the next rollout under the same project.</div>
              <div className="w-full sm:w-72 mt-1">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-2 bg-green-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          )
        })()}

        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Project Phases</div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {phases.map((phase) => {
              const isSelected = phase.id === selectedIterationId
              return (
                <button
                  key={phase.id}
                  type="button"
                  onClick={() => setSelectedIterationId(phase.id)}
                  className={`min-w-[210px] rounded-lg border p-4 text-left transition ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{`Phase ${phase.iterationNo}`}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{phase.name || 'Project Phase'}</div>
                  <div className="mt-2 text-xs text-gray-600">{`Current Stage: ${phase.currentStage?.name || '-'}`}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-medium text-gray-700">Stage Flow</div>
            <div className="text-xs text-gray-500">Kanban-style view for the selected phase. Highlight shows the current stage.</div>
          </div>
          <div className="text-xs text-gray-500">
            {selectedPhase ? `Phase ${selectedPhase.iterationNo}` : ''}
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {stageFlow.map((stage) => {
            const tone =
              stage.state === 'current'
                ? 'border-blue-500 bg-blue-50'
                : stage.state === 'done'
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-200 bg-gray-50'

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
              <div key={stage.id} className={`min-w-[220px] rounded-lg border p-4 ${tone}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">{stage.name}</div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeTone}`}>{badgeLabel}</span>
                </div>
                <div className="mt-3 text-xs text-gray-600">
                  {stage.metrics
                    ? `Required documents completed: ${stage.metrics.complete}/${stage.metrics.total}`
                    : 'No checklist configured for this stage yet.'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {itemsLoading ? (
        <div className="p-6 bg-white rounded-lg shadow">Loading checklist...</div>
      ) : items.length === 0 ? (
        <EmptyState title="No required documents yet" message="No required document template has been set for this project category yet. Go to Category Setup to configure it." />
      ) : (
        <div className="space-y-4">
          {stages.map((st) => (
            <div key={st.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b bg-gray-50">
                {(() => {
                  const stageItems = itemsByStage.get(st.id) || []
                  const total = stageItems.length
                  const complete = stageItems.filter((x) => String(x.status).toUpperCase() === 'COMPLETE').length
                  const pending = stageItems.filter((x) => String(x.status).toUpperCase() === 'PENDING').length
                  const waived = stageItems.filter((x) => String(x.status).toUpperCase() === 'WAIVED').length
                  const pct = total > 0 ? Math.round((complete / total) * 100) : 0
                  return (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900">{st.name}</div>
                      <div className="text-xs text-gray-600">
                        {`Complete ${complete}/${total} • Pending ${pending} • Waived ${waived}`}
                      </div>
                      <div className="w-full sm:w-48">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-2 bg-green-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
              <div className="px-6 py-4 border-b bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Other Documents Under This Stage</div>
                  <div className="text-xs text-gray-500">You can add extra documents here even if they are not listed in the required checklist. One document type can have multiple files.</div>
                </div>
                <div className="flex gap-2">
                  {canLink && (
                    <button
                      onClick={() => setShowStageLink(st)}
                      className="px-3 py-2 rounded-md bg-gray-800 text-white hover:bg-gray-900"
                    >
                      Attach Existing
                    </button>
                  )}
                  {canCreate && (
                    <button
                      onClick={() => setShowStageCreate(st)}
                      className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Create New
                    </button>
                  )}
                </div>
              </div>
              <div className="px-6 py-4 border-b bg-white">
                {(() => {
                  const links = stageDocumentsByStage.get(st.id) || []
                  if (links.length === 0) return <div className="text-sm text-gray-500">No extra documents added for this stage yet.</div>
                  return (
                    <div className="space-y-1">
                      {links.map((l) => (
                        <div key={l.id} className="text-sm">
                          <Link to={`/documents/${l.document.id}`} className="text-blue-600 hover:underline">
                            {l.document.fileCode}
                          </Link>
                          <span className="text-gray-600">{` • ${l.document.title}`}</span>
                          {canCreate && (
                            <button
                              type="button"
                              onClick={() => setUploadDocument(l.document)}
                              className="ml-3 text-xs text-gray-700 hover:underline"
                            >
                              Upload File
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-white">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completed Documents</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(itemsByStage.get(st.id) || []).map((it) => (
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
                                    {l.document.fileCode}
                                  </Link>
                                  <span className="text-gray-500">{` • ${l.document.title}`}</span>
                                  {canCreate && (
                                    <button
                                      type="button"
                                      onClick={() => setUploadDocument(l.document)}
                                      className="ml-3 text-xs text-gray-700 hover:underline"
                                    >
                                      Upload File
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
            </div>
          ))}
        </div>
      )}

      {showLink && (
        <LinkDocumentModal
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
          onCreated={(result) => {
            setShowCreateDoc(null)
            if (result?.document) setUploadDocument(result.document)
            if (selectedIterationId) loadItems(selectedIterationId)
          }}
        />
      )}

      {showStageLink && selectedIterationId && (
        <StageLinkDocumentModal
          iterationId={selectedIterationId}
          phase={selectedPhase}
          stage={showStageLink}
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
          documentTypes={docTypes}
          onClose={() => setShowStageCreate(null)}
          onCreated={(result) => {
            setShowStageCreate(null)
            if (result?.document) setUploadDocument(result.document)
            if (selectedIterationId) loadItems(selectedIterationId)
          }}
        />
      )}

      <UploadFileModal
        isOpen={!!uploadDocument}
        document={uploadDocument}
        onClose={() => setUploadDocument(null)}
        onSuccess={() => {
          if (selectedIterationId) loadItems(selectedIterationId)
          setUploadDocument(null)
        }}
      />

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
                                <button
                                  type="button"
                                  onClick={() => deleteRequirement(r.id)}
                                  className="text-sm text-red-600 hover:underline"
                                >
                                  Remove
                                </button>
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
