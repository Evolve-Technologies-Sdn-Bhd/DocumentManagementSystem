import React, { useRef, useState } from 'react'
import api from '../api/axios'
import DocumentViewerModal from './DocumentViewerModal'
import ConfirmModal, { AlertModal } from './ConfirmModal'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import Button from './ui/Button'

export default function ApproveSupersedeModal({ document, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    approvalComments: ''
  })
  const [showViewModal, setShowViewModal] = useState(false)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitLockRef = useRef(false)

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleApprove = async () => {
    if (isSubmitting) return

    setConfirmModal({
      show: true,
      title: 'Confirm Approval',
      message: 'Are you sure you want to approve this supersede/obsolete request? This will mark the document as obsolete/superseded.',
      onConfirm: async () => {
        if (submitLockRef.current) return

        submitLockRef.current = true
        setIsSubmitting(true)

        try {
          // Comments are optional for approval
          await api.post(`/supersede-requests/${document.id}/approve`, {
            comments: formData.approvalComments || ''
          })
          
          setConfirmModal({ show: false })
          setAlertModal({ show: true, title: 'Success', message: 'Request approved successfully! Document has been marked as obsolete/superseded.', type: 'success' })
          setTimeout(() => onSubmit({ action: 'approve' }), 1500)
        } catch (error) {
          console.error('Failed to approve request:', error)
          setConfirmModal({ show: false })
          setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to approve request', type: 'error' })
        } finally {
          submitLockRef.current = false
          setIsSubmitting(false)
        }
      }
    })
  }

  const handleReject = async () => {
    if (isSubmitting) return

    if (!formData.approvalComments) {
      setAlertModal({ show: true, title: 'Validation Error', message: 'Please provide approval comments for rejection', type: 'warning' })
      return
    }

    setConfirmModal({
      show: true,
      title: 'Confirm Rejection',
      message: 'Are you sure you want to reject this request?',
      onConfirm: async () => {
        if (submitLockRef.current) return

        submitLockRef.current = true
        setIsSubmitting(true)

        try {
          await api.post(`/supersede-requests/${document.id}/reject`, {
            reason: formData.approvalComments
          })
          
          setConfirmModal({ show: false })
          setAlertModal({ show: true, title: 'Success', message: 'Request rejected successfully!', type: 'success' })
          setTimeout(() => onSubmit({ action: 'reject' }), 1500)
        } catch (error) {
          console.error('Failed to reject request:', error)
          setConfirmModal({ show: false })
          setAlertModal({ show: true, title: 'Error', message: error.response?.data?.message || 'Failed to reject request', type: 'error' })
        } finally {
          submitLockRef.current = false
          setIsSubmitting(false)
        }
      }
    })
  }

  const handleViewDocument = () => {
    if (!document?.documentId) {
      setAlertModal({ show: true, title: 'Error', message: 'Document ID not found', type: 'error' })
      return
    }
    setShowViewModal(true)
  }

  return (
    <>
      <ConfirmModal
        show={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        type="info"
        loading={isSubmitting}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => {
          if (isSubmitting) return
          setConfirmModal({ show: false })
        }}
      />
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false })}
      />
      <Modal onClose={isSubmitting ? undefined : onClose} closeOnBackdrop={!isSubmitting} size="lg">
        <ModalHeader
          title="Approval for Supersede / Obsolete Document"
          subtitle="Please make sure a replacement file is available before requesting to supersede, and ensure it goes through the review and approval process."
          onClose={isSubmitting ? undefined : onClose}
        />

        <ModalBody className="space-y-4">
          {/* File Code and Document Action Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Code
              </label>
              <input
                type="text"
                value={document?.fileCode || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Action Type
              </label>
              <input
                type="text"
                value={document?.actionType || 'Supersede / Obsolete'}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 outline-none"
              />
            </div>
          </div>

          {/* Document Title and Version */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Title
              </label>
              <input
                type="text"
                value={document?.title || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Version / Revision No.
              </label>
              <input
                type="text"
                value={document?.version || 'N/A'}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 outline-none"
              />
            </div>
          </div>

          {/* Document Type and Requested By */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Type
              </label>
              <input
                type="text"
                value={document?.documentType || 'N/A'}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Requested By
              </label>
              <input
                type="text"
                value={document?.submittedBy || document?.requestedBy || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 outline-none"
              />
            </div>
          </div>

          {/* Reason for Supersede / Obsolete */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Supersede / Obsolete
            </label>
            <textarea
              value={document?.reason || 'Exercitation id et irure labore dolore nostrud ad.'}
              disabled
              rows="4"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 outline-none resize-none"
            />
          </div>

          {/* Replacement File Code (if Supersede) */}
          {document?.actionType === 'Supersede' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Replacement File Code (if Supersede)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={document?.replacementFileCode || ''}
                  disabled
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 outline-none"
                />
                <button className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-gray-200 my-6"></div>

          {/* Approval Comments */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Approval Comments <span className="text-xs text-gray-500 font-normal">(Optional for approve, required for reject)</span>
            </label>
            <textarea
              name="approvalComments"
              value={formData.approvalComments}
              onChange={handleInputChange}
              placeholder="Enter your approval comments (optional for approve, required for reject)"
              rows="4"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>
        </ModalBody>

        <ModalFooter className="flex-wrap justify-between">
          <Button type="button" variant="secondary" onClick={handleViewDocument} disabled={isSubmitting}>
            View Document
          </Button>
          <div className="flex gap-3">
            <Button type="button" variant="danger" onClick={handleReject} disabled={isSubmitting}>
              Reject
            </Button>
            <Button type="button" onClick={handleApprove} disabled={isSubmitting}>
              Approved
            </Button>
          </div>
        </ModalFooter>
      </Modal>

      {/* Document Viewer Modal */}
      {showViewModal && document && (
        <DocumentViewerModal
          document={{ ...document, id: document.documentId }}
          onClose={() => setShowViewModal(false)}
        />
      )}
    </>
  )
}
