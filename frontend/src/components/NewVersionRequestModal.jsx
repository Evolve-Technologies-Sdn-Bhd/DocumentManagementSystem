import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import useFileUploadSettings from '../hooks/useFileUploadSettings'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import AsyncActionStatus from './ui/AsyncActionStatus'
import useLoadingProgress from '../hooks/useLoadingProgress'

export default function NewVersionRequestModal({ onClose, onSubmit }) {
  // Use dynamic file upload settings
  const { validateFile } = useFileUploadSettings()
  const [documents, setDocuments] = useState([])
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [formData, setFormData] = useState({
    documentId: '',
    title: '',
    documentType: '',
    projectCategory: '',
    dateOfDocument: '',
    remarks: '',
    changeType: 'major'
  })
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [filteredDocuments, setFilteredDocuments] = useState([])
  const [error, setError] = useState('')
  const loadProgress = useLoadingProgress(loadingDocuments, { start: 20, max: 74, stepMs: 180 })
  const submitProgress = useLoadingProgress(loading)

  useEffect(() => {
    loadDocuments()
  }, [])

  // Filter documents based on search query
  useEffect(() => {
    if (searchQuery) {
      const filtered = documents.filter(doc =>
        doc.fileCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.projectCategory?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
      setFilteredDocuments(filtered)
    } else {
      setFilteredDocuments(documents)
    }
  }, [searchQuery, documents])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDropdown && !event.target.closest('.document-search')) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDropdown])

  const loadDocuments = async () => {
    setLoadingDocuments(true)
    try {
      // Fetch only published documents
      const res = await api.get('/documents', {
        params: {
          status: 'PUBLISHED',
          limit: 1000
        }
      })
      const docs = res.data.data || []
      
      // Map documents with all necessary information
      const publishedDocuments = docs.map(doc => ({
        id: doc.id,
        fileCode: doc.fileCode,
        title: doc.title,
        currentVersion: doc.version || '1.0',
        projectCategory: doc.projectCategory || null,
        documentType: doc.documentType || null
      }))
      
      setDocuments(publishedDocuments)
    } catch (error) {
      console.error('Failed to load documents:', error)
      setDocuments([])
      setError('Failed to load published documents')
    } finally {
      setLoadingDocuments(false)
    }
  }

  // Extract date from file code (e.g., MOM/01/251230/001 -> 30 Dec 2025)
  const extractDateFromFileCode = (fileCode) => {
    try {
      // File code format: TYPE/VERSION/YYMMDD/SEQ
      const parts = fileCode.split('/')
      if (parts.length >= 3) {
        const dateStr = parts[2] // YYMMDD format
        if (dateStr && dateStr.length === 6) {
          const yy = dateStr.substring(0, 2)
          const mm = dateStr.substring(2, 4)
          const dd = dateStr.substring(4, 6)
          
          // Convert YY to full year (assume 2000s)
          const year = `20${yy}`
          
          // Format as YYYY-MM-DD for date input
          return `${year}-${mm}-${dd}`
        }
      }
    } catch (error) {
      console.error('Error extracting date from file code:', error)
    }
    return '' // Return empty if extraction fails
  }

  const handleDocumentSelect = (doc) => {
    setError('')
    setSelectedDocument(doc)
    setSearchQuery(doc.fileCode)
    setShowDropdown(false)
    
    // Extract date from file code
    const extractedDate = extractDateFromFileCode(doc.fileCode)
    
    setFormData({
      documentId: doc.id,
      title: doc.title,
      documentType: doc.documentType?.name || '',
      projectCategory: doc.projectCategory?.name || '',
      dateOfDocument: extractedDate,
      remarks: '',
      changeType: 'major'
    })
  }

  const incrementSuffix = (suffix) => {
    const s = String(suffix || '').toLowerCase()
    if (!s) return 'a'
    const chars = s.split('')
    for (let i = chars.length - 1; i >= 0; i--) {
      if (chars[i] !== 'z') {
        chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1)
        return chars.join('')
      }
      chars[i] = 'a'
    }
    return `a${chars.join('')}`
  }

  const computeNewFileCode = (fileCode, changeType) => {
    const code = String(fileCode || '').trim()
    if (!code) return ''
    const parts = code.split('/')
    if (parts.length < 2) return code

    const seg = parts[1]
    const m = /^(\d+)([a-zA-Z]*)$/.exec(String(seg || '').trim())
    if (!m) return code

    const digitsStr = m[1]
    const suffix = m[2] || ''
    const digitsLen = Math.max(2, digitsStr.length)
    const n = parseInt(digitsStr, 10)
    if (Number.isNaN(n)) return code

    if (changeType === 'minor') {
      parts[1] = `${String(n).padStart(digitsLen, '0')}${incrementSuffix(suffix)}`
    } else {
      parts[1] = String(n + 1).padStart(digitsLen, '0')
    }

    return parts.join('/')
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = (file) => {
    // Validate file using dynamic settings
    const validation = validateFile(file)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    setError('')
    setSelectedFile(file)
  }

  const handleSubmitRequest = async () => {
    if (!formData.documentId || !formData.title || !formData.dateOfDocument) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)
    setError('')
    try {
      const formDataToSubmit = new FormData()
      formDataToSubmit.append('documentId', formData.documentId)
      formDataToSubmit.append('title', formData.title)
      formDataToSubmit.append('documentType', formData.documentType)
      formDataToSubmit.append('projectCategory', formData.projectCategory)
      formDataToSubmit.append('dateOfDocument', formData.dateOfDocument)
      formDataToSubmit.append('remarks', formData.remarks)
      formDataToSubmit.append('changeType', formData.changeType)
      
      if (selectedFile) {
        formDataToSubmit.append('file', selectedFile)
      }

      await onSubmit(formDataToSubmit)
      handleClose()
    } catch (error) {
      console.error('Error submitting version request:', error)
      setError(error.response?.data?.message || 'Failed to submit version request')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      documentId: '',
      title: '',
      documentType: '',
      projectCategory: '',
      dateOfDocument: '',
      remarks: '',
      changeType: 'major'
    })
    setSelectedDocument(null)
    setSelectedFile(null)
    setSearchQuery('')
    setShowDropdown(false)
    setError('')
    onClose()
  }

  return (
    <Modal onClose={loading ? undefined : handleClose} closeOnBackdrop={!loading} size="lg">
      <ModalHeader
        title="New Version Request (NVR)"
        subtitle="Request a new version for an existing controlled document."
        onClose={loading ? undefined : handleClose}
      />

      <ModalBody className="space-y-6">
            {loadingDocuments ? (
              <AsyncActionStatus
                title="Loading published documents"
                message="Available published documents are being prepared for version selection."
                progress={loadProgress}
                busy
              />
            ) : null}
            {loading ? (
              <AsyncActionStatus
                title="Submitting version request"
                message="Your request and optional file are being uploaded for acknowledgment."
                progress={submitProgress}
                busy
              />
            ) : null}
            {error ? (
              <AsyncActionStatus
                title="Unable to continue"
                message={error}
                tone="error"
              />
            ) : null}
            {/* Select Document (File Code Search) */}
            <div className="relative document-search">
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                Select Document (Search File Code) <span className="text-red-500">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowDropdown(true)
                  if (!e.target.value) {
                    setSelectedDocument(null)
                    setFormData({
                      documentId: '',
                      title: '',
                      documentType: '',
                      projectCategory: '',
                      dateOfDocument: '',
                      remarks: ''
                    })
                  }
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search file codes..."
              />
              
              {/* Dropdown for available documents */}
              {showDropdown && (
                <AppSurface padding="none" className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-2xl">
                  {filteredDocuments.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-ink-muted">No published documents found</div>
                  ) : (
                    filteredDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => handleDocumentSelect(doc)}
                        className="w-full text-left px-3 py-2 hover:bg-surface-muted transition-colors border-b border-border/70 last:border-0"
                      >
                        <div className="text-sm font-semibold text-ink">{doc.fileCode}</div>
                        <div className="text-xs text-ink-muted">{doc.title}</div>
                        {doc.projectCategory && (
                          <div className="text-xs text-brand mt-0.5">
                            {doc.projectCategory.name}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </AppSurface>
              )}
              {selectedDocument && (
                <p className="text-xs text-ink-muted mt-2">
                  <span className="font-semibold text-ink">New File Code will be:</span> {computeNewFileCode(selectedDocument.fileCode, formData.changeType)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                Change Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!selectedDocument}
                  onClick={() => setFormData({ ...formData, changeType: 'minor' })}
                  className={`p-3 rounded-lg border text-left transition-colors disabled:opacity-60 ${
                    formData.changeType === 'minor'
                      ? 'border-brand bg-blue-50/40'
                      : 'border-border hover:bg-surface-muted'
                  }`}
                >
                  <div className="text-sm font-semibold text-ink">Minor change</div>
                  <div className="text-xs text-ink-muted mt-1">01 → 01a, 01a → 01b (alphabet sequence)</div>
                </button>
                <button
                  type="button"
                  disabled={!selectedDocument}
                  onClick={() => setFormData({ ...formData, changeType: 'major' })}
                  className={`p-3 rounded-lg border text-left transition-colors disabled:opacity-60 ${
                    formData.changeType === 'major'
                      ? 'border-brand bg-blue-50/40'
                      : 'border-border hover:bg-surface-muted'
                  }`}
                >
                  <div className="text-sm font-semibold text-ink">Major change</div>
                  <div className="text-xs text-ink-muted mt-1">01 → 02 → 03 (numeric increment)</div>
                </button>
              </div>
            </div>

            {/* Document Title */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                Document Title <span className="text-red-500">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Document title"
                disabled={!selectedDocument}
                className={selectedDocument ? '' : 'bg-surface-muted'}
              />
            </div>

            {/* Document Type & Project Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">
                  Document Type
                </label>
                <TextInput
                  type="text"
                  value={formData.documentType}
                  disabled
                  className="bg-surface-muted text-ink-secondary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">
                  Project Category
                </label>
                <TextInput
                  type="text"
                  value={formData.projectCategory}
                  disabled
                  className="bg-surface-muted text-ink-secondary"
                />
              </div>
            </div>

            {/* Date of Document */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                Date of Document <span className="text-red-500">*</span>
              </label>
              <TextInput
                type="date"
                required
                value={formData.dateOfDocument}
                onChange={(e) => setFormData({ ...formData, dateOfDocument: e.target.value })}
                disabled={!selectedDocument}
                className={selectedDocument ? '' : 'bg-surface-muted'}
              />
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                Remarks
              </label>
              <TextArea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                placeholder="Input text"
                rows={3}
                disabled={!selectedDocument}
                className="resize-none"
              />
            </div>
      </ModalBody>

      <ModalFooter className="flex-wrap justify-end">
        <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmitRequest}
          disabled={loading || loadingDocuments || !formData.documentId || !formData.title || !formData.dateOfDocument}
          className="bg-purple-600 hover:bg-purple-700 text-white"
          loading={loading}
          loadingText={`Sending Request... ${submitProgress}%`}
        >
          Send Request
        </Button>
      </ModalFooter>
    </Modal>
  )
}
