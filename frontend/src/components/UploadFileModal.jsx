import React, { useEffect, useRef, useState } from 'react'
import api from '../api/axios'
import useFileUploadSettings from '../hooks/useFileUploadSettings'
import useAI from '../hooks/useAI'
import AssignReviewerModal from './AssignReviewerModal'
import { AlertModal } from './ConfirmModal'
import DocumentAccessModal from './DocumentAccessModal'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import AsyncActionStatus from './ui/AsyncActionStatus'
import { getUploadProgress, subscribeUploadProgress } from '../utils/uploadProgressStore'

export default function UploadFileModal({ isOpen, onClose, document, onSuccess, canManageAccess = false }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(() => getUploadProgress())
  const [uploadComplete, setUploadComplete] = useState(false)
  const [showAssignReviewer, setShowAssignReviewer] = useState(false)
  const [showDocumentAccess, setShowDocumentAccess] = useState(false)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [aiSummary, setAiSummary] = useState(null)
  const [aiClassification, setAiClassification] = useState(null)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const fileInputRef = useRef(null)

  const ai = useAI()
  const { validateFile, getAcceptString, getAllowedTypesDisplay } = useFileUploadSettings()

  useEffect(() => {
    if (isOpen) {
      ai.fetchConfig()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null)
      setIsDragging(false)
      setUploading(false)
      setUploadComplete(false)
      setShowAssignReviewer(false)
      setShowDocumentAccess(false)
      setAlertModal({ show: false, title: '', message: '', type: 'info' })
      setAiSummary(null)
      setAiClassification(null)
      setAiPanelOpen(false)
    }
  }, [isOpen, document?.id])

  useEffect(() => {
    return subscribeUploadProgress(setUploadProgress)
  }, [])

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = (file) => {
    // Validate file using dynamic settings
    const validation = validateFile(file)
    if (!validation.valid) {
      setAlertModal({ show: true, title: 'Invalid File', message: validation.error, type: 'warning' })
      return
    }

    setSelectedFile(file)
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true)
    } else if (e.type === 'dragleave') {
      setIsDragging(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setAlertModal({ show: true, title: 'No File Selected', message: 'Please select a file to upload.', type: 'warning' })
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      await api.post(`/documents/${document.id}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setUploadComplete(true)
      setSelectedFile(null)
      if (onSuccess) await onSuccess({ type: 'upload', documentId: document.id })
    } catch (error) {
      console.error('Failed to upload file:', error)
      setAlertModal({
        show: true,
        title: 'Upload Failed',
        message: error.response?.data?.message || 'Failed to upload file',
        type: 'error'
      })
    } finally {
      setUploading(false)
    }
  }

  const handleOpenDocument = () => {
    window.location.assign(`/documents/${document.id}`)
  }

  const handleSummarize = async () => {
    if (!selectedFile) return
    setAiSummary(null)
    setAiPanelOpen(true)
    try {
      const result = await ai.summarize({ file: selectedFile, format: 'paragraphs' })
      setAiSummary(result)
    } catch (err) {
      setAlertModal({ show: true, title: 'AI Summarize Failed', message: err.message, type: 'error' })
    }
  }

  const handleClassify = async () => {
    if (!selectedFile) return
    setAiClassification(null)
    setAiPanelOpen(true)
    try {
      const result = await ai.classify({ file: selectedFile })
      setAiClassification(result)
    } catch (err) {
      setAlertModal({ show: true, title: 'AI Classify Failed', message: err.message, type: 'error' })
    }
  }

  const handleClose = () => {
    setSelectedFile(null)
    setIsDragging(false)
    setUploadComplete(false)
    setShowAssignReviewer(false)
    setShowDocumentAccess(false)
    onClose()
  }

  if (!isOpen || !document) return null

  const documentCodeLabel = document.fileCode || 'Draft document'
  const documentTitleLabel = document.title || 'Untitled document'

  return (
    <>
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
      <Modal onClose={uploading ? undefined : handleClose} closeOnBackdrop={!uploading} size="sm">
        <ModalHeader
          title={uploadComplete ? 'File Uploaded' : 'Upload Document File'}
          subtitle={`${documentCodeLabel}: ${documentTitleLabel}`}
          onClose={uploading ? undefined : handleClose}
        />

        <ModalBody>
          {uploadComplete ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold text-green-900">Draft file uploaded successfully</div>
                    <div className="mt-1 text-sm text-green-800">Next step: submit this draft for review, or open the document to continue editing later.</div>
                  </div>
                </div>
              </div>
              <AppSurface variant="muted" padding="md" className="text-sm text-gray-700">
                <div><span className="font-semibold text-gray-900">File Code:</span> {documentCodeLabel}</div>
                <div className="mt-1"><span className="font-semibold text-gray-900">Title:</span> {documentTitleLabel}</div>
                <div className="mt-1"><span className="font-semibold text-gray-900">Status:</span> Draft</div>
              </AppSurface>
            </div>
          ) : (
            <div className="space-y-4">
              {uploading ? (
                <AsyncActionStatus
                  title="Uploading file"
                  message="Your draft file is being uploaded and validated before the next workflow step."
                  progress={null}
                  busy
                />
              ) : null}
              <div
                className="rounded-lg"
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
                    isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                  ].join(' ')}
                >
                  {selectedFile ? (
                    <div className="space-y-2">
                      <svg className="w-12 h-12 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-semibold text-gray-900">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(null)}
                        className="text-sm text-red-600 hover:text-red-700 font-semibold underline underline-offset-2"
                      >
                        Remove file
                      </button>
                    </div>
                  ) : (
                    <>
                      <svg className="w-12 h-12 text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm font-semibold text-gray-900 mb-1">Drop files here</p>
                      <p className="text-xs text-gray-500 mb-4">Supported formats: {getAllowedTypesDisplay()}</p>
                      <p className="text-xs text-gray-500 mb-4">OR</p>
                      <label className="cursor-pointer">
                        <span className="text-sm text-blue-600 hover:text-blue-700 font-semibold underline underline-offset-2">
                          Browse files
                        </span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          accept={getAcceptString()}
                          onChange={handleFileSelect}
                        />
                      </label>
                    </>
                  )}
                </AppSurface>
              </div>

              {ai.aiEnabled && selectedFile && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 px-2">
                      &#10024; AI Actions
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent" />
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleSummarize}
                      loading={ai.loading.summarize}
                      loadingText="Summarizing..."
                      className="text-sm"
                    >
                      <span className="mr-1.5">&#128221;</span> Summarize Document
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleClassify}
                      loading={ai.loading.classify}
                      loadingText="Classifying..."
                      className="text-sm"
                    >
                      <span className="mr-1.5">&#127991;</span> Classify Document
                    </Button>
                  </div>

                  {(aiPanelOpen || aiSummary || aiClassification) && (
                    <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/50 overflow-hidden">
                      <div className="flex items-center justify-between px-3.5 py-2 border-b border-indigo-100 bg-white/60">
                        <span className="text-xs font-semibold text-indigo-800">AI Analysis Results</span>
                        <button
                          type="button"
                          onClick={() => setAiPanelOpen(false)}
                          className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                        >
                          Collapse
                        </button>
                      </div>
                      <div className="p-3.5 space-y-3 text-sm">
                        {ai.loading.summarize && (
                          <div className="flex items-center gap-2 text-indigo-700">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            <span className="text-xs">Generating summary...</span>
                          </div>
                        )}
                        {ai.loading.classify && (
                          <div className="flex items-center gap-2 text-indigo-700">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            <span className="text-xs">Classifying document...</span>
                          </div>
                        )}

                        {aiSummary && (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Summary</div>
                            <div className="bg-white rounded-lg p-3 border border-indigo-100 max-h-40 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">
                              {aiSummary.summary || '(No summary text returned)'}
                            </div>
                            {aiSummary.keyPoints?.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-semibold text-gray-600 uppercase">Key Points</div>
                                <ul className="list-disc list-inside space-y-0.5 text-[12px] text-gray-700 bg-white rounded-lg border border-gray-100 p-2.5">
                                  {aiSummary.keyPoints.slice(0, 5).map((p, i) => <li key={i}>{p}</li>)}
                                </ul>
                              </div>
                            )}
                            {aiSummary.keywords?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {aiSummary.keywords.map((kw, i) => (
                                  <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {aiClassification && (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Classification</div>
                            <div className="bg-white rounded-lg p-3 border border-indigo-100 space-y-1.5 text-[13px]">
                              <div className="flex items-baseline gap-2">
                                <span className="text-gray-500 w-20 shrink-0">Category:</span>
                                <span className="font-semibold text-gray-900 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
                                  {aiClassification.category}
                                </span>
                                <span className="text-[11px] text-gray-500">
                                  {Math.round((aiClassification.confidence || 0) * 100)}% confidence
                                </span>
                              </div>
                              {aiClassification.reason && (
                                <div className="flex gap-2 text-[12px] text-gray-700">
                                  <span className="text-gray-500 w-20 shrink-0">Reason:</span>
                                  <span>{aiClassification.reason}</span>
                                </div>
                              )}
                              {aiClassification.estimatedPriority && (
                                <div className="flex items-baseline gap-2 text-[12px]">
                                  <span className="text-gray-500 w-20 shrink-0">Priority:</span>
                                  <span className={`font-medium px-2 py-0.5 rounded text-[11px] ${
                                    aiClassification.estimatedPriority === 'HIGH'
                                      ? 'bg-red-50 border border-red-200 text-red-700'
                                      : aiClassification.estimatedPriority === 'LOW'
                                      ? 'bg-gray-50 border border-gray-200 text-gray-700'
                                      : 'bg-amber-50 border border-amber-200 text-amber-700'
                                  }`}>
                                    {aiClassification.estimatedPriority}
                                  </span>
                                </div>
                              )}
                              {aiClassification.suggestedTags?.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {aiClassification.suggestedTags.map((t, i) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {!aiSummary && !ai.loading.summarize && !aiClassification && !ai.loading.classify && (
                          <div className="text-center text-xs text-indigo-600/80 py-2">
                            Click an AI action above to analyze the document.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!ai.aiEnabled && selectedFile && (
                <div className="text-center text-[11px] text-gray-400 pt-1">
                  Tip: Enable AI in backend settings to unlock auto-summarization &amp; classification
                </div>
              )}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="flex-wrap justify-end">
          {uploadComplete ? (
            <>
              <Button type="button" variant="secondary" onClick={handleClose}>
                Close
              </Button>
              {canManageAccess && (
                <Button type="button" variant="secondary" onClick={() => setShowDocumentAccess(true)}>
                  Manage Access
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={handleOpenDocument}>
                Open Document
              </Button>
              <Button type="button" onClick={() => setShowAssignReviewer(true)}>
                Submit for Review
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={handleClose} disabled={uploading}>
                Cancel
              </Button>
              {canManageAccess && (
                <Button type="button" variant="secondary" onClick={() => setShowDocumentAccess(true)} disabled={uploading}>
                  Manage Access
                </Button>
              )}
              <Button
                type="button"
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                loading={uploading}
                loadingText={typeof uploadProgress?.percent === 'number' ? `Uploading... ${uploadProgress.percent}%` : 'Uploading...'}
              >
                Upload File
              </Button>
            </>
          )}
        </ModalFooter>
      </Modal>
      <AssignReviewerModal
        isOpen={showAssignReviewer}
        onClose={() => setShowAssignReviewer(false)}
        document={document}
        onSuccess={async () => {
          setShowAssignReviewer(false)
          if (onSuccess) await onSuccess({ type: 'submitForReview', documentId: document.id })
          handleClose()
        }}
      />
      {showDocumentAccess && (
        <DocumentAccessModal
          document={document}
          onClose={() => setShowDocumentAccess(false)}
          onSaved={async () => {
            setShowDocumentAccess(false)
            setAlertModal({ show: true, title: 'Success', message: 'Confidential access updated successfully.', type: 'success' })
            if (onSuccess) await onSuccess({ type: 'accessUpdated', documentId: document.id })
          }}
          onError={(message) => {
            setAlertModal({ show: true, title: 'Unable to update access', message, type: 'error' })
          }}
        />
      )}
    </>
  )
}
