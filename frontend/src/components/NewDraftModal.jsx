import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import useFileUploadSettings from '../hooks/useFileUploadSettings'
import { usePreferences } from '../contexts/PreferencesContext'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import SelectField from './ui/SelectField'
import InlineSpinner from './ui/InlineSpinner'

export default function NewDraftModal({ isOpen, onClose, onSubmit }) {
  // Use dynamic file upload settings
  const { validateFile, getAcceptString, getAllowedTypesDisplay } = useFileUploadSettings()
  const { t } = usePreferences()
  const [formData, setFormData] = useState({
    fileCode: '',
    title: '',
    versionNo: '',
    documentType: '',
    comments: '',
    reviewerId: null // Single reviewer instead of array
  })
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [documentTypes, setDocumentTypes] = useState([])
  const [loadingDocTypes, setLoadingDocTypes] = useState(true)
  const [acknowledgedDocs, setAcknowledgedDocs] = useState([])
  const [loadingAcknowledgedDocs, setLoadingAcknowledgedDocs] = useState(false)
  const [availableReviewers, setAvailableReviewers] = useState([])
  const [loadingReviewers, setLoadingReviewers] = useState(true)
  const [searchFileCode, setSearchFileCode] = useState('')
  const [showFileCodeDropdown, setShowFileCodeDropdown] = useState(false)

  // Load document types and reviewers when modal opens
  useEffect(() => {
    if (isOpen) {
      loadDocumentTypes()
      loadReviewers()
    }
  }, [isOpen])

  // Load acknowledged documents when document type changes
  useEffect(() => {
    if (formData.documentType) {
      loadAcknowledgedDocuments(formData.documentType)
    } else {
      setAcknowledgedDocs([])
    }
  }, [formData.documentType])

  const loadDocumentTypes = async () => {
    setLoadingDocTypes(true)
    try {
      const res = await api.get('/system/config/document-types')
      setDocumentTypes(res.data.data.documentTypes || [])
    } catch (error) {
      console.error('Failed to load document types:', error)
    } finally {
      setLoadingDocTypes(false)
    }
  }

  const loadAcknowledgedDocuments = async (documentType) => {
    setLoadingAcknowledgedDocs(true)
    try {
      // Fetch ACKNOWLEDGED documents (displayed as "Drafting")
      const res = await api.get('/documents/drafts', {
        params: {
          limit: 100
        }
      })

      const docs = res.data.data || res.data.documents || []

      // Filter by document type and valid file code
      const filtered = docs.filter(doc => {
        const hasValidFileCode = doc.fileCode && 
                                 !doc.fileCode.startsWith('PENDING-') && 
                                 doc.fileCode !== '-'
        
        // Match by document type name (backend returns documentType as string)
        const matchesType = doc.documentType === documentType

        return hasValidFileCode && matchesType
      })

      setAcknowledgedDocs(filtered)
    } catch (error) {
      console.error('Failed to load documents:', error)
      setAcknowledgedDocs([])
    } finally {
      setLoadingAcknowledgedDocs(false)
    }
  }

  const loadReviewers = async () => {
    setLoadingReviewers(true)
    try {
      const res = await api.get('/users')
      const users = res.data.data?.users || res.data.users || []
      
      // Get current user ID
      const currentUserId = getCurrentUserId()
      
      // Filter only active users and exclude current user (document owner)
      const activeUsers = users.filter(user => 
        user.status === 'ACTIVE' && user.id !== currentUserId
      )
      setAvailableReviewers(activeUsers)
    } catch (error) {
      console.error('Failed to load reviewers:', error)
      setAvailableReviewers([])
    } finally {
      setLoadingReviewers(false)
    }
  }

  // Get current user ID
  const getCurrentUserId = () => {
    try {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const user = JSON.parse(userStr)
        return user.id
      }
    } catch (error) {
      console.error('Error getting current user:', error)
    }
    return null
  }

  const handleFileCodeSelect = (doc) => {
    setFormData({
      ...formData,
      fileCode: doc.fileCode,
      title: doc.title,
      versionNo: doc.version || '1.0',
      documentType: doc.documentType
    })
    setSearchFileCode(doc.fileCode)
    setShowFileCodeDropdown(false)
  }

  const handleReviewerSelect = (userId) => {
    setFormData({ ...formData, reviewerId: userId })
  }

  const filteredAcknowledgedDocs = acknowledgedDocs.filter(doc =>
    doc.fileCode.toLowerCase().includes(searchFileCode.toLowerCase()) ||
    doc.title.toLowerCase().includes(searchFileCode.toLowerCase())
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFileCodeDropdown && !event.target.closest('.file-code-search')) {
        setShowFileCodeDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFileCodeDropdown])

  if (!isOpen) return null

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
      alert(validation.error)
      return
    }

    setSelectedFile(file)
  }

  const handleSaveAsDraft = async () => {
    setLoading(true)
    try {
      const formDataToSubmit = new FormData()
      formDataToSubmit.append('fileCode', formData.fileCode)
      formDataToSubmit.append('title', formData.title)
      formDataToSubmit.append('versionNo', formData.versionNo)
      formDataToSubmit.append('documentType', formData.documentType)
      formDataToSubmit.append('comments', formData.comments)
      formDataToSubmit.append('status', 'Draft')
      if (selectedFile) {
        formDataToSubmit.append('file', selectedFile)
      }

      await onSubmit(formDataToSubmit, 'draft')
      handleClose()
    } catch (error) {
      console.error('Error saving draft:', error)
      alert('Failed to save draft')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitForReview = async () => {
    if (!selectedFile) {
      alert('Please upload a document file')
      return
    }

    setLoading(true)
    try {
      const formDataToSubmit = new FormData()
      formDataToSubmit.append('fileCode', formData.fileCode)
      formDataToSubmit.append('title', formData.title)
      formDataToSubmit.append('versionNo', formData.versionNo)
      formDataToSubmit.append('documentType', formData.documentType)
      formDataToSubmit.append('comments', formData.comments)
      formDataToSubmit.append('reviewers', JSON.stringify([formData.reviewerId]))
      formDataToSubmit.append('status', 'Ready for Review')
      formDataToSubmit.append('file', selectedFile)

      await onSubmit(formDataToSubmit, 'review')
      handleClose()
    } catch (error) {
      console.error('Error submitting for review:', error)
      alert('Failed to submit for review')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      fileCode: '',
      title: '',
      versionNo: '',
      documentType: '',
      comments: '',
      reviewerId: null
    })
    setSelectedFile(null)
    setSearchFileCode('')
    onClose()
  }

  return (
    <Modal onClose={handleClose} closeOnBackdrop size="md" className="overflow-hidden" data-tour-id="new-draft-modal">
      <ModalHeader
        title={t('new_draft_doc')}
        subtitle={t('modal_draft_desc')}
        onClose={handleClose}
      />

      <ModalBody className="space-y-4">
            {/* File Code */}
            <div className="relative file-code-search">
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                {t('file_code')} <span className="text-red-500">*</span>
              </label>
              <TextInput
                type="text"
                required
                value={searchFileCode}
                onChange={(e) => {
                  const value = e.target.value
                  setSearchFileCode(value)
                  setShowFileCodeDropdown(true)
                  setFormData(prev => {
                    if (!value) return { ...prev, fileCode: '', title: '', versionNo: '' }
                    return { ...prev, fileCode: value }
                  })
                }}
                onFocus={() => setShowFileCodeDropdown(true)}
                placeholder={t('search_file_codes')}
                disabled={!formData.documentType}
              />
              {!formData.documentType && (
                <p className="text-xs text-amber-700 mt-1">{t('select_doc_type_first')}</p>
              )}
              
              {/* Dropdown for available documents */}
              {showFileCodeDropdown && formData.documentType && (
                <AppSurface padding="none" className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-2xl">
                  {loadingAcknowledgedDocs ? (
                    <div className="px-3 py-2 text-sm text-ink-muted">{t('loading_ellipsis')}</div>
                  ) : filteredAcknowledgedDocs.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-ink-muted">{t('no_file_codes_found')}</div>
                  ) : (
                    filteredAcknowledgedDocs.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => handleFileCodeSelect(doc)}
                        className="w-full text-left px-3 py-2 hover:bg-surface-muted transition-colors border-b border-border/70 last:border-0"
                      >
                        <div className="text-sm font-semibold text-ink">{doc.fileCode}</div>
                        <div className="text-xs text-ink-muted">{doc.title}</div>
                        {doc.projectCategory && (
                          <div className="text-xs text-brand mt-0.5">
                            {t('project_cat_label')} {doc.projectCategory.name}
                          </div>
                        )}
                        <div className="text-xs text-ink-soft">{t('version_label')} {doc.version}</div>
                      </button>
                    ))
                  )}
                </AppSurface>
              )}
            </div>

            {/* Document Title & Version */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">
                  {t('document_title_col')} <span className="text-red-500">*</span>
                </label>
                <TextInput
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('input_text')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">
                  {t('version_revision')}
                </label>
                <TextInput
                  type="text"
                  value={formData.versionNo}
                  onChange={(e) => setFormData({ ...formData, versionNo: e.target.value })}
                  placeholder={t('input_text')}
                />
              </div>
            </div>

            {/* Document Type & Comments */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">
                  {t('doc_type')} <span className="text-red-500">*</span>
                </label>
                <SelectField
                  required
                  value={formData.documentType}
                  onChange={(e) => setFormData({ ...formData, documentType: e.target.value })}
                  data-tour-id="new-draft-doc-type"
                  disabled={loadingDocTypes}
                >
                  <option value="">{loadingDocTypes ? t('loading_ellipsis') : t('select_doc_type')}</option>
                  {documentTypes.map((type) => (
                    <option key={type.id} value={type.name}>
                      {type.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">
                  {t('comments_notes')}
                </label>
                <TextArea
                  value={formData.comments}
                  onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                  placeholder={t('input_text')}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>

            {/* Upload Draft Document */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                {t('upload_draft_doc')}
              </label>
              <div
                className="rounded-[18px]"
                data-tour-id="new-draft-upload"
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <AppSurface
                  variant="muted"
                  padding="lg"
                  className={[
                    'border-2 border-dashed text-center transition-colors',
                    dragActive ? 'border-brand bg-blue-50/40' : 'border-border'
                  ].join(' ')}
                >
                {selectedFile ? (
                  <div className="space-y-2">
                    <svg className="w-12 h-12 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-semibold text-ink">{selectedFile.name}</p>
                    <p className="text-xs text-ink-muted">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="text-sm text-red-600 hover:text-red-700 font-semibold underline underline-offset-2"
                    >
                      {t('remove_file')}
                    </button>
                  </div>
                ) : (
                  <>
                    <svg className="w-12 h-12 text-ink-soft mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm font-semibold text-ink mb-1">{t('drop_files_here')}</p>
                    <p className="text-xs text-ink-muted mb-4">{t('supported_formats')} {getAllowedTypesDisplay()}</p>
                    <p className="text-xs text-ink-soft mb-4">{t('or_text')}</p>
                    <label className="cursor-pointer">
                      <span className="text-sm text-brand hover:text-brand-hover font-semibold underline underline-offset-2">
                        {t('browse_files')}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept={getAcceptString()}
                        onChange={handleFileInput}
                      />
                    </label>
                  </>
                )}
                </AppSurface>
              </div>
            </div>

            {/* Assign Reviewer */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                {t('assign_reviewer_label')} <span className="text-red-500">*</span>
              </label>
              <AppSurface variant="muted" padding="md" className="max-h-48 overflow-y-auto" data-tour-id="new-draft-assign-reviewer">
                {loadingReviewers ? (
                  <div className="flex items-center gap-2 text-sm text-ink-muted">
                    <InlineSpinner className="h-4 w-4 border-2" />
                    <span>{t('loading_reviewers')}</span>
                  </div>
                ) : availableReviewers.length === 0 ? (
                  <div className="text-sm text-ink-muted">{t('no_reviewers')}</div>
                ) : (
                  <div className="space-y-2">
                    {availableReviewers.map((reviewer) => (
                      <label
                        key={reviewer.id}
                        className={`flex items-start space-x-3 p-2 rounded-2xl cursor-pointer transition-colors ${
                          formData.reviewerId === reviewer.id 
                            ? 'bg-white border border-brand/20 shadow-dms-soft' 
                            : 'hover:bg-white/70'
                        }`}
                      >
                        <input
                          type="radio"
                          name="reviewer"
                          checked={formData.reviewerId === reviewer.id}
                          onChange={() => handleReviewerSelect(reviewer.id)}
                          className="mt-1 h-4 w-4 text-brand border-border focus-visible:ring-2 focus-visible:ring-brand/30"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-ink">
                            {reviewer.firstName && reviewer.lastName
                              ? `${reviewer.firstName} ${reviewer.lastName}`
                              : reviewer.email}
                          </div>
                          {reviewer.position && (
                            <div className="text-xs text-ink-muted">{reviewer.position}</div>
                          )}
                          {reviewer.department && (
                            <div className="text-xs text-ink-muted">{reviewer.department}</div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </AppSurface>
              <p className="text-xs text-ink-muted mt-1">
                {formData.reviewerId ? t('reviewer_selected') : t('select_reviewer')}
              </p>
            </div>
      </ModalBody>

      <ModalFooter className="flex-wrap justify-end">
        <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
          {t('cancel')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleSaveAsDraft}
          disabled={loading || !formData.fileCode || !formData.title || !formData.documentType}
        >
          {t('save_as_draft')}
        </Button>
        <Button
          type="button"
          onClick={handleSubmitForReview}
          disabled={loading || !formData.fileCode || !formData.title || !formData.documentType || !selectedFile || !formData.reviewerId}
          data-tour-id="new-draft-submit-review"
        >
          {loading ? t('submitting') : t('submit_for_review')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
