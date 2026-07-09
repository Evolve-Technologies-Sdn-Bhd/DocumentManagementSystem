import React, { useState, useEffect, useRef } from 'react'
import * as ReactDOM from 'react-dom'
import api from '../api/axios'

export default function SupersedeObsoleteModal({ isOpen, onClose, document, actionType, onSubmit }) {
  const [formData, setFormData] = useState({
    fileCode: '',
    title: document?.title || '',
    documentType: document?.documentType || '',
    version: document?.version || '',
    requestedBy: '',
    action: actionType || 'SUPERSEDE',
    reason: '',
    supersedingFileCode: ''
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [allPublishedDocs, setAllPublishedDocs] = useState([])
  const [filteredDocs, setFilteredDocs] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (isOpen && document) {
      setFormData({
        fileCode: document.fileCode || '',
        title: document.title || '',
        documentType: document.documentType || '',
        version: document.version || '',
        requestedBy: '',
        action: actionType || 'SUPERSEDE',
        reason: '',
        supersedingFileCode: ''
      })
      setSearchQuery('')
      setShowDropdown(false)
      setError('')
      // Load all published documents when modal opens
      loadPublishedDocuments()
    }
  }, [isOpen, document, actionType])

  // Load all published documents
  const loadPublishedDocuments = async () => {
    setLoadingDocs(true)
    try {
      const res = await api.get('/documents/published')
      const docs = res.data.data || []
      
      // Filter out current document and already superseded/obsolete documents
      const filtered = docs.filter(doc => 
        doc.id !== document?.id && 
        doc.status === 'PUBLISHED'
      )
      
      setAllPublishedDocs(filtered)
      setFilteredDocs(filtered)
    } catch (error) {
      console.error('Failed to load published documents:', error)
      setAllPublishedDocs([])
      setFilteredDocs([])
    } finally {
      setLoadingDocs(false)
    }
  }

  // Filter documents based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredDocs(allPublishedDocs)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = allPublishedDocs.filter(doc => 
        doc.fileCode?.toLowerCase().includes(query) ||
        doc.title?.toLowerCase().includes(query)
      )
      setFilteredDocs(filtered)
    }
  }, [searchQuery, allPublishedDocs])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }

    if (typeof window !== 'undefined') {
      window.document.addEventListener('mousedown', handleClickOutside)
      return () => window.document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSelectDocument = (doc) => {
    setFormData(prev => ({
      ...prev,
      supersedingFileCode: doc.fileCode
    }))
    setSearchQuery(doc.fileCode + ' - ' + doc.title)
    setShowDropdown(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validation
    if (!formData.action) {
      setError('Please select an action type')
      return
    }
    
    if (!formData.reason.trim()) {
      setError('Please provide a reason')
      return
    }

    if (formData.action === 'SUPERSEDE' && !formData.supersedingFileCode) {
      setError('Please select a superseding document')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Create a supersede/obsolete request that will go through review and approval
      const payload = {
        documentId: document.id,
        actionType: formData.action,
        reason: formData.reason.trim()
      }
      
      // Add superseding document ID if it's a SUPERSEDE action
      if (formData.action === 'SUPERSEDE' && formData.supersedingFileCode) {
        // Find the superseding document ID by file code
        const supersedingDoc = allPublishedDocs.find(doc => doc.fileCode === formData.supersedingFileCode)
        if (supersedingDoc) {
          payload.supersedingDocId = supersedingDoc.id
        }
      }

      await api.post('/supersede-requests', payload)
      
      onSubmit?.()
      handleClose()
    } catch (error) {
      console.error('Failed to submit:', error)
      setError(error.response?.data?.message || 'Failed to create request')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      fileCode: '',
      title: '',
      documentType: '',
      version: '',
      requestedBy: '',
      action: 'SUPERSEDE',
      reason: '',
      supersedingFileCode: ''
    })
    setSearchQuery('')
    setShowDropdown(false)
    setError('')
    onClose()
  }

  if (!isOpen) return null

  const modal = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Request Supersede / Obsolete Document</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info Box */}
        <div className="px-6 pt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">
              Please make sure a replacement file is available before requesting to supersede, and ensure it goes through the review and approval process.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* File Code and Action Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.fileCode}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Action Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.action}
                onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="SUPERSEDE">Supersede</option>
                <option value="OBSOLETE">Obsolete</option>
              </select>
            </div>
          </div>

          {/* Document Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700"
            />
          </div>

          {/* Document Type and Version */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Type <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.documentType}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Version / Revision No.
              </label>
              <input
                type="text"
                value={formData.version}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700"
              />
            </div>
          </div>

          {/* Superseding Document Search (only for SUPERSEDE action) */}
          {formData.action === 'SUPERSEDE' && (
            <div className="relative" ref={dropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Superseding Document <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowDropdown(true)
                  if (!e.target.value) {
                    setFormData({ ...formData, supersedingFileCode: '' })
                  }
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search file codes..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              
              {/* Dropdown for available documents */}
              {showDropdown && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {loadingDocs ? (
                    <div className="px-3 py-2 text-sm text-gray-500 text-center">
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="ml-2">Loading documents...</span>
                    </div>
                  ) : filteredDocs.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">No published documents found</div>
                  ) : (
                    filteredDocs.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => handleSelectDocument(doc)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                      >
                        <div className="text-sm font-medium text-gray-900">{doc.fileCode}</div>
                        <div className="text-xs text-gray-600">{doc.title}</div>
                        {doc.projectCategory && (
                          <div className="text-xs text-blue-600 mt-0.5">
                            {doc.projectCategory}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Requested By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Requested By <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.requestedBy}
              onChange={(e) => setFormData({ ...formData, requestedBy: e.target.value })}
              placeholder="Enter requester name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for {formData.action === 'SUPERSEDE' ? 'Supersede' : 'Obsolete'} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Enter reason for supersede or obsolete"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={4}
              required
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
