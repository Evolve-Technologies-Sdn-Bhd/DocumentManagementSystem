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
import { Table, TableContainer, Td, Th, Tr } from './ui/Table'

const VALID_MASTERDATA_TABS = ['departments', 'divisions', 'project-categories', 'document-types']

// Tab Navigation for Master Data
function MasterDataTabs({ activeTab, onTabChange }) {
  const { t } = usePreferences()
  const tabs = [
    { id: 'departments', label: t('mdm_departments') },
    { id: 'divisions', label: t('mdm_divisions') },
    { id: 'project-categories', label: t('mdm_project_categories') },
    { id: 'document-types', label: t('mdm_doc_types') }
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

  const totalRecords = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pageItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
      <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
        />
        {t('show_inactive')}
      </label>

      {/* Table */}
      <TableContainer>
        <Table>
          <thead>
            <Tr className="bg-surface-muted hover:bg-surface-muted">
              <Th>{t('mdm_name')}</Th>
              <Th>{t('mdm_prefix')}</Th>
              <Th>{t('description')}</Th>
              <Th>Expiry Tracking</Th>
              <Th>Renewal</Th>
              <Th>{t('status')}</Th>
              <Th align="right">{t('action')}</Th>
            </Tr>
          </thead>
          <tbody>
            {loading ? (
              <Tr className="hover:bg-transparent">
                <Td colSpan="7" className="py-8 text-center text-ink-soft">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand"></div>
                    <span>{t('loading')}</span>
                  </div>
                </Td>
              </Tr>
            ) : filteredItems.length === 0 ? (
              <Tr className="hover:bg-transparent">
                <Td colSpan="7" className="py-8 text-center text-ink-soft">
                  {t('mdm_no_doc_types')}
                </Td>
              </Tr>
            ) : (
              pageItems.map((item) => (
                <Tr key={item.id}>
                  <Td className="font-medium text-ink">{item.name}</Td>
                  <Td>
                    <span className="inline-flex items-center rounded-xl border border-brand/20 bg-brand/10 px-2.5 py-1 text-sm font-semibold text-brand">
                      {item.prefix}
                    </span>
                  </Td>
                  <Td>{item.description || '-'}</Td>
                  <Td>
                    {renderPill(
                      item.requiresExpiryTracking ? 'Required' : 'Optional',
                      item.requiresExpiryTracking ? 'success' : 'neutral'
                    )}
                  </Td>
                  <Td>
                    {renderPill(
                      item.allowRenewal ? 'Enabled' : 'Disabled',
                      item.allowRenewal ? 'warning' : 'neutral'
                    )}
                  </Td>
                  <Td>
                    {renderPill(item.isActive ? t('mdm_active') : t('mdm_inactive'), item.isActive ? 'success' : 'neutral')}
                  </Td>
                  <Td align="right">
                    <ActionMenu
                      actions={item.isActive ? [
                        { label: t('rp_edit'), onClick: () => handleEdit(item) },
                        { label: t('rp_delete'), onClick: () => handleDelete(item.id) }
                      ] : [
                        { label: t('mr_restore'), onClick: () => handleRestore(item.id) },
                        { label: t('rp_delete'), onClick: () => handleDelete(item.id), variant: 'destructive' }
                      ]}
                    />
                  </Td>
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

// Project Categories Management
function ProjectCategoriesManagement() {
  const { t, itemsPerPage } = usePreferences()
  const location = useLocation()
  const navigate = useNavigate()
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

  useEffect(() => {
    setPageSize(itemsPerPage || 10)
  }, [itemsPerPage])

  useEffect(() => {
    loadProjectCategories()
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
      if (editingItem) {
        await api.put(`/system/config/project-categories/${editingItem.id}`, formData)
        setAlertModal({ show: true, title: 'Success', message: 'Project category updated successfully', type: 'success' })
      } else {
        await api.post('/system/config/project-categories', formData)
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

  const filteredItems = projectCategories.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, showInactive])

  const totalRecords = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pageItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('mdm_project_categories')}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {t('mdm_project_cat_desc')}
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('mdm_add_project_cat')}
        </button>
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
      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        {t('show_inactive')}
      </label>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wider">{t('mdm_name')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wider">{t('mdm_code')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wider">{t('description')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wider">{t('status')}</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wider">{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="text-center py-8 text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span>{t('loading')}</span>
                  </div>
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-8 text-gray-500">
                  {t('mdm_no_project_cats')}
                </td>
              </tr>
            ) : (
              pageItems.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-4 text-gray-900 font-medium">{item.name}</td>
                  <td className="py-4 px-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 text-sm font-mono font-semibold">
                      {item.code}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-gray-600 text-sm">{item.description || '-'}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
                      item.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {item.isActive ? t('mdm_active') : t('mdm_inactive')}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <ActionMenu
                      actions={[
                        { label: t('rp_edit'), onClick: () => handleEdit(item) },
                        { label: t('rp_delete'), onClick: () => handleDelete(item.id) }
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
              <p className="mt-1.5 text-xs text-ink-soft">{t('mdm_code_dept_help')}</p>
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

function DivisionModal({ isOpen, onClose, onSubmit, initialData }) {
  const { t } = usePreferences()
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    isActive: true
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        code: initialData.code || '',
        isActive: initialData.isActive !== false
      })
    } else {
      setFormData({
        name: '',
        code: '',
        isActive: true
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
                placeholder="e.g., Quality Assurance"
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
                placeholder="e.g., QA"
              />
              <p className="mt-1.5 text-xs text-ink-soft">{t('mdm_code_division_help')}</p>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
              />
              <div>
                <span className="block text-sm font-medium text-ink">{t('mdm_active')}</span>
                <span className="mt-1 block text-xs text-ink-soft">{t('mdm_division_active_help')}</span>
              </div>
            </label>
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
  const [query, setQuery] = useState('')
  const [draftSelection, setDraftSelection] = useState([])

  useEffect(() => {
    setDraftSelection(Array.isArray(selectedIds) ? selectedIds : [])
  }, [selectedIds, isOpen])

  useEffect(() => {
    if (!isOpen) setQuery('')
  }, [isOpen])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return items || []
    return (items || []).filter((item) => {
      const label = String(item.label || '').toLowerCase()
      const secondary = String(item.secondary || '').toLowerCase()
      return label.includes(normalizedQuery) || secondary.includes(normalizedQuery)
    })
  }, [items, query])

  const toggleSelection = (id) => {
    setDraftSelection((prev) => (
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    ))
  }

  const handleSelectFiltered = () => {
    setDraftSelection((prev) => {
      const next = new Set(prev)
      filteredItems.forEach((item) => next.add(item.id))
      return [...next]
    })
  }

  const handleSelectAll = () => {
    setDraftSelection((items || []).map((item) => item.id))
  }

  const handleClearAll = () => {
    setDraftSelection([])
  }

  if (!isOpen) return null

  return (
    <Modal onClose={onClose} closeOnBackdrop size="lg">
      <ModalHeader title={title} onClose={onClose} />
      <ModalBody>
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">{description}</p>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <TextInput
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={itemType === 'folder' ? t('mdm_search_folder') : t('mdm_search_user')}
            />
            <div className="mt-3 flex items-center justify-between text-xs text-ink-soft">
              <span>{t('mdm_selected_count', { count: draftSelection.length })}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="font-medium text-brand hover:text-brand/80"
                >
                  {t('mdm_select_all')}
                </button>
                <button
                  type="button"
                  onClick={handleSelectFiltered}
                  className="font-medium text-brand hover:text-brand/80"
                >
                  {t('mdm_select_filtered')}
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="font-medium text-ink-soft hover:text-ink"
                >
                  {t('mdm_clear_all')}
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-border bg-white">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-ink-soft">{t('loading')}</div>
            ) : filteredItems.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-ink-soft">{t('no_records')}</div>
            ) : (
              filteredItems.map((item) => {
                const checked = draftSelection.includes(item.id)
                return (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-[var(--dms-color-info-soft)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelection(item.id)}
                      className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{item.label}</div>
                      {item.secondary ? <div className="mt-1 text-xs text-ink-soft">{item.secondary}</div> : null}
                    </div>
                  </label>
                )
              })
            )}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button type="button" onClick={() => onSave(draftSelection)} disabled={saving}>
          {saving ? t('saving') : t('mdm_save_assignments')}
        </Button>
      </ModalFooter>
    </Modal>
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

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, showInactive])

  const totalRecords = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pageItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('mdm_departments')}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {t('mdm_dept_desc')}
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('mdm_add_dept')}
        </button>
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
      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        {t('show_inactive')}
      </label>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wider">{t('mdm_name')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wider">{t('mdm_code')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wider">{t('description')}</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wider">{t('status')}</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wider">{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="text-center py-8 text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span>{t('loading')}</span>
                  </div>
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-8 text-gray-500">
                  {t('mdm_no_depts')}
                </td>
              </tr>
            ) : (
              pageItems.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-4 text-gray-900 font-medium">{item.name}</td>
                  <td className="py-4 px-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-green-50 text-green-700 text-sm font-mono font-semibold">
                      {item.code}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-gray-600 text-sm">{item.description || '-'}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
                      item.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {item.isActive ? t('mdm_active') : t('mdm_inactive')}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <ActionMenu
                      actions={item.isActive ? [
                        { label: t('rp_edit'), onClick: () => handleEdit(item) },
                        { label: t('rp_delete'), onClick: () => handleDelete(item.id) }
                      ] : [
                        { label: t('mr_restore'), onClick: () => handleRestore(item.id) },
                        { label: t('rp_delete'), onClick: () => handleDelete(item.id), variant: 'destructive' }
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
        <button
          onClick={handleAdd}
          className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('mdm_add_division')}
        </button>
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
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-700">{t('action')}</th>
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
                <tr key={item.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50">
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
                  <td className="px-4 py-4 text-right">
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
      </div>
    </div>
  )
}
