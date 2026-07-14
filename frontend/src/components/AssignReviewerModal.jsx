import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import { AlertModal } from './ConfirmModal'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import Button from './ui/Button'
import AppSurface from './ui/AppSurface'
import InlineSpinner from './ui/InlineSpinner'

export default function AssignReviewerModal({ isOpen, onClose, document, onSuccess }) {
  const [availableReviewers, setAvailableReviewers] = useState([])
  const [selectedReviewerId, setSelectedReviewerId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })

  useEffect(() => {
    if (isOpen) {
      loadReviewers()
    }
  }, [isOpen])

  const loadReviewers = async () => {
    setLoading(true)
    try {
      const res = await api.get('/users')
      const users = res.data.data?.users || res.data.users || []
      
      // Get current user ID to exclude document owner
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
      
      // Filter only active users and exclude document owner
      const activeUsers = users.filter(user => 
        user.status === 'ACTIVE' && 
        user.id !== currentUserId &&
        user.id !== document?.ownerId
      )
      setAvailableReviewers(activeUsers)
    } catch (error) {
      console.error('Failed to load reviewers:', error)
      setAvailableReviewers([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelectReviewer = (userId) => {
    setSelectedReviewerId(userId)
  }

  const handleSubmit = async () => {
    if (!selectedReviewerId) {
      setAlertModal({ show: true, title: 'Reviewer Required', message: 'Please select a reviewer before submitting.', type: 'warning' })
      return
    }

    setSubmitting(true)
    try {
      await api.post(`/documents/${document.id}/submit-for-review`, {
        reviewerIds: [selectedReviewerId]
      })

      if (onSuccess) onSuccess()
      handleClose()
    } catch (error) {
      console.error('Failed to assign reviewers:', error)
      setAlertModal({
        show: true,
        title: 'Submit Failed',
        message: error.response?.data?.message || 'Failed to assign reviewers',
        type: 'error'
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setSelectedReviewerId(null)
    setAlertModal({ show: false, title: '', message: '', type: 'info' })
    onClose()
  }

  if (!isOpen || !document) return null

  return (
    <>
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
      <Modal onClose={submitting ? undefined : handleClose} closeOnBackdrop={!submitting} size="md">
        <ModalHeader
          title="Assign Reviewer"
          subtitle={`${document.fileCode}: ${document.title}`}
          onClose={submitting ? undefined : handleClose}
        />

        <ModalBody className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8 text-ink-muted">
              <InlineSpinner />
              <span>Loading reviewers...</span>
            </div>
          ) : availableReviewers.length === 0 ? (
            <AppSurface variant="muted" padding="md" className="text-center text-sm text-ink-muted">
              No reviewers available
            </AppSurface>
          ) : (
            <>
              <p className="text-sm text-ink-muted">Select a reviewer for this document.</p>
              <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                {availableReviewers.map((reviewer) => (
                  <label
                    key={reviewer.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${
                      selectedReviewerId === reviewer.id
                        ? 'border-brand bg-blue-50/50'
                        : 'border-border hover:bg-surface-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reviewer"
                      checked={selectedReviewerId === reviewer.id}
                      onChange={() => handleSelectReviewer(reviewer.id)}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-ink">
                        {reviewer.firstName && reviewer.lastName
                          ? `${reviewer.firstName} ${reviewer.lastName}`
                          : reviewer.email}
                      </div>
                      {reviewer.position ? (
                        <div className="text-xs text-ink-muted">{reviewer.position}</div>
                      ) : null}
                      {reviewer.department ? (
                        <div className="text-xs text-ink-muted">{reviewer.department}</div>
                      ) : null}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          {selectedReviewerId ? (
            <AppSurface variant="panel" padding="sm" className="text-sm font-medium text-[var(--dms-color-info-ink)]">
              1 reviewer selected
            </AppSurface>
          ) : null}
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!selectedReviewerId || submitting}>
            {submitting && <InlineSpinner className="h-4 w-4 border-white/30 border-t-white" />}
            {submitting ? 'Submitting...' : 'Submit for Review'}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  )
}
