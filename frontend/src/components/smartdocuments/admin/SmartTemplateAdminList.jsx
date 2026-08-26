import React, { useState, useEffect, useMemo } from 'react'
import api from '../../../api/axios'
import Button from '../../ui/Button'
import TextInput from '../../ui/TextInput'
import SelectField from '../../ui/SelectField'
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../ui/Modal'
import PageHeader from '../../ui/PageHeader'
import SectionHeader from '../../ui/SectionHeader'
import EmptyPanelState from '../../ui/EmptyPanelState'
import InlineSpinner from '../../ui/InlineSpinner'
import PageContainer from '../../ui/PageContainer'
import AppSurface from '../../ui/AppSurface'
import ColumnSettingsButton from '../../ui/ColumnSettingsButton'
import { TableContainer, Table, Th, Td, Tr } from '../../ui/Table'
import ActionMenu from '../../ActionMenu'
import SmartTemplateDesigner from './SmartTemplateDesigner'
import useTableFeatures from '../../../hooks/useTableFeatures'

const Chip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
      active
        ? 'bg-blue-600 text-white border-blue-600'
        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
    ].join(' ')}
  >
    {children}
  </button>
)

const Pill = ({ variant = 'default', children }) => {
  const variants = {
    default: 'bg-gray-50 text-gray-700 border-gray-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200'
  }
  return (
    <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border', variants[variant] || variants.default].join(' ')}>
      {children}
    </span>
  )
}

function formatDate(val) {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleDateString() + ' ' + new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return String(val)
  }
}

