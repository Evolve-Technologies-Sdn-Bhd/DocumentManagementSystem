import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import BulkImportModal from './BulkImportModal'
import DocumentViewerModal from './DocumentViewerModal'
import SupersedeObsoleteModal from './SupersedeObsoleteModal'
import StatusBadge from './StatusBadge'
import ActionMenu from './ActionMenu'
import EmptyState from './EmptyState'
import Pagination from './Pagination'
import { PermissionGate } from './PermissionGate'
import { hasPermission } from '../utils/permissions'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import { usePreferences } from '../contexts/PreferencesContext'
import PageHeader from './ui/PageHeader'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import SelectField from './ui/SelectField'
import InlineSpinner from './ui/InlineSpinner'
import { Table, TableContainer, Td, Th, Tr } from './ui/Table'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'

export default function PublishedDocuments() {
  const { itemsPerPage, formatDate, t } = usePreferences()
  const [searchParams] = useSearchParams()
  const toFolderId = (v) => {
    if (v === null || v === undefined || v === '') return null
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [totalDocuments, setTotalDocuments] = useState(0)
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, name: 'Root' }])
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [showCreateSubFolderModal, setShowCreateSubFolderModal] = useState(false)
  const [showUploadFileModal, setShowUploadFileModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showSupersedeObsoleteModal, setShowSupersedeObsoleteModal] = useState(false)
  const [actionType, setActionType] = useState(null)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [parentFolderForSub, setParentFolderForSub] = useState(null)
  const [userRole, setUserRole] = useState('Admin') // Get from localStorage/context
  const [contextMenuFolder, setContextMenuFolder] = useState(null)
  const [renameModal, setRenameModal] = useState({ show: false, type: '', id: null, currentName: '' })
  const [renameName, setRenameName] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)
  const [renameError, setRenameError] = useState('')
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [accessModalOpen, setAccessModalOpen] = useState(false)
  const [accessFolder, setAccessFolder] = useState(null)
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessError, setAccessError] = useState('')
  const [accessMode, setAccessMode] = useState('PUBLIC')
  const [inheritPermissions, setInheritPermissions] = useState(true)
  const [accessEntries, setAccessEntries] = useState([])
  const [subjects, setSubjects] = useState({ users: [], roles: [] })

  const [createAccessMode, setCreateAccessMode] = useState('PUBLIC')
  const [createInheritPermissions, setCreateInheritPermissions] = useState(true)
  const [createAccessEntries, setCreateAccessEntries] = useState([])
  const [createAccessError, setCreateAccessError] = useState('')
  const [createAccessLoading, setCreateAccessLoading] = useState(false)

  // Folder structure
  const [folders, setFolders] = useState([])

  // Helper function to flatten folder hierarchy for display
  const flattenFolders = (folderList, level = 0, parentPath = []) => {
    let result = []
    folderList.forEach(folder => {
      const currentPath = [...parentPath, folder.name]
      const hasChildren = folder.children && folder.children.length > 0
      
      // Create proper indentation with tree characters
      let prefix = ''
      if (level > 0) {
        prefix = '\u00A0\u00A0'.repeat(level - 1) + '\u2514\u2500 '
      }
      
      result.push({
        id: folder.id,
        name: folder.name,
        displayName: prefix + folder.name,
        level: level,
        path: currentPath.join(' › '),
        fullPath: currentPath,
        hasChildren: hasChildren,
        icon: level === 0 ? '📁' : '📂',
        canCreate: Boolean(folder.canCreate),
        canEdit: Boolean(folder.canEdit),
        canDelete: Boolean(folder.canDelete),
        canDownload: Boolean(folder.canDownload),
        canManage: Boolean(folder.canManage)
      })
      if (hasChildren) {
        result = result.concat(flattenFolders(folder.children, level + 1, currentPath))
      }
    })
    return result
  }

  const buildBreadcrumbsFrom = (folderTree, folderId) => {
    const fid = toFolderId(folderId)
    if (!fid) return [{ id: null, name: 'Root' }]
    const findFolder = (foldersList, id, path = []) => {
      for (const folder of foldersList) {
        const currentPath = [...path, { id: folder.id, name: folder.name }]
        if (toFolderId(folder.id) === id) return currentPath
        if (folder.children && folder.children.length > 0) {
          const found = findFolder(folder.children, id, currentPath)
          if (found) return found
        }
      }
      return null
    }
    const path = findFolder(folderTree || [], fid) || []
    return [{ id: null, name: 'Root' }, ...path]
  }

  // Build breadcrumbs for a folder
  const buildBreadcrumbs = (folderId) => buildBreadcrumbsFrom(folders, folderId)

  // Get flattened folders for dropdown
  const flatFolders = flattenFolders(folders)
  const deepLinkFolderId = useMemo(() => toFolderId(searchParams.get('folderId')), [searchParams])
  const selectedFolderMeta = useMemo(() => {
    if (!selectedFolder) return null
    return flatFolders.find((f) => f.id === selectedFolder) || null
  }, [flatFolders, selectedFolder])
  const canCreateInSelected = Boolean(selectedFolderMeta?.canCreate)
  const canDownloadSelected = Boolean(selectedFolderMeta?.canDownload)
  const hasAnyCreatableFolder = useMemo(() => flatFolders.some((f) => Boolean(f.canCreate)), [flatFolders])

  useEffect(() => {
    loadFolders()
    loadUserRole()
  }, [])

  useEffect(() => {
    if (!deepLinkFolderId || folders.length === 0) return

    setSelectedFolder(deepLinkFolderId)
    setBreadcrumbs(buildBreadcrumbsFrom(folders, deepLinkFolderId))
    expandPathToFolder(deepLinkFolderId)
  }, [deepLinkFolderId, folders])

  useEffect(() => {
    loadDocuments()
  }, [selectedFolder, searchQuery, currentPage, pageSize, folders])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedFolder])

  const loadUserRole = () => {
    // Get user role from localStorage
    const savedUser = localStorage.getItem('user')
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser)
        const role = user.role || user.roles?.[0]?.role?.name || 'Viewer'
        setUserRole(role)
      } catch (e) {
        console.error('Failed to parse user data', e)
        setUserRole('Viewer')
      }
    }
  }

  // Check if user has admin permissions
  const isAdmin = ['Admin', 'Administrator', 'ADMIN', 'admin'].includes(userRole)

  const loadFolders = async () => {
    try {
      const res = await api.get('/folders')
      const list = res.data.data.folders || []
      setFolders(list)
      return list
    } catch (error) {
      console.error('Failed to load folders:', error)
      return []
    }
  }

  const openRename = (type, id, currentName) => {
    setRenameError('')
    setRenameLoading(false)
    setRenameName(String(currentName || ''))
    setRenameModal({ show: true, type, id, currentName: String(currentName || '') })
  }

  const closeRename = () => {
    setRenameModal({ show: false, type: '', id: null, currentName: '' })
    setRenameName('')
    setRenameError('')
    setRenameLoading(false)
  }

  const submitRename = async () => {
    const name = String(renameName || '').trim()
    if (!renameModal?.id) return
    if (!name) {
      setRenameError('Name is required')
      return
    }
    setRenameLoading(true)
    setRenameError('')
    try {
      if (renameModal.type === 'folder') {
        await api.put(`/folders/${renameModal.id}`, { name })
        const list = await loadFolders()
        if (selectedFolder) {
          setBreadcrumbs(buildBreadcrumbsFrom(list, selectedFolder))
        }
        setAlertModal({ show: true, title: 'Success', message: 'Folder renamed successfully', type: 'success' })
      } else if (renameModal.type === 'file') {
        await api.put(`/documents/${renameModal.id}/rename`, { fileName: name })
        await loadDocuments()
        setAlertModal({ show: true, title: 'Success', message: 'File renamed successfully', type: 'success' })
      }
      closeRename()
    } catch (e) {
      setRenameError(e?.response?.data?.message || 'Failed to rename')
    } finally {
      setRenameLoading(false)
    }
  }

  const loadSubjectsIfNeeded = async () => {
    if ((subjects.users || []).length > 0 || (subjects.roles || []).length > 0) return
    try {
      const subjRes = await api.get('/folders/access/subjects')
      setSubjects({ users: subjRes.data?.data?.users || [], roles: subjRes.data?.data?.roles || [] })
    } catch {
    }
  }

  const resetCreateAccess = () => {
    setCreateAccessMode('PUBLIC')
    setCreateInheritPermissions(true)
    setCreateAccessEntries([])
    setCreateAccessError('')
    setCreateAccessLoading(false)
  }

  const applyCreateAccessToFolder = async (folderId) => {
    const payload = {
      accessMode: createAccessMode,
      inheritPermissions: createInheritPermissions,
      entries: createAccessEntries.map((e) => ({
        subjectType: e.subjectType,
        subjectId: e.subjectId,
        canView: Boolean(e.canView),
        canCreate: Boolean(e.canCreate),
        canEdit: Boolean(e.canEdit),
        canDelete: Boolean(e.canDelete),
        canDownload: Boolean(e.canDownload)
      }))
    }
    await api.put(`/folders/${folderId}/access`, payload)
  }

  // Get child folders of current folder
  const getChildFolders = (folderId) => {
    const fid = toFolderId(folderId)
    if (!fid) {
      return folders || []
    }
    
    // Find the folder and return its children
    const findChildren = (folderList) => {
      for (const folder of folderList) {
        if (toFolderId(folder.id) === fid) {
          return folder.children || []
        }
        if (folder.children && folder.children.length > 0) {
          const found = findChildren(folder.children)
          if (found !== null) return found
        }
      }
      return null
    }
    
    return findChildren(folders) || []
  }

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const hasSearch = Boolean(String(searchQuery || '').trim())
      const childFolders = getChildFolders(selectedFolder)
      const folderItems = hasSearch ? [] : childFolders.map(folder => ({
        id: `folder-${folder.id}`,
        folderId: folder.id,
        isFolder: true,
        fileCode: '-',
        fileName: folder.name,
        type: 'File folder',
        size: '-',
        lastModified: folder.createdAt ? formatDate(folder.createdAt) : '-',
        status: '-'
      }))

      if (!selectedFolder && !hasSearch) {
        setDocuments(folderItems)
        setTotalDocuments(0)
        return
      }

      const params = new URLSearchParams({
        page: currentPage,
        limit: pageSize
      })

      if (selectedFolder) params.append('folderId', selectedFolder)
      if (hasSearch) params.append('search', searchQuery.trim())
      if (selectedFolder && hasSearch) params.append('includeSubfolders', 'true')

      const res = await api.get(`/documents/published?${params}`)
      const combinedItems = [...folderItems, ...(res.data.data || [])]
      setDocuments(combinedItems)
      setTotalDocuments(res.data.pagination?.totalItems || 0)
    } catch (error) {
      console.error('Failed to load published documents:', error)
      setDocuments([])
      setTotalDocuments(0)
    } finally {
      setLoading(false)
    }
  }

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev =>
      prev.includes(folderId)
        ? prev.filter(f => f !== folderId)
        : [...prev, folderId]
    )
  }

  // Auto-expand folder tree to show the path to selected folder
  const expandPathToFolder = (folderId) => {
    const targetId = toFolderId(folderId)
    if (!targetId) return
    const findPathIds = (folders, targetId, path = []) => {
      for (const folder of folders) {
        const id = toFolderId(folder.id)
        const currentPath = [...path, id]
        if (id === targetId) {
          return currentPath.slice(0, -1) // Return all parent IDs, not including the target itself
        }
        if (folder.children && folder.children.length > 0) {
          const found = findPathIds(folder.children, targetId, currentPath)
          if (found) return found
        }
      }
      return null
    }
    
    const pathIds = findPathIds(folders, targetId)
    if (pathIds) {
      setExpandedFolders(prev => {
        // Add all parent folder IDs to expanded folders
        const newExpanded = new Set([...prev, ...pathIds])
        return Array.from(newExpanded)
      })
    }
  }

  const handleDownload = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, {
        responseType: 'blob'
      })
      
      const contentDisposition = res.headers?.['content-disposition'] || ''
      const contentTypeHeader = res.headers?.['content-type'] || ''
      const getFileNameFromContentDisposition = (value) => {
        const v = String(value || '')
        const mStar = v.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
        if (mStar && mStar[1]) {
          try {
            return decodeURIComponent(mStar[1].trim().replace(/^"|"$/g, ''))
          } catch {
            return mStar[1].trim().replace(/^"|"$/g, '')
          }
        }
        const m = v.match(/filename\s*=\s*("?)([^";]+)\1/i)
        if (m && m[2]) return m[2].trim()
        return null
      }

      const fallbackName = doc.fileName || doc.title || `document-${doc.id}`
      const downloadName = getFileNameFromContentDisposition(contentDisposition) || fallbackName
      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentTypeHeader || undefined }))
      const link = window.document.createElement('a')
      link.href = url
      link.setAttribute('download', downloadName)
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download document:', error)
      setAlertModal({ show: true, title: 'Error', message: 'Failed to download document', type: 'error' })
    }
  }

  const handleDownloadFolder = async (folder) => {
    try {
      const res = await api.get(`/folders/${folder.id}/download`, {
        responseType: 'blob'
      })

      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }))
      const link = window.document.createElement('a')
      link.href = url
      link.setAttribute('download', `${folder.name || 'folder'}.zip`)
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download folder:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to download folder', type: 'error' })
    }
  }
  
  const handleView = (doc) => {
    setSelectedDocument(doc)
    setShowViewModal(true)
  }
  
  const handleObsolete = (doc) => {
    if (!isAdmin) {
      setAlertModal({ show: true, title: 'Permission Denied', message: 'You do not have permission to obsolete documents. Only Admins can perform this action.', type: 'warning' })
      return
    }
    
    setSelectedDocument(doc)
    setActionType('OBSOLETE')
    setShowSupersedeObsoleteModal(true)
  }
  
  const handleSupersede = (doc) => {
    if (!isAdmin) {
      setAlertModal({ show: true, title: 'Permission Denied', message: 'You do not have permission to supersede documents. Only Admins can perform this action.', type: 'warning' })
      return
    }
    
    setSelectedDocument(doc)
    setActionType('SUPERSEDE')
    setShowSupersedeObsoleteModal(true)
  }
  
  const handleSupersedeObsoleteSubmit = () => {
    setAlertModal({ show: true, title: 'Success', message: 'Supersede/Obsolete request submitted successfully! It will go through review and approval.', type: 'success' })
    loadDocuments()
  }

  const handleDelete = async (doc) => {
    if (!isAdmin) {
      setAlertModal({ show: true, title: 'Permission Denied', message: 'You do not have permission to delete files. Only Admins can delete files.', type: 'warning' })
      return
    }
    
    setConfirmModal({
      show: true,
      title: 'Confirm Admin Delete',
      message: `Are you sure you want to permanently delete "${doc.fileName}"? This will remove the record from the database. This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/documents/${doc.id}/purge`)
          setAlertModal({ show: true, title: 'Success', message: `${doc.fileName} has been permanently deleted successfully`, type: 'success' })
          loadDocuments()
        } catch (error) {
          console.error('Failed to delete document:', error)
          setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to delete document', type: 'error' })
        }
      }
    })
  }

  const handleDeleteFolder = async (folderId, folderName) => {
    if (!isAdmin) {
      setAlertModal({ show: true, title: 'Permission Denied', message: 'You do not have permission to delete folders. Only Admins can delete folders.', type: 'warning' })
      return
    }

    setConfirmModal({
      show: true,
      title: 'Confirm Admin Delete',
      message: `Are you sure you want to permanently delete the folder "${folderName}" and everything inside it? This will remove folder and file records from the database. This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal({ show: false })
        try {
          await api.delete(`/folders/${folderId}/purge`)
          setAlertModal({ show: true, title: 'Success', message: `Folder "${folderName}" has been permanently deleted successfully`, type: 'success' })
          loadFolders()
          if (selectedFolder === folderId) {
            setSelectedFolder(null)
          }
        } catch (error) {
          console.error('Failed to delete folder:', error)
          setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to delete folder', type: 'error' })
        }
      }
    })
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'Please enter a folder name', type: 'warning' })
      return
    }

    try {
      setCreateAccessLoading(true)
      setCreateAccessError('')
      const resp = await api.post('/folders', { name: newFolderName })
      const createdFolder = resp?.data?.data?.folder
      const folderNameCopy = newFolderName
      setNewFolderName('')
      setShowCreateFolderModal(false)
      setAlertModal({ show: true, title: 'Success', message: `Folder "${folderNameCopy}" created successfully!`, type: 'success' })
      if (createdFolder?.id) {
        try {
          await applyCreateAccessToFolder(createdFolder.id)
        } catch (e) {
          setAlertModal({ show: true, title: 'Warning', message: e?.response?.data?.message || 'Folder created but failed to set access rules', type: 'warning' })
        }
      }
      await loadFolders()
      if (createdFolder?.id) {
        setSelectedFolder(createdFolder.id)
        setBreadcrumbs([{ id: null, name: 'Root' }, { id: createdFolder.id, name: createdFolder.name }])
        setCurrentPage(1)
      }
    } catch (error) {
      console.error('Failed to create folder:', error)
      setCreateAccessError(error.response?.data?.message || 'Failed to create folder')
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to create folder', type: 'error' })
    } finally {
      setCreateAccessLoading(false)
    }
  }

  const handleCreateSubFolder = async () => {
    if (!parentFolderForSub) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'Please select a parent folder', type: 'warning' })
      return
    }
    if (!newFolderName.trim()) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'Please enter a subfolder name', type: 'warning' })
      return
    }

    try {
      setCreateAccessLoading(true)
      setCreateAccessError('')
      const resp = await api.post('/folders', { 
        name: newFolderName,
        parentId: parentFolderForSub 
      })
      const createdFolder = resp?.data?.data?.folder
      const folderNameCopy = newFolderName
      setNewFolderName('')
      setParentFolderForSub(null)
      setShowCreateSubFolderModal(false)
      setAlertModal({ show: true, title: 'Success', message: `Subfolder "${folderNameCopy}" created successfully!`, type: 'success' })
      if (createdFolder?.id) {
        try {
          await applyCreateAccessToFolder(createdFolder.id)
        } catch (e) {
          setAlertModal({ show: true, title: 'Warning', message: e?.response?.data?.message || 'Subfolder created but failed to set access rules', type: 'warning' })
        }
      }
      await loadFolders()
      if (parentFolderForSub) {
        setExpandedFolders((prev) => prev.includes(parentFolderForSub) ? prev : [...prev, parentFolderForSub])
      }
      if (createdFolder?.id && selectedFolder === parentFolderForSub) {
        setCurrentPage(1)
      }
    } catch (error) {
      console.error('Failed to create subfolder:', error)
      setCreateAccessError(error.response?.data?.message || 'Failed to create subfolder')
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to create subfolder', type: 'error' })
    } finally {
      setCreateAccessLoading(false)
    }
  }

  const handleUploadFile = async (uploadData) => {
    try {
      const formData = new FormData()
      formData.append('folderId', uploadData.folderId)
      if (uploadData.description) formData.append('description', uploadData.description)
      if (uploadData.filesMeta) formData.append('filesMeta', JSON.stringify(uploadData.filesMeta))
      if (uploadData.expiryInfo) formData.append('expiryInfo', JSON.stringify(uploadData.expiryInfo))
      if (uploadData.allowReassign) formData.append('allowReassign', 'true')
      uploadData.files.forEach((file) => formData.append('files', file))

      const importResponse = await api.post('/documents/bulk-import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setShowUploadFileModal(false)
      const counts = importResponse?.data?.data?.counts
      const importedCount = counts?.imported ?? 0
      const failedCount = counts?.failed ?? 0
      const failedList = importResponse?.data?.data?.failed || []
      const failedPreview = failedList
        .slice(0, 5)
        .map((f) => `Line ${f.lineNumber || '-'} - ${f.fileName}: ${f.message}`)
        .join('\n')
      const msg = failedCount > 0
        ? `Imported ${importedCount} file(s). Rejected ${failedCount} file(s).${failedPreview ? `\n\n${failedPreview}` : ''}`
        : `Imported ${importedCount} file(s) successfully.`
      setAlertModal({ show: true, title: 'Success', message: msg, type: failedCount > 0 ? 'warning' : 'success' })

      const targetFolderId = toFolderId(uploadData.folderId)
      const list = await loadFolders()
      const findPathIds = (foldersList, targetId, path = []) => {
        for (const folder of foldersList) {
          const id = toFolderId(folder.id)
          const currentPath = [...path, id]
          if (id === targetId) return currentPath
          if (folder.children && folder.children.length > 0) {
            const found = findPathIds(folder.children, targetId, currentPath)
            if (found) return found
          }
        }
        return null
      }

      const fullPath = targetFolderId ? findPathIds(list || [], targetFolderId) : null
      if (fullPath && fullPath.length > 0) {
        setExpandedFolders((prev) => Array.from(new Set([...prev, ...fullPath])))
      } else if (targetFolderId) {
        setExpandedFolders((prev) => (prev.includes(targetFolderId) ? prev : prev.concat([targetFolderId])))
      }

      if (selectedFolder) {
        setBreadcrumbs(buildBreadcrumbsFrom(list || [], selectedFolder))
      }
    } catch (error) {
      console.error('Error:', error)
      console.error('Response:', error.response?.data)
      const status = error?.response?.status
      const apiMsg = error?.response?.data?.message
      const apiErrors = error?.response?.data?.errors
      const errMsg = String(error?.message || '')

      if (status === 409 && Array.isArray(apiErrors) && apiErrors.some((e) => e?.requestedFileCode && e?.suggestedFileCode)) {
        throw error
      }

      let message = apiMsg || t('bulk_import_upload_failed_generic')

      if (status === 413) {
        message = t('bulk_import_upload_failed_413')
      } else if (status === 400 && Array.isArray(apiErrors) && apiErrors.length > 0) {
        const preview = apiErrors
          .slice(0, 3)
          .map((e) => e?.message)
          .filter(Boolean)
          .join('\n')
        message = preview ? `${apiMsg || t('bulk_import_upload_failed_validation')}\n${preview}` : (apiMsg || t('bulk_import_upload_failed_validation'))
      } else if (!status && (errMsg.includes('ERR_HTTP2_PROTOCOL_ERROR') || errMsg.toLowerCase().includes('protocol error') || errMsg.toLowerCase().includes('network error'))) {
        message = t('bulk_import_upload_failed_http2')
      }

      setAlertModal({ show: true, title: 'Error', message, type: 'error' })
    }
  }

  // Pagination
  const totalPages = Math.ceil(totalDocuments / pageSize)
  const currentDocuments = documents

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
  }

  const openManageAccess = async (folder) => {
    setAccessFolder(folder)
    setAccessModalOpen(true)
    setAccessLoading(true)
    setAccessError('')
    try {
      const [cfgRes, subjRes] = await Promise.all([
        api.get(`/folders/${folder.id}/access`),
        api.get('/folders/access/subjects')
      ])
      const cfg = cfgRes.data?.data || {}
      setAccessMode(String(cfg.folder?.accessMode || 'PUBLIC').toUpperCase())
      setInheritPermissions(Boolean(cfg.folder?.inheritPermissions))
      const entries = (cfg.permissions || []).map((p) => {
        const subjectType = p.userId ? 'USER' : 'ROLE'
        const subjectId = p.userId || p.roleId
        const label = p.userId
          ? `${p.user?.email || ''}`.trim()
          : `${p.role?.displayName || p.role?.name || ''}`.trim()
        return {
          subjectType,
          subjectId,
          label,
          canView: Boolean(p.canView),
          canCreate: Boolean(p.canCreate),
          canEdit: Boolean(p.canEdit),
          canDelete: Boolean(p.canDelete),
          canDownload: Boolean(p.canDownload)
        }
      })
      setAccessEntries(entries)
      setSubjects({ users: subjRes.data?.data?.users || [], roles: subjRes.data?.data?.roles || [] })
    } catch (e) {
      setAccessError(e?.response?.data?.message || 'Failed to load folder access')
    } finally {
      setAccessLoading(false)
    }
  }

  const closeManageAccess = () => {
    setAccessModalOpen(false)
    setAccessFolder(null)
    setAccessLoading(false)
    setAccessError('')
    setAccessEntries([])
    setSubjects({ users: [], roles: [] })
  }

  const saveManageAccess = async () => {
    if (!accessFolder) return
    setAccessLoading(true)
    setAccessError('')
    try {
      const payload = {
        accessMode,
        inheritPermissions,
        entries: accessEntries.map((e) => ({
          subjectType: e.subjectType,
          subjectId: e.subjectId,
          canView: Boolean(e.canView),
          canCreate: Boolean(e.canCreate),
          canEdit: Boolean(e.canEdit),
          canDelete: Boolean(e.canDelete),
          canDownload: Boolean(e.canDownload)
        }))
      }
      await api.put(`/folders/${accessFolder.id}/access`, payload)
      closeManageAccess()
      await loadFolders()
      setAlertModal({ show: true, title: 'Saved', message: 'Folder access updated.', type: 'success' })
    } catch (e) {
      setAccessError(e?.response?.data?.message || 'Failed to save folder access')
    } finally {
      setAccessLoading(false)
    }
  }

  // Recursive component for rendering folder tree
  const FolderTreeItem = ({ folder, level = 0 }) => {
    const hasChildren = Boolean((folder.children && folder.children.length > 0) || (Number(folder.childrenCount) > 0))
    const isExpanded = expandedFolders.includes(folder.id)
    const isSelected = selectedFolder === folder.id
    const [showContextMenu, setShowContextMenu] = useState(false)
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })

    const handleContextMenu = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (folder?.canManage || folder?.canEdit || isAdmin) {
        setContextMenuPosition({ x: e.clientX, y: e.clientY })
        setShowContextMenu(true)
        setContextMenuFolder(folder.id)
      }
    }

    const handleClick = (e) => {
      e.stopPropagation()
      const id = toFolderId(folder.id)
      setSelectedFolder(id)
      setBreadcrumbs(buildBreadcrumbs(id))
      // Expand this folder when clicked
      if (hasChildren && !isExpanded) {
        toggleFolder(id)
      }
    }

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded cursor-pointer group relative ${
            isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : ''
          }`}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          style={{ paddingLeft: `${12 + level * 20}px` }}
        >
          <span className="text-gray-500">{level === 0 ? '📁' : '📂'}</span>
          <span className="flex-1">{folder.name}</span>
          <div className="flex items-center gap-1">
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleFolder(folder.id)
                }}
                className="p-1 rounded hover:bg-gray-200 transition-colors"
                aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
              >
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div>
            {(folder.children || []).length === 0 && folder.childrenCount > 0 ? (
              <div
                className="px-3 py-2 text-xs text-gray-500"
                style={{ paddingLeft: `${12 + (level + 1) * 20}px` }}
              >
                No accessible subfolders
              </div>
            ) : (
              folder.children.map((child) => (
                <FolderTreeItem key={child.id} folder={child} level={level + 1} />
              ))
            )}
          </div>
        )}

        {/* Right-click Context Menu */}
        {showContextMenu && contextMenuFolder === folder.id && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowContextMenu(false)}
            />
            <div 
              className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px]"
              style={{ 
                left: `${contextMenuPosition.x}px`, 
                top: `${contextMenuPosition.y}px` 
              }}
            >
              {folder?.canDownload && (
                <button
                  onClick={() => {
                    setShowContextMenu(false)
                    handleDownloadFolder(folder)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {t('download_folder')}
                </button>
              )}
              {(folder?.canEdit || folder?.canManage || isAdmin) && (
                <button
                  onClick={() => {
                    setShowContextMenu(false)
                    openRename('folder', folder.id, folder.name)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Rename
                </button>
              )}
              {folder?.canManage && (
                <button
                  onClick={() => {
                    setShowContextMenu(false)
                    openManageAccess(folder)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Manage Access
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => {
                    setShowContextMenu(false)
                    handleDeleteFolder(folder.id, folder.name)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete as Admin
                </button>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 bg-surface-muted">
      {/* Modal Components */}
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

      {renameModal.show && (
        <Modal onClose={closeRename} closeOnBackdrop size="sm">
          <ModalHeader
            title={renameModal.type === 'folder' ? 'Rename Folder' : 'Rename File'}
            subtitle={renameModal.currentName}
            onClose={closeRename}
          />
          <ModalBody className="space-y-3">
            {renameError ? (
              <AppSurface variant="muted" padding="md" className="border border-red-200 bg-red-50 text-sm text-red-700">
                {renameError}
              </AppSurface>
            ) : null}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">New name</label>
              <TextInput
                type="text"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                autoFocus
                disabled={renameLoading}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={closeRename} disabled={renameLoading}>
              {t('cancel')}
            </Button>
            <Button type="button" onClick={submitRename} disabled={renameLoading}>
              {renameLoading ? 'Saving...' : 'Save'}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {accessModalOpen && (
        <Modal onClose={closeManageAccess} closeOnBackdrop size="lg">
          <ModalHeader title="Folder Access" subtitle={accessFolder?.name || ''} onClose={closeManageAccess} />

          <ModalBody className="space-y-4">
            {accessError ? (
              <AppSurface variant="muted" padding="md" className="border border-red-200 bg-red-50 text-sm text-red-700">
                {accessError}
              </AppSurface>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-1">Access mode</label>
                <SelectField
                  value={accessMode}
                  onChange={(e) => setAccessMode(e.target.value)}
                  disabled={accessLoading}
                >
                  <option value="PUBLIC">Public (default)</option>
                  <option value="RESTRICTED">Restricted</option>
                </SelectField>
              </div>
              <div className="md:col-span-2 flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={Boolean(inheritPermissions)}
                    onChange={(e) => setInheritPermissions(e.target.checked)}
                    disabled={accessLoading || accessMode !== 'RESTRICTED'}
                    className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                  />
                  Inherit permissions from parent (if no explicit rule)
                </label>
              </div>
            </div>

            {accessMode === 'RESTRICTED' && (
              <AppSurface variant="panel" padding="none" className="overflow-hidden">
                <div className="px-4 py-3 bg-surface-muted flex items-center justify-between border-b border-border">
                  <div className="text-sm font-semibold text-ink">Rules</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setAccessEntries((prev) => prev.concat([{
                      subjectType: 'USER',
                      subjectId: subjects.users?.[0]?.id || null,
                      label: subjects.users?.[0]?.email || '',
                      canView: true,
                      canCreate: true,
                      canEdit: true,
                      canDelete: true,
                      canDownload: true
                    }]))}
                    disabled={accessLoading}
                  >
                    Add rule
                  </Button>
                </div>

                <div className="dms-scrollbar max-h-[360px] overflow-auto divide-y divide-border/70">
                  {accessEntries.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-ink-muted">No rules yet. Add at least one rule.</div>
                  ) : accessEntries.map((r, idx) => (
                    <div key={`${r.subjectType}-${r.subjectId}-${idx}`} className="px-4 py-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                      <div className="lg:col-span-4">
                        <SelectField
                          value={`${r.subjectType}:${r.subjectId || ''}`}
                          onChange={(e) => {
                            const [st, sid] = String(e.target.value).split(':')
                            const id = sid ? parseInt(sid, 10) : null
                            const label = st === 'ROLE'
                              ? (subjects.roles.find((x) => x.id === id)?.displayName || subjects.roles.find((x) => x.id === id)?.name || '')
                              : (subjects.users.find((x) => x.id === id)?.email || '')
                            setAccessEntries((prev) => prev.map((x, i) => i === idx ? { ...x, subjectType: st, subjectId: id, label } : x))
                          }}
                          disabled={accessLoading}
                        >
                          <optgroup label="Users">
                            {(subjects.users || []).map((u) => (
                              <option key={`U-${u.id}`} value={`USER:${u.id}`}>{u.email}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Roles">
                            {(subjects.roles || []).map((ro) => (
                              <option key={`R-${ro.id}`} value={`ROLE:${ro.id}`}>{ro.displayName || ro.name}</option>
                            ))}
                          </optgroup>
                        </SelectField>
                      </div>

                      <div className="lg:col-span-7 flex flex-wrap gap-3 text-sm text-ink-secondary">
                        {['View', 'Create', 'Edit', 'Delete', 'Download'].map((label) => {
                          const key = `can${label}`
                          return (
                            <label key={label} className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={Boolean(r[key])}
                                onChange={(e) => setAccessEntries((prev) => prev.map((x, i) => i === idx ? { ...x, [key]: e.target.checked } : x))}
                                disabled={accessLoading}
                                className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                              />
                              {label}
                            </label>
                          )
                        })}
                      </div>

                      <div className="lg:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setAccessEntries((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-sm text-red-600 hover:text-red-700 font-semibold"
                          disabled={accessLoading}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </AppSurface>
            )}
          </ModalBody>

          <ModalFooter>
            <Button type="button" variant="secondary" onClick={closeManageAccess} disabled={accessLoading}>
              Cancel
            </Button>
            <Button type="button" onClick={saveManageAccess} disabled={accessLoading}>
              {accessLoading ? 'Saving...' : 'Save'}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Left Sidebar - Folder Tree */}
      <div className="w-72 lg:w-80 xl:w-96 xl:shrink-0 bg-surface border-r border-border overflow-y-auto" data-tour-id="pub-folder-tree">
        <div className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink-secondary">{t('pub_folders')}</h3>
            <button
              type="button"
              onClick={async () => {
                const list = await loadFolders()
                if (selectedFolder) setBreadcrumbs(buildBreadcrumbsFrom(list || [], selectedFolder))
              }}
              className="p-2 rounded-2xl hover:bg-surface-muted text-ink-muted transition-colors"
              aria-label={t('refresh')}
              title={t('refresh')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 006.34 5.34L4 10m16 4l-2.34 4.66A8 8 0 0017.66 18.66L20 14" />
              </svg>
            </button>
          </div>
          <div className="space-y-1">
            {folders.map((folder) => (
              <FolderTreeItem key={folder.id} folder={folder} level={0} />
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 sm:p-4 lg:p-6">
          <PageHeader title={t('published_documents')} subtitle={t('pub_desc')} />

          {/* Action Buttons and Search */}
          <AppSurface padding="lg" className="mb-6" data-tour-id="pub-actions-card">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              {/* Breadcrumbs */}
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <span>›</span>}
                    {index === breadcrumbs.length - 1 ? (
                      <span className="font-medium text-ink">{crumb.name}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const id = toFolderId(crumb.id)
                          setSelectedFolder(id)
                          setBreadcrumbs(buildBreadcrumbs(id))
                          setCurrentPage(1)
                        }}
                        className="hover:text-ink hover:underline"
                      >
                        {crumb.name}
                      </button>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <PermissionGate module="documents.published" action="create">
                  <Button
                    onClick={async () => {
                      resetCreateAccess()
                      await loadSubjectsIfNeeded()
                      setShowCreateFolderModal(true)
                    }}
                    data-tour-id="pub-btn-create-folder"
                  >
                    {t('create_new_folder')}
                  </Button>
                </PermissionGate>
                <PermissionGate module="documents.published" action="create">
                  <Button
                    onClick={() => {
                      if (!hasAnyCreatableFolder) {
                        setAlertModal({ show: true, title: 'Access denied', message: 'You do not have permission to create folders here.', type: 'error' })
                        return
                      }
                      resetCreateAccess()
                      loadSubjectsIfNeeded()
                      setParentFolderForSub(toFolderId(selectedFolder))
                      setShowCreateSubFolderModal(true)
                    }}
                    data-tour-id="pub-btn-create-subfolder"
                    disabled={!hasAnyCreatableFolder}
                  >
                    {t('create_new_subfolder')}
                  </Button>
                </PermissionGate>
                <PermissionGate module="documents.published" action="create">
                  <Button
                    onClick={() => {
                      if (!selectedFolder) {
                        setAlertModal({ show: true, title: 'Folder required', message: 'Please select a folder first.', type: 'error' })
                        return
                      }
                      if (!canCreateInSelected) {
                        setAlertModal({ show: true, title: 'Access denied', message: 'You do not have permission to upload in this folder.', type: 'error' })
                        return
                      }
                      setShowUploadFileModal(true)
                    }}
                    data-tour-id="pub-btn-upload-import"
                    disabled={!selectedFolder || !canCreateInSelected}
                    title={!selectedFolder ? 'Select a folder first' : (!canCreateInSelected ? 'No upload permission' : '')}
                  >
                    {t('upload_file')}
                  </Button>
                </PermissionGate>
                {selectedFolder && canDownloadSelected && selectedFolderMeta && (
                  <Button
                    type="button"
                    onClick={() => handleDownloadFolder(selectedFolderMeta)}
                    variant="secondary"
                    className="border-brand text-brand hover:text-brand-hover"
                  >
                    {t('download_folder')}
                  </Button>
                )}
              </div>
            </div>

            {/* Search Bar */}
            <div className="mt-4 relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <TextInput
                type="text"
                placeholder={t('search_files')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
            </div>
          </AppSurface>

          {/* Documents Table */}
          <AppSurface padding="none" className="overflow-hidden" data-tour-id="pub-docs-table">
            <TableContainer className="rounded-none border-0">
              <Table>
                <thead className="bg-surface-muted">
                  <tr>
                    <Th>{t('file_code')}</Th>
                    <Th>{t('file_name')}</Th>
                    <Th>{t('type')}</Th>
                    <Th className="hidden lg:table-cell">{t('size')}</Th>
                    <Th className="hidden xl:table-cell">{t('last_modified')}</Th>
                    <Th className="hidden lg:table-cell">{t('status')}</Th>
                    <Th>{t('actions')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="py-10">
                        <div className="flex flex-col items-center gap-2">
                          <InlineSpinner className="h-8 w-8 border-2" />
                          <span className="text-sm text-ink-muted">{t('loading_documents')}</span>
                        </div>
                      </td>
                    </tr>
                  ) : currentDocuments.length === 0 ? (
                    <tr>
                      <td colSpan="7">
                        <EmptyState
                          message={searchQuery ? t('no_documents') : selectedFolder ? t('no_documents') : t('select_folder_view')}
                          description={searchQuery ? t('adjust_search') : selectedFolder ? t('no_published_in_folder') : t('click_folder_view')}
                          actionLabel={searchQuery ? t('clear_search') : selectedFolder ? t('upload_file') : null}
                          onAction={
                            searchQuery
                              ? () => setSearchQuery('')
                              : selectedFolder
                                ? () => {
                                    if (!canCreateInSelected) {
                                      setAlertModal({ show: true, title: 'Access denied', message: 'You do not have permission to upload in this folder.', type: 'error' })
                                      return
                                    }
                                    setShowUploadFileModal(true)
                                  }
                                : null
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    currentDocuments.map((doc) => (
                      <Tr
                        key={doc.id}
                        className="cursor-pointer"
                        onClick={() => {
                          if (doc.isFolder) {
                            setSelectedFolder(doc.folderId)
                            setBreadcrumbs(buildBreadcrumbs(doc.folderId))
                            expandPathToFolder(doc.folderId)
                            if (!expandedFolders.includes(doc.folderId)) {
                              setExpandedFolders(prev => [...prev, doc.folderId])
                            }
                          }
                        }}
                      >
                        <Td>
                          <span className="font-medium text-ink">{doc.fileCode || '-'}</span>
                        </Td>
                        <Td>
                          <div className="flex items-center">
                            <span className={doc.isFolder ? 'text-ink font-medium' : 'text-brand hover:text-brand-hover font-medium'}>
                              {doc.fileName}
                            </span>
                          </div>
                        </Td>
                        <Td>{doc.type}</Td>
                        <Td className="hidden lg:table-cell">{doc.size}</Td>
                        <Td className="hidden xl:table-cell text-sm">{doc.lastModified}</Td>
                        <Td className="hidden lg:table-cell py-3">
                          {doc.status !== '-' ? <StatusBadge status={doc.status} /> : <span className="text-ink-muted">-</span>}
                        </Td>
                        <Td className="py-3">
                          {!doc.isFolder ? (
                            <ActionMenu
                              actions={[
                                ...(hasPermission('documents.published', 'read')
                                  ? [
                                      ...(doc.canDownload ? [{ label: t('download'), onClick: () => handleDownload(doc) }] : []),
                                      { label: t('view'), onClick: () => handleView(doc) }
                                    ]
                                  : []
                                ),
                                ...(hasPermission('documents.published', 'update')
                                  ? [{ label: 'Rename', onClick: () => openRename('file', doc.id, doc.fileName) }]
                                  : []
                                ),
                                ...(hasPermission('documents.published', 'update') && !['OBSOLETE', 'SUPERSEDED'].includes(doc.status)
                                  ? [
                                      { label: t('obsolete_action'), onClick: () => handleObsolete(doc) },
                                      { label: t('supersede_action'), onClick: () => handleSupersede(doc) }
                                    ]
                                  : []
                                ),
                                ...(hasPermission('documents.published', 'delete')
                                  ? [
                                      ...(isAdmin ? [{ label: 'Delete as Admin', onClick: () => handleDelete(doc), variant: 'destructive' }] : [])
                                    ]
                                  : []
                                )
                              ]}
                            />
                          ) : null}
                        </Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableContainer>
          </AppSurface>

          {/* Pagination */}
          {!loading && totalDocuments > 0 && (
            <div className="mt-6">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalRecords={totalDocuments}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          )}
        </div>
      </div>

      {/* Create Folder Modal */}
      {showCreateFolderModal && (
        <Modal
          onClose={() => {
            setShowCreateFolderModal(false)
            setNewFolderName('')
            resetCreateAccess()
          }}
          closeOnBackdrop
          size="lg"
        >
          <ModalHeader
            title={t('create_new_folder')}
            onClose={() => {
              setShowCreateFolderModal(false)
              setNewFolderName('')
              resetCreateAccess()
            }}
          />

          <ModalBody className="space-y-4">
            {createAccessError ? (
              <AppSurface variant="muted" padding="md" className="border border-red-200 bg-red-50 text-sm text-red-700">
                {createAccessError}
              </AppSurface>
            ) : null}

            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                {t('folder_name_label')}
              </label>
              <TextInput
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t('enter_folder_name')}
                autoFocus
                disabled={createAccessLoading}
              />
            </div>

            <AppSurface variant="panel" padding="none" className="overflow-hidden">
              <div className="px-4 py-3 bg-surface-muted text-sm font-semibold text-ink border-b border-border">
                Access control
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink-secondary mb-1">Access mode</label>
                    <SelectField
                      value={createAccessMode}
                      onChange={(e) => setCreateAccessMode(e.target.value)}
                      disabled={createAccessLoading}
                    >
                      <option value="PUBLIC">Public (default)</option>
                      <option value="RESTRICTED">Restricted</option>
                    </SelectField>
                  </div>
                  <div className="md:col-span-2 flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
                      <input
                        type="checkbox"
                        checked={Boolean(createInheritPermissions)}
                        onChange={(e) => setCreateInheritPermissions(e.target.checked)}
                        disabled={createAccessLoading || createAccessMode !== 'RESTRICTED'}
                        className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                      />
                      Inherit permissions from parent (if no explicit rule)
                    </label>
                  </div>
                </div>

                {createAccessMode === 'RESTRICTED' && (
                  <AppSurface variant="panel" padding="none" className="overflow-hidden">
                    <div className="px-4 py-3 bg-surface-muted flex items-center justify-between border-b border-border">
                      <div className="text-sm font-semibold text-ink">Rules</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setCreateAccessEntries((prev) => prev.concat([{
                          subjectType: 'USER',
                          subjectId: subjects.users?.[0]?.id || null,
                          label: subjects.users?.[0]?.email || '',
                          canView: true,
                          canCreate: true,
                          canEdit: true,
                          canDelete: true,
                          canDownload: true
                        }]))}
                        disabled={createAccessLoading || ((subjects.users || []).length === 0 && (subjects.roles || []).length === 0)}
                      >
                        Add rule
                      </Button>
                    </div>
                    <div className="dms-scrollbar max-h-[280px] overflow-auto divide-y divide-border/70">
                      {createAccessEntries.length === 0 ? (
                        <div className="px-4 py-4 text-sm text-ink-muted">No rules yet. Add at least one rule.</div>
                      ) : createAccessEntries.map((r, idx) => (
                        <div key={`${r.subjectType}-${r.subjectId}-${idx}`} className="px-4 py-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                          <div className="lg:col-span-4">
                            <SelectField
                              value={`${r.subjectType}:${r.subjectId || ''}`}
                              onChange={(e) => {
                                const [st, sid] = String(e.target.value).split(':')
                                const id = sid ? parseInt(sid, 10) : null
                                const label = st === 'ROLE'
                                  ? (subjects.roles.find((x) => x.id === id)?.displayName || subjects.roles.find((x) => x.id === id)?.name || '')
                                  : (subjects.users.find((x) => x.id === id)?.email || '')
                                setCreateAccessEntries((prev) => prev.map((x, i) => i === idx ? { ...x, subjectType: st, subjectId: id, label } : x))
                              }}
                              disabled={createAccessLoading}
                            >
                              <optgroup label="Users">
                                {(subjects.users || []).map((u) => (
                                  <option key={`U-${u.id}`} value={`USER:${u.id}`}>{u.email}</option>
                                ))}
                              </optgroup>
                              <optgroup label="Roles">
                                {(subjects.roles || []).map((ro) => (
                                  <option key={`R-${ro.id}`} value={`ROLE:${ro.id}`}>{ro.displayName || ro.name}</option>
                                ))}
                              </optgroup>
                            </SelectField>
                          </div>

                          <div className="lg:col-span-7 flex flex-wrap gap-3 text-sm text-ink-secondary">
                            {['View', 'Create', 'Edit', 'Delete', 'Download'].map((label) => {
                              const key = `can${label}`
                              return (
                                <label key={label} className="inline-flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(r[key])}
                                    onChange={(e) => setCreateAccessEntries((prev) => prev.map((x, i) => i === idx ? { ...x, [key]: e.target.checked } : x))}
                                    disabled={createAccessLoading}
                                    className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                                  />
                                  {label}
                                </label>
                              )
                            })}
                          </div>

                          <div className="lg:col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setCreateAccessEntries((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-sm text-red-600 hover:text-red-700 font-semibold"
                              disabled={createAccessLoading}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AppSurface>
                )}
              </div>
            </AppSurface>
          </ModalBody>

          <ModalFooter className="flex-wrap justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowCreateFolderModal(false)
                setNewFolderName('')
                resetCreateAccess()
              }}
              disabled={createAccessLoading}
            >
              {t('cancel')}
            </Button>
            <Button type="button" onClick={handleCreateFolder} disabled={createAccessLoading}>
              {createAccessLoading ? <><InlineSpinner className="h-4 w-4 border-2 border-white/40 border-t-white" /><span>Creating...</span></> : t('create')}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Upload File Modal */}
      {showUploadFileModal && (
        <BulkImportModal
          isOpen={showUploadFileModal}
          onClose={() => setShowUploadFileModal(false)}
          onSubmit={handleUploadFile}
          folders={flatFolders.filter((f) => Boolean(f.canCreate))}
          selectedFolderId={selectedFolder}
        />
      )}

      {/* Create Sub Folder Modal */}
      {showCreateSubFolderModal && (
        <Modal
          onClose={() => {
            setShowCreateSubFolderModal(false)
            setNewFolderName('')
            setParentFolderForSub(null)
            resetCreateAccess()
          }}
          closeOnBackdrop
          size="lg"
        >
          <ModalHeader
            title={t('create_new_subfolder')}
            onClose={() => {
              setShowCreateSubFolderModal(false)
              setNewFolderName('')
              setParentFolderForSub(null)
              resetCreateAccess()
            }}
          />

          <ModalBody className="space-y-4">
            {createAccessError ? (
              <AppSurface variant="muted" padding="md" className="border border-red-200 bg-red-50 text-sm text-red-700">
                {createAccessError}
              </AppSurface>
            ) : null}

            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                {t('select_parent_folder')}
              </label>
              <SelectField
                value={parentFolderForSub ?? ''}
                onChange={(e) => setParentFolderForSub(toFolderId(e.target.value))}
                className="font-mono"
                disabled={createAccessLoading}
              >
                <option value="">{t('select_a_folder')}</option>
                {flatFolders.filter((f) => Boolean(f.canCreate)).map((folder) => (
                  <option key={folder.id} value={toFolderId(folder.id) ?? ''}>
                    {folder.icon} {folder.displayName}
                  </option>
                ))}
              </SelectField>

              {parentFolderForSub !== null ? (
                <div className="mt-2 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs font-semibold text-blue-900">{t('creating_subfolder_in')}</p>
                  <p className="mt-1 text-xs text-blue-700 font-mono">
                    {flatFolders.find((f) => toFolderId(f.id) === parentFolderForSub)?.path}
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                {t('subfolder_name')}
              </label>
              <TextInput
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t('enter_subfolder_name')}
              />
            </div>

            <AppSurface variant="panel" padding="none" className="overflow-hidden">
              <div className="px-4 py-3 bg-surface-muted text-sm font-semibold text-ink border-b border-border">
                Access control
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink-secondary mb-1">Access mode</label>
                    <SelectField
                      value={createAccessMode}
                      onChange={(e) => setCreateAccessMode(e.target.value)}
                      disabled={createAccessLoading}
                    >
                      <option value="PUBLIC">Public (default)</option>
                      <option value="RESTRICTED">Restricted</option>
                    </SelectField>
                  </div>
                  <div className="md:col-span-2 flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
                      <input
                        type="checkbox"
                        checked={Boolean(createInheritPermissions)}
                        onChange={(e) => setCreateInheritPermissions(e.target.checked)}
                        disabled={createAccessLoading || createAccessMode !== 'RESTRICTED'}
                        className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                      />
                      Inherit permissions from parent (if no explicit rule)
                    </label>
                  </div>
                </div>

                {createAccessMode === 'RESTRICTED' && (
                  <AppSurface variant="panel" padding="none" className="overflow-hidden">
                    <div className="px-4 py-3 bg-surface-muted flex items-center justify-between border-b border-border">
                      <div className="text-sm font-semibold text-ink">Rules</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setCreateAccessEntries((prev) => prev.concat([{
                          subjectType: 'USER',
                          subjectId: subjects.users?.[0]?.id || null,
                          label: subjects.users?.[0]?.email || '',
                          canView: true,
                          canCreate: true,
                          canEdit: true,
                          canDelete: true,
                          canDownload: true
                        }]))}
                        disabled={createAccessLoading || ((subjects.users || []).length === 0 && (subjects.roles || []).length === 0)}
                      >
                        Add rule
                      </Button>
                    </div>
                    <div className="dms-scrollbar max-h-[280px] overflow-auto divide-y divide-border/70">
                      {createAccessEntries.length === 0 ? (
                        <div className="px-4 py-4 text-sm text-ink-muted">No rules yet. Add at least one rule.</div>
                      ) : createAccessEntries.map((r, idx) => (
                        <div key={`${r.subjectType}-${r.subjectId}-${idx}`} className="px-4 py-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                          <div className="lg:col-span-4">
                            <SelectField
                              value={`${r.subjectType}:${r.subjectId || ''}`}
                              onChange={(e) => {
                                const [st, sid] = String(e.target.value).split(':')
                                const id = sid ? parseInt(sid, 10) : null
                                const label = st === 'ROLE'
                                  ? (subjects.roles.find((x) => x.id === id)?.displayName || subjects.roles.find((x) => x.id === id)?.name || '')
                                  : (subjects.users.find((x) => x.id === id)?.email || '')
                                setCreateAccessEntries((prev) => prev.map((x, i) => i === idx ? { ...x, subjectType: st, subjectId: id, label } : x))
                              }}
                              disabled={createAccessLoading}
                            >
                              <optgroup label="Users">
                                {(subjects.users || []).map((u) => (
                                  <option key={`U-${u.id}`} value={`USER:${u.id}`}>{u.email}</option>
                                ))}
                              </optgroup>
                              <optgroup label="Roles">
                                {(subjects.roles || []).map((ro) => (
                                  <option key={`R-${ro.id}`} value={`ROLE:${ro.id}`}>{ro.displayName || ro.name}</option>
                                ))}
                              </optgroup>
                            </SelectField>
                          </div>

                          <div className="lg:col-span-7 flex flex-wrap gap-3 text-sm text-ink-secondary">
                            {['View', 'Create', 'Edit', 'Delete', 'Download'].map((label) => {
                              const key = `can${label}`
                              return (
                                <label key={label} className="inline-flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(r[key])}
                                    onChange={(e) => setCreateAccessEntries((prev) => prev.map((x, i) => i === idx ? { ...x, [key]: e.target.checked } : x))}
                                    disabled={createAccessLoading}
                                    className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                                  />
                                  {label}
                                </label>
                              )
                            })}
                          </div>

                          <div className="lg:col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setCreateAccessEntries((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-sm text-red-600 hover:text-red-700 font-semibold"
                              disabled={createAccessLoading}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AppSurface>
                )}
              </div>
            </AppSurface>
          </ModalBody>

          <ModalFooter className="flex-wrap justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowCreateSubFolderModal(false)
                setNewFolderName('')
                setParentFolderForSub(null)
                resetCreateAccess()
              }}
              disabled={createAccessLoading}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleCreateSubFolder}
              disabled={createAccessLoading || parentFolderForSub === null || !String(newFolderName || '').trim()}
            >
              {createAccessLoading ? <><InlineSpinner className="h-4 w-4 border-2 border-white/40 border-t-white" /><span>Creating...</span></> : t('create')}
            </Button>
          </ModalFooter>
        </Modal>
      )}
      
      {/* Document Viewer Modal */}
      {showViewModal && selectedDocument && (
        <DocumentViewerModal
          document={selectedDocument}
          onClose={() => {
            setShowViewModal(false)
            setSelectedDocument(null)
          }}
        />
      )}
      
      {/* Supersede/Obsolete Modal */}
      {showSupersedeObsoleteModal && selectedDocument && (
        <SupersedeObsoleteModal
          isOpen={showSupersedeObsoleteModal}
          document={selectedDocument}
          actionType={actionType}
          onClose={() => {
            setShowSupersedeObsoleteModal(false)
            setSelectedDocument(null)
            setActionType(null)
          }}
          onSubmit={handleSupersedeObsoleteSubmit}
        />
      )}
    </div>
  )
}
