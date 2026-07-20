import React, { useState, useEffect } from 'react'
import api from '../api/axios'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import SelectField from './ui/SelectField'
import InlineSpinner from './ui/InlineSpinner'
import AsyncActionStatus from './ui/AsyncActionStatus'
import useLoadingProgress from '../hooks/useLoadingProgress'

export default function RequestSupersedeModal({ onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    fileCode: '',
    title: '',
    documentType: '',
    version: '',
    action: 'SUPERSEDE',
    reason: '',
    supersedingFileCode: ''
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [publishedDocs, setPublishedDocs] = useState([])
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [showDocumentSearch, setShowDocumentSearch] = useState(false)
  const [loadingPublishedDocs, setLoadingPublishedDocs] = useState(false)
  const [allPublishedDocs, setAllPublishedDocs] = useState([])
  const loadProgress = useLoadingProgress(loadingPublishedDocs, { start: 20, max: 74, stepMs: 180 })
  const submitProgress = useLoadingProgress(loading)

  // Load published documents to select from
  useEffect(() => {
    loadPublishedDocuments()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showResults && !event.target.closest('.superseding-doc-search')) {
        setShowResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showResults])

  const loadPublishedDocuments = async () => {
    try {
      setLoadingPublishedDocs(true)
      const res = await api.get('/documents/my-status?status=PUBLISHED&limit=1000')
      const docs = res.data.data?.documents || []
      setPublishedDocs(docs)
      setAllPublishedDocs(docs)
      
      // Initialize search results with all available documents
      const availableDocs = docs.filter(doc => 
        doc.rawStatus !== 'SUPERSEDED' && 
        doc.rawStatus !== 'OBSOLETE'
      )
      setSearchResults(availableDocs)
    } catch (error) {
      console.error('Failed to load published documents:', error)
      setPublishedDocs([])
      setAllPublishedDocs([])
    } finally {
      setLoadingPublishedDocs(false)
    }
  }

  // Search for published documents to replace (client-side filtering)
  const handleSearch = (query) => {
    setSearchQuery(query)
    setShowResults(true)
    
    if (!query.trim()) {
      // Show all available published docs when empty
      const filtered = allPublishedDocs.filter(doc => 
        (!selectedDoc || doc.id !== selectedDoc.id) && 
        doc.rawStatus !== 'SUPERSEDED' && 
        doc.rawStatus !== 'OBSOLETE'
      )
      setSearchResults(filtered)
      return
    }

    // Filter available published documents based on query
    const filtered = allPublishedDocs.filter(doc => {
      // Don't show the document being superseded
      if (selectedDoc && doc.id === selectedDoc.id) return false
      
      // Don't show already superseded/obsolete documents
      if (doc.rawStatus === 'SUPERSEDED' || doc.rawStatus === 'OBSOLETE') return false
      
      // Search in file code, title, and document type
      const searchText = query.toLowerCase()
      return (
        doc.fileCode?.toLowerCase().includes(searchText) ||
        doc.title?.toLowerCase().includes(searchText) ||
        doc.documentType?.toLowerCase().includes(searchText)
      )
    })
    
    setSearchResults(filtered)
  }

  const handleSelectSupersedingDocument = (doc) => {
    setFormData(prev => ({
      ...prev,
      supersedingFileCode: doc.fileCode,
      supersedingDocId: doc.id // Store superseding document ID for API call
    }))
    setSearchQuery(doc.fileCode + ' - ' + doc.title)
    setShowResults(false)
  }

  const handleSelectDocumentToObsolete = (doc) => {
    setSelectedDoc(doc)
    setFormData({
      fileCode: doc.fileCode,
      title: doc.title,
      documentType: doc.documentType || '',
      version: doc.version,
      documentId: doc.id, // Store document ID for API call
      action: formData.action,
      reason: formData.reason,
      supersedingFileCode: formData.supersedingFileCode
    })
    setShowDocumentSearch(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validation
    if (!formData.fileCode) {
      setError('Please select a document')
      return
    }
    
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
      // Create supersede/obsolete request
      const payload = {
        documentId: selectedDoc.id,
        actionType: formData.action,
        reason: formData.reason
      }

      // Add superseding document ID if action is SUPERSEDE
      if (formData.action === 'SUPERSEDE' && formData.supersedingDocId) {
        payload.supersedingDocId = formData.supersedingDocId
      }

      await api.post('/supersede-requests', payload)
      
      // Call onSubmit callback to close modal and refresh list
      if (onSubmit) {
        onSubmit(formData)
      }
      
      // Close modal
      onClose()
    } catch (error) {
      console.error('Failed to submit:', error)
      setError(error.response?.data?.message || 'Failed to create request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Document Selection Modal */}
      {showDocumentSearch && (
        <Modal onClose={loading ? undefined : () => setShowDocumentSearch(false)} closeOnBackdrop={!loading} size="lg">
          <ModalHeader title="Select Document to Supersede/Obsolete" onClose={() => setShowDocumentSearch(false)} />
          <ModalBody>
            <div className="space-y-3">
              {loadingPublishedDocs ? (
                <AsyncActionStatus
                  title="Loading published documents"
                  message="Available controlled documents are being prepared for selection."
                  progress={loadProgress}
                  busy
                />
              ) : null}
              {publishedDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => handleSelectDocumentToObsolete(doc)}
                  className="w-full text-left p-4 border border-border rounded-2xl bg-surface hover:bg-surface-muted transition-colors"
                >
                  <div className="font-semibold text-ink">{doc.fileCode}</div>
                  <div className="text-sm text-ink-secondary">{doc.title}</div>
                  <div className="text-xs text-ink-muted mt-1">
                    {doc.documentType} • Version {doc.version}
                  </div>
                </button>
              ))}
              {publishedDocs.length === 0 ? (
                <div className="text-center py-8 text-ink-muted">No published documents found</div>
              ) : null}
            </div>
          </ModalBody>
        </Modal>
      )}

      <Modal onClose={loading ? undefined : onClose} closeOnBackdrop={!loading} size="md">
        <form onSubmit={handleSubmit}>
          <ModalHeader title="Request Supersede / Obsolete Document" onClose={loading ? undefined : onClose} />

          <ModalBody className="space-y-4">
            {loadingPublishedDocs ? (
              <AsyncActionStatus
                title="Loading document options"
                message="Published documents are being prepared for request selection."
                progress={loadProgress}
                busy
              />
            ) : null}
            {loading ? (
              <AsyncActionStatus
                title="Submitting request"
                message="Your supersede or obsolete request is being saved for review."
                progress={submitProgress}
                busy
              />
            ) : null}
            <AppSurface variant="muted" padding="md" className="border border-blue-200 bg-blue-50 text-sm text-blue-800">
              Please make sure a replacement file is available before requesting to supersede, and ensure it goes through the review and approval process.
            </AppSurface>
            {error ? (
              <AsyncActionStatus
                title="Unable to continue"
                message={error}
                tone="error"
              />
            ) : null}

            {/* Select Document Button */}
            {!formData.fileCode && (
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">
                  Select Document <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowDocumentSearch(true)}
                  className="w-full rounded-[18px] border-2 border-dashed border-border bg-surface-muted px-4 py-4 text-sm font-semibold text-ink-secondary hover:border-brand hover:text-brand transition-colors"
                >
                  <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Click to select a published document
                </button>
              </div>
            )}

            {/* Selected Document Info */}
            {formData.fileCode && (
              <AppSurface variant="muted" padding="md">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Selected Document</label>
                    <div className="mt-2 space-y-1">
                      <div className="text-sm font-semibold text-ink">{formData.fileCode}</div>
                      <div className="text-sm text-ink-secondary">{formData.title}</div>
                      <div className="text-xs text-ink-muted">
                        {formData.documentType} • Version {formData.version}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDoc(null)
                      setFormData({
                        fileCode: '',
                        title: '',
                        documentType: '',
                        version: '',
                        action: formData.action,
                        reason: formData.reason,
                        supersedingFileCode: ''
                      })
                      setSearchQuery('')
                    }}
                    className="text-ink-soft hover:text-ink"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </AppSurface>
            )}

            {/* Action Type */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                Document Action Type <span className="text-red-500">*</span>
              </label>
              <SelectField
                value={formData.action}
                onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                required
                disabled={!formData.fileCode}
              >
                <option value="SUPERSEDE">Supersede</option>
                <option value="OBSOLETE">Obsolete</option>
              </SelectField>
            </div>

            {/* Superseding Document Search (only for SUPERSEDE action) */}
            {formData.action === 'SUPERSEDE' && formData.fileCode && (
              <div className="relative superseding-doc-search">
                <label className="block text-sm font-medium text-ink-secondary mb-2">
                  Search Superseding Document <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <TextInput
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => {
                      // Show all available documents when clicked
                      if (!searchQuery.trim()) {
                        const filtered = allPublishedDocs.filter(doc => 
                          (!selectedDoc || doc.id !== selectedDoc.id) && 
                          doc.rawStatus !== 'SUPERSEDED' && 
                          doc.rawStatus !== 'OBSOLETE'
                        )
                        setSearchResults(filtered)
                      }
                      setShowResults(true)
                    }}
                    placeholder="Search by file code or title..."
                    className="pr-10"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    {searching ? (
                      <InlineSpinner className="h-4 w-4 border-2" />
                    ) : (
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    )}
                  </div>
                </div>
                
                {/* Search Results Dropdown */}
                {showResults && (
                  <AppSurface padding="none" className="absolute z-10 w-full mt-1 max-h-60 overflow-y-auto rounded-2xl">
                    {loadingPublishedDocs ? (
                      <div className="px-4 py-3 text-sm text-ink-muted text-center">
                        Loading documents...
                      </div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => handleSelectSupersedingDocument(doc)}
                          className="w-full text-left px-4 py-3 hover:bg-surface-muted border-b border-border/70 last:border-0"
                        >
                          <div className="font-semibold text-ink">{doc.fileCode}</div>
                          <div className="text-sm text-gray-600">{doc.title}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {doc.documentType} • Version {doc.version}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-ink-muted text-center">
                        No published documents found
                      </div>
                    )}
                  </AppSurface>
                )}

                <p className="mt-1 text-xs text-ink-muted">
                  Search for published documents only. Documents already marked as superseded or obsolete will not appear.
                </p>
              </div>
            )}


            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">
                Reason for {formData.action === 'SUPERSEDE' ? 'Supersede' : 'Obsolete'} <span className="text-red-500">*</span>
              </label>
              <TextArea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Enter reason for supersede or obsolete"
                className="resize-none"
                rows={4}
                required
                disabled={!formData.fileCode}
              />
            </div>
          </ModalBody>

          <ModalFooter className="flex-wrap justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || loadingPublishedDocs || !formData.fileCode} loading={loading} loadingText={`Submitting... ${submitProgress}%`}>
              Submit
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  )
}
