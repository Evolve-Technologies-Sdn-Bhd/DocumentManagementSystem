import React, { useMemo, useState, useEffect } from 'react'
import { usePreferences } from '../contexts/PreferencesContext'
import api from '../api/axios'
import ActionMenu from './ActionMenu'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import Pagination from './Pagination'
import { useLocation, useNavigate } from 'react-router-dom'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import AppSurface from './ui/AppSurface'
import ColumnSettingsButton from './ui/ColumnSettingsButton'
import { Table, TableContainer, Td, Th, Tr } from './ui/Table'
import useTableFeatures from '../hooks/useTableFeatures'

const VALID_MASTERDATA_TABS = ['departments', 'divisions', 'project-categories', 'document-types', 'crm-lookups']

// Tab Navigation for Master Data
function MasterDataTabs({ activeTab, onTabChange }) {
  const { t } = usePreferences()
  const tabs = [
    { id: 'departments', label: t('mdm_departments') },
    { id: 'divisions', label: t('mdm_divisions') },
    { id: 'project-categories', label: t('mdm_project_categories') },
    { id: 'document-types', label: t('mdm_doc_types') },
    { id: 'crm-lookups', label: 'CRM Lookups' }
  ]

  return (
    <div className="mb-6 border-b border-border" data-tour-id="mdm-tabbar">
      <nav className="dms-scrollbar flex gap-4 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            data-tour-id={`mdm-tab-${tab.id}`}
            className={`whitespace-nowrap border-b-2 px-2 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? 'border-brand text-ink'
                : 'border-transparent text-ink-soft hover:border-border hover:text-ink-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function flattenFolderTree(nodes, depth = 0, parentPath = '') {
  return (nodes || []).flatMap((node) => {
    const label = parentPath ? `${parentPath} / ${node.name}` : node.name
    return [
      {
        ...node,
        depth,
        pathLabel: label
      },
      ...flattenFolderTree(node.children || [], depth + 1, label)
    ]
  })
}

// Add/Edit Modal for Document Type
function DocumentTypeModal({ isOpen, onClose, onSubmit, initialData }) {
  const { t } = usePreferences()
  const [formData, setFormData] = useState({
    name: '',
    prefix: '',
    description: '',
    requiresExpiryTracking: false,
    allowRenewal: true
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        prefix: initialData.prefix || '',
        description: initialData.description || '',
        requiresExpiryTracking: Boolean(initialData.requiresExpiryTracking),
        allowRenewal: initialData.allowRenewal !== undefined ? Boolean(initialData.allowRenewal) : true
      })
    } else {
      setFormData({
        name: '',
        prefix: '',
        description: '',
        requiresExpiryTracking: false,
        allowRenewal: true
      })
    }
  }, [initialData, isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  if (!isOpen) return null

  return (
    <Modal onClose={onClose} closeOnBackdrop size="sm">
      <ModalHeader title={initialData ? t('mdm_edit_doc_type') : t('mdm_add_doc_type')} onClose={onClose} />
      <form onSubmit={handleSubmit}>
        <ModalBody>
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('mdm_name')} <span className="text-[var(--dms-color-danger-ink)]">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Minutes of Meeting"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('mdm_prefix')} <span className="text-[var(--dms-color-danger-ink)]">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.prefix}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                placeholder="e.g., MoM"
              />
              <p className="mt-1.5 text-xs text-ink-soft">{t('mdm_prefix_help')}</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">{t('description')}</label>
              <TextArea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={t('mdm_optional_desc')}
              />
            </div>

            <AppSurface variant="panel" padding="md" className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-ink">Expiry Tracking</h4>
                <p className="mt-1 text-xs text-ink-soft">
                  Control whether documents of this type are enrolled into the expiry tracking module by default.
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
                <input
                  type="checkbox"
                  checked={formData.requiresExpiryTracking}
                  onChange={(e) => setFormData({ ...formData, requiresExpiryTracking: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                />
                <div>
                  <span className="block text-sm font-medium text-ink">Require Expiry Tracking</span>
                  <span className="mt-1 block text-xs text-ink-soft">
                    Published documents of this type will prompt for expiry information in the publish flow.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
                <input
                  type="checkbox"
                  checked={formData.allowRenewal}
                  onChange={(e) => setFormData({ ...formData, allowRenewal: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                />
                <div>
                  <span className="block text-sm font-medium text-ink">Allow Renewal</span>
                  <span className="mt-1 block text-xs text-ink-soft">
                    Lets tracked documents of this type use the renewal flow to create a new document version.
                  </span>
                </div>
              </label>
            </AppSurface>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit">{initialData ? t('mdm_update') : t('mdm_create')}</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

// Add/Edit Modal for Project Category
function ProjectCategoryModal({ isOpen, onClose, onSubmit, initialData }) {
  const { t } = usePreferences()
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: ''
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        code: initialData.code || '',
        description: initialData.description || ''
      })
    } else {
      setFormData({
        name: '',
        code: '',
        description: ''
      })
    }
  }, [initialData, isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  if (!isOpen) return null

  return (
    <Modal onClose={onClose} closeOnBackdrop size="sm">
      <ModalHeader title={initialData ? t('mdm_edit_project_cat') : t('mdm_add_project_cat')} onClose={onClose} />
      <form onSubmit={handleSubmit}>
        <ModalBody>
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('mdm_name')} <span className="text-[var(--dms-color-danger-ink)]">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Internal Project"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('mdm_code')} <span className="text-[var(--dms-color-danger-ink)]">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g., INT"
              />
              <p className="mt-1.5 text-xs text-ink-soft">{t('mdm_code_project_help')}</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">{t('description')}</label>
              <TextArea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={t('mdm_optional_desc')}
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit">{initialData ? t('mdm_update') : t('mdm_create')}</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

// Add/Edit Modal for Department
function DepartmentModal({ isOpen, onClose, onSubmit, initialData }) {
  const { t } = usePreferences()
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: ''
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        code: initialData.code || '',
        description: initialData.description || ''
      })
    } else {
      setFormData({
        name: '',
        code: '',
        description: ''
      })
    }
  }, [initialData, isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  if (!isOpen) return null

  return (
    <Modal onClose={onClose} closeOnBackdrop size="sm">
      <ModalHeader title={initialData ? t('mdm_edit_dept') : t('mdm_add_dept')} onClose={onClose} />
      <form onSubmit={handleSubmit}>
        <ModalBody>
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('mdm_name')} <span className="text-[var(--dms-color-danger-ink)]">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Information Technology"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('mdm_code')} <span className="text-[var(--dms-color-danger-ink)]">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g., IT"
              />
              <p className="mt-1.5 text-xs text-ink-soft">{t('mdm_code_help')}</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">{t('description')}</label>
              <TextArea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={t('mdm_optional_desc')}
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit">{initialData ? t('mdm_update') : t('mdm_create')}</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

// Add/Edit Modal for Division
function DivisionModal({ isOpen, onClose, onSubmit, initialData }) {
  const { t } = usePreferences()
  const [formData, setFormData] = useState({
    name: '',
    code: ''
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        code: initialData.code || ''
      })
    } else {
      setFormData({
        name: '',
        code: ''
      })
    }
  }, [initialData, isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  if (!isOpen) return null

  return (
    <Modal onClose={onClose} closeOnBackdrop size="sm">
      <ModalHeader title={initialData ? t('mdm_edit_division') : t('mdm_add_division')} onClose={onClose} />
      <form onSubmit={handleSubmit}>
        <ModalBody>
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('mdm_name')} <span className="text-[var(--dms-color-danger-ink)]">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Private Division"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink">
                {t('mdm_code')} <span className="text-[var(--dms-color-danger-ink)]">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g., PRV"
              />
              <p className="mt-1.5 text-xs text-ink-soft">{t('mdm_code_help')}</p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit">{initialData ? t('mdm_update') : t('mdm_create')}</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

// Assignment Modal for Division (Users/Folders)
function DivisionAssignmentModal({
  isOpen,
  onClose,
  onSave,
  loading,
  saving,
  title,
  description,
  items,
  selectedIds,
  itemType
}) {
  const { t } = usePreferences()
  const [localSelected, setLocalSelected] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (isOpen) {
      setLocalSelected(selectedIds || [])
      setSearchQuery('')
    }
  }, [isOpen, selectedIds])

  if (!isOpen) return null

  const filteredItems = (items || []).filter(
    (item) =>
      String(item.label || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(item.secondary || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const toggleItem = (id) => {
    setLocalSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    if (localSelected.length === filteredItems.length) {
      setLocalSelected([])
    } else {
      setLocalSelected(filteredItems.map((i) => i.id))
    }
  }

  return (
    <Modal onClose={onClose} closeOnBackdrop size="lg">
      <ModalHeader title={title} onClose={onClose} />
      <div className="space-y-4">
        {description && (
          <div className="px-6 pt-4">
            <p className="text-sm text-ink-soft">{description}</p>
          </div>
        )}
        <ModalBody>
          <div className="space-y-4">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <TextInput
                type="text"
                placeholder={t('search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filteredItems.length > 0 && localSelected.length === filteredItems.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                />
                <span className="text-ink-secondary font-medium">{t('select_all')}</span>
              </label>
              <span className="text-ink-soft">
                {localSelected.length} / {filteredItems.length} {t('selected')}
              </span>
            </div>

            <div className="max-h-[360px] overflow-y-auto rounded-xl border border-border bg-surface">
              {loading ? (
                <div className="py-12 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-brand"></div>
                  <p className="mt-3 text-sm text-ink-soft">{t('loading')}</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-12 text-center text-sm text-ink-soft">
                  {itemType === 'user' ? t('mdm_no_users') : t('mdm_no_folders')}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredItems.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-white transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={localSelected.includes(item.id)}
                        onChange={() => toggleItem(item.id)}
                        className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink truncate">{item.label}</div>
                        {item.secondary && (
                          <div className="text-xs text-ink-soft truncate mt-0.5">{item.secondary}</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => onSave(localSelected)}
            disabled={saving || loading}
          >
            {saving ? t('saving') : t('save')}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  )
}

// Document Types Management
function DocumentTypesManagement() {
  const { t, itemsPerPage } = usePreferences()
  const location = useLocation()
  const navigate = useNavigate()
  const [documentTypes, setDocumentTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage || 10)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  useEffect(() => {
    setPageSize(itemsPerPage || 10)
  }, [itemsPerPage])

  useEffect(() => {
    loadDocumentTypes()
  }, [showInactive])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const action = params.get('mdAction') || params.get('action')
    if (action !== 'add') return
    if (!showModal) {
      setEditingItem(null)
      setShowModal(true)
    }
    params.delete('mdAction')
    params.delete('action')
    const next = params.toString()
    navigate(next ? `${location.pathname}?${next}` : location.pathname, { replace: true })
  }, [location.pathname, location.search, navigate, showModal])

  const loadDocumentTypes = async () => {
    setLoading(true)
    try {
      const res = await api.get('/system/config/document-types', {
        params: showInactive ? { includeInactive: true } : undefined
      })
      setDocumentTypes(res.data.data.documentTypes || [])
    } catch (error) {
      console.error('Failed to load document types:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to load document types', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingItem(null)
    setShowModal(true)
  }

  const handleEdit = (item) => {
    setEditingItem(item)
    setShowModal(true)
  }

  const handleSubmit = async (formData) => {
    try {
      const trimmed = {
        ...formData,
        name: (formData.name || '').trim(),
        prefix: (formData.prefix || '').trim()
      }

      if (!trimmed.name || !trimmed.prefix) {
        setAlertModal({ show: true, title: 'Error', message: 'Please enter a name and a prefix.', type: 'error' })
        return
      }

      const prefixExists = documentTypes.some((dt) => {
        if (editingItem && dt.id === editingItem.id) return false
        return dt.prefix === trimmed.prefix
      })

      if (prefixExists) {
        setAlertModal({ show: true, title: 'Error', message: `This prefix "${trimmed.prefix}" is already in use. Please choose a different prefix.`, type: 'error' })
        return
      }

      if (editingItem) {
        await api.put(`/system/config/document-types/${editingItem.id}`, trimmed)
        setAlertModal({ show: true, title: 'Success', message: 'Document type updated successfully', type: 'success' })
      } else {
        await api.post('/system/config/document-types', trimmed)
        setAlertModal({ show: true, title: 'Success', message: 'Document type created successfully', type: 'success' })
      }
      setShowModal(false)
      setEditingItem(null)
      loadDocumentTypes()
    } catch (error) {
      console.error('Failed to save document type:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to save document type', type: 'error' })
    }
  }

  const handleDelete = async (id) => {
    setConfirmModal({
      show: true,
      title: t('mdm_confirm_delete'),
      message: t('mdm_confirm_delete_doc_type'),
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/system/config/document-types/${id}`)
          setAlertModal({ show: true, title: 'Success', message: 'Document type deleted successfully', type: 'success' })
          loadDocumentTypes()
        } catch (error) {
          console.error('Failed to delete document type:', error)
          setAlertModal({ show: true, title: 'Error', message: 'Failed to delete document type', type: 'error' })
        }
      }
    })
  }

  const handleRestore = async (id) => {
    try {
      await api.patch(`/system/config/document-types/${id}/restore`)
      setAlertModal({ show: true, title: 'Success', message: 'Document type restored successfully', type: 'success' })
      loadDocumentTypes()
    } catch (error) {
      console.error('Failed to restore document type:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to restore document type', type: 'error' })
    }
  }

  const filteredItems = documentTypes.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.prefix.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, showInactive])

  const renderPill = (label, variant = 'neutral') => {
    const classes = {
      success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      warning: 'bg-amber-50 text-amber-700 border-amber-200',
      neutral: 'bg-surface-muted text-ink-secondary border-border'
    }

    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[variant] || classes.neutral}`}>
        {label}
      </span>
    )
  }

  const docTypeColumns = [
    {
      id: 'name',
      key: 'name',
      accessor: 'name',
      label: t('mdm_name'),
      sortable: true,
      required: true,
      render: (value) => <span className="font-medium text-ink">{value}</span>
    },
    {
      id: 'prefix',
      key: 'prefix',
      accessor: 'prefix',
      label: t('mdm_prefix'),
      sortable: true,
      render: (value) => (
        <span className="inline-flex items-center rounded-xl border border-brand/20 bg-brand/10 px-2.5 py-1 text-sm font-semibold text-brand">
          {value}
        </span>
      )
    },
    {
      id: 'description',
      key: 'description',
      accessor: 'description',
      label: t('description'),
      sortable: true,
      render: (value) => value || '-'
    },
    {
      id: 'requiresExpiryTracking',
      key: 'requiresExpiryTracking',
      accessor: 'requiresExpiryTracking',
      label: 'Expiry Tracking',
      sortable: true,
      render: (value) => renderPill(value ? 'Required' : 'Optional', value ? 'success' : 'neutral')
    },
    {
      id: 'allowRenewal',
      key: 'allowRenewal',
      accessor: 'allowRenewal',
      label: 'Renewal',
      sortable: true,
      render: (value) => renderPill(value ? 'Enabled' : 'Disabled', value ? 'warning' : 'neutral')
    },
    {
      id: 'isActive',
      key: 'isActive',
      accessor: 'isActive',
      label: t('status'),
      sortable: true,
      render: (value) => renderPill(value ? t('mdm_active') : t('mdm_inactive'), value ? 'success' : 'neutral')
    },
    {
      id: 'actions',
      key: 'actions',
      accessor: '__actions',
      label: t('action'),
      required: true,
      align: 'right',
      stickyRight: true,
      render: (_v, row) => (
        <ActionMenu
          actions={row.isActive ? [
            { label: t('rp_edit'), onClick: () => handleEdit(row) },
            { label: t('rp_delete'), onClick: () => handleDelete(row.id) }
          ] : [
            { label: t('mr_restore'), onClick: () => handleRestore(row.id) },
            { label: t('rp_delete'), onClick: () => handleDelete(row.id), variant: 'destructive' }
          ]}
        />
      )
    }
  ]

  const tableFeatures = useTableFeatures({
    tableId: 'masterdata-document-types',
    columns: docTypeColumns,
    data: filteredItems,
    defaultSortKey: 'name',
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

  const totalRecords = sortedData.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pageItems = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
    <div className="space-y-6">
      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false })}
      />
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false })}
      />
      <DocumentTypeModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setEditingItem(null)
        }}
        onSubmit={handleSubmit}
        initialData={editingItem}
      />

      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink">{t('mdm_doc_types')}</h3>
          <p className="mt-1 text-sm text-ink-soft">
            {t('mdm_doc_types_desc')}
          </p>
        </div>
        <Button onClick={handleAdd}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('mdm_add_doc_type')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <TextInput
          type="text"
          placeholder={t('mdm_search_name_prefix')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
          />
          {t('show_inactive')}
        </label>
        <ColumnSettingsButton
          orderedColumns={orderedColumns}
          hiddenColumns={hiddenColumns}
          onToggleColumn={toggleColumnVisibility}
          onReset={resetTableSettings}
        />
      </div>

      <TableContainer>
        <Table>
          <thead>
            <Tr className="bg-surface-muted hover:bg-surface-muted">
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
            {loading ? (
              <Tr className="hover:bg-transparent">
                <Td colSpan={Math.max(visibleColumns.length, 1)} className="py-8 text-center text-ink-soft">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand"></div>
                    <span>{t('loading')}</span>
                  </div>
                </Td>
              </Tr>
            ) : sortedData.length === 0 ? (
              <Tr className="hover:bg-transparent">
                <Td colSpan={Math.max(visibleColumns.length, 1)} className="py-8 text-center text-ink-soft">
                  {t('mdm_no_doc_types')}
                </Td>
              </Tr>
            ) : (
              pageItems.map((item) => (
                <Tr key={item.id}>
                  {visibleColumns.map((col) => {
                    const id = col.id || col.key || col.accessor
                    const accessor = col.accessor || id
                    let value
                    if (typeof accessor === 'function') {
                      value = accessor(item, col)
                    } else if (accessor === '__actions') {
                      value = null
                    } else {
                      value = item?.[accessor]
                    }
                    const colContent = typeof col.render === 'function' ? col.render(value, item) : (value != null ? value : '')
                    return (
                      <Td
                        key={id}
                        align={col.align || 'left'}
                        stickyRight={col.stickyRight || false}
                        className={col.stickyRight ? 'py-3' : ''}
                      >
                        {colContent}
                      </Td>
                    )
                  })}
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableContainer>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalRecords={totalRecords}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
      />
    </div>
  )
}

// Departments Management
function DepartmentsManagement() {
  const { t, itemsPerPage } = usePreferences()
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage || 10)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  useEffect(() => {
    setPageSize(itemsPerPage || 10)
  }, [itemsPerPage])

  useEffect(() => {
    loadDepartments()
  }, [showInactive])

  const loadDepartments = async () => {
    setLoading(true)
    try {
      const res = await api.get('/system/config/departments', {
        params: showInactive ? { includeInactive: true } : undefined
      })
      setDepartments(res.data.data.departments || [])
    } catch (error) {
      console.error('Failed to load departments:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to load departments', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingItem(null)
    setShowModal(true)
  }

  const handleEdit = (item) => {
    setEditingItem(item)
    setShowModal(true)
  }

  const handleSubmit = async (formData) => {
    try {
      if (editingItem) {
        await api.put(`/system/config/departments/${editingItem.id}`, formData)
        setAlertModal({ show: true, title: 'Success', message: 'Department updated successfully', type: 'success' })
      } else {
        await api.post('/system/config/departments', formData)
        setAlertModal({ show: true, title: 'Success', message: 'Department created successfully', type: 'success' })
      }
      setShowModal(false)
      setEditingItem(null)
      loadDepartments()
    } catch (error) {
      console.error('Failed to save department:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to save department', type: 'error' })
    }
  }

  const handleDelete = async (id) => {
    setConfirmModal({
      show: true,
      title: t('mdm_confirm_delete'),
      message: t('mdm_confirm_delete_dept'),
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/system/config/departments/${id}`)
          setAlertModal({ show: true, title: 'Success', message: 'Department deleted successfully', type: 'success' })
          loadDepartments()
        } catch (error) {
          console.error('Failed to delete department:', error)
          setAlertModal({ show: true, title: 'Error', message: 'Failed to delete department', type: 'error' })
        }
      }
    })
  }

  const handleRestore = async (id) => {
    try {
      await api.patch(`/system/config/departments/${id}/restore`)
      setAlertModal({ show: true, title: 'Success', message: 'Department restored successfully', type: 'success' })
      loadDepartments()
    } catch (error) {
      console.error('Failed to restore department:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to restore department', type: 'error' })
    }
  }

  const filteredItems = departments.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const renderPill = (label, variant = 'neutral') => {
    const classes = {
      success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      warning: 'bg-amber-50 text-amber-700 border-amber-200',
      neutral: 'bg-surface-muted text-ink-secondary border-border'
    }
    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[variant] || classes.neutral}`}>
        {label}
      </span>
    )
  }

  const deptColumns = [
    {
      id: 'name',
      key: 'name',
      accessor: 'name',
      label: t('mdm_name'),
      sortable: true,
      required: true,
      render: (value) => <span className="font-medium text-gray-900">{value}</span>
    },
    {
      id: 'code',
      key: 'code',
      accessor: 'code',
      label: t('mdm_code'),
      sortable: true,
      render: (value) => (
        <span className="inline-flex items-center rounded-md bg-green-50 px-2.5 py-1 font-mono text-sm font-semibold text-green-700">
          {value}
        </span>
      )
    },
    {
      id: 'description',
      key: 'description',
      accessor: 'description',
      label: t('description'),
      sortable: true,
      render: (value) => value ? <span className="text-sm text-gray-600">{value}</span> : <span className="text-gray-400">-</span>
    },
    {
      id: 'isActive',
      key: 'isActive',
      accessor: 'isActive',
      label: t('status'),
      sortable: true,
      render: (value) => renderPill(value ? t('mdm_active') : t('mdm_inactive'), value ? 'success' : 'neutral')
    },
    {
      id: 'actions',
      key: 'actions',
      accessor: '__actions',
      label: t('action'),
      required: true,
      align: 'right',
      stickyRight: true,
      render: (_v, row) => (
        <ActionMenu
          actions={row.isActive ? [
            { label: t('rp_edit'), onClick: () => handleEdit(row) },
            { label: t('rp_delete'), onClick: () => handleDelete(row.id) }
          ] : [
            { label: t('mr_restore'), onClick: () => handleRestore(row.id) },
            { label: t('rp_delete'), onClick: () => handleDelete(row.id), variant: 'destructive' }
          ]}
        />
      )
    }
  ]

  const tableFeatures = useTableFeatures({
    tableId: 'masterdata-departments',
    columns: deptColumns,
    data: filteredItems,
    defaultSortKey: 'name',
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

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, showInactive])

  const totalRecords = sortedData.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pageItems = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
    <div className="space-y-6">
      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false })}
      />
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false })}
      />
      <DepartmentModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setEditingItem(null)
        }}
        onSubmit={handleSubmit}
        initialData={editingItem}
      />

      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('mdm_departments')}</h3>
          <p className="mt-1 text-sm text-gray-600">
            {t('mdm_dept_desc')}
          </p>
        </div>
        <Button onClick={handleAdd}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('mdm_add_dept')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder={t('mdm_search_name_code')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
        />
      </div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
          />
          {t('show_inactive')}
        </label>
        <ColumnSettingsButton
          orderedColumns={orderedColumns}
          hiddenColumns={hiddenColumns}
          onToggleColumn={toggleColumnVisibility}
          onReset={resetTableSettings}
        />
      </div>

      <TableContainer>
        <Table>
          <thead>
            <Tr className="bg-surface-muted hover:bg-surface-muted">
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
                    title={canDrag ? 'Click to sort \u2022 Drag to reorder' : col.sortable ? 'Click to sort' : undefined}
                  >
                    {col.label || col.header || id}
                  </Th>
                )
              })}
            </Tr>
          </thead>
          <tbody>
            {loading ? (
              <Tr className="hover:bg-transparent">
                <Td colSpan={Math.max(visibleColumns.length, 1)} className="py-8 text-center text-ink-soft">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand"></div>
                    <span>{t('loading')}</span>
                  </div>
                </Td>
              </Tr>
            ) : sortedData.length === 0 ? (
              <Tr className="hover:bg-transparent">
                <Td colSpan={Math.max(visibleColumns.length, 1)} className="py-8 text-center text-ink-soft">
                  {t('mdm_no_depts')}
                </Td>
              </Tr>
            ) : (
              pageItems.map((item) => (
                <Tr key={item.id}>
                  {visibleColumns.map((col) => {
                    const id = col.id || col.key || col.accessor
                    const accessor = col.accessor || id
                    let value
                    if (typeof accessor === 'function') {
                      value = accessor(item, col)
                    } else if (accessor === '__actions') {
                      value = null
                    } else {
                      value = item?.[accessor]
                    }
                    const colContent = typeof col.render === 'function' ? col.render(value, item) : (value != null ? value : '')
                    return (
                      <Td
                        key={id}
                        align={col.align || 'left'}
                        stickyRight={col.stickyRight || false}
                        className={col.stickyRight ? 'py-3' : ''}
                      >
                        {colContent}
                      </Td>
                    )
                  })}
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableContainer>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalRecords={totalRecords}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
      />
    </div>
  )
}


function DivisionsManagement() {
  const { t, itemsPerPage } = usePreferences()
  const [divisions, setDivisions] = useState([])
  const [users, setUsers] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [assignmentModal, setAssignmentModal] = useState({ open: false, type: 'users', division: null, selectedIds: [] })
  const [assignmentLoading, setAssignmentLoading] = useState(false)
  const [assignmentSaving, setAssignmentSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage || 10)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })

  useEffect(() => {
    setPageSize(itemsPerPage || 10)
  }, [itemsPerPage])

  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    setLoading(true)
    try {
      const [divisionsRes, usersRes, foldersRes] = await Promise.all([
        api.get('/divisions'),
        api.get('/users'),
        api.get('/folders')
      ])

      setDivisions(divisionsRes.data.data?.divisions || [])
      setUsers(usersRes.data.data?.users || [])
      setFolders(flattenFolderTree(foldersRes.data.data?.folders || []))
    } catch (error) {
      console.error('Failed to load divisions data:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to load divisions data', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const refreshDivisions = async () => {
    const divisionsRes = await api.get('/divisions')
    setDivisions(divisionsRes.data.data?.divisions || [])
  }

  const handleAdd = () => {
    setEditingItem(null)
    setShowModal(true)
  }

  const handleEdit = (item) => {
    setEditingItem(item)
    setShowModal(true)
  }

  const handleSubmit = async (formData) => {
    try {
      if (editingItem) {
        await api.put(`/divisions/${editingItem.id}`, formData)
        setAlertModal({ show: true, title: 'Success', message: 'Division updated successfully', type: 'success' })
      } else {
        await api.post('/divisions', formData)
        setAlertModal({ show: true, title: 'Success', message: 'Division created successfully', type: 'success' })
      }
      setShowModal(false)
      setEditingItem(null)
      await refreshDivisions()
    } catch (error) {
      console.error('Failed to save division:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to save division', type: 'error' })
    }
  }

  const handleDelete = (item) => {
    setConfirmModal({
      show: true,
      title: t('mdm_confirm_delete'),
      message: t('mdm_confirm_delete_division'),
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/divisions/${item.id}`)
          setAlertModal({ show: true, title: 'Success', message: 'Division deleted successfully', type: 'success' })
          await refreshDivisions()
        } catch (error) {
          console.error('Failed to delete division:', error)
          setAlertModal({
            show: true,
            title: 'Error',
            message: error.response?.data?.message || 'Failed to delete division',
            type: 'error'
          })
        }
      }
    })
  }

  const openAssignments = async (division, type) => {
    setAssignmentLoading(true)
    setAssignmentModal({ open: true, type, division, selectedIds: [] })
    try {
      const res = await api.get(`/divisions/${division.id}/${type}`)
      const key = type === 'users' ? 'users' : 'folders'
      const selectedIds = (res.data.data?.[key] || []).map((item) => item.id)
      setAssignmentModal({ open: true, type, division, selectedIds })
    } catch (error) {
      console.error(`Failed to load division ${type}:`, error)
      setAssignmentModal({ open: false, type, division: null, selectedIds: [] })
      setAlertModal({ show: true, title: 'Error', message: `Failed to load division ${type}`, type: 'error' })
    } finally {
      setAssignmentLoading(false)
    }
  }

  const handleSaveAssignments = async (selectedIds) => {
    if (!assignmentModal.division) return
    setAssignmentSaving(true)
    try {
      if (assignmentModal.type === 'users') {
        await api.put(`/divisions/${assignmentModal.division.id}/users`, { userIds: selectedIds })
      } else {
        await api.put(`/divisions/${assignmentModal.division.id}/folders`, { folderIds: selectedIds })
      }
      setAlertModal({
        show: true,
        title: 'Success',
        message: assignmentModal.type === 'users' ? 'Division users updated successfully' : 'Division folders updated successfully',
        type: 'success'
      })
      setAssignmentModal({ open: false, type: 'users', division: null, selectedIds: [] })
      await refreshDivisions()
    } catch (error) {
      console.error('Failed to save division assignments:', error)
      setAlertModal({
        show: true,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to save division assignments',
        type: 'error'
      })
    } finally {
      setAssignmentSaving(false)
    }
  }

  const filteredItems = divisions.filter((item) => {
    const matchesActive = showInactive ? true : item.isActive
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesActive && matchesSearch
  })

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, showInactive])

  const totalRecords = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pageItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const assignmentItems = assignmentModal.type === 'users'
    ? users.map((user) => ({
        id: user.id,
        label: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        secondary: [user.email, user.department].filter(Boolean).join(' | ')
      }))
    : folders.map((folder) => ({
        id: folder.id,
        label: folder.pathLabel,
        secondary: `ID: ${folder.id}${folder.inheritPermissions ? ' | Inherit enabled' : ''}`
      }))

  return (
    <div className="space-y-6">
      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false })}
      />
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false })}
      />
      <DivisionModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setEditingItem(null)
        }}
        onSubmit={handleSubmit}
        initialData={editingItem}
      />
      <DivisionAssignmentModal
        isOpen={assignmentModal.open}
        onClose={() => setAssignmentModal({ open: false, type: 'users', division: null, selectedIds: [] })}
        onSave={handleSaveAssignments}
        loading={assignmentLoading}
        saving={assignmentSaving}
        title={assignmentModal.type === 'users' ? t('mdm_assign_users') : t('mdm_assign_folders')}
        description={
          assignmentModal.division
            ? (assignmentModal.type === 'users'
                ? t('mdm_assign_users_desc', { division: assignmentModal.division.name })
                : t('mdm_assign_folders_desc', { division: assignmentModal.division.name }))
            : ''
        }
        items={assignmentItems}
        selectedIds={assignmentModal.selectedIds}
        itemType={assignmentModal.type === 'users' ? 'user' : 'folder'}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('mdm_divisions')}</h3>
          <p className="mt-1 text-sm text-gray-600">{t('mdm_division_desc')}</p>
        </div>
        <Button onClick={handleAdd}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('mdm_add_division')}
        </Button>
      </div>

      <AppSurface variant="panel" padding="md" className="space-y-4">
        <p className="text-sm text-ink-soft">{t('mdm_division_help')}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            type="text"
            placeholder={t('mdm_search_name_code')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t('show_inactive')}
          </label>
        </div>
      </AppSurface>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">{t('mdm_name')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">{t('mdm_code')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">{t('users')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">{t('folders')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">{t('status')}</th>
              <th className="sticky right-0 z-30 bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-700 border-l border-gray-200">{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
                    <span>{t('loading')}</span>
                  </div>
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-8 text-center text-gray-500">{t('mdm_no_divisions')}</td>
              </tr>
            ) : (
              pageItems.map((item) => (
                <tr key={item.id} className="group border-b border-gray-100 transition-colors hover:bg-gray-50">
                  <td className="px-4 py-4 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 font-mono text-sm font-semibold text-blue-700">
                      {item.code}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-gray-700">{item._count?.users || 0}</td>
                  <td className="px-4 py-4 text-gray-700">{item._count?.folders || 0}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      item.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {item.isActive ? t('mdm_active') : t('mdm_inactive')}
                    </span>
                  </td>
                  <td className="sticky right-0 z-20 bg-white group-hover:bg-gray-50 px-4 py-4 text-right border-l border-gray-200">
                    <ActionMenu
                      actions={[
                        { label: t('rp_edit'), onClick: () => handleEdit(item) },
                        { label: t('mdm_assign_users'), onClick: () => openAssignments(item, 'users') },
                        { label: t('mdm_assign_folders'), onClick: () => openAssignments(item, 'folders') },
                        { label: t('rp_delete'), onClick: () => handleDelete(item), variant: 'destructive' }
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalRecords={totalRecords}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
      />
    </div>
  )
}

function CrmLookupsManagement() {
  const [lookups, setLookups] = useState({ channels: [], industryTypes: [] })
  const [drafts, setDrafts] = useState({ channel: '', industryType: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })

  const loadLookups = async () => {
    setLoading(true)
    try {
      const res = await api.get('/system/config/crm-fb-enquiry-lookups')
      const next = res.data?.data?.lookups || {}
      setLookups({
        channels: Array.isArray(next.channels) ? next.channels : [],
        industryTypes: Array.isArray(next.industryTypes) ? next.industryTypes : []
      })
    } catch (error) {
      console.error('Failed to load CRM lookups:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to load CRM lookup values', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLookups()
  }, [])

  const addItem = (type) => {
    const draftKey = type === 'channels' ? 'channel' : 'industryType'
    const value = String(drafts[draftKey] || '').trim()
    if (!value) {
      setAlertModal({ show: true, title: 'Error', message: 'Please enter a value before adding.', type: 'error' })
      return
    }

    const exists = (lookups[type] || []).some((item) => String(item).toLowerCase() === value.toLowerCase())
    if (exists) {
      setAlertModal({ show: true, title: 'Error', message: 'This value already exists.', type: 'error' })
      return
    }

    setLookups((prev) => ({ ...prev, [type]: [...prev[type], value] }))
    setDrafts((prev) => ({ ...prev, [draftKey]: '' }))
  }

  const removeItem = (type, value) => {
    setLookups((prev) => ({
      ...prev,
      [type]: prev[type].filter((item) => item !== value)
    }))
  }

  const saveLookups = async () => {
    setSaving(true)
    try {
      const payload = {
        channels: lookups.channels,
        industryTypes: lookups.industryTypes
      }
      const res = await api.put('/system/config/crm-fb-enquiry-lookups', payload)
      const next = res.data?.data?.lookups || payload
      setLookups({
        channels: Array.isArray(next.channels) ? next.channels : [],
        industryTypes: Array.isArray(next.industryTypes) ? next.industryTypes : []
      })
      setAlertModal({ show: true, title: 'Success', message: 'CRM lookup values updated successfully', type: 'success' })
    } catch (error) {
      console.error('Failed to save CRM lookups:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to save CRM lookup values', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const LookupSection = ({ title, description, type, draftKey, placeholder }) => (
    <AppSurface variant="panel" padding="md" className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>

      <div className="flex gap-3">
        <TextInput
          value={drafts[draftKey]}
          onChange={(e) => setDrafts((prev) => ({ ...prev, [draftKey]: e.target.value }))}
          placeholder={placeholder}
        />
        <Button onClick={() => addItem(type)}>Add</Button>
      </div>

      <div className="flex min-h-[120px] flex-wrap gap-2 rounded-2xl border border-border bg-surface p-4">
        {(lookups[type] || []).length === 0 ? (
          <span className="text-sm text-ink-soft">No values added yet.</span>
        ) : (
          lookups[type].map((item) => (
            <span key={item} className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-sm text-ink">
              {item}
              <button
                type="button"
                onClick={() => removeItem(type, item)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={`Remove ${item}`}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
    </AppSurface>
  )

  return (
    <>
      <AlertModal
        show={alertModal.show}
        onClose={() => setAlertModal({ show: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />

      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">CRM Lookup Values</h3>
            <p className="mt-1 text-sm text-gray-600">Maintain FB Enquiry dropdown values for Enquiry Channel and Industry Type.</p>
          </div>
          <Button onClick={saveLookups} loading={saving} disabled={loading}>
            Save Changes
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <LookupSection
            title="Enquiry Channel"
            description="Add or remove channel options shown in the FB Enquiry entry modal."
            type="channels"
            draftKey="channel"
            placeholder="e.g., Website Form"
          />
          <LookupSection
            title="Industry Type"
            description="Add or remove industry options shown in the FB Enquiry entry modal."
            type="industryTypes"
            draftKey="industryType"
            placeholder="e.g., Logistics"
          />
        </div>
      </div>
    </>
  )
}

// Project Categories Management
function ProjectCategoriesManagement() {
  const { t, itemsPerPage } = usePreferences()
  const [projectCategories, setProjectCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage || 10)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  useEffect(() => {
    setPageSize(itemsPerPage || 10)
  }, [itemsPerPage])

  useEffect(() => {
    loadProjectCategories()
  }, [showInactive])

  const loadProjectCategories = async () => {
    setLoading(true)
    try {
      const res = await api.get('/system/config/project-categories', {
        params: showInactive ? { includeInactive: true } : undefined
      })
      setProjectCategories(res.data.data.projectCategories || [])
    } catch (error) {
      console.error('Failed to load project categories:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to load project categories', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingItem(null)
    setShowModal(true)
  }

  const handleEdit = (item) => {
    setEditingItem(item)
    setShowModal(true)
  }

  const handleSubmit = async (formData) => {
    try {
      const trimmed = {
        ...formData,
        name: (formData.name || '').trim(),
        code: (formData.code || '').trim()
      }

      if (!trimmed.name || !trimmed.code) {
        setAlertModal({ show: true, title: 'Error', message: 'Please enter a name and a code.', type: 'error' })
        return
      }

      const codeExists = projectCategories.some((pc) => {
        if (editingItem && pc.id === editingItem.id) return false
        return pc.code === trimmed.code
      })

      if (codeExists) {
        setAlertModal({ show: true, title: 'Error', message: `This code "${trimmed.code}" is already in use. Please choose a different code.`, type: 'error' })
        return
      }

      if (editingItem) {
        await api.put(`/system/config/project-categories/${editingItem.id}`, trimmed)
        setAlertModal({ show: true, title: 'Success', message: 'Project category updated successfully', type: 'success' })
      } else {
        await api.post('/system/config/project-categories', trimmed)
        setAlertModal({ show: true, title: 'Success', message: 'Project category created successfully', type: 'success' })
      }
      setShowModal(false)
      setEditingItem(null)
      loadProjectCategories()
    } catch (error) {
      console.error('Failed to save project category:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to save project category', type: 'error' })
    }
  }

  const handleDelete = async (id) => {
    setConfirmModal({
      show: true,
      title: t('mdm_confirm_delete'),
      message: t('mdm_confirm_delete_project_cat'),
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/system/config/project-categories/${id}`)
          setAlertModal({ show: true, title: 'Success', message: 'Project category deleted successfully', type: 'success' })
          loadProjectCategories()
        } catch (error) {
          console.error('Failed to delete project category:', error)
          setAlertModal({ show: true, title: 'Error', message: 'Failed to delete project category', type: 'error' })
        }
      }
    })
  }

  const handleRestore = async (id) => {
    try {
      await api.patch(`/system/config/project-categories/${id}/restore`)
      setAlertModal({ show: true, title: 'Success', message: 'Project category restored successfully', type: 'success' })
      loadProjectCategories()
    } catch (error) {
      console.error('Failed to restore project category:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to restore project category', type: 'error' })
    }
  }

  const filteredItems = projectCategories.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, showInactive])

  const renderPill = (label, variant = 'neutral') => {
    const classes = {
      success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      warning: 'bg-amber-50 text-amber-700 border-amber-200',
      neutral: 'bg-surface-muted text-ink-secondary border-border'
    }
    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[variant] || classes.neutral}`}>
        {label}
      </span>
    )
  }

  const pcColumns = [
    {
      id: 'name',
      key: 'name',
      accessor: 'name',
      label: t('mdm_name'),
      sortable: true,
      required: true,
      render: (value) => <span className="font-medium text-gray-900">{value}</span>
    },
    {
      id: 'code',
      key: 'code',
      accessor: 'code',
      label: t('mdm_code'),
      sortable: true,
      render: (value) => (
        <span className="inline-flex items-center rounded-md bg-purple-50 px-2.5 py-1 font-mono text-sm font-semibold text-purple-700">
          {value}
        </span>
      )
    },
    {
      id: 'description',
      key: 'description',
      accessor: 'description',
      label: t('description'),
      sortable: true,
      render: (value) => value ? <span className="text-sm text-gray-600">{value}</span> : <span className="text-gray-400">-</span>
    },
    {
      id: 'isActive',
      key: 'isActive',
      accessor: 'isActive',
      label: t('status'),
      sortable: true,
      render: (value) => renderPill(value ? t('mdm_active') : t('mdm_inactive'), value ? 'success' : 'neutral')
    },
    {
      id: 'actions',
      key: 'actions',
      accessor: '__actions',
      label: t('action'),
      required: true,
      align: 'right',
      stickyRight: true,
      render: (_v, row) => (
        <ActionMenu
          actions={row.isActive ? [
            { label: t('rp_edit'), onClick: () => handleEdit(row) },
            { label: t('rp_delete'), onClick: () => handleDelete(row.id) }
          ] : [
            { label: t('mr_restore'), onClick: () => handleRestore(row.id) },
            { label: t('rp_delete'), onClick: () => handleDelete(row.id), variant: 'destructive' }
          ]}
        />
      )
    }
  ]

  const tableFeatures = useTableFeatures({
    tableId: 'masterdata-project-categories',
    columns: pcColumns,
    data: filteredItems,
    defaultSortKey: 'name',
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

  const totalRecords = sortedData.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pageItems = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
    <div className="space-y-6">
      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ show: false })}
      />
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false })}
      />
      <ProjectCategoryModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setEditingItem(null)
        }}
        onSubmit={handleSubmit}
        initialData={editingItem}
      />

      {/* Header */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('mdm_project_categories')}</h3>
          <p className="mt-1 text-sm text-gray-600">
            {t('mdm_project_cat_desc')}
          </p>
        </div>
        <Button onClick={handleAdd}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('mdm_add_project_cat')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder={t('mdm_search_name_code')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
        />
      </div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
          />
          {t('show_inactive')}
        </label>
        <ColumnSettingsButton
          orderedColumns={orderedColumns}
          hiddenColumns={hiddenColumns}
          onToggleColumn={toggleColumnVisibility}
          onReset={resetTableSettings}
        />
      </div>

      <TableContainer>
        <Table>
          <thead>
            <Tr className="bg-surface-muted hover:bg-surface-muted">
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
            {loading ? (
              <Tr className="hover:bg-transparent">
                <Td colSpan={Math.max(visibleColumns.length, 1)} className="py-8 text-center text-ink-soft">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand"></div>
                    <span>{t('loading')}</span>
                  </div>
                </Td>
              </Tr>
            ) : sortedData.length === 0 ? (
              <Tr className="hover:bg-transparent">
                <Td colSpan={Math.max(visibleColumns.length, 1)} className="py-8 text-center text-ink-soft">
                  {t('mdm_no_project_cats')}
                </Td>
              </Tr>
            ) : (
              pageItems.map((item) => (
                <Tr key={item.id}>
                  {visibleColumns.map((col) => {
                    const id = col.id || col.key || col.accessor
                    const accessor = col.accessor || id
                    let value
                    if (typeof accessor === 'function') {
                      value = accessor(item, col)
                    } else if (accessor === '__actions') {
                      value = null
                    } else {
                      value = item?.[accessor]
                    }
                    const colContent = typeof col.render === 'function' ? col.render(value, item) : (value != null ? value : '')
                    return (
                      <Td
                        key={id}
                        align={col.align || 'left'}
                        stickyRight={col.stickyRight || false}
                        className={col.stickyRight ? 'py-3' : ''}
                      >
                        {colContent}
                      </Td>
                    )
                  })}
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableContainer>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalRecords={totalRecords}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
      />
    </div>
  )
}

// Main Component
export default function MasterDataManagement() {
  const { t } = usePreferences()
  const location = useLocation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(location.search).get('mdTab')
    return tab && VALID_MASTERDATA_TABS.includes(tab) ? tab : 'departments'
  })

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('mdTab')
    if (tab && VALID_MASTERDATA_TABS.includes(tab) && tab !== activeTab) {
      setActiveTab(tab)
    }
  }, [location.search, activeTab])

  const handleTabChange = (nextTab) => {
    setActiveTab(nextTab)
    const params = new URLSearchParams(location.search)
    params.set('mdTab', nextTab)
    navigate({ pathname: location.pathname, search: `?${params.toString()}` })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('mdm_title')}</h2>
        <p className="text-sm text-gray-600 mt-1">
          {t('mdm_title_desc')}
        </p>
      </div>

      {/* Content */}
      <div className="card p-6">
        <MasterDataTabs activeTab={activeTab} onTabChange={handleTabChange} />
        
        {activeTab === 'departments' && <DepartmentsManagement />}
        {activeTab === 'divisions' && <DivisionsManagement />}
        {activeTab === 'project-categories' && <ProjectCategoriesManagement />}
        {activeTab === 'document-types' && <DocumentTypesManagement />}
        {activeTab === 'crm-lookups' && <CrmLookupsManagement />}
      </div>
    </div>
  )
}
