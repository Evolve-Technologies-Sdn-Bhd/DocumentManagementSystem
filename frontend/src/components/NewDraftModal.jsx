import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import api from '../api/axios'
import { usePreferences } from '../contexts/PreferencesContext'
import { useNavigate } from 'react-router-dom'
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import TextArea from './ui/TextArea'
import InlineSpinner from './ui/InlineSpinner'
import SmartForm from './smartdocuments/SmartForm'


function SearchableSingleSelect({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  noResultsLabel,
  disabled = false,
  loading = false,
  clearLabel = 'Clear',
  loadingLabel = 'Loading...',
  ...rest
}) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value)) || null,
    [options, value]
  )

  const filteredOptions = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase()
    if (!normalizedSearch) return options

    return options.filter((option) =>
      `${option.label} ${option.searchText || ''}`.toLowerCase().includes(normalizedSearch)
    )
  }, [options, searchValue])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (disabled) {
      setOpen(false)
      setSearchValue('')
    }
  }, [disabled])

  const handleSelect = (option) => {
    onChange(option.value, option)
    setOpen(false)
    setSearchValue('')
  }

  return (
    <div ref={containerRef} className="relative" {...rest}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev)
        }}
        disabled={disabled}
        className={`flex min-h-[42px] w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
          disabled ? 'cursor-not-allowed bg-gray-50 text-gray-500' : ''
        } ${open ? 'ring-2 ring-blue-500/20' : ''}`}
      >
        <span className={selectedOption ? 'text-gray-900' : 'text-gray-500'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="ml-3 text-xs text-gray-500">{open ? '▲' : '▼'}</span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-dms-lg">
          <div className="border-b border-gray-200 p-3">
            <input
              ref={inputRef}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-gray-500">
              <span>{loading ? loadingLabel : `${filteredOptions.length} result${filteredOptions.length === 1 ? '' : 's'}`}</span>
              {searchValue ? (
                <button
                  type="button"
                  onClick={() => setSearchValue('')}
                  className="rounded-lg px-2 py-1 font-medium transition hover:bg-gray-50 hover:text-gray-900"
                >
                  {clearLabel}
                </button>
              ) : (
                <span>Type to filter</span>
              )}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {loading ? (
              <div className="rounded-xl px-3 py-4 text-sm text-gray-500">{loadingLabel}</div>
            ) : filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = String(option.value) === String(value)
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                      isSelected ? 'bg-blue-50 text-gray-900' : 'text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{option.label}</div>
                      {option.meta?.length ? (
                        <div className="mt-1 space-y-0.5">
                          {option.meta.map((metaLine) => (
                            <div key={metaLine} className="text-xs text-gray-500">
                              {metaLine}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {isSelected ? <span className="text-xs font-medium text-blue-600">Selected</span> : null}
                  </button>
                )
              })
            ) : (
              <div className="rounded-xl px-3 py-4 text-sm text-gray-500">{noResultsLabel}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

const getReviewerDisplayName = (reviewer) => {
  if (!reviewer) return ''
  const fullName = `${reviewer.firstName || ''} ${reviewer.lastName || ''}`.trim()
  return fullName || reviewer.email || ''
}

export default function NewDraftModal({ isOpen, onClose, onSubmit }) {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    fileCode: '',
    title: '',
    versionNo: '',
    documentType: '',
    comments: '',
    reviewerId: null,
    divisionId: ''
  })
  const [loading, setLoading] = useState(false)
  const [documentTypes, setDocumentTypes] = useState([])
  const [loadingDocTypes, setLoadingDocTypes] = useState(true)
  const [acknowledgedDocs, setAcknowledgedDocs] = useState([])
  const [selectedAcknowledgedDoc, setSelectedAcknowledgedDoc] = useState(null)
  const [loadingAcknowledgedDocs, setLoadingAcknowledgedDocs] = useState(false)
  const [divisions, setDivisions] = useState([])
  const [loadingDivisions, setLoadingDivisions] = useState(true)
  const [availableReviewers, setAvailableReviewers] = useState([])
  const [loadingReviewers, setLoadingReviewers] = useState(true)
  const [searchFileCode, setSearchFileCode] = useState('')
  const [showFileCodeDropdown, setShowFileCodeDropdown] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [smartTemplates, setSmartTemplates] = useState([])
  const [smartTemplatesLoading, setSmartTemplatesLoading] = useState(false)
  const [smartStyleProfiles, setSmartStyleProfiles] = useState([])
  const [smartStyleProfilesLoading, setSmartStyleProfilesLoading] = useState(false)
  const [allSmartTemplates, setAllSmartTemplates] = useState([])
  const [allSmartStyleProfiles, setAllSmartStyleProfiles] = useState([])
  const [selectedSmartTemplateVersionId, setSelectedSmartTemplateVersionId] = useState('')
  const [selectedSmartStyleProfileId, setSelectedSmartStyleProfileId] = useState('')
  const [currentStep, setCurrentStep] = useState(1)
  const [loadedTemplateVersion, setLoadedTemplateVersion] = useState(null)
  const [loadingTemplateFields, setLoadingTemplateFields] = useState(false)
  const [smartFieldValues, setSmartFieldValues] = useState({})
  const [creationMode, setCreationMode] = useState('SMART_DOCUMENT')
  const [uploadedFile, setUploadedFile] = useState(null)

  const documentTypeOptions = useMemo(
    () => documentTypes.map((type) => ({
      id: type.id,
      value: type.name,
      label: type.name,
      searchText: `${type.name} ${type.prefix || ''}`,
      meta: type.prefix ? [`Prefix: ${type.prefix}`] : []
    })),
    [documentTypes]
  )

  const reviewerOptions = useMemo(
    () => availableReviewers.map((reviewer) => ({
      id: reviewer.id,
      value: reviewer.id,
      label: getReviewerDisplayName(reviewer),
      searchText: [
        reviewer.firstName,
        reviewer.lastName,
        reviewer.email,
        reviewer.position,
        reviewer.department
      ].filter(Boolean).join(' '),
      meta: [reviewer.position, reviewer.department, reviewer.email].filter(Boolean)
    })),
    [availableReviewers]
  )

  const divisionOptions = useMemo(
    () => divisions.map((division) => ({
      id: division.id,
      value: String(division.id),
      label: division.name || division.code || `Division ${division.id}`,
      searchText: [division.code, division.name].filter(Boolean).join(' '),
      meta: [division.code].filter(Boolean)
    })),
    [divisions]
  )

  useEffect(() => {
    if (isOpen) {
      (async () => {
        try {
          loadDocumentTypes()
          loadDivisions()
          await loadSmartOptions()
        } catch (e) {
          console.error('Init error:', e)
        }
      })()
    }
  }, [isOpen])

  const loadSmartOptions = async () => {
    setSmartTemplatesLoading(true)
    setSmartStyleProfilesLoading(true)
    try {
      const [tplRes, styRes] = await Promise.all([
        api.get('/smart-templates'),
        api.get('/smart-document-style').catch(() => ({ data: { data: [] }}))
      ])
      const rawTemplates = tplRes?.data?.data?.templates || tplRes?.data?.templates
                            || (Array.isArray(tplRes?.data?.data) ? tplRes.data.data : [])
                            || (Array.isArray(tplRes?.data) ? tplRes.data : [])
      const allOpts = []
      for (const t of rawTemplates) {
        if (!t) continue
        if (t.isActive === false || t.isActive === 'false') continue
        const templateName = t.templateName || t.name || ''
        const versions = Array.isArray(t.versions) ? t.versions : []
        const active =
          versions.find(v => v && (v.isCurrent === true || v.isCurrent === 'true'))
          || versions.find(v => v && (v.status === 'PUBLISHED' || v.status === 'ACTIVE' || v.status === 'LOCKED'))
          || versions.find(v => v && v.isLocked === true)
          || versions[0]
        const styleProfileId = t.styleProfileId || t.styleProfile?.id || null
        if (active && (active.id || t.id)) {
          const verId = active.id || t.id
          allOpts.push({
            value: String(verId),
            label: `${templateName || 'Unnamed Template'}${active.versionNo ? ` (v${active.versionNo})` : ''}`,
            searchText: [templateName, t.templateCode, t.description].filter(Boolean).join(' '),
            id: verId,
            documentType: t.documentType ? (t.documentType.name || t.documentType.documentType) : null,
            documentTypeId: t.documentTypeId || null,
            styleProfileId: styleProfileId,
            meta: [
              t.documentType ? `For: ${t.documentType.name || t.documentType.documentType}` : null,
              t.templateCode,
              t.description
            ].filter(Boolean).slice(0, 2)
          })
        } else if (t.id && t.status === 'ACTIVE') {
          allOpts.push({
            value: String(t.id),
            label: `${templateName || 'Template'}`,
            searchText: t.description || '',
            id: t.id,
            documentTypeId: t.documentTypeId || null,
            documentType: null,
            styleProfileId: styleProfileId
          })
        }
      }
      setAllSmartTemplates(allOpts)
      setSmartTemplates(allOpts)

      const rawSp = styRes?.data?.data?.styleProfiles || styRes?.data?.styleProfiles
                  || (Array.isArray(styRes?.data?.data) ? styRes.data.data : [])
                  || (Array.isArray(styRes?.data) ? styRes.data : [])
      const allSp = rawSp
        .filter(s => s && s.isActive !== false)
        .map(s => ({
          value: String(s.id),
          label: s.profileName || s.name || 'Unnamed Style',
          searchText: [s.profileName, s.description, s.name].filter(Boolean).join(' '),
          meta: [s.description].filter(Boolean),
          id: s.id
        }))
      setAllSmartStyleProfiles(allSp)
      setSmartStyleProfiles(allSp)
    } catch (e) {
      console.error('Failed to load smart options:', e)
      setAllSmartTemplates([])
      setSmartTemplates([])
      setAllSmartStyleProfiles([])
      setSmartStyleProfiles([])
    } finally {
      setSmartTemplatesLoading(false)
      setSmartStyleProfilesLoading(false)
    }
  }

  const loadTemplateFields = useCallback(async (versionId) => {
    const verIdNum = Number(versionId)
    if (!verIdNum || !Number.isFinite(verIdNum)) {
      setLoadedTemplateVersion(null)
      return null
    }
    setLoadingTemplateFields(true)
    setLoadedTemplateVersion(null)
    try {
      const [secRes, fieldRes] = await Promise.all([
        api.get(`/smart-templates/versions/${verIdNum}/sections`),
        api.get(`/smart-templates/versions/${verIdNum}/fields`)
      ])
      const sections = secRes?.data?.data?.sections || secRes?.data?.sections || (Array.isArray(secRes?.data?.data) ? secRes.data.data : []) || []
      const formFields = fieldRes?.data?.data?.fields || fieldRes?.data?.fields || (Array.isArray(fieldRes?.data?.data) ? fieldRes.data.data : []) || []
      const tv = { id: verIdNum, sections, formFields }
      setLoadedTemplateVersion(tv)
      return tv
    } catch (e) {
      console.error('Failed to load template sections/fields:', e)
      setLoadedTemplateVersion(null)
      return null
    } finally {
      setLoadingTemplateFields(false)
    }
  }, [])

  useEffect(() => {
    const docTypeId = (() => {
      if (!formData.documentType) return null
      const match = documentTypes.find((t) => t.name === formData.documentType) || documentTypes[0]
      return match ? match.id : null
    })()
    const filterByDocType = allSmartTemplates.filter((opt) => {
      if (!docTypeId) return true
      if (!opt.documentTypeId) return true
      return String(opt.documentTypeId) === String(docTypeId)
    })
    setSmartTemplates(filterByDocType)
    if (filterByDocType.length > 0) {
      const currentStillValid = filterByDocType.some((o) => String(o.value) === String(selectedSmartTemplateVersionId))
      if (!selectedSmartTemplateVersionId || !currentStillValid) {
        const exact = filterByDocType.find((o) => String(o.documentTypeId) === String(docTypeId))
        if (exact) {
          setSelectedSmartTemplateVersionId(String(exact.value))
        } else if (filterByDocType.length === 1 && !selectedSmartTemplateVersionId) {
          setSelectedSmartTemplateVersionId(String(filterByDocType[0].value))
        } else if (!currentStillValid) {
          setSelectedSmartTemplateVersionId('')
        }
      }
    } else if (selectedSmartTemplateVersionId && docTypeId) {
      setSelectedSmartTemplateVersionId('')
    }
  }, [formData.documentType, allSmartTemplates, documentTypes])

  useEffect(() => {
    if (!selectedSmartTemplateVersionId) {
      return
    }
    const tpl = allSmartTemplates.find(o => String(o.value) === String(selectedSmartTemplateVersionId))
    if (tpl && tpl.styleProfileId) {
      const spExists = allSmartStyleProfiles.some(sp => String(sp.value) === String(tpl.styleProfileId))
      if (spExists) {
        setSelectedSmartStyleProfileId(String(tpl.styleProfileId))
      }
    }
  }, [selectedSmartTemplateVersionId, allSmartTemplates, allSmartStyleProfiles])

  useEffect(() => {
    if (isOpen && formData.divisionId) {
      loadReviewers(formData.divisionId)
    }
  }, [isOpen, formData.divisionId])

  useEffect(() => {
    if (formData.documentType) {
      loadAcknowledgedDocuments(formData.documentType)
    } else {
      setAcknowledgedDocs([])
    }
  }, [formData.documentType])

  const loadDocumentTypes = async () => {
    setLoadingDocTypes(true)
    try {
      const res = await api.get('/system/config/document-types')
      setDocumentTypes(res.data.data.documentTypes || [])
    } catch (error) {
      console.error('Failed to load document types:', error)
    } finally {
      setLoadingDocTypes(false)
    }
  }

  const loadAcknowledgedDocuments = async (documentType) => {
    setLoadingAcknowledgedDocs(true)
    try {
      const res = await api.get('/documents/drafts', {
        params: {
          limit: 100
        }
      })

      const docs = res.data.data || res.data.documents || []

      const filtered = docs.filter(doc => {
        const hasValidFileCode = doc.fileCode && 
                                 !doc.fileCode.startsWith('PENDING-') && 
                                 doc.fileCode !== '-'
        
        const matchesType = doc.documentType === documentType

        return hasValidFileCode && matchesType
      })

      setAcknowledgedDocs(filtered)
    } catch (error) {
      console.error('Failed to load documents:', error)
      setAcknowledgedDocs([])
    } finally {
      setLoadingAcknowledgedDocs(false)
    }
  }

  const loadDivisions = async () => {
    setLoadingDivisions(true)
    try {
      const divisionsRes = await api.get('/divisions')
      const nextDivisions = divisionsRes?.data?.data?.divisions || []
      setDivisions(nextDivisions)

      const last = String(localStorage.getItem('lastActiveDivisionId') || '').trim()
      const picked = last && nextDivisions.some((d) => String(d.id) === last)
        ? last
        : nextDivisions[0]?.id
          ? String(nextDivisions[0].id)
          : ''

      setFormData((prev) => ({ ...prev, divisionId: prev.divisionId || picked }))
    } catch {
      setDivisions([])
    } finally {
      setLoadingDivisions(false)
    }
  }

  const loadReviewers = async (divisionId) => {
    setLoadingReviewers(true)
    try {
      const res = await api.get('/users', {
        params: {
          ...(divisionId ? { divisionId } : {}),
          roleName: 'reviewer'
        }
      })
      const users = res.data.data?.users || res.data.users || []
      
      const currentUserId = getCurrentUserId()
      
      const activeUsers = users.filter(user => 
        user.status === 'ACTIVE' && user.id !== currentUserId
      )
      setAvailableReviewers(activeUsers)
    } catch (error) {
      console.error('Failed to load reviewers:', error)
      setAvailableReviewers([])
    } finally {
      setLoadingReviewers(false)
    }
  }

  const getCurrentUserId = () => {
    try {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const user = JSON.parse(userStr)
        return user.id
      }
    } catch (error) {
      console.error('Error getting current user:', error)
    }
    return null
  }

  const handleFileCodeSelect = (doc) => {
    setFormData({
      ...formData,
      fileCode: doc.fileCode,
      title: doc.title,
      versionNo: doc.version || '1.0',
      documentType: doc.documentType,
      divisionId: doc.divisionId ? String(doc.divisionId) : (formData.divisionId || ''),
    })
    setSelectedAcknowledgedDoc(doc)
    setSearchFileCode(doc.fileCode)
    setShowFileCodeDropdown(false)
  }

  const handleDocumentTypeSelect = (documentType) => {
    setFormData((prev) => ({
      ...prev,
      documentType,
      fileCode: prev.documentType === documentType ? prev.fileCode : ''
    }))
    setSearchFileCode('')
    setShowFileCodeDropdown(false)
  }

  const handleReviewerSelect = (userId) => {
    setFormData((prev) => ({ ...prev, reviewerId: userId }))
  }

  const handleDivisionSelect = (divisionId) => {
    const next = divisionId ? String(divisionId) : ''
    setFormData((prev) => ({ ...prev, divisionId: next, reviewerId: null }))
    try {
      if (next) localStorage.setItem('lastActiveDivisionId', next)
    } catch {}
  }

  const filteredAcknowledgedDocs = acknowledgedDocs.filter(doc =>
    doc.fileCode.toLowerCase().includes(searchFileCode.toLowerCase()) ||
    doc.title.toLowerCase().includes(searchFileCode.toLowerCase())
  )

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFileCodeDropdown && !event.target.closest('.file-code-search')) {
        setShowFileCodeDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFileCodeDropdown])

  const handleSmartFieldChange = useCallback((fieldKey, newValue) => {
    setSmartFieldValues((prev) => ({ ...prev, [fieldKey]: newValue }))
  }, [])

  if (!isOpen) return null

  const isSmartMode = creationMode === 'SMART_DOCUMENT'
  const isUploadMode = creationMode === 'FILE_BASED'

  const buildCommonFormData = (includeReviewer = false) => {
    const formDataToSubmit = new FormData()
    formDataToSubmit.append('fileCode', formData.fileCode)
    formDataToSubmit.append('title', formData.title)
    formDataToSubmit.append('versionNo', formData.versionNo)
    formDataToSubmit.append('documentType', formData.documentType)
    formDataToSubmit.append('contentFormat', 'FILE')
    formDataToSubmit.append('comments', formData.comments)
    if (formData.divisionId) formDataToSubmit.append('divisionId', String(formData.divisionId))
    formDataToSubmit.append('creationMode', creationMode || 'FILE_BASED')
    if (isSmartMode && selectedSmartTemplateVersionId) {
      formDataToSubmit.append('smartTemplateVersionId', selectedSmartTemplateVersionId)
    }
    if (isSmartMode && selectedSmartStyleProfileId) {
      formDataToSubmit.append('smartDocumentStyleProfileId', selectedSmartStyleProfileId)
    }
    if (includeReviewer && formData.reviewerId) {
      formDataToSubmit.append('reviewers', JSON.stringify([formData.reviewerId]))
    }
    return formDataToSubmit
  }

  const persistSmartFieldValues = async (verId, workflowAction = 'DRAFT_EDIT') => {
    if (!verId) return
    if (!isSmartMode) return
    if (!smartFieldValues || typeof smartFieldValues !== 'object' || Object.keys(smartFieldValues).length === 0) return
    try {
      await api.put(
        `/smart-documents/document-versions/${verId}/field-values`,
        { fieldValues: smartFieldValues, workflowAction }
      )
    } catch (err) {
      console.warn('Failed to persist smart field values, continuing:', err?.message || err)
    }
  }

  const handleSaveAsDraft = async () => {
    if (isSmartMode && !selectedSmartTemplateVersionId) {
      setSubmitError('Please select a Smart Template to generate the document from. You can choose any active template above, or switch to "Upload Document" mode.')
      return
    }
    if (isSmartMode && !selectedSmartStyleProfileId) {
      setSubmitError('Please select a Document Style Profile. This is required to generate the document with proper formatting.')
      return
    }
    if (isUploadMode && !uploadedFile) {
      setSubmitError('Please upload a document file (DOCX, PDF, etc.) to proceed.')
      return
    }
    setLoading(true)
    setSubmitError(null)
    try {
      const formDataToSubmit = buildCommonFormData()
      formDataToSubmit.append('status', 'Draft')
      if (isSmartMode) {
        const placeholderBlob = new Blob(['smart-document-placeholder'], { type: 'text/plain' })
        const placeholderFile = new File([placeholderBlob], `smart-document-${Date.now()}.txt`, { type: 'text/plain' })
        formDataToSubmit.append('file', placeholderFile)
      } else if (isUploadMode && uploadedFile) {
        formDataToSubmit.append('file', uploadedFile)
      }

      const res = await api.post('/documents/drafts', formDataToSubmit, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const doc = res.data?.data?.document || res.data?.data || res.data
      const latestVersion = doc.latestVersion || (doc.versions && doc.versions[0]) || null
      const docId = doc.id
      const verId = latestVersion?.id

      if (!docId || !verId) {
        setSubmitError('Draft created but could not determine document/version IDs.')
        return
      }

      if (isSmartMode) {
        await persistSmartFieldValues(verId, 'DRAFT_EDIT')
        try {
          navigate(`/smart-documents/edit/${docId}/${verId}`)
          return
        } catch (navError) {
          console.error('Smart Editor redirect failed:', navError)
        }
      }

      onClose()
      if (typeof onSubmit === 'function') onSubmit({ docId, verId })
      else try { navigate('/documents/drafts') } catch (_) { window.location.reload() }
    } catch (error) {
      console.error('Error saving draft:', error)
      const msg = error.response?.data?.message || error.message || 'Failed to save draft'
      setSubmitError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitForReview = async () => {
    if (isSmartMode && !selectedSmartTemplateVersionId) {
      setSubmitError('Please select a Smart Template, or switch to "Upload Document" mode.')
      return
    }
    if (isSmartMode && !selectedSmartStyleProfileId) {
      setSubmitError('Please select a Document Style Profile. This is required to generate the document with proper formatting.')
      return
    }
    if (isUploadMode && !uploadedFile) {
      setSubmitError('Please upload a document file to submit for review.')
      return
    }
    setLoading(true)
    setSubmitError(null)
    try {
      const formDataToSubmit = buildCommonFormData(true)
      formDataToSubmit.append('status', 'Ready for Review')
      if (isSmartMode) {
        const placeholderBlob = new Blob(['smart-document-placeholder'], { type: 'text/plain' })
        const placeholderFile = new File([placeholderBlob], `smart-document-${Date.now()}.txt`, { type: 'text/plain' })
        formDataToSubmit.append('file', placeholderFile)
      } else if (isUploadMode && uploadedFile) {
        formDataToSubmit.append('file', uploadedFile)
      }

      const res = await api.post('/documents/drafts/submit-for-review', formDataToSubmit, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const doc = res.data?.data?.document || res.data?.data || res.data
      const latestVersion = doc.latestVersion || (doc.versions && doc.versions[0]) || null
      const docId = doc.id
      const verId = latestVersion?.id

      if (!docId || !verId) {
        setSubmitError('Draft submitted but could not determine document/version IDs.')
        return
      }

      if (isSmartMode) {
        await persistSmartFieldValues(verId, 'SUBMIT_FOR_REVIEW_AUTOSAVE')
        try {
          navigate(`/smart-documents/edit/${docId}/${verId}`)
          return
        } catch (navError) {
          console.error('Smart Editor redirect failed:', navError)
        }
      }

      onClose()
      if (typeof onSubmit === 'function') onSubmit({ docId, verId })
      else try { navigate('/documents/drafts') } catch (_) { window.location.reload() }
    } catch (error) {
      console.error('Error submitting for review:', error)
      const msg = error.response?.data?.message || error.message || 'Failed to submit for review'
      setSubmitError(msg)
    } finally {
      setLoading(false)
    }
  }

  const isStep1Valid = () => {
    const base = Boolean(
      formData.fileCode &&
      formData.title &&
      formData.documentType
    )
    if (!base) return false
    if (isSmartMode) return Boolean(selectedSmartTemplateVersionId && selectedSmartStyleProfileId)
    if (isUploadMode) return Boolean(uploadedFile)
    return true
  }

  const handleGoToStep2 = async () => {
    if (!isSmartMode) return
    if (!isStep1Valid()) {
      const missing = []
      if (!formData.fileCode) missing.push('File Code')
      if (!formData.title) missing.push('Document Title')
      if (!formData.documentType) missing.push('Document Type')
      if (!selectedSmartTemplateVersionId) missing.push('Smart Template')
      if (!selectedSmartStyleProfileId) missing.push('Document Style Profile')
      setSubmitError(`Please complete all required fields in Step 1 before proceeding: ${missing.join(', ')}.`)
      return
    }
    setSubmitError(null)
    const tv = await loadTemplateFields(selectedSmartTemplateVersionId)
    if (!tv) {
      setSubmitError('Could not load Smart Template fields. Please try a different template or try again.')
      return
    }
    setCurrentStep(2)
  }

  const handleBackToStep1 = () => {
    setCurrentStep(1)
    setSubmitError(null)
  }

  const handleClose = () => {
    setFormData({
      fileCode: '',
      title: '',
      versionNo: '',
      documentType: '',
      comments: '',
      reviewerId: null,
      divisionId: ''
    })
    setSearchFileCode('')
    setSubmitError(null)
    setSelectedSmartTemplateVersionId('')
    setSelectedSmartStyleProfileId('')
    setCurrentStep(1)
    setLoadedTemplateVersion(null)
    setSmartFieldValues({})
    setCreationMode('SMART_DOCUMENT')
    setUploadedFile(null)
    onClose()
  }

  const stepOneFields = (
    <div className="space-y-4">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-900 mb-1">
            How would you like to create this draft? <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCreationMode('SMART_DOCUMENT')}
              className={`text-left rounded-lg border-2 p-4 transition-all ${
                isSmartMode
                  ? 'border-[#003366] bg-[#003366]/5 ring-2 ring-[#003366]/20'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-base font-semibold ${
                  isSmartMode ? 'bg-[#003366] text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  ✦
                </div>
                <div className="space-y-0.5">
                  <div className={`text-sm font-semibold ${
                    isSmartMode ? 'text-[#003366]' : 'text-gray-900'
                  }`}>
                    Use Smart Template
                  </div>
                  <div className="text-xs text-gray-500 leading-relaxed">
                    Auto-generate document from a pre-defined template with sections, form fields, and placeholders.
                  </div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setCreationMode('FILE_BASED')}
              className={`text-left rounded-lg border-2 p-4 transition-all ${
                isUploadMode
                  ? 'border-[#003366] bg-[#003366]/5 ring-2 ring-[#003366]/20'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-base font-semibold ${
                  isUploadMode ? 'bg-[#003366] text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  ⤴
                </div>
                <div className="space-y-0.5">
                  <div className={`text-sm font-semibold ${
                    isUploadMode ? 'text-[#003366]' : 'text-gray-900'
                  }`}>
                    Upload Own Document
                  </div>
                  <div className="text-xs text-gray-500 leading-relaxed">
                    Upload your own DOCX, PDF, or other file directly. No template fields required.
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              {t('doc_type')} <span className="text-red-500">*</span>
            </label>
            <SearchableSingleSelect
              value={formData.documentType}
              options={documentTypeOptions}
              onChange={handleDocumentTypeSelect}
              placeholder={loadingDocTypes ? t('loading_ellipsis') : t('select_doc_type')}
              searchPlaceholder={t('search_doc_type')}
              noResultsLabel={t('no_doc_type_found')}
              disabled={loadingDocTypes}
              loading={loadingDocTypes}
              clearLabel={t('clear_filter')}
              loadingLabel={t('loading_ellipsis')}
              data-tour-id="new-draft-doc-type"
            />
          </div>
        </div>

        <div className="relative file-code-search">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            {t('file_code')} <span className="text-red-500">*</span>
          </label>
          <TextInput
            type="text"
            required
            value={searchFileCode}
            onChange={(e) => {
              const value = e.target.value
              setSearchFileCode(value)
              setShowFileCodeDropdown(true)
              setFormData(prev => {
                if (!value) return { ...prev, fileCode: '', title: '', versionNo: '' }
                return { ...prev, fileCode: value }
              })
            }}
            onFocus={() => setShowFileCodeDropdown(true)}
            placeholder={t('search_file_codes')}
            disabled={!formData.documentType}
          />
          {!formData.documentType && (
            <p className="text-xs text-amber-700 mt-1">{t('select_doc_type_first')}</p>
          )}
          
          {showFileCodeDropdown && formData.documentType && (
            <AppSurface padding="none" className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-lg">
              {loadingAcknowledgedDocs ? (
                <div className="px-3 py-2 text-sm text-gray-500">{t('loading_ellipsis')}</div>
              ) : filteredAcknowledgedDocs.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">{t('no_file_codes_found')}</div>
              ) : (
                filteredAcknowledgedDocs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => handleFileCodeSelect(doc)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors border-b border-gray-200/70 last:border-0"
                  >
                    <div className="text-sm font-semibold text-gray-900">{doc.fileCode}</div>
                    <div className="text-xs text-gray-500">{doc.title}</div>
                    {doc.projectCategory && (
                      <div className="text-xs text-blue-600 mt-0.5">
                        {t('project_cat_label')} {doc.projectCategory.name}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">{t('version_label')} {doc.version}</div>
                  </button>
                ))
              )}
            </AppSurface>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              {t('document_title_col')} <span className="text-red-500">*</span>
            </label>
            <TextInput
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder={t('input_text')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              {t('version_revision')}
            </label>
            <TextInput
              type="text"
              value={formData.versionNo}
              onChange={(e) => setFormData({ ...formData, versionNo: e.target.value })}
              placeholder={t('input_text')}
            />
          </div>
        </div>

        {isSmartMode && (
          <div className="space-y-4 pt-1">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Smart Template (required) — The template with the sections, fields, and placeholders that will auto-generate your document.
              </label>
              <SearchableSingleSelect
                value={selectedSmartTemplateVersionId}
                options={smartTemplates}
                onChange={(val) => setSelectedSmartTemplateVersionId(val)}
                placeholder="Select Smart Template…"
                searchPlaceholder="Filter templates…"
                noResultsLabel="No active smart templates. Create one in Configuration > Template Management > Smart Templates first."
                disabled={false}
                loading={smartTemplatesLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Document Style Profile <span className="text-red-500">*</span> — Font families, company letterhead header, footer, etc. Default is set by the Smart Template. Manage in Configuration > Template Management > Document Style Profiles.
              </label>
              <SearchableSingleSelect
                value={selectedSmartStyleProfileId}
                options={smartStyleProfiles}
                onChange={(val) => setSelectedSmartStyleProfileId(val)}
                placeholder="Choose Style Profile (fonts, header, footer)"
                searchPlaceholder="Filter style profiles…"
                noResultsLabel="No style profiles found. Create one in Configuration > Template Management > Document Style Profiles first."
                disabled={false}
                loading={smartStyleProfilesLoading}
                clearLabel="Clear style"
              />
            </div>
          </div>
        )}

        {isUploadMode && (
          <div className="space-y-2 pt-1">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Upload Document <span className="text-red-500">*</span>
            </label>
            <div className={`rounded-lg border-2 border-dashed transition-colors ${
              uploadedFile ? 'border-[#003366] bg-[#003366]/5' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'
            } p-5`}>
              <input
                type="file"
                id="ndm-file-upload"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null
                  setUploadedFile(f)
                }}
                accept=".doc,.docx,.pdf,.txt,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg"
              />
              <label
                htmlFor="ndm-file-upload"
                className="flex flex-col items-center justify-center cursor-pointer w-full"
              >
                <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center mb-3 shadow-sm">
                  <svg className="w-6 h-6 text-[#003366]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                {uploadedFile ? (
                  <div className="text-center space-y-1 w-full">
                    <div className="text-sm font-semibold text-gray-900 truncate max-w-full">
                      {uploadedFile.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {uploadedFile.size ? `${(uploadedFile.size / 1024).toFixed(1)} KB` : ''}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        setUploadedFile(null)
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      ✕ Remove file
                    </button>
                  </div>
                ) : (
                  <div className="text-center space-y-1">
                    <div className="text-sm font-semibold text-gray-900">
                      Click to choose a file
                    </div>
                    <div className="text-xs text-gray-500">
                      or drag and drop — DOCX, PDF, XLSX, PPTX, images (max 50MB)
                    </div>
                  </div>
                )}
              </label>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            {t('comments_notes')}
          </label>
          <TextArea
            value={formData.comments}
            onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
            placeholder={t('input_text')}
            rows={3}
            className="resize-none"
          />
        </div>

        {divisions.length > 1 || loadingDivisions ? (
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Division <span className="text-red-500">*</span>
            </label>
            {loadingDivisions ? (
              <AppSurface variant="muted" padding="md" className="flex items-center gap-2 text-sm text-gray-500">
                <InlineSpinner className="h-4 w-4 border-2" />
                <span>{t('loading_ellipsis')}</span>
              </AppSurface>
            ) : (
              <SearchableSingleSelect
                value={formData.divisionId}
                options={divisionOptions}
                onChange={handleDivisionSelect}
                placeholder="Select division"
                searchPlaceholder="Search division..."
                noResultsLabel="No division found"
                clearLabel={t('clear_filter')}
                loadingLabel={t('loading_ellipsis')}
              />
            )}
          </div>
        ) : null}

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            {t('assign_reviewer_label')} <span className="text-red-500">*</span>
          </label>
          {loadingReviewers ? (
            <AppSurface variant="muted" padding="md" className="flex items-center gap-2 text-sm text-gray-500" data-tour-id="new-draft-assign-reviewer">
              <InlineSpinner className="h-4 w-4 border-2" />
              <span>{t('loading_reviewers')}</span>
            </AppSurface>
          ) : !formData.divisionId ? (
            <AppSurface variant="muted" padding="md" className="text-sm text-gray-500" data-tour-id="new-draft-assign-reviewer">
              Select division first
            </AppSurface>
          ) : availableReviewers.length === 0 ? (
            <AppSurface variant="muted" padding="md" className="text-sm text-gray-500" data-tour-id="new-draft-assign-reviewer">
              {t('no_reviewers')}
            </AppSurface>
          ) : (
            <div data-tour-id="new-draft-assign-reviewer">
              <SearchableSingleSelect
                value={formData.reviewerId}
                options={reviewerOptions}
                onChange={handleReviewerSelect}
                placeholder={t('select_reviewer')}
                searchPlaceholder={t('search_reviewer')}
                noResultsLabel={t('no_reviewer_found')}
                clearLabel={t('clear_filter')}
                loadingLabel={t('loading_ellipsis')}
              />
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">
            {formData.reviewerId ? t('reviewer_selected') : t('select_reviewer')}
          </p>
        </div>
    </div>
  )

  const selectedTplLabel = (() => {
    const opt = smartTemplates.find(o => String(o.value) === String(selectedSmartTemplateVersionId))
    return opt?.label || 'Template loaded'
  })()

  const stepTwoFields = (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="text-sm font-semibold text-gray-900">Step 1 Summary</h4>
          <button
            type="button"
            onClick={handleBackToStep1}
            className="text-xs font-medium text-[#003366] hover:underline"
          >
            ← Edit details
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 text-xs">
          <div>
            <span className="text-gray-500 font-medium">File Code:</span>
            <span className="ml-2 text-gray-900">{formData.fileCode}</span>
          </div>
          <div>
            <span className="text-gray-500 font-medium">Document Title:</span>
            <span className="ml-2 text-gray-900">{formData.title}</span>
          </div>
          <div>
            <span className="text-gray-500 font-medium">Document Type:</span>
            <span className="ml-2 text-gray-900">{formData.documentType}</span>
          </div>
          <div>
            <span className="text-gray-500 font-medium">Template:</span>
            <span className="ml-2 text-gray-900 truncate">{selectedTplLabel}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            Step 2 — Fill Document Form <span className="text-red-500">*</span>
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Complete the fields below. Mandatory fields are marked with <span className="text-red-500">*</span>.
          </p>
        </div>
      </div>

      {loadingTemplateFields ? (
        <AppSurface variant="muted" padding="lg" className="flex items-center justify-center gap-3 text-sm text-gray-500">
          <InlineSpinner className="h-5 w-5 border-2" />
          <span>Loading Smart Template sections and fields…</span>
        </AppSurface>
      ) : !loadedTemplateVersion ? (
        <AppSurface variant="muted" padding="lg" className="text-sm text-gray-500">
          Could not load the selected Smart Template fields.
          <button
            type="button"
            className="ml-2 font-medium text-[#003366] underline"
            onClick={() => loadTemplateFields(selectedSmartTemplateVersionId)}
          >
            Retry loading fields
          </button>
        </AppSurface>
      ) : loadedTemplateVersion.formFields.length === 0 ? (
        <AppSurface variant="muted" padding="lg" className="space-y-2">
          <p className="text-sm font-medium text-gray-900">No form fields defined for this Smart Template.</p>
          <p className="text-xs text-gray-500">
            This template does not have any sections or form fields yet. You can still submit the draft
            and fill in content later, or ask the template administrator to add fields.
          </p>
        </AppSurface>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <SmartForm
            templateVersion={loadedTemplateVersion}
            initialValues={smartFieldValues}
            onChange={handleSmartFieldChange}
            readonly={false}
            className="max-h-[480px] overflow-y-auto pr-2"
          />
        </div>
      )}
    </div>
  )

  const stepIndicator = (
    <ol className="flex items-center w-full mb-4 px-1">
      {[
        { n: 1, label: 'Basic Info' },
        { n: 2, label: isSmartMode ? 'Smart Form' : 'Upload & Submit' }
      ].map((s, i, arr) => {
        const isActive = currentStep === s.n || (isUploadMode && s.n === 2)
        const isDone = currentStep > s.n || (isUploadMode && s.n === 1)
        const isLast = i === arr.length - 1
        return (
          <li key={s.n} className={isLast ? 'flex items-center' : 'flex items-center w-full'}>
            <span className={`flex items-center justify-center shrink-0 w-8 h-8 rounded-full text-xs font-semibold border-2 transition-colors ${
              isActive && !isDone
                ? 'bg-[#003366] border-[#003366] text-white'
                : isDone
                  ? 'bg-[#003366] border-[#003366] text-white'
                  : 'bg-white border-gray-300 text-gray-400'
            }`}>
              {isDone ? '✓' : s.n}
            </span>
            <span className={`ml-2.5 text-sm font-medium truncate ${
              isActive && !isDone
                ? 'text-[#003366]'
                : isDone
                  ? 'text-gray-700'
                  : 'text-gray-400'
            }`}>
              {s.label}
            </span>
            {!isLast && (
              <div className={`w-full h-0.5 mx-3 ${
                isDone ? 'bg-[#003366]' : 'bg-gray-200'
              }`} />
            )}
          </li>
        )
      })}
    </ol>
  )

  const errorBanner = submitError ? (
    <div className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <div className="flex items-start gap-2">
        <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div className="font-medium">Could not create draft</div>
          <div className="text-xs text-red-700 mt-0.5">{submitError}</div>
        </div>
      </div>
    </div>
  ) : null

  const stepOneFooter = (
    <ModalFooter className="flex-wrap justify-end space-y-3">
      {errorBanner}
      <div className="flex flex-wrap justify-end gap-3 w-full">
        <Button type="button" variant="secondary" onClick={handleClose} disabled={loading || loadingTemplateFields}>
          {t('cancel')}
        </Button>
        {isUploadMode && (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSaveAsDraft}
              disabled={
                loading
                || !isStep1Valid()
              }
              data-tour-id="new-draft-save-upload-draft"
            >
              {t('save_as_draft')}
            </Button>
            <Button
              type="button"
              onClick={handleSubmitForReview}
              disabled={
                loading
                || !formData.fileCode
                || !formData.title
                || !formData.documentType
                || !formData.reviewerId
                || !uploadedFile
              }
              data-tour-id="new-draft-upload-submit"
            >
              {loading ? t('submitting') : t('submit_for_review')}
            </Button>
          </>
        )}
        {isSmartMode && (
          <Button
            type="button"
            onClick={handleGoToStep2}
            disabled={loading || loadingTemplateFields || !isStep1Valid()}
            loading={loadingTemplateFields}
            data-tour-id="new-draft-next-step"
          >
            Next — Fill Form →
          </Button>
        )}
      </div>
    </ModalFooter>
  )

  const stepTwoFooter = (
    <ModalFooter className="flex-wrap justify-end space-y-3">
      {errorBanner}
      <div className="flex flex-wrap justify-end gap-3 w-full">
        <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
          {t('cancel')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleBackToStep1}
          disabled={loading || loadingTemplateFields}
        >
          ← Back
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleSaveAsDraft}
          disabled={
            loading
            || loadingTemplateFields
            || (!formData.fileCode || !formData.title || !formData.documentType || !selectedSmartTemplateVersionId || !selectedSmartStyleProfileId)
          }
        >
          {t('save_as_draft')}
        </Button>
        <Button
          type="button"
          onClick={handleSubmitForReview}
          disabled={
            loading
            || loadingTemplateFields
            || !formData.fileCode
            || !formData.title
            || !formData.documentType
            || !formData.reviewerId
            || !selectedSmartTemplateVersionId
            || !selectedSmartStyleProfileId
          }
          data-tour-id="new-draft-submit-review"
        >
          {loading ? t('submitting') : t('submit_for_review')}
        </Button>
      </div>
    </ModalFooter>
  )

  const effectiveBody = (() => {
    if (isSmartMode) {
      return currentStep === 1 ? stepOneFields : stepTwoFields
    }
    return stepOneFields
  })()

  const effectiveFooter = (() => {
    if (isSmartMode) {
      return currentStep === 1 ? stepOneFooter : stepTwoFooter
    }
    return stepOneFooter
  })()

  return (
    <Modal onClose={handleClose} closeOnBackdrop size="3xl" className="overflow-hidden" data-tour-id="new-draft-modal">
      <ModalHeader
        title={t('new_draft_doc')}
        subtitle={t('modal_draft_desc')}
        onClose={handleClose}
      />

      <ModalBody className="space-y-4">
        {stepIndicator}
        {effectiveBody}
      </ModalBody>

      {effectiveFooter}
    </Modal>
  )
}
