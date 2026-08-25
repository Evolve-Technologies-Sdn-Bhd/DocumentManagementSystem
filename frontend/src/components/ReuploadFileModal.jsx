import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import api from '../api/axios'
import { AlertModal } from './ConfirmModal'
import useFileUploadSettings from '../hooks/useFileUploadSettings'
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

export default function ReuploadFileModal({ isOpen, onClose, document, onSuccess }) {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const { validateFile, getAcceptString, getAllowedTypesDisplay } = useFileUploadSettings()

  const [formData, setFormData] = useState({
    fileCode: '',
    title: '',
    versionNo: '',
    documentType: '',
    comments: '',
    divisionId: ''
  })
  const [loading, setLoading] = useState(false)
  const [loadingDocument, setLoadingDocument] = useState(false)
  const [divisions, setDivisions] = useState([])
  const [loadingDivisions, setLoadingDivisions] = useState(true)
  const [availableReviewers, setAvailableReviewers] = useState([])
  const [loadingReviewers, setLoadingReviewers] = useState(true)
  const [documentTypes, setDocumentTypes] = useState([])
  const [loadingDocTypes, setLoadingDocTypes] = useState(false)
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
  const [prevFieldValuesLoaded, setPrevFieldValuesLoaded] = useState(false)
  const [creationMode, setCreationMode] = useState('FILE_BASED')
  const [uploadedFile, setUploadedFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' })
  const [loadedDoc, setLoadedDoc] = useState(null)
  const [smartVersionId, setSmartVersionId] = useState(null)
  const [reviewerComments, setReviewerComments] = useState([])
  const [approvalHistory, setApprovalHistory] = useState([])
  const [loadingReviewerFeedback, setLoadingReviewerFeedback] = useState(false)
  const [reviewerFieldEdits, setReviewerFieldEdits] = useState([])

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

  const resolveLatestVersion = (doc) => {
    return doc?.latestVersion || (Array.isArray(doc?.versions) && doc.versions[0]) || null
  }

  const resolveVersionId = (doc) => {
    const latest = resolveLatestVersion(doc)
    let verId = latest?.id || null
    if (!verId && doc?.publishedVersionId) verId = doc.publishedVersionId
    if (!verId && latest && latest.versionId) verId = latest.versionId
    return verId
  }

  const resolveSmartTemplateVersionId = (doc) => {
    const latest = resolveLatestVersion(doc)
    const tplVerId = latest?.smartTemplateVersionId
                || doc?.smartTemplateVersionId
                || null
    return tplVerId ? String(tplVerId) : ''
  }

  const resolveSmartStyleProfileId = (doc) => {
    return doc?.smartDocumentStyleProfileId ? String(doc.smartDocumentStyleProfileId) : ''
  }

  const loadReviewerFeedback = useCallback(async (docId, doc, verId = null) => {
    if (!docId) return
    setLoadingReviewerFeedback(true)
    const effectiveSmartVersionId = verId || smartVersionId
    try {
      const allComments = doc?.comments || []
      const amendmentReviews = allComments.filter(c =>
        c && (c.commentType === 'AMENDMENT' || c.commentType === 'REVIEW' || c.commentType === 'REJECTION')
      )

      const approvals = doc?.approvalHistory || []
      const returnedHistory = approvals.filter(a =>
        a && (a.action === 'RETURNED' || a.action === 'REJECTED')
      )
      const returnAsComments = returnedHistory.map(a => ({
        id: `approval-${a.id}`,
        comment: a.comments || '',
        commentType: a.action === 'RETURNED' ? 'AMENDMENT' : 'REJECTION',
        createdAt: a.createdAt,
        user: a.user || null,
        _fromApprovalHistory: true
      })).filter(a => a.comment && a.comment.trim().length > 0)

      const mergedComments = [...amendmentReviews, ...returnAsComments].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return tb - ta
      })
      setReviewerComments(mergedComments)

      let fieldEdits = []
      if (effectiveSmartVersionId) {
        try {
          const changesRes = await api.get(`/smart-documents/document-versions/${effectiveSmartVersionId}/content`).catch(() => null)
          if (changesRes) {
            const payload = changesRes?.data?.data || changesRes?.data || {}
            const content = payload.smartDocumentContent || {}
            const auditTrail = content.fieldAuditTrailJson
            if (Array.isArray(auditTrail) && auditTrail.length > 0) {
              const reviewerEdits = auditTrail.filter(a => a?.action === 'REVIEWER_DIRECT_EDIT')
              const approverEdits = auditTrail.filter(a => a?.action === 'APPROVER_MINOR_TWEAK')
              const drafterBaseline = auditTrail.find(a => a?.action === 'DRAFTER_BASELINE')
              const baseline = drafterBaseline?.snapshot || (auditTrail[0]?.action === 'DRAFTER_BASELINE' ? auditTrail[0].snapshot : {})
              const allEdits = [...reviewerEdits, ...approverEdits]
              if (allEdits.length > 0) {
                const lastEdit = allEdits[allEdits.length - 1]
                const snapshot = lastEdit?.snapshot || {}
                const diffs = []
                const allKeys = new Set([...Object.keys(baseline || {}), ...Object.keys(snapshot)])
                for (const k of allKeys) {
                  const oldVal = baseline?.[k]
                  const newVal = snapshot?.[k]
                  const oldStr = oldVal === null || oldVal === undefined ? '' : String(oldVal)
                  const newStr = newVal === null || newVal === undefined ? '' : String(newVal)
                  if (oldStr !== newStr) {
                    diffs.push({ fieldKey: k, oldValue: oldVal, newValue: newVal })
                  }
                }
                fieldEdits = diffs
              }
            }
          }
        } catch (_e) {
          console.warn('Could not load field audit trail:', _e?.message || _e)
        }
      }
      setReviewerFieldEdits(fieldEdits)
    } catch (e) {
      console.warn('Could not load reviewer feedback:', e?.message || e)
    } finally {
      setLoadingReviewerFeedback(false)
    }
  }, [smartVersionId])

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
    if (!isOpen) return
    ;(async () => {
      try {
        setLoadingDocument(true)
        setSubmitError(null)
        setCurrentStep(1)
        setLoadedTemplateVersion(null)
        setSmartFieldValues({})
        setPrevFieldValuesLoaded(false)
        setUploadedFile(null)
        setReviewerComments([])
        setApprovalHistory([])
        setReviewerFieldEdits([])

        await Promise.all([
          loadDivisions(),
          loadDocumentTypes(),
          loadSmartOptions()
        ])

        if (document?.id) {
          const res = await api.get(`/documents/${document.id}`)
          const doc = res.data?.data?.document || res.data?.data || res.data || null
          setLoadedDoc(doc)

          const presetTplVerId = resolveSmartTemplateVersionId(doc)
          const presetStyleId = resolveSmartStyleProfileId(doc)

          const isSmart = doc?.isSmartDocument === true
            || String(doc?.creationMode || '').toUpperCase() === 'SMART_DOCUMENT'
            || Boolean(presetTplVerId)

          const mode = isSmart ? 'SMART_DOCUMENT' : 'FILE_BASED'
          setCreationMode(mode)

          const docTypeName = doc?.documentType?.name || doc?.documentType || ''
          const divId = doc?.divisionId ? String(doc.divisionId) : ''

          setFormData({
            fileCode: doc?.fileCode || '',
            title: doc?.title || '',
            versionNo: doc?.version || '1.0',
            documentType: docTypeName,
            comments: doc?.description || '',
            divisionId: divId
          })

          if (presetTplVerId) {
            setSelectedSmartTemplateVersionId(presetTplVerId)
          }
          if (presetStyleId) {
            setSelectedSmartStyleProfileId(presetStyleId)
          }

          const verId = resolveVersionId(doc)
          setSmartVersionId(verId)

          if (isSmart && verId) {
            try {
              const contentRes = await api.get(
                `/smart-documents/document-versions/${verId}/content`
              )
              const payload = contentRes?.data?.data || contentRes?.data || {}
              const { smartDocumentContent } = payload
              const prev = smartDocumentContent?.fieldValuesJson || {}
              if (prev && typeof prev === 'object' && Object.keys(prev).length > 0) {
                setSmartFieldValues(prev)
              }
              setPrevFieldValuesLoaded(true)
            } catch (e) {
              console.warn('Could not load previous field values, continuing empty:', e?.message || e)
              setPrevFieldValuesLoaded(true)
            }
          } else {
            setPrevFieldValuesLoaded(true)
          }

          loadReviewerFeedback(document.id, doc, verId)

          if (isSmart && presetTplVerId) {
            await loadTemplateFields(presetTplVerId)
          }
        }
      } catch (error) {
        console.error('Failed to load document details:', error)
        setAlertModal({
          show: true,
          title: 'Load Failed',
          message: error?.response?.data?.message || 'Could not load document details. Please try again.',
          type: 'error'
        })
      } finally {
        setLoadingDocument(false)
      }
    })()
  }, [isOpen, document, loadReviewerFeedback, loadTemplateFields])

  useEffect(() => {
    if (isOpen && formData.divisionId) {
      loadReviewers(formData.divisionId)
    }
  }, [isOpen, formData.divisionId])

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
  }, [formData.documentType, allSmartTemplates, documentTypes])

  useEffect(() => {
    if (!selectedSmartTemplateVersionId) {
      return
    }
    if (loadedDoc?.smartDocumentStyleProfileId) {
      return
    }
    const tpl = allSmartTemplates.find(o => String(o.value) === String(selectedSmartTemplateVersionId))
    if (tpl && tpl.styleProfileId) {
      const spExists = allSmartStyleProfiles.some(sp => String(sp.value) === String(tpl.styleProfileId))
      if (spExists) {
        setSelectedSmartStyleProfileId(String(tpl.styleProfileId))
      }
    }
  }, [selectedSmartTemplateVersionId, allSmartTemplates, allSmartStyleProfiles, loadedDoc])

  const loadDocumentTypes = async () => {
    setLoadingDocTypes(true)
    try {
      const res = await api.get('/system/config/document-types')
      setDocumentTypes(res.data?.data?.documentTypes || [])
    } catch (error) {
      console.error('Failed to load document types:', error)
    } finally {
      setLoadingDocTypes(false)
    }
  }

  const loadDivisions = async () => {
    setLoadingDivisions(true)
    try {
      const res = await api.get('/divisions')
      const list = res.data?.data?.divisions || res.data?.data || (Array.isArray(res.data) ? res.data : []) || []
      setDivisions(list)
      if (list.length === 1) {
        setFormData(prev => ({ ...prev, divisionId: String(list[0].id) }))
      }
    } catch (error) {
      console.error('Failed to load divisions:', error)
      setDivisions([])
    } finally {
      setLoadingDivisions(false)
    }
  }

  const loadReviewers = async (divisionId) => {
    setLoadingReviewers(true)
    try {
      const res = await api.get('/users')
      const users = res.data?.data?.users || res.data?.users || []
      const activeUsers = users.filter(user => user.status === 'ACTIVE')
      const filtered = divisionId
        ? activeUsers.filter(u => String(u.divisionId || '') === String(divisionId))
        : activeUsers
      setAvailableReviewers(filtered)
    } catch (error) {
      console.error('Failed to load reviewers:', error)
      setAvailableReviewers([])
    } finally {
      setLoadingReviewers(false)
    }
  }

  const loadSmartOptions = async () => {
    setSmartTemplatesLoading(true)
    setSmartStyleProfilesLoading(true)
    try {
      const [tplRes, styRes] = await Promise.all([
        api.get('/smart-templates'),
        api.get('/smart-document-style').catch(() => ({ data: { data: [] } }))
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

  const handleDivisionSelect = (divisionId) => {
    const next = divisionId ? String(divisionId) : ''
    setFormData((prev) => ({ ...prev, divisionId: next }))
  }

  const handleSmartFieldChange = useCallback((fieldKey, newValue) => {
    setSmartFieldValues((prev) => ({ ...prev, [fieldKey]: newValue }))
  }, [])

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = (file) => {
    const validation = validateFile(file)
    if (!validation.valid) {
      setAlertModal({ show: true, title: 'Invalid File', message: validation.error, type: 'error' })
      return
    }
    setUploadedFile(file)
  }

  const persistSmartFieldValues = async (verId, workflowAction = 'DRAFT_EDIT') => {
    if (!verId) return
    if (creationMode !== 'SMART_DOCUMENT') return
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

  const isSmartMode = creationMode === 'SMART_DOCUMENT'
  const isUploadMode = creationMode === 'FILE_BASED'

  const handleGoToStep2 = async () => {
    setSubmitError(null)
    if (!selectedSmartTemplateVersionId && !hasPresetSmartTemplate) {
      setSubmitError('Please select a Smart Template for this Smart Document.')
      return
    }
    if (!selectedSmartStyleProfileId && !hasPresetStyleProfile) {
      setSubmitError('Please select a Document Style Profile. This is required to generate the document with proper formatting.')
      return
    }
    const templateVerId = selectedSmartTemplateVersionId || String(loadedDoc?.smartTemplateVersionId || '')
    if (!loadedTemplateVersion) {
      const tv = await loadTemplateFields(templateVerId)
      if (!tv) {
        setSubmitError('Could not load Smart Template fields. Please try a different template or try again.')
        return
      }
    }
    setCurrentStep(2)
  }

  const handleBackToStep1 = () => {
    setCurrentStep(1)
    setSubmitError(null)
  }

  const isStep1Valid = () => {
    return Boolean(
      formData.fileCode &&
      formData.title &&
      formData.documentType &&
      (isSmartMode ? (
        (selectedSmartTemplateVersionId || hasPresetSmartTemplate) &&
        (selectedSmartStyleProfileId || hasPresetStyleProfile)
      ) : true)
    )
  }

  const handleReuploadAndResubmit = async () => {
    setSubmitError(null)
    if (!formData.title) {
      setSubmitError('Document Title is required.')
      return
    }
    if (isUploadMode && !uploadedFile) {
      setSubmitError('Please upload a revised document file to proceed.')
      return
    }
    if (isSmartMode && !selectedSmartTemplateVersionId && !hasPresetSmartTemplate) {
      setSubmitError('Smart Template is required for Smart Document mode.')
      return
    }
    if (isSmartMode && !selectedSmartStyleProfileId && !hasPresetStyleProfile) {
      setSubmitError('Document Style Profile is required for Smart Document mode.')
      return
    }

    setLoading(true)
    try {
      if (isUploadMode) {
        const uploadFormData = new FormData()
        uploadFormData.append('file', uploadedFile)
        await api.post(`/documents/${document.id}/upload`, uploadFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }

      const updatePayload = {}
      if (formData.title !== (loadedDoc?.title || document?.title)) updatePayload.title = formData.title
      if (formData.comments !== (loadedDoc?.description || '')) updatePayload.description = formData.comments
      if (Object.keys(updatePayload).length > 0) {
        await api.put(`/documents/${document.id}`, updatePayload)
      }

      if (isSmartMode) {
        const verId = resolveVersionId(loadedDoc) || smartVersionId
        if (verId) {
          await persistSmartFieldValues(verId, 'RETURN_FOR_AMENDMENTS_RESUBMIT')
        }
      }

      await api.post(`/workflow/submit/${document.id}`)

      setAlertModal({
        show: true,
        title: 'Success',
        message: isSmartMode
          ? 'Smart Document updated and resubmitted for review successfully!'
          : 'Document revised and resubmitted successfully!',
        type: 'success'
      })

      if (isSmartMode) {
        const verId = resolveVersionId(loadedDoc) || smartVersionId
        if (verId) {
          setTimeout(() => {
            handleClose()
            if (typeof onSuccess === 'function') onSuccess()
            try { navigate(`/smart-documents/edit/${document.id}/${verId}`) } catch (_) {}
          }, 1500)
          return
        }
      }

      setTimeout(() => {
        handleClose()
        if (typeof onSuccess === 'function') onSuccess()
      }, 1500)
    } catch (error) {
      console.error('Error resubmitting document:', error)
      const msg = error?.response?.data?.message || error?.message || 'Failed to resubmit document'
      setSubmitError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      fileCode: '',
      title: '',
      versionNo: '',
      documentType: '',
      comments: '',
      divisionId: ''
    })
    setSelectedSmartTemplateVersionId('')
    setSelectedSmartStyleProfileId('')
    setCurrentStep(1)
    setLoadedTemplateVersion(null)
    setSmartFieldValues({})
    setPrevFieldValuesLoaded(false)
    setUploadedFile(null)
    setSubmitError(null)
    setLoadedDoc(null)
    setSmartVersionId(null)
    setReviewerComments([])
    setApprovalHistory([])
    setReviewerFieldEdits([])
    onClose()
  }

  const presetTplVerId = useMemo(() => loadedDoc ? resolveSmartTemplateVersionId(loadedDoc) : '', [loadedDoc])
  const presetStyleId = useMemo(() => loadedDoc ? resolveSmartStyleProfileId(loadedDoc) : '', [loadedDoc])

  const selectedTplLabel = (() => {
    const effectiveVerId = selectedSmartTemplateVersionId || presetTplVerId
    const allOpts = allSmartTemplates.length ? allSmartTemplates : smartTemplates
    const opt = allOpts.find(o => String(o.value) === String(effectiveVerId))
            || smartTemplates.find(o => String(o.value) === String(effectiveVerId))
    if (opt?.label) return opt.label
    const latestVer = resolveLatestVersion(loadedDoc)
    const stv = latestVer?.smartTemplateVersion
    const baseName = stv?.smartTemplate?.templateName
                  || stv?.smartTemplate?.name
                  || loadedDoc?.smartTemplateName
    if (baseName) {
      const vNo = stv?.versionNo
      const vLabel = stv?.versionLabel
      if (vLabel) return `${baseName} — ${vLabel}`
      if (vNo) return `${baseName} (v${vNo})`
      return baseName
    }
    return 'Template loaded'
  })()

  const hasPresetSmartTemplate = Boolean(presetTplVerId || selectedSmartTemplateVersionId)
  const hasPresetStyleProfile = Boolean(presetStyleId || selectedSmartStyleProfileId)

  const selectedStyleLabel = (() => {
    const effectiveStyleId = selectedSmartStyleProfileId || presetStyleId
    const allSp = allSmartStyleProfiles.length ? allSmartStyleProfiles : smartStyleProfiles
    const opt = allSp.find(o => String(o.value) === String(effectiveStyleId))
            || smartStyleProfiles.find(o => String(o.value) === String(effectiveStyleId))
    if (opt?.label) return opt.label
    const profileName = loadedDoc?.smartDocumentStyleProfile?.profileName
    return profileName || 'Style profile loaded'
  })()

  const reviewerFeedbackCount = reviewerComments.length + reviewerFieldEdits.length

  const stepIndicator = (
    <ol className="flex items-center w-full mb-4 px-1">
      {[
        { n: 1, label: 'Basic Info' },
        { n: 2, label: isSmartMode ? 'Smart Form (Review & Resubmit)' : 'Upload & Resubmit' }
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
          <div className="font-medium">Could not resubmit</div>
          <div className="text-xs text-red-700 mt-0.5">{submitError}</div>
        </div>
      </div>
    </div>
  ) : null

  const stepOneFields = (
    <div className="space-y-4">
      {isSmartMode && reviewerFeedbackCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div className="flex-1 space-y-2">
              <h4 className="text-sm font-semibold text-amber-900">
                Reviewer Feedback &amp; Amendments ({reviewerFeedbackCount})
              </h4>
              <p className="text-xs text-amber-800/80 leading-relaxed">
                Please review the reviewer's comments and field changes below, then proceed to amend your document and resubmit.
              </p>
            </div>
          </div>

          {reviewerFieldEdits.length > 0 ? (
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-amber-900/90 uppercase tracking-wide">
                Amended Fields ({reviewerFieldEdits.length})
              </h5>
              <div className="rounded-md border border-amber-200 bg-white overflow-hidden">
                <div className="max-h-[220px] overflow-y-auto divide-y divide-amber-100">
                  {reviewerFieldEdits.map((edit, idx) => {
                    const fieldDef = loadedTemplateVersion?.formFields?.find(
                      f => f.fieldKey === edit.fieldKey
                    )
                    const fieldLabel = fieldDef?.label || fieldDef?.fieldLabel || edit.fieldKey
                    const fieldLabelText = fieldLabel !== edit.fieldKey ? fieldLabel : null
                    return (
                      <div key={edit.fieldKey || idx} className="p-3 space-y-1.5">
                        <div className="space-y-0.5">
                          {fieldLabelText ? (
                            <div className="text-xs font-semibold text-gray-900 break-all">
                              {fieldLabelText}
                            </div>
                          ) : null}
                          <div className={`${fieldLabelText ? 'text-[11px] text-gray-500 font-mono break-all' : 'text-xs font-semibold text-gray-900 font-mono break-all'}`}>
                            {edit.fieldKey}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="rounded bg-gray-50 border border-gray-200 p-2">
                            <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-0.5">
                              Your previous value
                            </div>
                            <div className="text-gray-800 break-all min-h-[1rem]">
                              {edit.oldValue === null || edit.oldValue === undefined
                                ? <span className="text-gray-400 italic">(empty)</span>
                                : String(edit.oldValue)}
                            </div>
                          </div>
                          <div className="rounded bg-amber-50 border border-amber-200 p-2">
                            <div className="text-[10px] font-medium uppercase tracking-wide text-amber-700 mb-0.5">
                              Reviewer changed to
                            </div>
                            <div className="text-amber-900 break-all min-h-[1rem] font-medium">
                              {edit.newValue === null || edit.newValue === undefined
                                ? <span className="text-amber-600 italic">(empty)</span>
                                : String(edit.newValue)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {reviewerComments.length > 0 ? (
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-amber-900/90 uppercase tracking-wide">
                Reviewer Comments ({reviewerComments.length})
              </h5>
              <div className="space-y-2">
                {reviewerComments.map((c) => (
                  <div key={c.id} className="rounded-md border border-amber-200 bg-white p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs font-semibold text-gray-900">
                        {c.user
                          ? `${c.user.firstName || ''} ${c.user.lastName || ''}`.trim() || 'Reviewer'
                          : 'Reviewer'}
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        c.commentType === 'REJECTION'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : c.commentType === 'AMENDMENT'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {c.commentType === 'REJECTION'
                          ? 'Rejection'
                          : c.commentType === 'AMENDMENT'
                            ? 'Amendment Request'
                            : 'Review Note'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {c.comment}
                    </div>
                    {c.createdAt ? (
                      <div className="text-[10px] text-gray-500">
                        {new Date(c.createdAt).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {loadingReviewerFeedback ? (
        <AppSurface variant="muted" padding="sm" className="flex items-center gap-2 text-xs text-gray-500">
          <InlineSpinner className="h-3.5 w-3.5 border-2" />
          <span>Loading reviewer feedback…</span>
        </AppSurface>
      ) : null}

      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-900 mb-1">
          How would you like to resubmit this draft? <span className="text-red-500">*</span>
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
                  Edit the Smart Form fields directly, see previous values, and auto-generate the document on resubmit.
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
                  Upload a revised DOCX, PDF, or other file directly. Best for manually-edited returned documents.
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          File Code
        </label>
        <TextInput
          type="text"
          value={formData.fileCode}
          disabled
          className="bg-gray-50 text-gray-600 cursor-not-allowed"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Document Title <span className="text-red-500">*</span>
          </label>
          <TextInput
            type="text"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Input text"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Version / Revision No.
          </label>
          <TextInput
            type="text"
            value={formData.versionNo}
            disabled
            className="bg-gray-50 text-gray-600 cursor-not-allowed"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Document Type
        </label>
        <SearchableSingleSelect
          value={formData.documentType}
          options={documentTypeOptions}
          onChange={(val) => setFormData(prev => ({ ...prev, documentType: val }))}
          placeholder={loadingDocTypes ? 'Loading…' : 'Document Type'}
          searchPlaceholder="Search document type…"
          noResultsLabel="No document types found"
          disabled={loadingDocTypes}
          loading={loadingDocTypes}
        />
      </div>

      {divisions.length > 1 || loadingDivisions ? (
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Division
          </label>
          {loadingDivisions ? (
            <AppSurface variant="muted" padding="md" className="flex items-center gap-2 text-sm text-gray-500">
              <InlineSpinner className="h-4 w-4 border-2" />
              <span>Loading…</span>
            </AppSurface>
          ) : (
            <SearchableSingleSelect
              value={formData.divisionId}
              options={divisionOptions}
              onChange={handleDivisionSelect}
              placeholder="Select division"
              searchPlaceholder="Search division…"
              noResultsLabel="No division found"
              loadingLabel="Loading…"
            />
          )}
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Comments / Notes
        </label>
        <TextArea
          value={formData.comments}
          onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
          placeholder="Input text"
          rows={3}
          className="resize-none"
        />
      </div>

      {isSmartMode && (
        <div className="space-y-4 pt-1">
          {hasPresetSmartTemplate ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Smart Template
              </label>
              <div className="rounded-lg border border-gray-200 bg-[#003366]/[0.03] p-3 space-y-1">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center rounded-md bg-[#003366]/10 text-[#003366] px-2 py-0.5 text-[10px] font-medium border border-[#003366]/20">
                      Preset from document
                    </span>
                  </div>
                </div>
                <div className="text-sm font-semibold text-gray-900 break-all">
                  {selectedTplLabel}
                </div>
                <div className="text-xs text-gray-500">
                  Smart Template locked — same template will be used to regenerate document on resubmit.
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Smart Template (required)
              </label>
              <SearchableSingleSelect
                value={selectedSmartTemplateVersionId}
                options={smartTemplates}
                onChange={(val) => setSelectedSmartTemplateVersionId(val)}
                placeholder="Select Smart Template…"
                searchPlaceholder="Filter templates…"
                noResultsLabel="No active smart templates."
                disabled={false}
                loading={smartTemplatesLoading}
              />
            </div>
          )}

          {hasPresetStyleProfile ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Document Style Profile
              </label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center rounded-md bg-gray-100 text-gray-700 px-2 py-0.5 text-[10px] font-medium border border-gray-200">
                      Preset from document
                    </span>
                  </div>
                </div>
                <div className="text-sm font-semibold text-gray-900 break-all">
                  {selectedStyleLabel}
                </div>
                <div className="text-xs text-gray-500">
                  Style profile locked — same headers, footers, and margins will be applied.
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Document Style Profile <span className="text-red-500">*</span> — Font families, company letterhead header, footer, etc. Default is set by the Smart Template.
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
          )}
        </div>
      )}

      {isUploadMode && (
        <div className="space-y-2 pt-1">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Upload Revised Document <span className="text-red-500">*</span>
          </label>
          <div
            className={`rounded-lg border-2 border-dashed transition-colors ${
              uploadedFile ? 'border-[#003366] bg-[#003366]/5' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'
            } p-5`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="rum-file-upload"
              className="hidden"
              onChange={handleFileInput}
              accept={getAcceptString()}
            />
            <label
              htmlFor="rum-file-upload"
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
                    Drop revised file here or click to browse
                  </div>
                  <div className="text-xs text-gray-500">
                    Supported formats: {getAllowedTypesDisplay()}
                  </div>
                </div>
              )}
            </label>
          </div>
        </div>
      )}
    </div>
  )

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
          {isSmartMode ? (
            <div>
              <span className="text-gray-500 font-medium">Template:</span>
              <span className="ml-2 text-gray-900 truncate">{selectedTplLabel}</span>
            </div>
          ) : (
            <div>
              <span className="text-gray-500 font-medium">File:</span>
              <span className="ml-2 text-gray-900 truncate">{uploadedFile?.name || '—'}</span>
            </div>
          )}
        </div>
      </div>

      {isSmartMode ? (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Step 2 — Review Smart Form & Resubmit <span className="text-red-500">*</span>
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Edit any fields that need changes. Your previously-submitted values are already loaded below.
                Mandatory fields are marked with <span className="text-red-500">*</span>.
              </p>
            </div>
            {prevFieldValuesLoaded && Object.keys(smartFieldValues).length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Previous values restored
              </span>
            ) : null}
          </div>

          {loadingTemplateFields ? (
            <AppSurface variant="muted" padding="lg" className="flex items-center justify-center gap-3 text-sm text-gray-500">
              <InlineSpinner className="h-5 w-5 border-2" />
              <span>Loading Smart Template sections and fields…</span>
            </AppSurface>
          ) : !loadedTemplateVersion ? (
            <AppSurface variant="muted" padding="lg" className="space-y-2">
              <p className="text-sm font-medium text-gray-900">Could not load the selected Smart Template fields.</p>
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
                You can still resubmit — the document will be regenerated from the latest field values on record.
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
        </>
      ) : (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-900">Ready to resubmit</p>
              <p className="text-sm text-blue-700 mt-1">
                The document will be automatically resubmitted to the same reviewers who returned it for amendments.
              </p>
              {uploadedFile ? (
                <div className="mt-2 text-xs text-blue-800 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  File attached: <span className="font-mono">{uploadedFile.name}</span> ({uploadedFile.size ? `${(uploadedFile.size / 1024).toFixed(1)} KB` : ''})
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const stepOneFooter = (
    <ModalFooter className="flex-wrap justify-end space-y-3">
      {errorBanner}
      <div className="flex flex-wrap justify-end gap-3 w-full">
        <Button type="button" variant="secondary" onClick={handleClose} disabled={loading || loadingDocument}>
          Cancel
        </Button>
        {isSmartMode && (
          <Button
            type="button"
            onClick={handleGoToStep2}
            disabled={loading || loadingTemplateFields || !isStep1Valid()}
            loading={loadingTemplateFields}
          >
            Next — Fill / Review Form →
          </Button>
        )}
        {isUploadMode && (
          <Button
            type="button"
            onClick={handleReuploadAndResubmit}
            disabled={
              loading
              || !formData.fileCode
              || !formData.title
              || !formData.documentType
              || !uploadedFile
              || loadingDocument
            }
          >
            {loading ? (
              <><InlineSpinner className="h-4 w-4 border-2 border-white/40 border-t-white" /><span>Resubmitting…</span></>
            ) : 'Reupload & Resubmit'}
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
          Cancel
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
          onClick={handleReuploadAndResubmit}
          disabled={
            loading
            || loadingTemplateFields
            || !formData.title
          }
        >
          {loading ? (
            <><InlineSpinner className="h-4 w-4 border-2 border-white/40 border-t-white" /><span>Resubmitting…</span></>
          ) : 'Update & Resubmit for Review'}
        </Button>
      </div>
    </ModalFooter>
  )

  if (!isOpen) return null

  return (
    <>
      <AlertModal
        show={alertModal.show}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ show: false, title: '', message: '', type: 'info' })}
      />
      <Modal onClose={handleClose} closeOnBackdrop size="lg">
        <ModalHeader
          title="Resubmit Revised Draft"
          subtitle={loadedDoc?.fileCode ? `File Code: ${loadedDoc.fileCode}` : 'Update the draft and resubmit for review.'}
          onClose={handleClose}
        />

        {loadingDocument ? (
          <ModalBody className="py-12 text-center">
            <div className="flex flex-col items-center gap-3">
              <InlineSpinner className="h-10 w-10 border-2" />
              <p className="text-sm text-gray-500">Loading draft details and previous submission records…</p>
            </div>
          </ModalBody>
        ) : (
          <>
            <ModalBody>
              {stepIndicator}
              {currentStep === 1 ? stepOneFields : stepTwoFields}
            </ModalBody>
            {currentStep === 1 ? stepOneFooter : stepTwoFooter}
          </>
        )}
      </Modal>
    </>
  )
}
