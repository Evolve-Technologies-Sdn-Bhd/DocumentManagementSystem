import React, { useEffect, useRef, useState } from 'react'
import api from '../api/axios'
import useFileUploadSettings from '../hooks/useFileUploadSettings'
import AssignReviewerModal from './AssignReviewerModal'
import { AlertModal } from './ConfirmModal'
import DocumentAccessModal from './DocumentAccessModal'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import AsyncActionStatus from './ui/AsyncActionStatus'

export default function UploadFileModal({ isOpen, onClose, document, onSuccess, canManageAccess = false }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [showAssignReviewer, setShowAssignReviewer] = useState(false)
  const [showDocumentAccess, setShowDocumentAccess] = useState(false)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const fileInputRef = useRef(null)
  
  // Use dynamic file upload settings
  const { validateFile, getAcceptString, getAllowedTypesDisplay } = useFileUploadSettings()

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null)
      setIsDragging(false)
      setUploading(false)
      setUploadComplete(false)
      setShowAssignReviewer(false)
      setShowDocumentAccess(false)
      setAlertModal({ show: false, title: '', message: '', type: 'info' })
    }
  }, [isOpen, document?.id])

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
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
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
              <AppSurface variant="muted" padding="md" className="text-sm text-ink-secondary">
                <div><span className="font-semibold text-ink">File Code:</span> {documentCodeLabel}</div>
                <div className="mt-1"><span className="font-semibold text-ink">Title:</span> {documentTitleLabel}</div>
                <div className="mt-1"><span className="font-semibold text-ink">Status:</span> Draft</div>
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
                className="rounded-[18px]"
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
                    isDragging ? 'border-brand bg-blue-50/40' : 'border-border'
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
                        Remove file
                      </button>
                    </div>
                  ) : (
                    <>
                      <svg className="w-12 h-12 text-ink-soft mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm font-semibold text-ink mb-1">Drop files here</p>
                      <p className="text-xs text-ink-muted mb-4">Supported formats: {getAllowedTypesDisplay()}</p>
                      <p className="text-xs text-ink-soft mb-4">OR</p>
                      <label className="cursor-pointer">
                        <span className="text-sm text-brand hover:text-brand-hover font-semibold underline underline-offset-2">
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
                loadingText={`Uploading... ${uploadProgress}%`}
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