export default function SmartTemplateAdminList({ saveNotification }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [documentTypes, setDocumentTypes] = useState([])
  const [styleProfiles, setStyleProfiles] = useState([])

  const [search, setSearch] = useState('')
  const [docTypeFilter, setDocTypeFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleteSaving, setDeleteSaving] = useState(false)

  const [designerOpen, setDesignerOpen] = useState(false)
  const [designerTemplateId, setDesignerTemplateId] = useState(null)
  const [designerInitialStep, setDesignerInitialStep] = useState(0)
  const [designerCreateMode, setDesignerCreateMode] = useState(false)

  function openDesigner(templateId, initialStep = 0, isCreateMode = false) {
    setDesignerTemplateId(templateId)
    setDesignerInitialStep(initialStep)
    setDesignerCreateMode(!!isCreateMode)
    setDesignerOpen(true)
  }

  function closeDesigner() {
    setDesignerOpen(false)
    setDesignerTemplateId(null)
    setDesignerInitialStep(0)
    setDesignerCreateMode(false)
    loadData()
  }

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [tRes, dtRes, spRes] = await Promise.all([
        api.get('/smart-templates'),
        api.get('/system/config/document-types'),
        api.get('/smart-document-style').catch(() => ({ data: { data: [] } }))
      ])
      const rawTemplates = (() => {
        if (Array.isArray(tRes?.data?.data?.templates)) return tRes.data.data.templates
        if (Array.isArray(tRes?.data?.templates)) return tRes.data.templates
        if (Array.isArray(tRes?.data?.data)) return tRes.data.data
        if (Array.isArray(tRes?.data)) return tRes.data
        return []
      })()
      setTemplates(rawTemplates)

      const rawDocTypes = (() => {
        const nested = dtRes?.data?.data?.documentTypes
        if (Array.isArray(nested)) return nested
        const flat = dtRes?.data?.documentTypes
        if (Array.isArray(flat)) return flat
        if (Array.isArray(dtRes?.data?.data)) return dtRes.data.data
        if (Array.isArray(dtRes?.data)) return dtRes.data
        return []
      })()
      setDocumentTypes(rawDocTypes)

      const rawProfiles = (() => {
        if (Array.isArray(spRes?.data?.data?.styleProfiles)) return spRes.data.data.styleProfiles
        if (Array.isArray(spRes?.data?.styleProfiles)) return spRes.data.styleProfiles
        if (Array.isArray(spRes?.data?.data)) return spRes.data.data
        if (Array.isArray(spRes?.data)) return spRes.data
        return []
      })()
      setStyleProfiles(rawProfiles)
    } catch (err) {
      console.error('loadData error', err)
    } finally {
      setLoading(false)
    }
  }

  const docTypeMap = useMemo(() => {
    const m = {}
    const list = Array.isArray(documentTypes) ? documentTypes : []
    list.forEach((d) => (m[d.id] = d.typeName || d.name || '—'))
    return m
  }, [documentTypes])

  const styleProfileMap = useMemo(() => {
    const m = {}
    const list = Array.isArray(styleProfiles) ? styleProfiles : []
    list.forEach((s) => (m[s.id] = s.profileName || '—'))
    return m
  }, [styleProfiles])

  const filtered = useMemo(() => {
    let list = [...templates]
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (t) =>
          String(t.templateName || '').toLowerCase().includes(q) ||
          String(t.templateCode || '').toLowerCase().includes(q)
      )
    }
    if (docTypeFilter) list = list.filter((t) => String(t.documentTypeId) === String(docTypeFilter))
    if (activeFilter !== 'all') {
      const want = activeFilter === 'active'
      list = list.filter((t) => Boolean(t.isActive) === want)
    }
    return list
  }, [templates, search, docTypeFilter, activeFilter])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteError('')
    setDeleteSaving(true)
    try {
      await api.delete(`/smart-templates/${deleteTarget.id}`)
      setDeleteTarget(null)
      await loadData()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete'
      setDeleteError(msg)
    } finally {
      setDeleteSaving(false)
    }
  }

  const templateColumns = [
    {
      id: 'templateName',
      key: 'templateName',
      accessor: 'templateName',
      label: 'Template Name',
      sortable: true,
      required: true,
      render: (value) => <span className="font-medium text-gray-900">{value}</span>
    },
    {
      id: 'templateCode',
      key: 'templateCode',
      accessor: 'templateCode',
      label: 'Code',
      sortable: true,
      render: (value) => <span className="font-mono text-xs text-gray-500">{value}</span>
    },
    {
      id: 'documentType',
      key: 'documentType',
      accessor: (row) => docTypeMap[row.documentTypeId] || '—',
      label: 'Document Type',
      sortable: true
    },
    {
      id: 'styleProfile',
      key: 'styleProfile',
      accessor: (row) => styleProfileMap[row.styleProfileId] || '—',
      label: 'Style Profile',
      sortable: true
    },
    {
      id: 'isDefault',
      key: 'isDefault',
      accessor: 'isDefault',
      label: 'Default',
      sortable: true,
      align: 'center',
      render: (value) => value ? <Pill variant="success">Default</Pill> : <span className="text-gray-400">—</span>
    },
    {
      id: 'isActive',
      key: 'isActive',
      accessor: 'isActive',
      label: 'Active',
      sortable: true,
      align: 'center',
      render: (value) => value ? <Pill variant="success">Active</Pill> : <Pill variant="danger">Inactive</Pill>
    },
    {
      id: 'versions',
      key: 'versions',
      accessor: (row) => row._count?.versions ?? (Array.isArray(row.versions) ? row.versions.length : 0),
      label: 'Versions',
      sortable: true,
      align: 'center',
      render: (value) => <span className="font-semibold text-gray-900">{value}</span>
    },
    {
      id: 'createdAt',
      key: 'createdAt',
      accessor: 'createdAt',
      label: 'Created At',
      sortable: true,
      sortType: 'date',
      sortComparer: (a, b) => new Date(a || 0) - new Date(b || 0),
      render: (value) => <span className="text-xs text-gray-500">{formatDate(value)}</span>
    },
    {
      id: 'actions',
      key: 'actions',
      accessor: '__actions',
      label: 'Actions',
      required: true,
      align: 'right',
      stickyRight: true,
      render: (_v, row) => (
        <ActionMenu
          actions={[
            { label: 'Design', onClick: () => openDesigner(row.id, 0) },
            { label: 'Delete', onClick: () => { setDeleteTarget(row); setDeleteError('') }, variant: 'destructive' }
          ]}
        />
      )
    }
  ]

  const tableFeatures = useTableFeatures({
    tableId: 'smart-template-admin-list',
    columns: templateColumns,
    data: filtered,
    defaultSortKey: 'templateName',
    defaultSortDirection: 'asc'
  })

  const {
    sortedData,
    visibleColumns,
    orderedColumns,
    getSortDirectionFor,
    toggleSort,
    moveColumn,
    hiddenColumns,
    toggleColumnVisibility,
    resetTableSettings
  } = tableFeatures

  const handleColDragStart = (idx, e) => {
    const col = visibleColumns[idx]
    if (!col || col.stickyRight) { e.preventDefault(); return }
    setDragColIndex(idx)
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)) } catch {}
  }
  const handleColDragOver = (idx, e) => {
    e.preventDefault()
    const col = visibleColumns[idx]
    if (!col || col.stickyRight) return
    setDragOverColIndex(idx)
  }
  const handleColDragLeave = () => setDragOverColIndex(null)
  const handleColDrop = (toIdx, e) => {
    e.preventDefault()
    const fromIdx = dragColIndex
    setDragColIndex(null)
    setDragOverColIndex(null)
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return
    const fromId = visibleColumns[fromIdx]?.id
    const toId = visibleColumns[toIdx]?.id
    if (!fromId || !toId) return
    const globalFrom = orderedColumns.findIndex((c) => c.id === fromId)
    const globalTo = orderedColumns.findIndex((c) => c.id === toId)
    if (globalFrom >= 0 && globalTo >= 0) moveColumn(globalFrom, globalTo)
  }
  const handleColDragEnd = () => { setDragColIndex(null); setDragOverColIndex(null) }

  return (
    <PageContainer className="space-y-5">
      <PageHeader
        title="Smart Template Designer"
        subtitle="Manage smart document templates, versions, sections, form fields, and placeholder mappings."
        actions={
          <Button onClick={() => openDesigner(null, 0, true)} data-tour-id="tmpl-btn-add-template">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Smart Template
          </Button>
        }
      />

      <AppSurface className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center md:gap-4">
            <div className="w-full sm:w-72">
              <label className="block text-xs font-medium text-gray-900 mb-2">Search</label>
              <TextInput
                placeholder="Search by name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-64">
              <label className="block text-xs font-medium text-gray-900 mb-2">Document Type</label>
              <SelectField value={docTypeFilter} onChange={(e) => setDocTypeFilter(e.target.value)}>
                <option value="">All Document Types</option>
                {(Array.isArray(documentTypes) ? documentTypes : []).map((dt) => (
                  <option key={dt.id} value={dt.id}>{dt.typeName || dt.name}</option>
                ))}
              </SelectField>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Chip active={activeFilter === 'all'} onClick={() => setActiveFilter('all')}>All</Chip>
            <Chip active={activeFilter === 'active'} onClick={() => setActiveFilter('active')}>Active</Chip>
            <Chip active={activeFilter === 'inactive'} onClick={() => setActiveFilter('inactive')}>Inactive</Chip>
            <ColumnSettingsButton
              orderedColumns={orderedColumns}
              hiddenColumns={hiddenColumns}
              onToggleColumn={toggleColumnVisibility}
              onReset={resetTableSettings}
            />
          </div>
        </div>

        <SectionHeader title={`Templates (${sortedData.length})`} />

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <InlineSpinner className="h-6 w-6 border-gray-200 border-t-blue-600" />
            <span className="ml-3 text-sm text-gray-500">Loading templates...</span>
          </div>
        ) : sortedData.length === 0 ? (
          <EmptyPanelState
            title="No smart templates"
            description="Create your first smart template to begin designing document forms and mapping placeholders."
          />
        ) : (
          <TableContainer>
            <Table>
              <thead>
                <Tr>
                  {visibleColumns.map((col, idx) => {
                    const id = col.id || col.key
                    const canDrag = !col.stickyRight
                    const isDragOver = canDrag && dragOverColIndex === idx
                    return (
                      <Th
                        key={id}
                        align={col.align || 'left'}
                        stickyRight={col.stickyRight || false}
                        sortable={Boolean(col.sortable)}
                        sortDirection={getSortDirectionFor(id)}
                        sortKey={id}
                        onSort={col.sortable ? toggleSort : undefined}
                        draggable={canDrag}
                        dragOver={isDragOver}
                        onDragStart={(e) => handleColDragStart(idx, e)}
                        onDragOver={(e) => handleColDragOver(idx, e)}
                        onDragLeave={handleColDragLeave}
                        onDrop={(e) => handleColDrop(idx, e)}
                        onDragEnd={handleColDragEnd}
                        title={canDrag ? 'Click to sort • Drag to reorder' : col.sortable ? 'Click to sort' : undefined}
                      >
                        {col.label || col.header || id}
                      </Th>
                    )
                  })}
                </Tr>
              </thead>
              <tbody>
                {sortedData.map((t) => (
                  <Tr key={t.id}>
                    {visibleColumns.map((col) => {
                      const id = col.id || col.key || col.accessor
                      const accessor = col.accessor || id
                      let value
                      if (typeof accessor === 'function') {
                        value = accessor(t, col)
                      } else if (accessor === '__actions') {
                        value = null
                      } else {
                        value = t?.[accessor]
                      }
                      const content = typeof col.render === 'function' ? col.render(value, t) : (value != null ? value : '')
                      return (
                        <Td
                          key={id}
                          align={col.align || 'left'}
                          stickyRight={col.stickyRight || false}
                          className={col.stickyRight ? 'py-3' : ''}
                        >
                          {content}
                        </Td>
                      )
                    })}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}
      </AppSurface>

      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)} size="sm">
          <ModalHeader title="Delete Template" subtitle={`Permanently delete "${deleteTarget.templateName}"?`} onClose={() => setDeleteTarget(null)} />
          <ModalBody className="space-y-3">
            {deleteError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">{deleteError}</div>
            )}
            <p className="text-sm text-gray-700">This action cannot be undone. If the template is currently in use by documents, deletion will be blocked.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleteSaving}>Cancel</Button>
            <Button variant="danger" loading={deleteSaving} onClick={handleDelete}>Delete</Button>
          </ModalFooter>
        </Modal>
      )}

      {designerOpen && (
        <Modal onClose={closeDesigner} size="3xl" className="h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
          <ModalHeader
            title={(() => {
              if (designerCreateMode && !designerTemplateId) return 'Create Smart Template'
              if (designerInitialStep >= 1) return 'Continue Setup Smart Template'
              return 'Design Smart Template'
            })()}
            subtitle={(() => {
              if (designerCreateMode && !designerTemplateId) {
                return 'Fields marked with * are required. Complete General info and click Next to create and proceed.'
              }
              const tpl = templates.find((t) => String(t.id) === String(designerTemplateId)) || null
              if (!tpl) return ''
              return (
                <span>
                  <span className="font-semibold">{tpl.templateName || 'Untitled'}</span>
                  <span className="mx-2 text-gray-400">·</span>
                  <span className="font-mono text-xs">{tpl.templateCode || '—'}</span>
                  <span className="mx-2 text-gray-400">·</span>
                  <span className="text-gray-500 text-xs">ID: {tpl.id}</span>
                </span>
              )
            })()}
            onClose={closeDesigner}
          />
          <SmartTemplateDesigner
            templateId={designerTemplateId}
            initialStep={designerInitialStep}
            onBack={closeDesigner}
            saveNotification={saveNotification}
            embedMode={true}
            createMode={designerCreateMode}
            onTemplateCreated={(newId) => {
              setDesignerTemplateId(newId)
              loadData()
            }}
          />
        </Modal>
      )}
    </PageContainer>
  )
}
