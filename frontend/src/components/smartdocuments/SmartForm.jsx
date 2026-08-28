import React, { useEffect, useState, useMemo } from 'react'
import TextInput from '../ui/TextInput'
import TextArea from '../ui/TextArea'
import SelectField from '../ui/SelectField'
import Button from '../ui/Button'
import RichTextEditor from '../content/RichTextEditor'
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal'
import useAI from '../../hooks/useAI'

const baseInputClasses =
  'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#003366]/30 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-200 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-300'

const baseTableClasses =
  'block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#003366]/30'

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(deepClone)
  const copy = {}
  for (const k of Object.keys(obj)) copy[k] = deepClone(obj[k])
  return copy
}

function parseJsonField(str, fallback) {
  if (!str) return fallback
  if (typeof str === 'object') return str
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

function safeJsonStringify(obj) {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return ''
  }
}

function buildSectionTree(sections = []) {
  const sorted = [...sections].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  )
  const top = sorted.filter((s) => !s.parentSectionId)
  const byParent = {}
  sorted.forEach((s) => {
    if (s.parentSectionId) {
      byParent[s.parentSectionId] = byParent[s.parentSectionId] || []
      byParent[s.parentSectionId].push(s)
    }
  })
  return { top, byParent }
}

function FieldLabel({ field }) {
  return (
    <label className="block text-sm font-medium text-ink-secondary mb-1.5">
      {field.fieldLabel || field.fieldKey}
      {field.isMandatory ? <span className="text-red-500 ml-1">*</span> : null}
    </label>
  )
}

function FieldHelp({ field }) {
  if (!field.helpText) return null
  return (
    <p className="mt-1 text-xs text-ink-muted leading-relaxed">
      {field.helpText}
    </p>
  )
}

function AutoBadge() {
  return (
    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand/10 text-brand border border-brand/20">
      AUTO
    </span>
  )
}

function valueString(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return String(v) }
}

function evaluateSingleRule(rule, allValues) {
  if (!rule || typeof rule !== 'object') return true
  const { fieldKey, operator = 'equals', value } = rule
  if (!fieldKey) return true
  const raw = allValues?.[fieldKey]
  const actualIsArray = Array.isArray(raw)
  const nStr = (v) => v === null || v === undefined ? '' : String(v).trim().toLowerCase()
  const nArr = (v) => {
    if (Array.isArray(v)) return v.map((x) => nStr(x)).filter((x) => x !== '')
    if (v === null || v === undefined || v === '') return []
    return String(v).split(',').map((x) => nStr(x)).filter(Boolean)
  }
  const actualArr = actualIsArray
    ? raw.map((x) => nStr(x)).filter((x) => x !== '')
    : raw === null || raw === undefined || raw === '' ? [] : [nStr(raw)]
  const actualSingle = actualIsArray ? (actualArr.length === 1 ? actualArr[0] : actualArr.join(',')) : nStr(raw)
  const expectedSingle = nStr(value)
  const expectedArr = nArr(value)
  switch (String(operator || 'equals')) {
    case 'equals':
      return actualIsArray ? actualArr.includes(expectedSingle) : (String(raw ?? '') === String(value ?? ''))
    case 'notEquals':
      return actualIsArray ? !actualArr.includes(expectedSingle) : (String(raw ?? '') !== String(value ?? ''))
    case 'contains':
      if (expectedSingle.length === 0) return false
      if (actualIsArray) return actualArr.some((a) => a.includes(expectedSingle))
      return actualSingle.includes(expectedSingle)
    case 'notContains':
      if (expectedSingle.length === 0) return true
      if (actualIsArray) return !actualArr.some((a) => a.includes(expectedSingle))
      return !actualSingle.includes(expectedSingle)
    case 'isEmpty':
      return actualArr.length === 0
    case 'isNotEmpty':
      return actualArr.length > 0
    case 'in': {
      if (expectedArr.length === 0) return false
      if (actualIsArray) return actualArr.some((a) => expectedArr.includes(a))
      return expectedArr.includes(actualSingle)
    }
    case 'notIn': {
      if (expectedArr.length === 0) return true
      if (actualIsArray) return !actualArr.some((a) => expectedArr.includes(a))
      return !expectedArr.includes(actualSingle)
    }
    default:
      return true
  }
}

function isFieldVisible(field, allValues) {
  if (!field) return true
  if (field.isVisibleInForm === false) return false
  let rules = null
  try {
    rules = typeof field.visibilityRulesJson === 'string'
      ? JSON.parse(field.visibilityRulesJson)
      : (field.visibilityRulesJson && typeof field.visibilityRulesJson === 'object' ? field.visibilityRulesJson : null)
  } catch { rules = null }
  if (!rules || rules.enabled === false || !Array.isArray(rules.rules) || rules.rules.length === 0) {
    return true
  }
  const list = rules.rules.filter(r => r && r.fieldKey)
  if (list.length === 0) return true
  const matchMode = String(rules.match || 'ALL').toUpperCase()
  if (matchMode === 'ANY') {
    return list.some(r => evaluateSingleRule(r, allValues))
  }
  return list.every(r => evaluateSingleRule(r, allValues))
}

function FieldChangedBadge({ field, original, current }) {
  const o = valueString(original)
  const c = valueString(current)
  const changed = o !== c
  if (!changed) return null
  return (
    <div className="mt-2 border border-amber-200 bg-amber-50 rounded-lg p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-semibold text-amber-800">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100/60 px-2 py-0.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          Value Changed
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md bg-gray-50 border border-gray-200 p-2 space-y-0.5">
          <div className="font-semibold text-gray-500 uppercase tracking-wide">Original</div>
          <div className="text-gray-700 break-words font-mono text-[10px]">{o || <em className="text-gray-400 italic">— empty —</em>}</div>
        </div>
        <div className="rounded-md bg-blue-50 border border-blue-200 p-2 space-y-0.5">
          <div className="font-semibold text-blue-700 uppercase tracking-wide">Current</div>
          <div className="text-blue-800 break-words font-mono text-[10px]">{c || <em className="text-blue-400 italic">— empty —</em>}</div>
        </div>
      </div>
    </div>
  )
}

