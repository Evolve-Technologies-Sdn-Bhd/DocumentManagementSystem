import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import api from '../api/axios'
import { AlertModal } from './ConfirmModal'

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

  const modal = (
    <>
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
      <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={handleClose} />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Assign Reviewer</h2>
              <p className="text-sm text-gray-600 mt-1">{document.fileCode}: {document.title}</p>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="text-center py-8 text-gray-500">
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span>Loading reviewers...</span>
                </div>
              </div>
            ) : availableReviewers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No reviewers available</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-4">
                  Select a reviewer for this document:
                </p>
                {availableReviewers.map((reviewer) => (
                  <label
                    key={reviewer.id}
                    className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                      selectedReviewerId === reviewer.id 
                        ? 'bg-blue-50 border-blue-200' 
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reviewer"
                      checked={selectedReviewerId === reviewer.id}
                      onChange={() => handleSelectReviewer(reviewer.id)}
                      className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {reviewer.firstName && reviewer.lastName
                          ? `${reviewer.firstName} ${reviewer.lastName}`
                          : reviewer.email}
                      </div>
                      {reviewer.position && (
                        <div className="text-xs text-gray-500">{reviewer.position}</div>
                      )}
                      {reviewer.department && (
                        <div className="text-xs text-gray-500">{reviewer.department}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
            
            {selectedReviewerId && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-900 font-medium">
                  1 reviewer selected
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedReviewerId || submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit for Review'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}
