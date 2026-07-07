import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../api/axios'
import useFileUploadSettings from '../hooks/useFileUploadSettings'
import { usePreferences } from '../contexts/PreferencesContext'
import ConfirmModal from './ConfirmModal'

function getOtherDocumentationTypeId(documentTypes) {
  const types = Array.isArray(documentTypes) ? documentTypes : []
  const byName = types.find((dt) => String(dt?.name || '').toLowerCase() === 'others')
  if (byName) return String(byName.id)
  const byPrefix = types.find((dt) => String(dt?.prefix || '').toLowerCase() === 'oth')
  if (byPrefix) return String(byPrefix.id)
  return ''
}

export default function BulkImportModal({ isOpen, onClose, onSubmit, folders, selectedFolderId }) {
  const [folderId, setFolderId] = useState(selectedFolderId || '')
  const [projectCategoryId, setProjectCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const getToday = () => new Date().toISOString().slice(0, 10)
  const [expiryInfo, setExpiryInfo] = useState({
    trackingEnabled: false,
    startDate: getToday(),
    expiryDate: '',
    remarks: ''
  })
  const [fileItems, setFileItems] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [documentTypes, setDocumentTypes] = useState([])
  const [numberingSettings, setNumberingSettings] = useState(null)
  const [projectCategories, setProjectCategories] = useState([])
  const [folderPickerConfirm, setFolderPickerConfirm] = useState({ show: false, onConfirm: null })
  const [reassignConfirm, setReassignConfirm] = useState({ show: false, conflicts: [], payload: null })
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

  const { t } = usePreferences()

  const { validateFile, getAcceptString, getAllowedTypesDisplay, refreshSettings, bulkUploadLimit } = useFileUploadSettings()

  const totalUploadLimitMB = 100
  const totalUploadLimitBytes = totalUploadLimitMB * 1024 * 1024
  const totalSelectedBytes = useMemo(() => fileItems.reduce((sum, it) => sum + (it?.file?.size || 0), 0), [fileItems])
  const totalSelectedMB = useMemo(() => (totalSelectedBytes / 1024 / 1024).toFixed(2), [totalSelectedBytes])
  const totalSelectedExceeded = totalSelectedBytes > totalUploadLimitBytes

  const otherTypeId = useMemo(() => getOtherDocumentationTypeId(documentTypes), [documentTypes])
  const allClientChecked = useMemo(() => fileItems.length > 0 && fileItems.every((it) => Boolean(it.isClientDocument)), [fileItems])
  const someClientChecked = useMemo(() => fileItems.some((it) => Boolean(it.isClientDocument)), [fileItems])
  const clientDeclarationRef = useRef(null)

  useEffect(() => {
    if (!clientDeclarationRef.current) return
    clientDeclarationRef.current.indeterminate = Boolean(!allClientChecked && someClientChecked)
  }, [allClientChecked, someClientChecked])

  useEffect(() => {
    if (!isOpen) return
    setFolderId(selectedFolderId || '')
    refreshSettings()
  }, [isOpen, selectedFolderId])

  useEffect(() => {
    if (!isOpen) return
    setProjectCategoryId('')
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const load = async () => {
      try {
        const [typesRes, projRes] = await Promise.all([
          api.get('/system/config/document-types'),
          api.get('/system/config/project-categories')
        ])
        if (cancelled) return
        setDocumentTypes(typesRes.data?.data?.documentTypes || [])
        setProjectCategories(projRes.data?.data?.projectCategories || [])
      } catch (_) {
        if (cancelled) return
        setDocumentTypes([])
        setProjectCategories([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setFileItems((prev) => prev.map((it) => ({ ...it, projectCategoryId: projectCategoryId || '' })))
  }, [projectCategoryId, isOpen])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await api.get('/system/config/document-numbering')
        if (cancelled) return
        setNumberingSettings(res.data?.data?.settings || res.data?.data || null)
      } catch (_) {
        if (cancelled) return
        setNumberingSettings(null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (documentTypes.length === 0) return
    setFileItems((prev) => prev.map((it) => {
      if (String(it.documentTypeId || '').trim()) return it
      const matched = autoMatchDocumentTypeId(it.fileCode)
      return matched ? { ...it, documentTypeId: matched } : it
    }))
  }, [documentTypes, isOpen])

  const handleClose = () => {
    setIsDragging(false)
    setSubmitting(false)
    setFileItems([])
    setDescription('')
    setProjectCategoryId('')
    setExpiryInfo({
      trackingEnabled: false,
      startDate: getToday(),
      expiryDate: '',
      remarks: ''
    })
    setFormError('')
    setDocumentTypes([])
    setNumberingSettings(null)
    setProjectCategories([])
    setFolderId(selectedFolderId || '')
    setReassignConfirm({ show: false, conflicts: [], payload: null })
    onClose()
  }

  const getDateDigits = (format) => {
    switch (String(format || '').toUpperCase()) {
      case 'YYMMDD': return 6
      case 'YYYYMMDD': return 8
      case 'YYYYMM': return 6
      case 'YYMM': return 4
      case 'YYYY': return 4
      case 'NONE': return 0
      default: return 0
    }
  }

  const normalizeFileCode = (raw) => {
    const input = String(raw || '').trim()
    if (!input) return ''
    const settings = numberingSettings
    if (!settings) return input

    const prefixLen = Math.max(1, String(settings.prefixPlaceholder || 'PFX').length)
    const includeVersion = Boolean(settings.includeVersion)
    const versionDigits = includeVersion ? Math.max(1, parseInt(settings.versionDigits, 10) || 2) : 0
    const dateDigits = getDateDigits(settings.dateFormat)
    const counterDigits = Math.max(1, parseInt(settings.counterDigits, 10) || 3)
    const sepOut = String(settings.separator || '/')

    const cleaned = input.replace(/\s+/g, '')
    const parts = cleaned.split(/[\/\-\._]+/).filter(Boolean)

    const build = (prefix, version, date, counter) => {
      const p = String(prefix || '').substring(0, prefixLen)
      const segs = [p]
      if (includeVersion) segs.push(String(version || '').padStart(versionDigits, '0'))
      if (dateDigits > 0) segs.push(String(date || '').padStart(dateDigits, '0'))
      segs.push(String(counter || '').padStart(counterDigits, '0'))
      return segs.join(sepOut)
    }

    const isDigits = (s, len) => new RegExp(`^\\d{${len}}$`).test(String(s || ''))
    const isPrefixOk = (s) => new RegExp(`^[A-Za-z]{1,${prefixLen}}$`).test(String(s || ''))

    if (parts.length >= 2) {
      const prefix = parts[0]
      let idx = 1
      const version = includeVersion ? parts[idx++] : ''
      const date = dateDigits > 0 ? parts[idx++] : ''
      const counter = parts[idx++]

      if (
        isPrefixOk(prefix) &&
        (!includeVersion || isDigits(version, versionDigits)) &&
        (dateDigits === 0 || isDigits(date, dateDigits)) &&
        isDigits(counter, counterDigits)
      ) {
        return build(prefix, version, date, counter)
      }
    }

    const m = cleaned.match(new RegExp(`^([A-Za-z]{1,${prefixLen}})(\\d+)$`))
    if (m) {
      const prefix = m[1]
      const digits = m[2]
      const expected = versionDigits + dateDigits + counterDigits
      if (digits.length === expected) {
        let offset = 0
        const version = includeVersion ? digits.slice(offset, offset + versionDigits) : ''
        offset += versionDigits
        const date = dateDigits > 0 ? digits.slice(offset, offset + dateDigits) : ''
        offset += dateDigits
        const counter = digits.slice(offset, offset + counterDigits)
        return build(prefix, version, date, counter)
      }
    }

    return input
  }

  const extractFromFilename = (fileName) => {
    const dot = fileName.lastIndexOf('.')
    const base = dot > 0 ? fileName.slice(0, dot) : fileName
    const trimmed = base.trim()
    const underscore = trimmed.indexOf('_')
    if (underscore > 0) {
      const fileCode = normalizeFileCode(trimmed.slice(0, underscore).trim())
      const title = trimmed.slice(underscore + 1).trim() || trimmed
      return { fileCode, title, fallbackTitle: trimmed }
    }
    const normalized = normalizeFileCode(trimmed)
    return { fileCode: normalized, title: trimmed, fallbackTitle: trimmed }
  }

  const autoMatchDocumentTypeId = (fileCode) => {
    const prefix = String(fileCode || '').match(/^[A-Za-z]+/)?.[0] || ''
    if (!prefix) return ''
    const exact = documentTypes.find((dt) => dt?.prefix === prefix)
    if (exact) return String(exact.id)
    const lower = prefix.toLowerCase()
    const ci = documentTypes.find((dt) => String(dt?.prefix || '').toLowerCase() === lower)
    return ci ? String(ci.id) : ''
  }

  const autoMatchClientDocumentTypeId = () => {
    return getOtherDocumentationTypeId(documentTypes)
  }

  const applyClientDeclaration = (item, checked) => {
    const nextClientTypeId = checked ? otherTypeId : ''
    return {
      ...item,
      isClientDocument: checked,
      nonClientFileCode: checked ? (item.fileCode || item.nonClientFileCode) : item.nonClientFileCode,
      fileCode: checked ? '' : (item.nonClientFileCode || item.fileCode),
      nonClientDocumentTypeId: checked ? (item.documentTypeId || item.nonClientDocumentTypeId) : item.nonClientDocumentTypeId,
      documentTypeId: checked ? (nextClientTypeId || item.documentTypeId) : (item.nonClientDocumentTypeId || item.documentTypeId),
      expiryOverrideEnabled: checked ? false : Boolean(item.expiryOverrideEnabled)
    }
  }

  const addFiles = (incoming) => {
    const next = []
    for (const file of incoming) {
      const validation = validateFile(file)
      if (!validation.valid) {
        setFormError(validation.error)
        continue
      }
      next.push(file)
    }
    if (next.length === 0) return
    setFileItems((prev) => {
      const byKey = new Map(prev.map((it) => [`${it.relativePath || it.file.name}:${it.file.size}:${it.file.lastModified}`, it]))
      next.forEach((f) => {
        const rel = String(f?.webkitRelativePath || '').trim()
        const key = `${rel || f.name}:${f.size}:${f.lastModified}`
        if (byKey.has(key)) return
        const extracted = extractFromFilename(f.name)
        const base = {
          file: f,
          relativePath: rel,
          fileCode: extracted.fileCode,
          nonClientFileCode: extracted.fileCode,
          title: extracted.title,
          documentTypeId: autoMatchDocumentTypeId(extracted.fileCode),
          nonClientDocumentTypeId: autoMatchDocumentTypeId(extracted.fileCode),
          projectCategoryId: projectCategoryId || '',
          isClientDocument: false,
          expiryOverrideEnabled: false,
          expiryOverride: {
            trackingEnabled: false,
            startDate: getToday(),
            expiryDate: '',
            remarks: ''
          },
          collapsed: true
        }
        byKey.set(key, allClientChecked ? applyClientDeclaration(base, true) : base)
      })
      const maxFiles = Math.min(100, Math.max(1, parseInt(bulkUploadLimit, 10) || 10))
      const nextItems = Array.from(byKey.values())
      if (nextItems.length > maxFiles) {
        setFormError(String(t('bulk_import_too_many_files')).replace('{max}', String(maxFiles)))
        return prev
      }
      return nextItems
    })
  }

  const handleFileSelect = (e) => {
    if (!e.target.files) return
    addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const handleFolderSelect = (e) => {
    if (!e.target.files) return
    addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true)
    if (e.type === 'dragleave') setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files))
    }
  }

  const handleBrowseClick = () => fileInputRef.current?.click()
  const handleBrowseFolderClick = () => {
    setFolderPickerConfirm({
      show: true,
      onConfirm: () => {
        setFolderPickerConfirm({ show: false, onConfirm: null })
        setTimeout(() => folderInputRef.current?.click(), 0)
      }
    })
  }

  const removeFile = (idx) => setFileItems((prev) => prev.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    setFormError('')
    if (totalSelectedExceeded) {
      setFormError(String(t('bulk_import_total_upload_limit_exceeded')).replace('{max}', String(totalUploadLimitMB)))
      return
    }
    if (!folderId) {
      setFormError(t('bulk_import_error_select_folder'))
      return
    }
    if (projectCategories.length > 0 && !String(projectCategoryId || '').trim()) {
      setFormError(t('bulk_import_error_select_project_category'))
      return
    }
    if (fileItems.length === 0) {
      setFormError(t('bulk_import_error_select_files'))
      return
    }
    if (expiryInfo.trackingEnabled && (!String(expiryInfo.startDate || '').trim() || !String(expiryInfo.expiryDate || '').trim())) {
      setFormError('Start date and expiry date are required when expiry tracking is enabled.')
      return
    }
    for (let i = 0; i < fileItems.length; i++) {
      const item = fileItems[i]
      if (item.expiryOverrideEnabled && item.expiryOverride?.trackingEnabled && (!String(item.expiryOverride?.startDate || '').trim() || !String(item.expiryOverride?.expiryDate || '').trim())) {
        setFormError('Start date and expiry date are required when expiry tracking is enabled.')
        setFileItems((prev) => prev.map((it, idx) => idx === i ? { ...it, collapsed: false } : it))
        return
      }
      if (!item.isClientDocument && !String(item.fileCode || '').trim()) {
        setFormError(String(t('bulk_import_error_file_code_required')).replace('{name}', String(item.file.name)))
        setFileItems((prev) => prev.map((it, idx) => idx === i ? { ...it, collapsed: false } : it))
        return
      }
      if (!String(item.documentTypeId || '').trim()) {
        setFormError(String(t('bulk_import_error_doc_type_required')).replace('{name}', String(item.file.name)))
        setFileItems((prev) => prev.map((it, idx) => idx === i ? { ...it, collapsed: false } : it))
        return
      }
    }

    setSubmitting(true)
    try {
      const payload = {
        folderId,
        description,
        expiryInfo: expiryInfo.trackingEnabled
          ? {
              trackingEnabled: true,
              startDate: expiryInfo.startDate,
              expiryDate: expiryInfo.expiryDate,
              remarks: expiryInfo.remarks
            }
          : { trackingEnabled: false },
        files: fileItems.map((it) => it.file),
        filesMeta: fileItems.map((it) => ({
          fileCode: String(it.fileCode || '').trim(),
          title: String(it.title || '').trim(),
          documentTypeId: it.documentTypeId ? parseInt(it.documentTypeId) : null,
          projectCategoryId: it.projectCategoryId ? parseInt(it.projectCategoryId) : null,
          isClientDocument: Boolean(it.isClientDocument),
          relativePath: String(it.relativePath || '').trim(),
          expiryInfo: it.expiryOverrideEnabled
            ? {
                trackingEnabled: Boolean(it.expiryOverride?.trackingEnabled),
                startDate: it.expiryOverride?.startDate || '',
                expiryDate: it.expiryOverride?.expiryDate || '',
                remarks: it.expiryOverride?.remarks || ''
              }
            : null
        }))
      }
      try {
        await onSubmit(payload)
      } catch (e) {
        const status = e?.response?.status
        const apiMsg = e?.response?.data?.message
        const apiErrors = e?.response?.data?.errors
        if (status === 409 && Array.isArray(apiErrors) && apiErrors.some((x) => x?.requestedFileCode && x?.suggestedFileCode)) {
          setReassignConfirm({ show: true, conflicts: apiErrors, payload })
          return
        }
        setFormError(apiMsg || 'Bulk import failed')
        return
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const modal = (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <ConfirmModal
        show={folderPickerConfirm.show}
        title={t('bulk_import_folder_picker_title')}
        message={t('bulk_import_folder_picker_message')}
        type="info"
        confirmText={t('continue')}
        cancelText={t('cancel')}
        onConfirm={() => folderPickerConfirm.onConfirm?.()}
        onCancel={() => setFolderPickerConfirm({ show: false, onConfirm: null })}
      />
      <ConfirmModal
        show={reassignConfirm.show}
        title="File code redundant"
        message={(Array.isArray(reassignConfirm.conflicts) ? reassignConfirm.conflicts : [])
          .slice(0, 6)
          .map((c) => `Line ${c.lineNumber || '-'}: ${c.requestedFileCode} -> ${c.suggestedFileCode}`)
          .join('\n')}
        type="warning"
        confirmText="Reassign & Continue"
        cancelText={t('cancel')}
        onConfirm={async () => {
          const payload = reassignConfirm.payload
          if (!payload) return
          setReassignConfirm({ show: false, conflicts: [], payload: null })
          setSubmitting(true)
          try {
            await onSubmit({ ...payload, allowReassign: true })
          } finally {
            setSubmitting(false)
          }
        }}
        onCancel={() => setReassignConfirm({ show: false, conflicts: [], payload: null })}
      />
      <div
        className="fixed inset-0 bg-overlay transition-opacity"
        onClick={() => {
          if (submitting) return
          handleClose()
        }}
      />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-surface border border-border rounded-2xl shadow-dms-lg max-w-2xl w-full max-h-[90vh] overflow-hidden" data-tour-id="bulk-import-modal">
          <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-surface">
            <div>
              <h2 className="text-lg font-bold text-ink">{t('bulk_import_title')}</h2>
              <p className="text-sm text-ink-secondary mt-1">{t('bulk_import_subtitle')}</p>
            </div>
            <button
              onClick={handleClose}
              disabled={submitting}
              className="text-ink-soft hover:text-ink transition-colors disabled:opacity-50 disabled:hover:text-ink-soft"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
            {formError && (
              <div className="p-3 rounded-lg border border-[var(--dms-color-danger-ink)]/20 bg-[var(--dms-color-danger-soft)] text-sm text-[var(--dms-color-danger-ink)]">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">{t('bulk_import_folder_label')}</label>
                <select
                  value={folderId || ''}
                  onChange={(e) => setFolderId(e.target.value)}
                  data-tour-id="bulk-import-folder"
                  className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                >
                  <option value="">{t('bulk_import_select_folder')}</option>
                  {(folders || []).map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.icon} {folder.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">{t('bulk_import_project_category_label')}</label>
                <select
                  value={projectCategoryId || ''}
                  onChange={(e) => setProjectCategoryId(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
                  disabled={projectCategories.length === 0}
                >
                  <option value="">
                    {projectCategories.length > 0 ? t('bulk_import_select_project_category') : t('bulk_import_no_project_categories')}
                  </option>
                  {projectCategories.map((pc) => (
                    <option key={pc.id} value={pc.id}>
                      {pc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-2">{t('bulk_import_description_label')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
            </div>

            <div className="border border-border rounded-lg p-4 space-y-3 bg-surface">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={expiryInfo.trackingEnabled}
                  onChange={(e) => setExpiryInfo((prev) => ({
                    ...prev,
                    trackingEnabled: e.target.checked,
                    startDate: prev.startDate || getToday()
                  }))}
                  className="h-4 w-4 text-brand rounded focus:ring-brand/20"
                />
                Track Expiry (apply to all imported documents)
              </label>
              {expiryInfo.trackingEnabled ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink-secondary mb-2">Start Date</label>
                    <input
                      type="date"
                      value={expiryInfo.startDate}
                      onChange={(e) => setExpiryInfo((prev) => ({ ...prev, startDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-secondary mb-2">Expiry Date</label>
                    <input
                      type="date"
                      value={expiryInfo.expiryDate}
                      onChange={(e) => setExpiryInfo((prev) => ({ ...prev, expiryDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-ink-secondary mb-2">Expiry Remarks</label>
                    <textarea
                      value={expiryInfo.remarks}
                      onChange={(e) => setExpiryInfo((prev) => ({ ...prev, remarks: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                      placeholder="Optional expiry remarks"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div
              className={`border-2 border-dashed rounded-lg p-4 sm:p-6 lg:p-8 text-center transition-colors ${
                isDragging ? 'border-brand bg-[var(--dms-color-info-soft)]' : 'border-border bg-surface-muted'
              }`}
              data-tour-id="bulk-import-dropzone"
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={getAcceptString()}
                className="hidden"
                onChange={handleFileSelect}
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                accept={getAcceptString()}
                className="hidden"
                onChange={handleFolderSelect}
                webkitdirectory=""
                directory=""
              />

              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">{t('bulk_import_dropzone_title')}</p>
                <p className="text-xs text-ink-secondary">
                  {String(t('bulk_import_allowed_types')).replace('{types}', getAllowedTypesDisplay())}
                </p>
                <p className="text-xs text-[var(--dms-color-warning-ink)]">
                  {String(t('bulk_import_total_upload_limit_note')).replace('{max}', String(totalUploadLimitMB))}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleBrowseClick}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-ink-inverse bg-brand rounded-lg hover:bg-brand-hover transition-colors"
                  >
                    {t('bulk_import_browse_files')}
                  </button>
                  <button
                    type="button"
                    onClick={handleBrowseFolderClick}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-brand bg-surface-strong rounded-lg hover:bg-surface-muted transition-colors"
                  >
                    {t('bulk_import_browse_folder')}
                  </button>
                </div>
              </div>
            </div>

            {fileItems.length > 0 && (
              <div className="border border-border rounded-lg bg-surface">
                <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-surface-muted">
                  <div className="text-sm font-medium text-ink">
                    {String(t('bulk_import_files_count')).replace('{count}', String(fileItems.length))}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-xs font-medium ${totalSelectedExceeded ? 'text-[var(--dms-color-danger-ink)]' : 'text-ink-secondary'}`}>
                      {String(t('bulk_import_total_upload_total')).replace('{current}', String(totalSelectedMB)).replace('{max}', String(totalUploadLimitMB))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setFileItems((prev) => prev.map((it) => ({ ...it, collapsed: true })))}
                      className="text-sm text-ink-secondary hover:text-ink font-medium"
                    >
                      {t('bulk_import_collapse_all')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFileItems((prev) => prev.map((it) => ({ ...it, collapsed: false })))}
                      className="text-sm text-ink-secondary hover:text-ink font-medium"
                    >
                      {t('bulk_import_expand_all')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFileItems([])}
                      className="text-sm text-[var(--dms-color-danger-ink)] hover:opacity-90 font-medium"
                    >
                      {t('bulk_import_clear')}
                    </button>
                  </div>
                </div>
                <div className="px-4 py-3 border-b border-border">
                  <label className="inline-flex items-start gap-2 text-xs text-ink-secondary">
                    <input
                      ref={clientDeclarationRef}
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 text-brand rounded focus:ring-brand/20"
                      checked={allClientChecked}
                      onChange={(e) => {
                        const checked = e.target.checked
                        if (checked && !otherTypeId) {
                          setFormError('Document type "Others" not found. Please create it in Configuration > Document Types.')
                          return
                        }
                        setFileItems((prev) => prev.map((x) => applyClientDeclaration(x, checked)))
                      }}
                    />
                    <span>{t('client_document_declaration')}</span>
                  </label>
                </div>
                <div className="max-h-[50vh] overflow-auto divide-y divide-border">
                  {fileItems.map((it, idx) => {
                    const matchedType = documentTypes.find((dt) => String(dt.id) === String(it.documentTypeId))
                    const typeLabel = matchedType ? `${matchedType.name} (${matchedType.prefix})` : t('bulk_import_not_selected')
                    const matchedProject = projectCategories.find((pc) => String(pc.id) === String(projectCategoryId))
                    const projectLabel = matchedProject ? matchedProject.name : t('bulk_import_not_selected')
                    return (
                      <div key={`${it.file.name}:${it.file.size}:${it.file.lastModified}`} className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setFileItems((prev) => prev.map((x, i) => i === idx ? { ...x, collapsed: !x.collapsed } : x))}
                          className="w-full flex items-start justify-between gap-3 text-left"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-ink truncate">{it.file.name}</div>
                            {it.relativePath && (
                              <div className="mt-0.5 text-xs text-ink-muted font-mono truncate">{it.relativePath}</div>
                            )}
                            <div className="mt-0.5 text-xs text-ink-secondary">
                              <span className="font-mono">{it.fileCode || '-'}</span>
                              <span className="mx-2">•</span>
                              <span>{typeLabel}</span>
                              {projectCategories.length > 0 && (
                                <>
                                  <span className="mx-2">•</span>
                                  <span>{projectLabel}</span>
                                </>
                              )}
                              <span className="mx-2">•</span>
                              <span>{(it.file.size / 1024 / 1024).toFixed(2)} MB</span>
                              {it.isClientDocument && (
                                <>
                                  <span className="mx-2">•</span>
                                  <span>{t('client_document_label')}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <label
                              className="inline-flex items-center gap-2 text-xs text-ink-secondary select-none"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 text-brand rounded focus:ring-brand/20"
                                checked={Boolean(it.isClientDocument)}
                                onChange={(e) => {
                                  const checked = e.target.checked
                                  if (checked && !otherTypeId) {
                                    setFormError('Document type "Others" not found. Please create it in Configuration > Document Types.')
                                    return
                                  }
                                  setFileItems((prev) => prev.map((x, i) => i === idx ? applyClientDeclaration(x, checked) : x))
                                }}
                              />
                              <span className="hidden sm:inline">{t('client_document_label')}</span>
                            </label>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              it.documentTypeId && (projectCategories.length === 0 || projectCategoryId) ? 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]' : 'bg-[var(--dms-color-warning-soft)] text-[var(--dms-color-warning-ink)]'
                            }`}>
                              {it.documentTypeId && (projectCategories.length === 0 || projectCategoryId) ? t('bulk_import_ready') : t('bulk_import_needs_attention')}
                            </span>
                            <svg className={`w-5 h-5 text-ink-soft transition-transform ${it.collapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {!it.collapsed && (
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-ink-secondary mb-1">{t('bulk_import_file_code_label')}</label>
                              <input
                                type="text"
                                value={it.fileCode}
                                onChange={(e) => {
                                  const nextCode = e.target.value
                                  setFileItems((prev) => prev.map((x, i) => {
                                    if (i !== idx) return x
                                    return {
                                      ...x,
                                      fileCode: nextCode,
                                      nonClientFileCode: x.isClientDocument ? x.nonClientFileCode : nextCode,
                                      documentTypeId: x.documentTypeId || autoMatchDocumentTypeId(nextCode)
                                    }
                                  }))
                                }}
                                disabled={Boolean(it.isClientDocument)}
                                className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm font-mono bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
                              />
                              <p className="mt-1 text-xs text-ink-muted">{t('bulk_import_auto_extracted_hint')}</p>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-ink-secondary mb-1">{t('bulk_import_document_type_label')}</label>
                              <select
                                value={it.documentTypeId || ''}
                                onChange={(e) => setFileItems((prev) => prev.map((x, i) => i === idx ? { ...x, documentTypeId: e.target.value } : x))}
                                disabled={Boolean(it.isClientDocument) && Boolean(otherTypeId)}
                                className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
                              >
                                <option value="">{t('bulk_import_select_document_type')}</option>
                                {documentTypes.map((dt) => (
                                  <option key={dt.id} value={dt.id}>
                                    {dt.name} ({dt.prefix})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="md:col-span-2 border border-border rounded-lg p-3 bg-surface-muted">
                              <label className="inline-flex items-center gap-2 text-xs font-medium text-ink-secondary">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 text-brand rounded focus:ring-brand/20"
                                  checked={Boolean(it.expiryOverrideEnabled)}
                                  disabled={Boolean(it.isClientDocument)}
                                  onChange={(e) => {
                                    const checked = e.target.checked
                                    setFileItems((prev) => prev.map((x, i) => {
                                      if (i !== idx) return x
                                      return {
                                        ...x,
                                        expiryOverrideEnabled: checked,
                                        expiryOverride: checked
                                          ? {
                                              trackingEnabled: Boolean(expiryInfo.trackingEnabled),
                                              startDate: expiryInfo.startDate || getToday(),
                                              expiryDate: expiryInfo.expiryDate || '',
                                              remarks: expiryInfo.remarks || ''
                                            }
                                          : x.expiryOverride
                                      }
                                    }))
                                  }}
                                />
                                <span>Override expiry for this file</span>
                              </label>
                              {it.expiryOverrideEnabled ? (
                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <label className="inline-flex items-center gap-2 text-xs font-medium text-ink-secondary md:col-span-2">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 text-brand rounded focus:ring-brand/20"
                                      checked={Boolean(it.expiryOverride?.trackingEnabled)}
                                      onChange={(e) => {
                                        const enabled = e.target.checked
                                        setFileItems((prev) => prev.map((x, i) => {
                                          if (i !== idx) return x
                                          return {
                                            ...x,
                                            expiryOverride: {
                                              ...(x.expiryOverride || {}),
                                              trackingEnabled: enabled,
                                              startDate: (x.expiryOverride?.startDate || expiryInfo.startDate || getToday())
                                            }
                                          }
                                        }))
                                      }}
                                    />
                                    <span>Track expiry (this file)</span>
                                  </label>
                                  {it.expiryOverride?.trackingEnabled ? (
                                    <>
                                      <div>
                                        <label className="block text-xs font-medium text-ink-secondary mb-1">Start Date</label>
                                        <input
                                          type="date"
                                          value={it.expiryOverride?.startDate || ''}
                                          onChange={(e) => setFileItems((prev) => prev.map((x, i) => i === idx ? { ...x, expiryOverride: { ...(x.expiryOverride || {}), startDate: e.target.value } } : x))}
                                          className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                                          required
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-ink-secondary mb-1">Expiry Date</label>
                                        <input
                                          type="date"
                                          value={it.expiryOverride?.expiryDate || ''}
                                          onChange={(e) => setFileItems((prev) => prev.map((x, i) => i === idx ? { ...x, expiryOverride: { ...(x.expiryOverride || {}), expiryDate: e.target.value } } : x))}
                                          className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                                          required
                                        />
                                      </div>
                                      <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-ink-secondary mb-1">Expiry Remarks</label>
                                        <textarea
                                          value={it.expiryOverride?.remarks || ''}
                                          onChange={(e) => setFileItems((prev) => prev.map((x, i) => i === idx ? { ...x, expiryOverride: { ...(x.expiryOverride || {}), remarks: e.target.value } } : x))}
                                          rows={2}
                                          className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                                        />
                                      </div>
                                    </>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>

                            <div className="md:col-span-2">
                              <label className="inline-flex items-start gap-2 text-xs text-ink-secondary">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 h-4 w-4 text-brand rounded focus:ring-brand/20"
                                  checked={Boolean(it.isClientDocument)}
                                  onChange={(e) => {
                                    const checked = e.target.checked
                                    if (checked && !otherTypeId) {
                                      setFormError('Document type "Others" not found. Please create it in Configuration > Document Types.')
                                      return
                                    }
                                    setFileItems((prev) => prev.map((x, i) => {
                                      if (i !== idx) return x
                                      return applyClientDeclaration(x, checked)
                                    }))
                                  }}
                                />
                                <span>
                                  {t('client_document_declaration')}
                                </span>
                              </label>
                            </div>

                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-ink-secondary mb-1">{t('bulk_import_title_label')}</label>
                              <input
                                type="text"
                                value={it.title}
                                onChange={(e) => setFileItems((prev) => prev.map((x, i) => i === idx ? { ...x, title: e.target.value } : x))}
                                className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                              />
                            </div>

                            <div className="md:col-span-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => removeFile(idx)}
                                className="text-sm text-[var(--dms-color-danger-ink)] hover:opacity-90 font-medium"
                              >
                                {t('bulk_import_remove_file')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-surface-muted border-t border-border flex justify-end gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-ink-secondary bg-surface border border-border rounded-lg hover:bg-surface-strong transition-colors"
              disabled={submitting}
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleSubmit}
              data-tour-id="bulk-import-submit"
              className="px-4 py-2 text-sm font-medium text-ink-inverse bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-60"
              disabled={submitting || totalSelectedExceeded}
            >
              {submitting ? t('bulk_import_uploading') : t('bulk_import_upload')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}
