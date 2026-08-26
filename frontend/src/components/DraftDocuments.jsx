import React, { useState, useEffect, useMemo } from 'react'
import api from '../api/axios'
import NewDraftModal from './NewDraftModal'
import ReuploadFileModal from './ReuploadFileModal'
import UploadFileModal from './UploadFileModal'
import DocumentRemarksModal from './DocumentRemarksModal'
import DocumentViewerModal from './DocumentViewerModal'
import StatusBadge from './StatusBadge'
import ActionMenu from './ActionMenu'
import EmptyState from './EmptyState'
import Pagination from './Pagination'
import { PermissionGate } from './PermissionGate'
import { hasPermission } from '../utils/permissions'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import { usePreferences } from '../contexts/PreferencesContext'
import { useSearchParams, useNavigate } from 'react-router-dom'
import PageHeader from './ui/PageHeader'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import SelectField from './ui/SelectField'
import InlineSpinner from './ui/InlineSpinner'
import ColumnSettingsButton from './ui/ColumnSettingsButton'
import DataTableToolbar from './ui/DataTableToolbar'
import { Table, TableContainer, Td, Th, Tr } from './ui/Table'
import useTableFeatures from '../hooks/useTableFeatures'


export default function DraftDocuments() {
  const { itemsPerPage, formatDate, formatDateTime, defaultView, t, smartDocumentEnabled } = usePreferences()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [documents, setDocuments] = useState([])
  const [filteredDocuments, setFilteredDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage)
  const [viewMode, setViewMode] = useState(defaultView) // 'list' or 'grid'
  const [showModal, setShowModal] = useState(false)
  const [showReuploadModal, setShowReuploadModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [remarksModalOpen, setRemarksModalOpen] = useState(false)
  const [remarksLoading, setRemarksLoading] = useState(false)
  const [remarksDocument, setRemarksDocument] = useState(null)
  const [remarks, setRemarks] = useState([])
  const [returnFileViewerOpen, setReturnFileViewerOpen] = useState(false)
  const [returnFileDocument, setReturnFileDocument] = useState(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerDocument, setViewerDocument] = useState(null)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', confirmText: 'Confirm', onConfirm: null, variant: 'primary' })
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({
    show: false,
    document: null,
    password: '',
    passwordError: '',
    loading: false
  })
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  const isDraftStatus = (doc) => String(doc?.status || '').toUpperCase() === 'DRAFT'

  useEffect(() => {
    loadDocuments()
  }, [])

  // Filter and search documents
  useEffect(() => {
    let filtered = documents

    // Apply status filter
    if (statusFilter !== 'All') {
      filtered = filtered.filter(doc => doc.status === statusFilter)
    }

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(doc =>
        String(doc.fileCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(doc.title || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredDocuments(filtered)
    setCurrentPage(1)
  }, [documents, statusFilter, searchQuery])

  const hasAnyFileVersion = (doc) => {
    if (!doc) return false
    if (doc.hasFile === true) return true
    if (Array.isArray(doc.versions) && doc.versions.length > 0) return true
    if (doc.publishedVersionId) return true
    if (doc.latestVersion && (doc.latestVersion.filePath || doc.latestVersion.fileName)) return true
    return false
  }

  const extractLatestVersionForView = (doc) => {
    if (!doc) return null
    if (Array.isArray(doc.versions) && doc.versions.length > 0) {
      const pub = doc.versions.find(v => v && v.isPublished)
      if (pub) return pub
      return doc.versions[0]
    }
    if (doc.latestVersion) return doc.latestVersion
    return null
  }

  useEffect(() => {
    const docId = searchParams.get('docId')
    if (!docId || loading) return

    const matchedDocument = documents.find((doc) => String(doc.id) === String(docId))
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('docId')
    nextParams.delete('origin')

    if (matchedDocument) {
      setSelectedDocument(matchedDocument)
      if (hasAnyFileVersion(matchedDocument)) {
        // ✅ Smart template already generated file — open viewer (preview/download) instead of forcing upload
        const ver = extractLatestVersionForView(matchedDocument)
        setViewerDocument({
          id: matchedDocument.id,
          documentId: matchedDocument.id,
          versionId: ver?.id || null,
          fileCode: matchedDocument.fileCode,
          title: matchedDocument.title,
          version: matchedDocument.version,
          fileName: ver?.fileName || matchedDocument.title,
          mimeType: ver?.mimeType || null,
        })
        setViewerOpen(true)
      } else if (isDraftStatus(matchedDocument)) {
        setShowUploadModal(true)
      } else {
        setShowReuploadModal(true)
      }
      if (searchParams.get('origin') === 'project-tracking') {
        setAlertModal({
          show: true,
          title: 'Linked Draft Ready',
          message: 'The draft is already linked to Project Tracking. Upload the file here and continue the normal review and publish workflow on the same document record.',
          type: 'info'
        })
      }
      setSearchParams(nextParams, { replace: true })
      return
    }

    if (documents.length > 0) {
      setAlertModal({
        show: true,
        title: 'Draft Not Found',
        message: 'The linked draft could not be found in your current draft list.',
        type: 'warning'
      })
      setSearchParams(nextParams, { replace: true })
    }
  }, [documents, loading, searchParams, setSearchParams])

  const loadDocuments = async () => {
    try {
      const res = await api.get('/documents/drafts')
      const rawDocs = res.data.data || []
      
      // Transform data to match frontend format
      const docs = rawDocs.map(doc => {
        // Handle createdBy - could be string (from controller) or object (from raw API)
        let createdByName = 'Unknown'
        if (typeof doc.createdBy === 'string' && doc.createdBy) {
          createdByName = doc.createdBy
        } else if (doc.createdBy && typeof doc.createdBy === 'object') {
          createdByName = `${doc.createdBy.firstName || ''} ${doc.createdBy.lastName || ''}`.trim() || doc.createdBy.email || 'Unknown'
        } else if (typeof doc.owner === 'string' && doc.owner) {
          createdByName = doc.owner
        } else if (doc.owner && typeof doc.owner === 'object') {
          createdByName = `${doc.owner.firstName || ''} ${doc.owner.lastName || ''}`.trim() || doc.owner.email || 'Unknown'
        }
        
        return {
          id: doc.id,
          fileCode: doc.fileCode,
          title: doc.title,
          version: doc.version || '1.0',
          createdBy: createdByName,
          lastUpdated: doc.updatedAt 
            ? formatDate(doc.updatedAt)
            : formatDate(new Date()),
          status: doc.status,
          creationMode: doc.creationMode || 'FILE_BASED',
          isSmartDocument: doc.isSmartDocument === true
            || String(doc.creationMode || '').toUpperCase() === 'SMART_DOCUMENT'
            || Boolean(doc.smartTemplateVersionId),
          smartTemplateVersionId: doc.smartTemplateVersionId || null,
          smartTemplateName: doc.smartTemplateName || null,
          latestReturnRemark: doc.latestReturnRemark || null,
          latestReturnRemarkAt: doc.latestReturnRemarkAt || null,
          latestReturnRemarkBy: doc.latestReturnRemarkBy || null,
          latestReturnFileVersionId: doc.latestReturnFileVersionId || null,
          latestReturnFileName: doc.latestReturnFileName || null,
          latestReturnFileMimeType: doc.latestReturnFileMimeType || null,
          latestReturnFileUploadedAt: doc.latestReturnFileUploadedAt || null,
          hasFile: Boolean(doc.hasFile) || (Array.isArray(doc.versions) && doc.versions.length > 0) || Boolean(doc.publishedVersionId) || Boolean(doc.latestVersion?.filePath) || Boolean(doc.smartTemplateVersionId),
          versions: Array.isArray(doc.versions) ? doc.versions : [],
          latestVersion: doc.latestVersion || null,
          publishedVersionId: doc.publishedVersionId || null,
          hasReviewers: false,
          reviewerIds: [],
        }
      })
      
      setDocuments(docs)
      setFilteredDocuments(docs)
    } catch (error) {
      console.error('Failed to load documents:', error)
      console.error('Error details:', error.response?.data || error.message)
      setDocuments([])
      setFilteredDocuments([])
    } finally {
      setLoading(false)
    }
  }

  // Get unique statuses for filter
  const allStatuses = ['All', ...new Set(documents.map(doc => doc.status))]

  useEffect(() => { setCurrentPage(1) }, [filteredDocuments.length])

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize)
    setCurrentPage(1)
  }

  const handleReupload = (doc) => {
    setSelectedDocument(doc)
    setShowReuploadModal(true)
  }

  const handleUploadDraftFile = (doc) => {
    setSelectedDocument(doc)
    setShowUploadModal(true)
  }

  const handleOpenSmartEditor = (doc) => {
    if (!doc) return
    if (!smartDocumentEnabled) {
      setAlertModal({
        show: true,
        title: 'Smart Document Disabled',
        message: 'Smart Document feature is currently disabled by the system administrator.',
        type: 'warning'
      })
      return
    }
    if (!doc.isSmartDocument && !doc.smartTemplateVersionId) {
      setAlertModal({
        show: true,
        title: 'Not a Smart Document',
        message: 'This draft is not linked to a Smart Template. Use Reupload File for regular document drafts.',
        type: 'warning'
      })
      return
    }
    const latest = doc.latestVersion || (Array.isArray(doc.versions) && doc.versions[0]) || null
    let verId = latest?.id || null
    if (!verId && doc.publishedVersionId) verId = doc.publishedVersionId
    if (!verId && latest && latest.versionId) verId = latest.versionId
    if (verId) {
      navigate(`/smart-documents/edit/${doc.id}/${verId}`)
      return
    }
    setAlertModal({
      show: true,
      title: 'Version Not Found',
      message: 'Could not locate the document version record. Try opening the draft via View, or refresh the list and try again.',
      type: 'warning'
    })
  }

  const handleViewDraftDocument = (doc) => {
    if (smartDocumentEnabled && doc?.isSmartDocument && doc?.smartTemplateVersionId) {
      const latest = doc.latestVersion || (Array.isArray(doc.versions) && doc.versions[0]) || null
      let verId = latest?.id || null
      if (!verId && doc.publishedVersionId) verId = doc.publishedVersionId
      if (!verId && latest && latest.versionId) verId = latest.versionId
      if (verId) {
        navigate(`/smart-documents/edit/${doc.id}/${verId}`)
        return
      }
    }
    if (!hasAnyFileVersion(doc)) {
      if (doc?.isSmartDocument && !doc?.smartTemplateVersionId) {
        setAlertModal({
          show: true,
          title: 'Smart Draft Not Linked',
          message: 'This Smart Draft was created but not linked to a template. Click "Attach Template" in actions, or create a new Smart Draft.',
          type: 'warning'
        })
        return
      }
      setSelectedDocument(doc)
      setShowUploadModal(true)
      return
    }
    const ver = extractLatestVersionForView(doc)
    setViewerDocument({
      id: doc.id,
      documentId: doc.id,
      versionId: ver?.id || null,
      fileCode: doc.fileCode,
      title: doc.title,
      version: doc.version,
      fileName: ver?.fileName || doc.title,
      mimeType: ver?.mimeType || null,
    })
    setViewerOpen(true)
  }

  const hasReturnFile = (doc) => Boolean(doc?.latestReturnFileVersionId)

  const isPreviewableReturnFile = (doc) => {
    const mime = String(doc?.latestReturnFileMimeType || '').toLowerCase()
    const name = String(doc?.latestReturnFileName || '').toLowerCase()
    return (
      mime.includes('pdf') ||
      mime.includes('image/') ||
      mime.includes('officedocument.wordprocessingml') ||
      mime.includes('msword') ||
      name.endsWith('.pdf') ||
      name.endsWith('.docx') ||
      name.endsWith('.doc') ||
      name.endsWith('.png') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.gif') ||
      name.endsWith('.bmp')
    )
  }

  const handleViewReturnFile = (doc) => {
    if (!hasReturnFile(doc)) return
    setReturnFileDocument({
      id: doc.id,
      documentId: doc.id,
      versionId: doc.latestReturnFileVersionId,
      fileCode: doc.fileCode,
      title: `${doc.title} - Reviewed File`,
      version: doc.version,
      fileName: doc.latestReturnFileName
    })
    setReturnFileViewerOpen(true)
  }

  const handleDownloadReturnFile = async (doc) => {
    if (!hasReturnFile(doc)) return

    try {
      const res = await api.get(`/documents/${doc.id}/download`, {
        params: { versionId: doc.latestReturnFileVersionId },
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

      const fallbackName = doc.latestReturnFileName || `${doc.fileCode || 'reviewed-file'}`
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
      console.error('Failed to download reviewed file:', error)
      setAlertModal({
        show: true,
        title: t('failed_load_doc'),
        message: error.response?.data?.message || t('failed_load_doc'),
        type: 'error'
      })
    }
  }

  const formatLatestRemarkMeta = (doc) => {
    const parts = []
    if (doc?.latestReturnRemarkBy) parts.push(doc.latestReturnRemarkBy)
    if (doc?.latestReturnRemarkAt) parts.push(formatDateTime(doc.latestReturnRemarkAt))
    return parts.length > 0 ? ` (${parts.join(', ')})` : ''
  }

  const normalizeRemarkSnippet = (v) => String(v || '').replace(/\s+/g, ' ').trim()

  const handleViewRemarks = async (doc) => {
    if (!doc?.id) return
    setRemarksDocument(doc)
    setRemarks([])
    setRemarksLoading(true)
    setRemarksModalOpen(true)
    try {
      const res = await api.get(`/documents/${doc.id}/remarks?action=RETURNED`)
      const items = res.data?.data?.remarks || res.data?.remarks || []
      setRemarks(Array.isArray(items) ? items : [])
    } catch (error) {
      console.error('Failed to load remarks:', error)
      setRemarks([])
      setAlertModal({
        show: true,
        title: t('failed_load_doc'),
        message: error.response?.data?.message || t('failed_load_doc'),
        type: 'error'
      })
    } finally {
      setRemarksLoading(false)
    }
  }

  const handleNewDraftSubmit = async (formData, type) => {
    try {
      setLoading(true)

      if (type === 'review') {
        // Submit for review: create document, upload file, assign reviewers, submit
        const response = await api.post('/documents/drafts/submit-for-review', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
        
        setAlertModal({ show: true, title: 'Success', message: 'Document submitted for review successfully!', type: 'success' })
        setShowModal(false)
        await loadDocuments()
      } else {
        // Save as draft
        const response = await api.post('/documents/drafts', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
        
        setAlertModal({ show: true, title: 'Success', message: 'Draft saved successfully!', type: 'success' })
        setShowModal(false)
        await loadDocuments()
      }
    } catch (error) {
      console.error('Failed to submit draft:', error)
      setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to submit draft document', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const canDeleteDraft = (doc) => {
    if (!doc) return false
    const raw = String(doc.status || '').toUpperCase()
    const stageRaw = String(doc.stage || '').toUpperCase()
    const okStatus = [
      'DRAFT', 'DRAFTING',
      'ACKNOWLEDGED', 'PENDING_ACKNOWLEDGMENT', 'PENDING ACKNOWLEDGMENT',
      'RETURNED', 'RETURN FOR AMENDMENTS', 'NEEDS REVISION', 'NEEDS_REVISION',
      'REJECTED', 'REWORK'
    ]
    const stageOk = ['DRAFT', 'DRAFTING', 'RETURNED', 'PENDING_ACKNOWLEDGMENT']
    if (!okStatus.includes(raw) && !stageOk.includes(stageRaw)) return false
    return hasPermission('documents.draft', 'delete') || hasPermission('documents.draft', 'update') || hasPermission('newDocumentRequest', 'create')
  }

  const handleDeleteDraft = async () => {
    const doc = deleteConfirmModal.document
    if (!doc?.id) return
    const password = String(deleteConfirmModal.password || '').trim()
    if (!password) {
      setDeleteConfirmModal(prev => ({ ...prev, passwordError: 'Please enter your password to confirm deletion' }))
      return
    }
    setDeleteConfirmModal(prev => ({ ...prev, loading: true, passwordError: '' }))
    setLoading(true)
    try {
      await api.delete(`/documents/drafts/${doc.id}`, {
        data: { confirmPassword: password }
      })
      setDeleteConfirmModal({ show: false, document: null, password: '', passwordError: '', loading: false })
      setAlertModal({
        show: true,
        title: 'Draft Deleted',
        message: `Draft ${doc.fileCode ? `(${doc.fileCode}) ` : ''}has been permanently deleted. Related NDR records, file code, registry entries, and upload files have also been removed from the system.`,
        type: 'success'
      })
      await loadDocuments()
    } catch (error) {
      console.error('Failed to delete draft:', error)
      const errMsg = error.response?.data?.message || error.response?.data?.errors?.[0]?.message || 'Something went wrong while deleting the draft document.'
      if (errMsg.includes('password') || errMsg.includes('Password') || error.response?.status === 401) {
        setDeleteConfirmModal(prev => ({
          ...prev,
          loading: false,
          passwordError: errMsg
        }))
      } else {
        setDeleteConfirmModal({ show: false, document: null, password: '', passwordError: '', loading: false })
        setAlertModal({
          show: true,
          title: 'Failed to Delete Draft',
          message: errMsg,
          type: 'error'
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const askDeleteDraft = (doc) => {
    setDeleteConfirmModal({
      show: true,
      document: doc,
      password: '',
      passwordError: '',
      loading: false
    })
  }

  const draftTableColumns = [
    {
      id: 'fileCode',
      key: 'fileCode',
      accessor: 'fileCode',
      label: t('file_code'),
      sortable: true,
      required: true,
      render: (value, row) => (
        <a href="#" onClick={(e) => { e.preventDefault(); handleViewDraftDocument(row); }} className="font-medium text-ink hover:text-brand">
          {value}
        </a>
      )
    },
    {
      id: 'title',
      key: 'title',
      accessor: 'title',
      label: t('document_title_col'),
      sortable: true,
      required: true,
      render: (value) => <span className="text-ink">{value}</span>
    },
    {
      id: 'version',
      key: 'version',
      accessor: 'version',
      label: t('version'),
      sortable: true,
      align: 'center'
    },
    {
      id: 'createdBy',
      key: 'createdBy',
      accessor: 'createdBy',
      label: t('created_by'),
      sortable: true
    },
    {
      id: 'lastUpdated',
      key: 'lastUpdated',
      accessor: 'lastUpdated',
      label: t('last_updated'),
      sortable: true,
      sortType: 'date',
      sortComparer: (a, b) => new Date(a || 0) - new Date(b || 0)
    },
    {
      id: 'status',
      key: 'status',
      accessor: 'status',
      label: t('status'),
      sortable: true,
      render: (_v, row) => (
        <div className="space-y-1">
          <StatusBadge status={row.status} />
          {row.isSmartDocument ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Smart Draft
            </span>
          ) : null}
          {row.smartTemplateName ? (
            <p className="text-[11px] text-ink-muted truncate max-w-[220px]" title={`Template: ${row.smartTemplateName}`}>
              Template: {row.smartTemplateName}
            </p>
          ) : null}
          {row.latestReturnRemark && row.status === 'Return for Amendments' ? (
            <div className="space-y-1">
              <button
                onClick={() => handleViewRemarks(row)}
                className="block max-w-[240px] text-left text-xs text-brand hover:text-brand-hover underline underline-offset-2 truncate"
                title={`${t('latest_remark')}${formatLatestRemarkMeta(row)}: ${row.latestReturnRemark}`}
              >
                {t('latest_remark')}
                {formatLatestRemarkMeta(row)}: {normalizeRemarkSnippet(row.latestReturnRemark)}
              </button>
              {hasReturnFile(row) ? (
                <div className="flex flex-wrap gap-2">
                  {isPreviewableReturnFile(row) ? (
                    <button
                      onClick={() => handleViewReturnFile(row)}
                      className="text-xs text-brand hover:text-brand-hover underline underline-offset-2"
                    >
                      {t('view_reviewed_file')}
                    </button>
                  ) : null}
                  <button
                    onClick={() => handleDownloadReturnFile(row)}
                    className="text-xs text-brand hover:text-brand-hover underline underline-offset-2"
                  >
                    {t('download_reviewed_file')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )
    },
    {
      id: 'actions',
      key: 'actions',
      accessor: '__actions',
      label: t('actions'),
      required: true,
      align: 'right',
      stickyRight: true,
      render: (_v, row) => (
        <ActionMenu
          actions={[
            ...(hasAnyFileVersion(row)
              ? [{ label: 'View', onClick: () => handleViewDraftDocument(row) }]
              : []
            ),
            ...(isDraftStatus(row) && hasPermission('documents.draft', 'update') && (!row.isSmartDocument || !smartDocumentEnabled)
              ? [{ label: 'Upload File', onClick: () => handleUploadDraftFile(row) }]
              : []
            ),
            ...(row.status === 'Return for Amendments'
              ? [
                  ...(hasReturnFile(row) && isPreviewableReturnFile(row)
                    ? [{ label: t('view_reviewed_file'), onClick: () => handleViewReturnFile(row) }]
                    : []
                  ),
                  ...(hasReturnFile(row)
                    ? [{ label: t('download_reviewed_file'), onClick: () => handleDownloadReturnFile(row) }]
                    : []
                  ),
                ]
              : []
            ),
            ...(row.status === 'Return for Amendments'
              ? [{ label: t('view_remarks'), onClick: () => handleViewRemarks(row) }]
              : []
            ),
            ...(row.status === 'Return for Amendments' && hasPermission('documents.draft', 'update')
              ? [{ label: t('reupload_file'), onClick: () => handleReupload(row) }]
              : []
            ),
            ...(canDeleteDraft(row)
              ? [{ label: 'Delete', onClick: () => askDeleteDraft(row), destructive: true }]
              : []
            )
          ]}
        />
      )
    }
  ]

  const tableFeatures = useTableFeatures({
    tableId: 'draft-documents-list',
    columns: draftTableColumns,
    data: filteredDocuments,
    defaultSortKey: 'lastUpdated',
    defaultSortDirection: 'desc'
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

  // Pagination uses sorted + filtered data
  const totalPages = Math.ceil(sortedData.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const currentDocuments = sortedData.slice(startIndex, endIndex)

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
    <>
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false })}
      />

      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText="Cancel"
        type={confirmModal.variant || 'info'}
        onConfirm={() => {
          const cb = confirmModal.onConfirm
          setConfirmModal({ show: false, onConfirm: null })
          if (typeof cb === 'function') cb()
        }}
        onCancel={() => setConfirmModal({ show: false, onConfirm: null })}
      />

      {deleteConfirmModal.show && deleteConfirmModal.document ? (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-[95] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden animate-fadeIn">
            <div className="bg-red-600 px-6 py-4">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-white">Delete Draft Document</h3>
              </div>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                <p className="text-sm text-red-800 font-medium mb-2">
                  Permanently delete draft {deleteConfirmModal.document?.fileCode ? `(${deleteConfirmModal.document.fileCode})` : ''}
                </p>
                <p className="text-xs text-red-700 space-y-0.5">
                  <div className="font-semibold mb-1">This will remove:</div>
                  <div>• NDR / document record (Draft / Returned / Pending Acknowledgment)</div>
                  <div>• Assigned file code from CodeRegistry &amp; Document Register</div>
                  <div>• All uploaded versions and files on disk</div>
                  <div>• Workflow assignments, review comments, smart answers, audit logs</div>
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ink">
                  Enter your password to confirm <span className="text-red-600">*</span>
                </label>
                <TextInput
                  type="password"
                  placeholder="Type your account password..."
                  value={deleteConfirmModal.password}
                  onChange={(e) => setDeleteConfirmModal(prev => ({ ...prev, password: e.target.value, passwordError: '' }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !deleteConfirmModal.loading && deleteConfirmModal.password) {
                      handleDeleteDraft()
                    }
                  }}
                  autoFocus
                  className={deleteConfirmModal.passwordError ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}
                />
                {deleteConfirmModal.passwordError ? (
                  <p className="text-xs text-red-600">{deleteConfirmModal.passwordError}</p>
                ) : (
                  <p className="text-xs text-ink-muted">This action cannot be undone.</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmModal({ show: false, document: null, password: '', passwordError: '', loading: false })}
                disabled={deleteConfirmModal.loading}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDraft}
                disabled={deleteConfirmModal.loading || !String(deleteConfirmModal.password || '').trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {deleteConfirmModal.loading && (
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      ) : null}
      
      <NewDraftModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)}
        onSubmit={handleNewDraftSubmit}
      />
      
      <ReuploadFileModal
        isOpen={showReuploadModal}
        onClose={() => setShowReuploadModal(false)}
        document={selectedDocument}
        onSuccess={loadDocuments}
      />

      <UploadFileModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        document={selectedDocument}
        canManageAccess={hasPermission('projectTracking', 'manageConfidentialAccess')}
        onSuccess={loadDocuments}
      />

      <DocumentRemarksModal
        isOpen={remarksModalOpen}
        document={remarksDocument}
        remarks={remarks}
        loading={remarksLoading}
        onViewReviewedFile={isPreviewableReturnFile(remarksDocument) ? handleViewReturnFile : null}
        onDownloadReviewedFile={handleDownloadReturnFile}
        onClose={() => {
          setRemarksModalOpen(false)
          setRemarksDocument(null)
          setRemarks([])
          setRemarksLoading(false)
        }}
      />

      {returnFileViewerOpen && returnFileDocument ? (
        <DocumentViewerModal
          document={returnFileDocument}
          onClose={() => {
            setReturnFileViewerOpen(false)
            setReturnFileDocument(null)
          }}
        />
      ) : null}

      {viewerOpen && viewerDocument ? (
        <DocumentViewerModal
          document={viewerDocument}
          onClose={() => {
            setViewerOpen(false)
            setViewerDocument(null)
          }}
          onUploadNew={() => {
            setViewerOpen(false)
            setViewerDocument(null)
            setSelectedDocument(documents.find(d => String(d.id) === String(viewerDocument.documentId)) || null)
            setShowReuploadModal(true)
          }}
        />
      ) : null}
      
      <div className="space-y-6" data-tour-id="drafts-page">
      <PageHeader
        title={t('draft_documents')}
        subtitle={t('draft_docs_desc')}
      />

      {/* Document List */}
      <AppSurface padding="lg" data-tour-id="drafts-list-card">
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">{t('draft_docs_list')}</h2>
              <p className="text-sm text-ink-muted mt-1">
                {filteredDocuments.length} {t('documents_found')}
              </p>
            </div>
            
            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <PermissionGate module="documents.draft" action="create">
                <Button
                  onClick={() => setShowModal(true)}
                  data-tour-id="drafts-btn-new-draft"
                >
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('new_draft')}
                  </span>
                </Button>
              </PermissionGate>
            </div>
          </div>

          <DataTableToolbar rightSlot={<>
            <ColumnSettingsButton
              orderedColumns={orderedColumns}
              hiddenColumns={hiddenColumns}
              onToggleColumn={toggleColumnVisibility}
              onReset={resetTableSettings}
            />
            <div className="flex items-center gap-1.5 border border-gray-200 rounded-md p-0.5 bg-gray-50">
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'list' ? 'primary' : 'secondary'}
                onClick={() => setViewMode('list')}
                className="px-2"
                title="List View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'grid' ? 'primary' : 'secondary'}
                onClick={() => setViewMode('grid')}
                className="px-2"
                title="Grid View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </Button>
            </div>
          </>}>
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 min-w-0 relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <TextInput
                  type="text"
                  placeholder={t('search_docs_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="w-[280px] shrink-0">
                <SelectField
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {allStatuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </SelectField>
              </div>
            </div>
          </DataTableToolbar>
        </div>

        {/* Desktop Table (List View) */}
        {viewMode === 'list' && (
        <div className="hidden md:block">
          <TableContainer>
          <Table>
            <thead>
              <tr>
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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={Math.max(visibleColumns.length, 1)} className="py-10">
                    <div className="flex flex-col items-center gap-2">
                      <InlineSpinner />
                      <span className="text-sm text-ink-muted">{t('loading_documents')}</span>
                    </div>
                  </td>
                </tr>
              ) : currentDocuments.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(visibleColumns.length, 1)}>
                    <EmptyState 
                      message={t('no_draft_docs')} 
                      description={searchQuery || statusFilter !== 'All' ? t('adjust_filters') : t('start_creating_draft')}
                      actionLabel={searchQuery ? t('clear_search') : (hasPermission('documents.draft', 'create') ? t('new_draft') : null)}
                      onAction={searchQuery ? () => setSearchQuery('') : (hasPermission('documents.draft', 'create') ? () => setShowModal(true) : null)}
                    />
                  </td>
                </tr>
              ) : (
                currentDocuments.map((doc) => (
                  <Tr key={doc.id}>
                    {visibleColumns.map((col) => {
                      const id = col.id || col.key || col.accessor
                      const accessor = col.accessor || id
                      let value
                      if (typeof accessor === 'function') {
                        value = accessor(doc, col)
                      } else if (accessor === '__actions') {
                        value = null
                      } else {
                        value = doc?.[accessor]
                      }
                      const content = typeof col.render === 'function' ? col.render(value, doc) : (value != null ? value : '')
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
                ))
              )}
            </tbody>
          </Table>
          </TableContainer>
        </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && (
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading ? (
            <div className="col-span-full text-center py-10">
              <div className="flex flex-col items-center gap-2">
                <InlineSpinner />
                <span className="text-sm text-ink-muted">{t('loading_documents')}</span>
              </div>
            </div>
          ) : currentDocuments.length === 0 ? (
            <div className="col-span-full">
              <EmptyState 
                message={t('no_draft_docs')} 
                description={searchQuery || statusFilter !== 'All' ? t('adjust_filters') : t('start_creating_draft')}
                actionLabel={searchQuery ? t('clear_search') : (hasPermission('documents.draft', 'create') ? t('new_draft') : null)}
                onAction={searchQuery ? () => setSearchQuery('') : (hasPermission('documents.draft', 'create') ? () => setShowModal(true) : null)}
              />
            </div>
          ) : (
            currentDocuments.map((doc) => (
              <AppSurface key={doc.id} variant="interactive" padding="md" className="shadow-none hover:shadow-dms-soft" onClickCapture={(e) => { if (e.target.closest('button') || e.target.closest('[role="button"]')) return; handleViewDraftDocument(doc); }}>
                <div className="flex justify-between items-start mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-surface-muted border border-border flex items-center justify-center">
                    <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <ActionMenu
                    actions={[
                      ...(hasAnyFileVersion(doc)
                        ? [{ label: 'View', onClick: () => handleViewDraftDocument(doc) }]
                        : []
                      ),
                      ...(isDraftStatus(doc) && hasPermission('documents.draft', 'update') && (!doc.isSmartDocument || !smartDocumentEnabled)
                        ? [{ label: 'Upload File', onClick: () => handleUploadDraftFile(doc) }]
                        : []
                      ),
                      ...(doc.status === 'Return for Amendments'
                        ? [
                            ...(hasReturnFile(doc) && isPreviewableReturnFile(doc)
                              ? [{ label: t('view_reviewed_file'), onClick: () => handleViewReturnFile(doc) }]
                              : []
                            ),
                            ...(hasReturnFile(doc)
                              ? [{ label: t('download_reviewed_file'), onClick: () => handleDownloadReturnFile(doc) }]
                              : []
                            ),
                          ]
                        : []
                      ),
                      ...(doc.status === 'Return for Amendments'
                        ? [{ label: t('view_remarks'), onClick: () => handleViewRemarks(doc) }]
                        : []
                      ),
                      ...(doc.status === 'Return for Amendments' && hasPermission('documents.draft', 'update')
                        ? [{ label: t('reupload_file'), onClick: () => handleReupload(doc) }]
                        : []
                      ),
                      ...(canDeleteDraft(doc)
                        ? [
                            {
                              label: 'Delete',
                              onClick: () => askDeleteDraft(doc),
                              destructive: true,
                            }
                          ]
                        : []
                      )
                    ]}
                  />
                </div>
                <div className="space-y-1.5 mb-1">
                  <h3 className="font-medium text-ink text-sm truncate cursor-pointer" title={doc.title}>{doc.title}</h3>
                </div>
                <p className="text-xs text-brand font-mono mb-2 cursor-pointer" onClick={(e) => { e.preventDefault(); handleViewDraftDocument(doc); }}>{doc.fileCode}</p>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col gap-1">
                    <StatusBadge status={doc.status} />
                    {doc.isSmartDocument ? (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        Smart
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-ink-muted">v{doc.version}</span>
                </div>
                {hasAnyFileVersion(doc) ? (
                  <div className="mb-2 rounded-md bg-emerald-50 border border-emerald-100 px-2 py-1 text-[11px] text-emerald-800">
                    ✅ File siap — boleh view / download sebelum submit
                  </div>
                ) : (
                  <div className="mb-2 rounded-md bg-amber-50 border border-amber-100 px-2 py-1 text-[11px] text-amber-800">
                    ⚠️ Belum ada fail — sila upload fail dahulu
                  </div>
                )}
                {doc.latestReturnRemark && doc.status === 'Return for Amendments' ? (
                  <div className="space-y-1">
                    <button
                      onClick={() => handleViewRemarks(doc)}
                      className="w-full text-left text-xs text-brand hover:text-brand-hover underline underline-offset-2 truncate"
                      title={`${t('latest_remark')}${formatLatestRemarkMeta(doc)}: ${doc.latestReturnRemark}`}
                    >
                      {t('latest_remark')}
                      {formatLatestRemarkMeta(doc)}: {normalizeRemarkSnippet(doc.latestReturnRemark)}
                    </button>
                    {hasReturnFile(doc) ? (
                      <div className="flex flex-wrap gap-2">
                        {isPreviewableReturnFile(doc) ? (
                          <button
                            onClick={() => handleViewReturnFile(doc)}
                            className="text-xs text-brand hover:text-brand-hover underline underline-offset-2"
                          >
                            {t('view_reviewed_file')}
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleDownloadReturnFile(doc)}
                          className="text-xs text-brand hover:text-brand-hover underline underline-offset-2"
                        >
                          {t('download_reviewed_file')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="text-xs text-ink-muted">
                  <p>{t('by_author')} {doc.createdBy}</p>
                  <p>{doc.lastUpdated}</p>
                </div>
              </AppSurface>
            ))
          )}
        </div>
        )}

        {/* Mobile Cards */}
        <div className="md:hidden space-y-4">
          {loading ? (
            <div className="text-center py-10">
              <div className="flex flex-col items-center gap-2">
                <InlineSpinner />
                <span className="text-sm text-ink-muted">{t('loading_documents')}</span>
              </div>
            </div>
          ) : currentDocuments.length === 0 ? (
            <EmptyState 
              message={t('no_draft_docs')} 
              description={searchQuery || statusFilter !== 'All' ? t('adjust_filters') : t('start_creating_draft')}
              actionLabel={searchQuery ? t('clear_search') : (hasPermission('documents.draft', 'create') ? t('new_draft') : null)}
              onAction={searchQuery ? () => setSearchQuery('') : (hasPermission('documents.draft', 'create') ? () => setShowModal(true) : null)}
            />
          ) : (
            currentDocuments.map((doc) => (
              <AppSurface key={doc.id} variant="muted" padding="md" className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <a href="#" className="text-ink font-semibold hover:text-brand">
                      {doc.fileCode}
                    </a>
                    <div className="text-sm text-ink-secondary mt-1 truncate">{doc.title}</div>
                  </div>
                  <ActionMenu
                    actions={[
                      ...(hasAnyFileVersion(doc)
                        ? [{ label: 'View', onClick: () => handleViewDraftDocument(doc) }]
                        : []
                      ),
                      ...(isDraftStatus(doc) && hasPermission('documents.draft', 'update') && (!doc.isSmartDocument || !smartDocumentEnabled)
                        ? [{ label: 'Upload File', onClick: () => handleUploadDraftFile(doc) }]
                        : []
                      ),
                      ...(doc.status === 'Return for Amendments'
                        ? [
                            ...(hasReturnFile(doc) && isPreviewableReturnFile(doc)
                              ? [{ label: t('view_reviewed_file'), onClick: () => handleViewReturnFile(doc) }]
                              : []
                            ),
                            ...(hasReturnFile(doc)
                              ? [{ label: t('download_reviewed_file'), onClick: () => handleDownloadReturnFile(doc) }]
                              : []
                            ),
                          ]
                        : []
                      ),
                      ...(doc.status === 'Return for Amendments'
                        ? [{ label: t('view_remarks'), onClick: () => handleViewRemarks(doc) }]
                        : []
                      ),
                      ...(doc.status === 'Return for Amendments' && hasPermission('documents.draft', 'update')
                        ? [
                            { label: t('reupload_file'), onClick: () => handleReupload(doc) }
                          ]
                        : []
                      ),
                      ...(canDeleteDraft(doc)
                        ? [
                            {
                              label: 'Delete',
                              onClick: () => askDeleteDraft(doc),
                              destructive: true,
                            }
                          ]
                        : []
                      )
                    ]}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={doc.status} />
                  {doc.isSmartDocument ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                      Smart
                    </span>
                  ) : null}
                </div>
                {doc.latestReturnRemark && doc.status === 'Return for Amendments' ? (
                  <div className="space-y-1">
                    <button
                      onClick={() => handleViewRemarks(doc)}
                      className="w-full text-left text-xs text-brand hover:text-brand-hover underline underline-offset-2 truncate"
                      title={`${t('latest_remark')}${formatLatestRemarkMeta(doc)}: ${doc.latestReturnRemark}`}
                    >
                      {t('latest_remark')}
                      {formatLatestRemarkMeta(doc)}: {normalizeRemarkSnippet(doc.latestReturnRemark)}
                    </button>
                    {hasReturnFile(doc) ? (
                      <div className="flex flex-wrap gap-2">
                        {isPreviewableReturnFile(doc) ? (
                          <button
                            onClick={() => handleViewReturnFile(doc)}
                            className="text-xs text-brand hover:text-brand-hover underline underline-offset-2"
                          >
                            {t('view_reviewed_file')}
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleDownloadReturnFile(doc)}
                          className="text-xs text-brand hover:text-brand-hover underline underline-offset-2"
                        >
                          {t('download_reviewed_file')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-ink-muted">{t('version')}:</span>
                    <div className="text-ink font-medium">{doc.version}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('created_by')}:</span>
                    <div className="text-ink font-medium">{doc.createdBy}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">{t('last_updated')}:</span>
                    <div className="text-ink font-medium">{doc.lastUpdated}</div>
                  </div>
                </div>
              </AppSurface>
            ))
          )}
        </div>

      </AppSurface>

      {/* Pagination */}
      {!loading && filteredDocuments.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={filteredDocuments.length}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
    </>
  )
}