export default function SmartForm({
  templateVersion,
  initialValues,
  onChange,
  onSave,
  readonly = false,
  editableOverrides = {},
  className = '',
  originalValues = null,
  diffStyle = 'none',
  showResetButton = false,
  onResetField,
  onResetAll,
  showReadonlyBanner = true,
}) {
  const [values, setValues] = useState(() => {
    const base = { ...(initialValues || {}) }
    const fields = (templateVersion?.formFields || [])
    fields.forEach((f) => {
      const k = f.fieldKey
      if (base[k] !== undefined && base[k] !== null && base[k] !== '') return
      if (f.defaultValueJson === null || f.defaultValueJson === undefined) return
      try {
        const def = typeof f.defaultValueJson === 'string'
          ? JSON.parse(f.defaultValueJson)
          : f.defaultValueJson
        if (def === undefined || def === null) return
        switch ((f.inputType || 'TEXT')) {
          case 'CHECKBOX':
            base[k] = Boolean(def)
            break
          case 'NUMBER':
            base[k] = (typeof def === 'number') ? def : (Number.isFinite(Number(def)) ? Number(def) : '')
            break
          case 'TEXT':
          case 'TEXTAREA':
          case 'RICH_TEXT':
          case 'DROPDOWN':
          case 'SINGLE_SELECT':
            base[k] = String(def)
            break
          case 'MULTI_SELECT':
            base[k] = Array.isArray(def) ? def : (def ? [String(def)] : [])
            break
          default:
            base[k] = def
            break
        }
      } catch { /* ignore malformed */ }
    })
    return base
  })
  const [saving, setSaving] = useState(false)

  const ai = useAI()
  const [aiAutofillOpen, setAiAutofillOpen] = useState(false)
  const [aiContextText, setAiContextText] = useState('')
  const [aiAutofillResult, setAiAutofillResult] = useState(null)

  useEffect(() => {
    let cancelled = false
    // Hard reset on mount: ensure autofill modal NEVER opens automatically
    if (!cancelled) {
      setAiAutofillOpen(false)
      setAiAutofillResult(null)
      setAiContextText('')
    }
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    // Reset whenever the active template changes — ensure autofill stays closed & AI config reloads silently.
    // NOTE: do NOT include `ai` in deps — it returns a new object each render and will loop!
    let cancelled = false
    if (!cancelled) {
      setAiAutofillOpen(false)
      setAiAutofillResult(null)
      setAiContextText('')
      ai.fetchConfig()
    }
    return () => { cancelled = true }
  }, [templateVersion?.id])

  const runAiAutofill = async () => {
    const ctx = aiContextText.trim()
    if (!ctx || ctx.length < 10) {
      alert('Please paste at least a few lines of context text first.')
      return
    }
    const definitions = formFields
      .filter((f) => f.isVisibleInForm !== false)
      .map((f) => {
        let options = null
        try {
          const optJson = typeof f.optionsJson === 'string' ? JSON.parse(f.optionsJson) : (f.optionsJson || null)
          if (Array.isArray(optJson) && optJson.length > 0) {
            options = optJson.map((o) => (typeof o === 'object' ? (o.value ?? o.label) : String(o)))
          }
        } catch { /* ignore */ }
        return {
          fieldKey: f.fieldKey,
          label: f.fieldLabel || f.label,
          type: f.inputType || f.fieldType || 'TEXT',
          required: !!f.isMandatory,
          description: f.helpText || '',
          options,
        }
      })

    try {
      const result = await ai.autofill({
        fields: definitions,
        contextText: ctx,
      })
      setAiAutofillResult(result)
    } catch (err) {
      alert('AI Autofill failed: ' + err.message)
    }
  }

  const applyAiAutofill = () => {
    if (!aiAutofillResult?.filledFields) return
    const nextValues = { ...values }
    let applied = 0
    Object.entries(aiAutofillResult.filledFields).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return
      nextValues[key] = value
      applied += 1
    })
    if (applied === 0) {
      alert('No values could be extracted from the context text.')
      return
    }
    setValues(nextValues)
    if (typeof onChange === 'function') onChange(nextValues)
    setAiAutofillOpen(false)
    setAiAutofillResult(null)
    setAiContextText('')
  }

  const formFields = useMemo(() => {
    const raw = templateVersion?.formFields || []
    return raw.map((f) => {
      const normalized = { ...f }
      if (!normalized.checkboxLabel) {
        try {
          const rules = typeof f.validationRulesJson === 'string'
            ? JSON.parse(f.validationRulesJson)
            : (f.validationRulesJson && typeof f.validationRulesJson === 'object' ? f.validationRulesJson : null)
          if (rules && typeof rules.checkboxLabel === 'string') {
            normalized.checkboxLabel = rules.checkboxLabel
          }
        } catch { /* ignore */ }
      }
      return normalized
    })
  }, [templateVersion?.formFields])
  const sections = templateVersion?.sections || []
  const { top: topSections, byParent: childSectionsByParent } = useMemo(
    () => buildSectionTree(sections),
    [sections]
  )

  const fieldsBySectionId = useMemo(() => {
    const map = {}
    formFields.forEach((f) => {
      const sid = (
        f.smartTemplateSectionId !== undefined && f.smartTemplateSectionId !== null ? f.smartTemplateSectionId :
        f.sectionId !== undefined && f.sectionId !== null ? f.sectionId : null
      )
      const key = sid === undefined || sid === null || sid === '' ? null : sid
      map[key] = map[key] || []
      map[key].push(f)
    })
    Object.keys(map).forEach((k) => {
      map[k].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      )
    })
    return map
  }, [formFields])

  const baselineOriginal = originalValues ?? initialValues ?? {}

  const visibleFieldKeys = useMemo(() => {
    const set = new Set()
    formFields.forEach((f) => {
      if (isFieldVisible(f, values)) set.add(f.fieldKey)
    })
    return set
  }, [values, formFields])

  const changedFieldKeys = useMemo(() => {
    if (diffStyle === 'none') return new Set()
    const set = new Set()
    const allKeys = new Set([...Object.keys(baselineOriginal || {}), ...Object.keys(values || {})])
    allKeys.forEach(k => {
      const o = valueString(baselineOriginal?.[k])
      const c = valueString(values?.[k])
      if (o !== c) set.add(k)
    })
    return set
  }, [values, baselineOriginal, diffStyle])

  const setFieldValue = (fieldKey, newValue) => {
    setValues((prev) => {
      const next = { ...prev, [fieldKey]: newValue }
      return next
    })
    if (typeof onChange === 'function') {
      onChange(fieldKey, newValue)
    }
  }

  const isFieldDisabled = (field) => {
    if (field.inputType === 'SYSTEM_GENERATED') return true
    const override = editableOverrides[field.fieldKey]
    if (typeof override === 'boolean') return !override
    return readonly
  }

  const handleSave = async () => {
    if (typeof onSave !== 'function') return
    try {
      setSaving(true)
      await onSave(values)
    } finally {
      setSaving(false)
    }
  }

  function renderField(field) {
    const key = field.fieldKey
    const value = values[key]
    const disabled = isFieldDisabled(field)
    const inputType = field.inputType || 'TEXT'

    switch (inputType) {
      case 'TEXT':
        return (
          <TextInput
            type="text"
            value={value ?? ''}
            onChange={(e) => setFieldValue(key, e.target.value)}
            disabled={disabled}
            placeholder={field.placeholder || ''}
          />
        )

      case 'TEXTAREA':
        return (
          <TextArea
            rows={4}
            value={value ?? ''}
            onChange={(e) => setFieldValue(key, e.target.value)}
            disabled={disabled}
            placeholder={field.placeholder || ''}
          />
        )

      case 'RICH_TEXT': {
        const rteValue =
          typeof value === 'string'
            ? { html: value, plain: value?.replace(/<[^>]+>/g, '') || '' }
            : value || { html: '', plain: '' }
        return (
          <RichTextEditor
            value={rteValue}
            onChange={(next) => setFieldValue(key, next)}
            disabled={disabled}
          />
        )
      }

      case 'NUMBER':
        return (
          <input
            type="number"
            className={baseInputClasses}
            value={value ?? ''}
            onChange={(e) =>
              setFieldValue(
                key,
                e.target.value === '' ? '' : Number(e.target.value)
              )
            }
            disabled={disabled}
            placeholder={field.placeholder || ''}
          />
        )

      case 'DATE':
        return (
          <input
            type="date"
            className={baseInputClasses}
            value={value ?? ''}
            onChange={(e) => setFieldValue(key, e.target.value)}
            disabled={disabled}
          />
        )

      case 'DATETIME':
        return (
          <input
            type="datetime-local"
            className={baseInputClasses}
            value={value ?? ''}
            onChange={(e) => setFieldValue(key, e.target.value)}
            disabled={disabled}
          />
        )

      case 'DROPDOWN': {
        const opts = parseJsonField(field.optionsJson, { options: [] })
        const options = opts?.options || []
        return (
          <SelectField
            value={value ?? ''}
            onChange={(e) => setFieldValue(key, e.target.value)}
            disabled={disabled}
          >
            <option value="">-- Select --</option>
            {options.map((o, i) => (
              <option key={i} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
        )
      }

      case 'SINGLE_SELECT': {
        const opts = parseJsonField(field.optionsJson, { options: [] })
        const options = opts?.options || []
        return (
          <div className="flex flex-col gap-2">
            {options.length === 0 ? (
              <p className="text-[11px] italic text-gray-400">No options configured</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {options.map((o, i) => {
                  const isChecked = String(value ?? '') === String(o.value)
                  const radioId = `${key}_${i}`
                  return (
                    <label
                      key={i}
                      htmlFor={radioId}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer select-none transition-colors ${
                        isChecked
                          ? 'border-[#003366] bg-[#003366]/5 text-[#003366]'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <input
                        id={radioId}
                        type="radio"
                        name={`sf_${key}`}
                        className="h-4 w-4 border-gray-300 text-[#003366] focus:ring-[#003366]/30"
                        checked={isChecked}
                        onChange={() => !disabled && setFieldValue(key, o.value)}
                        disabled={disabled}
                      />
                      <span className="text-sm font-medium">{o.label}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      }

      case 'MULTI_SELECT': {
        const opts = parseJsonField(field.optionsJson, { options: [] })
        const options = opts?.options || []
        const currentArr = Array.isArray(value) ? value : []
        function toggleMsValue(optValue) {
          const next = currentArr.includes(optValue)
            ? currentArr.filter(v => String(v) !== String(optValue))
            : [...currentArr, optValue]
          setFieldValue(key, next)
        }
        return (
          <div className="flex flex-col gap-2">
            {options.length === 0 ? (
              <p className="text-[11px] italic text-gray-400">No options configured</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {options.map((o, i) => {
                  const isChecked = currentArr.some(v => String(v) === String(o.value))
                  const cbId = `${key}_${i}`
                  return (
                    <label
                      key={i}
                      htmlFor={cbId}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer select-none transition-colors ${
                        isChecked
                          ? 'border-[#003366] bg-[#003366]/5 text-[#003366]'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <input
                        id={cbId}
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-[#003366] focus:ring-[#003366]/30"
                        checked={isChecked}
                        onChange={() => !disabled && toggleMsValue(o.value)}
                        disabled={disabled}
                      />
                      <span className="text-sm font-medium">{o.label}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      }

      case 'CHECKBOX':
        return (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
              checked={Boolean(value)}
              onChange={(e) => setFieldValue(key, e.target.checked)}
              disabled={disabled}
            />
            <span className="text-sm text-ink">
              {field.checkboxLabel || field.fieldLabel || 'Enabled'}
            </span>
          </label>
        )

      case 'USER_LOOKUP': {
        const displayName =
          typeof value === 'object' && value
            ? value.fullName || value.displayName || value.name || ''
            : value || ''
        return (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                className={baseInputClasses}
                value={displayName}
                onChange={(e) => {
                  const next = e.target.value
                  if (
                    typeof value === 'object' &&
                    value &&
                    !Array.isArray(value)
                  ) {
                    setFieldValue(key, { ...value, fullName: next })
                  } else {
                    setFieldValue(key, next)
                  }
                }}
                disabled={disabled}
                placeholder="Enter user name..."
              />
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={disabled}
              >
                Find
              </Button>
            </div>
          </div>
        )
      }

      case 'TABLE': {
        const parsedSchema = parseJsonField(field.tableSchemaJson, { columns: null })
        const rawCols = Array.isArray(parsedSchema?.columns)
          ? parsedSchema.columns
          : Array.isArray(parsedSchema)
            ? parsedSchema
            : (parsedSchema && Array.isArray(parsedSchema.rows))
              ? parsedSchema.rows
              : []
        const columns = rawCols
          .filter((c) => c && (c.columnKey || c.fieldKey || c.key || c.name))
          .map((c) => ({
            columnKey: String(c.columnKey || c.fieldKey || c.key || c.name || ''),
            label: String(c.headerLabel || c.label || c.title || c.name || c.fieldKey || c.columnKey || 'Column'),
            type: String(c.inputType || c.type || 'TEXT').toUpperCase(),
            optionsJson: c.optionsJson || c.options || null,
            defaultValue: c.defaultValue !== undefined ? c.defaultValue : null
          }))
        const current =
          value && typeof value === 'object'
            ? value
            : Array.isArray(value)
              ? { rows: [...value] }
              : { rows: [] }
        const rows = Array.isArray(current.rows) ? current.rows : Array.isArray(value) ? [...value] : []

        const updateCell = (rowIdx, colKey, cellValue) => {
          const next = deepClone({ rows: [...rows] })
          if (!next.rows[rowIdx]) next.rows[rowIdx] = {}
          next.rows[rowIdx][colKey] = cellValue
          setFieldValue(key, next)
        }

        const addRow = () => {
          const nextRows = [...rows]
          const empty = {}
          columns.forEach((c) => {
            if (c.type === 'CHECKBOX') empty[c.columnKey] = c.defaultValue === true
            else if (c.type === 'NUMBER') empty[c.columnKey] = c.defaultValue ?? null
            else if (c.type === 'MULTI_SELECT') empty[c.columnKey] = Array.isArray(c.defaultValue) ? [...c.defaultValue] : []
            else empty[c.columnKey] = c.defaultValue ?? ''
          })
          nextRows.push(empty)
          setFieldValue(key, { rows: nextRows })
        }

        const deleteRow = (rowIdx) => {
          const next = { rows: rows.filter((_, i) => i !== rowIdx) }
          setFieldValue(key, next)
        }

        let tableBody = null
        if (columns.length === 0) {
          tableBody = (
            <tr>
              <td colSpan={3} className="px-4 py-6 space-y-2">
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠️ No column schema defined yet for this table ({field.fieldLabel || field.fieldKey}). Go to Smart Template Admin → Edit template → <span className="font-semibold">Step 4 Form Fields</span> → expand this field → set <span className="font-mono">Table Schema JSON</span> to either:
                  <div className="mt-2 space-y-2">
                    <div>
                      <p className="text-[11px] font-semibold">Format A (Object with columns array):</p>
                      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] bg-amber-100/60 rounded p-2">{`{
  "columns": [
    {"columnKey":"bil","label":"Bil.","type":"NUMBER"},
    {"columnKey":"perkara","label":"Perkara","type":"TEXT"},
    {"columnKey":"kuantiti","label":"Kuantiti","type":"NUMBER"}
  ]
}`}</pre>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold">Format B (Direct array):</p>
                      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] bg-amber-100/60 rounded p-2">{`[
  {"fieldKey":"bil","headerLabel":"Bil.","inputType":"NUMBER"},
  {"fieldKey":"perkara","headerLabel":"Perkara","inputType":"TEXT"},
  {"fieldKey":"kuantiti","headerLabel":"Kuantiti","inputType":"NUMBER"}
]`}</pre>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          )
        } else if (rows.length === 0) {
          tableBody = (
            <tr>
              <td
                colSpan={columns.length + 2}
                className="px-3 py-6 text-center text-ink-muted text-xs"
              >
                No rows yet. Click Add row.
              </td>
            </tr>
          )
        } else {
          tableBody = rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2 text-ink-muted">{ri + 1}</td>
              {columns.map((c) => {
                const cellVal = row?.[c.columnKey] ?? (c.type === 'NUMBER' ? null : c.type === 'CHECKBOX' ? false : (c.type === 'MULTI_SELECT' ? [] : ''))
                const type = (c.type || 'TEXT').toUpperCase()
                let options = []
                try {
                  if (typeof c.optionsJson === 'string') {
                    const p = JSON.parse(c.optionsJson)
                    if (p && Array.isArray(p.options)) options = p.options
                    else if (Array.isArray(p)) options = p
                  } else if (Array.isArray(c.optionsJson)) {
                    options = c.optionsJson
                  } else if (c.optionsJson && typeof c.optionsJson === 'object' && Array.isArray(c.optionsJson.options)) {
                    options = c.optionsJson.options
                  }
                } catch { options = [] }
                return (
                  <td key={c.columnKey} className="px-2 py-2">
                    {type === 'TEXTAREA' || type === 'RICH_TEXT' ? (
                      <textarea
                        className={baseTableClasses}
                        rows={2}
                        value={String(cellVal ?? '')}
                        disabled={disabled || readonly}
                        onChange={(e) => updateCell(ri, c.columnKey, e.target.value)}
                      />
                    ) : type === 'NUMBER' ? (
                      <input
                        type="number"
                        className={baseTableClasses}
                        value={cellVal === null || cellVal === undefined ? '' : Number(cellVal)}
                        disabled={disabled || readonly}
                        onChange={(e) => updateCell(ri, c.columnKey, e.target.value === '' ? null : Number(e.target.value))}
                      />
                    ) : type === 'DATE' ? (
                      <input type="date" className={baseTableClasses} value={String(cellVal ?? '')} disabled={disabled || readonly} onChange={(e) => updateCell(ri, c.columnKey, e.target.value)} />
                    ) : type === 'TIME' ? (
                      <input type="time" className={baseTableClasses} value={String(cellVal ?? '')} disabled={disabled || readonly} onChange={(e) => updateCell(ri, c.columnKey, e.target.value)} />
                    ) : type === 'DATETIME' ? (
                      <input type="datetime-local" className={baseTableClasses} value={String(cellVal ?? '')} disabled={disabled || readonly} onChange={(e) => updateCell(ri, c.columnKey, e.target.value)} />
                    ) : type === 'CHECKBOX' ? (
                      <div className="px-1 pt-1">
                        <input type="checkbox" className="h-4 w-4 rounded border-border" checked={!!cellVal} disabled={disabled || readonly} onChange={(e) => updateCell(ri, c.columnKey, e.target.checked)} />
                      </div>
                    ) : type === 'DROPDOWN' ? (
                      <select className={baseTableClasses} value={String(cellVal ?? '')} disabled={disabled || readonly} onChange={(e) => updateCell(ri, c.columnKey, e.target.value || null)}>
                        <option value="">— —</option>
                        {options.map((o, k) => {
                          const lbl = typeof o === 'string' ? o : (o.label ?? o.value ?? `O${k + 1}`)
                          const val = typeof o === 'string' ? o : (o.value ?? o.label ?? lbl)
                          return <option key={k} value={val}>{lbl}</option>
                        })}
                      </select>
                    ) : type === 'SINGLE_SELECT' ? (
                      <select className={baseTableClasses} value={String(cellVal ?? '')} disabled={disabled || readonly} onChange={(e) => updateCell(ri, c.columnKey, e.target.value || null)}>
                        <option value="">— —</option>
                        {options.map((o, k) => {
                          const lbl = typeof o === 'string' ? o : (o.label ?? o.value ?? `O${k + 1}`)
                          const val = typeof o === 'string' ? o : (o.value ?? o.label ?? lbl)
                          return <option key={k} value={val}>{lbl}</option>
                        })}
                      </select>
                    ) : type === 'MULTI_SELECT' ? (
                      <div className="flex flex-wrap gap-1 py-1">
                        {options.length === 0 ? (
                          <input
                            type="text"
                            className={baseTableClasses}
                            value={Array.isArray(cellVal) ? cellVal.join(', ') : String(cellVal ?? '')}
                            disabled={disabled || readonly}
                            onChange={(e) => {
                              const parts = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                              updateCell(ri, c.columnKey, parts)
                            }}
                            placeholder="Comma-separated values"
                          />
                        ) : (
                          options.map((o, k) => {
                            const lbl = typeof o === 'string' ? o : (o.label ?? o.value ?? `O${k + 1}`)
                            const val = typeof o === 'string' ? o : (o.value ?? o.label ?? lbl)
                            const isChecked = Array.isArray(cellVal) ? cellVal.some(v => String(v) === String(val)) : false
                            function toggle() {
                              const cur = Array.isArray(cellVal) ? cellVal : []
                              const next = cur.some(v => String(v) === String(val))
                                ? cur.filter(v => String(v) !== String(val))
                                : [...cur, val]
                              updateCell(ri, c.columnKey, next)
                            }
                            return (
                              <label key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-[11px] cursor-pointer hover:bg-gray-50">
                                <input
                                  type="checkbox"
                                  className="h-3 w-3 rounded border-gray-300 text-brand"
                                  checked={isChecked}
                                  disabled={disabled || readonly}
                                  onChange={toggle}
                                />
                                <span>{lbl}</span>
                              </label>
                            )
                          })
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        className={baseTableClasses}
                        value={String(cellVal ?? '')}
                        disabled={disabled || readonly}
                        onChange={(e) => updateCell(ri, c.columnKey, e.target.value)}
                        placeholder={c.label || c.columnKey}
                      />
                    )}
                  </td>
                )
              })}
              <td className="px-2 py-2">
                {!readonly && !disabled ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={disabled}
                    onClick={() => deleteRow(ri)}
                  >
                    Delete
                  </Button>
                ) : <span className="text-ink-muted text-xs">—</span>}
              </td>
            </tr>
          ))
        }

        return (
          <div className="border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                {columns.length > 0 && (
                  <thead className="bg-surface-muted/70">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-ink-secondary w-10 border-b border-border">
                        #
                      </th>
                      {columns.map((c) => (
                        <th
                          key={c.columnKey}
                          className="px-3 py-2 text-left font-medium text-ink-secondary border-b border-border"
                        >
                          {c.label}
                          <span className="ml-2 text-[10px] font-normal text-ink-muted">{c.type}</span>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left font-medium text-ink-secondary w-20 border-b border-border">
                        Action
                      </th>
                    </tr>
                  </thead>
                )}
                <tbody>{tableBody}</tbody>
              </table>
            </div>
            <div className="px-3 py-2 bg-surface-muted/40 border-t border-border flex items-center justify-between flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled || readonly}
                onClick={addRow}
              >
                + Add row
              </Button>
              {columns.length === 0 ? (
                <span className="text-[11px] text-amber-700">⚠️ No column schema — table cannot render rows yet.</span>
              ) : (
                <details className="text-[11px] text-ink-muted">
                  <summary className="cursor-pointer">View / Edit raw JSON</summary>
                  <textarea
                    className="mt-2 w-full font-mono text-[11px] border border-border rounded px-2 py-1"
                    rows={3}
                    value={safeJsonStringify({ rows: rows })}
                    disabled={disabled}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value || '{}')
                        if (parsed && Array.isArray(parsed.rows)) setFieldValue(key, { rows: parsed.rows })
                        else if (Array.isArray(parsed)) setFieldValue(key, { rows: parsed })
                      } catch { /* ignore */ }
                    }}
                  />
                </details>
              )}
            </div>
          </div>
        )
      }

      case 'IMAGE':
      case 'ATTACHMENT': {
        const items = Array.isArray(value)
          ? value
          : value && typeof value === 'object'
          ? [value]
          : []

        const handleFilePick = (e) => {
          const files = Array.from(e.target.files || [])
          if (!files.length) return
          const next = files.map((f) => ({
            fileName: f.name,
            size: f.size,
            type: f.type,
          }))
          const combined = [...items, ...next]
          setFieldValue(key, inputType === 'IMAGE' ? combined[0] : combined)
        }

        return (
          <div className="space-y-2">
            <input
              type="file"
              multiple={inputType === 'ATTACHMENT'}
              accept={
                inputType === 'IMAGE'
                  ? 'image/*'
                  : undefined
              }
              disabled={disabled}
              className={baseInputClasses}
              onChange={handleFilePick}
            />
            {items.length > 0 && (
              <ul className="space-y-1">
                {items.map((it, i) => (
                  <li
                    key={i}
                    className="text-xs flex items-center justify-between px-3 py-2 rounded-lg bg-surface-muted/60 border border-border"
                  >
                    <span className="truncate text-ink-secondary">
                      {it.fileName || it.name || 'Unnamed file'}
                      {typeof it.size === 'number'
                        ? ` (${Math.round(it.size / 1024)} KB)`
                        : ''}
                    </span>
                    {!disabled && (
                      <button
                        type="button"
                        className="text-red-500 hover:text-red-600 ml-2 text-xs font-medium"
                        onClick={() => {
                          const filtered = items.filter((_, idx) => idx !== i)
                          setFieldValue(
                            key,
                            inputType === 'IMAGE'
                              ? filtered[0] || null
                              : filtered
                          )
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }

      case 'REPEATER': {
        const schema = parseJsonField(field.repeaterSchemaJson, {
          itemFields: [],
        })
        const itemFields = schema?.itemFields || []
        const current =
          value && typeof value === 'object'
            ? value
            : { items: [] }
        const items = Array.isArray(current.items) ? current.items : []

        const updateItem = (itemIdx, fieldKey, subValue) => {
          const next = deepClone(current)
          next.items = next.items || []
          if (!next.items[itemIdx]) next.items[itemIdx] = {}
          next.items[itemIdx][fieldKey] = subValue
          setFieldValue(key, next)
        }

        const addItem = () => {
          const next = deepClone(current)
          next.items = next.items || []
          const empty = {}
          itemFields.forEach((f) => (empty[f.fieldKey] = ''))
          next.items.push(empty)
          setFieldValue(key, next)
        }

        const removeItem = (itemIdx) => {
          const next = deepClone(current)
          next.items = (next.items || []).filter((_, i) => i !== itemIdx)
          setFieldValue(key, next)
        }

        return (
          <div className="space-y-3">
            {items.length === 0 && (
              <p className="text-xs text-ink-muted">No items yet. Click Add below.</p>
            )}
            {items.map((item, iIdx) => (
              <div
                key={iIdx}
                className="border border-border rounded-2xl p-3 bg-surface-muted/30"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-ink-secondary">
                    Item #{iIdx + 1}
                  </span>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={disabled}
                    onClick={() => removeItem(iIdx)}
                  >
                    - Remove
                  </Button>
                </div>
                <div className="space-y-3">
                  {itemFields.map((f) => (
                    <div key={f.fieldKey}>
                      <label className="block text-xs font-medium text-ink-secondary mb-1">
                        {f.label || f.fieldKey}
                      </label>
                      {f.inputType === 'TEXTAREA' ? (
                        <textarea
                          className={baseInputClasses}
                          rows={3}
                          value={item?.[f.fieldKey] ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(iIdx, f.fieldKey, e.target.value)
                          }
                        />
                      ) : f.inputType === 'NUMBER' ? (
                        <input
                          type="number"
                          className={baseInputClasses}
                          value={item?.[f.fieldKey] ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(
                              iIdx,
                              f.fieldKey,
                              e.target.value === ''
                                ? ''
                                : Number(e.target.value)
                            )
                          }
                        />
                      ) : (
                        <input
                          type="text"
                          className={baseInputClasses}
                          value={item?.[f.fieldKey] ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(iIdx, f.fieldKey, e.target.value)
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={addItem}
            >
              + Add item
            </Button>
          </div>
        )
      }

      case 'SYSTEM_GENERATED': {
        const sysCfg = parseJsonField(field.systemFieldConfigJson, {})
        const resolved =
          field.autoFieldSnapshot ||
          value ||
          sysCfg?.defaultValue ||
          sysCfg?.label ||
          ''
        const display =
          typeof resolved === 'object' && resolved
            ? JSON.stringify(resolved)
            : String(resolved ?? '')
        return (
          <div>
            <div className="flex items-center mb-1">
              <AutoBadge />
            </div>
            <input
              type="text"
              readOnly
              disabled
              className={baseInputClasses + ' bg-surface-muted/60 cursor-not-allowed text-ink-muted'}
              value={display}
            />
          </div>
        )
      }

      default:
        return (
          <TextInput
            type="text"
            value={value ?? ''}
            onChange={(e) => setFieldValue(key, e.target.value)}
            disabled={disabled}
          />
        )
    }
  }

  function renderSection(section, depth = 0) {
    const sectionFields = fieldsBySectionId[section.id] || []
    const children = childSectionsByParent[section.id] || []
    const paddingLeft = depth === 0 ? 0 : 8
    return (
      <section
        key={section.id}
        className="mb-8"
        style={{ marginLeft: `${paddingLeft * 4}px` }}
      >
        <div className="mb-4">
          <h3
            className={[
              'font-semibold text-ink',
              depth === 0 ? 'text-lg' : 'text-base',
            ].join(' ')}
          >
            {section.sectionTitle || `Section ${section.id}`}
          </h3>
          {section.sectionDescription ? (
            <small className="text-sm text-ink-muted mt-1 block">
              {section.sectionDescription}
            </small>
          ) : null}
        </div>

        {(() => {
          const visible = sectionFields.filter(f => visibleFieldKeys.has(f.fieldKey))
          if (visible.length === 0) return null
          return (
            <div className="space-y-5">
              {visible.map((f) => {
              const key = f.fieldKey
              const isChanged = changedFieldKeys.has(key)
              const wrapperClasses = [
                'relative -mx-2 px-2 pt-2 pb-3 rounded-2xl border transition-colors',
                isChanged
                  ? 'border-amber-300/70 bg-amber-50/30 ring-1 ring-amber-200/40'
                  : 'border-transparent bg-transparent'
              ].join(' ')
              return (
                <div key={f.id || f.fieldKey} className={wrapperClasses}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {f.inputType !== 'CHECKBOX' && f.inputType !== 'SYSTEM_GENERATED' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <FieldLabel field={f} />
                          {isChanged && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 text-amber-800">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              Edited
                            </span>
                          )}
                        </div>
                      )}
                      {f.inputType === 'CHECKBOX' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="block text-sm font-medium text-ink-secondary mb-1.5">
                            {f.fieldLabel || f.fieldKey}
                            {f.isMandatory ? (
                              <span className="text-red-500 ml-1">*</span>
                            ) : null}
                          </label>
                          {isChanged && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 text-amber-800 -mt-0.5">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              Edited
                            </span>
                          )}
                        </div>
                      )}
                      {f.inputType === 'SYSTEM_GENERATED' && <FieldLabel field={f} />}
                      {renderField(f)}
                      <FieldHelp field={f} />
                      {diffStyle !== 'none' && (
                        <FieldChangedBadge
                          field={f}
                          original={baselineOriginal?.[key]}
                          current={values?.[key]}
                        />
                      )}
                    </div>
                    {showResetButton && isChanged && typeof onResetField === 'function' && (
                      <button
                        type="button"
                        onClick={() => onResetField(key, baselineOriginal?.[key])}
                        className="shrink-0 mt-1 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 shadow-sm transition-colors"
                        title="Revert to original drafter value"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                        Revert
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          )
        })()}

        {children.length > 0 && (
          <div className="mt-6 space-y-6">
            {children.map((ch) => renderSection(ch, depth + 1))}
          </div>
        )}
      </section>
    )
  }

  function renderUnsectionedFields() {
    const unsectioned = fieldsBySectionId[null] || []
    const visible = unsectioned.filter(f => visibleFieldKeys.has(f.fieldKey))
    if (visible.length === 0) return null
    return (
      <section className="mb-8">
        {topSections.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold text-ink text-lg">General</h3>
          </div>
        )}
        <div className="space-y-5">
          {visible.map((f) => {
            const key = f.fieldKey
            const isChanged = changedFieldKeys.has(key)
            const wrapperClasses = [
              'relative -mx-2 px-2 pt-2 pb-3 rounded-2xl border transition-colors',
              isChanged
                ? 'border-amber-300/70 bg-amber-50/30 ring-1 ring-amber-200/40'
                : 'border-transparent bg-transparent'
            ].join(' ')
            return (
              <div key={f.id || f.fieldKey} className={wrapperClasses}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {f.inputType !== 'CHECKBOX' && f.inputType !== 'SYSTEM_GENERATED' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <FieldLabel field={f} />
                        {isChanged && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 text-amber-800">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            Edited
                          </span>
                        )}
                      </div>
                    )}
                    {f.inputType === 'CHECKBOX' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="block text-sm font-medium text-ink-secondary mb-1.5">
                          {f.fieldLabel || f.fieldKey}
                          {f.isMandatory ? <span className="text-red-500 ml-1">*</span> : null}
                        </label>
                        {isChanged && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 text-amber-800 -mt-0.5">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            Edited
                          </span>
                        )}
                      </div>
                    )}
                    {f.inputType === 'SYSTEM_GENERATED' && <FieldLabel field={f} />}
                    {renderField(f)}
                    <FieldHelp field={f} />
                    {diffStyle !== 'none' && (
                      <FieldChangedBadge
                        field={f}
                        original={baselineOriginal?.[key]}
                        current={values?.[key]}
                      />
                    )}
                  </div>
                  {showResetButton && isChanged && typeof onResetField === 'function' && (
                    <button
                      type="button"
                      onClick={() => onResetField(key, baselineOriginal?.[key])}
                      className="shrink-0 mt-1 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 shadow-sm transition-colors"
                      title="Revert to original drafter value"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                      Revert
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <div className={className}>
      {readonly && showReadonlyBanner && (
        <div className="mb-5 p-4 rounded-2xl border border-amber-300/60 bg-amber-50/70 dark:bg-amber-900/10">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 text-amber-600 mt-0.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Document is locked
              </p>
              <p className="text-xs mt-0.5 text-amber-700/90 dark:text-amber-300/80">
                This document is in read-only mode. You can view but cannot edit the fields.
              </p>
            </div>
          </div>
        </div>
      )}

      {!readonly && ai.aiEnabled && formFields.length > 0 && (
        <div className="mb-5">
          <div className="rounded-xl border border-indigo-200/70 bg-gradient-to-r from-indigo-50 via-white to-sky-50 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <div className="shrink-0 w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  &#10024; AI Autofill
                </p>
                <p className="text-xs mt-0.5 text-gray-600">
                  Paste a reference letter / email / notes and AI will auto-fill as many of the {formFields.length} fields as possible.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAiAutofillResult(null)
                setAiAutofillOpen(true)
              }}
              className="shrink-0"
            >
              <span className="mr-1.5">&#9889;</span> AI Autofill
            </Button>
          </div>
        </div>
      )}

      <div>
        {renderUnsectionedFields()}
        {topSections.map((s) => renderSection(s))}
      </div>

      {aiAutofillOpen && (
        <Modal
          isOpen={aiAutofillOpen}
          onClose={() => setAiAutofillOpen(false)}
          size="lg"
        >
          <ModalHeader
            title="&#10024; AI Autofill Form Fields"
            subtitle={`Template has ${formFields.length} fields. Paste source text below.`}
            onClose={() => setAiAutofillOpen(false)}
          />
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">
                  Reference / Context Text
                </label>
                <TextArea
                  value={aiContextText}
                  onChange={(e) => setAiContextText(e.target.value)}
                  placeholder={`Paste source material here...\n\nExample:\nFrom: john.doe@company.com\nSubject: New Employee Onboarding - Ahmad Bin Ismail\n\nHi HR,\nPlease on-board Ahmad Bin Ismail as Senior Engineer in the Technology division, effective 1st September 2026.\nHis reporting manager will be Siti binti Abdul Rahman.\nSalary: RM 8,500 per month.\nOffice location: KL Sentral Tower, Level 23.\n\nThanks,\nHR Operations`}
                  rows={10}
                  disabled={ai.loading.autofill}
                />
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Tip: Include names, dates, titles, and amounts clearly. AI will never invent values &mdash; if a field is missing, it stays empty.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={runAiAutofill}
                  disabled={aiContextText.trim().length < 10}
                  loading={ai.loading.autofill}
                  loadingText="Analyzing and extracting values..."
                >
                  <span className="mr-1.5">&#128269;</span> Extract Field Values
                </Button>
                {aiAutofillResult && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setAiAutofillResult(null)
                    }}
                  >
                    Clear Result
                  </Button>
                )}
              </div>

              {aiAutofillResult && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-800">
                        &#9989; Extraction Complete
                      </h4>
                      <p className="text-xs text-emerald-700/90 mt-0.5">
                        {Object.values(aiAutofillResult.filledFields || {}).filter((v) => v !== null && v !== '' && v !== undefined).length} of {formFields.length} fields extracted.
                        {aiAutofillResult.notes && <span className="ml-1 italic">— {aiAutofillResult.notes}</span>}
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={applyAiAutofill}
                    >
                      <span className="mr-1.5">&#10003;</span> Apply to Form
                    </Button>
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-lg bg-white border border-emerald-100 divide-y divide-emerald-50">
                    {formFields.map((f) => {
                      const key = f.fieldKey
                      const extracted = aiAutofillResult.filledFields?.[key]
                      const confidence = aiAutofillResult.confidenceScores?.[key]
                      const hasValue = extracted !== null && extracted !== undefined && extracted !== ''
                      return (
                        <div key={key} className="px-3 py-2 grid grid-cols-[auto_1fr_auto] gap-3 items-start text-[12.5px]">
                          <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${hasValue ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                          <div className="min-w-0">
                            <div className="font-medium text-gray-800 truncate">
                              {f.fieldLabel || f.label || key}
                            </div>
                            <div className="text-[10.5px] text-gray-400 font-mono truncate">{key}</div>
                          </div>
                          <div className="text-right shrink-0 max-w-[50%]">
                            {hasValue ? (
                              <>
                                <div className="font-mono text-[11.5px] text-gray-900 bg-gray-50 rounded px-2 py-0.5 inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap border border-gray-200">
                                  {String(extracted)}
                                </div>
                                {typeof confidence === 'number' && (
                                  <div className={`text-[10px] mt-0.5 ${confidence >= 0.8 ? 'text-emerald-600' : confidence >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {Math.round(confidence * 100)}% confidence
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-[11px] text-gray-400 italic">not found</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter className="flex-wrap justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAiAutofillOpen(false)}
            >
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
