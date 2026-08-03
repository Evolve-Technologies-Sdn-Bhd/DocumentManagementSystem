import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as ReactDOM from 'react-dom'
import api from '../api/axios'
import useFileUploadSettings from '../hooks/useFileUploadSettings'
import { usePreferences } from '../contexts/PreferencesContext'
import ConfirmModal from './ConfirmModal'

const REMINDER_LEVELS = [
  { key: 'reminder1', label: 'Reminder 1', daysField: 'reminder1Days' },
  { key: 'reminder2', label: 'Reminder 2', daysField: 'reminder2Days' },
  { key: 'reminder3', label: 'Reminder 3', daysField: 'reminder3Days' },
  { key: 'reminder4', label: 'Reminder 4', daysField: 'reminder4Days' }
]

const createReminderRecipients = () => ({
  reminder1: [],
  reminder2: [],
  reminder3: [],
  reminder4: []
})

const createReminderSearch = () => ({
  reminder1: '',
  reminder2: '',
  reminder3: '',
  reminder4: ''
})

const cloneReminderRecipients = (value) => ({
  reminder1: Array.isArray(value?.reminder1) ? [...value.reminder1] : [],
  reminder2: Array.isArray(value?.reminder2) ? [...value.reminder2] : [],
  reminder3: Array.isArray(value?.reminder3) ? [...value.reminder3] : [],
  reminder4: Array.isArray(value?.reminder4) ? [...value.reminder4] : []
})

const formatUserLabel = (user) => `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || '-'

function ReminderRecipientsPicker({
  values,
  activeUsers,
  searchValues,
  onSearchChange,
  onToggle,
  ownerSummary = 'Owner included automatically'
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-ink">Reminder Recipients</h4>
        <p className="text-xs text-ink-soft">Owner always receives every reminder. Add extra recipients for each reminder level below.</p>
      </div>
      {REMINDER_LEVELS.map((level) => {
        const selectedRaw = values?.reminderRecipients?.[level.key] ?? values?.[level.key] ?? []
        const selectedIds = new Set(selectedRaw)
        const searchTerm = (searchValues?.[level.key] || '').trim().toLowerCase()
        const selectedUsers = activeUsers.filter((user) => selectedIds.has(user.id))
        const filteredUsers = activeUsers.filter((user) => {
          if (!searchTerm) return true
          return formatUserLabel(user).toLowerCase().includes(searchTerm)
        })
        const selectedSummary = selectedUsers.length > 0
          ? selectedUsers.slice(0, 2).map((user) => formatUserLabel(user)).join(', ')
          : ''
        const selectedOverflow = selectedUsers.length > 2 ? ` +${selectedUsers.length - 2} more` : ''

        return (
          <details key={level.key} className="rounded-xl border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:hidden">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{level.label}</p>
                <p className="text-xs text-ink-soft">
                  {values?.[level.daysField] ?? '-'} day(s) before expiry
                </p>
                <p className="mt-1 truncate text-xs text-ink-soft">
                  Owner + {selectedIds.size} extra recipient(s)
                  {selectedSummary ? ` | ${selectedSummary}${selectedOverflow}` : ' | No extra recipients selected'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-medium text-ink-soft">Click to expand</p>
                <p className="text-xs text-ink-soft">{ownerSummary}</p>
              </div>
            </summary>
            <div className="space-y-3 border-t border-border px-4 py-3">
              <input
                type="text"
                value={searchValues?.[level.key] || ''}
                onChange={(e) => onSearchChange(level.key, e.target.value)}
                placeholder="Search user name"
                className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {filteredUsers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-ink-soft">
                    No matching user found.
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <label key={`${level.key}-${user.id}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(user.id)}
                        onChange={() => onToggle(level.key, user.id)}
                        className="h-4 w-4 text-brand rounded focus:ring-brand/20"
                      />
                      <span>{formatUserLabel(user)}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </details>
        )
      })}
    </div>
  )
}

function getOtherDocumentationTypeId(documentTypes) {
  const types = Array.isArray(documentTypes) ? documentTypes : []
  const byName = types.find((dt) => String(dt?.name || '').toLowerCase() === 'others')
  if (byName) return String(byName.id)
  const byPrefix = types.find((dt) => String(dt?.prefix || '').toLowerCase() === 'oth')
  if (byPrefix) return String(byPrefix.id)
  return ''
}

const BULK_IMPORT_STEPS = [
  { key: 'folder', title: 'Select Folder', description: 'Choose the destination folder first.' },
  { key: 'project', title: 'Project Category', description: 'Assign the project category before uploading.' },
  { key: 'files', title: 'Choose Files', description: 'Add the files or folder you want to import.' },
  { key: 'metadata', title: 'Review Metadata', description: 'Check file code, document type, and title for each file.' },
  { key: 'expiry', title: 'Expiry Options', description: 'Optionally enable expiry tracking, then upload.' }
]

function buildFileCodeGuide(settings) {
  const safeSettings = settings && typeof settings === 'object' ? settings : {}
  const separator = String(safeSettings.separator || '/')
  const prefix = String(safeSettings.prefixPlaceholder || 'PFX').toUpperCase()
  const includeVersion = Boolean(safeSettings.includeVersion)
  const versionDigits = includeVersion ? Math.max(1, parseInt(safeSettings.versionDigits, 10) || 2) : 0
  const dateFormat = String(safeSettings.dateFormat || 'YYMMDD').toUpperCase()
  const counterDigits = Math.max(1, parseInt(safeSettings.counterDigits, 10) || 3)

  const formatParts = [prefix]
  if (includeVersion) formatParts.push('V'.repeat(versionDigits))
  if (dateFormat !== 'NONE') formatParts.push(dateFormat)
  formatParts.push('X'.repeat(counterDigits))

  const legendParts = [
    `${prefix}=prefix`
  ]
  if (includeVersion) legendParts.push(`${'V'.repeat(versionDigits)}=version`)
  if (dateFormat !== 'NONE') legendParts.push(`${dateFormat}=date`)
  legendParts.push(`${'X'.repeat(counterDigits)}=running number`)

  return {
    format: formatParts.join(separator),
    legend: legendParts.join(', ')
  }
}

