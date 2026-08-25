import React, { useState, useEffect, Suspense, useMemo, useRef, useCallback } from 'react'
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

const FallbackReadOnlyGrid = ({ initialValues, readonly }) => (
  <div className="grid grid-cols-2 gap-2">
    {Object.entries(initialValues || {}).map(([k, v]) => (
      <div key={k}>
        <strong>{k}</strong>: {String(v || '')}
      </div>
    ))}
  </div>
)

const SmartFormLazy = React.lazy(() =>
  import('./smartdocuments/SmartForm').catch(() => ({ default: FallbackReadOnlyGrid }))
)

function valueString(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return String(v) }
}

export default function ApproveDocumentModal({ document, onClose, onSubmit, isSubmitting = false, submitError = '', latestDocumentVersionId }) {
  const { t, formatDateTime } = usePreferences()
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
    approvalDecision: '',
    assignedSecondApprover: null,
    regeneratePdf: true,
  })

  const [isDragging, setIsDragging] = useState(false)
  const [approversList, setApproversList] = useState([])
  const [loadingApprovers, setLoadingApprovers] = useState(true)
  const [formError, setFormError] = useState('')
  const submitProgress = useLoadingProgress(isSubmitting)

  const latestVersion = (() => {
    if (latestDocumentVersionId && document?.versions) {
      const v = document.versions.find(v => v.id === latestDocumentVersionId)
      if (v) return v
    }
    if (document?.versions && document.versions.length > 0) {
      const sorted = [...document.versions].sort((a, b) => (b.id || 0) - (a.id || 0))
      return sorted[0]
    }
    return null
  })()
  const latestVersionId = latestVersion?.id

  const [isSmartDocument, setIsSmartDocument] = useState(() => {
    if (!document) return false
    if (document.isSmartDocument === true) return true
    if (String(document.creationMode || '').toUpperCase() === 'SMART_DOCUMENT') return true
    if (Boolean(document.smartTemplateVersionId)) return true
    if (latestVersion && Boolean(latestVersion.smartTemplateVersionId)) return true
    return false
  })
  const [smartContentLoading, setSmartContentLoading] = useState(false)
  const [smartDocumentContent, setSmartDocumentContent] = useState(null)
  const [smartTemplateVersion, setSmartTemplateVersion] = useState(null)
  // Baseline values yang reviewer hantar (sebelum approver buat minor tweaks)
  const [smartReviewerBaselineValues, setSmartReviewerBaselineValues] = useState({})
  // Current values (termasuk minor tweaks approver)
  const [smartCurrentValues, setSmartCurrentValues] = useState({})
  // Minor tweaks mode toggle
  const [smartMinorTweaksMode, setSmartMinorTweaksMode] = useState(false)
  const [regeneratingPdf, setRegeneratingPdf] = useState(false)
  const [pdfRegenerated, setPdfRegenerated] = useState(false)
  const [pdfRegenerateError, setPdfRegenerateError] = useState('')
  const [savingTweaks, setSavingTweaks] = useState(false)
  const [tweaksSaved, setTweaksSaved] = useState(true)

  // Reviewer info (extracted dari document object)
  const reviewerInfo = useMemo(() => {
    const name = document?.reviewerName || document?.assignedReviewerName || document?.reviewedByName || ''
    const date = document?.reviewedAt || document?.reviewedDate || document?.updatedAt || ''
    return {
      name: name ? String(name) : (document?.submittedById ? 'Assigned Reviewer' : 'No reviewer info'),
      date: date ? String(date) : null,
      editedCount: null
    }
  }, [document])

  // Calculate field yang reviewer edited (semasa load) — then diff antara originalFieldSnap vs reviewerBaseline
  const [smartOriginalDrafterValues, setSmartOriginalDrafterValues] = useState(null)

  const reviewerEditedFieldKeys = useMemo(() => {
    if (!smartOriginalDrafterValues) return new Set()
    const set = new Set()
    const allKeys = new Set([
      ...Object.keys(smartOriginalDrafterValues || {}),
      ...Object.keys(smartReviewerBaselineValues || {})
    ])
    allKeys.forEach(k => {
      const o = valueString(smartOriginalDrafterValues?.[k])
      const c = valueString(smartReviewerBaselineValues?.[k])
      if (o !== c) set.add(k)
    })
    return set
  }, [smartOriginalDrafterValues, smartReviewerBaselineValues])

  // Calculate field yang approver edit (minor tweaks) — berbanding reviewer baseline
  const approverTweakedKeys = useMemo(() => {
    const set = new Set()
    const allKeys = new Set([
      ...Object.keys(smartReviewerBaselineValues || {}),
      ...Object.keys(smartCurrentValues || {})
    ])
    allKeys.forEach(k => {
      const o = valueString(smartReviewerBaselineValues?.[k])
      const c = valueString(smartCurrentValues?.[k])
      if (o !== c) set.add(k)
    })
    return set
  }, [smartReviewerBaselineValues, smartCurrentValues])

  const tweaksCount = approverTweakedKeys.size

  useEffect(() => {
    if (!latestVersionId) return
    const detectSmart = async () => {
      try {
        setSmartContentLoading(true)
        const res = await api.get(`/smart-documents/document-versions/${latestVersionId}/content`)
        const respData = res.data?.data || res.data || {}
        const content = respData.smartDocumentContent || null
        if (content) {
          setIsSmartDocument(true)
          setSmartDocumentContent(content)
          let templateVersion =
            respData.templateVersion ||
            (content && (content.smartTemplateVersion || content.templateVersion)) ||
            null
          if (templateVersion) {
            if (!templateVersion.formFields && Array.isArray(respData.formFields)) {
              templateVersion = { ...templateVersion, formFields: respData.formFields }
            }
            if (!templateVersion.sections && Array.isArray(respData.sections)) {
              templateVersion = { ...templateVersion, sections: respData.sections }
            }
          }
          setSmartTemplateVersion(templateVersion)
          let fieldValues = {}
          try {
            if (typeof content.fieldValuesJson === 'string') {
              fieldValues = JSON.parse(content.fieldValuesJson)
            } else if (typeof content.fieldValuesJson === 'object' && content.fieldValuesJson) {
              fieldValues = content.fieldValuesJson
            }
          } catch (e) {
            fieldValues = {}
          }
          setSmartCurrentValues(fieldValues)
          setSmartReviewerBaselineValues(fieldValues)
          let original = null
          try {
            const auditStr = content.fieldAuditTrailJson
            if (auditStr) {
              const audit = typeof auditStr === 'string' ? JSON.parse(auditStr) : auditStr
              if (audit && typeof audit === 'object' && Array.isArray(audit) && audit.length > 0) {
                const oldest = audit[0]
                if (oldest && oldest.snapshot && typeof oldest.snapshot === 'object') {
                  original = oldest.snapshot
                }
              } else if (audit && !Array.isArray(audit) && typeof audit === 'object' && audit.drafterSnapshot) {
                original = audit.drafterSnapshot
              }
            }
          } catch (_) { original = null }
          setSmartOriginalDrafterValues(original)
        }
      } catch (err) {
        const status = err?.response?.status
        const msg = String(err?.response?.data?.message || err?.message || '')
        const isExpected =
          status === 404 ||
          (status === 400 && msg.toLowerCase().includes('does not contain smart document content'))
        if (!isExpected) {
          console.debug('Smart document detection skipped:', msg)
        }
      } finally {
        setSmartContentLoading(false)
      }
    }
    detectSmart()
  }, [latestVersionId])

  // Fetch list of approvers
  useEffect(() => {
    const fetchApprovers = async () => {
      try {
        setLoadingApprovers(true)
        const res = await api.get('/users', {
          params: document?.id ? { documentId: document.id, roleName: 'approver' } : { roleName: 'approver' }
        })
        const users = res.data.data?.users || res.data.users || []
        
        const documentOwnerId = document?.submittedById || document?.createdById || document?.userId || document?.ownerId
        
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
        
        const approvers = users.filter(user => {
          if (documentOwnerId && user.id === documentOwnerId) return false
          if (currentUserId && user.id === currentUserId) return false
          return user.status === 'ACTIVE'
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
  }, [document?.id])

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

  // ========== Smart Document handlers ==========
  const handleSmartFieldChange = (fieldKey, newValue) => {
    setSmartCurrentValues(prev => ({ ...prev, [fieldKey]: newValue }))
    setTweaksSaved(false)
  }

  const handleResetField = (fieldKey, reviewerBaselineVal) => {
    setSmartCurrentValues(prev => ({ ...prev, [fieldKey]: reviewerBaselineVal }))
    setTweaksSaved(false)
  }

  const handleResetAllTweaks = () => {
    setSmartCurrentValues({ ...smartReviewerBaselineValues })
    setTweaksSaved(true)
  }

  const handleOpenPreview = () => {
    if (!document?.id) return
    try {
      const previewUrl = `${api.defaults.baseURL}/documents/${document.id}/preview`
      window.open(previewUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      console.error('Failed to open preview:', e)
      setFormError('Could not open the preview. Try downloading from My Documents.')
    }
  }

  const handleSaveTweaks = async (showToast = true) => {
    if (!latestVersionId) return false
    if (tweaksCount === 0) {
      if (showToast) setTweaksSaved(true)
      return true
    }
    try {
      setSavingTweaks(true)
      setFormError('')
      const changes = {}
      approverTweakedKeys.forEach(k => { changes[k] = smartCurrentValues[k] })
      await api.put(`/smart-documents/document-versions/${latestVersionId}/field-values`, {
        fieldValues: changes,
        workflowAction: 'APPROVER_MINOR_TWEAK'
      })
      setSmartReviewerBaselineValues(prev => ({ ...prev, ...changes }))
      setTweaksSaved(true)
      return true
    } catch (err) {
      console.error('Failed to save approver tweaks:', err)
      setFormError(err?.response?.data?.message || 'Failed to save minor tweaks')
      return false
    } finally {
      setSavingTweaks(false)
    }
  }

  // ========== Auto-Save debounce ==========
  const autoSaveTimerRef = useRef(null)
  const lastSavedSnapshotRef = useRef('')

  const triggerAutoSave = useCallback(() => {
    if (tweaksCount === 0) {
      setTweaksSaved(true)
      return
    }
    const snap = Object.entries(smartCurrentValues || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${valueString(v)}`)
      .join('|')
    if (snap === lastSavedSnapshotRef.current) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(async () => {
      const ok = await handleSaveTweaks(true)
      if (ok) {
        lastSavedSnapshotRef.current = Object.entries(smartCurrentValues || {})
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([k, v]) => `${k}=${valueString(v)}`)
          .join('|')
      }
    }, 800)
  }, [tweaksCount, smartCurrentValues])

  useEffect(() => {
    if (!smartMinorTweaksMode) return
    triggerAutoSave()
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [smartCurrentValues, smartMinorTweaksMode, triggerAutoSave])

  const handleRegeneratePdf = async () => {
    if (!latestVersionId) return
    try {
      setRegeneratingPdf(true)
      setPdfRegenerateError('')
      await api.post(`/smart-documents/document-versions/${latestVersionId}/final-pdf`, {})
      setPdfRegenerated(true)
      setTimeout(() => setPdfRegenerated(false), 4000)
    } catch (err) {
      console.error('Failed to regenerate PDF:', err)
      setPdfRegenerateError(err?.response?.data?.message || 'Failed to regenerate PDF')
      setTimeout(() => setPdfRegenerateError(''), 5000)
    } finally {
      setRegeneratingPdf(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.approvalDecision) {
      setFormError('Please select an approval decision')
      return
    }

    if (formData.approvalDecision === 'amendments' && !formData.comments.trim()) {
      setFormError('Please provide comments explaining why the document needs amendments')
      return
    }

    setFormError('')

    // Smart flow: save minor tweaks dulu, then (optional) regen PDF
    if (isSmartDocument) {
      if (tweaksCount > 0 && !tweaksSaved) {
        const ok = await handleSaveTweaks(false)
        if (!ok) {
          setFormError('Could not save your minor tweaks before submitting. Try Save Now first.')
          return
        }
      }
      if (formData.regeneratePdf && formData.approvalDecision === 'approved') {
        try {
          await api.post(`/smart-documents/document-versions/${latestVersionId}/final-pdf`, {})
        } catch (err) {
          console.warn('PDF regeneration failed before submit, continuing approval anyway:', err?.message || err)
        }
      }
    }

    const finalFormData = { ...formData }
    if (isSmartDocument && tweaksCount > 0) {
      finalFormData.comments =
        (finalFormData.comments || '') +
        ` [Approver applied ${tweaksCount} minor tweak(s)]`
    }
    onSubmit(finalFormData)
  }

  // ========== RENDER ==========
  const renderFileUploadSection = () => (
    <div>
      <label className="block text-sm font-medium text-gray-900 mb-2">
        {t('upload_approved_doc')}
      </label>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="rounded-lg"
      >
        <AppSurface
          variant="muted"
          padding="lg"
          className={[
            'border-2 border-dashed text-center transition-colors',
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          ].join(' ')}
        >
          <div className="flex flex-col items-center">
          <svg
            className="w-12 h-12 text-gray-500 mb-3"
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
          <p className="text-gray-900 font-medium mb-1">{t('drop_files_here')}</p>
          <p className="text-xs text-gray-500 mb-3">{t('supported_format_docx')}</p>
          <p className="text-xs text-gray-500 mb-2">{t('or_text')}</p>
          <label className="cursor-pointer">
            <span className="text-blue-600 hover:text-blue-700 text-sm font-semibold underline underline-offset-2">
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
            <div className="mt-3 text-sm text-gray-700">
              {t('selected_colon')} <span className="font-medium">{formData.approvedFile.name}</span>
            </div>
          )}
        </div>
        </AppSurface>
      </div>
    </div>
  )



  // ====== NEW Smart Document Approval Layout ======
  const renderSmartApprovalPanel = () => {
    const readonly = !smartMinorTweaksMode
    const reviewerEditCount = reviewerEditedFieldKeys.size
    return (
      <div className="space-y-5">
        {/* Reviewer Summary Panel */}
        <div className="border border-gray-200 rounded-xl bg-gradient-to-br from-[#003366]/5 to-white px-4 py-3.5 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#003366]/70">
                Reviewer Submission Summary
              </div>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">
                {reviewerInfo.name}
                {reviewerInfo.date ? (
                  <span className="text-gray-500 font-normal ml-2">
                    · {formatDateTime ? formatDateTime(reviewerInfo.date) : reviewerInfo.date}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm">
                {reviewerEditCount > 0 ? (
                  <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                ) : (
                  <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                )}
                Reviewer edited {reviewerEditCount} field{reviewerEditCount === 1 ? '' : 's'}
              </span>
              {tweaksCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 shadow-sm">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  Your {tweaksCount} minor tweak{tweaksCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>
          {reviewerEditCount > 0 ? (
            <div className="text-[11px] text-gray-600 leading-relaxed">
              Fields highlighted in <span className="text-amber-700 font-semibold">amber</span> were edited by the reviewer (original drafter value → reviewer changed value shown below each field).
              Toggle <span className="font-semibold">Minor Tweaks</span> below if you need to make small adjustments before approval.
            </div>
          ) : (
            <div className="text-[11px] text-gray-600 leading-relaxed">
              Reviewer did not edit any Smart Form fields — all values are exactly as submitted by the drafter.
            </div>
          )}
        </div>

        {/* Action Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border border-gray-200 rounded-xl bg-gray-50/60 px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleRegeneratePdf}
              loading={regeneratingPdf}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Regenerate Final PDF
            </Button>
            {tweaksCount > 0 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleResetAllTweaks}
                disabled={savingTweaks}
              >
                Reset My Tweaks
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              savingTweaks
                ? 'border-blue-300 bg-blue-50 text-blue-800'
                : tweaksSaved
                  ? 'border-green-300 bg-green-50 text-green-800'
                  : 'border-amber-300 bg-amber-50 text-amber-800'
            }`}>
              {savingTweaks ? (
                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              ) : tweaksSaved ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              )}
              {savingTweaks ? 'Auto-Saving...' : tweaksSaved ? 'Auto-Saved' : 'Pending Auto-Save'}
            </span>
          </div>
        </div>

        {/* Mode Pills */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-gray-100 w-fit border border-gray-200">
          <button
            type="button"
            onClick={() => setSmartMinorTweaksMode(false)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              !smartMinorTweaksMode
                ? 'bg-white shadow-sm border border-gray-200 text-[#003366]'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Read Only
          </button>
          <button
            type="button"
            onClick={() => setSmartMinorTweaksMode(true)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              smartMinorTweaksMode
                ? 'bg-white shadow-sm border border-gray-200 text-[#003366]'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Minor Tweaks
          </button>
        </div>

        {smartMinorTweaksMode ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs text-sky-800">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              <div>
                <div className="font-semibold">Minor Tweaks Mode — you can adjust small details before approving</div>
                <div className="opacity-90 mt-0.5">
                  Your changes will be shown as a diff on top of the reviewer's version. Edits are auto-saved.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 px-4 py-3 text-xs text-amber-800">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              <div>
                <div className="font-semibold">Approval View (Read Only)</div>
                <div className="opacity-90 mt-0.5">
                  Switch to Minor Tweaks only if you need to make a small fix; otherwise, approve or return for amendments.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Smart Form dengan diffs */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 max-h-[500px] overflow-y-auto pr-2">
          <Suspense fallback={<div className="p-8 text-center text-sm text-gray-500 flex items-center justify-center gap-2"><InlineSpinner className="h-4 w-4 border-2"/>Loading Smart Form...</div>}>
            {smartTemplateVersion ? (
              <SmartFormLazy
                templateVersion={smartTemplateVersion}
                initialValues={smartCurrentValues}
                onChange={handleSmartFieldChange}
                readonly={readonly}
                originalValues={
                  smartMinorTweaksMode
                    ? smartReviewerBaselineValues
                    : (smartOriginalDrafterValues || smartReviewerBaselineValues)
                }
                diffStyle="approver"
                showResetButton={smartMinorTweaksMode && tweaksCount > 0}
                onResetField={handleResetField}
                onResetAll={handleResetAllTweaks}
                showReadonlyBanner={false}
                className="py-2"
              />
            ) : (
              <FallbackReadOnlyGrid initialValues={smartCurrentValues} readonly={readonly} />
            )}
          </Suspense>
        </div>

        {/* Auto-regen checkbox */}
        <label className="flex items-start gap-2 cursor-pointer rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#003366] focus:ring-[#003366]/30"
            checked={formData.regeneratePdf}
            onChange={(e) => setFormData(prev => ({ ...prev, regeneratePdf: e.target.checked }))}
          />
          <div className="text-xs space-y-0.5">
            <div className="font-medium text-gray-900">Regenerate Final PDF on Approve (recommended for Smart Documents)</div>
            <div className="text-gray-500">
              Ensures the published PDF contains the latest values including reviewer edits and any minor tweaks you applied.
            </div>
          </div>
        </label>
      </div>
    )
  }

  return (
    <Modal onClose={isSubmitting ? undefined : onClose} closeOnBackdrop={!isSubmitting} size="xl">
      <form onSubmit={handleSubmit}>
        <ModalHeader
          title={isSmartDocument ? 'Smart Document Approval' : (isFirstApproval ? t('first_approval') : isSecondApproval ? t('second_approval_title') : t('approve_document'))}
          subtitle={isSmartDocument
            ? `Review the submitted Smart Form values (reviewer edits tracked) — then approve or return for amendments.`
            : (isFirstApproval ? t('first_approval_desc') : isSecondApproval ? t('second_approval_desc') : t('approve_pub_desc'))}
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
                message={isSmartDocument
                  ? 'Approval decision, comments, minor tweaks, and (if enabled) PDF regeneration are being processed.'
                  : 'Approval decision, comments, and file updates are being processed.'}
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
            {pdfRegenerated ? (
              <AsyncActionStatus
                title="Final PDF regenerated"
                message="The Smart Document final PDF has been regenerated successfully."
                tone="success"
              />
            ) : null}
            {pdfRegenerateError ? (
              <AsyncActionStatus
                title="PDF regeneration failed"
                message={pdfRegenerateError}
                tone="error"
              />
            ) : null}
            {/* File Code */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                {t('file_code')}
              </label>
              <TextInput
                type="text"
                name="fileCode"
                value={formData.fileCode}
                className="bg-gray-50 text-gray-700"
                readOnly
              />
            </div>

            {/* Document Title & Version */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  {t('document_title_col')}
                </label>
                <TextInput
                  type="text"
                  name="documentTitle"
                  value={formData.documentTitle}
                  className="bg-gray-50 text-gray-700"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  {t('version_revision')}
                </label>
                <TextInput
                  type="text"
                  name="versionNo"
                  value={formData.versionNo}
                  className="bg-gray-50 text-gray-700"
                  readOnly
                />
              </div>
            </div>

            {/* Document Type */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                {t('doc_type')}
              </label>
              <TextInput
                type="text"
                name="documentType"
                value={formData.documentType}
                onChange={handleInputChange}
                className="bg-gray-50 text-gray-700"
                readOnly
              />
            </div>

            {/* Smart or Legacy Upload */}
            {smartContentLoading ? (
              <div className="p-8 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                <InlineSpinner className="h-4 w-4 border-2" />
                Checking document format...
              </div>
            ) : isSmartDocument ? (
              renderSmartApprovalPanel()
            ) : (
              renderFileUploadSection()
            )}

            {/* Approval Decision */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                {t('approval_decision')} <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    value="approved"
                    checked={formData.approvalDecision === 'approved'}
                    onChange={handleCheckboxChange}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/30"
                  />
                  <span className="ml-2 text-sm text-gray-700">{t('approve_document')}</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    value="amendments"
                    checked={formData.approvalDecision === 'amendments'}
                    onChange={handleCheckboxChange}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/30"
                  />
                  <span className="ml-2 text-sm text-gray-700">{t('return_amendments')}</span>
                </label>
              </div>
            </div>

            {/* Comments / Approval Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
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
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  {t('assign_second_approver')}
                </label>
                <p className="text-xs text-gray-500 mb-2">
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

        <ModalFooter className="!justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleOpenPreview}
              disabled={isSubmitting}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              Preview PDF (New Tab)
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              {t('cancel')}
            </Button>
          </div>
          <Button type="submit" loading={isSubmitting} loadingText={`Submitting... ${submitProgress}%`}>
            {t('submit')}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
