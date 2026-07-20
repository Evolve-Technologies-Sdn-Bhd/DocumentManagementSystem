import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import { usePreferences } from '../contexts/PreferencesContext'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import SelectField from './ui/SelectField'
import AppSurface from './ui/AppSurface'
import InlineSpinner from './ui/InlineSpinner'
import AsyncActionStatus from './ui/AsyncActionStatus'
import useLoadingProgress from '../hooks/useLoadingProgress'

export default function ReviewDocumentModal({ document, onClose, onSubmit, isSubmitting = false, submitError = '' }) {
  const { t } = usePreferences()
  const [formData, setFormData] = useState({
    fileCode: document?.fileCode || '',
    documentTitle: document?.title || '',
    versionNo: document?.version || '',
    documentType: document?.documentType || document?.type || '',
    comments: '',
    reviewedFile: null,
    reviewDecision: '', // 'reviewed' or 'amendments'
    assignedApprover: null, // Only ONE approver can be assigned
    skipApproval: false
  })

  const [isDragging, setIsDragging] = useState(false)
  const [approversList, setApproversList] = useState([])
  const [loadingApprovers, setLoadingApprovers] = useState(true)
  const [formError, setFormError] = useState('')
  const submitProgress = useLoadingProgress(isSubmitting)

  // Fetch list of approvers from the API
  useEffect(() => {
    const fetchApprovers = async () => {
      try {
        setLoadingApprovers(true)
        const res = await api.get('/users')
        const users = res.data.data?.users || res.data.users || []
        
        // Get document owner ID to exclude from approvers
        const documentOwnerId = document?.submittedById || document?.createdById || document?.userId || document?.ownerId
        
        // Get current user ID (the reviewer) to exclude from approvers
        let currentUserId = null
        try {
          const userStr = localStorage.getItem('user')
          if (userStr) {
            const currentUser = JSON.parse(userStr)
            currentUserId = currentUser.id
          }
        } catch (error) {
          console.error('Error getting current user:', error)
        }
        
        // Filter users who have roles with Review/Approval permissions
        const approvers = users.filter(user => {
          // Exclude document owner from approvers list
          if (documentOwnerId && user.id === documentOwnerId) {
            return false
          }
          
          // Exclude current reviewer from approvers list (same person cannot review AND approve)
          if (currentUserId && user.id === currentUserId) {
            return false
          }
          
          const userRoles = user.roles || []

          return userRoles.some(userRole => {
            // Handle nested structure: roles: [{ role: { name: 'Approver', permissions: {...} } }]
            const role = userRole.role || {}
            const roleName = role.name || role.displayName || role.roleName || userRole.name || ''
            const permissions = role.permissions || {}

            // Check if role name matches - ONLY Approver or Administrator roles can approve
            const roleNameLower = roleName.toLowerCase()
            const isApproverRole = [
              'approver', 'administrator', 'admin'
            ].includes(roleNameLower)
            
            // Check if permissions object has reviewApproval with approve permission
            const hasApprovePermission = 
              permissions?.reviewApproval?.approve ||
              permissions?.['documents.reviewApproval']?.approve
            
            const matched = isApproverRole || hasApprovePermission

            return matched
          })
        })

        // Format for dropdown
        const formattedApprovers = approvers.map(user => ({
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
        }))
        
        setApproversList(formattedApprovers)
      } catch (error) {
        console.error('Failed to fetch approvers:', error)
        // Fallback to empty list
        setApproversList([])
      } finally {
        setLoadingApprovers(false)
      }
    }
    
    fetchApprovers()
  }, [])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    if (formError) setFormError('')
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCheckboxChange = (e) => {
    const { value, checked } = e.target
    if (formError) setFormError('')
    setFormData(prev => ({
      ...prev,
      reviewDecision: checked ? value : '',
      ...(checked && value === 'reviewed' ? {} : { assignedApprover: null, skipApproval: false })
    }))
  }

  const handleApproverSelect = (approverId) => {
    if (formError) setFormError('')
    setFormData(prev => ({
      ...prev,
      assignedApprover: approverId ? parseInt(approverId) : null
    }))
  }

  const handleSkipApprovalChange = (e) => {
    const checked = e.target.checked
    if (formError) setFormError('')
    setFormData(prev => ({
      ...prev,
      skipApproval: checked,
      ...(checked ? { assignedApprover: null } : {})
    }))
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (formError) setFormError('')
      setFormData(prev => ({ ...prev, reviewedFile: file }))
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      if (formError) setFormError('')
      setFormData(prev => ({ ...prev, reviewedFile: file }))
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Validation
    if (!formData.reviewDecision) {
      setFormError('Please select a review decision')
      return
    }

    // Require comments when returning for amendments
    if (formData.reviewDecision === 'amendments' && !formData.comments.trim()) {
      setFormError('Please provide comments explaining why the document needs amendments')
      return
    }

    // Require approver assignment when document is reviewed
    if (formData.reviewDecision === 'reviewed' && !formData.skipApproval && !formData.assignedApprover) {
      setFormError('Please assign an approver for the reviewed document')
      return
    }

    setFormError('')
    onSubmit(formData)
  }

  return (
    <Modal onClose={isSubmitting ? undefined : onClose} closeOnBackdrop={!isSubmitting} size="lg">
      <form onSubmit={handleSubmit}>
        <ModalHeader
          title={t('review_document')}
          subtitle={t('modal_draft_desc')}
          onClose={isSubmitting ? undefined : onClose}
        />

        <ModalBody className="space-y-4">
            {loadingApprovers ? (
              <AsyncActionStatus
                title="Loading approver options"
                message="Please wait while the approver list is being prepared."
                progress={32}
                busy
              />
            ) : null}
            {isSubmitting ? (
              <AsyncActionStatus
                title="Submitting review"
                message="Review decision, comments, and file updates are being processed."
                progress={submitProgress}
                busy
              />
            ) : null}
            {submitError || formError ? (
              <AsyncActionStatus
                title="Unable to continue"
                message={submitError || formError}
                tone="error"
              />
            ) : null}
            {/* File Code */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1">
                {t('file_code')}
              </label>
              <TextInput
                type="text"
                name="fileCode"
                value={formData.fileCode}
                onChange={handleInputChange}
                className="bg-surface-muted text-ink-secondary"
                readOnly
              />
            </div>

            {/* Document Title & Version */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-1">
                  {t('document_title_col')}
                </label>
                <TextInput
                  type="text"
                  name="documentTitle"
                  value={formData.documentTitle}
                  onChange={handleInputChange}
                  className="bg-surface-muted text-ink-secondary"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-1">
                  {t('version_revision')}
                </label>
                <TextInput
                  type="text"
                  name="versionNo"
                  value={formData.versionNo}
                  onChange={handleInputChange}
                  className="bg-surface-muted text-ink-secondary"
                  readOnly
                />
              </div>
            </div>

            {/* Document Type */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1">
                {t('doc_type')}
              </label>
              <TextInput
                type="text"
                name="documentType"
                value={formData.documentType}
                onChange={handleInputChange}
                className="bg-surface-muted text-ink-secondary"
                readOnly
              />
            </div>

            {/* Upload Reviewed Document */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                {t('upload_reviewed_doc')}
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className="rounded-[18px]"
              >
                <AppSurface
                  variant="muted"
                  padding="lg"
                  className={[
                    'border-2 border-dashed text-center transition-colors',
                    isDragging ? 'border-brand bg-blue-50/40' : 'border-border'
                  ].join(' ')}
                >
                  <div className="flex flex-col items-center">
                  <svg
                    className="w-12 h-12 text-ink-soft mb-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="text-ink font-medium mb-1">{t('drop_files_here')}</p>
                  <p className="text-xs text-ink-muted mb-3">{t('supported_format_docx')}</p>
                  <p className="text-xs text-ink-soft mb-2">{t('or_text')}</p>
                  <label className="cursor-pointer">
                    <span className="text-brand hover:text-brand-hover text-sm font-semibold underline underline-offset-2">
                      {t('browse_files')}
                    </span>
                    <input
                      type="file"
                      accept=".docx,.doc,.pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  {formData.reviewedFile && (
                    <div className="mt-3 text-sm text-ink-secondary">
                      {t('selected_colon')} <span className="font-medium">{formData.reviewedFile.name}</span>
                    </div>
                  )}
                </div>
                </AppSurface>
              </div>
            </div>

            {/* Review Decision */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                {t('review_decision')} <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    value="reviewed"
                    checked={formData.reviewDecision === 'reviewed'}
                    onChange={handleCheckboxChange}
                    className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                  />
                  <span className="ml-2 text-sm text-ink-secondary">{t('document_reviewed')}</span>
                </label>
                {formData.reviewDecision === 'reviewed' && (
                  <label className="flex items-center ml-6">
                    <input
                      type="checkbox"
                      checked={formData.skipApproval}
                      onChange={handleSkipApprovalChange}
                      className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                    />
                    <span className="ml-2 text-sm text-ink-secondary">{t('skip_approval_flow')}</span>
                  </label>
                )}
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    value="amendments"
                    checked={formData.reviewDecision === 'amendments'}
                    onChange={handleCheckboxChange}
                    className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                  />
                  <span className="ml-2 text-sm text-ink-secondary">{t('return_amendments')}</span>
                </label>
              </div>
            </div>

            {/* Comments / Review Notes - Always visible, but required for amendments */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1">
                {t('comments_review_notes')}
                {formData.reviewDecision === 'amendments' && <span className="text-red-500"> *</span>}
              </label>
              <TextArea
                name="comments"
                value={formData.comments}
                onChange={handleInputChange}
                placeholder={formData.reviewDecision === 'amendments' ? t('provide_reasons') : t('add_comments_optional')}
                rows="4"
                className="resize-vertical"
                invalid={formData.reviewDecision === 'amendments' && !formData.comments.trim()}
              />
            </div>

            {/* Assign Approver */}
            {formData.reviewDecision === 'reviewed' && !formData.skipApproval && (
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">
                  {t('assign_approver_label')}
                </label>
                <div className="flex items-center gap-3">
                  <SelectField
                    value={formData.assignedApprover || ''}
                    onChange={(e) => handleApproverSelect(e.target.value)}
                    disabled={loadingApprovers}
                  >
                    <option value="">
                      {loadingApprovers ? t('loading_approvers') : t('select_approver')}
                    </option>
                    {approversList.map((approver) => (
                      <option key={approver.id} value={approver.id}>
                        {approver.name}
                      </option>
                    ))}
                  </SelectField>
                  {loadingApprovers ? <InlineSpinner className="h-4 w-4 border-2" /> : null}
                </div>
                {approversList.length === 0 && !loadingApprovers && (
                  <p className="text-sm text-amber-700 mt-1">
                    {t('no_approvers_found')}
                  </p>
                )}
              </div>
            )}

        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={isSubmitting} loadingText={`Submitting... ${submitProgress}%`}>
            {t('submit')}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
