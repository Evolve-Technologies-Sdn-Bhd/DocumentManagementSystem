import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'
import Button from '../components/ui/Button'
import AssignReviewerModal from '../components/AssignReviewerModal'
import SkeletonBlock from '../components/ui/SkeletonBlock'

function InfoGridItem({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-muted font-semibold">
        {label}
      </span>
      <span className="text-sm text-ink break-all">{value || '—'}</span>
    </div>
  )
}

function Pill({ children, tone = 'default' }) {
  const tones = {
    default: 'bg-surface-muted text-ink-secondary border-border',
    brand: 'bg-brand/10 text-brand border-brand/20',
    green: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    red: 'bg-red-500/10 text-red-700 border-red-500/20',
  }
  return (
    <span
      className={[
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border',
        tones[tone] || tones.default,
      ].join(' ')}
    >
      {children}
    </span>
  )
}

export default function SmartDocumentEditor() {
  const navigate = useNavigate()
  const { documentId, documentVersionId } = useParams()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [docInfo, setDocInfo] = useState(null)
  const [content, setContent] = useState(null)
  const [templateVersion, setTemplateVersion] = useState(null)
  const [sections, setSections] = useState([])
  const [formFields, setFormFields] = useState([])
  const [isEditable, setIsEditable] = useState(false)
  const [owner, setOwner] = useState(null)

  const [fieldValues, setFieldValues] = useState({})

  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showReviewerModal, setShowReviewerModal] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)

  const [previewBlobUrl, setPreviewBlobUrl] = useState(null)
  const [refreshingPreview, setRefreshingPreview] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!documentVersionId) {
        setError('Missing document version ID in URL.')
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const res = await api.get(
          `/smart-documents/document-versions/${documentVersionId}/content`
        )
        const payload = res?.data?.data || res?.data || {}
        if (!mounted) return
        const {
          documentVersion,
          smartDocumentContent,
          templateVersion: tv,
          sections: sec,
          formFields: ff,
          owner: ow,
          isEditableByCurrentUser,
        } = payload
        setDocInfo(documentVersion || null)
        setContent(smartDocumentContent || null)
        setFieldValues({ ...(smartDocumentContent?.fieldValuesJson || {}) })
        setTemplateVersion(
          tv
            ? {
                ...tv,
                sections: sec || tv.sections || [],
                formFields: ff || tv.formFields || [],
              }
            : null
        )
        setSections(sec || [])
        setFormFields(ff || [])
        setOwner(ow || null)
        setIsEditable(Boolean(isEditableByCurrentUser))
      } catch (err) {
        if (!mounted) return
        const status = err?.response?.status
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load document. Please try again.'
        const extra = status
          ? ` [HTTP ${status}]`
          : ''
        setError(msg + extra)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [documentVersionId])

  const handleFieldChange = useCallback((fieldKey, newValue) => {
    setFieldValues((prev) => ({ ...prev, [fieldKey]: newValue }))
  }, [])

  const handleSave = useCallback(
    async (values) => {
      if (!documentVersionId) return
      const payload =
        values && typeof values === 'object' && Object.keys(values).length > 0
          ? values
          : fieldValues
      try {
        setSaving(true)
        setSaveMessage(null)
        await api.put(
          `/smart-documents/document-versions/${documentVersionId}/field-values`,
          { fieldValues: payload, workflowAction: 'DRAFT_EDIT' }
        )
        setSaveMessage({ type: 'success', text: 'Changes saved successfully.' })
        setTimeout(() => setSaveMessage(null), 3500)
      } catch (err) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to save. Please try again.'
        setSaveMessage({ type: 'error', text: msg })
      } finally {
        setSaving(false)
      }
    },
    [documentVersionId, fieldValues]
  )

  const handleSubmitForReview = useCallback(async () => {
    if (!documentId) return
    try {
      setSubmitting(true)
      setSaveMessage(null)
      if (documentVersionId) {
        const payload = fieldValues && typeof fieldValues === 'object' && Object.keys(fieldValues).length > 0
          ? fieldValues
          : {}
        await api.put(
          `/smart-documents/document-versions/${documentVersionId}/field-values`,
          { fieldValues: payload, workflowAction: 'SUBMIT_FOR_REVIEW_AUTOSAVE' }
        )
      }
      setShowReviewerModal(true)
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to prepare submission.'
      setSaveMessage({ type: 'error', text: msg })
    } finally {
      setSubmitting(false)
    }
  }, [documentId, documentVersionId, fieldValues])

  const handleReviewerSubmitSuccess = useCallback(() => {
    setSaveMessage({ type: 'success', text: 'Document submitted for review successfully.' })
    setTimeout(() => {
      setSaveMessage(null)
      navigate('/draft-documents')
    }, 2000)
  }, [navigate])

  const reviewerDocObj = React.useMemo(() => {
    if (!docInfo && !owner) return null
    return {
      id: documentId ? parseInt(documentId, 10) : null,
      ownerId: owner?.id ?? null,
    }
  }, [docInfo, owner, documentId])

  const handleRefreshPreview = useCallback(async () => {
    if (!documentVersionId) return
    try {
      setRefreshingPreview(true)
      const endpoint = `/smart-documents/document-versions/${documentVersionId}/preview-pdf`
      const res = await api.post(
        endpoint,
        {},
        { responseType: 'blob' }
      )
      const rawBlob = res?.data
      if (!rawBlob) throw new Error('Empty preview response')
      const correctType = 'application/pdf'
      const blob =
        rawBlob instanceof Blob && rawBlob.type && rawBlob.type !== 'text/plain'
          ? rawBlob
          : new Blob(
              [rawBlob instanceof Blob ? await rawBlob.arrayBuffer() : rawBlob],
              { type: correctType }
            )
      if (previewBlobUrl) {
        try {
          URL.revokeObjectURL(previewBlobUrl)
        } catch {}
      }
      const url = URL.createObjectURL(blob)
      setPreviewBlobUrl(url)
    } catch (err) {
      setPreviewBlobUrl(null)
      const status = err?.response?.status
      const rawMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Unknown preview error'
      const statusHint = status ? ` [HTTP ${status}]` : ''
      console.warn('[SmartDocumentEditor] Preview failed:', rawMessage, err)
      setSaveMessage({
        type: 'error',
        text: `Preview generation failed${statusHint}: ${rawMessage}`,
      })
      setTimeout(() => {
        setSaveMessage((curr) =>
          curr && curr.type === 'error' && curr.text.startsWith('Preview generation failed')
            ? null
            : curr
        )
      }, 7000)
    } finally {
      setRefreshingPreview(false)
    }
  }, [documentVersionId, previewBlobUrl])

  useEffect(() => {
    let cancelled = false
    if (loading) return
    if (!documentVersionId) return
    if (previewBlobUrl) return
    const timer = window.setTimeout(() => {
      if (!cancelled && !refreshingPreview) {
        handleRefreshPreview()
      }
    }, 800)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [loading, documentVersionId, previewBlobUrl, refreshingPreview, handleRefreshPreview])

  const handleDownloadPdf = useCallback(() => {
    if (!previewBlobUrl) return
    const a = document.createElement('a')
    a.href = previewBlobUrl
    a.download = `${docInfo?.document?.title || docInfo?.title || 'document'}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [previewBlobUrl, docInfo])

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/documents/drafts')
    }
  }, [navigate])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <SkeletonBlock className="h-10 w-80 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SkeletonBlock className="h-[600px] rounded-2xl" />
          <SkeletonBlock className="h-[600px] rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="max-w-2xl mx-auto border border-red-200 bg-red-50 dark:bg-red-900/10 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <svg
              className="h-6 w-6 text-red-500 mt-0.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h3 className="font-semibold text-red-700 dark:text-red-200">
                Unable to load document
              </h3>
              <p className="mt-1 text-sm text-red-600 dark:text-red-300/90">
                {error}
              </p>
              <div className="mt-4 flex gap-3">
                <Button variant="secondary" onClick={handleBack}>
                  Go Back
                </Button>
                <Button
                  variant="primary"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const parentDoc = docInfo?.document || docInfo || {}
  const title =
    content?.title || parentDoc.title || templateVersion?.title || 'Untitled'
  const fileCode = parentDoc.fileCode || docInfo?.fileCode || ''
  const status = parentDoc.status || docInfo?.status || 'DRAFT'
  const versionNo = docInfo?.versionNo || content?.versionNo || 1
  const referenceCode =
    content?.fieldValuesJson?.reference_code ||
    parentDoc.referenceCode ||
    fileCode ||
    '—'
  const docType =
    parentDoc.documentType?.name ||
    docInfo?.documentTypeName ||
    (templateVersion?.smartTemplate && templateVersion.smartTemplate.documentType?.name) ||
    (templateVersion?.smartTemplate && templateVersion.smartTemplate.documentTypeName) ||
    (templateVersion?.smartTemplate && templateVersion.smartTemplate.name) ||
    '—'
  const preparedBy =
    owner?.fullName ||
    owner?.displayName ||
    owner?.name ||
    docInfo?.createdBy?.fullName ||
    '—'

  const statusTone = (() => {
    const s = String(status || '').toUpperCase()
    if (s.includes('PUBLISH')) return 'green'
    if (s.includes('REVIEW') || s.includes('APPROV')) return 'brand'
    if (s.includes('REJECT') || s.includes('OBSOLETE') || s.includes('SUPERSE')) return 'red'
    if (s.includes('DRAFT')) return 'amber'
    return 'default'
  })()

  return (
    <div className="relative min-h-screen">
      <div className="p-6">
        <div className="space-y-6 max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-3 transition-colors"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to Drafts
              </button>
              <h1 className="text-xl font-semibold text-ink break-words">
                {title}
              </h1>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {fileCode ? (
                  <span className="text-sm text-ink-muted">
                    {fileCode}
                  </span>
                ) : null}
                <Pill tone={statusTone}>{status}</Pill>
                <Pill tone="default">v{versionNo}</Pill>
                {!isEditable && <Pill tone="red">Locked</Pill>}
              </div>
            </div>
          </div>

          <div className="border border-border bg-surface rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-surface-muted/40 border-b border-border">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <InfoGridItem label="Reference Code" value={referenceCode} />
                <InfoGridItem label="Version" value={`v${versionNo}`} />
                <InfoGridItem label="Document Type" value={docType} />
              </div>
            </div>

            {saveMessage ? (
              <div
                className={[
                  'mx-4 mt-4 rounded-2xl border px-4 py-3 text-sm',
                  saveMessage.type === 'error'
                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 text-red-700 dark:text-red-200'
                    : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 text-emerald-700 dark:text-emerald-200',
                ].join(' ')}
              >
                {saveMessage.text}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 bg-surface-muted/20">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-red-500"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M10.92,12.31C10.68,11.54 10.15,9.08 11.55,9.04C12.95,9 12.03,12.16 12.03,12.16C12.42,13.65 14.05,14.72 14.05,14.72C14.55,14.22 14.95,13.5 14.95,12.72C14.95,11.13 13.57,10.21 12.28,10.47L12.61,8.92L11.54,9C10.04,9.1 10,11.97 9.44,12.77C8.9,13.55 7.6,13.21 7.6,14.32C7.6,15.22 8.36,15.57 9.17,15.57C10.38,15.57 10.97,15.17 11.37,14.5C11.37,14.5 12.06,15.77 13.65,15.77C15.15,15.77 16.15,14.64 16.15,13.05C16.15,11.72 15.39,10.83 15.04,10.55L15.36,9.36L18.28,13L16.5,14.04L10.92,12.31Z" />
                </svg>
                <h2 className="text-sm font-semibold text-ink">
                  PDF Preview
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {previewBlobUrl ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDownloadPdf}
                  >
                    Download
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  loading={refreshingPreview}
                  onClick={handleRefreshPreview}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh
                </Button>
              </div>
            </div>

            <div className="bg-[#f1f3f9] dark:bg-black/20 min-h-[600px] flex items-stretch">
              {previewBlobUrl ? (
                <iframe
                  title="PDF Preview"
                  src={previewBlobUrl}
                  className="w-full min-h-[700px] bg-white"
                />
              ) : (
                <div className="w-full p-8 flex flex-col items-center justify-center text-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-surface border border-border flex items-center justify-center text-ink-muted">
                    <svg
                      className="h-7 w-7"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-ink text-sm">
                      No preview yet
                    </p>
                    <p className="mt-1 text-xs text-ink-muted max-w-xs mx-auto">
                      Click Refresh to generate the PDF preview of this
                      smart document.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={refreshingPreview}
                    onClick={handleRefreshPreview}
                  >
                    Generate Preview
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <AssignReviewerModal
        isOpen={showReviewerModal}
        onClose={() => setShowReviewerModal(false)}
        document={reviewerDocObj}
        onSuccess={handleReviewerSubmitSuccess}
      />
    </div>
  )
}