export default function BulkImportModal({ isOpen, onClose, onSubmit, folders, selectedFolderId }) {
  const normalizeFolderId = (value) => String(value ?? '').trim()
  const [folderId, setFolderId] = useState(selectedFolderId || '')
  const [currentStep, setCurrentStep] = useState(0)
  const [folderPickerQuery, setFolderPickerQuery] = useState('')
  const [folderPickerExpanded, setFolderPickerExpanded] = useState([])
  const [projectCategoryId, setProjectCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const getToday = () => new Date().toISOString().slice(0, 10)
  const [users, setUsers] = useState([])
  const [expirySettings, setExpirySettings] = useState({
    expiringSoonDays: 60,
    reminder1Days: 90,
    reminder2Days: 60,
    reminder3Days: 30,
    reminder4Days: 7
  })
  const [expiryInfo, setExpiryInfo] = useState({
    trackingEnabled: false,
    useGlobalRule: true,
    startDate: getToday(),
    expiryDate: '',
    remarks: '',
    expiringSoonDays: 60,
    reminder1Days: 90,
    reminder2Days: 60,
    reminder3Days: 30,
    reminder4Days: 7,
    reminderRecipients: createReminderRecipients()
  })
  const [recipientSearch, setRecipientSearch] = useState({
    global: createReminderSearch(),
    file: {}
  })
  const [fileItems, setFileItems] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [expiryEditor, setExpiryEditor] = useState({ open: false, itemIndex: -1, draft: null })
  const [expiryEditorSearch, setExpiryEditorSearch] = useState(createReminderSearch())
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
  const fileCodeGuide = useMemo(() => buildFileCodeGuide(numberingSettings), [numberingSettings])
  const projectCategoryRequired = projectCategories.length > 0
  const currentStepConfig = BULK_IMPORT_STEPS[currentStep] || BULK_IMPORT_STEPS[0]
  const metadataReadyCount = useMemo(
    () => fileItems.filter((it) => Boolean(it.documentTypeId) && (it.isClientDocument || String(it.fileCode || '').trim())).length,
    [fileItems]
  )
  const folderPickerTree = useMemo(() => {
    const root = []
    const nodeMap = new Map()

    ;(Array.isArray(folders) ? folders : []).forEach((folder) => {
      const id = normalizeFolderId(folder?.id)
      if (!id) return

      const pathSegments = Array.isArray(folder?.fullPath) && folder.fullPath.length > 0
        ? folder.fullPath.map((part) => String(part || '').trim()).filter(Boolean)
        : String(folder?.path || folder?.name || '')
            .split('›')
            .map((part) => part.trim())
            .filter(Boolean)

      if (pathSegments.length === 0) return

      let currentLevel = root
      let currentPath = []

      pathSegments.forEach((segment, index) => {
        currentPath = [...currentPath, segment]
        const pathKey = currentPath.join(' / ')
        let node = nodeMap.get(pathKey)

        if (!node) {
          node = {
            key: pathKey,
            name: segment,
            pathSegments: [...currentPath],
            fullPathLabel: pathKey,
            folderId: '',
            selectable: false,
            icon: index === 0 ? '📁' : '📂',
            children: []
          }
          nodeMap.set(pathKey, node)
          currentLevel.push(node)
        }

        if (index === pathSegments.length - 1) {
          node.folderId = id
          node.selectable = true
          node.icon = folder?.icon || (index === 0 ? '📁' : '📂')
          node.meta = folder
        }

        currentLevel = node.children
      })
    })

    return root
  }, [folders])
  const folderPickerNodeMap = useMemo(() => {
    const map = new Map()
    const visit = (nodes) => {
      ;(nodes || []).forEach((node) => {
        map.set(node.key, node)
        visit(node.children)
      })
    }
    visit(folderPickerTree)
    return map
  }, [folderPickerTree])
  const selectedFolderMeta = useMemo(() => {
    const targetId = normalizeFolderId(folderId)
    if (!targetId) return null
    return (Array.isArray(folders) ? folders : []).find((folder) => normalizeFolderId(folder?.id) === targetId) || null
  }, [folders, folderId])
  const selectedFolderPath = Array.isArray(selectedFolderMeta?.fullPath)
    ? selectedFolderMeta.fullPath.join(' / ')
    : (selectedFolderMeta?.path || '')
  const filteredFolderPickerTree = useMemo(() => {
    const query = String(folderPickerQuery || '').trim().toLowerCase()
    const filterNodes = (nodes) => {
      return (nodes || []).reduce((acc, node) => {
        const children = filterNodes(node.children)
        const matchesQuery = !query || node.fullPathLabel.toLowerCase().includes(query)

        if (matchesQuery || children.length > 0) {
          acc.push({
            ...node,
            children
          })
        }

        return acc
      }, [])
    }

    return filterNodes(folderPickerTree)
  }, [folderPickerQuery, folderPickerTree])
  const activeUsers = useMemo(() => {
    if (!Array.isArray(users)) return []
    return users
      .filter((u) => String(u.status || '').toUpperCase() === 'ACTIVE')
      .sort((left, right) => formatUserLabel(left).localeCompare(formatUserLabel(right)))
  }, [users])
  const clientDeclarationRef = useRef(null)

  useEffect(() => {
    if (!clientDeclarationRef.current) return
    clientDeclarationRef.current.indeterminate = Boolean(!allClientChecked && someClientChecked)
  }, [allClientChecked, someClientChecked])

  useEffect(() => {
    if (!isOpen) return
    setFolderId(selectedFolderId || '')
    setCurrentStep(0)
    setFolderPickerQuery('')
    refreshSettings()
  }, [isOpen, selectedFolderId])

  useEffect(() => {
    if (!isOpen) return
    const targetId = normalizeFolderId(selectedFolderId || '')
    if (!targetId) {
      setFolderPickerExpanded([])
      return
    }

    const selectedNode = Array.from(folderPickerNodeMap.values()).find((node) => node.folderId === targetId)
    if (!selectedNode) {
      setFolderPickerExpanded([])
      return
    }

    const ancestorKeys = selectedNode.pathSegments
      .slice(0, -1)
      .map((_, index) => selectedNode.pathSegments.slice(0, index + 1).join(' / '))

    setFolderPickerExpanded(ancestorKeys)
  }, [isOpen, selectedFolderId, folderPickerNodeMap])

  useEffect(() => {
    if (!isOpen) return
    setProjectCategoryId('')
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const load = async () => {
      try {
        const response = await api.get('/system/config/expiry-tracking')
        const nextSettings = response.data?.data?.settings
        if (cancelled) return
        if (nextSettings && typeof nextSettings === 'object') {
          setExpirySettings(nextSettings)
          setExpiryInfo((prev) => {
            if (!prev.useGlobalRule) return prev
            return {
              ...prev,
              expiringSoonDays: nextSettings.expiringSoonDays,
              reminder1Days: nextSettings.reminder1Days,
              reminder2Days: nextSettings.reminder2Days,
              reminder3Days: nextSettings.reminder3Days,
              reminder4Days: nextSettings.reminder4Days
            }
          })
        }
      } catch (_) {}
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const load = async () => {
      try {
        const response = await api.get('/users')
        if (cancelled) return
        setUsers(response.data?.data?.users || response.data?.users || [])
      } catch (_) {
        if (cancelled) return
        setUsers([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
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
      useGlobalRule: true,
      startDate: getToday(),
      expiryDate: '',
      remarks: '',
      expiringSoonDays: expirySettings.expiringSoonDays,
      reminder1Days: expirySettings.reminder1Days,
      reminder2Days: expirySettings.reminder2Days,
      reminder3Days: expirySettings.reminder3Days,
      reminder4Days: expirySettings.reminder4Days,
      reminderRecipients: createReminderRecipients()
    })
    setRecipientSearch({ global: createReminderSearch(), file: {} })
    setFormError('')
    setDocumentTypes([])
    setNumberingSettings(null)
    setProjectCategories([])
    setFolderId(selectedFolderId || '')
    setCurrentStep(0)
    setFolderPickerQuery('')
    setFolderPickerExpanded([])
    setUsers([])
    setReassignConfirm({ show: false, conflicts: [], payload: null })
    onClose()
  }

  const toggleFolderPickerNode = (nodeKey) => {
    setFolderPickerExpanded((prev) => (
      prev.includes(nodeKey)
        ? prev.filter((key) => key !== nodeKey)
        : [...prev, nodeKey]
    ))
  }

  const FolderPickerTreeItem = ({ node, level = 0, forceExpanded = false }) => {
    const isExpanded = forceExpanded || folderPickerExpanded.includes(node.key)
    const hasChildren = (node.children || []).length > 0
    const isSelected = normalizeFolderId(folderId) === normalizeFolderId(node.folderId)

    const handleSelect = () => {
      if (node.selectable && node.folderId) {
        setFolderId(node.folderId)
        setFormError('')
      }

      if (hasChildren && !forceExpanded) {
        toggleFolderPickerNode(node.key)
      }
    }

    return (
      <div key={node.key}>
        <div
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
            isSelected
              ? 'bg-brand/10 text-brand ring-1 ring-brand/20'
              : node.selectable
                ? 'cursor-pointer text-ink hover:bg-surface-muted'
                : 'text-ink-soft'
          }`}
          style={{ paddingLeft: `${12 + level * 18}px` }}
          onClick={handleSelect}
        >
          <span className="text-base leading-none">{node.icon || (level === 0 ? '📁' : '📂')}</span>
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {!node.selectable && (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-soft">
              Parent
            </span>
          )}
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!forceExpanded) toggleFolderPickerNode(node.key)
              }}
              disabled={forceExpanded}
              className="rounded-full p-1 text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:cursor-default disabled:opacity-40"
              aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            >
              <svg
                className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div className="space-y-1">
            {node.children.map((child) => (
              <FolderPickerTreeItem
                key={child.key}
                node={child}
                level={level + 1}
                forceExpanded={forceExpanded}
              />
            ))}
          </div>
        )}
      </div>
    )
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

  const normalizeFileCode = (raw, options = {}) => {
    const input = String(raw || '').trim()
    if (!input) return ''
    const settings = numberingSettings
    if (!settings) return input
    const strict = Boolean(options.strict)

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

    return strict ? '' : input
  }

  const extractFromFilename = (fileName) => {
    const dot = fileName.lastIndexOf('.')
    const base = dot > 0 ? fileName.slice(0, dot) : fileName
    const trimmed = base.trim()
    const underscore = trimmed.indexOf('_')
    if (underscore > 0) {
      const fileCode = normalizeFileCode(trimmed.slice(0, underscore).trim(), { strict: true })
      const title = trimmed.slice(underscore + 1).trim() || trimmed
      return { fileCode, title, fallbackTitle: trimmed }
    }
    const normalized = normalizeFileCode(trimmed, { strict: true })
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

  const getFileItemKey = (item) => `${item?.relativePath || item?.file?.name || ''}:${item?.file?.size || 0}:${item?.file?.lastModified || 0}`

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

  const updateSearchScope = (scope, levelKey, value) => {
    setRecipientSearch((prev) => {
      if (scope === 'global') {
        return {
          ...prev,
          global: {
            ...(prev.global || createReminderSearch()),
            [levelKey]: value
          }
        }
      }

      return {
        ...prev,
        file: {
          ...prev.file,
          [scope]: {
            ...(prev.file?.[scope] || createReminderSearch()),
            [levelKey]: value
          }
        }
      }
    })
  }

  const toggleGlobalRecipient = (levelKey, userId) => {
    setExpiryInfo((prev) => {
      const existing = new Set(prev.reminderRecipients?.[levelKey] || [])
      if (existing.has(userId)) existing.delete(userId)
      else existing.add(userId)
      return {
        ...prev,
        reminderRecipients: {
          ...prev.reminderRecipients,
          [levelKey]: Array.from(existing)
        }
      }
    })
  }

  const toggleFileRecipient = (fileKey, itemIndex, levelKey, userId) => {
    setFileItems((prev) => prev.map((item, idx) => {
      if (idx !== itemIndex) return item
      const existing = new Set(item.expiryOverride?.reminderRecipients?.[levelKey] || [])
      if (existing.has(userId)) existing.delete(userId)
      else existing.add(userId)
      return {
        ...item,
        expiryOverride: {
          ...(item.expiryOverride || {}),
          reminderRecipients: {
            ...(item.expiryOverride?.reminderRecipients || createReminderRecipients()),
            [levelKey]: Array.from(existing)
          }
        }
      }
    }))

    setRecipientSearch((prev) => ({
      ...prev,
      file: {
        ...prev.file,
        [fileKey]: prev.file?.[fileKey] || createReminderSearch()
      }
    }))
  }

  const buildExpiryOverrideDraft = (source) => ({
    trackingEnabled: true,
    startDate: source?.startDate || getToday(),
    expiryDate: source?.expiryDate || '',
    remarks: source?.remarks || '',
    expiringSoonDays: source?.expiringSoonDays ?? expiryInfo.expiringSoonDays,
    reminder1Days: source?.reminder1Days ?? expiryInfo.reminder1Days,
    reminder2Days: source?.reminder2Days ?? expiryInfo.reminder2Days,
    reminder3Days: source?.reminder3Days ?? expiryInfo.reminder3Days,
    reminder4Days: source?.reminder4Days ?? expiryInfo.reminder4Days,
    reminderRecipients: cloneReminderRecipients(source?.reminderRecipients || expiryInfo.reminderRecipients || createReminderRecipients())
  })

  const getExpirySummary = (item) => {
    if (item?.isClientDocument) return 'Not available for Other documentation'
    if (item?.expiryOverrideEnabled) {
      if (item?.expiryOverride?.trackingEnabled) {
        const start = item?.expiryOverride?.startDate || '-'
        const end = item?.expiryOverride?.expiryDate || '-'
        return `Custom expiry: ${start} -> ${end}`
      }
      return 'Custom setting: no expiry tracking'
    }
    if (expiryInfo.trackingEnabled) {
      const start = expiryInfo.startDate || '-'
      const end = expiryInfo.expiryDate || '-'
      return `Using global expiry: ${start} -> ${end}`
    }
    return 'No expiry tracking'
  }

  const openExpiryEditor = (itemIndex) => {
    const item = fileItems[itemIndex]
    if (!item || item.isClientDocument) return
    const source = item.expiryOverrideEnabled
      ? item.expiryOverride
      : {
          trackingEnabled: true,
          startDate: expiryInfo.startDate || getToday(),
          expiryDate: expiryInfo.expiryDate || '',
          remarks: expiryInfo.remarks || '',
          expiringSoonDays: expiryInfo.expiringSoonDays,
          reminder1Days: expiryInfo.reminder1Days,
          reminder2Days: expiryInfo.reminder2Days,
          reminder3Days: expiryInfo.reminder3Days,
          reminder4Days: expiryInfo.reminder4Days,
          reminderRecipients: cloneReminderRecipients(expiryInfo.reminderRecipients)
        }

    setExpiryEditor({
      open: true,
      itemIndex,
      draft: buildExpiryOverrideDraft(source)
    })
    setExpiryEditorSearch(createReminderSearch())
  }

  const closeExpiryEditor = () => {
    setExpiryEditor({ open: false, itemIndex: -1, draft: null })
    setExpiryEditorSearch(createReminderSearch())
  }

  const saveExpiryEditor = () => {
    if (!expiryEditor.open || expiryEditor.itemIndex < 0 || !expiryEditor.draft) return
    if (!String(expiryEditor.draft.startDate || '').trim() || !String(expiryEditor.draft.expiryDate || '').trim()) {
      setFormError('Start date and expiry date are required when expiry tracking is enabled.')
      return
    }

    setFileItems((prev) => prev.map((item, idx) => {
      if (idx !== expiryEditor.itemIndex) return item
      return {
        ...item,
        expiryOverrideEnabled: true,
        expiryOverride: {
          ...expiryEditor.draft,
          reminderRecipients: cloneReminderRecipients(expiryEditor.draft.reminderRecipients)
        }
      }
    }))
    setFormError('')
    closeExpiryEditor()
  }

  const clearExpiryOverride = (itemIndex) => {
    setFileItems((prev) => prev.map((item, idx) => {
      if (idx !== itemIndex) return item
      return {
        ...item,
        expiryOverrideEnabled: false,
        expiryOverride: {
          trackingEnabled: false,
          startDate: getToday(),
          expiryDate: '',
          remarks: '',
          expiringSoonDays: expiryInfo.expiringSoonDays,
          reminder1Days: expiryInfo.reminder1Days,
          reminder2Days: expiryInfo.reminder2Days,
          reminder3Days: expiryInfo.reminder3Days,
          reminder4Days: expiryInfo.reminder4Days,
          reminderRecipients: cloneReminderRecipients(expiryInfo.reminderRecipients)
        }
      }
    }))
    if (expiryEditor.open && expiryEditor.itemIndex === itemIndex) {
      closeExpiryEditor()
    }
  }

  const updateExpiryEditorSearch = (levelKey, value) => {
    setExpiryEditorSearch((prev) => ({ ...prev, [levelKey]: value }))
  }

  const toggleExpiryEditorRecipient = (levelKey, userId) => {
    setExpiryEditor((prev) => {
      if (!prev.draft) return prev
      const existing = new Set(prev.draft.reminderRecipients?.[levelKey] || [])
      if (existing.has(userId)) existing.delete(userId)
      else existing.add(userId)

      return {
        ...prev,
        draft: {
          ...prev.draft,
          reminderRecipients: {
            ...(prev.draft.reminderRecipients || createReminderRecipients()),
            [levelKey]: Array.from(existing)
          }
        }
      }
    })
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
            remarks: '',
            reminderRecipients: createReminderRecipients()
          },
          advancedOpen: false,
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

  const expandFilePanel = (indexToOpen) => {
    if (indexToOpen < 0) return
    setFileItems((prev) => prev.map((it, idx) => ({
      ...it,
      collapsed: idx !== indexToOpen,
      advancedOpen: idx === indexToOpen ? it.advancedOpen : false
    })))
  }

  const toggleFilePanel = (indexToToggle) => {
    setFileItems((prev) => prev.map((it, idx) => {
      if (idx === indexToToggle) {
        const nextCollapsed = !it.collapsed
        return {
          ...it,
          collapsed: nextCollapsed,
          advancedOpen: nextCollapsed ? false : it.advancedOpen
        }
      }

      return {
        ...it,
        collapsed: true,
        advancedOpen: false
      }
    }))
  }

  const toggleAdvancedPanel = (indexToToggle) => {
    setFileItems((prev) => prev.map((it, idx) => (
      idx === indexToToggle ? { ...it, advancedOpen: !it.advancedOpen } : it
    )))
  }

  const validateMetadataStep = () => {
    if (fileItems.length === 0) {
      setFormError(t('bulk_import_error_select_files'))
      return false
    }

    for (let i = 0; i < fileItems.length; i++) {
      const item = fileItems[i]
      if (!item.isClientDocument && !String(item.fileCode || '').trim()) {
        setFormError(String(t('bulk_import_error_file_code_required')).replace('{name}', String(item.file.name)))
        expandFilePanel(i)
        return false
      }
      if (!String(item.documentTypeId || '').trim()) {
        setFormError(String(t('bulk_import_error_doc_type_required')).replace('{name}', String(item.file.name)))
        expandFilePanel(i)
        return false
      }
    }

    return true
  }

  const validateExpiryStep = () => {
    if (totalSelectedExceeded) {
      setFormError(String(t('bulk_import_total_upload_limit_exceeded')).replace('{max}', String(totalUploadLimitMB)))
      return false
    }
    if (expiryInfo.trackingEnabled && (!String(expiryInfo.startDate || '').trim() || !String(expiryInfo.expiryDate || '').trim())) {
      setFormError('Start date and expiry date are required when expiry tracking is enabled.')
      return false
    }
    for (let i = 0; i < fileItems.length; i++) {
      const item = fileItems[i]
      if (item.expiryOverrideEnabled && item.expiryOverride?.trackingEnabled && (!String(item.expiryOverride?.startDate || '').trim() || !String(item.expiryOverride?.expiryDate || '').trim())) {
        setFormError('Start date and expiry date are required when expiry tracking is enabled.')
        expandFilePanel(i)
        return false
      }
    }
    return true
  }

  const validateStepTransition = (stepIndex) => {
    setFormError('')

    if (stepIndex === 0) {
      if (!folderId) {
        setFormError(t('bulk_import_error_select_folder'))
        return false
      }
      return true
    }

    if (stepIndex === 1) {
      if (projectCategoryRequired && !String(projectCategoryId || '').trim()) {
        setFormError(t('bulk_import_error_select_project_category'))
        return false
      }
      return true
    }

    if (stepIndex === 2) {
      if (totalSelectedExceeded) {
        setFormError(String(t('bulk_import_total_upload_limit_exceeded')).replace('{max}', String(totalUploadLimitMB)))
        return false
      }
      if (fileItems.length === 0) {
        setFormError(t('bulk_import_error_select_files'))
        return false
      }
      return true
    }

    if (stepIndex === 3) {
      return validateMetadataStep()
    }

    if (stepIndex === 4) {
      return validateExpiryStep()
    }

    return true
  }

  const goToStep = (nextStep) => {
    if (nextStep === currentStep) return
    if (nextStep < currentStep) {
      setFormError('')
      setCurrentStep(nextStep)
      return
    }

    for (let step = currentStep; step < nextStep; step++) {
      if (!validateStepTransition(step)) return
    }

    setCurrentStep(nextStep)
  }

  const handleNextStep = () => {
    if (!validateStepTransition(currentStep)) return
    setCurrentStep((prev) => Math.min(prev + 1, BULK_IMPORT_STEPS.length - 1))
  }

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
    if (!validateMetadataStep() || !validateExpiryStep()) return

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
              remarks: expiryInfo.remarks,
              expiringSoonDays: expiryInfo.expiringSoonDays,
              reminder1Days: expiryInfo.reminder1Days,
              reminder2Days: expiryInfo.reminder2Days,
              reminder3Days: expiryInfo.reminder3Days,
              reminder4Days: expiryInfo.reminder4Days,
              reminderRecipients: expiryInfo.reminderRecipients
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
                remarks: it.expiryOverride?.remarks || '',
                expiringSoonDays: it.expiryOverride?.expiringSoonDays,
                reminder1Days: it.expiryOverride?.reminder1Days,
                reminder2Days: it.expiryOverride?.reminder2Days,
                reminder3Days: it.expiryOverride?.reminder3Days,
                reminder4Days: it.expiryOverride?.reminder4Days,
                reminderRecipients: it.expiryOverride?.reminderRecipients || createReminderRecipients()
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
        <div className="relative bg-surface border border-border rounded-2xl shadow-dms-lg max-w-6xl xl:max-w-[1180px] w-full max-h-[90vh] overflow-hidden flex flex-col" data-tour-id="bulk-import-modal">
          <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-surface">
            <div>
              <h2 className="text-lg font-bold text-ink">{t('bulk_import_title')}</h2>
              <p className="text-sm text-ink-secondary mt-1">{currentStepConfig.description}</p>
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

          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            {formError && (
              <div className="p-3 rounded-lg border border-[var(--dms-color-danger-ink)]/20 bg-[var(--dms-color-danger-soft)] text-sm text-[var(--dms-color-danger-ink)]">
                {formError}
              </div>
            )}
            <div className="rounded-xl border border-border bg-surface-muted px-3 py-3">
              <div className="flex flex-nowrap items-center justify-center gap-2 overflow-x-auto whitespace-nowrap">
                {BULK_IMPORT_STEPS.map((step, idx) => {
                  const isActive = idx === currentStep
                  const isCompleted = idx < currentStep
                  return (
                    <React.Fragment key={step.key}>
                      <button
                        type="button"
                        onClick={() => goToStep(idx)}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
                          isActive
                            ? 'border-brand bg-white text-brand shadow-sm'
                            : isCompleted
                              ? 'border-transparent bg-white/90 text-ink hover:bg-white'
                              : 'border-transparent bg-transparent text-ink-secondary hover:bg-white/60'
                        }`}
                      >
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                          isActive
                            ? 'bg-brand text-white'
                            : isCompleted
                              ? 'bg-[var(--dms-color-success-soft)] text-[var(--dms-color-success-ink)]'
                              : 'bg-white text-ink-soft'
                        }`}>
                          {isCompleted ? '✓' : idx + 1}
                        </span>
                        <span>{step.title}</span>
                      </button>
                      {idx < BULK_IMPORT_STEPS.length - 1 ? (
                        <span className="shrink-0 text-sm text-ink-soft">→</span>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </div>
            </div>

            {currentStep > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-surface px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Folder</div>
                  <div className="mt-1 text-sm font-medium text-ink">{selectedFolderMeta?.name || 'Not selected'}</div>
                  <div className="mt-1 text-xs text-ink-secondary break-words">{selectedFolderPath || 'Choose a folder first'}</div>
                </div>
                <div className="rounded-xl border border-border bg-surface px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Project category</div>
                  <div className="mt-1 text-sm font-medium text-ink">
                    {projectCategoryRequired
                      ? (projectCategories.find((pc) => String(pc.id) === String(projectCategoryId))?.name || 'Not selected')
                      : 'Not required'}
                  </div>
                  <div className="mt-1 text-xs text-ink-secondary">
                    {projectCategoryRequired ? 'Applied to all imported files.' : 'No project categories available.'}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Files</div>
                  <div className="mt-1 text-sm font-medium text-ink">{fileItems.length} selected</div>
                  <div className="mt-1 text-xs text-ink-secondary">
                    {metadataReadyCount}/{fileItems.length || 0} metadata ready
                  </div>
                </div>
              </div>
            ) : null}

            {currentStep === 0 ? (
              <div>
                <label className="block text-sm font-medium text-ink-secondary mb-2">{t('bulk_import_folder_label')}</label>
                <div data-tour-id="bulk-import-folder" className="space-y-3">
                  <input
                    type="text"
                    value={folderPickerQuery}
                    onChange={(e) => setFolderPickerQuery(e.target.value)}
                    placeholder="Search folder name or path"
                    className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  />
                  {selectedFolderMeta ? (
                    <div className="rounded-lg border border-border bg-surface-muted px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Selected folder</div>
                      <div className="mt-1 text-sm font-medium text-ink">{selectedFolderMeta.name}</div>
                      <div className="mt-1 text-xs text-ink-secondary break-words">{selectedFolderPath}</div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-ink-soft">
                      {t('bulk_import_select_folder')}
                    </div>
                  )}
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-surface p-2 space-y-1">
                    {filteredFolderPickerTree.length > 0 ? (
                      filteredFolderPickerTree.map((node) => (
                        <FolderPickerTreeItem
                          key={node.key}
                          node={node}
                          level={0}
                          forceExpanded={Boolean(String(folderPickerQuery || '').trim())}
                        />
                      ))
                    ) : (
                      <div className="px-3 py-4 text-sm text-ink-soft">
                        No matching folders found.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {currentStep === 1 ? (
              <div className="max-w-xl">
                <label className="block text-sm font-medium text-ink-secondary mb-2">{t('bulk_import_project_category_label')}</label>
                <select
                  value={projectCategoryId || ''}
                  onChange={(e) => setProjectCategoryId(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
                  disabled={!projectCategoryRequired}
                >
                  <option value="">
                    {projectCategoryRequired ? t('bulk_import_select_project_category') : t('bulk_import_no_project_categories')}
                  </option>
                  {projectCategories.map((pc) => (
                    <option key={pc.id} value={pc.id}>
                      {pc.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-ink-secondary">
                  {projectCategoryRequired
                    ? 'This project category will be applied to all imported files.'
                    : 'There are no project categories to select, so you can continue.'}
                </p>
              </div>
            ) : null}

            {currentStep === 2 ? (
              <>
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

                <div className="rounded-xl border border-border bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-ink">
                        {String(t('bulk_import_files_count')).replace('{count}', String(fileItems.length))}
                      </div>
                      <div className={`mt-1 text-xs font-medium ${totalSelectedExceeded ? 'text-[var(--dms-color-danger-ink)]' : 'text-ink-secondary'}`}>
                        {String(t('bulk_import_total_upload_total')).replace('{current}', String(totalSelectedMB)).replace('{max}', String(totalUploadLimitMB))}
                      </div>
                    </div>
                    {fileItems.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setFileItems([])}
                        className="text-sm text-[var(--dms-color-danger-ink)] hover:opacity-90 font-medium"
                      >
                        {t('bulk_import_clear')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            {currentStep === 3 && fileItems.length > 0 ? (
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
                      onClick={() => setFileItems([])}
                      className="text-sm text-[var(--dms-color-danger-ink)] hover:opacity-90 font-medium"
                    >
                      {t('bulk_import_clear')}
                    </button>
                  </div>
                </div>
                <div className="max-h-[50vh] overflow-auto divide-y divide-border">
                  {fileItems.map((it, idx) => {
                    const fileKey = getFileItemKey(it)
                    const matchedType = documentTypes.find((dt) => String(dt.id) === String(it.documentTypeId))
                    const typeLabel = matchedType ? `${matchedType.name} (${matchedType.prefix})` : t('bulk_import_not_selected')
                    return (
                      <div key={`${it.file.name}:${it.file.size}:${it.file.lastModified}`} className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleFilePanel(idx)}
                          className="w-full flex items-start justify-between gap-3 text-left"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-ink truncate">{it.file.name}</div>
                            {it.relativePath && (
                              <div className="mt-0.5 text-xs text-ink-muted font-mono truncate">{it.relativePath}</div>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-secondary">
                              <span>{(it.file.size / 1024 / 1024).toFixed(2)} MB</span>
                              {it.isClientDocument && (
                                <>
                                  <span>•</span>
                                  <span>{t('client_document_label')}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div
                              className="inline-flex items-center gap-2 text-xs text-ink-secondary select-none"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <label className="inline-flex items-center gap-2">
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
                                <span>{t('client_document_label')}</span>
                              </label>
                              <span
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface text-[10px] font-semibold text-ink-soft"
                                title={t('client_document_declaration')}
                                aria-label={t('client_document_declaration')}
                              >
                                i
                              </span>
                            </div>
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
                          <div className="mt-3 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <div className="mb-1 flex items-center gap-2">
                                  <label className="block text-xs font-medium text-ink-secondary">{t('bulk_import_file_code_label')}</label>
                                  <span
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface text-[10px] font-semibold text-ink-soft"
                                    title={`1) PFX=file type prefix\n2) VV=document version\n3) YYMMDD=date of documents\n4) XXX=running number`}
                                    aria-label="1) PFX=file type prefix 2) VV=document version 3) YYMMDD=date of documents 4) XXX=running number"
                                  >
                                    i
                                  </span>
                                </div>
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
                                  placeholder={fileCodeGuide.format}
                                  className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm font-mono bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
                                />
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

                              <div className="md:col-span-2">
                                <div className="mb-1 flex items-center justify-between gap-3">
                                  <label className="block text-xs font-medium text-ink-secondary">{t('bulk_import_title_label')}</label>
                                  <button
                                    type="button"
                                    onClick={() => removeFile(idx)}
                                    className="text-xs font-medium text-[var(--dms-color-danger-ink)] hover:opacity-90"
                                  >
                                    {t('bulk_import_remove_file')}
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={it.title}
                                  onChange={(e) => setFileItems((prev) => prev.map((x, i) => i === idx ? { ...x, title: e.target.value } : x))}
                                  className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                                />
                              </div>
                            </div>

                            <div className="rounded-lg border border-border bg-surface-muted px-3 py-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Expiry</p>
                                  <p className="mt-1 text-sm text-ink">{getExpirySummary(it)}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {!it.isClientDocument ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => openExpiryEditor(idx)}
                                        className="text-xs font-medium text-brand hover:text-brand-hover"
                                      >
                                        {it.expiryOverrideEnabled
                                          ? 'Change custom expiry'
                                          : 'Custom expiry tracking'}
                                      </button>
                                      {it.expiryOverrideEnabled ? (
                                        <button
                                          type="button"
                                          onClick={() => clearExpiryOverride(idx)}
                                          className="text-xs font-medium text-ink-secondary hover:text-ink"
                                        >
                                          Remove custom setting
                                        </button>
                                      ) : null}
                                    </>
                                  ) : (
                                    <span className="text-xs text-ink-soft">Not applicable</span>
                                  )}
                                </div>
                              </div>
                            </div>

                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="border border-border rounded-lg p-4 space-y-3 bg-surface">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={expiryInfo.trackingEnabled}
                    onChange={(e) => setExpiryInfo((prev) => ({
                      ...prev,
                      trackingEnabled: e.target.checked,
                      startDate: prev.startDate || getToday(),
                      ...(e.target.checked && prev.useGlobalRule
                        ? {
                            expiringSoonDays: expirySettings.expiringSoonDays,
                            reminder1Days: expirySettings.reminder1Days,
                            reminder2Days: expirySettings.reminder2Days,
                            reminder3Days: expirySettings.reminder3Days,
                            reminder4Days: expirySettings.reminder4Days
                          }
                        : {})
                    }))}
                    className="h-4 w-4 text-brand rounded focus:ring-brand/20"
                  />
                  Track Expiry (apply to all imported documents)
                </label>
                {expiryInfo.trackingEnabled ? (
                  <div className="space-y-4">
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
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs text-ink-muted">
                        Global defaults: expiring soon in {expirySettings.expiringSoonDays} day(s), reminders at {expirySettings.reminder1Days}, {expirySettings.reminder2Days}, {expirySettings.reminder3Days}, and {expirySettings.reminder4Days} day(s) before expiry.
                      </p>
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                        <input
                          type="checkbox"
                          checked={expiryInfo.useGlobalRule}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setExpiryInfo((prev) => ({
                              ...prev,
                              useGlobalRule: checked,
                              ...(checked
                                ? {
                                    expiringSoonDays: expirySettings.expiringSoonDays,
                                    reminder1Days: expirySettings.reminder1Days,
                                    reminder2Days: expirySettings.reminder2Days,
                                    reminder3Days: expirySettings.reminder3Days,
                                    reminder4Days: expirySettings.reminder4Days
                                  }
                                : {})
                            }))
                          }}
                          className="h-4 w-4 text-brand rounded focus:ring-brand/20"
                        />
                        Use Global Defaults
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-ink-secondary mb-2">Expiring Soon Days</label>
                        <input
                          type="number"
                          min="0"
                          value={expiryInfo.expiringSoonDays}
                          onChange={(e) => setExpiryInfo((prev) => ({ ...prev, expiringSoonDays: e.target.value, useGlobalRule: false }))}
                          disabled={expiryInfo.useGlobalRule}
                          className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-secondary mb-2">Reminder 1</label>
                        <input
                          type="number"
                          min="0"
                          value={expiryInfo.reminder1Days}
                          onChange={(e) => setExpiryInfo((prev) => ({ ...prev, reminder1Days: e.target.value, useGlobalRule: false }))}
                          disabled={expiryInfo.useGlobalRule}
                          className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-secondary mb-2">Reminder 2</label>
                        <input
                          type="number"
                          min="0"
                          value={expiryInfo.reminder2Days}
                          onChange={(e) => setExpiryInfo((prev) => ({ ...prev, reminder2Days: e.target.value, useGlobalRule: false }))}
                          disabled={expiryInfo.useGlobalRule}
                          className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-secondary mb-2">Reminder 3</label>
                        <input
                          type="number"
                          min="0"
                          value={expiryInfo.reminder3Days}
                          onChange={(e) => setExpiryInfo((prev) => ({ ...prev, reminder3Days: e.target.value, useGlobalRule: false }))}
                          disabled={expiryInfo.useGlobalRule}
                          className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-secondary mb-2">Reminder 4</label>
                        <input
                          type="number"
                          min="0"
                          value={expiryInfo.reminder4Days}
                          onChange={(e) => setExpiryInfo((prev) => ({ ...prev, reminder4Days: e.target.value, useGlobalRule: false }))}
                          disabled={expiryInfo.useGlobalRule}
                          className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface-muted disabled:text-ink-soft"
                        />
                      </div>
                    </div>
                    <ReminderRecipientsPicker
                      values={expiryInfo}
                      activeUsers={activeUsers}
                      searchValues={recipientSearch.global}
                      onSearchChange={(levelKey, value) => updateSearchScope('global', levelKey, value)}
                      onToggle={toggleGlobalRecipient}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-ink-soft">
                    Expiry tracking is optional. Leave it off if this upload does not need expiry monitoring.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="px-6 py-4 bg-surface-muted border-t border-border flex flex-wrap justify-between gap-3">
            <div className="text-xs text-ink-secondary">
              Step {currentStep + 1} of {BULK_IMPORT_STEPS.length}
            </div>
            <div className="flex flex-wrap justify-end gap-3">
            {currentStep > 0 ? (
              <button
                type="button"
                onClick={() => goToStep(currentStep - 1)}
                className="px-4 py-2 text-sm font-medium text-ink-secondary bg-surface border border-border rounded-lg hover:bg-surface-strong transition-colors"
                disabled={submitting}
              >
                {t('previous')}
              </button>
            ) : null}
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-ink-secondary bg-surface border border-border rounded-lg hover:bg-surface-strong transition-colors"
              disabled={submitting}
            >
              {t('cancel')}
            </button>
            {currentStep < BULK_IMPORT_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-4 py-2 text-sm font-medium text-ink-inverse bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-60"
                disabled={submitting}
              >
                {t('next')}
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                data-tour-id="bulk-import-submit"
                className="px-4 py-2 text-sm font-medium text-ink-inverse bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-60"
                disabled={submitting || totalSelectedExceeded}
              >
                {submitting ? t('bulk_import_uploading') : t('bulk_import_upload')}
              </button>
            )}
            </div>
          </div>

          {expiryEditor.open && expiryEditor.draft ? (
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-3xl rounded-2xl border border-border bg-surface shadow-dms-lg">
                <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                  <div>
                    <h3 className="text-base font-semibold text-ink">Custom Expiry Tracking</h3>
                    <p className="mt-1 text-xs text-ink-secondary truncate">
                      {fileItems[expiryEditor.itemIndex]?.file?.name || 'Selected file'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeExpiryEditor}
                    className="rounded-lg p-1 text-ink-soft hover:bg-surface-muted hover:text-ink"
                    aria-label="Close custom expiry editor"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="max-h-[68vh] overflow-y-auto px-5 py-4 space-y-4">
                  <div className="rounded-lg border border-border bg-surface-muted px-4 py-3">
                    <p className="text-sm font-medium text-ink">Set a custom expiry rule for this file.</p>
                    <p className="mt-2 text-xs text-ink-secondary">
                      This only applies to the current file and will override the default upload expiry setting.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink-secondary mb-2">Start Date</label>
                      <input
                        type="date"
                        value={expiryEditor.draft.startDate || ''}
                        onChange={(e) => setExpiryEditor((prev) => ({
                          ...prev,
                          draft: { ...(prev.draft || {}), startDate: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink-secondary mb-2">Expiry Date</label>
                      <input
                        type="date"
                        value={expiryEditor.draft.expiryDate || ''}
                        onChange={(e) => setExpiryEditor((prev) => ({
                          ...prev,
                          draft: { ...(prev.draft || {}), expiryDate: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                      />
                    </div>
                  </div>

                  <details className="rounded-xl border border-border bg-surface">
                    <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink marker:hidden">
                      More options
                    </summary>
                    <div className="space-y-4 border-t border-border px-4 py-4">
                      <div>
                        <label className="block text-sm font-medium text-ink-secondary mb-2">Remarks</label>
                        <textarea
                          rows="3"
                          value={expiryEditor.draft.remarks || ''}
                          onChange={(e) => setExpiryEditor((prev) => ({
                            ...prev,
                            draft: { ...(prev.draft || {}), remarks: e.target.value }
                          }))}
                          className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-ink-secondary mb-2">Expiring Soon Days</label>
                          <input
                            type="number"
                            min="0"
                            value={expiryEditor.draft.expiringSoonDays ?? ''}
                            onChange={(e) => setExpiryEditor((prev) => ({
                              ...prev,
                              draft: { ...(prev.draft || {}), expiringSoonDays: e.target.value }
                            }))}
                            className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-ink-secondary mb-2">Reminder 1</label>
                          <input
                            type="number"
                            min="0"
                            value={expiryEditor.draft.reminder1Days ?? ''}
                            onChange={(e) => setExpiryEditor((prev) => ({
                              ...prev,
                              draft: { ...(prev.draft || {}), reminder1Days: e.target.value }
                            }))}
                            className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-ink-secondary mb-2">Reminder 2</label>
                          <input
                            type="number"
                            min="0"
                            value={expiryEditor.draft.reminder2Days ?? ''}
                            onChange={(e) => setExpiryEditor((prev) => ({
                              ...prev,
                              draft: { ...(prev.draft || {}), reminder2Days: e.target.value }
                            }))}
                            className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-ink-secondary mb-2">Reminder 3</label>
                          <input
                            type="number"
                            min="0"
                            value={expiryEditor.draft.reminder3Days ?? ''}
                            onChange={(e) => setExpiryEditor((prev) => ({
                              ...prev,
                              draft: { ...(prev.draft || {}), reminder3Days: e.target.value }
                            }))}
                            className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-ink-secondary mb-2">Reminder 4</label>
                          <input
                            type="number"
                            min="0"
                            value={expiryEditor.draft.reminder4Days ?? ''}
                            onChange={(e) => setExpiryEditor((prev) => ({
                              ...prev,
                              draft: { ...(prev.draft || {}), reminder4Days: e.target.value }
                            }))}
                            className="w-full px-3 py-2 border border-border rounded-lg outline-none text-sm bg-surface text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand"
                          />
                        </div>
                      </div>

                      <ReminderRecipientsPicker
                        values={expiryEditor.draft}
                        activeUsers={activeUsers}
                        searchValues={expiryEditorSearch}
                        onSearchChange={updateExpiryEditorSearch}
                        onToggle={toggleExpiryEditorRecipient}
                      />
                    </div>
                  </details>
                </div>

                <div className="flex flex-wrap justify-between gap-3 border-t border-border bg-surface-muted px-5 py-4">
                  <div>
                    {fileItems[expiryEditor.itemIndex]?.expiryOverrideEnabled ? (
                      <button
                        type="button"
                        onClick={() => clearExpiryOverride(expiryEditor.itemIndex)}
                        className="text-sm font-medium text-ink-secondary hover:text-ink"
                      >
                        Use default instead
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={closeExpiryEditor}
                      className="px-4 py-2 text-sm font-medium text-ink-secondary bg-surface border border-border rounded-lg hover:bg-surface-strong transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveExpiryEditor}
                      className="px-4 py-2 text-sm font-medium text-ink-inverse bg-brand rounded-lg hover:bg-brand-hover transition-colors"
                    >
                      Save custom expiry
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !ReactDOM?.createPortal || !document.body) return modal
  return ReactDOM.createPortal(modal, document.body)
}
