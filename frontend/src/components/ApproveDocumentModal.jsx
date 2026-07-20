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

export default function ApproveDocumentModal({ document, onClose, onSubmit, isSubmitting = false, submitError = '' }) {
  const { t } = usePreferences()
  // Determine if this is first or second approval based on document status and stage
  const isFirstApproval = 
    document?.status === 'PENDING_FIRST_APPROVAL' || 
    document?.status === 'IN_FIRST_APPROVAL' ||
    document?.status === 'Pending Approval' ||
    document?.stage === 'FIRST_APPROVAL' ||
    document?.stage === 'Approval'
  const isSecondApproval = 
    document?.status === 'PENDING_SECOND_APPROVAL' || 
    document?.status === 'IN_SECOND_APPROVAL' ||
    document?.stage === 'SECOND_APPROVAL'
  
  const [formData, setFormData] = useState({
    fileCode: document?.fileCode || '',
    documentTitle: document?.title || '',
    versionNo: document?.version || '',
    documentType: document?.documentType || document?.type || '',
    comments: '',
    approvedFile: null,
    approvalDecision: '', // 'approved' or 'amendments'
    assignedSecondApprover: null // Optional: Only if second approval is needed (first approval only)
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
        
        // Get current user ID (the first approver) to exclude from second approver list
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
        
        // Filter users who have roles with Approval permissions
        const approvers = users.filter(user => {
          // Exclude document owner from approvers list
          if (documentOwnerId && user.id === documentOwnerId) {
            return false
          }
          
          // Exclude current user (first approver) from second approver list
          if (currentUserId && user.id === currentUserId) {
            return false
          }
          
          const userRoles = user.roles || []
          
          return userRoles.some(userRole => {
            const role = userRole.role || {}
            const roleName = (role.name || userRole.name || '').toLowerCase()
            const permissions = role.permissions || {}
            
            // Only include users with Approver or Administrator roles
            const isApproverRole = ['approver', 'administrator', 'admin'].includes(roleName)
            const hasApprovalPermission = 
              permissions?.reviewApproval?.approve ||
              permissions?.['documents.reviewApproval']?.approve
            
            return isApproverRole || hasApprovalPermission
          })
        })
        
        const formattedApprovers = approvers.map(user => ({
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
        }))
        
        setApproversList(formattedApprovers)
      } catch (error) {
        console.error('Failed to fetch approvers:', error)
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
      approvalDecision: checked ? value : ''
    }))
  }

  const handleSecondApproverSelect = (approverId) => {
    if (formError) setFormError('')
    setFormData(prev => ({
      ...prev,
      assignedSecondApprover: approverId ? parseInt(approverId) : null
    }))
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (formError) setFormError('')
      setFormData(prev => ({ ...prev, approvedFile: file }))
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
      setFormData(prev => ({ ...prev, approvedFile: file }))
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Validation
    if (!formData.approvalDecision) {
      setFormError('Please select an approval decision')
      return
    }

    // Require comments when returning for amendments
    if (formData.approvalDecision === 'amendments' && !formData.comments.trim()) {
      setFormError('Please provide comments explaining why the document needs amendments')
      return
    }

    setFormError('')
    onSubmit(formData)
  }

  return (
    <Modal onClose={isSubmitting ? undefined : onClose} closeOnBackdrop={!isSubmitting} size="lg">
      <form onSubmit={handleSubmit}>
        <ModalHeader
          title={isFirstApproval ? t('first_approval') : isSecondApproval ? t('second_approval_title') : t('approve_document')}
          subtitle={isFirstApproval ? t('first_approval_desc') : isSecondApproval ? t('second_approval_desc') : t('approve_pub_desc')}
          onClose={isSubmitting ? undefined : onClose}
        />

        <ModalBody className="space-y-4">
            {loadingApprovers ? (
              <AsyncActionStatus
                title="Loading approver options"
                message="Please wait while available approvers are being prepared."
                progress={32}
                busy
              />
            ) : null}
            {isSubmitting ? (
              <AsyncActionStatus
                title="Submitting approval"
                message="Approval decision, comments, and file updates are being processed."
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

            {/* Upload Approved Document */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                {t('upload_approved_doc')}
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
                  {formData.approvedFile && (
                    <div className="mt-3 text-sm text-ink-secondary">
                      {t('selected_colon')} <span className="font-medium">{formData.approvedFile.name}</span>
                    </div>
                  )}
                </div>
                </AppSurface>
              </div>
            </div>

            {/* Approval Decision */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                {t('approval_decision')} <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    value="approved"
                    checked={formData.approvalDecision === 'approved'}
                    onChange={handleCheckboxChange}
                    className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                  />
                  <span className="ml-2 text-sm text-ink-secondary">{t('approve_document')}</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    value="amendments"
                    checked={formData.approvalDecision === 'amendments'}
                    onChange={handleCheckboxChange}
                    className="h-4 w-4 rounded border-border text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                  />
                  <span className="ml-2 text-sm text-ink-secondary">{t('return_amendments')}</span>
                </label>
              </div>
            </div>

            {/* Comments / Approval Notes - Always visible, but required for amendments */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1">
                {t('comments_approval_notes')}
                {formData.approvalDecision === 'amendments' && <span className="text-red-500"> *</span>}
              </label>
              <TextArea
                name="comments"
                value={formData.comments}
                onChange={handleInputChange}
                placeholder={formData.approvalDecision === 'amendments' ? t('provide_reasons') : t('add_comments_optional')}
                rows="4"
                className="resize-vertical"
                invalid={formData.approvalDecision === 'amendments' && !formData.comments.trim()}
              />
            </div>

            {/* Assign Second Approver (Optional) - Only show for first approval */}
            {isFirstApproval && (
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">
                  {t('assign_second_approver')}
                </label>
                <p className="text-xs text-ink-muted mb-2">
                  {t('second_approver_note')}
                </p>
                <div className="flex items-center gap-3">
                  <SelectField
                    value={formData.assignedSecondApprover || ''}
                    onChange={(e) => handleSecondApproverSelect(e.target.value)}
                    disabled={loadingApprovers}
                  >
                    <option value="">
                      {loadingApprovers ? t('loading_approvers') : t('no_second_approver')}
                    </option>
                    {approversList.map((approver) => (
                      <option key={approver.id} value={approver.id}>
                        {approver.name}
                      </option>
                    ))}
                  </SelectField>
                  {loadingApprovers ? <InlineSpinner className="h-4 w-4 border-2" /> : null}
                </div>
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
