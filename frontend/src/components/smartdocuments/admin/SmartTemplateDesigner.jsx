import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import api from '../../../api/axios'
import aiApi from '../../../api/ai'
import useAI from '../../../hooks/useAI'
import useTableFeatures from '../../../hooks/useTableFeatures'
import Button from '../../ui/Button'
import TextInput from '../../ui/TextInput'
import TextArea from '../../ui/TextArea'
import SelectField from '../../ui/SelectField'
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../ui/Modal'
import PageHeader from '../../ui/PageHeader'
import SectionHeader from '../../ui/SectionHeader'
import EmptyPanelState from '../../ui/EmptyPanelState'
import InlineSpinner from '../../ui/InlineSpinner'
import PageContainer from '../../ui/PageContainer'
import AppSurface from '../../ui/AppSurface'
import ColumnSettingsButton from '../../ui/ColumnSettingsButton'
import { TableContainer, Table, Th, Td, Tr } from '../../ui/Table'
import ActionMenu from '../../ActionMenu'
import Pagination from '../../Pagination'
import { usePreferences } from '../../../contexts/PreferencesContext'
import SmartForm from '../SmartForm'

const SUBTABS = [
  { id: 0, key: 'general', label: 'General' },
  { id: 1, key: 'versions', label: 'Versions' },
  { id: 2, key: 'sections', label: 'Sections' },
  { id: 3, key: 'fields', label: 'Form Fields' },
  { id: 4, key: 'mapping', label: 'Placeholder Mapping' },
  { id: 5, key: 'preview', label: 'Preview & Test' }
]

const INPUT_TYPES = [
  'TEXT', 'TEXTAREA', 'RICH_TEXT', 'NUMBER', 'DATE', 'DATETIME',
  'DROPDOWN', 'SINGLE_SELECT', 'MULTI_SELECT',
  'CHECKBOX', 'USER_LOOKUP', 'TABLE', 'IMAGE', 'ATTACHMENT',
  'REPEATER', 'SYSTEM_GENERATED'
]

const PLACEHOLDER_TYPES = [
  'SIMPLE_VALUE', 'RICH_TEXT_CONTENT', 'TABLE_ROWS', 'IMAGE',
  'REPEATED_SECTION', 'HEADER_FIELD', 'FOOTER_FIELD'
]

const PAGE_NUMBER_FORMATS = ['Page X of Y', 'Page X', '- X -', 'None']

const INPUT_TYPE_TO_PLACEHOLDER_TYPE = {
  TEXT: 'SIMPLE_VALUE',
  NUMBER: 'SIMPLE_VALUE',
  DROPDOWN: 'SIMPLE_VALUE',
  SINGLE_SELECT: 'SIMPLE_VALUE',
  MULTI_SELECT: 'SIMPLE_VALUE',
  CHECKBOX: 'SIMPLE_VALUE',
  USER_LOOKUP: 'SIMPLE_VALUE',
  ATTACHMENT: 'SIMPLE_VALUE',
  SYSTEM_GENERATED: 'SIMPLE_VALUE',
  TEXTAREA: 'RICH_TEXT_CONTENT',
  RICH_TEXT: 'RICH_TEXT_CONTENT',
  DATE: 'SIMPLE_VALUE',
  DATETIME: 'SIMPLE_VALUE',
  TABLE: 'TABLE_ROWS',
  IMAGE: 'IMAGE',
  REPEATER: 'REPEATED_SECTION'
}

const OUTPUT_FORMAT_PRESETS = {
  SIMPLE_VALUE: {
    DATE: { dateFormat: 'DD/MM/YYYY' },
    DATETIME: { dateFormat: 'DD/MM/YYYY HH:mm' },
    NUMBER: { decimalPlaces: 2, thousandSeparator: true, prefix: '', suffix: '' },
    CHECKBOX: { trueLabel: 'Yes', falseLabel: 'No' },
    USER_LOOKUP: { displayFormat: 'fullName', fallback: 'email' },
    DROPDOWN: { useLabel: true },
    SINGLE_SELECT: { useLabel: true },
    MULTI_SELECT: { useLabel: true, joinSeparator: ', ' },
    SYSTEM_GENERATED: { dateFormat: 'DD/MM/YYYY' }
  },
  RICH_TEXT_CONTENT: {
    TEXTAREA: { preserveLineBreaks: true, stripHtml: false },
    RICH_TEXT: { stripHtml: true, preserveLineBreaks: true, allowedTags: 'none' }
  },
  TABLE_ROWS: {
    TABLE: { headerRow: true, border: true, autoWidth: true, columnWise: false }
  },
  IMAGE: {
    IMAGE: { widthCm: 15, heightCm: 'auto', keepAspectRatio: true, align: 'center' }
  },
  REPEATED_SECTION: {
    REPEATER: { itemSeparator: 'paragraph', renderEmptyAs: '', maxItems: 50 }
  },
  HEADER_FIELD: {
    TEXT: { scope: 'header', align: 'left', fontWeight: 'normal' },
    DATE: { scope: 'header', dateFormat: 'DD/MM/YYYY', align: 'right' },
    DATETIME: { scope: 'header', dateFormat: 'DD/MM/YYYY HH:mm', align: 'right' },
    SYSTEM_GENERATED: { scope: 'header', dateFormat: 'DD/MM/YYYY' }
  },
  FOOTER_FIELD: {
    TEXT: { scope: 'footer', align: 'center', fontWeight: 'normal' },
    SYSTEM_GENERATED: { scope: 'footer', dateFormat: 'DD/MM/YYYY' }
  }
}

const PLACEHOLDER_TYPE_DESCRIPTIONS = {
  SIMPLE_VALUE: 'Plain text, numbers, dates, single-select, checkboxes, user names. Rendered inline.',
  RICH_TEXT_CONTENT: 'Multi-line text or WYSIWYG content. Preserves paragraphs and line breaks.',
  TABLE_ROWS: 'Repeatable array rows for Docxtemplater {#tag}...{/tag} table loops.',
  IMAGE: 'Binary / embedded image placeholders. Rendered with size constraints.',
  REPEATED_SECTION: 'Repeated block of sub-fields (e.g. items.list, attendees.name).',
  HEADER_FIELD: 'Value injected into the DOCX header area; format scope = header.',
  FOOTER_FIELD: 'Value injected into the DOCX footer area; format scope = footer.'
}

const DATE_FORMAT_SUGGESTIONS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
  'DD MMM YYYY',
  'DD MMMM YYYY',
  'DD/MM/YYYY HH:mm',
  'HH:mm'
]

function normalizeKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function findFieldByPlaceholder(phName, fields) {
  if (!fields || !fields.length) return null
  const norm = normalizeKey(phName)
  let best = null
  let bestScore = 0
  for (const f of fields) {
    const keyNorm = normalizeKey(f.fieldKey)
    const labelNorm = normalizeKey(f.fieldLabel)
    if (keyNorm === norm) { return f }
    if (labelNorm === norm) { return f }
    let score = 0
    if (keyNorm.includes(norm) && norm.length >= 4) score = Math.max(score, norm.length / keyNorm.length)
    if (labelNorm.includes(norm) && norm.length >= 4) score = Math.max(score, norm.length / labelNorm.length)
    if (norm.includes(keyNorm) && keyNorm.length >= 4) score = Math.max(score, keyNorm.length / norm.length)
    if (score > bestScore) { bestScore = score; best = f }
  }
  return bestScore >= 0.6 ? best : null
}

function inferPlaceholderTypeAndFormat(formField, phContextInferred) {
  const inputType = formField && formField.inputType ? formField.inputType : 'TEXT'
  const inputTypeUpper = String(inputType).toUpperCase()
  let phType = INPUT_TYPE_TO_PLACEHOLDER_TYPE[inputType] || 'SIMPLE_VALUE'
  if (phContextInferred === 'TABLE_ROW' && (inputTypeUpper === 'TABLE' || inputTypeUpper === 'TABLE_ROWS' || inputTypeUpper === 'ROW' || inputTypeUpper === 'REPEATER' || inputTypeUpper === 'TABLE_CELL')) {
    if (phType === 'SIMPLE_VALUE' || phType === 'TABLE_ROWS' || phType === 'REPEATED_SECTION') {
      phType = 'TABLE_ROWS'
    }
  } else if (phContextInferred === 'REPEATED' && (inputTypeUpper === 'REPEATER' || inputTypeUpper === 'REPEAT' || inputTypeUpper === 'REPEATED_SECTION') && phType !== 'TABLE_ROWS') {
    phType = 'REPEATED_SECTION'
  }
  const typePresets = OUTPUT_FORMAT_PRESETS[phType] || {}
  const preset = typePresets[inputType] || null
  return { phType, outputFormat: preset ? { ...preset } : null }
}

function SubTabBar({ active, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50/50 px-1 rounded-t-lg">
      {SUBTABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={[
            'relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
            active === tab.id
              ? 'text-blue-600'
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg'
          ].join(' ')}
        >
          {tab.label}
          {active === tab.id && (
            <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-blue-600 rounded-full" />
          )}
        </button>
      ))}
    </div>
  )
}

const Pill = ({ variant = 'default', children }) => {
  const variants = {
    default: 'bg-gray-50 text-gray-700 border-gray-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200'
  }
  return (
    <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border', variants[variant] || variants.default].join(' ')}>
      {children}
    </span>
  )
}

function formatDate(val) {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleDateString() + ' ' + new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return String(val) }
}

function toast(cb, msg, type = 'success') {
  if (cb) cb(msg, type)
}

function tryParseJson(str, fallback) {
  if (!str) return fallback
  if (typeof str === 'object') return str
  try { return JSON.parse(str) } catch { return fallback }
}

function parseDropdownOptions(optionsJsonRaw) {
  const parsed = tryParseJson(optionsJsonRaw, null)
  if (parsed && Array.isArray(parsed.options)) return parsed.options
  if (Array.isArray(parsed)) return parsed
  return []
}

function buildOptionsJsonFromArray(arr) {
  return safeJsonStringify({ options: Array.isArray(arr) ? arr : [] })
}

function readDefaultValueScalar(defaultValueJsonRaw, inputType) {
  const v = tryParseJson(defaultValueJsonRaw, undefined)
  if (v === undefined || v === null) {
    if (inputType === 'CHECKBOX') return false
    if (inputType === 'MULTI_SELECT') return []
    return ''
  }
  if (inputType === 'CHECKBOX') return Boolean(v)
  if (inputType === 'NUMBER') return (v === null || v === undefined) ? '' : String(v)
  if (inputType === 'MULTI_SELECT') return Array.isArray(v) ? v : (v ? [String(v)] : [])
  if (inputType === 'SINGLE_SELECT') return String(v)
  return String(v)
}

function writeDefaultValueScalar(scalar, inputType) {
  if (inputType === 'CHECKBOX') return safeJsonStringify(Boolean(scalar))
  if (inputType === 'NUMBER') {
    if (scalar === '' || scalar === null || scalar === undefined) return ''
    const n = Number(scalar)
    return safeJsonStringify(Number.isFinite(n) ? n : String(scalar))
  }
  if (inputType === 'MULTI_SELECT') {
    if (!scalar || (Array.isArray(scalar) && scalar.length === 0)) return ''
    return safeJsonStringify(Array.isArray(scalar) ? scalar : [scalar])
  }
  if (scalar === '' || scalar === null || scalar === undefined) return ''
  return safeJsonStringify(scalar)
}

function readCheckboxLabel(validationRulesJsonRaw) {
  const v = tryParseJson(validationRulesJsonRaw, null)
  return typeof (v && v.checkboxLabel) === 'string' ? v.checkboxLabel : ''
}

function writeCheckboxLabel(validationRulesJsonRaw, label) {
  const prev = tryParseJson(validationRulesJsonRaw, null) || {}
  const next = { ...prev }
  const clean = typeof label === 'string' ? label.trim() : ''
  if (!clean) {
    delete next.checkboxLabel
  } else {
    next.checkboxLabel = clean
  }
  const keys = Object.keys(next)
  if (keys.length === 0) return ''
  return safeJsonStringify(next)
}

function DropdownOptionsEditor({
  optionsJson, onChange, defaultValue, onDefaultChange,
  ownerFieldKey = '',
  allFields = [],
  onAddDependent = null,
  onEditExistingDependent = null,
  isMultiDefault = false
}) {
  const options = parseDropdownOptions(optionsJson)
  const ownerKey = (ownerFieldKey || '').trim()
  function countDependentsFor(optValue) {
    if (!ownerKey || !optValue) return []
    return (allFields || []).filter(f => {
      const cfg = parseVisibilityRules(f?.visibilityRulesJson ?? '')
      if (!cfg || !cfg.enabled || !Array.isArray(cfg.rules)) return false
      return cfg.rules.some(r =>
        r && r.fieldKey === ownerKey &&
        (r.operator === 'equals' || r.operator === 'in') &&
        (String(r.value ?? '') === String(optValue))
      )
    })
  }
  function persist(next) { onChange(buildOptionsJsonFromArray(next)) }
  function addOption() {
    const n = options.length + 1
    const stub = `option_${n}`
    persist([...options, { value: stub, label: `Option ${n}` }])
  }
  function updateRow(i, patch) {
    const next = options.map((o, idx) => idx === i ? { ...o, ...patch } : o)
    persist(next)
  }
  function removeRow(i) {
    const next = options.filter((_, idx) => idx !== i)
    persist(next)
    const removedValue = options[i]?.value
    if (onDefaultChange && defaultValue && removedValue) {
      if (isMultiDefault && Array.isArray(defaultValue)) {
        onDefaultChange(defaultValue.filter(v => v !== removedValue))
      } else if (!isMultiDefault && String(defaultValue) === String(removedValue)) {
        onDefaultChange('')
      }
    }
  }
  function move(i, delta) {
    const j = i + delta
    if (j < 0 || j >= options.length) return
    const next = options.slice()
    const tmp = next[i]; next[i] = next[j]; next[j] = tmp
    persist(next)
  }
  function toggleMultiDefault(optValue) {
    if (!onDefaultChange) return
    const current = Array.isArray(defaultValue) ? defaultValue : []
    const next = current.includes(optValue)
      ? current.filter(v => v !== optValue)
      : [...current, optValue]
    onDefaultChange(next)
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-500">
          Define dropdown choices. For each option, click <span className="font-semibold text-violet-700">+ Add Field</span> to instantly create a dependent field that appears ONLY when end-users select that option.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {onDefaultChange && (
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-gray-700">Default value{isMultiDefault ? 's' : ''}</label>
              {isMultiDefault ? (
                <div className="flex flex-wrap items-center gap-2 max-w-[320px] px-2 py-1.5 border border-gray-300 bg-white rounded-md max-h-[80px] overflow-y-auto">
                  {options.length === 0 ? (
                    <span className="text-[11px] text-gray-400 italic">Add options first</span>
                  ) : (
                    options.map((o, i) => {
                      const isChecked = Array.isArray(defaultValue) && defaultValue.includes(o.value)
                      return (
                        <label key={i} className="inline-flex items-center gap-1 cursor-pointer text-[11px] text-gray-700">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-gray-300 text-brand"
                            checked={isChecked}
                            onChange={() => toggleMultiDefault(o.value)}
                          />
                          <span className="whitespace-nowrap">{o.label}</span>
                        </label>
                      )
                    })
                  )}
                </div>
              ) : (
                <SelectField value={defaultValue ?? ''} onChange={(e) => onDefaultChange(e.target.value)}>
                  <option value="">— No default —</option>
                  {options.map((o, i) => <option key={i} value={o.value}>{o.label} ({o.value})</option>)}
                </SelectField>
              )}
            </div>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={addOption}>
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            Add Option
          </Button>
        </div>
      </div>

      {!ownerKey && allFields.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          💡 Fill in a <strong>Field Key</strong> above first, then click <strong>+ Add Field</strong> on any option to create a dependent field with the visibility rule pre-wired.
        </div>
      )}

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-0 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          <div className="px-3 py-2">Value <span className="text-gray-400 font-normal">(machine key, unique)</span></div>
          <div className="px-3 py-2 border-l border-gray-200">Label <span className="text-gray-400 font-normal">(displayed to user)</span></div>
          <div className="px-3 py-2 w-[260px] border-l border-gray-200 text-center">Supporting Fields / Actions</div>
        </div>
        {options.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-gray-500 bg-gray-50/40">
            No dropdown options yet. Click <strong>Add Option</strong> above to create the first choice.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {options.map((o, i) => {
              const deps = countDependentsFor(o.value)
              return (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-0 bg-white hover:bg-gray-50/50">
                  <div className="px-3 py-2">
                    <TextInput size="sm" value={o.value || ''} onChange={(e) => updateRow(i, { value: e.target.value })} placeholder="e.g. NewEmployee" />
                  </div>
                  <div className="px-3 py-2 border-l border-gray-100">
                    <TextInput size="sm" value={o.label || ''} onChange={(e) => updateRow(i, { label: e.target.value })} placeholder="e.g. New Employee" />
                  </div>
                  <div className="px-2 py-2 w-[260px] border-l border-gray-100 flex flex-col items-stretch gap-1.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        title={ownerKey ? `Add dependent field that appears when option "${o.label}" is selected` : 'Enter a Field Key above first to enable dependent-field creation'}
                        disabled={!ownerKey || !onAddDependent}
                        onClick={() => onAddDependent && onAddDependent(o.value, o.label)}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-md border border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                        Add Field
                      </button>
                      <div className="flex items-center gap-0.5">
                        <button type="button" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}
                          className="p-1.5 rounded border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:bg-gray-50">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button type="button" title="Move down" onClick={() => move(i, +1)} disabled={i === options.length - 1}
                          className="p-1.5 rounded border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:bg-gray-50">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        <button type="button" title="Remove option" onClick={() => removeRow(i)}
                          className="p-1.5 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                    {deps.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {deps.slice(0, 4).map(dep => {
                          const cid = dep.id || dep._cid
                          return (
                            <button
                              key={cid}
                              type="button"
                              onClick={() => onEditExistingDependent && onEditExistingDependent(dep)}
                              title={`Click to edit existing dependent field: ${dep.fieldLabel || dep.fieldKey}`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-violet-200 bg-violet-50 text-[10px] text-violet-800 hover:bg-violet-100"
                            >
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-600" />
                              {dep.fieldLabel || dep.fieldKey}
                              <span className="text-[9px] text-violet-500">({dep.inputType || '?'})</span>
                            </button>
                          )
                        })}
                        {deps.length > 4 && (
                          <span className="text-[10px] text-violet-600 bg-white px-1.5 py-0.5 rounded border border-violet-200">
                            +{deps.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                    {deps.length === 0 && ownerKey && (
                      <div className="text-[10px] text-gray-400 italic leading-tight pl-0.5">
                        No supporting fields yet — click Add Field above.
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function CheckboxEditor({ defaultValue, onDefaultChange, checkboxLabel, onCheckboxLabelChange }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500">Customise how this checkbox appears and what its default state should be when a new Smart Document draft opens.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 rounded border-gray-300 text-[#003366]"
            checked={Boolean(defaultValue)}
            onChange={(e) => onDefaultChange(e.target.checked)}
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900">Default ticked (pre-checked)</div>
            <div className="text-[11px] text-gray-500 mt-0.5">When enabled, new drafts will have this checkbox already checked (value = true).</div>
          </div>
        </label>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <label className="block text-xs font-semibold text-gray-800 mb-1.5">Checkbox label text <span className="text-gray-400 font-normal">(next to checkbox)</span></label>
          <TextInput
            size="sm"
            value={checkboxLabel || ''}
            onChange={(e) => onCheckboxLabelChange(e.target.value)}
            placeholder="e.g. I agree to the terms and conditions"
          />
          <p className="text-[11px] text-gray-500 mt-1.5">If empty, the Field Label above will be used instead.</p>
        </div>
      </div>
    </div>
  )
}

const VISIBILITY_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'not equals' },
  { value: 'contains', label: 'contains text' },
  { value: 'notContains', label: 'does NOT contain' },
  { value: 'isEmpty', label: 'is empty / not filled' },
  { value: 'isNotEmpty', label: 'is NOT empty / filled' }
]

function parseVisibilityRules(visibilityRulesJsonRaw) {
  const raw = tryParseJson(visibilityRulesJsonRaw, null)
  if (!raw || typeof raw !== 'object') {
    return { enabled: false, match: 'ALL', rules: [] }
  }
  return {
    enabled: raw.enabled === true,
    match: (raw.match === 'ANY' || raw.match === 'ALL') ? raw.match : 'ALL',
    rules: Array.isArray(raw.rules) ? raw.rules.filter(r => r && r.fieldKey) : []
  }
}

function buildVisibilityRulesJson(config) {
  if (!config) return ''
  if (config.enabled !== true) return ''
  const rules = Array.isArray(config.rules) ? config.rules.filter(r => r && r.fieldKey) : []
  return safeJsonStringify({
    enabled: true,
    match: (config.match === 'ANY') ? 'ANY' : 'ALL',
    rules
  })
}

function hasConditionalVisibilityEnabled(field) {
  if (!field) return false
  const cfg = parseVisibilityRules(field.visibilityRulesJson ?? '')
  return !!(cfg && cfg.enabled === true && Array.isArray(cfg.rules) && cfg.rules.length > 0)
}

function isIndividualMappingRequired(field) {
  if (!field) return false
  if (!!field.isSupportingField) return false
  if (hasConditionalVisibilityEnabled(field)) return false
  return true
}

const SYSTEM_RESERVED_PLACEHOLDER_SET = new Set(['supporting_data'])

function isSystemReservedPlaceholder(placeholderName) {
  if (!placeholderName) return false
  const normalized = String(placeholderName || '')
    .trim()
    .replace(/^[\{\{\s]+|[\s\}\}]+$/g, '')
    .toLowerCase()
    .replace(/[_\-]+/g, '_')
  return SYSTEM_RESERVED_PLACEHOLDER_SET.has(normalized)
}

function ConditionalVisibilityEditor({ visibilityRulesJson, onChange, controllerFields = [], currentFieldKey = '' }) {
  const cfg = parseVisibilityRules(visibilityRulesJson)
  const fieldsForSelect = (controllerFields || []).filter(f => {
    if (!f) return false
    const k = f.fieldKey
    return !!k && k !== currentFieldKey
  })

  function writeCfg(patch) {
    const next = { ...cfg, ...patch }
    onChange(buildVisibilityRulesJson(next))
  }

  function writeRule(i, patch) {
    const next = cfg.rules.slice()
    next[i] = next[i] ? { ...next[i], ...patch } : { fieldKey: '', operator: 'equals', value: '' }
    writeCfg({ rules: next })
  }

  function addRule() {
    const firstField = fieldsForSelect[0]?.fieldKey || ''
    const next = [...cfg.rules, { fieldKey: firstField, operator: 'equals', value: '' }]
    writeCfg({ rules: next })
  }

  function removeRule(i) {
    const next = cfg.rules.filter((_, idx) => idx !== i)
    writeCfg({ rules: next })
  }

  function getFieldOptions(fieldKey) {
    const f = fieldsForSelect.find(x => x.fieldKey === fieldKey)
    if (!f) return []
    return parseDropdownOptions(f.optionsJson || '')
  }

  function isValueFreeText(operator, fieldKey) {
    if (['isEmpty', 'isNotEmpty'].includes(String(operator))) return false
    const f = fieldsForSelect.find(x => x.fieldKey === fieldKey)
    return !(f && (f.inputType === 'DROPDOWN' || f.inputType === 'SINGLE_SELECT' || f.inputType === 'MULTI_SELECT' || f.inputType === 'CHECKBOX'))
  }

  function isValueDropdownOptions(operator, fieldKey) {
    if (['isEmpty', 'isNotEmpty'].includes(String(operator))) return false
    const f = fieldsForSelect.find(x => x.fieldKey === fieldKey)
    return !!(f && (f.inputType === 'DROPDOWN' || f.inputType === 'SINGLE_SELECT' || f.inputType === 'MULTI_SELECT'))
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 rounded border-gray-300 text-[#003366]"
          checked={cfg.enabled}
          onChange={(e) => writeCfg({ enabled: e.target.checked })}
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-violet-950">Enable conditional visibility for this field</div>
          <div className="text-[11px] text-violet-900/70 mt-0.5">
            When enabled, this field will only appear in the Smart Form when the rules below match based on other field values.
          </div>
        </div>
      </label>

      {cfg.enabled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Show this field if</label>
              <SelectField
                size="sm"
                value={cfg.match || 'ALL'}
                onChange={(e) => writeCfg({ match: e.target.value })}
              >
                <option value="ALL">ALL rules match (AND)</option>
                <option value="ANY">ANY rule matches (OR)</option>
              </SelectField>
              <span className="text-[11px] text-gray-500">of the following:</span>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={addRule}>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              Add Rule
            </Button>
          </div>

          {fieldsForSelect.length === 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Tip: Save this template with other fields first, then come back — you'll be able to reference other fields as visibility controllers.
            </div>
          )}

          {cfg.rules.length === 0 && fieldsForSelect.length > 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-4 py-6 text-center text-xs text-gray-500">
              No visibility rules yet. Click <strong>Add Rule</strong> to create the first condition.
            </div>
          )}

          {cfg.rules.map((rule, i) => {
            const opts = getFieldOptions(rule.fieldKey)
            const freeText = isValueFreeText(rule.operator, rule.fieldKey)
            const dropdownVals = isValueDropdownOptions(rule.operator, rule.fieldKey)
            const skipVal = ['isEmpty', 'isNotEmpty'].includes(String(rule.operator))

            return (
              <div key={i} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(160px,1fr)_minmax(0,1fr)_auto] gap-2 items-end">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                      Controller field
                    </label>
                    <SelectField
                      size="sm"
                      value={rule.fieldKey || ''}
                      onChange={(e) => writeRule(i, { fieldKey: e.target.value, value: ['isEmpty', 'isNotEmpty'].includes(String(rule.operator)) ? '' : (rule.value ?? '') })}
                    >
                      <option value="">— Select field —</option>
                      {fieldsForSelect.map((f, idx) => (
                        <option key={f.id || f._cid || idx} value={f.fieldKey}>
                          {f.fieldLabel || f.fieldKey}{f.inputType ? ` (${f.inputType})` : ''}
                        </option>
                      ))}
                    </SelectField>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                      Operator
                    </label>
                    <SelectField
                      size="sm"
                      value={rule.operator || 'equals'}
                      onChange={(e) => writeRule(i, { operator: e.target.value, value: ['isEmpty', 'isNotEmpty'].includes(e.target.value) ? '' : (rule.value ?? '') })}
                    >
                      {VISIBILITY_OPERATORS.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </SelectField>
                  </div>

                  <div>
                    {!skipVal && (
                      <>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                          Value
                        </label>
                        {dropdownVals ? (
                          <SelectField
                            size="sm"
                            value={String(rule.value ?? '')}
                            onChange={(e) => writeRule(i, { value: e.target.value })}
                          >
                            <option value="">— Select value —</option>
                            {opts.map((o, oi) => (
                              <option key={oi} value={o.value}>{o.label} ({o.value})</option>
                            ))}
                          </SelectField>
                        ) : freeText ? (
                          <TextInput
                            size="sm"
                            value={String(rule.value ?? '')}
                            onChange={(e) => writeRule(i, { value: e.target.value })}
                            placeholder="Value to match against"
                          />
                        ) : (
                          <TextInput
                            size="sm"
                            value={String(rule.value ?? '')}
                            onChange={(e) => writeRule(i, { value: e.target.value })}
                            placeholder="Value (true/false / text / etc)"
                          />
                        )}
                      </>
                    )}
                    {skipVal && (
                      <div className="h-[38px] flex items-center text-xs text-gray-400 italic">
                        — no value needed for this operator —
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end pb-1">
                    <button
                      type="button"
                      title="Remove this rule"
                      onClick={() => removeRule(i)}
                      className="p-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function safeJsonStringify(obj, indent = 2) {
  if (obj === null || obj === undefined) return ''
  if (typeof obj === 'string') return obj
  try { return JSON.stringify(obj, null, indent) } catch { return String(obj) }
}

function getName(p) {
  const raw = typeof p === 'string' ? p : (p.placeholderName || p.cleanName || p.name || String(p))
  return String(raw).replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '')
}

function toPlaceholderTag(nameOrObj) {
  const clean = getName(nameOrObj)
  return `{{${clean}}}`
}

function getPhContext(placeholderObjOrName) {
  if (typeof placeholderObjOrName === 'string') return 'SIMPLE'
  return placeholderObjOrName.contextInferred || placeholderObjOrName.placeholderType || 'SIMPLE'
}

function humanize(str) {
  return String(str || '')
    .replace(/^[\s_]+|[\s_]+$/g, '')
    .replace(/[_\s]+/g, ' ')
    .replace(/^[a-z]/, m => m.toUpperCase())
    .replace(/\s+([a-z])/g, m => m.toUpperCase())
}

function toFieldKeyFormat(str) {
  return String(str || '')
    .trim()
    .replace(/[^\w\s]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

function inferFieldFromPlaceholder(placeholderObjOrName, sortOrderIdx) {
  const name = getName(placeholderObjOrName)
  const ctx = getPhContext(placeholderObjOrName)
  const norm = String(name || '').toLowerCase().replace(/[-\s]+/g, '_')

  const ctxIsTable = (ctx === 'TABLE_ROWS' || ctx === 'TABLE_ROW' || String(ctx).toUpperCase().includes('TABLE'))
  const ctxIsRepeater = (ctx === 'REPEATED_SECTION' || String(ctx).toUpperCase().includes('REPEAT'))

  const tableKeywordMatch = /(^|_)(rows?|list|lists|items?|table|tables?|entries?|agenda|attendees?|lampiran|butiran|senarai|perkara_|jual|belian|item_|item$|_item_|row_|row$)/i.test(norm) || /(agenda|kehadiran|keahlian|lampiran_lampiran|ulasan|remarks?)/i.test(norm)
  const repeaterKeywordMatch = /(^|_)(section_|repeat|ulang|sekatan|group_|batch_|bundle_)/i.test(norm)
  const singleValueKeywordDate = /(date|tarikh|hari|tarikh_?masa|datetime)/i.test(norm)
  const singleValueKeywordTime = /(^|_)(time|masa|jam|waktu)(_|$)/i.test(norm)
  const singleValueKeywordDatetime = singleValueKeywordDate && singleValueKeywordTime
  const singleValueKeywordPerson = /(nama|name|pengerusi|chairperson|chair|pengerusi_|a?jkk|pengerusi|ahli|pegawai|person|pemilik|owner|oleh|by)/i.test(norm)
  const singleValueKeywordVenue = /(venue|tempat|lokasi|location|platform|kaunter|dewan|bilik|room)/i.test(norm)
  const singleValueKeywordAmount = /(jumlah|amount|total|harga|price|bil|bayar|payment|caj|fee|denda|nombor|no_?surat|no_|no$|reference|rujukan|code|kod|id|tracking)/i.test(norm)
  const singleValueKeywordNote = /(nota|notes|notulen|ringkasan|summary|penerangan|keterangan|description|ulasan|remark|rumusan|tajuk|title|tema|subjek|subject|overview|agenda_title|agenda_?name)/i.test(norm)
  const singleValueKeywordFile = /(image|gambar|photo|logo|tandatangan|signature|lampiran|attachment|file|dokumen|document|muat_?naik|upload)/i.test(norm)
  const hasSingleValueSignal = singleValueKeywordDate || singleValueKeywordTime || singleValueKeywordPerson || singleValueKeywordVenue || singleValueKeywordAmount || singleValueKeywordNote || singleValueKeywordFile

  let inputType = 'TEXT'
  if (tableKeywordMatch || (ctxIsTable && !hasSingleValueSignal)) inputType = 'TABLE'
  else if (repeaterKeywordMatch || (ctxIsRepeater && !hasSingleValueSignal)) inputType = 'REPEATER'
  else if (singleValueKeywordFile) {
    if (/(image|gambar|photo|logo|tandatangan|signature)/i.test(norm)) inputType = 'IMAGE'
    else inputType = 'ATTACHMENT'
  } else if (singleValueKeywordDatetime) inputType = 'DATETIME'
  else if (singleValueKeywordDate) inputType = 'DATE'
  else if (singleValueKeywordTime) inputType = 'TIME'
  else if (singleValueKeywordAmount && /(jumlah|amount|total|harga|price|bil|count|qty|quantity|nombor|number|baki|balance|sum|bayar|payment|caj|fee|denda)/i.test(norm)) inputType = 'NUMBER'
  else if (singleValueKeywordNote) inputType = 'TEXTAREA'

  const colSchemaFromName = (() => {
    if (inputType !== 'TABLE') return null
    if (/agenda/i.test(norm)) return [
      { fieldKey: 'masa', headerLabel: 'Masa', inputType: 'TIME' },
      { fieldKey: 'perkara', headerLabel: 'Perkara', inputType: 'TEXT' },
      { fieldKey: 'pengerusi', headerLabel: 'Disediakan Oleh', inputType: 'TEXT' }
    ]
    if (/kehadiran|ahli|attendee|peserta/i.test(norm)) return [
      { fieldKey: 'bil', headerLabel: 'Bil.', inputType: 'NUMBER' },
      { fieldKey: 'nama', headerLabel: 'Nama', inputType: 'TEXT' },
      { fieldKey: 'jawatan', headerLabel: 'Jawatan', inputType: 'TEXT' },
      { fieldKey: 'tandatangan', headerLabel: 'Tandatangan', inputType: 'IMAGE' }
    ]
    if (/lampiran|attachment|dokumen|document/i.test(norm)) return [
      { fieldKey: 'bil', headerLabel: 'Bil.', inputType: 'NUMBER' },
      { fieldKey: 'tajuk', headerLabel: 'Tajuk Dokumen', inputType: 'TEXT' },
      { fieldKey: 'fail', headerLabel: 'Fail', inputType: 'ATTACHMENT' },
      { fieldKey: 'nota', headerLabel: 'Nota', inputType: 'TEXTAREA' }
    ]
    if (/jualan|jual|belian|beli|invois|invoice|order|pesanan/i.test(norm)) return [
      { fieldKey: 'bil', headerLabel: 'Bil.', inputType: 'NUMBER' },
      { fieldKey: 'perkara', headerLabel: 'Perkara', inputType: 'TEXT' },
      { fieldKey: 'kuantiti', headerLabel: 'Kuantiti', inputType: 'NUMBER' },
      { fieldKey: 'harga', headerLabel: 'Harga (RM)', inputType: 'NUMBER' },
      { fieldKey: 'jumlah', headerLabel: 'Jumlah (RM)', inputType: 'NUMBER' }
    ]
    if (/ulasan|remark|nota|notulen|rumusan|summary/i.test(norm)) return [
      { fieldKey: 'bil', headerLabel: 'Bil.', inputType: 'NUMBER' },
      { fieldKey: 'topik', headerLabel: 'Topik', inputType: 'TEXT' },
      { fieldKey: 'keterangan', headerLabel: 'Keterangan', inputType: 'TEXTAREA' },
      { fieldKey: 'oleh', headerLabel: 'Oleh', inputType: 'TEXT' }
    ]
    if (/items?|barang|stok|produk|product|inventori|inventory/i.test(norm)) return [
      { fieldKey: 'bil', headerLabel: 'Bil.', inputType: 'NUMBER' },
      { fieldKey: 'name', headerLabel: 'Nama Item', inputType: 'TEXT' },
      { fieldKey: 'sku', headerLabel: 'SKU/Kod', inputType: 'TEXT' },
      { fieldKey: 'qty', headerLabel: 'Kuantiti', inputType: 'NUMBER' }
    ]
    return [
      { fieldKey: 'bil', headerLabel: 'Bil.', inputType: 'NUMBER' },
      { fieldKey: 'perkara', headerLabel: 'Perkara', inputType: 'TEXT' },
      { fieldKey: 'nota', headerLabel: 'Nota', inputType: 'TEXTAREA' }
    ]
  })()

  let defaultTableSchema = null
  if (inputType === 'TABLE') {
    defaultTableSchema = colSchemaFromName
  }
  let defaultRepeaterSchema = null
  if (inputType === 'REPEATER') {
    defaultRepeaterSchema = {
      rows: [
        { key: 'item_name', label: 'Item Name', type: 'TEXT' },
        { key: 'item_details', label: 'Details', type: 'TEXTAREA' }
      ]
    }
  }

  const fieldKey = name.replace(/[\s\-]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase()
  const fieldLabel = humanize(name.toLowerCase().replace(/_/g, ' '))

  return {
    fieldKey: fieldKey.length ? fieldKey : `FIELD_${(sortOrderIdx + 1).toString().padStart(3, '0')}`,
    fieldLabel: fieldLabel.length ? fieldLabel : `Field ${sortOrderIdx + 1}`,
    fieldHelpText: null,
    inputType,
    smartTemplateSectionId: null,
    sortOrder: sortOrderIdx + 1,
    isMandatory: false,
    isEditableAuthor: true,
    isEditableReviewer: false,
    isVisibleInForm: true,
    isSearchable: false,
    isSupportingField: false,
    optionsJson: null,
    validationRulesJson: null,
    defaultValueJson: null,
    tableSchemaJson: defaultTableSchema,
    repeaterSchemaJson: defaultRepeaterSchema,
    imageConfigJson: null,
    attachmentConfigJson: null,
    systemFieldConfigJson: null
  }
}

const STD_STEP_REQUIRED = {
  0: { required: true },
  1: { required: true },
  2: { required: false },
  3: { required: true },
  4: { required: true },
  5: { required: false }
}

export default function SmartTemplateDesigner({ templateId, onBack, saveNotification, initialStep = 0, embedMode = false, createMode = false, onTemplateCreated }) {
  const [activeSubTab, setActiveSubTab] = useState(initialStep || 0)
  const [loading, setLoading] = useState(!createMode)
  const [loadingError, setLoadingError] = useState('')
  const [template, setTemplate] = useState(null)
  const [documentTypes, setDocumentTypes] = useState([])
  const [styleProfiles, setStyleProfiles] = useState([])
  const [errorModal, setErrorModal] = useState({ open: false, title: '', message: '' })
  const [stepSaving, setStepSaving] = useState(false)
  const generalFormRef = useRef(null)
  const formFieldsRef = useRef(null)
  const placeholderMapRef = useRef(null)
  const [createTemplateId, setCreateTemplateId] = useState(templateId || null)
  const [finalSuccessShown, setFinalSuccessShown] = useState(false)

  const effectiveTemplateId = createTemplateId || templateId
  const actualCreateMode = !!(createMode && !effectiveTemplateId)

  const currentStepLabel = SUBTABS[activeSubTab]?.label ?? ''
  const currentStepMeta = STD_STEP_REQUIRED[activeSubTab] || { required: false }

  useEffect(() => {
    if (actualCreateMode) return
    loadAll()
  }, [effectiveTemplateId, actualCreateMode])

  useEffect(() => {
    if (initialStep && initialStep > 0) setActiveSubTab(initialStep)
  }, [initialStep, effectiveTemplateId])

  useEffect(() => {
    if (actualCreateMode) loadDropdowns()
  }, [actualCreateMode])

  function showError(title, message) {
    setErrorModal({ open: true, title: title || 'Error', message: message || '' })
  }

  function handleFinishAndNotify() {
    if (!finalSuccessShown) {
      const message = actualCreateMode || createTemplateId
        ? 'Smart Template created successfully'
        : 'Smart Template saved successfully'
      if (saveNotification) toast(saveNotification, message, 'success')
      setFinalSuccessShown(true)
    }
    if (typeof onBack === 'function') onBack()
  }

  async function handleNext() {
    setErrorModal({ open: false, title: '', message: '' })
    let proceed = true
    try {
      if (activeSubTab === 0 && generalFormRef.current) {
        setStepSaving(true)
        try {
          if (actualCreateMode) {
            const validateRes = await generalFormRef.current.validateAndGetPayload?.()
            if (!validateRes || !validateRes.ok) {
              showError(validateRes?.errorTitle || 'Required fields are missing', validateRes?.errorMessage || 'Please complete required fields.')
              proceed = false
              return
            }
            const payload = validateRes.payload
            try {
              const res = await api.post('/smart-templates', payload)
              const created = res?.data?.data?.template ?? res?.data?.template ?? res?.data?.data ?? res?.data
              if (!created?.id) {
                showError('Create failed', 'Server did not return template ID.')
                proceed = false
                return
              }
              setCreateTemplateId(created.id)
              setTemplate({ ...created, versions: created.versions || [] })
              if (typeof onTemplateCreated === 'function') onTemplateCreated(created.id, created)
              setActiveSubTab(1)
              return
            } catch (err) {
              const msg = err?.response?.data?.message || err?.message || 'Failed to create template'
              showError('Create Operation Failed', msg)
              proceed = false
              return
            }
          } else {
            const result = await generalFormRef.current.validateAndSave()
            if (!result.ok) {
              showError(result.errorTitle, result.errorMessage)
              proceed = false
              return
            }
          }
        } finally {
          setStepSaving(false)
        }
      }
      if (activeSubTab === 1) {
        const versionCount = Array.isArray(template?.versions) ? template.versions.length : 0
        if (versionCount === 0) {
          showError(
            'At least one version is required',
            'Before proceeding to Sections / Form Fields, please create or upload at least one template version on the Versions step.\n\nClick "+ Create Version" or "Upload DOCX" to begin.'
          )
          proceed = false
          return
        }
      }
      if (activeSubTab === 3 && formFieldsRef.current) {
        const tpl = actualCreateMode ? (template || {}) : template
        const curVer = resolveActiveVersion(tpl?.versions || [])
        const hasAnyFields = (curVer?.formFields?.length ?? 0) > 0
        if (!hasAnyFields) {
          showError(
            'Form Fields are required (Step 4)',
            'Define at least one Smart Form Field in Step 4 (Form Fields) before proceeding to Placeholder Mapping.\n\nTip: Click "Auto-Generate Fields + Map" for one-click field creation from all DOCX placeholders.'
          )
          proceed = false
          return
        }
        setStepSaving(true)
        try {
          const result = await formFieldsRef.current.validateAndSave?.()
          if (result && result.ok === false) {
            showError(result.errorTitle || 'Form Fields validation failed', result.errorMessage || 'Please correct the highlighted fields.')
            proceed = false
            return
          }
          await reloadTemplateLight()
        } catch (err) {
          const msg = err?.response?.data?.message || err?.message || 'Form Fields save failed'
          showError('Form Fields save error', msg)
          proceed = false
          return
        } finally {
          setStepSaving(false)
        }
      }
      if (activeSubTab === 4 && placeholderMapRef.current) {
        const tplBefore = actualCreateMode ? (template || {}) : template
        const curVerBefore = resolveActiveVersion(tplBefore?.versions || [])
        const fieldsCountBefore = (curVerBefore?.formFields?.length ?? 0)
        if (fieldsCountBefore === 0) {
          showError(
            'No Form Fields — go back to Step 4',
            'You must define Smart Form Fields in Step 4 (Form Fields) before doing Placeholder Mapping in Step 5.'
          )
          proceed = false
          return
        }
        setStepSaving(true)
        try {
          const result = await placeholderMapRef.current.validateAndSave?.()
          if (result && result.ok === false) {
            showError(result.errorTitle || 'Placeholder Mapping save failed', result.errorMessage || 'Please correct the highlighted mappings.')
            proceed = false
            return
          }
          let freshRaw = null
          try {
            const id = effectiveTemplateId
            if (id) {
              const freshTRes = await api.get(`/smart-templates/${id}`)
              freshRaw = freshTRes?.data?.data?.template ?? freshTRes?.data?.template ?? freshTRes?.data?.data ?? freshTRes?.data
              if (freshRaw && typeof freshRaw === 'object' && freshRaw.id) {
                setTemplate(freshRaw)
              }
            }
          } catch (_reloadErr) {
            console.warn('handleNext inline reload failed, fallback to cached', _reloadErr?.response?.data?.message || _reloadErr?.message)
          }
          const tplAfter = (freshRaw && typeof freshRaw === 'object' && freshRaw.id)
            ? freshRaw
            : (actualCreateMode ? (template || {}) : template)
          const curVerAfter = resolveActiveVersion(tplAfter?.versions || [])
          const allFieldsArr = Array.isArray(curVerAfter?.formFields) ? curVerAfter.formFields : []
          const allFields = allFieldsArr.length
          const fieldsRequiringMapping = allFieldsArr.filter((f) => isIndividualMappingRequired(f))
          const mappedRequiredFields = fieldsRequiringMapping.length
          const allFieldMappings = Array.isArray(curVerAfter?.fieldMappings) ? curVerAfter.fieldMappings : []
          const mappedFieldIds = new Set(
            allFieldMappings
              .filter((m) => !isSystemReservedPlaceholder(m?.placeholderName || m?.placeholder || ''))
              .map((m) => {
                const v = m?.smartFormFieldId
                return v === undefined || v === null ? '' : String(v)
              })
              .filter(Boolean)
          )
          const requiredFieldsActuallyMapped = fieldsRequiringMapping.filter((f) => {
            const fid = (f.id !== undefined && f.id !== null) ? String(f.id) : String(f._cid || ('__key_' + String(f.fieldKey || Math.random())))
            return mappedFieldIds.has(fid)
          }).length
          const mappingsCount = allFieldMappings.length
          const exemptCount = allFields - mappedRequiredFields
          if (mappedRequiredFields > 0 && requiredFieldsActuallyMapped < mappedRequiredFields) {
            const missingList = fieldsRequiringMapping
              .filter((f) => {
                const fid = (f.id !== undefined && f.id !== null) ? String(f.id) : String(f._cid || ('__key_' + String(f.fieldKey || Math.random())))
                return !mappedFieldIds.has(fid)
              })
              .slice(0, 8)
              .map((f, i) => `  ${i + 1}. ${f.fieldKey} — ${f.fieldLabel || '(no label)'} [${f.inputType || '?'}]`)
              .join('\n')
            const missingCount = mappedRequiredFields - requiredFieldsActuallyMapped
            showError(
              'Placeholder Mapping incomplete — required fields not mapped',
              `You have ${mappedRequiredFields} Smart Form Fields requiring individual DOCX mapping (excluding ${exemptCount} fields: Supporting-only or conditional-dependent fields that auto-render via {{supporting_data}}) but only ${requiredFieldsActuallyMapped} of them are actually connected to a placeholder. ${missingCount} field(s) still missing:\n\n${missingList}${missingCount > 8 ? `\n  ...and ${missingCount - 8} more.` : ''}\n\nTip: Toggle "Supporting" = ON for any conditional/child fields (SUP column in Form Fields) to exclude them from 1:1 mapping — those fields will auto-render as a table where {{supporting_data}} appears in your DOCX. Or click "Auto Map" in Step 5.`
            )
            proceed = false
            return
          }
        } catch (outerErr) {
          const msg = outerErr?.response?.data?.message || outerErr?.message || 'Next step operation failed'
          showError('Navigation error', msg)
          proceed = false
        } finally {
          setStepSaving(false)
        }
      }
    } catch (outerErr) {
      const msg = outerErr?.response?.data?.message || outerErr?.message || 'Next step operation failed'
      showError('Navigation error', msg)
      proceed = false
    }
    if (proceed) setActiveSubTab(activeSubTab + 1)
  }

  async function handleAutoGenerateFields(notifyCb) {
    const tmpl = displayTemplate
    const currentVersion = resolveActiveVersion(tmpl.versions || [])
    if (!currentVersion || !currentVersion.id) {
      if (notifyCb) notifyCb('Create or select a version first', 'warning')
      return { ok: false, error: 'No version' }
    }
    let placeholders = []
    try {
      const phRes = await api.get(`/smart-templates/versions/${currentVersion.id}/placeholders`)
      const dataPayload = phRes?.data?.data
      placeholders = Array.isArray(dataPayload) ? dataPayload
        : Array.isArray(dataPayload?.placeholders) ? dataPayload.placeholders
        : Array.isArray(phRes?.data?.placeholders) ? phRes.data.placeholders
        : []
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load placeholders'
      if (notifyCb) notifyCb(msg, 'error')
      return { ok: false, error: msg }
    }
    if (!placeholders.length) {
      if (notifyCb) notifyCb('No placeholders extracted yet — upload a DOCX in the Versions step first.', 'warning')
      return { ok: false, error: 'No placeholders' }
    }
    const existingFields = [...(currentVersion.formFields || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const alreadyKeys = new Set(existingFields.map(f => String(f.fieldKey || '').trim().toUpperCase()).filter(Boolean))
    const newFields = []
    placeholders.forEach((p, i) => {
      const rawName = getName(p)
      const normalizedSysName = String(rawName || '').trim().replace(/^[\{\{\s]+|[\s\}\}]+$/g, '').toLowerCase().replace(/[_\-]+/g, '_')
      const SYSTEM_RESERVED_PLACEHOLDERS = new Set(['supporting_data'])
      if (SYSTEM_RESERVED_PLACEHOLDERS.has(normalizedSysName)) {
        return
      }
      const generated = inferFieldFromPlaceholder(p, i + existingFields.length + newFields.length)
      if (alreadyKeys.has(String(generated.fieldKey).toUpperCase())) return
      alreadyKeys.add(String(generated.fieldKey).toUpperCase())
      newFields.push(generated)
    })
    if (!newFields.length && existingFields.length > 0) {
      if (notifyCb) notifyCb(`All ${placeholders.length} placeholders already have matching Form Fields by key. ${existingFields.length} fields exist.`, 'info')
      return { ok: true, skipped: true }
    }
    const payload = {
      fields: [
        ...existingFields.map((f) => ({
          id: f.id,
          fieldKey: f.fieldKey,
          fieldLabel: f.fieldLabel,
          fieldHelpText: f.fieldHelpText !== undefined ? f.fieldHelpText : (f.helpText || null),
          placeholderHint: f.placeholderHint !== undefined ? (f.placeholderHint || null) : null,
          inputType: f.inputType,
          smartTemplateSectionId: f.smartTemplateSectionId ?? (f.sectionId ? Number(f.sectionId) : null),
          sortOrder: Number(f.sortOrder ?? 0),
          isMandatory: !!f.isMandatory,
          isEditableAuthor: !!f.isEditableAuthor,
          isEditableReviewer: !!f.isEditableReviewer,
          isVisibleInForm: !!f.isVisibleInForm,
          isVisibleInPreview: f.isVisibleInPreview !== undefined ? Boolean(f.isVisibleInPreview) : true,
          isSearchable: !!f.isSearchable,
          isSupportingField: !!f.isSupportingField,
          optionsJson: tryParseJson(f.optionsJson, null),
          validationRulesJson: tryParseJson(f.validationRulesJson, null),
          defaultValueJson: tryParseJson(f.defaultValueJson, null),
          tableSchemaJson: tryParseJson(f.tableSchemaJson, null),
          repeaterSchemaJson: tryParseJson(f.repeaterSchemaJson, null),
          imageConfigJson: tryParseJson(f.imageConfigJson, null),
          attachmentConfigJson: tryParseJson(f.attachmentConfigJson, null),
          systemFieldConfigJson: tryParseJson(f.systemFieldConfigJson, null),
          visibilityRulesJson: tryParseJson(f.visibilityRulesJson, null)
        })),
        ...newFields
      ]
    }
    try {
      const res = await api.put(`/smart-templates/versions/${currentVersion.id}/fields`, payload)
      const savedFields = Array.isArray(res?.data?.data?.fields) ? res.data.data.fields
        : Array.isArray(res?.data?.fields) ? res.data.fields : []
      if (notifyCb) notifyCb(`Generated ${newFields.length} new Form Fields from DOCX placeholders. Saved ${payload.fields.length} total fields. — Proceed to Step 5 (Placeholder Mapping) for auto-matching.`, 'success')
      await loadAll()
      return { ok: true, generated: newFields.length, savedFields }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Generate fields failed'
      if (notifyCb) notifyCb(msg, 'error')
      return { ok: false, error: msg }
    }
  }

  async function loadDropdowns() {
    try {
      const [dtRes, spRes] = await Promise.all([
        api.get('/system/config/document-types').catch(() => ({ data: { data: { documentTypes: [] } } })),
        api.get('/smart-document-style').catch(() => ({ data: { data: [] } }))
      ])
      const docTypesPayload = (() => {
        const nested = dtRes?.data?.data?.documentTypes
        if (Array.isArray(nested)) return nested
        const flat = dtRes?.data?.documentTypes
        if (Array.isArray(flat)) return flat
        if (Array.isArray(dtRes?.data?.data)) return dtRes.data.data
        if (Array.isArray(dtRes?.data)) return dtRes.data
        return []
      })()
      setDocumentTypes(docTypesPayload)
      const stylePayload = (() => {
        if (Array.isArray(spRes?.data?.data?.styleProfiles)) return spRes.data.data.styleProfiles
        if (Array.isArray(spRes?.data?.styleProfiles)) return spRes.data.styleProfiles
        if (Array.isArray(spRes?.data?.data)) return spRes.data.data
        if (Array.isArray(spRes?.data)) return spRes.data
        return []
      })()
      setStyleProfiles(stylePayload)
    } catch (_err) { /* ignore */ }
  }

  async function loadAll() {
    setLoading(true)
    setLoadingError('')
    try {
      const id = effectiveTemplateId
      const [tRes] = await Promise.all([
        api.get(`/smart-templates/${id}`),
        loadDropdowns()
      ])
      const rawTemplate = tRes?.data?.data?.template ?? tRes?.data?.template ?? tRes?.data?.data ?? tRes?.data
      setTemplate(rawTemplate && typeof rawTemplate === 'object' && rawTemplate.id ? rawTemplate : null)
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load template'
      setLoadingError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function reloadTemplateLight() {
    try {
      const id = effectiveTemplateId
      if (!id) return
      const tRes = await api.get(`/smart-templates/${id}`)
      const rawTemplate = tRes?.data?.data?.template ?? tRes?.data?.template ?? tRes?.data?.data ?? tRes?.data
      if (rawTemplate && typeof rawTemplate === 'object' && rawTemplate.id) {
        setTemplate(rawTemplate)
      }
    } catch (err) {
      console.warn('reloadTemplateLight failed (non-fatal, fallback to cached)', err?.response?.data?.message || err?.message)
    }
  }

  const displayTemplate = actualCreateMode ? (template || { id: null, templateName: '', templateCode: '', documentTypeId: '', styleProfileId: '', isActive: true, includeRevisionInDoc: false, includeFileCodeInDoc: false, includePreparedBy: false, includeDates: false, versions: [] }) : template

  const STORAGE_KEY_VERSION = effectiveTemplateId
    ? `dms:smpl:ver:${String(effectiveTemplateId)}`
    : null

  const [activeDesignVersionId, setActiveDesignVersionId] = useState(() => {
    if (!STORAGE_KEY_VERSION) return null
    try {
      const raw = localStorage.getItem(STORAGE_KEY_VERSION)
      return raw ? Number(raw) || null : null
    } catch { return null }
  })

  useEffect(() => {
    if (!STORAGE_KEY_VERSION) return
    if (activeDesignVersionId == null) {
      try { localStorage.removeItem(STORAGE_KEY_VERSION) } catch {}
    } else {
      try { localStorage.setItem(STORAGE_KEY_VERSION, String(activeDesignVersionId)) } catch {}
    }
  }, [STORAGE_KEY_VERSION, activeDesignVersionId])

  function resolveActiveVersion(versionsOrNull) {
    const versions = Array.isArray(versionsOrNull) ? versionsOrNull : []
    if (versions.length === 0) return null
    if (activeDesignVersionId) {
      const needle = String(activeDesignVersionId)
      const exact = versions.find(v => String(v.id) === needle)
      if (exact) return exact
      const fallback = versions.find(v => v.isCurrent) || versions[0]
      return fallback
    }
    return versions.find(v => v.isCurrent) || versions[0] || null
  }

  useEffect(() => {
    if (activeDesignVersionId) {
      const versions = Array.isArray(displayTemplate?.versions) ? displayTemplate.versions : []
      const stillExists = versions.some(v => String(v.id) === String(activeDesignVersionId))
      if (!stillExists) {
        setActiveDesignVersionId(null)
        if (STORAGE_KEY_VERSION) { try { localStorage.removeItem(STORAGE_KEY_VERSION) } catch {} }
      }
    }
  }, [displayTemplate?.versions])

  const currentVersion = resolveActiveVersion(displayTemplate?.versions || [])

  function stepHasData(idx) {
    if (idx === 0) return !!displayTemplate?.id || actualCreateMode
    if (idx === 1) return (displayTemplate?.versions?.length ?? 0) > 0
    if (idx === 2) return (currentVersion?.sections?.length ?? 0) > 0
    if (idx === 3) return (currentVersion?.formFields?.length ?? 0) > 0
    if (idx === 4) {
      const allFieldMappings = Array.isArray(currentVersion?.fieldMappings) ? currentVersion.fieldMappings : []
      const mappedFieldIds = new Set(
        allFieldMappings
          .filter((m) => !isSystemReservedPlaceholder(m?.placeholderName || m?.placeholder || ''))
          .map((m) => {
            const v = m?.smartFormFieldId
            return v === undefined || v === null ? '' : String(v)
          })
          .filter(Boolean)
      )
      const fieldsRequiringMapping = (currentVersion?.formFields || []).filter((f) => isIndividualMappingRequired(f))
      const requiredFieldCount = fieldsRequiringMapping.length
      const actuallyMappedCount = fieldsRequiringMapping.filter((f) => {
        const fid = (f.id !== undefined && f.id !== null) ? String(f.id) : String(f._cid || ('__key_' + String(f.fieldKey || Math.random())))
        return mappedFieldIds.has(fid)
      }).length
      return requiredFieldCount === 0 || (requiredFieldCount > 0 && actuallyMappedCount >= requiredFieldCount)
    }
    if (idx === 5) return true
    return true
  }

  if (loading && !actualCreateMode) {
    const content = (
      <div className="flex items-center justify-center py-24">
        <InlineSpinner className="h-8 w-8 border-gray-200 border-t-blue-600" />
        <span className="ml-3 text-sm text-gray-500">Loading template designer...</span>
      </div>
    )
    if (embedMode) return content
    return <PageContainer>{content}</PageContainer>
  }

  if (actualCreateMode && !loadingError) {
    // proceed with empty displayTemplate
  } else if (loadingError || !displayTemplate) {
    const content = (
      <div className="py-10 text-center">
        <p className="text-sm text-red-600">{loadingError || 'Template not found.'}</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={onBack}>← Back to Templates</Button>
        </div>
      </div>
    )
    if (embedMode) return content
    return <PageContainer><AppSurface>{content}</AppSurface></PageContainer>
  }

  const stepIndicator = (
    <div className="w-full mt-1 px-4">
      <div className="relative">
        <ol className="flex items-start justify-between gap-2">
          {SUBTABS.map((tab, idx) => {
            const isActive = idx === activeSubTab
            const req = !!STD_STEP_REQUIRED[idx]?.required
            const visitedOk = idx < activeSubTab
            const dataOk = !req || stepHasData(idx)
            const isCompleted = visitedOk && dataOk
            const isStaleIncomplete = visitedOk && !dataOk
            const canClickBack = isCompleted || idx < activeSubTab
            const showConnector = idx < SUBTABS.length - 1
            const nextReq = !!STD_STEP_REQUIRED[idx + 1]?.required
            const nextDataOk = !nextReq || stepHasData(idx + 1)
            const nextIsAfter = idx + 1 < activeSubTab
            const bothCompleted = isCompleted && nextIsAfter && nextDataOk
            const nextIsActiveNow = idx + 1 === activeSubTab
            let connectorColor = 'bg-gray-200'
            if (bothCompleted) connectorColor = 'bg-green-600'
            else if (isCompleted || nextIsActiveNow || isActive) connectorColor = 'bg-[#003366]'
            return (
              <li key={tab.id} className="flex items-start flex-1 relative min-w-0">
                <div
                  className="flex flex-col items-center gap-2 w-full min-w-0 z-10 relative"
                  onClick={() => { if (canClickBack) setActiveSubTab(idx) }}
                  role={canClickBack ? 'button' : undefined}
                  tabIndex={canClickBack ? 0 : -1}
                  onKeyDown={(e) => { if (canClickBack && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setActiveSubTab(idx) } }}
                  style={{ cursor: canClickBack ? 'pointer' : 'default' }}
                >
                  <div
                    className={[
                      'w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all shrink-0 shadow-sm',
                      isCompleted
                        ? 'bg-green-600 border-green-600 text-white hover:brightness-105'
                        : isActive
                        ? 'bg-[#003366] border-[#003366] text-white shadow ring-4 ring-[#003366]/10'
                        : isStaleIncomplete
                        ? 'bg-amber-50 border-amber-400 text-amber-700'
                        : 'bg-white border-gray-200 text-gray-500',
                      canClickBack ? 'hover:scale-105' : ''
                    ].join(' ')}
                    title={canClickBack ? `Go back to ${tab.label}` : undefined}
                  >
                    {isCompleted ? (
                      <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1 text-center min-w-0 w-full">
                    <span
                      className={[
                        'text-[11.5px] font-medium leading-snug break-words w-full',
                        isActive ? 'text-gray-900' : isCompleted ? 'text-gray-800' : isStaleIncomplete ? 'text-amber-700' : 'text-gray-500',
                        canClickBack ? 'hover:text-[#003366] hover:underline decoration-dotted' : ''
                      ].join(' ')}
                    >
                      {tab.label}
                    </span>
                    {isActive && (
                      <span
                        className={[
                          'text-[10px] font-semibold tracking-wide whitespace-nowrap',
                          req ? 'text-red-600' : 'text-gray-500'
                        ].join(' ')}
                      >
                        {req ? 'Required *' : 'Optional'}
                      </span>
                    )}
                    {isStaleIncomplete && !isActive && (
                      <span className="text-[10px] font-semibold tracking-wide whitespace-nowrap text-amber-700">
                        Needs data
                      </span>
                    )}
                  </div>
                </div>
                {showConnector && (
                  <div
                    aria-hidden="true"
                    className={[
                      'absolute top-[18px] h-[3px] rounded-full transition-all duration-300',
                      'left-[calc(50%+18px)] right-[calc(-50%+18px)]',
                      connectorColor
                    ].join(' ')}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </div>
      <p className="text-center text-[11px] text-gray-500 mt-3 tabular-nums tracking-wide">
        Step {activeSubTab + 1} of {SUBTABS.length}
      </p>
    </div>
  )

  const stepContent = (
    <div className="space-y-6 min-h-[400px]">
      {activeDesignVersionId && currentVersion && !currentVersion.isCurrent && (
        <div className="rounded-lg border border-sky-300 bg-gradient-to-r from-sky-50 to-indigo-50 px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 mt-0.5">
              <svg className="h-5 w-5 text-sky-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sky-900 leading-snug">
                Viewing / editing a non-current version: <span className="font-extrabold">v{currentVersion.versionNo}</span>
                {currentVersion.versionLabel ? ` · ${currentVersion.versionLabel}` : ''}
              </p>
              <p className="text-[11.5px] text-sky-700 mt-0.5 leading-snug">
                Form Fields, Sections & Placeholder Mapping below will load data from this specific version, not the published current one. To switch back to the default Current version, click the button →
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setActiveDesignVersionId(null)}
            className="shrink-0 border-sky-400 text-sky-900 hover:bg-sky-100"
          >
            ← Back to Current Version
          </Button>
        </div>
      )}
      {currentVersion && currentVersion.isLocked && (
        <div className="rounded-lg border border-red-300 bg-gradient-to-r from-red-50 to-rose-50 px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 mt-0.5">
              <svg className="h-5 w-5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-900 leading-snug">
                ⛔ This version <span className="font-extrabold">v{currentVersion.versionNo}</span> is LOCKED (PUBLISHED) — ALL SAVE BUTTONS ARE DISABLED
              </p>
              <p className="text-[11.5px] text-red-700 mt-0.5 leading-snug">
                Published versions cannot be modified to preserve document history & integrity for audit trail. To make changes & save edits, create an editable draft copy of this version.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button
              type="button"
              size="sm"
              variant="warning"
              onClick={async () => {
                const versionId = currentVersion.id
                const versionsList = (displayTemplate?.versions || []).sort((a, b) => (Number(a.versionNo || 0) - Number(b.versionNo || 0)))
                const ok = window.confirm(
                  `Create editable DRAFT copy from locked published version v${currentVersion.versionNo}?\n\nThe existing v${currentVersion.versionNo} history is preserved. A new draft version will be created with all data copied so you may save edits.`
                )
                if (!ok) return
                try {
                  const nextNo = versionsList.length ? Number(versionsList[versionsList.length - 1].versionNo || 0) + 1 : 1
                  const payload = {
                    versionNo: String(nextNo),
                    versionLabel: '',
                    changeNotes: currentVersion.versionLabel
                      ? `Auto-cloned from locked published v${currentVersion.versionNo} (${currentVersion.versionLabel}).`
                      : `Auto-cloned from locked published v${currentVersion.versionNo}.`,
                    copyFromVersionId: versionId
                  }
                  const res = await api.post(`/smart-templates/${displayTemplate.id}/versions`, payload)
                  const newVerId = res?.data?.data?.id || res?.data?.id || null
                  notify(`Editable draft copy created (v${nextNo})`, 'success')
                  await onReload()
                  setActiveDesignVersionId(newVerId || null)
                } catch (err) {
                  const msg = err?.response?.data?.message || err?.message || 'Clone failed'
                  notify('Clone to editable draft failed: ' + msg, 'danger')
                }
              }}
            >
              ➕ Clone as New Draft & Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setActiveDesignVersionId(null)}
              className="border-red-200 text-red-900 hover:bg-red-100"
            >
              ← Back to versions list
            </Button>
          </div>
        </div>
      )}
      {activeSubTab === 0 && (
        <GeneralTab
          template={displayTemplate} setTemplate={setTemplate}
          documentTypes={documentTypes} styleProfiles={styleProfiles}
          formRef={generalFormRef}
          createMode={actualCreateMode}
        />
      )}
      {activeSubTab === 1 && (
        <VersionsTab
          template={displayTemplate} setTemplate={setTemplate}
          onReload={loadAll}
          notify={(m, t) => toast(saveNotification, m, t)}
          activeDesignVersionId={activeDesignVersionId}
          onDesignVersion={(versionId, jumpToStep = 3) => {
            setActiveDesignVersionId(versionId)
            if (typeof jumpToStep === 'number' && jumpToStep >= 0 && jumpToStep < 6) {
              setActiveSubTab(jumpToStep)
            }
          }}
        />
      )}
      {activeSubTab === 2 && (
        <SectionsTab
          template={displayTemplate} setTemplate={setTemplate}
          onReload={loadAll}
          notify={(m, t) => toast(saveNotification, m, t)}
          activeDesignVersionId={activeDesignVersionId}
        />
      )}
      {activeSubTab === 3 && (
        <FormFieldsTab
          ref={formFieldsRef}
          template={displayTemplate} setTemplate={setTemplate}
          onReload={loadAll}
          notify={(m, t) => toast(saveNotification, m, t)}
          onAutoGenerateFields={handleAutoGenerateFields}
          activeDesignVersionId={activeDesignVersionId}
        />
      )}
      {activeSubTab === 4 && (
        <PlaceholderMappingTab
          ref={placeholderMapRef}
          template={displayTemplate} setTemplate={setTemplate}
          onReload={loadAll}
          notify={(m, t) => toast(saveNotification, m, t)}
          activeDesignVersionId={activeDesignVersionId}
        />
      )}
      {activeSubTab === 5 && (
        <PreviewTab template={displayTemplate} notify={(m, t) => toast(saveNotification, m, t)} activeDesignVersionId={activeDesignVersionId} />
      )}
    </div>
  )

  const stepFooter = (
    <div className="flex items-center justify-between w-full">
      <div>
        {activeSubTab > 0 ? (
          <Button type="button" variant="secondary" onClick={() => setActiveSubTab(activeSubTab - 1)}>Back</Button>
        ) : (
          <Button type="button" variant="secondary" onClick={onBack}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Exit Designer
          </Button>
        )}
      </div>
      {activeSubTab < 5 ? (
        <Button type="button" variant="primary" loading={stepSaving} onClick={handleNext}>Next</Button>
      ) : (
        <Button type="button" variant="primary" onClick={handleFinishAndNotify}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Finish & Return to List
        </Button>
      )}
    </div>
  )

  const errorModalEl = (
    errorModal.open && (
      <Modal onClose={() => setErrorModal({ open: false, title: '', message: '' })} size="md">
        <ModalHeader
          title={errorModal.title}
          onClose={() => setErrorModal({ open: false, title: '', message: '' })}
        />
        <ModalBody>
          <div className="flex items-start gap-4">
            <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-lg bg-red-50 border border-red-200">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{errorModal.message}</p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={() => setErrorModal({ open: false, title: '', message: '' })}>Close</Button>
        </ModalFooter>
      </Modal>
    )
  )

  if (embedMode) {
    return (
      <>
        <ModalBody className="flex flex-col gap-0 p-0 h-full min-h-0">
          <div className="shrink-0 px-6 pt-5 pb-4 border-b border-gray-200 bg-gray-50/40">
            {stepIndicator}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5">
            {stepContent}
          </div>
        </ModalBody>
        <ModalFooter className="flex items-center justify-between shrink-0">
          <div>
            {activeSubTab > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setActiveSubTab(activeSubTab - 1)}>Back</Button>
            ) : (
              <Button type="button" variant="secondary" onClick={onBack}>Cancel</Button>
            )}
          </div>
          {activeSubTab < 5 ? (
            <Button type="button" variant="primary" loading={stepSaving} onClick={handleNext}>Next</Button>
          ) : (
            <Button type="button" variant="primary" onClick={handleFinishAndNotify}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Finish & Return to List
            </Button>
          )}
        </ModalFooter>
        {errorModalEl}
      </>
    )
  }

  return (
    <PageContainer className="space-y-5">
      <PageHeader
        title={template.templateName || 'Untitled Template'}
        subtitle={
          <span>
            <span className="font-mono text-xs">{template.templateCode || '—'}</span>
            <span className="mx-2 text-gray-400">·</span>
            <span className="text-gray-500">ID: {template.id}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onBack}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Back to List
            </Button>
          </div>
        }
      />

      <AppSurface padding="none" className="overflow-hidden h-[calc(100vh-220px)] max-h-[calc(100vh-220px)] flex flex-col">
        <div className="shrink-0 px-5 md:px-8 pt-5 pb-4 border-b border-gray-200 bg-gray-50/40">
          {stepIndicator}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-5 md:p-6">
          {stepContent}
        </div>
        <div className="shrink-0 flex items-center justify-between px-5 md:px-6 py-4 border-t border-gray-200 bg-gray-50/30">
          {stepFooter}
        </div>
      </AppSurface>
      {errorModalEl}
    </PageContainer>
  )
}

/* ======================= TAB 0: GENERAL ======================= */
function GeneralTab({ template, setTemplate, documentTypes, styleProfiles, formRef, createMode = false }) {
  const [form, setForm] = useState(() => ({ ...template }))

  useEffect(() => { setForm({ ...template }) }, [template?.id, createMode])

  const hasLockedVersion = useMemo(() => {
    if (createMode) return false
    return Array.isArray(template.versions) && template.versions.length > 0 && template.versions.some((v) => v.isLocked)
  }, [template.versions, createMode])

  function validateRequired() {
    const missing = []
    if (!form.templateName?.trim()) missing.push('Template Name')
    if (!form.templateCode?.trim()) missing.push('Template Code')
    if (!form.documentTypeId || form.documentTypeId === '') missing.push('Document Type')
    if (missing.length) {
      return {
        ok: false,
        errorTitle: 'Required fields are missing',
        errorMessage: `Please complete the following required fields:\n- ${missing.join('\n- ')}\n\nFields marked with * are required.`
      }
    }
    return { ok: true }
  }

  function buildPayload() {
    const payload = { ...form }
    if (!payload.styleProfileId) delete payload.styleProfileId
    delete payload.versions; delete payload.sections; delete payload.formFields
    delete payload.fieldMappings; delete payload.styleProfile; delete payload.createdAt; delete payload.updatedAt
    delete payload.id
    return payload
  }

  if (formRef) {
    formRef.current = {
      validateAndGetPayload: async () => {
        const v = validateRequired()
        if (!v.ok) return v
        try {
          const payload = buildPayload()
          return { ok: true, payload }
        } catch (err) {
          return { ok: false, errorTitle: 'Validation error', errorMessage: String(err?.message || err) }
        }
      },
      validateAndSave: async () => {
        const v = validateRequired()
        if (!v.ok) return v
        try {
          const payload = buildPayload()
          const res = await api.put(`/smart-templates/${template.id}`, payload)
          const updated = res?.data?.data?.template ?? res?.data?.template ?? res?.data?.data ?? res?.data
          setTemplate({ ...template, ...updated })
          return { ok: true, successMessage: 'General settings saved' }
        } catch (err) {
          const msg = err?.response?.data?.message || err?.message || 'Save failed'
          return { ok: false, errorTitle: 'Save failed', errorMessage: msg }
        }
      }
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <SectionHeader title="General Template Settings" subtitle="" />

      <p className="text-xs text-gray-500">Fields marked with <span className="text-red-600 font-semibold">*</span> are required.</p>

      {hasLockedVersion && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This template has one or more <strong>published / locked versions</strong>. Some fields may be restricted by the server.
        </div>
      )}

      <div className="space-y-5">
        <p className="text-xs font-semibold text-gray-900 tracking-wide uppercase">Basic</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Template Name <span className="text-red-600">*</span></label>
            <TextInput
              value={form.templateName || ''}
              onChange={(e) => setForm({ ...form, templateName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Template Code <span className="text-red-600">*</span></label>
            <TextInput
              value={form.templateCode || ''}
              onChange={(e) => setForm({ ...form, templateCode: e.target.value.toUpperCase() })}
              className="font-mono"
            />
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <p className="text-xs font-semibold text-gray-900 tracking-wide uppercase">Options</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Document Type <span className="text-red-600">*</span></label>
            <SelectField
              value={form.documentTypeId || ''}
              onChange={(e) => setForm({ ...form, documentTypeId: e.target.value })}
            >
              <option value="">— Not linked —</option>
              {(Array.isArray(documentTypes) ? documentTypes : []).map((dt) => (
                <option key={dt.id} value={dt.id}>{dt.typeName || dt.name}</option>
              ))}
            </SelectField>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Style Profile</label>
            <SelectField
              value={form.styleProfileId || ''}
              onChange={(e) => setForm({ ...form, styleProfileId: e.target.value })}
            >
              <option value="">— Default —</option>
              {(Array.isArray(styleProfiles) ? styleProfiles : []).filter((s) => s.isActive !== false).map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.profileName}{sp.isDefault ? ' (Default)' : ''}</option>
              ))}
            </SelectField>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-xs font-semibold text-gray-900 tracking-wide uppercase">Output</p>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
              checked={!!form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span className="text-sm text-gray-900">Template is Active</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
              checked={!!form.includeRevisionInDoc}
              onChange={(e) => setForm({ ...form, includeRevisionInDoc: e.target.checked })} />
            <span className="text-sm text-gray-900">Include Revision #</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
              checked={!!form.includeFileCodeInDoc}
              onChange={(e) => setForm({ ...form, includeFileCodeInDoc: e.target.checked })} />
            <span className="text-sm text-gray-900">Include File Code</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
              checked={!!form.includePreparedBy}
              onChange={(e) => setForm({ ...form, includePreparedBy: e.target.checked })} />
            <span className="text-sm text-gray-900">Include Prepared By</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
              checked={!!form.includeDates}
              onChange={(e) => setForm({ ...form, includeDates: e.target.checked })} />
            <span className="text-sm text-gray-900">Include Date Blocks</span>
          </label>
        </div>
      </div>
    </div>
  )
}

/* ======================= TAB 1: VERSIONS ======================= */
function VersionsTab({ template, setTemplate, onReload, notify, activeDesignVersionId = null, onDesignVersion }) {
  const versions = useMemo(() => {
    const list = [...(template.versions || [])]
    list.sort((a, b) => {
      const na = Number(a.versionNo || 0); const nb = Number(b.versionNo || 0)
      if (na !== nb) return na - nb
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    })
    return list
  }, [template.versions])

  const currentVersion = versions.find((v) => v.isCurrent) || null
  const activeId = activeDesignVersionId ? String(activeDesignVersionId) : null
  const viewingVersion = activeId ? (versions.find(v => String(v.id) === activeId) || null) : currentVersion

  const [uploadModal, setUploadModal] = useState(null)
  const [uploadSaving, setUploadSaving] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef(null)

  const [createModal, setCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ versionNo: '', versionLabel: '', changeNotes: '', copyFromVersionId: '' })
  const [createError, setCreateError] = useState('')
  const [createSaving, setCreateSaving] = useState(false)

  const [publishTarget, setPublishTarget] = useState(null)

  const [viewPhTarget, setViewPhTarget] = useState(null)
  const [viewPhList, setViewPhList] = useState([])
  const [viewPhLoading, setViewPhLoading] = useState(false)

  const { itemsPerPage } = usePreferences()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(itemsPerPage || 10)
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  useEffect(() => {
    setPageSize(itemsPerPage || 10)
  }, [itemsPerPage])

  const versionColumns = [
    {
      id: 'versionNo',
      key: 'versionNo',
      accessor: 'versionNo',
      label: 'Version',
      sortable: true,
      required: true,
      render: (value, row) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-gray-900">v{value}</span>
          {row.isCurrent && <Pill variant="success">Current</Pill>}
          {activeId === String(row.id) && <Pill variant="primary">Designing now</Pill>}
        </div>
      )
    },
    {
      id: 'versionLabel',
      key: 'versionLabel',
      accessor: (row) => row.versionLabel || row.changeNotes || '',
      label: 'Label',
      sortable: true,
      render: (value, row) => (
        <div className="space-y-1">
          {row.versionLabel && <span className="text-sm font-medium text-gray-700">{row.versionLabel}</span>}
          {row.changeNotes && <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-2">{row.changeNotes}</p>}
          {!row.versionLabel && !row.changeNotes && <span className="text-gray-400">—</span>}
        </div>
      )
    },
    {
      id: 'status',
      key: 'status',
      accessor: (row) => (row.isLocked ? 'published' : 'draft'),
      label: 'Status',
      sortable: true,
      render: (_v, row) => (
        row.isLocked
          ? <Pill variant="info">Published / Locked</Pill>
          : <Pill variant="warning">Draft</Pill>
      )
    },
    {
      id: 'createdBy',
      key: 'createdBy',
      accessor: (row) => row.createdById || row.publishedById || '',
      label: 'Created By',
      sortable: true,
      render: (value) => value ? <span className="text-sm text-gray-700">ID: {value}</span> : <span className="text-gray-400">—</span>
    },
    {
      id: 'createdAt',
      key: 'createdAt',
      accessor: 'createdAt',
      label: 'Created At',
      sortable: true,
      sortType: 'date',
      sortComparer: (a, b) => new Date(a || 0) - new Date(b || 0),
      render: (value) => <span className="text-xs text-gray-500">{formatDate(value)}</span>
    },
    {
      id: 'actions',
      key: 'actions',
      accessor: '__actions',
      label: 'Actions',
      required: true,
      align: 'right',
      stickyRight: true,
      render: (_v, row) => (
        <ActionMenu
          actions={[
            { label: activeId === String(row.id) ? 'Designing' : 'Design', onClick: () => onDesignVersion && onDesignVersion(row.id, 3), disabled: !!row.isLocked || !onDesignVersion },
            { label: 'View Placeholders', onClick: () => openViewPlaceholders(row) },
            { label: 'Upload DOCX', onClick: () => openUpload(row), disabled: !!row.isLocked },
            { label: 'Publish', onClick: () => setPublishTarget(row), disabled: !!row.isLocked }
          ]}
        />
      )
    }
  ]

  const tableFeatures = useTableFeatures({
    tableId: 'smart-template-designer-versions',
    columns: versionColumns,
    data: versions,
    defaultSortKey: 'versionNo',
    defaultSortDirection: 'asc'
  })

  const {
    sortedData,
    visibleColumns,
    orderedColumns,
    getSortDirectionFor,
    toggleSort,
    moveColumn,
    hiddenColumns,
    toggleColumnVisibility,
    resetTableSettings
  } = tableFeatures

  useEffect(() => {
    setCurrentPage(1)
  }, [template.versions])

  const totalRecords = sortedData.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pageItems = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const handleColDragStart = (idx, e) => {
    const col = visibleColumns[idx]
    if (!col || col.stickyRight) { e.preventDefault(); return }
    setDragColIndex(idx)
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)) } catch {}
  }
  const handleColDragOver = (idx, e) => {
    e.preventDefault()
    const col = visibleColumns[idx]
    if (!col || col.stickyRight) return
    setDragOverColIndex(idx)
  }
  const handleColDragLeave = () => setDragOverColIndex(null)
  const handleColDrop = (toIdx, e) => {
    e.preventDefault()
    const fromIdx = dragColIndex
    setDragColIndex(null)
    setDragOverColIndex(null)
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return
    const fromId = visibleColumns[fromIdx]?.id
    const toId = visibleColumns[toIdx]?.id
    if (!fromId || !toId) return
    const globalFrom = orderedColumns.findIndex((c) => c.id === fromId)
    const globalTo = orderedColumns.findIndex((c) => c.id === toId)
    if (globalFrom >= 0 && globalTo >= 0) moveColumn(globalFrom, globalTo)
  }
  const handleColDragEnd = () => { setDragColIndex(null); setDragOverColIndex(null) }

  async function openUpload(v) {
    setUploadModal(v)
    setUploadResult(null)
    setUploadError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function openViewPlaceholders(v) {
    if (!v?.id) {
      notify('No version selected', 'danger')
      return
    }
    setViewPhTarget(v)
    setViewPhList([])
    setViewPhLoading(true)
    try {
      const res = await api.get(`/smart-templates/versions/${v.id}/placeholders`)
      const dataPayload = res?.data?.data
      const list = Array.isArray(dataPayload) ? dataPayload
        : Array.isArray(dataPayload?.placeholders) ? dataPayload.placeholders
        : Array.isArray(res?.data?.placeholders) ? res.data.placeholders
        : []
      setViewPhList(list)
    } catch (err) {
      notify('Failed to load placeholders: ' + (err?.response?.data?.message || err?.message), 'danger')
      setViewPhTarget(null)
    } finally {
      setViewPhLoading(false)
    }
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!uploadModal) return
    const file = fileInputRef.current?.files?.[0]
    if (!file) { setUploadError('Please select a .docx file'); return }
    if (!/\.docx$/i.test(file.name)) { setUploadError('Only .docx files are supported'); return }
    setUploadSaving(true); setUploadError(''); setUploadResult(null)
    try {
      const fd = new FormData()
      fd.append('templateFile', file)
      const res = await api.post(`/smart-templates/versions/${uploadModal.id}/upload`, fd)
      const ph = res?.data?.data?.placeholders || res?.data?.placeholders
      const count = Array.isArray(ph) ? ph.length : (typeof ph === 'number' ? ph : 0)
      setUploadResult({ count, placeholderList: Array.isArray(ph) ? ph : null })
      notify(`DOCX uploaded (${count} placeholders extracted)`, 'success')
      await onReload()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Upload failed'
      setUploadError(msg)
    } finally {
      setUploadSaving(false)
    }
  }

  async function handleCreateVersion(e) {
    e.preventDefault()
    setCreateError('')
    if (!createForm.versionNo) { setCreateError('Version number is required'); return }
    setCreateSaving(true)
    try {
      const payload = {
        versionNo: createForm.versionNo,
        versionLabel: createForm.versionLabel || undefined,
        changeNotes: createForm.changeNotes || undefined,
        copyFromVersionId: createForm.copyFromVersionId || undefined
      }
      await api.post(`/smart-templates/${template.id}/versions`, payload)
      setCreateModal(false)
      notify('New version created', 'success')
      await onReload()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Create failed'
      setCreateError(msg)
    } finally {
      setCreateSaving(false)
    }
  }

  async function handlePublish(v) {
    try {
      await api.post(`/smart-templates/${template.id}/versions/${v.id}/publish`)
      notify(`Version ${v.versionNo} published successfully`, 'success')
      setPublishTarget(null)
      await onReload()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Publish failed'
      alert(msg)
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Template Versions"
        subtitle="Upload DOCX to extract placeholders, create new versions, and publish to lock them for use."
        actions={
          <Button onClick={() => {
            const nextNo = versions.length ? Number(versions[versions.length - 1].versionNo || 0) + 1 : 1
            setCreateForm({ versionNo: String(nextNo), versionLabel: '', changeNotes: '', copyFromVersionId: '' })
            setCreateError('')
            setCreateModal(true)
          }}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Create New Version
          </Button>
        }
      />

      <div className="flex items-center justify-end gap-3">
        <ColumnSettingsButton
          orderedColumns={orderedColumns}
          hiddenColumns={hiddenColumns}
          onToggleColumn={toggleColumnVisibility}
          onReset={resetTableSettings}
        />
      </div>

      {sortedData.length === 0 ? (
        <EmptyPanelState
          title="No versions yet"
          description="Create your first template version, then upload a DOCX file to extract placeholders for mapping."
        />
      ) : (
        <>
          <TableContainer>
            <Table>
              <thead>
                <Tr>
                  {visibleColumns.map((col, idx) => {
                    const id = col.id || col.key
                    const canDrag = !col.stickyRight
                    const isDragOver = canDrag && dragOverColIndex === idx
                    return (
                      <Th
                        key={id}
                        align={col.align || 'left'}
                        stickyRight={col.stickyRight || false}
                        sortable={Boolean(col.sortable)}
                        sortDirection={getSortDirectionFor(id)}
                        sortKey={id}
                        onSort={col.sortable ? toggleSort : undefined}
                        draggable={canDrag}
                        dragOver={isDragOver}
                        onDragStart={(e) => handleColDragStart(idx, e)}
                        onDragOver={(e) => handleColDragOver(idx, e)}
                        onDragLeave={handleColDragLeave}
                        onDrop={(e) => handleColDrop(idx, e)}
                        onDragEnd={handleColDragEnd}
                        title={canDrag ? 'Click to sort • Drag to reorder' : col.sortable ? 'Click to sort' : undefined}
                      >
                        {col.label || col.header || id}
                      </Th>
                    )
                  })}
                </Tr>
              </thead>
              <tbody>
                {pageItems.map((v) => (
                  <Tr key={v.id}>
                    {visibleColumns.map((col) => {
                      const id = col.id || col.key || col.accessor
                      const accessor = col.accessor || id
                      let value
                      if (typeof accessor === 'function') {
                        value = accessor(v, col)
                      } else if (accessor === '__actions') {
                        value = null
                      } else {
                        value = v?.[accessor]
                      }
                      const content = typeof col.render === 'function' ? col.render(value, v) : (value != null ? value : '')
                      return (
                        <Td
                          key={id}
                          align={col.align || 'left'}
                          stickyRight={col.stickyRight || false}
                          className={col.stickyRight ? 'py-3' : ''}
                        >
                          {content}
                        </Td>
                      )
                    })}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalRecords}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
          />
        </>
      )}

      {uploadModal && (
        <Modal onClose={() => setUploadModal(null)} size="md">
          <ModalHeader
            title={`Upload DOCX · v${uploadModal.versionNo}`}
            subtitle={uploadModal.versionLabel || ''}
            onClose={() => setUploadModal(null)}
          />
          <form onSubmit={handleUpload}>
            <ModalBody className="space-y-4">
              {uploadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{uploadError}</div>
              )}
              {uploadResult && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Successfully extracted <strong>{uploadResult.count}</strong> placeholder{uploadResult.count === 1 ? '' : 's'} from the DOCX file.
                  {Array.isArray(uploadResult.placeholderList) && uploadResult.placeholderList.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-white/60 border border-emerald-200 p-2 text-xs font-mono space-y-0.5">
                      {uploadResult.placeholderList.slice(0, 50).map((p, i) => {
                        const name = typeof p === 'string' ? p : (p.placeholderName || p.name || JSON.stringify(p))
                        return <div key={i} className="text-gray-700">• {name}</div>
                      })}
                      {uploadResult.placeholderList.length > 50 && <div className="text-gray-500">...and {uploadResult.placeholderList.length - 50} more</div>}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">DOCX Template File *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx"
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-200 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366]"
                />
                <p className="mt-1 text-xs text-gray-500">Only .docx files supported. Placeholders use format {'{{PlaceholderName}}'}.</p>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="secondary" onClick={() => setUploadModal(null)} disabled={uploadSaving}>Close</Button>
              <Button type="submit" loading={uploadSaving}>Upload & Extract</Button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {createModal && (
        <Modal onClose={() => setCreateModal(false)} size="md">
          <ModalHeader title="Create New Version" subtitle="Optionally copy sections, fields, and mappings from an existing version." onClose={() => setCreateModal(false)} />
          <form onSubmit={handleCreateVersion}>
            <ModalBody className="space-y-4">
              {createError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{createError}</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Version Number *</label>
                  <TextInput
                    value={createForm.versionNo}
                    onChange={(e) => setCreateForm({ ...createForm, versionNo: e.target.value })}
                    placeholder="e.g. 2 or 2.1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Version Label</label>
                  <TextInput
                    value={createForm.versionLabel}
                    onChange={(e) => setCreateForm({ ...createForm, versionLabel: e.target.value })}
                    placeholder="e.g. Initial Release"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Change Notes</label>
                <TextArea rows={3}
                  value={createForm.changeNotes}
                  onChange={(e) => setCreateForm({ ...createForm, changeNotes: e.target.value })}
                  placeholder="Describe what changed in this version..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Copy From Existing Version (optional)</label>
                <SelectField
                  value={createForm.copyFromVersionId}
                  onChange={(e) => setCreateForm({ ...createForm, copyFromVersionId: e.target.value })}
                >
                  <option value="">— Start Blank —</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>v{v.versionNo}{v.versionLabel ? ` · ${v.versionLabel}` : ''}</option>
                  ))}
                </SelectField>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateModal(false)} disabled={createSaving}>Cancel</Button>
              <Button type="submit" loading={createSaving}>Create Version</Button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {publishTarget && (
        <Modal onClose={() => setPublishTarget(null)} size="md">
          <ModalHeader title={`Publish v${publishTarget.versionNo}?`} subtitle={publishTarget.versionLabel || ''} onClose={() => setPublishTarget(null)} />
          <ModalBody className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold mb-1">This action is permanent and cannot be undone.</p>
              <p>Once published, this version cannot be edited. Published documents using this version will retain formatting permanently.</p>
              <p className="mt-2">A formatting snapshot will be captured and the version will be marked locked.</p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setPublishTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => handlePublish(publishTarget)}>Confirm Publish</Button>
          </ModalFooter>
        </Modal>
      )}

      {viewPhTarget && (
        <Modal onClose={() => setViewPhTarget(null)} size="lg">
          <ModalHeader
            title={`Extracted Placeholders · v${viewPhTarget.versionNo}`}
            subtitle={viewPhTarget.versionLabel ? viewPhTarget.versionLabel : `Template file path: ${viewPhTarget.templateFilePath || '— Upload DOCX first —'}`}
            onClose={() => setViewPhTarget(null)}
          />
          <ModalBody className="space-y-4">
            {viewPhLoading ? (
              <div className="py-6 text-center text-sm text-gray-500">
                <InlineSpinner className="h-5 w-5 inline mr-2 align-middle border-gray-200 border-t-blue-600" />Loading placeholders...
              </div>
            ) : viewPhList.length === 0 ? (
              <EmptyPanelState
                title="No placeholders found in this version"
                description={"Upload a .docx file containing {{PlaceholderName}} tags in the Versions tab to extract placeholders."}
              />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <span>Total extracted: <strong className="text-gray-900">{viewPhList.length}</strong></span>
                  <span>Convention: use <code className="font-mono px-1 rounded bg-white/70 border border-gray-200">{'{{fieldName}}'}</code> syntax inside your DOCX headers, footers or body.</span>
                </div>
                {(() => {
                  const groups = {}
                  viewPhList.forEach((p) => {
                    const ctx = typeof p === 'string' ? 'SIMPLE' : (p.contextInferred || 'SIMPLE')
                    groups[ctx] = groups[ctx] || []
                    groups[ctx].push(p)
                  })
                  function _n(p) { return getName(p) }
                  return Object.entries(groups).map(([ctx, list]) => (
                    <div key={ctx}>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">{ctx} <span className="font-normal normal-case ml-1 text-gray-500">({list.length})</span></p>
                      <TableContainer>
                        <Table>
                          <thead>
                            <Tr>
                              <Th style={{ width: 48 }}>#</Th>
                              <Th>Placeholder Name</Th>
                              <Th style={{ width: 120 }}>Location</Th>
                            </Tr>
                          </thead>
                          <tbody>
                            {list.map((p, i) => {
                              const name = _n(p)
                              const loc = typeof p !== 'string' && p.location ? p.location : (
                                ctx === 'TABLE_ROW' ? 'Word table row (loop)'
                                : ctx === 'REPEATED' ? 'Repeated section group'
                                : 'Body / Header / Footer'
                              )
                              return (
                                <Tr key={i}>
                                  <Td align="center" className="text-gray-500 font-mono text-xs">{i + 1}</Td>
                                  <Td>
                                    <div className="font-mono text-xs text-gray-900">{toPlaceholderTag(p)}</div>
                                  </Td>
                                  <Td className="text-xs text-gray-700">{loc}</Td>
                                </Tr>
                              )
                            })}
                          </tbody>
                        </Table>
                      </TableContainer>
                    </div>
                  ))
                })()}
                <details>
                  <summary className="text-[11px] font-semibold text-gray-500 cursor-pointer">Copy raw JSON list</summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white/60 p-2 text-[11px] font-mono text-gray-700">{safeJsonStringify(viewPhList.map((p) => typeof p === 'string' ? p : { name: p.placeholderName || p.name, context: p.contextInferred }))}</pre>
                </details>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setViewPhTarget(null)}>Close</Button>
            {!viewPhLoading && viewPhList.length > 0 && (
              <Button onClick={() => {
                const raw = viewPhList.map((p) => typeof p === 'string' ? p : (p.placeholderName || p.name || ''))
                const text = raw.join('\n')
                try {
                  navigator.clipboard.writeText(text)
                  notify(`Copied ${raw.length} placeholder names to clipboard`, 'success')
                } catch {
                  notify('Clipboard not available', 'warning')
                }
              }}>
                Copy Names List
              </Button>
            )}
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}

/* ======================= TAB 2: SECTIONS ======================= */
function SectionsTab({ template, setTemplate, onReload, notify, activeDesignVersionId = null }) {
  const versions = template.versions || []
  const exactVersion = activeDesignVersionId ? versions.find((v) => String(v.id) === String(activeDesignVersionId)) : null
  const currentVersion = exactVersion || (versions.find((v) => v.isCurrent) || versions[0] || null)

  const [sections, setSections] = useState([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ sectionKey: '', title: '', description: '', parentSectionId: '', sortOrder: '', isSystemSection: false })
  const [addError, setAddError] = useState('')

  useEffect(() => {
    if (currentVersion) {
      const list = [...(currentVersion.sections || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      setSections(list.map((s) => ({ ...s, _dirty: false })))
      setDirty(false)
    }
  }, [currentVersion?.id])

  function updateSection(id, patch) {
    setSections((list) => list.map((s) => (s.id === id || s._cid === id ? { ...s, ...patch, _dirty: true } : s)))
    setDirty(true)
  }

  function removeSection(id) {
    setSections((list) => list.filter((s) => !(s.id === id || s._cid === id)))
    setDirty(true)
  }

  function moveSection(id, dir) {
    setSections((list) => {
      const idx = list.findIndex((s) => s.id === id || s._cid === id)
      if (idx < 0) return list
      const ni = idx + dir
      if (ni < 0 || ni >= list.length) return list
      const copy = [...list]
      ;[copy[idx], copy[ni]] = [copy[ni], copy[idx]]
      return copy.map((s, i) => ({ ...s, sortOrder: i + 1, _dirty: true }))
    })
    setDirty(true)
  }

  function openAdd() {
    const nextOrder = sections.length + 1
    setAddForm({ sectionKey: '', title: '', description: '', parentSectionId: '', sortOrder: String(nextOrder), isSystemSection: false })
    setAddError('')
    setAddOpen(true)
  }

  function handleAddSubmit(e) {
    e.preventDefault()
    setAddError('')
    if (!addForm.sectionKey.trim() || !addForm.title.trim()) {
      setAddError('Section Key and Title are required'); return
    }
    const exists = sections.some((s) => s.sectionKey === addForm.sectionKey.trim())
    if (exists) { setAddError('Section Key must be unique'); return }
    const newS = {
      _cid: 'new_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      sectionKey: addForm.sectionKey.trim(),
      title: addForm.title.trim(),
      description: addForm.description.trim(),
      parentSectionId: addForm.parentSectionId || null,
      sortOrder: Number(addForm.sortOrder || sections.length + 1),
      isSystemSection: !!addForm.isSystemSection,
      _dirty: true
    }
    setSections((l) => [...l, newS])
    setDirty(true)
    setAddOpen(false)
  }

  async function handleSaveAll() {
    if (!currentVersion) { alert('Create a version first.'); return }
    setError(''); setSaving(true)
    try {
      const payload = {
        sections: sections.map((s) => ({
          id: s.id,
          sectionKey: s.sectionKey,
          title: s.title,
          description: s.description,
          sortOrder: Number(s.sortOrder ?? 0),
          parentSectionId: s.parentSectionId || null,
          isSystemSection: !!s.isSystemSection,
          layoutConfigJson: s.layoutConfigJson || null
        }))
      }
      await api.put(`/smart-templates/versions/${currentVersion.id}/sections`, payload)
      setDirty(false)
      notify('Sections saved', 'success')
      await onReload()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Save failed'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const parentOptions = sections.filter((s) => !s.parentSectionId)

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Sections"
        subtitle={currentVersion ? `Editing sections for ${currentVersion.isLocked ? '' : ''}v${currentVersion.versionNo}` : 'Create a version first to manage sections.'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={openAdd} disabled={!currentVersion || !!currentVersion.isLocked}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Section
            </Button>
            <Button onClick={handleSaveAll} loading={saving} disabled={!currentVersion || !!currentVersion.isLocked || (!dirty && !sections.some((s) => !s.id))}>
              {currentVersion?.isLocked ? '🔒 Locked (Clone Draft)' : 'Save All'}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">{error}</div>
      )}

      {!currentVersion ? (
        <EmptyPanelState title="No version selected" description="Go to Versions tab and create or set a current version first." />
      ) : sections.length === 0 ? (
        <EmptyPanelState
          title="No sections defined"
          description="Sections group form fields into logical parts. Start with sections like Header, Body, Conclusion."
        />
      ) : (
        <TableContainer>
          <Table>
            <thead>
              <Tr>
                <Th style={{ width: 50 }}></Th>
                <Th>Section Key</Th>
                <Th>Title</Th>
                <Th>Parent</Th>
                <Th align="center">System</Th>
                <Th align="center" style={{ width: 90 }}>Order</Th>
                <Th align="right" stickyRight>Actions</Th>
              </Tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const parent = sections.find((p) => (p.id || p._cid) === s.parentSectionId)
                return (
                  <Tr key={s.id || s._cid}>
                    <Td>
                      <div className="flex flex-col gap-0.5">
                        <button type="button" className="text-gray-400 hover:text-[#003366] transition-colors" onClick={() => moveSection(s.id || s._cid, -1)} title="Move up">▲</button>
                        <button type="button" className="text-gray-400 hover:text-[#003366] transition-colors" onClick={() => moveSection(s.id || s._cid, +1)} title="Move down">▼</button>
                      </div>
                    </Td>
                    <Td>
                      <TextInput
                        value={s.sectionKey || ''}
                        onChange={(e) => updateSection(s.id || s._cid, { sectionKey: e.target.value })}
                        className="font-mono text-xs"
                      />
                    </Td>
                    <Td>
                      <TextInput
                        value={s.title || ''}
                        onChange={(e) => updateSection(s.id || s._cid, { title: e.target.value })}
                      />
                    </Td>
                    <Td>
                      <SelectField
                        value={s.parentSectionId || ''}
                        onChange={(e) => updateSection(s.id || s._cid, { parentSectionId: e.target.value || null })}
                      >
                        <option value="">— Root —</option>
                        {parentOptions.filter((p) => (p.id || p._cid) !== (s.id || s._cid)).map((p) => (
                          <option key={p.id || p._cid} value={p.id || p._cid}>{p.title}</option>
                        ))}
                      </SelectField>
                    </Td>
                    <Td align="center">
                      <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        checked={!!s.isSystemSection}
                        onChange={(e) => updateSection(s.id || s._cid, { isSystemSection: e.target.checked })} />
                    </Td>
                    <Td align="center">
                      <TextInput type="number" className="w-20 text-center mx-auto"
                        value={s.sortOrder ?? ''}
                        onChange={(e) => updateSection(s.id || s._cid, { sortOrder: Number(e.target.value || 0) })}
                      />
                    </Td>
                    <Td align="right" stickyRight>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => removeSection(s.id || s._cid)}>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22" /></svg>
                      </Button>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        </TableContainer>
      )}

      {addOpen && (
        <Modal onClose={() => setAddOpen(false)} size="md">
          <ModalHeader title="Add Section" onClose={() => setAddOpen(false)} />
          <form onSubmit={handleAddSubmit}>
            <ModalBody className="space-y-4">
              {addError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{addError}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Section Key * (unique)</label>
                  <TextInput value={addForm.sectionKey} onChange={(e) => setAddForm({ ...addForm, sectionKey: e.target.value })} placeholder="e.g. HEADER_SECTION" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Title *</label>
                  <TextInput value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Description</label>
                <TextArea rows={2} value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Parent Section</label>
                  <SelectField value={addForm.parentSectionId} onChange={(e) => setAddForm({ ...addForm, parentSectionId: e.target.value })}>
                    <option value="">— Root Level —</option>
                    {parentOptions.map((p) => (
                      <option key={p.id || p._cid} value={p.id || p._cid}>{p.title}</option>
                    ))}
                  </SelectField>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Sort Order</label>
                  <TextInput type="number" value={addForm.sortOrder} onChange={(e) => setAddForm({ ...addForm, sortOrder: e.target.value })} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  checked={addForm.isSystemSection} onChange={(e) => setAddForm({ ...addForm, isSystemSection: e.target.checked })} />
                <span className="text-sm text-gray-700">System Section (not user-editable in forms)</span>
              </label>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit">Add Section</Button>
            </ModalFooter>
          </form>
        </Modal>
      )}
    </div>
  )
}

/* ======================= TAB 3: FORM FIELDS ======================= */
const FormFieldsTab = forwardRef(function FormFieldsTab({ template, setTemplate, onReload, notify, onAutoGenerateFields, activeDesignVersionId = null }, ref) {
  const versions = template.versions || []
  const exactVersion = activeDesignVersionId ? versions.find((v) => String(v.id) === String(activeDesignVersionId)) : null
  const currentVersion = exactVersion || (versions.find((v) => v.isCurrent) || versions[0] || null)

  const [fields, setFields] = useState([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState(/** @type {'idle'|'saving'|'saved'|'error'} */ ('idle'))
  const saveTimerRef = useRef(null)
  const saveLockRef = useRef(false)

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(null)
  const [addError, setAddError] = useState('')
  const [addAdvancedOpen, setAddAdvancedOpen] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [editCid, setEditCid] = useState(null)
  const [editError, setEditError] = useState('')
  const [editAdvancedOpen, setEditAdvancedOpen] = useState(false)

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [filterSearch, setFilterSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterFlags, setFilterFlags] = useState({ required: false, authorEdit: false, reviewerEdit: false, visible: false, searchable: false })
  const [bulkType, setBulkType] = useState('')
  const [bulkSection, setBulkSection] = useState('')
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkModalType, setBulkModalType] = useState(/** @type {'type'|'section'|'flags'|'delete'|null} */ (null))
  const [bulkFlagForm, setBulkFlagForm] = useState({ isMandatory: null, isEditableAuthor: null, isEditableReviewer: null, isVisibleInForm: null, isSearchable: null, isSupportingField: null })
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', onConfirm: null, confirmLabel: 'Confirm', cancelLabel: 'Cancel', variant: 'default' })

  const ai = useAI()
  const [aiSuggestOpen, setAiSuggestOpen] = useState(false)
  const [aiDocType, setAiDocType] = useState('')
  const [aiDocDesc, setAiDocDesc] = useState('')
  const [aiSuggestResult, setAiSuggestResult] = useState(null)
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false)

  useEffect(() => {
    ai.fetchConfig()
  }, [template?.id])

  const runAiSuggest = async () => {
    if (!aiDocType.trim() && !aiDocDesc.trim()) {
      alert('Please enter at least a Document Type or Description.')
      return
    }
    setAiSuggestLoading(true)
    setAiSuggestResult(null)
    try {
      const existingKeys = new Set(fields.map((f) => f.fieldKey))
      const existing = fields.map((f) => ({ fieldKey: f.fieldKey, name: f.fieldKey, type: f.inputType, label: f.fieldLabel }))
      const result = await ai.suggestFields({
        documentType: aiDocType.trim() || (template?.name ? String(template.name).replace(/[^A-Za-z0-9 ]/g, ' ') : 'General Document'),
        templateDescription: aiDocDesc.trim() || (template?.description ?? ''),
        existingFields: existing,
        fieldCount: 18,
      })
      if (result?.fields?.length) {
        result.fields = result.fields.filter((f) => !existingKeys.has(String(f.fieldKey || '').toUpperCase()))
      }
      setAiSuggestResult(result)
    } catch (err) {
      alert('AI Suggest failed: ' + err.message)
    } finally {
      setAiSuggestLoading(false)
    }
  }

  const applyAiSuggestFields = () => {
    if (!aiSuggestResult?.fields?.length) return
    const sectionsById = new Map()
    sections.forEach((s) => sectionsById.set(s.sectionName || s.name, s))
    const newFields = []
    let baseOrder = fields.length
    aiSuggestResult.fields.forEach((f) => {
      const fieldKey = String(f.fieldKey || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/__+/g, '_')
      if (!fieldKey) return
      if (fields.some((ex) => String(ex.fieldKey).toUpperCase() === fieldKey)) return
      const inputType = f.type || 'TEXT'
      let sectionId = null
      if (f.group) {
        const match = sections.get(f.group) || sections.get(String(f.group).toLowerCase())
        if (match) sectionId = match.id
      }
      let defaultVal = null
      if (inputType === 'CHECKBOX') defaultVal = false
      const optionsJson = Array.isArray(f.options) && f.options.length
        ? JSON.stringify(f.options.map((v) => ({ label: String(v), value: String(v) })))
        : null

      newFields.push({
        _cid: 'ai_' + Math.random().toString(36).slice(2, 10),
        _dirty: true,
        _expanded: false,
        fieldKey,
        fieldLabel: f.label || fieldKey.replace(/_/g, ' '),
        inputType,
        isMandatory: !!f.required,
        placeholder: f.placeholder || '',
        helpText: f.helpText || '',
        sortOrder: ++baseOrder,
        defaultValueJson: defaultVal,
        optionsJson,
        isEditableAuthor: true,
        isEditableReviewer: false,
        isVisibleInForm: true,
        isSearchable: false,
        isSupportingField: !!f.isSupportingField,
        smartTemplateSectionId: sectionId,
        sectionId,
      })
    })
    if (newFields.length === 0) {
      alert('No new unique fields to add. All suggested fields already exist.')
      return
    }
    setFields((prev) => [...prev, ...newFields])
    setDirty(true)
    setSaveStatus('dirty')
    notify(`Added ${newFields.length} AI-suggested field${newFields.length === 1 ? '' : 's'}. Remember to click Next or Save to persist.`, 'success')
    setAiSuggestOpen(false)
    setAiSuggestResult(null)
    setAiDocType('')
    setAiDocDesc('')
  }

  async function handleAutoGenerateClick() {
    if (!onAutoGenerateFields) return
    setGenerating(true)
    try {
      await onAutoGenerateFields(notify)
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    if (currentVersion) {
      const list = [...(currentVersion.formFields || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      setFields(list.map((f) => ({ ...f, _dirty: false, _expanded: false })))
      setDirty(false)
      setSaveStatus('saved')
      setFilterSearch('')
      setFilterType('')
      setFilterSection('')
      setFilterFlags({ required: false, authorEdit: false, reviewerEdit: false, visible: false, searchable: false })
    }
  }, [currentVersion?.id, currentVersion?.formFields?.length])

  useEffect(() => {
    if (dirty) setSaveStatus('dirty')
    else if (saveStatus !== 'saving' && saveStatus !== 'error') setSaveStatus('saved')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  const sections = useMemo(() => {
    if (!currentVersion) return []
    return [...(currentVersion.sections || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }, [currentVersion?.id])

  function updateField(cid, patch) {
    setFields((l) => l.map((f) => (f.id === cid || f._cid === cid ? { ...f, ...patch, _dirty: true } : f)))
    setDirty(true)
  }

  function removeField(cid) {
    setFields((l) => l.filter((f) => !(f.id === cid || f._cid === cid)))
    setDirty(true)
  }

  function addDependentForOption(controllerFieldKey, optionValue, optionLabel) {
    if (!controllerFieldKey || !optionValue) return

    if (editCid && editOpen) {
      const errs = checkJsonErrors(editForm)
      if (errs.length) { setEditError(errs.join('; ')); return }
      if (!editForm.fieldKey.trim() || !editForm.fieldLabel.trim()) {
        setEditError('Field Key and Label are required'); return
      }
      const duplicateCheck = fields.find((f) => {
        const fCid = f.id || f._cid
        return fCid !== editCid && f.fieldKey === editForm.fieldKey.trim()
      })
      if (duplicateCheck) {
        setEditError('Field Key must be unique'); return
      }
      const bulkType = editForm.inputType
      const patch = {
        fieldKey: editForm.fieldKey.trim(),
        fieldLabel: editForm.fieldLabel.trim(),
        fieldHelpText: editForm.helpText.trim() || null,
        helpText: editForm.helpText.trim() || null,
        inputType: bulkType,
        smartTemplateSectionId: editForm.sectionId ? Number(editForm.sectionId) || editForm.sectionId : null,
        sectionId: editForm.sectionId || null,
        sortOrder: Number(editForm.sortOrder || 0),
        isMandatory: !!editForm.isMandatory,
        isEditableAuthor: !!editForm.isEditableAuthor,
        isEditableReviewer: !!editForm.isEditableReviewer,
        isVisibleInForm: !!editForm.isVisibleInForm,
        isSearchable: !!editForm.isSearchable,
        isSupportingField: !!editForm.isSupportingField,
        optionsJson: ['DROPDOWN', 'SINGLE_SELECT', 'MULTI_SELECT'].includes(bulkType) ? (editForm.optionsJson || null) : null,
        validationRulesJson: editForm.validationRulesJson || null,
        defaultValueJson: editForm.defaultValueJson || null,
        tableSchemaJson: bulkType === 'TABLE' ? (editForm.tableSchemaJson || null) : null,
        repeaterSchemaJson: bulkType === 'REPEATER' ? (editForm.repeaterSchemaJson || null) : null,
        imageConfigJson: bulkType === 'IMAGE' ? (editForm.imageConfigJson || null) : null,
        attachmentConfigJson: bulkType === 'ATTACHMENT' ? (editForm.attachmentConfigJson || null) : null,
        systemFieldConfigJson: bulkType === 'SYSTEM_GENERATED' ? (editForm.systemFieldConfigJson || null) : null,
        visibilityRulesJson: editForm.visibilityRulesJson || null
      }
      updateField(editCid, patch)
      setEditError('')
    }

    const effKey = (editCid && editOpen && editForm.fieldKey ? editForm.fieldKey : controllerFieldKey).trim()
    if (!effKey) return

    const cleanLabel = String(optionLabel || optionValue).replace(/[^a-zA-Z0-9 ]/g, '').trim()
    const keyFromLabel = cleanLabel
      .split(/\s+/)
      .filter(Boolean)
      .map((w, idx) => idx === 0 ? w.toLowerCase() : (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join('') || String(optionValue)
    setAddForm({
      fieldKey: keyFromLabel + '_Detail',
      fieldLabel: (cleanLabel || optionValue) + ' — Additional Detail',
      helpText: `Appears when "${optionLabel || optionValue}" is selected in ${String(effKey).replace(/_/g, ' ')}.`,
      inputType: 'TEXT',
      sectionId: sections[0]?.id || sections[0]?._cid || '',
      sortOrder: String(fields.length + 1),
      isMandatory: false, isEditableAuthor: true, isEditableReviewer: false,
      isVisibleInForm: true, isSearchable: false, isSupportingField: true,
      optionsJson: '', validationRulesJson: '', defaultValueJson: '',
      tableSchemaJson: '', repeaterSchemaJson: '',
      imageConfigJson: '', attachmentConfigJson: '', systemFieldConfigJson: '',
      visibilityRulesJson: buildVisibilityRulesJson({
        enabled: true,
        match: 'ALL',
        rules: [{ fieldKey: effKey, operator: 'equals', value: String(optionValue) }]
      })
    })
    setAddError('')
    setAddAdvancedOpen(false)
    setEditOpen(false)
    setAddOpen(true)
  }

  function openAdd() {
    setAddForm({
      fieldKey: '', fieldLabel: '', helpText: '',
      inputType: 'TEXT', sectionId: sections[0]?.id || sections[0]?._cid || '',
      sortOrder: String(fields.length + 1),
      isMandatory: false, isEditableAuthor: true, isEditableReviewer: false,
      isVisibleInForm: true, isSearchable: false, isSupportingField: false,
      optionsJson: '', validationRulesJson: '', defaultValueJson: '',
      tableSchemaJson: '', repeaterSchemaJson: '',
      imageConfigJson: '', attachmentConfigJson: '', systemFieldConfigJson: '',
      visibilityRulesJson: ''
    })
    setAddError('')
    setAddAdvancedOpen(false)
    setAddOpen(true)
  }

  function openEdit(f) {
    const cid = f.id || f._cid
    setEditCid(cid)
    setEditForm({
      fieldKey: f.fieldKey || '',
      fieldLabel: f.fieldLabel || '',
      helpText: f.helpText || f.fieldHelpText || '',
      inputType: f.inputType || 'TEXT',
      sectionId: f.smartTemplateSectionId || f.sectionId || '',
      sortOrder: String(f.sortOrder ?? ''),
      isMandatory: !!f.isMandatory,
      isEditableAuthor: !!f.isEditableAuthor,
      isEditableReviewer: !!f.isEditableReviewer,
      isVisibleInForm: !!f.isVisibleInForm,
      isSearchable: !!f.isSearchable,
      isSupportingField: !!f.isSupportingField,
      optionsJson: safeJsonStringify(f.optionsJson),
      validationRulesJson: safeJsonStringify(f.validationRulesJson),
      defaultValueJson: safeJsonStringify(f.defaultValueJson),
      tableSchemaJson: safeJsonStringify(f.tableSchemaJson),
      repeaterSchemaJson: safeJsonStringify(f.repeaterSchemaJson),
      imageConfigJson: safeJsonStringify(f.imageConfigJson),
      attachmentConfigJson: safeJsonStringify(f.attachmentConfigJson),
      systemFieldConfigJson: safeJsonStringify(f.systemFieldConfigJson),
      visibilityRulesJson: safeJsonStringify(f.visibilityRulesJson)
    })
    setEditError('')
    setEditAdvancedOpen(false)
    setEditOpen(true)
  }

  function handleEditSubmit(e) {
    e.preventDefault()
    setEditError('')
    if (!editForm.fieldKey.trim() || !editForm.fieldLabel.trim()) {
      setEditError('Field Key and Label are required'); return
    }
    const duplicateCheck = fields.find((f) => {
      const fCid = f.id || f._cid
      return fCid !== editCid && f.fieldKey === editForm.fieldKey.trim()
    })
    if (duplicateCheck) {
      setEditError('Field Key must be unique'); return
    }
    const errs = checkJsonErrors(editForm)
    if (errs.length) { setEditError(errs.join('; ')); return }
    const bulkType = editForm.inputType
    const patch = {
      fieldKey: editForm.fieldKey.trim(),
      fieldLabel: editForm.fieldLabel.trim(),
      fieldHelpText: editForm.helpText.trim() || null,
      helpText: editForm.helpText.trim() || null,
      inputType: bulkType,
      smartTemplateSectionId: editForm.sectionId ? Number(editForm.sectionId) || editForm.sectionId : null,
      sectionId: editForm.sectionId || null,
      sortOrder: Number(editForm.sortOrder || 0),
      isMandatory: !!editForm.isMandatory,
      isEditableAuthor: !!editForm.isEditableAuthor,
      isEditableReviewer: !!editForm.isEditableReviewer,
      isVisibleInForm: !!editForm.isVisibleInForm,
      isSearchable: !!editForm.isSearchable,
      isSupportingField: !!editForm.isSupportingField,
      optionsJson: ['DROPDOWN', 'SINGLE_SELECT', 'MULTI_SELECT'].includes(bulkType) ? (editForm.optionsJson || null) : null,
      validationRulesJson: editForm.validationRulesJson || null,
      defaultValueJson: editForm.defaultValueJson || null,
      tableSchemaJson: bulkType === 'TABLE' ? (editForm.tableSchemaJson || null) : null,
      repeaterSchemaJson: bulkType === 'REPEATER' ? (editForm.repeaterSchemaJson || null) : null,
      imageConfigJson: bulkType === 'IMAGE' ? (editForm.imageConfigJson || null) : null,
      attachmentConfigJson: bulkType === 'ATTACHMENT' ? (editForm.attachmentConfigJson || null) : null,
      systemFieldConfigJson: bulkType === 'SYSTEM_GENERATED' ? (editForm.systemFieldConfigJson || null) : null,
      visibilityRulesJson: editForm.visibilityRulesJson || null
    }
    updateField(editCid, patch)
    setEditOpen(false)
  }

  const filteredFields = useMemo(() => {
    const search = filterSearch.trim().toLowerCase()
    let list = [...fields]
    if (search) {
      list = list.filter((f) =>
        (f.fieldKey || '').toLowerCase().includes(search) ||
        (f.fieldLabel || '').toLowerCase().includes(search)
      )
    }
    if (filterType) {
      list = list.filter((f) => f.inputType === filterType)
    }
    if (filterSection) {
      if (filterSection === '__none__') {
        list = list.filter((f) => {
          const sid = String(f.smartTemplateSectionId || f.sectionId || '')
          return sid === ''
        })
      } else {
        list = list.filter((f) => {
          const sid = String(f.smartTemplateSectionId || f.sectionId || '')
          return sid === String(filterSection)
        })
      }
    }
    if (filterFlags.required) list = list.filter((f) => !!f.isMandatory)
    if (filterFlags.authorEdit) list = list.filter((f) => !!f.isEditableAuthor)
    if (filterFlags.reviewerEdit) list = list.filter((f) => !!f.isEditableReviewer)
    if (filterFlags.visible) list = list.filter((f) => !!f.isVisibleInForm)
    if (filterFlags.searchable) list = list.filter((f) => !!f.isSearchable)
    return list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }, [fields, filterSearch, filterType, filterSection, filterFlags])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [currentVersion?.id])

  function toggleSelect(cid) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else next.add(cid)
      return next
    })
  }

  function toggleSelectAll() {
    const allCids = filteredFields.map((f) => f.id || f._cid)
    const allSelected = allCids.length > 0 && allCids.every((cid) => selectedIds.has(cid))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allCids))
    }
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return
    setConfirmModal({
      open: true,
      title: `Delete ${selectedIds.size} selected field${selectedIds.size === 1 ? '' : 's'}?`,
      message: (
        <>
          This will permanently remove <strong>{selectedIds.size}</strong> field{selectedIds.size === 1 ? '' : 's'}. This action cannot be undone once auto-save runs.
          <br />Any placeholder mappings referencing these fields may break.
        </>
      ),
      confirmLabel: 'Yes, Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: () => {
        setFields((l) => l.filter((f) => !selectedIds.has(f.id) && !selectedIds.has(f._cid)))
        setDirty(true)
        setSelectedIds(new Set())
      }
    })
  }

  function bulkSetFlag(flagKey, value) {
    if (selectedIds.size === 0) return
    setFields((l) => l.map((f) => {
      const cid = f.id || f._cid
      if (!selectedIds.has(cid)) return f
      return { ...f, [flagKey]: value, _dirty: true }
    }))
    setDirty(true)
  }

  function applyBulkType() {
    if (selectedIds.size === 0 || !bulkType) return
    const oldTypes = new Set()
    setFields((l) => l.map((f) => {
      const cid = f.id || f._cid
      if (!selectedIds.has(cid)) return f
      oldTypes.add(f.inputType || 'TEXT')
      let patch = { inputType: bulkType, _dirty: true }
      // Clear irrelevant JSON configs when switching types, to avoid stale schema data
      if (bulkType !== 'DROPDOWN') patch.optionsJson = null
      if (bulkType !== 'TABLE') patch.tableSchemaJson = null
      if (bulkType !== 'REPEATER') patch.repeaterSchemaJson = null
      if (bulkType !== 'IMAGE') patch.imageConfigJson = null
      if (bulkType !== 'ATTACHMENT') patch.attachmentConfigJson = null
      if (bulkType !== 'SYSTEM_GENERATED') patch.systemFieldConfigJson = null
      return { ...f, ...patch }
    }))
    setDirty(true)
    notify(`Updated Input Type → ${bulkType} for ${selectedIds.size} field(s)${oldTypes.size > 1 ? ' (cleared type-specific configs)' : ''}`, 'success')
    setBulkType('')
  }

  function applyBulkSection() {
    if (selectedIds.size === 0) return
    const sidVal = bulkSection === '' ? null : (isNaN(Number(bulkSection)) ? bulkSection : Number(bulkSection))
    setFields((l) => l.map((f) => {
      const cid = f.id || f._cid
      if (!selectedIds.has(cid)) return f
      return { ...f, smartTemplateSectionId: sidVal, sectionId: sidVal, _dirty: true }
    }))
    setDirty(true)
    const label = bulkSection === ''
      ? '— None (Uncategorized) —'
      : sections.find(s => String(s.id || s._cid) === String(bulkSection))?.title || sections.find(s => String(s.id || s._cid) === String(bulkSection))?.sectionKey || bulkSection
    notify(`Updated Section → ${label} for ${selectedIds.size} field(s)`, 'success')
    setBulkSection('')
  }

  function checkJsonErrors(f) {
    const errs = []
    const pairs = [
      ['optionsJson', f.optionsJson],
      ['validationRulesJson', f.validationRulesJson],
      ['defaultValueJson', f.defaultValueJson],
      ['tableSchemaJson', f.tableSchemaJson],
      ['repeaterSchemaJson', f.repeaterSchemaJson],
      ['imageConfigJson', f.imageConfigJson],
      ['attachmentConfigJson', f.attachmentConfigJson],
      ['systemFieldConfigJson', f.systemFieldConfigJson],
      ['visibilityRulesJson', f.visibilityRulesJson]
    ]
    for (const [k, v] of pairs) {
      if (v && typeof v === 'string' && v.trim()) {
        try { JSON.parse(v) } catch { errs.push(`${k} is invalid JSON`) }
      }
    }
    return errs
  }

  function handleAddSubmit(e) {
    e.preventDefault()
    setAddError('')
    if (!addForm.fieldKey.trim() || !addForm.fieldLabel.trim()) {
      setAddError('Field Key and Label are required'); return
    }
    if (fields.some((f) => f.fieldKey === addForm.fieldKey.trim())) {
      setAddError('Field Key must be unique'); return
    }
    const errs = checkJsonErrors(addForm)
    if (errs.length) { setAddError(errs.join('; ')); return }
    const addType = addForm.inputType
    const newF = {
      _cid: 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      fieldKey: addForm.fieldKey.trim(),
      fieldLabel: addForm.fieldLabel.trim(),
      helpText: addForm.helpText.trim(),
      inputType: addType,
      sectionId: addForm.sectionId || null,
      sortOrder: Number(addForm.sortOrder || fields.length + 1),
      isMandatory: !!addForm.isMandatory,
      isEditableAuthor: !!addForm.isEditableAuthor,
      isEditableReviewer: !!addForm.isEditableReviewer,
      isVisibleInForm: !!addForm.isVisibleInForm,
      isSearchable: !!addForm.isSearchable,
      isSupportingField: !!addForm.isSupportingField,
      optionsJson: ['DROPDOWN', 'SINGLE_SELECT', 'MULTI_SELECT'].includes(addType) ? (addForm.optionsJson || null) : null,
      validationRulesJson: addForm.validationRulesJson || null,
      defaultValueJson: addForm.defaultValueJson || null,
      tableSchemaJson: addType === 'TABLE' ? (addForm.tableSchemaJson || null) : null,
      repeaterSchemaJson: addType === 'REPEATER' ? (addForm.repeaterSchemaJson || null) : null,
      imageConfigJson: addType === 'IMAGE' ? (addForm.imageConfigJson || null) : null,
      attachmentConfigJson: addType === 'ATTACHMENT' ? (addForm.attachmentConfigJson || null) : null,
      systemFieldConfigJson: addType === 'SYSTEM_GENERATED' ? (addForm.systemFieldConfigJson || null) : null,
      visibilityRulesJson: addForm.visibilityRulesJson || null,
      _dirty: true, _expanded: true
    }
    setFields((l) => [...l, newF])
    setDirty(true)
    setAddOpen(false)
  }

  async function handleSaveAll() {
    const res = await validateAndSave()
    if (!res.ok) {
      notify(res.errorMessage || 'Save failed', 'error')
    } else if (res.successMessage) {
      notify(res.successMessage, 'success')
    }
  }

  async function validateAndSave() {
    if (!currentVersion) {
      return { ok: false, errorTitle: 'No version selected', errorMessage: 'Create or select a version in the Versions tab before defining form fields.' }
    }
    if (currentVersion.isLocked) {
      return { ok: false, errorTitle: 'Version is locked (published)', errorMessage: 'This version v' + (currentVersion.versionNo || '') + ' is published / locked. You cannot modify form fields. Click "Clone as New Draft & Design" in the Versions tab to create an editable draft copy of this version, then edit the new draft copy.' }
    }
    const hasUnsaved = dirty || fields.some((f) => !f.id)
    if (!hasUnsaved) {
      return { ok: true, successMessage: '' }
    }
    setError(''); setSaving(true)
    try {
      for (const f of fields) {
        if (!f.fieldKey || !f.fieldKey.trim()) {
          return { ok: false, errorTitle: 'Missing Field Key', errorMessage: `Field at sort order ${f.sortOrder ?? ''} is missing a Field Key.` }
        }
        const errs = checkJsonErrors(f)
        if (errs.length) return { ok: false, errorTitle: 'Invalid JSON in Field', errorMessage: `Field "${f.fieldKey}": ${errs.join('; ')}` }
      }
      const seenKeys = new Map()
      let firstDuplicate = null
      for (const f of fields) {
        const k = String(f.fieldKey || '').trim().toUpperCase()
        if (!k) continue
        if (seenKeys.has(k)) { firstDuplicate = { key: k, firstAt: seenKeys.get(k), secondAt: f.fieldKey || f.fieldLabel }; break }
        seenKeys.set(k, f.fieldKey || f.fieldLabel)
      }
      if (firstDuplicate) {
        return {
          ok: false,
          errorTitle: 'Duplicate Field Key',
          errorMessage: `Field Key "${firstDuplicate.key}" appears more than once (case-insensitive match). First occurrence: "${firstDuplicate.firstAt}", second: "${firstDuplicate.secondAt}". Form Field Keys must be unique per version.`
        }
      }
      const payload = {
        fields: fields.map((f) => ({
          id: f.id,
          fieldKey: String(f.fieldKey || '').trim() || null,
          fieldLabel: f.fieldLabel,
          fieldHelpText: f.fieldHelpText !== undefined ? (f.fieldHelpText || null) : (f.helpText || null),
          placeholderHint: f.placeholderHint || null,
          inputType: f.inputType,
          smartTemplateSectionId: f.smartTemplateSectionId ?? (f.sectionId ? Number(f.sectionId) : null),
          sortOrder: Number(f.sortOrder ?? 0),
          isMandatory: !!f.isMandatory,
          isEditableAuthor: !!f.isEditableAuthor,
          isEditableReviewer: !!f.isEditableReviewer,
          isVisibleInForm: !!f.isVisibleInForm,
          isVisibleInPreview: f.isVisibleInPreview !== undefined ? Boolean(f.isVisibleInPreview) : true,
          isSearchable: !!f.isSearchable,
          isSupportingField: !!f.isSupportingField,
          optionsJson: tryParseJson(f.optionsJson, null),
          validationRulesJson: tryParseJson(f.validationRulesJson, null),
          defaultValueJson: tryParseJson(f.defaultValueJson, null),
          tableSchemaJson: tryParseJson(f.tableSchemaJson, null),
          repeaterSchemaJson: tryParseJson(f.repeaterSchemaJson, null),
          imageConfigJson: tryParseJson(f.imageConfigJson, null),
          attachmentConfigJson: tryParseJson(f.attachmentConfigJson, null),
          systemFieldConfigJson: tryParseJson(f.systemFieldConfigJson, null),
          visibilityRulesJson: tryParseJson(f.visibilityRulesJson, null)
        }))
      }
      await api.put(`/smart-templates/versions/${currentVersion.id}/fields`, payload)
      setDirty(false)
      await onReload()
      return { ok: true, successMessage: 'Form fields saved' }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Save failed'
      setError(msg)
      return { ok: false, errorTitle: 'Save failed', errorMessage: msg }
    } finally {
      setSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({
    validateAndSave
  }))

  const fieldsBySection = useMemo(() => {
    const m = {}
    fields.forEach((f) => {
      const sid = f.sectionId || '__none__'
      m[sid] = m[sid] || []
      m[sid].push(f)
    })
    return m
  }, [fields])

  const sectionNameMap = useMemo(() => {
    const m = {}
    sections.forEach((s) => { const k = s.id || s._cid; m[k] = s.title || s.sectionKey })
    return m
  }, [sections])

  function getTypeBadgeColor(t) {
    switch (t) {
      case 'TEXT': return 'bg-sky-50 text-sky-700 border-sky-200'
      case 'TEXTAREA': case 'RICH_TEXT': return 'bg-violet-50 text-violet-700 border-violet-200'
      case 'NUMBER': return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'DATE': case 'DATETIME': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'DROPDOWN': return 'bg-indigo-50 text-indigo-700 border-indigo-200'
      case 'CHECKBOX': return 'bg-orange-50 text-orange-700 border-orange-200'
      case 'USER_LOOKUP': return 'bg-cyan-50 text-cyan-700 border-cyan-200'
      case 'TABLE': return 'bg-rose-50 text-rose-700 border-rose-200'
      case 'IMAGE': case 'ATTACHMENT': return 'bg-pink-50 text-pink-700 border-pink-200'
      case 'REPEATER': return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'
      case 'SYSTEM_GENERATED': return 'bg-gray-100 text-gray-700 border-gray-300'
      default: return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  function FlagChip({ active, label, onTrue, onFalse }) {
    return (
      <button
        type="button"
        onClick={() => (active ? onFalse?.() : onTrue?.())}
        className={[
          'w-6 h-6 inline-flex items-center justify-center rounded border text-[10px] font-medium transition-colors',
          active
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
        ].join(' ')}
        title={label + (active ? ' (On — click to turn Off)' : ' (Off — click to turn On)')}
      >
        {active ? '✓' : '·'}
      </button>
    )
  }

  const allFilteredCids = filteredFields.map((f) => f.id || f._cid)
  const allSelected = allFilteredCids.length > 0 && allFilteredCids.every((cid) => selectedIds.has(cid))
  const someSelected = allFilteredCids.some((cid) => selectedIds.has(cid)) && !allSelected

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Form Fields"
        subtitle={currentVersion ? `Editing fields for v${currentVersion.versionNo}. ${fields.length} total field${fields.length === 1 ? '' : 's'}.` : 'Create a version first.'}
        actions={
          <div className="flex items-center gap-2 flex-nowrap justify-end">
            {saveStatus !== 'idle' && (
              <span className={[
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border flex-shrink-0',
                saveStatus === 'saving' ? 'bg-sky-50 text-sky-700 border-sky-200' : '',
                saveStatus === 'saved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : '',
                saveStatus === 'dirty' ? 'bg-amber-50 text-amber-700 border-amber-200' : '',
                saveStatus === 'error' ? 'bg-red-50 text-red-700 border-red-200' : ''
              ].filter(Boolean).join(' ')}>
                {saveStatus === 'saving' && <><svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg> Saving...</>}
                {saveStatus === 'saved' && <><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> Saved</>}
                {saveStatus === 'dirty' && <><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Unsaved changes — click Next to save</>}
                {saveStatus === 'error' && <><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Save failed</>}
              </span>
            )}
            {onAutoGenerateFields && (
              <Button
                variant="primary"
                onClick={handleAutoGenerateClick}
                disabled={!currentVersion || saving || generating}
                loading={generating}
                loadingText="Generating..."
                className="flex-shrink-0 w-[280px] whitespace-nowrap"
                style={{ whiteSpace: 'nowrap', width: '280px', minWidth: '280px', maxWidth: '280px' }}
                title={
                  !currentVersion ? 'Create or select a version first'
                    : 'ONE-CLICK: Auto-generate Form Fields from all extracted DOCX placeholders with sensible defaults (dates, numbers, tables, etc.). You can edit or delete any generated field afterwards.'
                }
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                <span className="whitespace-nowrap" style={{ whiteSpace: 'nowrap' }}>Auto-Generate Fields + Map</span>
              </Button>
            )}
            {ai.aiEnabled && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setAiDocType(template?.name ? String(template.name).replace(/[^A-Za-z0-9 ]/g, ' ') : '')
                  setAiDocDesc(template?.description || '')
                  setAiSuggestResult(null)
                  setAiSuggestOpen(true)
                }}
                disabled={!currentVersion || generating || saving}
                className="flex-shrink-0"
                title="Ask Gemini AI to suggest an initial field schema (keys, types, labels) based on document type and description."
              >
                <span className="mr-1.5">&#129302;</span> AI Suggest Fields
              </Button>
            )}
            <Button variant="secondary" onClick={openAdd} disabled={!currentVersion || generating} className="flex-shrink-0">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Field
            </Button>
          </div>
        }
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">{error}</div>}

      {currentVersion && fields.length === 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-3">
          <svg className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div className="space-y-2 flex-1">
            <p className="font-semibold text-amber-900">No Smart Form Fields defined yet for this version.</p>
            <p className="text-xs text-amber-800">Click <strong className="bg-amber-100 px-1.5 py-0.5 rounded">Auto-Generate Fields + Map</strong> (the blue primary button above) to auto-create Form Fields from your DOCX placeholders with sensible defaults — then you can edit, rename, or delete any of them here.</p>
            {onAutoGenerateFields && (
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleAutoGenerateClick}
                  loading={generating}
                  loadingText="Generating..."
                  className="flex-shrink-0 whitespace-nowrap"
                  style={{ whiteSpace: 'nowrap', width: '300px', minWidth: '300px', maxWidth: '300px' }}
                >
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  <span className="whitespace-nowrap" style={{ whiteSpace: 'nowrap' }}>Auto-Generate Form Fields Now</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {!currentVersion ? (
        <EmptyPanelState title="No version selected" description="Go to Versions tab first." />
      ) : fields.length === 0 ? (
        <EmptyPanelState title="No form fields" description="Add fields and assign them to sections to build your smart document form." />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Search</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <TextInput
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    placeholder="Search by Key or Label..."
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Type</label>
                <SelectField value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">— All Types —</option>
                  {INPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </SelectField>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Section</label>
                <SelectField value={filterSection} onChange={(e) => setFilterSection(e.target.value)}>
                  <option value="">— All Sections —</option>
                  {sections.map((s) => <option key={s.id || s._cid} value={s.id || s._cid}>{s.title || s.sectionKey}</option>)}
                  <option value="__none__">Uncategorized</option>
                </SelectField>
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setFilterSearch(''); setFilterType(''); setFilterSection(''); setFilterFlags({ required: false, authorEdit: false, reviewerEdit: false, visible: false, searchable: false }) }}
                  className="flex-1"
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 border-t border-gray-100">
              <span className="text-[11px] font-medium text-gray-600 tracking-wide uppercase">Quick Filters:</span>
              {[
                ['required', 'Required'],
                ['authorEdit', 'Author Edit'],
                ['reviewerEdit', 'Reviewer Edit'],
                ['visible', 'Visible'],
                ['searchable', 'Searchable']
              ].map(([k, lbl]) => (
                <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-gray-300 text-[#003366]"
                    checked={!!filterFlags[k]}
                    onChange={(e) => setFilterFlags((p) => ({ ...p, [k]: e.target.checked }))}
                  />
                  <span className="text-xs text-gray-700">{lbl}</span>
                </label>
              ))}
              <span className="ml-auto text-xs text-gray-500">
                Showing <strong className="text-gray-900">{filteredFields.length}</strong> of {fields.length} fields
                {selectedIds.size > 0 && <> · <strong className="text-[#003366]">{selectedIds.size} selected</strong></>}
              </span>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="rounded-lg border border-[#003366]/30 bg-[#003366]/5 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#003366] mr-1">{selectedIds.size} field{selectedIds.size === 1 ? '' : 's'} selected</span>
                <div className="flex-1 h-px bg-gray-200 md:h-px md:flex-none md:w-px md:h-6" />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => { setBulkType(''); setBulkModalType('type'); setBulkModalOpen(true) }}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
                  Change Type
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => { setBulkSection(''); setBulkModalType('section'); setBulkModalOpen(true) }}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  Change Section
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setBulkFlagForm({ isMandatory: null, isEditableAuthor: null, isEditableReviewer: null, isVisibleInForm: null, isSearchable: null, isSupportingField: null }); setBulkModalType('flags'); setBulkModalOpen(true) }}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  Set Flags
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => { setBulkModalType('delete'); setBulkModalOpen(true) }}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22" /></svg>
                  Delete
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-700 font-sans">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    <th className="w-10 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-[#003366]"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected }}
                        onChange={toggleSelectAll}
                        title={allSelected ? 'Deselect all' : 'Select all visible'}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left">#</th>
                    <th className="px-3 py-2.5 text-left">Key</th>
                    <th className="px-3 py-2.5 text-left">Type</th>
                    <th className="px-3 py-2.5 text-left">Section</th>
                    <th className="px-3 py-2.5 text-center w-12" title="Required">Req</th>
                    <th className="px-3 py-2.5 text-center w-12" title="Author Editable">Auth</th>
                    <th className="px-3 py-2.5 text-center w-12" title="Reviewer Editable">Rev</th>
                    <th className="px-3 py-2.5 text-center w-12" title="Visible in Form">Vis</th>
                    <th className="px-3 py-2.5 text-center w-12" title="Searchable">Src</th>
                    <th className="px-3 py-2.5 text-center w-12" title="Supporting Field (auto-renders via {{supporting_data}} block)">Sup</th>
                    <th className="px-3 py-2.5 w-20 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredFields.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-sm text-gray-500 font-normal">
                        No fields match the current filters.
                      </td>
                    </tr>
                  ) : filteredFields.map((f) => {
                    const cid = f.id || f._cid
                    const selected = selectedIds.has(cid)
                    const secName = sectionNameMap[f.smartTemplateSectionId || f.sectionId] || null
                    return (
                      <tr
                        key={cid}
                        className={[
                          'transition-colors',
                          selected ? 'bg-[#003366]/5 hover:bg-[#003366]/10' : 'hover:bg-gray-50',
                          f._dirty ? 'ring-1 ring-inset ring-amber-200/50' : ''
                        ].join(' ')}
                      >
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-[#003366]"
                            checked={selected}
                            onChange={() => toggleSelect(cid)}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-sm text-gray-600 tabular-nums font-normal">
                          <input
                            type="number"
                            className="w-12 text-center rounded border border-gray-200 px-1.5 py-1 text-sm tabular-nums focus:outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366]"
                            value={f.sortOrder ?? ''}
                            onChange={(e) => updateField(cid, { sortOrder: Number(e.target.value || 0) })}
                            title="Sort Order"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-sm text-gray-800 font-medium min-w-[160px]">
                          <span>{f.fieldKey}</span>
                          {(f.helpText || f.fieldHelpText) && (
                            <div className="text-xs text-gray-500 font-normal mt-0.5 line-clamp-1 leading-snug">{f.helpText || f.fieldHelpText}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', getTypeBadgeColor(f.inputType)].join(' ')}>
                            {f.inputType || 'TEXT'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-gray-600 font-normal min-w-[120px]">
                          {secName ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-1 h-3 bg-[#003366]/70 rounded-full inline-block" />
                              {secName}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic font-normal">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <FlagChip active={!!f.isMandatory} label="Required"
                            onTrue={() => updateField(cid, { isMandatory: true })}
                            onFalse={() => updateField(cid, { isMandatory: false })} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <FlagChip active={!!f.isEditableAuthor} label="Author Editable"
                            onTrue={() => updateField(cid, { isEditableAuthor: true })}
                            onFalse={() => updateField(cid, { isEditableAuthor: false })} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <FlagChip active={!!f.isEditableReviewer} label="Reviewer Editable"
                            onTrue={() => updateField(cid, { isEditableReviewer: true })}
                            onFalse={() => updateField(cid, { isEditableReviewer: false })} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <FlagChip active={!!f.isVisibleInForm} label="Visible"
                            onTrue={() => updateField(cid, { isVisibleInForm: true })}
                            onFalse={() => updateField(cid, { isVisibleInForm: false })} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <FlagChip active={!!f.isSearchable} label="Searchable"
                            onTrue={() => updateField(cid, { isSearchable: true })}
                            onFalse={() => updateField(cid, { isSearchable: false })} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <FlagChip active={!!f.isSupportingField} label="Supporting Field (via {{supporting_data}})"
                            onTrue={() => updateField(cid, { isSupportingField: true })}
                            onFalse={() => updateField(cid, { isSupportingField: false })} />
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(f)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 text-[#003366] transition-colors"
                              title="Edit field"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmModal({
                                  open: true,
                                  title: `Delete field "${f.fieldKey}"?`,
                                  message: (
                                    <>
                                      Permanently delete field <strong>{f.fieldKey}</strong> ({f.fieldLabel})?
                                      <br />This action cannot be undone once auto-save runs.
                                    </>
                                  ),
                                  confirmLabel: 'Delete Field',
                                  cancelLabel: 'Cancel',
                                  variant: 'danger',
                                  onConfirm: () => removeField(cid)
                                })
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-red-50 text-red-600 transition-colors"
                              title="Delete field"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {addOpen && addForm && (
        <Modal onClose={() => setAddOpen(false)} size="xl">
          <ModalHeader title="Add Form Field" onClose={() => setAddOpen(false)} />
          <form onSubmit={handleAddSubmit}>
            <ModalBody className="space-y-4">
              {addError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{addError}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Field Key * (unique)</label>
                  <TextInput value={addForm.fieldKey} onChange={(e) => setAddForm({ ...addForm, fieldKey: e.target.value })} placeholder="e.g. MEETING_DATE" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Field Label *</label>
                  <TextInput value={addForm.fieldLabel} onChange={(e) => setAddForm({ ...addForm, fieldLabel: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Help Text</label>
                <TextArea rows={2} value={addForm.helpText} onChange={(e) => setAddForm({ ...addForm, helpText: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Input Type</label>
                  <SelectField value={addForm.inputType} onChange={(e) => setAddForm({ ...addForm, inputType: e.target.value })}>
                    {INPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </SelectField>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Section</label>
                  <SelectField value={addForm.sectionId} onChange={(e) => setAddForm({ ...addForm, sectionId: e.target.value })}>
                    <option value="">— None —</option>
                    {sections.map((s) => <option key={s.id || s._cid} value={s.id || s._cid}>{s.title || s.sectionKey}</option>)}
                  </SelectField>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Sort Order</label>
                  <TextInput type="number" value={addForm.sortOrder} onChange={(e) => setAddForm({ ...addForm, sortOrder: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                {[
                  ['isMandatory', 'Required'],
                  ['isEditableAuthor', 'Author Edit'],
                  ['isEditableReviewer', 'Reviewer Edit'],
                  ['isVisibleInForm', 'Visible'],
                  ['isSearchable', 'Searchable'],
                  ['isSupportingField', 'Supporting']
                ].map(([k, lbl]) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-[#003366]"
                      checked={!!addForm[k]} onChange={(e) => setAddForm({ ...addForm, [k]: e.target.checked })} />
                    <span className="text-xs text-gray-700">{lbl}</span>
                  </label>
                ))}
              </div>
              {(addForm.inputType === 'DROPDOWN' || addForm.inputType === 'SINGLE_SELECT' || addForm.inputType === 'MULTI_SELECT' || addForm.inputType === 'CHECKBOX' || addForm.inputType === 'TEXT' || addForm.inputType === 'NUMBER' || addForm.inputType === 'TEXTAREA' || addForm.inputType === 'RICH_TEXT') && (
                <div className="rounded-lg border border-sky-200 bg-sky-50/50 px-4 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="h-4 w-4 text-sky-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <h4 className="text-sm font-semibold text-sky-900">
                      {addForm.inputType === 'DROPDOWN' && 'Dropdown Options & Default Value'}
                      {addForm.inputType === 'SINGLE_SELECT' && 'Single Select Options & Default Value'}
                      {addForm.inputType === 'MULTI_SELECT' && 'Multi Select Options & Default Values'}
                      {addForm.inputType === 'CHECKBOX' && 'Checkbox Behaviour'}
                      {(addForm.inputType === 'TEXT' || addForm.inputType === 'TEXTAREA' || addForm.inputType === 'RICH_TEXT' || addForm.inputType === 'NUMBER') && 'Default Value'}
                    </h4>
                    <span className="ml-auto text-[10px] text-sky-700 bg-white px-2 py-0.5 rounded-full border border-sky-200 font-medium">No JSON required</span>
                  </div>
                  {(addForm.inputType === 'DROPDOWN' || addForm.inputType === 'SINGLE_SELECT' || addForm.inputType === 'MULTI_SELECT') && (
                    <DropdownOptionsEditor
                      optionsJson={addForm.optionsJson}
                      onChange={(v) => setAddForm({ ...addForm, optionsJson: v })}
                      defaultValue={readDefaultValueScalar(addForm.defaultValueJson, addForm.inputType)}
                      onDefaultChange={(v) => setAddForm({ ...addForm, defaultValueJson: writeDefaultValueScalar(v, addForm.inputType) })}
                      ownerFieldKey={addForm.fieldKey}
                      allFields={fields}
                      onAddDependent={(optVal, optLabel) => addDependentForOption(addForm.fieldKey, optVal, optLabel)}
                      onEditExistingDependent={(dep) => { setAddOpen(false); openEdit(dep); }}
                      isMultiDefault={addForm.inputType === 'MULTI_SELECT'}
                    />
                  )}
                  {addForm.inputType === 'CHECKBOX' && (
                    <CheckboxEditor
                      defaultValue={readDefaultValueScalar(addForm.defaultValueJson, 'CHECKBOX')}
                      onDefaultChange={(v) => setAddForm({ ...addForm, defaultValueJson: writeDefaultValueScalar(v, 'CHECKBOX') })}
                      checkboxLabel={readCheckboxLabel(addForm.validationRulesJson)}
                      onCheckboxLabelChange={(lbl) => setAddForm({ ...addForm, validationRulesJson: writeCheckboxLabel(addForm.validationRulesJson, lbl) })}
                    />
                  )}
                  {addForm.inputType !== 'DROPDOWN' && addForm.inputType !== 'CHECKBOX' && (
                    <div className="rounded-lg border border-sky-200 bg-white p-3">
                      <label className="block text-xs font-semibold text-gray-800 mb-1.5">Default value when new draft opens</label>
                      {addForm.inputType === 'NUMBER' ? (
                        <TextInput
                          size="sm"
                          type="number"
                          value={readDefaultValueScalar(addForm.defaultValueJson, 'NUMBER')}
                          onChange={(e) => setAddForm({ ...addForm, defaultValueJson: writeDefaultValueScalar(e.target.value, 'NUMBER') })}
                          placeholder="e.g. 0 or 1000"
                        />
                      ) : addForm.inputType === 'TEXTAREA' || addForm.inputType === 'RICH_TEXT' ? (
                        <TextArea
                          rows={3}
                          value={readDefaultValueScalar(addForm.defaultValueJson, addForm.inputType)}
                          onChange={(e) => setAddForm({ ...addForm, defaultValueJson: writeDefaultValueScalar(e.target.value, addForm.inputType) })}
                          placeholder="Default multi-line text for new drafts."
                        />
                      ) : (
                        <TextInput
                          size="sm"
                          value={readDefaultValueScalar(addForm.defaultValueJson, addForm.inputType)}
                          onChange={(e) => setAddForm({ ...addForm, defaultValueJson: writeDefaultValueScalar(e.target.value, addForm.inputType) })}
                          placeholder="Default text for new drafts"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-4 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-4 w-4 text-violet-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  <h4 className="text-sm font-semibold text-violet-900">Conditional Visibility</h4>
                  <span className="ml-auto text-[10px] text-violet-700 bg-white px-2 py-0.5 rounded-full border border-violet-200 font-medium">No JSON required</span>
                </div>
                <ConditionalVisibilityEditor
                  visibilityRulesJson={addForm.visibilityRulesJson}
                  onChange={(v) => setAddForm({ ...addForm, visibilityRulesJson: v })}
                  controllerFields={fields}
                  currentFieldKey={addForm.fieldKey}
                />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAddAdvancedOpen(!addAdvancedOpen)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-100/60 transition-colors"
                >
                  <svg className={['h-3.5 w-3.5 text-gray-500 transition-transform flex-shrink-0', addAdvancedOpen ? '' : '-rotate-90'].join(' ')} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Advanced Settings (JSON configuration)</span>
                  <span className="ml-auto text-[10px] text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200 font-medium">
                    {['DROPDOWN','TABLE','REPEATER','IMAGE','ATTACHMENT','SYSTEM_GENERATED'].includes(addForm.inputType) ? 'Config for: ' + addForm.inputType : 'Validation & Defaults'}
                  </span>
                </button>
                {addAdvancedOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-200 bg-white space-y-4">
                    <p className="text-[11px] text-gray-500 pt-1">
                      Optional. Leave blank for sensible defaults. Use these for: custom validation rules, preset default values, DROPDOWN options list, TABLE columns, image/attachment sizing, etc.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {addForm.inputType === 'DROPDOWN' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">Options JSON</label>
                          <TextArea rows={6} className="font-mono text-xs" value={addForm.optionsJson} onChange={(e) => setAddForm({ ...addForm, optionsJson: e.target.value })} placeholder={`[\n  {"value": "opt1", "label": "Option 1"}\n]`} />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">Validation Rules JSON</label>
                        <TextArea rows={6} className="font-mono text-xs" value={addForm.validationRulesJson} onChange={(e) => setAddForm({ ...addForm, validationRulesJson: e.target.value })} placeholder={`{"minLength": 2, "pattern": "..."}`} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">Default Value JSON</label>
                        <TextArea rows={6} className="font-mono text-xs" value={addForm.defaultValueJson} onChange={(e) => setAddForm({ ...addForm, defaultValueJson: e.target.value })} />
                      </div>
                      {addForm.inputType === 'TABLE' && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-900 mb-2">Table Columns <span className="text-red-600">*</span></label>
                          <p className="text-[11px] text-gray-500 mb-2">Define columns end-users will fill — add, remove, rename, reorder below (no raw JSON needed).</p>
                          <SchemaColumnEditor
                            value={addForm.tableSchemaJson}
                            onChange={(v) => setAddForm({ ...addForm, tableSchemaJson: v })}
                          />
                        </div>
                      )}
                      {addForm.inputType === 'REPEATER' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">Repeater Schema JSON</label>
                          <TextArea rows={6} className="font-mono text-xs" value={addForm.repeaterSchemaJson} onChange={(e) => setAddForm({ ...addForm, repeaterSchemaJson: e.target.value })} />
                        </div>
                      )}
                      {addForm.inputType === 'IMAGE' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">Image Config JSON</label>
                          <TextArea rows={6} className="font-mono text-xs" value={addForm.imageConfigJson} onChange={(e) => setAddForm({ ...addForm, imageConfigJson: e.target.value })} />
                        </div>
                      )}
                      {addForm.inputType === 'ATTACHMENT' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">Attachment Config JSON</label>
                          <TextArea rows={6} className="font-mono text-xs" value={addForm.attachmentConfigJson} onChange={(e) => setAddForm({ ...addForm, attachmentConfigJson: e.target.value })} />
                        </div>
                      )}
                      {addForm.inputType === 'SYSTEM_GENERATED' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">System Field Config JSON</label>
                          <TextArea rows={6} className="font-mono text-xs" value={addForm.systemFieldConfigJson} onChange={(e) => setAddForm({ ...addForm, systemFieldConfigJson: e.target.value })} />
                        </div>
                      )}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-900 mb-2">Conditional Visibility Rules JSON</label>
                        <TextArea rows={4} className="font-mono text-xs" value={addForm.visibilityRulesJson} onChange={(e) => setAddForm({ ...addForm, visibilityRulesJson: e.target.value })}
                          placeholder={`{"enabled":true,"match":"ALL","rules":[{"fieldKey":"OTHER_FIELD","operator":"equals","value":"SomeValue"}]}`} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Add Field</Button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {editOpen && editForm && (
        <Modal onClose={() => setEditOpen(false)} size="xl">
          <ModalHeader title="Edit Form Field" onClose={() => setEditOpen(false)} />
          <form onSubmit={handleEditSubmit}>
            <ModalBody className="space-y-4">
              {editError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{editError}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Field Key <span className="text-red-600">*</span> (unique)</label>
                  <TextInput value={editForm.fieldKey} onChange={(e) => setEditForm({ ...editForm, fieldKey: e.target.value })} placeholder="e.g. MEETING_DATE" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Field Label <span className="text-red-600">*</span></label>
                  <TextInput value={editForm.fieldLabel} onChange={(e) => setEditForm({ ...editForm, fieldLabel: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Help Text</label>
                <TextArea rows={2} value={editForm.helpText} onChange={(e) => setEditForm({ ...editForm, helpText: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Input Type</label>
                  <SelectField value={editForm.inputType} onChange={(e) => setEditForm({ ...editForm, inputType: e.target.value })}>
                    {INPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </SelectField>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Section</label>
                  <SelectField value={editForm.sectionId} onChange={(e) => setEditForm({ ...editForm, sectionId: e.target.value })}>
                    <option value="">— None —</option>
                    {sections.map((s) => <option key={s.id || s._cid} value={s.id || s._cid}>{s.title || s.sectionKey}</option>)}
                  </SelectField>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Sort Order</label>
                  <TextInput type="number" value={editForm.sortOrder} onChange={(e) => setEditForm({ ...editForm, sortOrder: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                {[
                  ['isMandatory', 'Required'],
                  ['isEditableAuthor', 'Author Edit'],
                  ['isEditableReviewer', 'Reviewer Edit'],
                  ['isVisibleInForm', 'Visible'],
                  ['isSearchable', 'Searchable'],
                  ['isSupportingField', 'Supporting']
                ].map(([k, lbl]) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-[#003366]"
                      checked={!!editForm[k]} onChange={(e) => setEditForm({ ...editForm, [k]: e.target.checked })} />
                    <span className="text-xs text-gray-700">{lbl}</span>
                  </label>
                ))}
              </div>
              {(editForm.inputType === 'DROPDOWN' || editForm.inputType === 'SINGLE_SELECT' || editForm.inputType === 'MULTI_SELECT' || editForm.inputType === 'CHECKBOX' || editForm.inputType === 'TEXT' || editForm.inputType === 'NUMBER' || editForm.inputType === 'TEXTAREA' || editForm.inputType === 'RICH_TEXT') && (
                <div className="rounded-lg border border-sky-200 bg-sky-50/50 px-4 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="h-4 w-4 text-sky-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <h4 className="text-sm font-semibold text-sky-900">
                      {editForm.inputType === 'DROPDOWN' && 'Dropdown Options & Default Value'}
                      {editForm.inputType === 'SINGLE_SELECT' && 'Single Select Options & Default Value'}
                      {editForm.inputType === 'MULTI_SELECT' && 'Multi Select Options & Default Values'}
                      {editForm.inputType === 'CHECKBOX' && 'Checkbox Behaviour'}
                      {(editForm.inputType === 'TEXT' || editForm.inputType === 'TEXTAREA' || editForm.inputType === 'RICH_TEXT' || editForm.inputType === 'NUMBER') && 'Default Value'}
                    </h4>
                    <span className="ml-auto text-[10px] text-sky-700 bg-white px-2 py-0.5 rounded-full border border-sky-200 font-medium">No JSON required</span>
                  </div>
                  {(editForm.inputType === 'DROPDOWN' || editForm.inputType === 'SINGLE_SELECT' || editForm.inputType === 'MULTI_SELECT') && (
                    <DropdownOptionsEditor
                      optionsJson={editForm.optionsJson}
                      onChange={(v) => setEditForm({ ...editForm, optionsJson: v })}
                      defaultValue={readDefaultValueScalar(editForm.defaultValueJson, editForm.inputType)}
                      onDefaultChange={(v) => setEditForm({ ...editForm, defaultValueJson: writeDefaultValueScalar(v, editForm.inputType) })}
                      ownerFieldKey={editForm.fieldKey}
                      allFields={fields}
                      onAddDependent={(optVal, optLabel) => addDependentForOption(editForm.fieldKey, optVal, optLabel)}
                      onEditExistingDependent={(dep) => { setEditOpen(false); openEdit(dep); }}
                      isMultiDefault={editForm.inputType === 'MULTI_SELECT'}
                    />
                  )}
                  {editForm.inputType === 'CHECKBOX' && (
                    <CheckboxEditor
                      defaultValue={readDefaultValueScalar(editForm.defaultValueJson, 'CHECKBOX')}
                      onDefaultChange={(v) => setEditForm({ ...editForm, defaultValueJson: writeDefaultValueScalar(v, 'CHECKBOX') })}
                      checkboxLabel={readCheckboxLabel(editForm.validationRulesJson)}
                      onCheckboxLabelChange={(lbl) => setEditForm({ ...editForm, validationRulesJson: writeCheckboxLabel(editForm.validationRulesJson, lbl) })}
                    />
                  )}
                  {editForm.inputType !== 'DROPDOWN' && editForm.inputType !== 'CHECKBOX' && (
                    <div className="rounded-lg border border-sky-200 bg-white p-3">
                      <label className="block text-xs font-semibold text-gray-800 mb-1.5">Default value when new draft opens</label>
                      {editForm.inputType === 'NUMBER' ? (
                        <TextInput
                          size="sm"
                          type="number"
                          value={readDefaultValueScalar(editForm.defaultValueJson, 'NUMBER')}
                          onChange={(e) => setEditForm({ ...editForm, defaultValueJson: writeDefaultValueScalar(e.target.value, 'NUMBER') })}
                          placeholder="e.g. 0 or 1000"
                        />
                      ) : editForm.inputType === 'TEXTAREA' || editForm.inputType === 'RICH_TEXT' ? (
                        <TextArea
                          rows={3}
                          value={readDefaultValueScalar(editForm.defaultValueJson, editForm.inputType)}
                          onChange={(e) => setEditForm({ ...editForm, defaultValueJson: writeDefaultValueScalar(e.target.value, editForm.inputType) })}
                          placeholder="Default multi-line text for new drafts."
                        />
                      ) : (
                        <TextInput
                          size="sm"
                          value={readDefaultValueScalar(editForm.defaultValueJson, editForm.inputType)}
                          onChange={(e) => setEditForm({ ...editForm, defaultValueJson: writeDefaultValueScalar(e.target.value, editForm.inputType) })}
                          placeholder="Default text for new drafts"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-4 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-4 w-4 text-violet-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  <h4 className="text-sm font-semibold text-violet-900">Conditional Visibility</h4>
                  <span className="ml-auto text-[10px] text-violet-700 bg-white px-2 py-0.5 rounded-full border border-violet-200 font-medium">No JSON required</span>
                </div>
                <ConditionalVisibilityEditor
                  visibilityRulesJson={editForm.visibilityRulesJson}
                  onChange={(v) => setEditForm({ ...editForm, visibilityRulesJson: v })}
                  controllerFields={fields}
                  currentFieldKey={editForm.fieldKey}
                />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setEditAdvancedOpen(!editAdvancedOpen)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-100/60 transition-colors"
                >
                  <svg className={['h-3.5 w-3.5 text-gray-500 transition-transform flex-shrink-0', editAdvancedOpen ? '' : '-rotate-90'].join(' ')} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Advanced Settings (JSON configuration)</span>
                  <span className="ml-auto text-[10px] text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200 font-medium">
                    {['DROPDOWN','TABLE','REPEATER','IMAGE','ATTACHMENT','SYSTEM_GENERATED'].includes(editForm.inputType) ? 'Config for: ' + editForm.inputType : 'Validation & Defaults'}
                  </span>
                </button>
                {editAdvancedOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-200 bg-white space-y-4">
                    <p className="text-[11px] text-gray-500 pt-1">
                      Use these fields for advanced behaviour: custom validation rules, preset default values, DROPDOWN options list, TABLE columns, image/attachment sizing, etc.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {editForm.inputType === 'DROPDOWN' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">Options JSON</label>
                          <TextArea rows={6} className="font-mono text-xs" value={editForm.optionsJson} onChange={(e) => setEditForm({ ...editForm, optionsJson: e.target.value })} placeholder={`[\n  {"value": "opt1", "label": "Option 1"}\n]`} />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">Validation Rules JSON</label>
                        <TextArea rows={6} className="font-mono text-xs" value={editForm.validationRulesJson} onChange={(e) => setEditForm({ ...editForm, validationRulesJson: e.target.value })} placeholder={`{"minLength": 2, "pattern": "..."}`} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">Default Value JSON</label>
                        <TextArea rows={6} className="font-mono text-xs" value={editForm.defaultValueJson} onChange={(e) => setEditForm({ ...editForm, defaultValueJson: e.target.value })} />
                      </div>
                      {editForm.inputType === 'TABLE' && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-900 mb-2">Table Columns <span className="text-red-600">*</span></label>
                          <p className="text-[11px] text-gray-500 mb-2">Define columns end-users will fill — add, remove, rename, reorder below (no raw JSON needed).</p>
                          <SchemaColumnEditor
                            value={editForm.tableSchemaJson}
                            onChange={(v) => setEditForm({ ...editForm, tableSchemaJson: v })}
                          />
                        </div>
                      )}
                      {editForm.inputType === 'REPEATER' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">Repeater Schema JSON</label>
                          <TextArea rows={6} className="font-mono text-xs" value={editForm.repeaterSchemaJson} onChange={(e) => setEditForm({ ...editForm, repeaterSchemaJson: e.target.value })} />
                        </div>
                      )}
                      {editForm.inputType === 'IMAGE' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">Image Config JSON</label>
                          <TextArea rows={6} className="font-mono text-xs" value={editForm.imageConfigJson} onChange={(e) => setEditForm({ ...editForm, imageConfigJson: e.target.value })} />
                        </div>
                      )}
                      {editForm.inputType === 'ATTACHMENT' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">Attachment Config JSON</label>
                          <TextArea rows={6} className="font-mono text-xs" value={editForm.attachmentConfigJson} onChange={(e) => setEditForm({ ...editForm, attachmentConfigJson: e.target.value })} />
                        </div>
                      )}
                      {editForm.inputType === 'SYSTEM_GENERATED' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">System Field Config JSON</label>
                          <TextArea rows={6} className="font-mono text-xs" value={editForm.systemFieldConfigJson} onChange={(e) => setEditForm({ ...editForm, systemFieldConfigJson: e.target.value })} />
                        </div>
                      )}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-900 mb-2">Conditional Visibility Rules JSON</label>
                        <TextArea rows={4} className="font-mono text-xs" value={editForm.visibilityRulesJson} onChange={(e) => setEditForm({ ...editForm, visibilityRulesJson: e.target.value })}
                          placeholder={`{"enabled":true,"match":"ALL","rules":[{"fieldKey":"OTHER_FIELD","operator":"equals","value":"SomeValue"}]}`} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Save Changes</Button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {bulkModalOpen && bulkModalType && (
        <Modal onClose={() => setBulkModalOpen(false)} size="md">
          <ModalHeader
            title={
              bulkModalType === 'type' ? `Bulk Change Input Type (${selectedIds.size} field${selectedIds.size === 1 ? '' : 's'})`
              : bulkModalType === 'section' ? `Bulk Change Section (${selectedIds.size} field${selectedIds.size === 1 ? '' : 's'})`
              : bulkModalType === 'flags' ? `Bulk Set Flags (${selectedIds.size} field${selectedIds.size === 1 ? '' : 's'})`
              : `Delete Selected Fields (${selectedIds.size})`
            }
            onClose={() => setBulkModalOpen(false)}
          />
          <ModalBody className="space-y-4">
            {bulkModalType === 'type' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800 space-y-1.5">
                  <p className="font-semibold">Important:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    <li>Changing the input type will <strong>CLEAR</strong> all mismatched type-specific JSON configs (options/table/repeater/image/attachment/system schemas) to avoid stale data.</li>
                    <li>Example: if a TABLE field is changed to TEXT, the <code className="bg-sky-100 px-1 rounded">tableSchemaJson</code> field will be automatically cleared.</li>
                  </ul>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">New Input Type <span className="text-red-600">*</span></label>
                  <SelectField value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
                    <option value="">— Select new Input Type —</option>
                    {INPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </SelectField>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">Fields affected ({selectedIds.size}):</p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {[...selectedIds].map((cid) => {
                      const f = fields.find(x => (x.id || x._cid) === cid)
                      if (!f) return null
                      return (
                        <span key={cid} className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2 py-0.5 rounded-full text-[10px]">
                          <span className="font-mono text-gray-700">{f.fieldKey}</span>
                          <span className={['inline-flex px-1.5 py-px rounded border', getTypeBadgeColor(f.inputType)].join(' ')}>{f.inputType}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {bulkModalType === 'section' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">New Section</label>
                  <SelectField value={bulkSection} onChange={(e) => setBulkSection(e.target.value)}>
                    <option value="">— Uncategorized (No Section) —</option>
                    {sections.map((s) => <option key={s.id || s._cid} value={s.id || s._cid}>{s.title || s.sectionKey}</option>)}
                  </SelectField>
                  <p className="text-[11px] text-gray-500 mt-1.5">Select "Uncategorized" to remove the fields from any section.</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">Fields affected ({selectedIds.size}):</p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {[...selectedIds].map((cid) => {
                      const f = fields.find(x => (x.id || x._cid) === cid)
                      if (!f) return null
                      const secName = sectionNameMap[f.smartTemplateSectionId || f.sectionId] || null
                      return (
                        <span key={cid} className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2 py-0.5 rounded-full text-[10px]">
                          <span className="font-mono text-gray-700">{f.fieldKey}</span>
                          <span className="text-gray-500">{secName ? '§ ' + secName : '—'}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {bulkModalType === 'flags' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  <p className="font-semibold mb-1">How it works:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    <li>Toggle <strong>ON</strong> (✓ tick) = set all selected fields to <strong>true / enabled</strong></li>
                    <li>Toggle <strong>OFF</strong> (✗ cross) = set all selected fields to <strong>false / disabled</strong></li>
                    <li>Leave on <strong>neutral</strong> (dash) = <strong>do not change</strong> this flag (keep existing value)</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                  {[
                    ['isMandatory', 'Required', 'Field must be filled in by the user'],
                    ['isEditableAuthor', 'Author Editable', 'Editable by users with the Author role'],
                    ['isEditableReviewer', 'Reviewer Editable', 'Editable by users with the Reviewer role'],
                    ['isVisibleInForm', 'Visible in Form', 'Display this field when the user fills in the document form'],
                    ['isSearchable', 'Searchable', 'Field content is indexed for global search'],
                    ['isSupportingField', 'Supporting Field', 'Auto-renders via {{supporting_data}} placeholder in DOCX — no 1:1 mapping required']
                  ].map(([k, lbl, desc]) => {
                    const val = bulkFlagForm[k]
                    return (
                      <div key={k} className="px-4 py-3 flex items-start gap-3">
                        <div className="flex items-center gap-0.5 shrink-0 bg-gray-50 rounded-lg border border-gray-200 p-0.5">
                          <button
                            type="button"
                            onClick={() => setBulkFlagForm((p) => ({ ...p, [k]: p[k] === true ? null : true }))}
                            className={[
                              'w-8 h-8 rounded-md flex items-center justify-center text-sm font-medium transition-colors',
                              val === true
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-emerald-700 hover:bg-white'
                            ].join(' ')}
                            title="Set ON (true) for all selected"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => setBulkFlagForm((p) => ({ ...p, [k]: p[k] === false ? null : false }))}
                            className={[
                              'w-8 h-8 rounded-md flex items-center justify-center text-sm font-medium transition-colors',
                              val === false
                                ? 'bg-red-500 text-white shadow-sm'
                                : 'text-gray-400 hover:text-red-700 hover:bg-white'
                            ].join(' ')}
                            title="Set OFF (false) for all selected"
                          >
                            ✗
                          </button>
                          <button
                            type="button"
                            onClick={() => setBulkFlagForm((p) => ({ ...p, [k]: null }))}
                            className={[
                              'w-8 h-8 rounded-md flex items-center justify-center text-sm font-medium transition-colors',
                              val === null
                                ? 'bg-gray-200 text-gray-700 shadow-sm'
                                : 'text-gray-400 hover:text-gray-700 hover:bg-white'
                            ].join(' ')}
                            title="No change (skip this flag)"
                          >
                            —
                          </button>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">{lbl}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>
                        </div>
                        <div className="shrink-0 text-[11px] font-semibold tabular-nums px-2 py-1 rounded-md bg-gray-50 border border-gray-200 text-gray-600">
                          {val === true ? 'ON' : val === false ? 'OFF' : 'SKIP'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {bulkModalType === 'delete' && (
              <div className="space-y-4">
                <div className="flex items-start gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-lg bg-white border border-red-200">
                    <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold text-red-900">Confirm permanent deletion?</p>
                    <p className="text-xs text-red-700 leading-relaxed">
                      Are you sure you want to <strong>permanently delete {selectedIds.size} field{selectedIds.size === 1 ? '' : 's'}</strong>? This action cannot be undone once auto-save runs.
                      Any placeholder mappings referencing these fields may break.
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">Field(s) to delete:</p>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {[...selectedIds].map((cid) => {
                      const f = fields.find(x => (x.id || x._cid) === cid)
                      if (!f) return null
                      return (
                        <span key={cid} className="inline-flex items-center gap-1 bg-white border border-red-200 px-2 py-0.5 rounded-full text-[10px]">
                          <svg className="h-3 w-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22" /></svg>
                          <span className="font-mono text-red-700">{f.fieldKey}</span>
                          <span className="text-gray-500">({f.fieldLabel})</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setBulkModalOpen(false)}>Cancel</Button>
            {bulkModalType === 'type' && (
              <Button
                variant="primary"
                disabled={!bulkType}
                onClick={() => {
                  if (!bulkType) { notify('Pick an Input Type first', 'warning'); return }
                  setConfirmModal({
                    open: true,
                    title: `Change Input Type to "${bulkType}"?`,
                    message: (
                      <>
                        Apply the new Input Type <strong>{bulkType}</strong> to {selectedIds.size} field{selectedIds.size === 1 ? '' : 's'}?
                        <br />This will <strong>CLEAR</strong> all mismatched type-specific JSON configs
                        <br />(options/table/repeater/image/attachment/system schemas) for any type mismatch.
                      </>
                    ),
                    confirmLabel: 'Yes, Apply Type',
                    cancelLabel: 'Cancel',
                    variant: 'default',
                    onConfirm: () => {
                      applyBulkType()
                      setBulkModalOpen(false)
                    }
                  })
                }}
              >
                Apply New Type
              </Button>
            )}
            {bulkModalType === 'section' && (
              <Button
                variant="primary"
                onClick={() => {
                  if (bulkSection === '' && sections.length > 0) {
                    setConfirmModal({
                      open: true,
                      title: `Move ${selectedIds.size} field${selectedIds.size === 1 ? '' : 's'} to Uncategorized?`,
                      message: (
                        <>
                          Are you sure you want to remove {selectedIds.size} selected field{selectedIds.size === 1 ? '' : 's'} from all sections and categorize them as <strong>Uncategorized</strong>?
                        </>
                      ),
                      confirmLabel: 'Yes, Move',
                      cancelLabel: 'Cancel',
                      variant: 'default',
                      onConfirm: () => {
                        applyBulkSection()
                        setBulkModalOpen(false)
                      }
                    })
                    return
                  }
                  applyBulkSection()
                  setBulkModalOpen(false)
                }}
              >
                Apply New Section
              </Button>
            )}
            {bulkModalType === 'flags' && (
              <Button
                variant="primary"
                disabled={Object.values(bulkFlagForm).every(v => v === null)}
                onClick={() => {
                  const anyChange = Object.entries(bulkFlagForm).some(([, v]) => v !== null)
                  if (!anyChange) { notify('Set at least one flag to ON or OFF first', 'warning'); return }
                  const changes = []
                  for (const [k, v] of Object.entries(bulkFlagForm)) {
                    if (v === null) continue
                    changes.push(`${k}=${v}`)
                    bulkSetFlag(k, v)
                  }
                  notify(`Updated ${changes.length} flag${changes.length === 1 ? '' : 's'} for ${selectedIds.size} field${selectedIds.size === 1 ? '' : 's'}`, 'success')
                  setBulkModalOpen(false)
                }}
              >
                Apply Flags
              </Button>
            )}
            {bulkModalType === 'delete' && (
              <Button
                variant="danger"
                onClick={() => {
                  if (selectedIds.size === 0) return
                  deleteSelected()
                  setBulkModalOpen(false)
                }}
              >
                Yes, Delete Permanently
              </Button>
            )}
          </ModalFooter>
        </Modal>
      )}

      {/* Reusable Confirmation Modal */}
      {confirmModal.open && (
        <Modal onClose={() => setConfirmModal({ ...confirmModal, open: false })} size="sm">
          <ModalHeader
            title={confirmModal.title || 'Confirm action'}
            onClose={() => setConfirmModal({ ...confirmModal, open: false })}
          />
          <ModalBody>
            <div className="flex items-start gap-4">
              <div className={[
                'shrink-0 flex items-center justify-center w-11 h-11 rounded-lg border',
                confirmModal.variant === 'danger'
                  ? 'bg-red-50 border-red-200 text-red-600'
                  : confirmModal.variant === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-600'
                    : 'bg-sky-50 border-sky-200 text-sky-700'
              ].join(' ')}>
                {confirmModal.variant === 'danger' ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                )}
              </div>
              <div className="min-w-0 flex-1 text-sm text-gray-700 leading-relaxed">
                {confirmModal.message || 'Are you sure you want to proceed?'}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirmModal({ ...confirmModal, open: false })}>
              {confirmModal.cancelLabel || 'Cancel'}
            </Button>
            <Button
              type="button"
              variant={confirmModal.variant === 'danger' ? 'danger' : 'primary'}
              onClick={() => {
                const cb = confirmModal.onConfirm
                setConfirmModal({ open: false, title: '', message: '', onConfirm: null, confirmLabel: 'Confirm', cancelLabel: 'Cancel', variant: 'default' })
                if (typeof cb === 'function') cb()
              }}
            >
              {confirmModal.confirmLabel || 'Confirm'}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* AI Suggest Fields Modal */}
      <Modal
        isOpen={aiSuggestOpen}
        onClose={() => !aiSuggestLoading && setAiSuggestOpen(false)}
        size="lg"
      >
        <ModalHeader
          title="&#129302; AI Suggest Template Fields"
          subtitle="Describe the document type and Gemini will suggest a complete Smart Form field schema."
          onClose={() => !aiSuggestLoading && setAiSuggestOpen(false)}
        />
        <ModalBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">
                  Document Type
                </label>
                <TextInput
                  value={aiDocType}
                  onChange={(e) => setAiDocType(e.target.value)}
                  placeholder="e.g. Employee Onboarding Letter, Purchase Order, MC Claim Form"
                  disabled={aiSuggestLoading}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">
                  Target Fields Count
                </label>
                <div className="px-3 py-2.5 rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-600">
                  Approx. 15 &ndash; 18 fields (auto-balanced across sections)
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">
                Description / Purpose
              </label>
              <TextArea
                value={aiDocDesc}
                onChange={(e) => setAiDocDesc(e.target.value)}
                rows={4}
                placeholder="Describe what this document is used for, what information it typically captures, and the workflow around it. The more detail, the better the suggestions.\n\nExample:\nAn internal HR document issued when a new employee joins the company. Captures employee personal info, position, salary details, reporting line, equipment requested, and onboarding checklist items. Sections: Employee Details, Position Info, Compensation, IT Setup, HR Checklist."
                disabled={aiSuggestLoading}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={runAiSuggest}
                disabled={aiSuggestLoading || (!aiDocType.trim() && !aiDocDesc.trim())}
                loading={aiSuggestLoading}
                loadingText="Asking Gemini to suggest fields..."
              >
                <span className="mr-1.5">&#128161;</span> Generate Suggestions
              </Button>
              {aiSuggestResult && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAiSuggestResult(null)}
                  disabled={aiSuggestLoading}
                >
                  Reset
                </Button>
              )}
            </div>

            {aiSuggestResult && (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-800">
                      &#9989; {aiSuggestResult.fields?.length || 0} Fields Suggested
                    </h4>
                    {aiSuggestResult.templateTips?.length > 0 && (
                      <p className="text-[11px] text-emerald-700/90 mt-0.5">
                        {aiSuggestResult.templateTips.length} design tip{aiSuggestResult.templateTips.length === 1 ? '' : 's'} included
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    onClick={applyAiSuggestFields}
                    disabled={!aiSuggestResult.fields?.length}
                  >
                    <span className="mr-1.5">&#10133;</span> Add All ({aiSuggestResult.fields?.length || 0} Fields)
                  </Button>
                </div>

                {aiSuggestResult.suggestedSections?.length > 0 && (
                  <div className="rounded-lg bg-white border border-emerald-100 p-3 space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">Suggested Sections</div>
                    <div className="flex flex-wrap gap-1.5">
                      {aiSuggestResult.suggestedSections.map((s, i) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {s.order ? `${s.order}. ` : ''}{s.sectionName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="max-h-80 overflow-y-auto rounded-lg bg-white border border-emerald-100 divide-y divide-emerald-50">
                  {(aiSuggestResult.fields || []).map((f, i) => {
                    const typeColor = (() => {
                      switch ((f.type || 'TEXT').toUpperCase()) {
                        case 'DATE': return 'bg-sky-100 text-sky-700 border-sky-200'
                        case 'DROPDOWN': return 'bg-purple-100 text-purple-700 border-purple-200'
                        case 'NUMBER': case 'CURRENCY': return 'bg-amber-100 text-amber-700 border-amber-200'
                        case 'TEXTAREA': case 'RICH_TEXT': return 'bg-pink-100 text-pink-700 border-pink-200'
                        case 'CHECKBOX': return 'bg-lime-100 text-lime-700 border-lime-200'
                        case 'EMAIL': case 'PHONE': return 'bg-teal-100 text-teal-700 border-teal-200'
                        default: return 'bg-gray-100 text-gray-700 border-gray-200'
                      }
                    })()
                    return (
                      <div key={i} className="px-3 py-2 grid grid-cols-[1fr_auto_auto] gap-3 items-start text-[12.5px]">
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-800">
                            {f.label || f.fieldKey}
                            {f.isSupportingField && (
                              <span className="ml-1.5 text-[9.5px] uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 align-middle">
                                Supporting
                              </span>
                            )}
                            {f.required && (
                              <span className="ml-1 text-red-500">*</span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-gray-400 font-mono truncate">{f.fieldKey}</div>
                          {f.helpText && <div className="text-[11px] text-gray-500 mt-0.5">{f.helpText}</div>}
                          {f.group && <div className="text-[10.5px] mt-0.5 text-indigo-600/90 font-medium">Group: {f.group}</div>}
                        </div>
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border font-semibold shrink-0 mt-0.5 ${typeColor}`}>
                          {f.type || 'TEXT'}
                        </span>
                        {Array.isArray(f.options) && f.options.length > 0 && (
                          <div className="text-[10px] text-gray-500 italic shrink-0 mt-1 max-w-[120px] truncate">
                            {f.options.length} options
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {aiSuggestResult.templateTips?.length > 0 && (
                  <div className="rounded-lg bg-white border border-amber-100 p-3 space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-1">&#128161; Designer Tips</div>
                    <ul className="space-y-1 text-[12px] text-gray-700 list-disc list-inside">
                      {aiSuggestResult.templateTips.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter className="flex-wrap justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAiSuggestOpen(false)}
            disabled={aiSuggestLoading}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
})

/* ======================= TAB 4: PLACEHOLDER MAPPING ======================= */
const PlaceholderMappingTab = forwardRef(function PlaceholderMappingTab({ template, setTemplate, onReload, notify, activeDesignVersionId = null }, ref) {
  const versions = template.versions || []
  const exactVersion = activeDesignVersionId ? versions.find((v) => String(v.id) === String(activeDesignVersionId)) : null
  const currentVersion = exactVersion || (versions.find((v) => v.isCurrent) || versions[0] || null)
  const [placeholders, setPlaceholders] = useState([])
  const [phLoading, setPhLoading] = useState(false)

  const fields = useMemo(() => {
    if (!currentVersion) return []
    return [...(currentVersion.formFields || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }, [currentVersion?.id, currentVersion?.formFields])

  const lastKnownFieldsRef = useRef(fields || [])
  useEffect(() => { if (fields && fields.length) lastKnownFieldsRef.current = fields }, [fields])

  const mergedAllFields = useMemo(() => {
    const byId = new Map()
    ;(fields || []).forEach(f => {
      const rawId = f.id ?? f._cid
      if (rawId !== undefined && rawId !== null && String(rawId) !== '') {
        byId.set(String(rawId), true)
      }
    })
    const list = [...(fields || [])]
    lastKnownFieldsRef.current.forEach(f => {
      const rawId = f.id ?? f._cid
      if (rawId === undefined || rawId === null || String(rawId) === '') { list.push(f); return }
      if (!byId.has(String(rawId))) list.push(f)
    })
    const seen = new Set()
    const unique = []
    for (const f of list) {
      const rawId = f.id ?? f._cid
      const key = rawId !== undefined && rawId !== null && String(rawId) !== ''
        ? `__id:${String(rawId)}`
        : `__k:${String(f.fieldKey || f.fieldLabel || Math.random()).trim().toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(f)
    }
    return unique
  }, [fields])

  const lastKnownTemplateRef = useRef({ formFields: [], fieldMappings: [], versionIds: new Set() })
  const [mappings, setMappings] = useState([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [autoMapStats, setAutoMapStats] = useState(null)
  const [saveStatus, setSaveStatus] = useState(/** @type {'idle'|'saving'|'saved'|'error'} */ ('idle'))
  const saveTimerRef = useRef(null)
  const saveLockRef = useRef(false)
  const dirtyLatest = useRef(false)
  useEffect(() => { dirtyLatest.current = dirty }, [dirty])
  const placeholderRowsLatestLen = useRef(0)
  useEffect(() => { placeholderRowsLatestLen.current = placeholders.length }, [placeholders])
  const normPhKey = (s) => String(s || '').replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim().toUpperCase()

  const [phSidebarSearch, setPhSidebarSearch] = useState('')
  const [phGroupCollapsed, setPhGroupCollapsed] = useState({})
  const [mapSearch, setMapSearch] = useState('')
  const [mapStatusFilter, setMapStatusFilter] = useState('all')
  const [mapTypeFilter, setMapTypeFilter] = useState('')
  const [mapTypeCollapsed, setMapTypeCollapsed] = useState({})
  const [expandedRowIdx, setExpandedRowIdx] = useState(null)
  const [howToCollapsed, setHowToCollapsed] = useState(true)
  const [advancedRowIdx, setAdvancedRowIdx] = useState(null)
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: null, onConfirm: null, confirmLabel: 'Confirm', cancelLabel: 'Cancel', variant: 'default' })

  const fieldById = useMemo(() => {
    const m = new Map()
    mergedAllFields.forEach((f) => {
      const rawId = f.id ?? f._cid
      if (rawId !== undefined && rawId !== null && String(rawId) !== '') {
        m.set(String(rawId), f)
        if (typeof rawId === 'number') m.set(rawId, f)
      }
      if (f.fieldKey) m.set(String(f.fieldKey), f)
    })
    return m
  }, [mergedAllFields])

  const existingInputTypes = useMemo(() => {
    const s = new Set()
    mergedAllFields.forEach((f) => {
      if (f?.inputType) s.add(String(f.inputType).toUpperCase())
    })
    return s
  }, [mergedAllFields])

  const allowedPlaceholderTypes = useMemo(() => {
    const allow = new Set(['SIMPLE_VALUE'])
    existingInputTypes.forEach((t) => {
      switch (t) {
        case 'TABLE': allow.add('TABLE_ROWS'); break
        case 'REPEATER': allow.add('REPEATED_SECTION'); break
        case 'RICH_TEXT': allow.add('RICH_TEXT_CONTENT'); break
        case 'TEXTAREA': allow.add('RICH_TEXT_CONTENT'); break
        case 'IMAGE': allow.add('IMAGE'); break
        case 'ATTACHMENT': allow.add('IMAGE'); break
        case 'SYSTEM_GENERATED': allow.add('SYSTEM_GENERATED'); break
        default: allow.add('SIMPLE_VALUE'); break
      }
    })
    const hasHeaderFields = [...existingInputTypes].some((t) => t.includes('HEADER'))
    const hasFooterFields = [...existingInputTypes].some((t) => t.includes('FOOTER'))
    if (hasHeaderFields) allow.add('HEADER_FIELD')
    if (hasFooterFields) allow.add('FOOTER_FIELD')
    return allow
  }, [existingInputTypes])

  function clampPlaceholderType(suggestedType) {
    const s = String(suggestedType || 'SIMPLE_VALUE')
    if (allowedPlaceholderTypes.has(s)) return s
    return 'SIMPLE_VALUE'
  }

  const filteredPlaceholderTypes = useMemo(() => {
    return PLACEHOLDER_TYPES.filter((t) => allowedPlaceholderTypes.has(t))
  }, [allowedPlaceholderTypes])

  useEffect(() => {
    if (currentVersion && currentVersion.id) {
      let persisted = [...(template.fieldMappings || currentVersion.fieldMappings || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      persisted = persisted.map((r) => {
        const origType = r.placeholderType
        const clampedType = clampPlaceholderType(origType)
        if (origType !== clampedType) {
          return { ...r, placeholderType: clampedType, outputFormatJson: null }
        }
        return r
      })
      setMappings((prev) => {
        if (placeholders.length === 0 && prev.length === 0) return persisted
        const hasUnsavedLocal = dirtyLatest.current
        if (hasUnsavedLocal && prev.length > 0 && placeholders.length > 0) {
          let changed = false
          const fixed = prev.map((r, i) => {
            const rowPhKey = normPhKey(r.placeholderName)
            const ph = placeholders.find(p => normPhKey(getName(p)) === rowPhKey)
            if (!ph) {
              const curT = r.placeholderType; const clT = clampPlaceholderType(curT)
              if (curT !== clT) { changed = true; return { ...r, placeholderType: clT, outputFormatJson: null } }
              return r
            }
            const ctx = getPhContext(ph)
            const inferred = buildRowFromPlaceholder(ph, i, { preselectField: !!r.smartFormFieldId })
            let newRow = r
            if (r.placeholderType !== inferred.placeholderType) {
              newRow = { ...newRow, placeholderType: inferred.placeholderType }
              changed = true
            }
            if (!newRow.outputFormatJson && inferred.outputFormatJson) {
              newRow = { ...newRow, outputFormatJson: inferred.outputFormatJson }
              changed = true
            }
            const curT2 = newRow.placeholderType; const clT2 = clampPlaceholderType(curT2)
            if (curT2 !== clT2) { newRow = { ...newRow, placeholderType: clT2, outputFormatJson: null }; changed = true }
            return newRow
          })
          return changed ? fixed : prev
        }
        if (placeholders.length === 0) return (persisted.length > 0 ? persisted : prev)
        const byPh = new Map()
        persisted.forEach((r) => byPh.set(normPhKey(r.placeholderName), r))
        const existingRowsByName = new Map(prev.map((r) => [normPhKey(r.placeholderName), r]))
        let changed = false
        const merged = placeholders.map((p, i) => {
          const nm = getName(p)
          const k = normPhKey(nm)
          const inferred = buildRowFromPlaceholder(p, i, { preselectField: true })
          const foundDb = byPh.get(k)
          const prevRow = existingRowsByName.get(k)
          if (foundDb) {
            let mergedRow = { ...foundDb }
            const needRecomputeType = !mergedRow.placeholderType || mergedRow.placeholderType !== inferred.placeholderType
            const ctxBasedRow = inferred
            if (!mergedRow.placeholderType || needRecomputeType) {
              if (mergedRow.placeholderType !== ctxBasedRow.placeholderType) {
                changed = true
                mergedRow.placeholderType = ctxBasedRow.placeholderType
                const targetType = ctxBasedRow.placeholderType
                const clearFormat =
                  (targetType !== 'TABLE_ROWS' && typeof mergedRow.outputFormatJson === 'object' && mergedRow.outputFormatJson && ('headerRow' in mergedRow.outputFormatJson || 'columnWise' in mergedRow.outputFormatJson)) ||
                  (targetType !== 'IMAGE' && typeof mergedRow.outputFormatJson === 'object' && mergedRow.outputFormatJson && ('widthCm' in mergedRow.outputFormatJson)) ||
                  (targetType !== 'REPEATED_SECTION' && typeof mergedRow.outputFormatJson === 'object' && mergedRow.outputFormatJson && ('itemSeparator' in mergedRow.outputFormatJson)) ||
                  (targetType !== 'RICH_TEXT_CONTENT' && typeof mergedRow.outputFormatJson === 'object' && mergedRow.outputFormatJson && ('preserveLineBreaks' in mergedRow.outputFormatJson))
                if (clearFormat) mergedRow.outputFormatJson = ctxBasedRow.outputFormatJson || null
              }
            }
            const cT = mergedRow.placeholderType; const cC = clampPlaceholderType(cT)
            if (cT !== cC) { mergedRow.placeholderType = cC; mergedRow.outputFormatJson = null; changed = true }
            if (!mergedRow.outputFormatJson && ctxBasedRow.outputFormatJson && cC === ctxBasedRow.placeholderType) { changed = true; mergedRow.outputFormatJson = ctxBasedRow.outputFormatJson }
            if (prevRow && String(prevRow.id) === String(foundDb.id) && String(prevRow.smartFormFieldId) === String(foundDb.smartFormFieldId) && prevRow.placeholderType === mergedRow.placeholderType) {
              return prevRow
            }
            changed = true
            return mergedRow
          }
          if (prevRow && normPhKey(prevRow.placeholderName) === k) {
            let fixedRow = prevRow
            if (!fixedRow.placeholderType || fixedRow.placeholderType !== inferred.placeholderType) {
              fixedRow = { ...fixedRow, placeholderType: inferred.placeholderType }
              changed = true
            }
            if (!fixedRow.outputFormatJson && inferred.outputFormatJson) {
              fixedRow = { ...fixedRow, outputFormatJson: inferred.outputFormatJson }
              changed = true
            }
            const fT = fixedRow.placeholderType; const fC = clampPlaceholderType(fT)
            if (fT !== fC) { fixedRow = { ...fixedRow, placeholderType: fC, outputFormatJson: null }; changed = true }
            return fixedRow
          }
          changed = true
          return inferred
        })
        if (merged.length !== prev.length) changed = true
        return changed ? merged : prev
      })
      setDirty((d) => d)
      setSaveStatus('saved')
      setPhSidebarSearch('')
      setMapSearch('')
      setMapStatusFilter('all')
      setMapTypeFilter('')
      setPhGroupCollapsed({})
      setMapTypeCollapsed({})
      setExpandedRowIdx(null)
      setAdvancedRowIdx(null)
      if (placeholders.length === 0) loadPlaceholders(currentVersion.id)
    } else {
      setPlaceholders([])
      setMappings([])
      setDirty(false)
      setPhSidebarSearch('')
      setMapSearch('')
      setMapStatusFilter('all')
      setMapTypeFilter('')
    }
  }, [currentVersion?.id, currentVersion?.fieldMappings, template?.fieldMappings, placeholders])

  useEffect(() => {
    if (dirty) setSaveStatus('dirty')
    else if (saveStatus !== 'saving' && saveStatus !== 'error') setSaveStatus('saved')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  useEffect(() => {
    if (mappings.length === 0 || mergedAllFields.length === 0) return
    let changed = false
    const nextMappings = mappings.map((row, idx) => {
      let nextRow = row
      let field = null
      if (row.smartFormFieldId) {
        const fid = String(row.smartFormFieldId)
        field = fieldById.get(fid) || null
        if (!field) {
          const bestGuessByKey = findFieldByPlaceholder(row.placeholderName, mergedAllFields)
          if (bestGuessByKey) {
            field = bestGuessByKey
            const newId = field.id || field._cid || ''
            if (newId && String(newId) !== fid) {
              nextRow = { ...nextRow, smartFormFieldId: newId }
              changed = true
            }
          }
        }
      }
      const phName = getName(row.placeholderName)
      const phContext = (() => {
        const rowKey = normPhKey(phName)
        const p = placeholders.find(p => normPhKey(getName(p)) === rowKey)
        return p ? getPhContext(p) : 'SIMPLE'
      })()
      const context = phContext
      const ctxUpper = String(context || '').toUpperCase()
      const hasTableCtx = ctxUpper.includes('TABLE')
      const hasRepeaterCtx = ctxUpper.includes('REPEAT') || ctxUpper.includes('SECTION')
      const hasRichCtx = ctxUpper.includes('RICH') || ctxUpper.includes('TEXT_')
      const hasImageCtx = ctxUpper.includes('IMAGE') || ctxUpper.includes('PHOTO') || ctxUpper.includes('LOGO') || ctxUpper.includes('SIGNATURE')
      const hasHeaderCtx = ctxUpper.includes('HEADER')
      const hasFooterCtx = ctxUpper.includes('FOOTER')
      const needsTypeFix = !nextRow.placeholderType
      if (needsTypeFix) {
        if (!field) {
          let defaultPhType = 'SIMPLE_VALUE'
          if (hasTableCtx) defaultPhType = 'TABLE_ROWS'
          else if (hasRepeaterCtx) defaultPhType = 'REPEATED_SECTION'
          else if (hasRichCtx) defaultPhType = 'RICH_TEXT_CONTENT'
          else if (hasImageCtx) defaultPhType = 'IMAGE'
          else if (hasHeaderCtx) defaultPhType = 'HEADER_FIELD'
          else if (hasFooterCtx) defaultPhType = 'FOOTER_FIELD'
          defaultPhType = clampPlaceholderType(defaultPhType)
          if (nextRow.placeholderType !== defaultPhType) { nextRow = { ...nextRow, placeholderType: defaultPhType }; changed = true }
          return nextRow
        }
      }
      if (field) {
        const inferred = inferPlaceholderTypeAndFormat(field, phContext)
        inferred.phType = clampPlaceholderType(inferred.phType)
        const currType = nextRow.placeholderType || 'SIMPLE_VALUE'
        const typeMismatch = currType !== inferred.phType
        const staleFormatForTable = inferred.phType !== 'TABLE_ROWS' && typeof nextRow.outputFormatJson === 'object' && nextRow.outputFormatJson && ('headerRow' in nextRow.outputFormatJson || 'columnWise' in nextRow.outputFormatJson)
        const staleFormatForImage = inferred.phType !== 'IMAGE' && typeof nextRow.outputFormatJson === 'object' && nextRow.outputFormatJson && ('widthCm' in nextRow.outputFormatJson)
        const staleFormatForRepeater = inferred.phType !== 'REPEATED_SECTION' && typeof nextRow.outputFormatJson === 'object' && nextRow.outputFormatJson && ('itemSeparator' in nextRow.outputFormatJson)
        const staleFormatForRich = inferred.phType !== 'RICH_TEXT_CONTENT' && typeof nextRow.outputFormatJson === 'object' && nextRow.outputFormatJson && ('preserveLineBreaks' in nextRow.outputFormatJson)
        if (typeMismatch || staleFormatForTable || staleFormatForImage || staleFormatForRepeater || staleFormatForRich) {
          changed = true
          nextRow = { ...nextRow, placeholderType: inferred.phType }
          if (typeMismatch || staleFormatForTable || staleFormatForImage || staleFormatForRepeater || staleFormatForRich) {
            nextRow.outputFormatJson = inferred.outputFormat || null
          }
        }
      } else {
        const currType = nextRow.placeholderType
        const clamped = clampPlaceholderType(currType)
        if (currType !== clamped) {
          changed = true
          nextRow = { ...nextRow, placeholderType: clamped, outputFormatJson: null }
        }
      }
      return nextRow
    })
    if (changed) {
      setMappings(nextMappings)
      setDirty(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedAllFields])

  // Previous 2nd merge useEffect (dep placeholders only) — DEPRECATED & REMOVED to avoid race condition double setMappings

  function getPlaceholderByName(name) {
    const tgt = normPhKey(name)
    return placeholders.find((p) => normPhKey(getName(p)) === tgt) || name
  }

  function buildRowFromPlaceholder(nameOrObj, index, opts = {}) {
    const name = getName(nameOrObj)
    const context = getPhContext(nameOrObj)
    const ctxUpper = String(context || '').toUpperCase()
    const hasTableCtx = ctxUpper.includes('TABLE')
    const hasRepeaterCtx = ctxUpper.includes('REPEAT') || ctxUpper.includes('SECTION')
    const hasRichCtx = ctxUpper.includes('RICH') || ctxUpper.includes('TEXT_')
    const hasImageCtx = ctxUpper.includes('IMAGE') || ctxUpper.includes('PHOTO') || ctxUpper.includes('LOGO') || ctxUpper.includes('SIGNATURE')
    const hasHeaderCtx = ctxUpper.includes('HEADER')
    const hasFooterCtx = ctxUpper.includes('FOOTER')
    let matchedField = opts.preselectField ? findFieldByPlaceholder(name, mergedAllFields) : null
    let phType = 'SIMPLE_VALUE'
    let outputFormat = null
    if (matchedField) {
      const inferred = inferPlaceholderTypeAndFormat(matchedField, context)
      phType = clampPlaceholderType(inferred.phType)
      outputFormat = inferred.outputFormat
    } else {
      if (hasTableCtx) phType = 'TABLE_ROWS'
      else if (hasRepeaterCtx) phType = 'REPEATED_SECTION'
      else if (hasRichCtx) phType = 'RICH_TEXT_CONTENT'
      else if (hasImageCtx) phType = 'IMAGE'
      else if (hasHeaderCtx) phType = 'HEADER_FIELD'
      else if (hasFooterCtx) phType = 'FOOTER_FIELD'
      else phType = 'SIMPLE_VALUE'
      phType = clampPlaceholderType(phType)
    }
    return {
      placeholderName: name,
      smartFormFieldId: matchedField ? (matchedField.id || matchedField._cid || '') : '',
      placeholderType: phType,
      outputFormatJson: outputFormat,
      targetSectionName: null,
      repeatParentTag: null,
      sortOrder: index + 1
    }
  }

  async function loadPlaceholders(vid) {
    setPhLoading(true)
    try {
      const res = await api.get(`/smart-templates/versions/${vid}/placeholders`)
      const dataPayload = res?.data?.data
      const list = Array.isArray(dataPayload) ? dataPayload
        : Array.isArray(dataPayload?.placeholders) ? dataPayload.placeholders
        : Array.isArray(res?.data?.placeholders) ? res.data.placeholders
        : []
      setPlaceholders(list)
      if (mappings.length === 0 && list.length > 0) {
        setMappings(list.map((p, i) => buildRowFromPlaceholder(p, i, { preselectField: false })))
      }
    } catch (err) {
      console.error('load placeholders err', err)
    } finally {
      setPhLoading(false)
    }
  }

  function sidebarGroupKeyForPlaceholder(p) {
    const ctx = getPhContext(p)
    const ctxUpper = String(ctx || 'SIMPLE').toUpperCase()
    let suggested = 'SIMPLE_VALUE'
    if (ctxUpper.includes('TABLE_ROW') || ctxUpper === 'TABLE') suggested = 'TABLE_ROWS'
    else if (ctxUpper.includes('REPEAT') || ctxUpper.includes('SECTION')) suggested = 'REPEATED_SECTION'
    else if (ctxUpper.includes('RICH') || ctxUpper.includes('TEXT_')) suggested = 'RICH_TEXT_CONTENT'
    else if (ctxUpper.includes('IMAGE') || ctxUpper.includes('PHOTO') || ctxUpper.includes('LOGO') || ctxUpper.includes('SIGNATURE')) suggested = 'IMAGE'
    else if (ctxUpper.includes('HEADER')) suggested = 'HEADER_FIELD'
    else if (ctxUpper.includes('FOOTER')) suggested = 'FOOTER_FIELD'
    else suggested = 'SIMPLE_VALUE'
    const clamped = clampPlaceholderType(suggested)
    switch (clamped) {
      case 'TABLE_ROWS': return 'TABLE_ROW'
      case 'REPEATED_SECTION': return 'REPEAT_SECTION'
      case 'RICH_TEXT_CONTENT': return 'RICH_TEXT'
      case 'IMAGE': return 'IMAGE'
      case 'HEADER_FIELD': return 'HEADER'
      case 'FOOTER_FIELD': return 'FOOTER'
      case 'SIMPLE_VALUE':
      default: return 'SIMPLE'
    }
  }

  const groupedPlaceholders = useMemo(() => {
    const m = {}
    placeholders.forEach((p) => {
      const groupKey = sidebarGroupKeyForPlaceholder(p)
      m[groupKey] = m[groupKey] || []
      m[groupKey].push(p)
    })
    return m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholders, allowedPlaceholderTypes])

  const mappingByNormKey = useMemo(() => {
    const m = new Map()
    mappings.forEach((row) => {
      if (!row) return
      const key = normPhKey(row.placeholderName)
      if (key) m.set(key, row)
    })
    return m
  }, [mappings, normPhKey])

  function ensureRowFor(name) {
    setMappings((list) => {
      const tgtKey = normPhKey(name)
      if (list.some((r) => normPhKey(r.placeholderName) === tgtKey)) return list
      const ph = getPlaceholderByName(name)
      return [...list, buildRowFromPlaceholder(ph, list.length, { preselectField: true })]
    })
    setDirty(true)
  }

  function updateRow(idx, patch) {
    setMappings((list) => {
      let next = [...list]
      if ('smartFormFieldId' in patch && patch.smartFormFieldId) {
        const newFid = String(patch.smartFormFieldId)
        next = next.map((r, i) => {
          if (i !== idx && r.smartFormFieldId && String(r.smartFormFieldId) === newFid) {
            notify(`⚠️ Form Field "${newFid}" was already mapped to placeholder "${r.placeholderName}" — auto-unmapped it to avoid DB unique constraint violation.`, 'warning')
            return { ...r, smartFormFieldId: null }
          }
          return r
        })
      }
      return next.map((r, i) => {
        if (i !== idx) return r
        const nextRow = { ...r, ...patch }
        if ('smartFormFieldId' in patch || 'placeholderType' in patch) {
          const fieldId = nextRow.smartFormFieldId
          const field = fieldId ? (fieldById.get(String(fieldId)) || null) : null
          if ('smartFormFieldId' in patch && field) {
            const phContext = getPhContext(getPlaceholderByName(nextRow.placeholderName))
            const inferred = inferPlaceholderTypeAndFormat(field, phContext)
            const clampedInferredPhType = clampPlaceholderType(inferred.phType)
            if (!('placeholderType' in patch)) {
              nextRow.placeholderType = clampedInferredPhType
            } else {
              nextRow.placeholderType = clampPlaceholderType(nextRow.placeholderType)
            }
            const staleFormatForTable = nextRow.placeholderType !== 'TABLE_ROWS' && typeof nextRow.outputFormatJson === 'object' && nextRow.outputFormatJson && ('headerRow' in nextRow.outputFormatJson || 'columnWise' in nextRow.outputFormatJson)
            const staleFormatForImage = nextRow.placeholderType !== 'IMAGE' && typeof nextRow.outputFormatJson === 'object' && nextRow.outputFormatJson && ('widthCm' in nextRow.outputFormatJson)
            const staleFormatForRepeater = nextRow.placeholderType !== 'REPEATED_SECTION' && typeof nextRow.outputFormatJson === 'object' && nextRow.outputFormatJson && ('itemSeparator' in nextRow.outputFormatJson)
            const staleFormatForRich = nextRow.placeholderType !== 'RICH_TEXT_CONTENT' && typeof nextRow.outputFormatJson === 'object' && nextRow.outputFormatJson && ('preserveLineBreaks' in nextRow.outputFormatJson)
            if (!nextRow.outputFormatJson || (inferred.outputFormat && clampedInferredPhType === inferred.phType) || staleFormatForTable || staleFormatForImage || staleFormatForRepeater || staleFormatForRich) {
              nextRow.outputFormatJson = (clampedInferredPhType === inferred.phType ? (inferred.outputFormat || null) : null)
            }
          } else if ('placeholderType' in patch) {
            nextRow.placeholderType = clampPlaceholderType(nextRow.placeholderType)
            if (!nextRow.outputFormatJson) {
              const phType = nextRow.placeholderType
              const inputType = field && field.inputType ? field.inputType : null
              const preset = inputType
                ? (OUTPUT_FORMAT_PRESETS[phType] || {})[inputType] || null
                : null
              if (preset) nextRow.outputFormatJson = { ...preset }
            }
          }
        }
        if (nextRow.placeholderType !== undefined) {
          nextRow.placeholderType = clampPlaceholderType(nextRow.placeholderType)
        }
        return nextRow
      })
    })
    setDirty(true)
  }

  function applyFormatPreset(idx, presetObj) {
    if (!presetObj) return
    setMappings((list) => list.map((r, i) => (i === idx ? { ...r, outputFormatJson: { ...presetObj } } : r)))
    setDirty(true)
  }

  function removeRow(idx) {
    setMappings((list) => list.filter((_, i) => i !== idx))
    setDirty(true)
  }

  async function handleGenerateFieldsAndMap() {
    if (!currentVersion) { notify('Create or select a version first', 'warning'); return }
    if (!placeholders.length) { notify('No placeholders extracted yet — upload a DOCX in the Versions step first.', 'warning'); return }

    setSaving(true)
    setError('')
    try {
      const alreadyKeys = new Set(mergedAllFields.map(f => String(f.fieldKey || '').trim().toUpperCase()).filter(Boolean))
      const newFields = []
      placeholders.forEach((p, i) => {
        const generated = inferFieldFromPlaceholder(p, i + mergedAllFields.length + newFields.length)
        if (alreadyKeys.has(String(generated.fieldKey).toUpperCase())) return
        alreadyKeys.add(String(generated.fieldKey).toUpperCase())
        newFields.push(generated)
      })
      if (!newFields.length && mergedAllFields.length > 0) {
        notify(`All ${placeholders.length} placeholders already have matching Form Fields by key — running Auto Map now.`, 'info')
        setSaving(false)
        handleAutoMapAll(true, mergedAllFields)
        return
      }
      const payload = {
        fields: [
          ...mergedAllFields.map((f) => ({
            id: f.id,
            fieldKey: f.fieldKey,
            fieldLabel: f.fieldLabel,
            fieldHelpText: f.fieldHelpText !== undefined ? f.fieldHelpText : (f.helpText || null),
            inputType: f.inputType,
            smartTemplateSectionId: f.smartTemplateSectionId ?? (f.sectionId ? Number(f.sectionId) : null),
            sortOrder: Number(f.sortOrder ?? 0),
            isMandatory: !!f.isMandatory,
            isEditableAuthor: !!f.isEditableAuthor,
            isEditableReviewer: !!f.isEditableReviewer,
            isVisibleInForm: !!f.isVisibleInForm,
            isSearchable: !!f.isSearchable,
            isSupportingField: !!f.isSupportingField,
            optionsJson: (typeof f.optionsJson === 'string') ? (f.optionsJson ? JSON.parse(f.optionsJson) : null) : (f.optionsJson || null),
            validationRulesJson: (typeof f.validationRulesJson === 'string') ? (f.validationRulesJson ? JSON.parse(f.validationRulesJson) : null) : (f.validationRulesJson || null),
            defaultValueJson: (typeof f.defaultValueJson === 'string') ? (f.defaultValueJson ? JSON.parse(f.defaultValueJson) : null) : (f.defaultValueJson || null),
            tableSchemaJson: (typeof f.tableSchemaJson === 'string') ? (f.tableSchemaJson ? JSON.parse(f.tableSchemaJson) : null) : (f.tableSchemaJson || null),
            repeaterSchemaJson: (typeof f.repeaterSchemaJson === 'string') ? (f.repeaterSchemaJson ? JSON.parse(f.repeaterSchemaJson) : null) : (f.repeaterSchemaJson || null),
            imageConfigJson: (typeof f.imageConfigJson === 'string') ? (f.imageConfigJson ? JSON.parse(f.imageConfigJson) : null) : (f.imageConfigJson || null),
            attachmentConfigJson: (typeof f.attachmentConfigJson === 'string') ? (f.attachmentConfigJson ? JSON.parse(f.attachmentConfigJson) : null) : (f.attachmentConfigJson || null),
            systemFieldConfigJson: (typeof f.systemFieldConfigJson === 'string') ? (f.systemFieldConfigJson ? JSON.parse(f.systemFieldConfigJson) : null) : (f.systemFieldConfigJson || null)
          })),
          ...newFields
        ]
      }
      const res = await api.put(`/smart-templates/versions/${currentVersion.id}/fields`, payload)
      const savedFields = Array.isArray(res?.data?.data?.fields) ? res.data.data.fields
        : Array.isArray(res?.data?.fields) ? res.data.fields : []
      lastKnownFieldsRef.current = savedFields.length ? savedFields : payload.fields
      notify(`Generated ${newFields.length} new Form Fields from DOCX placeholders. Saved ${payload.fields.length} total fields.`, 'success')
      handleAutoMapAll(true, lastKnownFieldsRef.current)
      setTimeout(() => onReload(), 0)
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Generate fields failed'
      setError(msg)
      notify(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleAutoMapAll(fromGenerate = false, fieldsOverride = null) {
    const fieldsToUse = Array.isArray(fieldsOverride) && fieldsOverride.length
      ? fieldsOverride
      : mergedAllFields
    if (!placeholders.length) { notify('No placeholders loaded', 'warning'); return }
    if (!fieldsToUse.length) {
      notify('No Form Fields defined yet. Go back to Step 4 — Form Fields and click "Auto-Generate Fields + Map" to create fields from placeholders, or define fields manually.', 'warning')
      return
    }
    let autoCount = 0
    let total = placeholders.length
    const byName = new Map(mappings.map((r, idx) => [normPhKey(r.placeholderName), idx]))
    const usedFieldIds = new Set()
    const nextMappings = [...mappings]
    nextMappings.forEach((r) => { if (r.smartFormFieldId) usedFieldIds.add(String(r.smartFormFieldId)) })
    placeholders.forEach((p, i) => {
      const name = getName(p)
      const nameKey = normPhKey(name)
      const field = findFieldByPlaceholder(name, fieldsToUse)
      if (!field) return
      const fieldKey = String(field.id ?? field._cid ?? (field.fieldKey ? ('__key:' + String(field.fieldKey)) : ''))
      if (!fieldKey) return
      if (usedFieldIds.has(fieldKey)) return
      let idx = byName.get(nameKey)
      const phContext = getPhContext(p)
      const inferred = inferPlaceholderTypeAndFormat(field, phContext)
      const safePhType = clampPlaceholderType(inferred.phType)
      const safeOutputFormat = (safePhType === inferred.phType) ? inferred.outputFormat : null
      if (typeof idx === 'number') {
        const existing = nextMappings[idx]
        const currVal = existing.smartFormFieldId ? String(existing.smartFormFieldId) : ''
        if (!currVal || currVal !== fieldKey || existing.placeholderType !== safePhType) {
          nextMappings[idx] = {
            ...existing,
            smartFormFieldId: fieldKey,
            placeholderType: safePhType,
            outputFormatJson: (existing.placeholderType === safePhType && existing.outputFormatJson) || safeOutputFormat
          }
          usedFieldIds.add(fieldKey)
          autoCount++
        }
      } else {
        nextMappings.push({
          placeholderName: name,
          smartFormFieldId: fieldKey,
          placeholderType: safePhType,
          outputFormatJson: safeOutputFormat,
          targetSectionName: null,
          repeatParentTag: null,
          sortOrder: nextMappings.length + 1
        })
        usedFieldIds.add(fieldKey)
        byName.set(nameKey, nextMappings.length - 1)
        autoCount++
      }
    })
    setMappings(nextMappings)
    setDirty(true)
    setAutoMapStats({ matched: autoCount, total })
    notify(`Auto-mapped ${autoCount}/${total} placeholders to Form Fields`, autoCount ? 'success' : 'warning')
  }

  async function handleSaveAll() {
    const res = await validateAndSave()
    if (!res.ok) {
      notify(res.errorMessage || 'Save failed', 'error')
    } else if (res.successMessage) {
      notify(res.successMessage, 'success')
    }
  }

  async function validateAndSave() {
    if (!currentVersion) {
      return { ok: false, errorTitle: 'No version selected', errorMessage: 'Create or upload a DOCX version first before mapping placeholders.' }
    }
    if (currentVersion.isLocked) {
      return { ok: false, errorTitle: 'Version is locked (published)', errorMessage: 'This version v' + (currentVersion.versionNo || '') + ' is published / locked. You cannot modify placeholder mappings. Click "Clone as New Draft & Design" in the Versions tab to create an editable draft copy first.' }
    }
    if (!dirty && mappings.every((r) => r.id)) {
      return { ok: true, successMessage: '' }
    }
    setError(''); setSaving(true)
    try {
      for (const r of mappings) {
        if (!r.placeholderName || !String(r.placeholderName).trim()) {
          return { ok: false, errorTitle: 'Empty placeholder name', errorMessage: 'One of the mapping rows has an empty placeholder name. Refresh placeholders or remove the empty row.' }
        }
        if (r.outputFormatJson && typeof r.outputFormatJson === 'string' && r.outputFormatJson.trim()) {
          try { JSON.parse(r.outputFormatJson) } catch { return { ok: false, errorTitle: 'Invalid Output Format JSON', errorMessage: `Output Format for "${r.placeholderName}" is invalid JSON.` } }
        }
      }
      const fieldSeen = new Map()
      for (const r of mappings) {
        if (!r.smartFormFieldId) continue
        const fid = String(r.smartFormFieldId)
        if (fieldSeen.has(fid)) {
          const first = fieldSeen.get(fid)
          const fieldLabel = fieldById.get(fid) ? (`${fieldById.get(fid).fieldKey} [${fieldById.get(fid).inputType}]`) : fid
          return {
            ok: false,
            errorTitle: 'Form Field mapped to multiple placeholders',
            errorMessage: `Smart Form Field ${fieldLabel} cannot be mapped twice. It is already mapped to "${first}", but also currently selected for "${r.placeholderName}". DB schema enforces a 1:1 unique constraint on field → placeholder mapping (smartFormFieldId UNIQUE). Pick a different Form Field for one of these placeholders, or use "Auto-Generate Fields + Map" in Step 4 — Form Fields to create unique fields for each placeholder.`
          }
        }
        fieldSeen.set(fid, r.placeholderName)
      }
      const body = {
        mappings: mappings.map((r, i) => ({
          id: r.id,
          placeholderName: String(r.placeholderName).trim(),
          smartFormFieldId: r.smartFormFieldId ? String(r.smartFormFieldId) : null,
          placeholderType: r.placeholderType,
          outputFormatJson: tryParseJson(r.outputFormatJson, null),
          targetSectionName: r.targetSectionName || null,
          repeatParentTag: r.repeatParentTag || null,
          sortOrder: Number(r.sortOrder ?? i + 1)
        }))
      }
      const res = await api.put(`/smart-templates/versions/${currentVersion.id}/field-mappings`, body)
      setDirty(false)
      setAutoMapStats(null)
      await onReload()
      return { ok: true, successMessage: 'Placeholder mappings saved' }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Save failed'
      setError(msg)
      return { ok: false, errorTitle: 'Save failed', errorMessage: msg }
    } finally {
      setSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({
    validateAndSave
  }))

  const systemPlaceholderCount = mappings.filter((r) => isSystemReservedPlaceholder(r.placeholderName)).length
  const totalMapped = mappings.filter((r) => isSystemReservedPlaceholder(r.placeholderName) ? true : !!r.smartFormFieldId).length
  const totalUnmapped = mappings.filter((r) => !isSystemReservedPlaceholder(r.placeholderName) && !r.smartFormFieldId).length
  const supportingFieldsCount = mergedAllFields.filter((f) => f && f.isSupportingField).length
  const conditionalFieldsCount = mergedAllFields.filter((f) => f && !f.isSupportingField && hasConditionalVisibilityEnabled(f)).length
  const mappedRequiredFieldCount = mergedAllFields.filter((f) => f && isIndividualMappingRequired(f)).length
  const hasSupportingPlaceholder = placeholders.some((p) => {
    const name = (p.name || p.placeholderName || '').replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim().toLowerCase()
    return name === 'supporting_data'
  })
  const allSupportingFieldList = mergedAllFields.filter((f) => f && f.isSupportingField)

  const sidebarFilteredPlaceholders = useMemo(() => {
    const q = phSidebarSearch.trim().toLowerCase()
    if (!q) return null
    return placeholders.filter((p) => getName(p).toLowerCase().includes(q))
  }, [placeholders, phSidebarSearch])

  const filteredMappings = useMemo(() => {
    const q = mapSearch.trim().toLowerCase()
    let list = [...mappings]
    if (q) list = list.filter((r) => r.placeholderName.toLowerCase().includes(q) || (() => {
      const fld = r.smartFormFieldId ? (fieldById.get(String(r.smartFormFieldId)) || null) : null
      return fld ? ((fld.fieldKey || '').toLowerCase().includes(q) || (fld.fieldLabel || '').toLowerCase().includes(q)) : false
    })())
    if (mapStatusFilter === 'mapped') list = list.filter((r) => isSystemReservedPlaceholder(r.placeholderName) ? true : !!r.smartFormFieldId)
    if (mapStatusFilter === 'unmapped') list = list.filter((r) => isSystemReservedPlaceholder(r.placeholderName) ? false : !r.smartFormFieldId)
    if (mapTypeFilter) list = list.filter((r) => r.placeholderType === mapTypeFilter)
    return list
  }, [mappings, mapSearch, mapStatusFilter, mapTypeFilter, fieldById])

  const groupedMappingsByType = useMemo(() => {
    const byType = {}
    filteredMappings.forEach((r, i) => {
      const t = r.placeholderType || 'SIMPLE_VALUE'
      byType[t] = byType[t] || []
      byType[t].push({ row: r, originalIndex: mappings.indexOf(r) })
    })
    return byType
  }, [filteredMappings, mappings])

  function togglePhGroup(k) { setPhGroupCollapsed((p) => ({ ...p, [k]: !p[k] })) }
  function toggleMapTypeGroup(k) { setMapTypeCollapsed((p) => ({ ...p, [k]: !p[k] })) }
  function toggleRow(idx) { setExpandedRowIdx((prev) => (prev === idx ? null : idx)) }

  function getMapTypeColor(t) {
    switch (t) {
      case 'SIMPLE_VALUE': return 'bg-sky-50 border-sky-200 text-sky-700'
      case 'RICH_TEXT_CONTENT': return 'bg-violet-50 border-violet-200 text-violet-700'
      case 'TABLE_ROWS': return 'bg-rose-50 border-rose-200 text-rose-700'
      case 'IMAGE': return 'bg-pink-50 border-pink-200 text-pink-700'
      case 'REPEATED_SECTION': return 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700'
      case 'HEADER_FIELD': return 'bg-indigo-50 border-indigo-200 text-indigo-700'
      case 'FOOTER_FIELD': return 'bg-indigo-50 border-indigo-200 text-indigo-700'
      default: return 'bg-gray-50 border-gray-200 text-gray-700'
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Placeholder Mapping"
        subtitle={currentVersion ? `Map DOCX placeholders → Smart Form fields for v${currentVersion.versionNo}` : 'Create a version and upload a DOCX first.'}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {saveStatus !== 'idle' && (
              <span className={[
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border',
                saveStatus === 'saving' ? 'bg-sky-50 text-sky-700 border-sky-200' : '',
                saveStatus === 'saved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : '',
                saveStatus === 'dirty' ? 'bg-amber-50 text-amber-700 border-amber-200' : '',
                saveStatus === 'error' ? 'bg-red-50 text-red-700 border-red-200' : ''
              ].filter(Boolean).join(' ')}>
                {saveStatus === 'saving' && <><svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg> Saving...</>}
                {saveStatus === 'saved' && <><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> Saved</>}
                {saveStatus === 'dirty' && <><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Unsaved changes — click Next to save</>}
                {saveStatus === 'error' && <><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Save failed</>}
              </span>
            )}
            <Button
              variant="secondary"
              onClick={handleAutoMapAll}
              disabled={!currentVersion || !placeholders.length}
              title={
                !currentVersion ? 'Create or select a version first'
                  : !placeholders.length ? 'No DOCX placeholders extracted yet'
                  : !mergedAllFields.length ? 'No Form Fields yet — create in Step 4.'
                  : 'Auto-match by normalized Field Key / Label.'
              }
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Auto Map
            </Button>
            <Button variant="secondary" onClick={() => currentVersion && loadPlaceholders(currentVersion.id)} loading={phLoading}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Refresh
            </Button>
          </div>
        }
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">{error}</div>}

      {currentVersion && (
        <div className={['rounded-lg border px-4 transition-all', howToCollapsed ? 'border-gray-200 bg-white py-2' : 'border-sky-200 bg-sky-50 py-3'].join(' ')}>
          <button
            type="button"
            onClick={() => setHowToCollapsed(!howToCollapsed)}
            className="w-full flex items-center gap-2 text-left"
          >
            <svg className={['h-4 w-4 text-sky-700 transition-transform', howToCollapsed ? '-rotate-90' : ''].join(' ')} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            <span className="font-semibold text-sm text-sky-900">How to use Placeholder Mapping</span>
            {placeholders.length > 0 && (
              <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium">
                <span className="bg-white/60 px-2 py-0.5 rounded-full border border-sky-200 text-sky-800">Extracted: <strong>{placeholders.length}</strong></span>
                <span className="bg-white/60 px-2 py-0.5 rounded-full border border-sky-200 text-sky-800">Mappings: <strong>{mappings.length}</strong></span>
                <span className="bg-white/60 px-2 py-0.5 rounded-full border border-emerald-200 text-emerald-700">Mapped: <strong>{totalMapped}</strong></span>
                {totalUnmapped > 0 && <span className="bg-white/60 px-2 py-0.5 rounded-full border border-amber-200 text-amber-700">Unmapped: <strong>{totalUnmapped}</strong></span>}
                {supportingFieldsCount > 0 && (
                  <span className={[
                    'px-2 py-0.5 rounded-full border',
                    hasSupportingPlaceholder
                      ? 'bg-teal-50 text-teal-700 border-teal-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  ].join(' ')}>
                    Supporting: <strong>{supportingFieldsCount}</strong>
                    {hasSupportingPlaceholder
                      ? ' (auto-render)'
                      : ` — add {{supporting_data}} placeholder to DOCX to render these fields`}
                  </span>
                )}
                {autoMapStats && <span className="text-sky-700">Last: {autoMapStats.matched}/{autoMapStats.total}</span>}
              </span>
            )}
          </button>
          {!howToCollapsed && (
            <ol className="list-decimal pl-7 mt-2 pt-2 border-t border-sky-200/60 space-y-1 text-xs text-sky-800">
              <li><strong>Define Form Fields</strong> in the <em>Form Fields</em> tab first. They auto-save as you edit.</li>
              <li><strong>Upload DOCX</strong> in <em>Versions</em> tab; placeholders are extracted automatically.</li>
              <li>Click <strong>"Auto Map"</strong> to match by name, or click left-panel rows + click mapping rows to expand & edit details.</li>
              <li>Pick correct <strong>Placeholder Type</strong>; <em className="font-medium">all changes auto-save 800ms after you stop editing.</em></li>
              <li>💡 <strong>Supporting Field block</strong> — Toggle <code className="bg-white/70 px-1.5 py-0.5 rounded border border-sky-200 font-mono">Supporting=ON</code> on any field in Step 4, then put <code className="bg-white/70 px-1.5 py-0.5 rounded border border-sky-200 font-mono">{'{{supporting_data}}'}</code> anywhere in your DOCX. All supporting fields will auto-render as a formatted Supporting Information table — no individual mapping required.</li>
              <li>Go to <em>Preview &amp; Test</em> to fill real values and generate a PDF preview.</li>
            </ol>
          )}
        </div>
      )}

      {!currentVersion ? (
        <EmptyPanelState title="No version" description="Create a version and upload a DOCX file to see placeholders here." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ===== LEFT: PLACEHOLDERS (3 cols, compact) ===== */}
          <div className="lg:col-span-3">
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-3 py-2.5 border-b border-gray-200 bg-gray-50/60 space-y-2">
                <div>
                  <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide">Extracted Placeholders</h3>
                </div>
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <TextInput
                    value={phSidebarSearch}
                    onChange={(e) => setPhSidebarSearch(e.target.value)}
                    placeholder="Search placeholders..."
                    className="pl-8 text-xs py-1.5 h-8"
                  />
                </div>
              </div>
              <div className="max-h-[540px] overflow-y-auto">
                {phLoading ? (
                  <div className="p-4 text-xs text-gray-500"><InlineSpinner className="h-4 w-4 inline mr-2 align-middle border-gray-200 border-t-blue-600" />Loading...</div>
                ) : placeholders.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-500">Upload a DOCX in Versions tab to extract placeholders.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {(() => {
                      const groups = sidebarFilteredPlaceholders ? { 'Search Results': sidebarFilteredPlaceholders } : groupedPlaceholders
                      return Object.entries(groups).map(([ctx, list]) => {
                        const collapsed = !!phGroupCollapsed[ctx]
                        return (
                          <div key={ctx} className="last:border-b-0">
                            <button
                              type="button"
                              onClick={() => togglePhGroup(ctx)}
                              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50/60 hover:bg-gray-100/60"
                            >
                              <svg className={['h-3 w-3 text-gray-500 transition-transform flex-shrink-0', collapsed ? '-rotate-90' : ''].join(' ')} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                              <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">{ctx}</span>
                              <span className="ml-auto text-[10px] font-medium text-gray-500 bg-white px-1.5 py-0.5 rounded-full border border-gray-200">{list.length}</span>
                            </button>
                            {!collapsed && (
                              <div className="px-2 py-1 space-y-0.5">
                                {list.map((p, i) => {
                                  const name = getName(p)
                                  const nameKey = normPhKey(name)
                                  const rowForPlaceholder = mappingByNormKey.get(nameKey) || null
                                  const addedToList = !!rowForPlaceholder
                                  const isSysReserved = isSystemReservedPlaceholder(name)
                                  const fieldIsMapped = addedToList && (isSysReserved || !!rowForPlaceholder.smartFormFieldId)
                                  return (
                                    <div
                                      key={i}
                                      onClick={() => {
                                        ensureRowFor(name)
                                        setTimeout(() => {
                                          const idx = mappings.findIndex((r) => normPhKey(r.placeholderName) === nameKey)
                                          if (idx >= 0) { toggleRow(idx); document.getElementById(`map-row-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
                                        }, 0)
                                      }}
                                      className={[
                                        'group cursor-pointer flex items-center gap-2 rounded-md px-2 py-1.5 text-xs border transition-all',
                                        isSysReserved
                                          ? (fieldIsMapped
                                            ? 'bg-teal-50/70 border-teal-200/80 hover:bg-teal-50'
                                            : 'bg-teal-50/40 border-teal-200/40 hover:bg-teal-50/60')
                                          : fieldIsMapped ? 'bg-emerald-50/60 border-emerald-200/60 hover:bg-emerald-50' :
                                        addedToList ? 'bg-amber-50/60 border-amber-200/60 hover:bg-amber-50' :
                                        'bg-transparent border-transparent hover:bg-gray-50 hover:border-gray-200'
                                      ].join(' ')}
                                    >
                                      <span className="flex-shrink-0 w-3.5 h-3.5 inline-flex items-center justify-center">
                                        {isSysReserved
                                          ? <svg className="h-3 w-3 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                          : fieldIsMapped
                                          ? <svg className="h-3 w-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
                                          : addedToList
                                            ? <svg className="h-3 w-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 110-16 8 8 0 010 16zm1-11a1 1 0 00-2 0v4a1 1 0 00.3.7l2.8 2.8a1 1 0 001.4-1.4L11 10.6V7z" /></svg>
                                            : <svg className="h-3 w-3 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                        }
                                      </span>
                                        <div className="truncate flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <div className="text-xs font-mono font-medium text-gray-800 truncate leading-tight">{toFieldKeyFormat(name)}</div>
                                          {isSysReserved && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border bg-teal-100 text-teal-800 border-teal-200 uppercase tracking-wider">System</span>}
                                        </div>
                                        <div className="text-[10px] text-gray-500 truncate opacity-80 leading-tight mt-0.5">
                                          {toPlaceholderTag(name)}
                                          {isSysReserved && <span className="ml-1 text-teal-700">· Auto-renders supporting fields</span>}
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== RIGHT: MAPPINGS (9 cols, collapsible groups + table rows with expand) ===== */}
          <div className="lg:col-span-9 space-y-3">
            {/* Filter bar */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 grid grid-cols-3 gap-2.5 items-center">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <TextInput
                  value={mapSearch}
                  onChange={(e) => setMapSearch(e.target.value)}
                  placeholder="Search by placeholder, field key/label..."
                  className="pl-8 text-xs py-1.5 h-8 w-full"
                />
              </div>
              <SelectField value={mapStatusFilter} onChange={(e) => setMapStatusFilter(e.target.value)} className="text-xs py-1.5 h-8 w-full">
                <option value="all">All Status</option>
                <option value="mapped">Mapped only</option>
                <option value="unmapped">Unmapped only</option>
              </SelectField>
              <div className="flex items-center gap-2">
                <SelectField value={mapTypeFilter} onChange={(e) => setMapTypeFilter(e.target.value)} className="text-xs py-1.5 h-8 flex-1">
                  <option value="">All Types</option>
                  {filteredPlaceholderTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </SelectField>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setMapSearch(''); setMapStatusFilter('all'); setMapTypeFilter('') }}
                  className="text-xs py-1.5 h-8 flex-shrink-0"
                >
                  Clear
                </Button>
              </div>
            </div>

            {mappings.length === 0 ? (
              <EmptyPanelState title="No mappings yet" description="Click left-panel placeholders or click Auto Map above to get started." />
            ) : filteredMappings.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-sm text-gray-500">No mappings match the current filters.</div>
            ) : (
              <div className="space-y-3">
                {filteredPlaceholderTypes.map((typeKey) => {
                  const group = groupedMappingsByType[typeKey]
                  if (!group || group.length === 0) return null
                  const collapsed = !!mapTypeCollapsed[typeKey]
                  const mappedCount = group.filter(x => isSystemReservedPlaceholder(x.row.placeholderName) ? true : !!x.row.smartFormFieldId).length
                  return (
                    <div key={typeKey} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleMapTypeGroup(typeKey)}
                        className={['w-full flex items-center gap-3 px-3.5 py-2.5 border-b border-gray-200 transition-colors', getMapTypeColor(typeKey), collapsed ? 'opacity-80' : ''].join(' ')}
                      >
                        <svg className={['h-3.5 w-3.5 flex-shrink-0 transition-transform', collapsed ? '-rotate-90' : ''].join(' ')} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                        <span className="text-xs font-semibold">{typeKey}</span>
                        <span className="text-[10px] opacity-80 font-medium">— {PLACEHOLDER_TYPE_DESCRIPTIONS[typeKey] || ''}</span>
                        <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                          <span className="bg-white/80 px-2 py-0.5 rounded-full border text-[10px] font-medium">Total: {group.length}</span>
                          <span className="bg-white/80 px-2 py-0.5 rounded-full border border-emerald-300 text-emerald-700 text-[10px] font-medium">✓ {mappedCount}</span>
                          {group.length - mappedCount > 0 && <span className="bg-white/80 px-2 py-0.5 rounded-full border border-amber-300 text-amber-700 text-[10px] font-medium">⚠ {group.length - mappedCount}</span>}
                        </span>
                      </button>

                      {!collapsed && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-gray-700 font-sans">
                            <thead>
                              <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                                <th className="w-10 px-3 py-2.5 text-center"></th>
                                <th className="w-14 px-3 py-2.5 text-left">#</th>
                                <th className="px-3 py-2.5 text-left">Placeholder</th>
                                <th className="w-24 px-3 py-2.5 text-left">Status</th>
                                <th className="px-3 py-2.5 text-left">Mapped Form Field</th>
                                <th className="w-32 px-3 py-2.5 text-left">Input Type</th>
                                <th className="w-20 px-3 py-2.5 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {group.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500 font-normal">
                                    No mappings in this group.
                                  </td>
                                </tr>
                              ) : group.map(({ row, originalIndex: idx }) => {
                                if (idx < 0) return null
                                const mappedField = row.smartFormFieldId ? (fieldById.get(String(row.smartFormFieldId)) || null) : null
                                const fieldInputType = mappedField?.inputType || null
                                const expanded = expandedRowIdx === idx
                                const needsDateFormat = (row.placeholderType === 'SIMPLE_VALUE' || row.placeholderType === 'HEADER_FIELD' || row.placeholderType === 'FOOTER_FIELD' || row.placeholderType === 'SYSTEM_GENERATED') && (fieldInputType === 'DATE' || fieldInputType === 'DATETIME' || fieldInputType === 'SYSTEM_GENERATED')
                                const quickPresets = (() => {
                                  const presets = []
                                  const baseByType = OUTPUT_FORMAT_PRESETS[row.placeholderType] || {}
                                  if (baseByType[fieldInputType]) presets.push({ label: 'Recommended', value: baseByType[fieldInputType] })
                                  if (needsDateFormat) DATE_FORMAT_SUGGESTIONS.forEach((fmt) => presets.push({ label: fmt, value: { dateFormat: fmt } }))
                                  return presets
                                })()
                                return (
                                  <React.Fragment key={idx}>
                                    <tr
                                      id={`map-row-${idx}`}
                                      className={[
                                        'transition-colors cursor-pointer',
                                        expanded ? 'bg-[#003366]/5 hover:bg-[#003366]/10' : 'hover:bg-gray-50'
                                      ].join(' ')}
                                      onClick={() => toggleRow(idx)}
                                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRow(idx) } }}
                                      tabIndex={0}
                                      role="button"
                                    >
                                      <td className="px-3 py-2.5 text-center align-middle">
                                        <svg className={['h-3.5 w-3.5 inline transition-transform text-gray-500', expanded ? 'rotate-90' : ''].join(' ')} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                      </td>
                                      <td className="px-3 py-2.5 text-sm text-gray-500 tabular-nums font-normal align-middle">
                                        #{idx + 1}
                                      </td>
                                      <td className="px-3 py-2.5 min-w-[180px] align-middle">
                                        <div className="font-mono text-sm font-semibold text-gray-900 truncate leading-tight">{toFieldKeyFormat(row.placeholderName)}</div>
                                        <div className="text-xs text-gray-500 truncate opacity-80 leading-tight mt-0.5">{toPlaceholderTag(row.placeholderName)}</div>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        {mappedField || isSystemReservedPlaceholder(row.placeholderName) ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5">
                                            <svg className="h-3 w-3 text-emerald-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
                                            <span className="text-[10px] font-medium text-emerald-800">{isSystemReservedPlaceholder(row.placeholderName) ? 'Auto-Mapped' : 'Mapped'}</span>
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5">
                                            <svg className="h-3 w-3 text-amber-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 110-16 8 8 0 010 16zm1-11a1 1 0 00-2 0v4a1 1 0 00.3.7l2.8 2.8a1 1 0 001.4-1.4L11 10.6V7z" /></svg>
                                            <span className="text-[10px] font-medium text-amber-800">Unmapped</span>
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 min-w-[200px] align-middle">
                                        {isSystemReservedPlaceholder(row.placeholderName) ? (
                                          <div className="min-w-0">
                                            <div className="text-sm font-medium text-gray-900 truncate leading-tight">
                                              <span className="inline-flex items-center gap-1.5">
                                                <svg className="h-3.5 w-3.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                System: Supporting Fields ({allSupportingFieldList.length} field{allSupportingFieldList.length !== 1 ? 's' : ''})
                                              </span>
                                            </div>
                                            <div className="text-xs font-mono text-teal-700 truncate leading-tight mt-0.5">
                                              {allSupportingFieldList.length > 0
                                                ? allSupportingFieldList.map((f) => f.fieldKey).join(', ')
                                                : 'No supporting fields yet — toggle Supporting=ON in Form Fields step'}
                                            </div>
                                          </div>
                                        ) : mappedField ? (
                                          <div className="min-w-0">
                                            <div className="text-sm font-medium text-gray-900 truncate leading-tight">{mappedField.fieldLabel}</div>
                                            <div className="text-xs font-mono text-gray-500 truncate leading-tight mt-0.5">{mappedField.fieldKey}</div>
                                          </div>
                                        ) : (
                                          <span className="text-xs text-amber-700 italic font-normal">Click to select a Form Field</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        {isSystemReservedPlaceholder(row.placeholderName) ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-teal-50 text-teal-700 border-teal-200">
                                            AUTO
                                          </span>
                                        ) : fieldInputType ? (
                                          <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                                            (() => {
                                              switch (fieldInputType) {
                                                case 'TEXT': return 'bg-sky-50 text-sky-700 border-sky-200'
                                                case 'TEXTAREA': case 'RICH_TEXT': return 'bg-violet-50 text-violet-700 border-violet-200'
                                                case 'NUMBER': return 'bg-amber-50 text-amber-700 border-amber-200'
                                                case 'DATE': case 'DATETIME': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                case 'DROPDOWN': return 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                case 'CHECKBOX': return 'bg-orange-50 text-orange-700 border-orange-200'
                                                case 'USER_LOOKUP': return 'bg-cyan-50 text-cyan-700 border-cyan-200'
                                                case 'TABLE': return 'bg-rose-50 text-rose-700 border-rose-200'
                                                case 'IMAGE': case 'ATTACHMENT': return 'bg-pink-50 text-pink-700 border-pink-200'
                                                case 'REPEATER': return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'
                                                case 'SYSTEM_GENERATED': return 'bg-gray-100 text-gray-700 border-gray-300'
                                                default: return 'bg-gray-50 text-gray-700 border-gray-200'
                                              }
                                            })()
                                          ].join(' ')}>
                                            {fieldInputType}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-gray-400 italic font-normal">—</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 text-right whitespace-nowrap align-middle">
                                        {!isSystemReservedPlaceholder(row.placeholderName) && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault(); e.stopPropagation();
                                              setConfirmModal({
                                                open: true,
                                                title: 'Remove placeholder mapping?',
                                                message: (
                                                  <>
                                                    Remove mapping for placeholder <strong>{humanize(row.placeholderName)}</strong>?
                                                    <br />This only removes the mapping row; the form field and extracted placeholder tag are kept untouched.
                                                  </>
                                                ),
                                                confirmLabel: 'Remove Mapping',
                                                cancelLabel: 'Cancel',
                                                variant: 'default',
                                                onConfirm: () => removeRow(idx)
                                              })
                                            }}
                                            className="w-8 h-8 inline-flex items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                                            title="Remove mapping row"
                                          >
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                    {expanded && (
                                      <tr className="bg-white/80 border-t-0">
                                        <td colSpan={7} className="px-3 pb-4 pt-1">
                                          <div className="border-t border-gray-200/60 pt-3 space-y-3">
                                            {isSystemReservedPlaceholder(row.placeholderName) ? (
                                              <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 space-y-3">
                                                <div className="flex items-start gap-3">
                                                  <svg className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                  <div className="min-w-0 flex-1">
                                                    <h4 className="text-sm font-semibold text-teal-900">System Reserved Placeholder — Auto-Managed</h4>
                                                    <p className="text-xs text-teal-800 mt-1 leading-relaxed">
                                                      <code className="bg-white/80 px-1.5 py-0.5 rounded border border-teal-200 font-mono">{row.placeholderName}</code> does not require 1:1 Form Field mapping.
                                                      At PDF render time, this block will be populated automatically with all fields marked as <strong>Supporting</strong> (child/conditional fields), formatted as a Supporting Information table in your DOCX.
                                                    </p>
                                                  </div>
                                                </div>
                                                <div className="rounded-md border border-teal-200 bg-white overflow-hidden">
                                                  <div className="px-3 py-2 bg-teal-50/80 border-b border-teal-200 text-[11px] font-semibold text-teal-900 uppercase tracking-wide flex items-center justify-between">
                                                    <span>Fields Included ({allSupportingFieldList.length})</span>
                                                    <span className="font-normal normal-case text-teal-700 text-[10px]">All fields with Supporting=ON in Step 4</span>
                                                  </div>
                                                  <div className="divide-y divide-teal-100 max-h-60 overflow-y-auto">
                                                    {allSupportingFieldList.length === 0 ? (
                                                      <div className="px-4 py-5 text-center text-xs text-teal-700/80 italic">
                                                        No supporting fields yet. Go to Step 4 (Form Fields) and toggle <strong>Supporting = ON</strong> on any child/conditional field, or use the <strong>+ Add Field</strong> shortcut on Dropdown options.
                                                      </div>
                                                    ) : allSupportingFieldList.map((f, fi) => {
                                                      const hasVisibility = hasConditionalVisibilityEnabled(f)
                                                      return (
                                                        <div key={fi} className="px-3 py-2 flex items-center gap-2 hover:bg-teal-50/30">
                                                          <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-[10px] font-semibold inline-flex items-center justify-center flex-shrink-0">{fi + 1}</span>
                                                          <div className="min-w-0 flex-1">
                                                            <div className="text-xs font-medium text-gray-900 truncate leading-tight">{f.fieldLabel}</div>
                                                            <div className="text-[10px] font-mono text-gray-500 truncate leading-tight mt-0.5">{f.fieldKey}</div>
                                                          </div>
                                                          <div className="flex flex-shrink-0 items-center gap-1">
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-700 font-medium">{f.inputType}</span>
                                                            {hasVisibility && <span className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 font-medium">Conditional</span>}
                                                            {!!f.isMandatory && <span className="text-[10px] px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 font-medium">Required</span>}
                                                          </div>
                                                        </div>
                                                      )
                                                    })}
                                                  </div>
                                                </div>
                                              </div>
                                            ) : (
                                              <>
                                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                                  <div className="md:col-span-7">
                                                    <label className="block text-[10px] font-medium text-gray-600 mb-1 uppercase tracking-wide">Smart Form Field</label>
                                                    <SelectField value={row.smartFormFieldId ? String(row.smartFormFieldId) : ''} onChange={(e) => updateRow(idx, { smartFormFieldId: e.target.value || null })}>
                                                      <option value="">— Unmapped —</option>
                                                      {mergedAllFields.map((f) => {
                                                        const optVal = (f.id !== undefined && f.id !== null) ? String(f.id) : String(f._cid || ('__key_' + String(f.fieldKey || Math.random())))
                                                        return <option key={optVal} value={optVal}>{f.fieldKey} — {f.fieldLabel} [{f.inputType}]</option>
                                                      })}
                                                    </SelectField>
                                                  </div>
                                                  <div className="md:col-span-5">
                                                    <label className="block text-[10px] font-medium text-gray-600 mb-1 uppercase tracking-wide">Placeholder Type</label>
                                                    <SelectField value={row.placeholderType} onChange={(e) => updateRow(idx, { placeholderType: e.target.value })}>
                                                      {filteredPlaceholderTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                                                    </SelectField>
                                                  </div>
                                                </div>

                                                <div className="rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden">
                                                  <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAdvancedRowIdx(advancedRowIdx === idx ? null : idx) }}
                                                    className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-100/60 transition-colors"
                                                  >
                                                    <svg className={['h-3.5 w-3.5 text-gray-500 transition-transform flex-shrink-0', advancedRowIdx === idx ? '' : '-rotate-90'].join(' ')} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                                                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Advanced Settings</span>
                                                    <span className="ml-auto text-[10px] text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200 font-medium flex items-center gap-2">
                                                      {quickPresets.length > 0 && <span className="text-sky-700">· {quickPresets.length} preset{quickPresets.length === 1 ? '' : 's'} available</span>}
                                                      {row.targetSectionName && <span className="text-indigo-700">Target: {row.targetSectionName}</span>}
                                                      {row.repeatParentTag && <span className="text-amber-700">Repeat: {row.repeatParentTag}</span>}
                                                    </span>
                                                  </button>
                                                  {advancedRowIdx === idx && (
                                                    <div className="px-4 pb-4 pt-1 border-t border-gray-200 bg-white space-y-4">
                                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div>
                                                          <label className="block text-[10px] font-medium text-gray-600 mb-1 uppercase tracking-wide">Target Section</label>
                                                          <TextInput value={row.targetSectionName || ''} onChange={(e) => updateRow(idx, { targetSectionName: e.target.value })} placeholder="e.g. headerArea, footerArea, mainArea" className="text-xs py-1.5 h-8" />
                                                          <p className="text-[10px] text-gray-500 mt-1">Optional. Scope this value injection to a named document area (header/footer).</p>
                                                        </div>
                                                        <div>
                                                          <label className="block text-[10px] font-medium text-gray-600 mb-1 uppercase tracking-wide">Repeat Parent</label>
                                                          <TextInput value={row.repeatParentTag || ''} onChange={(e) => updateRow(idx, { repeatParentTag: e.target.value })} placeholder="e.g. items, rows, agendaItems" className="text-xs py-1.5 h-8" />
                                                          <p className="text-[10px] text-gray-500 mt-1">Optional. Parent {`{#loop}`} tag name for TABLE_ROWS or nested REPEATED_SECTION placeholders.</p>
                                                        </div>
                                                      </div>
                                                      <div>
                                                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                                          <label className="block text-[10px] font-medium text-gray-600 uppercase tracking-wide">Output Format JSON</label>
                                                          {quickPresets.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 ml-auto">
                                                              {quickPresets.map((p, pi) => (
                                                                <button
                                                                  key={pi}
                                                                  type="button"
                                                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); applyFormatPreset(idx, p.value) }}
                                                                  className="text-[10px] px-2 py-0.5 rounded-full border border-[#003366]/20 bg-[#003366]/5 text-[#003366] hover:bg-[#003366]/10 font-medium"
                                                                >
                                                                  Apply {p.label}
                                                                </button>
                                                              ))}
                                                            </div>
                                                          )}
                                                        </div>
                                                        <TextArea rows={3} className="font-mono text-[11px]" value={safeJsonStringify(row.outputFormatJson)} onChange={(e) => updateRow(idx, { outputFormatJson: e.target.value })} placeholder={`{"dateFormat": "DD/MM/YYYY"}`} />
                                                        <p className="text-[10px] text-gray-500 mt-1">Fine-grained rendering behaviour: date formats, number precision, table borders, image dimensions, etc.</p>
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              </>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reusable Confirmation Modal */}
      {confirmModal.open && (
        <Modal onClose={() => setConfirmModal({ ...confirmModal, open: false })} size="sm">
          <ModalHeader
            title={confirmModal.title || 'Confirm action'}
            onClose={() => setConfirmModal({ ...confirmModal, open: false })}
          />
          <ModalBody>
            <div className="flex items-start gap-4">
              <div className={[
                'shrink-0 flex items-center justify-center w-11 h-11 rounded-lg border',
                confirmModal.variant === 'danger'
                  ? 'bg-red-50 border-red-200 text-red-600'
                  : confirmModal.variant === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-600'
                    : 'bg-sky-50 border-sky-200 text-sky-700'
              ].join(' ')}>
                {confirmModal.variant === 'danger' ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                )}
              </div>
              <div className="min-w-0 flex-1 text-sm text-gray-700 leading-relaxed">
                {confirmModal.message || 'Are you sure you want to proceed?'}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirmModal({ ...confirmModal, open: false })}>
              {confirmModal.cancelLabel || 'Cancel'}
            </Button>
            <Button
              type="button"
              variant={confirmModal.variant === 'danger' ? 'danger' : 'primary'}
              onClick={() => {
                const cb = confirmModal.onConfirm
                setConfirmModal({ open: false, title: '', message: null, onConfirm: null, confirmLabel: 'Confirm', cancelLabel: 'Cancel', variant: 'default' })
                if (typeof cb === 'function') cb()
              }}
            >
              {confirmModal.confirmLabel || 'Confirm'}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
})

const TABLE_COLUMN_INPUT_TYPES = ['TEXT', 'NUMBER', 'TEXTAREA', 'RICH_TEXT', 'DATE', 'TIME', 'DATETIME', 'CHECKBOX', 'DROPDOWN']

function tryParseColSchema(val) {
  if (!val) return []
  try {
    const arr = typeof val === 'string' ? JSON.parse(val) : val
    if (!Array.isArray(arr)) return []
    return arr
      .filter((c) => c && typeof c === 'object')
      .map((c, i) => {
        const fk = String(c.fieldKey || c.key || c.name || c.field_key || `col${i + 1}`).trim()
        return {
          fieldKey: fk,
          headerLabel: String(c.headerLabel || c.label || c.display_name || fk || `Col ${i + 1}`).trim() || `Col ${i + 1}`,
          inputType: TABLE_COLUMN_INPUT_TYPES.includes(String(c.inputType || 'TEXT').toUpperCase())
            ? String(c.inputType || 'TEXT').toUpperCase()
            : 'TEXT',
          optionsJson: c.optionsJson ?? c.options ?? null,
          defaultValue: c.defaultValue ?? c.default ?? undefined
        }
      })
  } catch {
    return []
  }
}

function SchemaColumnEditor({ value, onChange }) {
  const cols = tryParseColSchema(value)
  const [showRaw, setShowRaw] = useState(false)

  function persist(nextCols) {
    onChange(safeJsonStringify(Array.isArray(nextCols) ? nextCols : []))
  }

  function addCol() {
    const n = cols.length + 1
    const newCols = [...cols, { fieldKey: `col${n}`, headerLabel: `Column ${n}`, inputType: 'TEXT', optionsJson: null, defaultValue: undefined }]
    persist(newCols)
  }

  function updateCol(i, patch) {
    const newCols = cols.map((c, idx) => idx !== i ? c : { ...c, ...patch })
    persist(newCols)
  }

  function removeCol(i) {
    const newCols = cols.filter((_, idx) => idx !== i)
    persist(newCols)
  }

  function moveCol(i, dir) {
    const newCols = [...cols]
    const t = i + dir
    if (t < 0 || t >= newCols.length) return
    const [moved] = newCols.splice(i, 1)
    newCols.splice(t, 0, moved)
    persist(newCols)
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <Th className="w-10 text-center">#</Th>
              <Th>Field Key <span className="text-red-600">*</span></Th>
              <Th>Header Label</Th>
              <Th className="w-36">Type</Th>
              <Th className="w-24 text-center">Move</Th>
              <Th className="w-12 text-center">🗑️</Th>
            </tr>
          </thead>
          <tbody>
            {cols.length === 0 ? (
              <tr>
                <Td colSpan={6} className="text-center text-xs text-gray-500 py-5">No columns yet. Click <strong>Add Column</strong> below to start.</Td>
              </tr>
            ) : cols.map((c, i) => (
              <Tr key={i}>
                <Td className="text-center text-gray-500">{i + 1}</Td>
                <Td>
                  <TextInput
                    size="sm"
                    value={c.fieldKey}
                    placeholder="e.g. BIL, PERKARA"
                    onChange={(e) => updateCol(i, { fieldKey: e.target.value })}
                  />
                </Td>
                <Td>
                  <TextInput
                    size="sm"
                    value={c.headerLabel}
                    placeholder="e.g. Bil., Perkara"
                    onChange={(e) => updateCol(i, { headerLabel: e.target.value })}
                  />
                </Td>
                <Td>
                  <SelectField
                    value={c.inputType}
                    onChange={(e) => updateCol(i, { inputType: e.target.value })}
                  >
                    {TABLE_COLUMN_INPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </SelectField>
                </Td>
                <Td>
                  <div className="flex items-center justify-center gap-1">
                    <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40" onClick={() => moveCol(i, -1)} disabled={i === 0} title="Move up">↑</button>
                    <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40" onClick={() => moveCol(i, 1)} disabled={i === cols.length - 1} title="Move down">↓</button>
                  </div>
                </Td>
                <Td className="text-center">
                  <button type="button" className="text-red-500 hover:text-red-700 text-sm" title="Remove column" onClick={() => removeCol(i)}>✕</button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button size="sm" variant="secondary" onClick={addCol}><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Add Column</Button>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500">
          <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
          Show raw JSON (advanced)
        </label>
      </div>
      {showRaw && (
        <TextArea rows={6} className="font-mono text-xs" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={`[
  {"fieldKey":"bil","headerLabel":"Bil.","inputType":"NUMBER"},
  {"fieldKey":"perkara","headerLabel":"Perkara","inputType":"TEXT"}
]`} />
      )}
    </div>
  )
}

/* ======================= TAB 5: PREVIEW & TEST ======================= */
function FieldByTypeInput({ field, value, onChange }) {
  const fkey = field.fieldKey
  const set = (v) => onChange(fkey, v)
  const options = (() => {
    try {
      if (typeof field.optionsJson === 'string') return JSON.parse(field.optionsJson) || []
      if (Array.isArray(field.optionsJson)) return field.optionsJson
      return []
    } catch { return [] }
  })()
  switch ((field.inputType || 'TEXT').toUpperCase()) {
    case 'TEXT':
    case 'SYSTEM_GENERATED':
    case 'USER_LOOKUP':
      return <TextInput value={String(value ?? '')} onChange={(e) => set(e.target.value)} placeholder={field.fieldHelpText || field.fieldKey} />
    case 'EMAIL':
      return <TextInput type="email" value={String(value ?? '')} onChange={(e) => set(e.target.value)} placeholder="name@example.com" />
    case 'TEXTAREA':
      return <TextArea rows={3} value={String(value ?? '')} onChange={(e) => set(e.target.value)} placeholder={field.fieldHelpText || field.fieldKey} />
    case 'RICH_TEXT':
      return <TextArea rows={5} value={String(value ?? '')} onChange={(e) => set(e.target.value)} placeholder={field.fieldHelpText || 'Rich content...'} />
    case 'NUMBER':
      return <TextInput type="number" value={value === undefined || value === null ? '' : Number(value)} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} placeholder="0" />
    case 'DATE':
      return <TextInput type="date" value={String(value ?? '')} onChange={(e) => set(e.target.value)} />
    case 'TIME':
      return <TextInput type="time" value={String(value ?? '')} onChange={(e) => set(e.target.value)} />
    case 'DATETIME':
      return <TextInput type="datetime-local" value={String(value ?? '')} onChange={(e) => set(e.target.value)} />
    case 'CHECKBOX':
      return (
        <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={!!value} onChange={(e) => set(e.target.checked)} />
          <span>{field.fieldLabel || field.fieldKey}</span>
        </label>
      )
    case 'DROPDOWN':
      return (
        <SelectField value={String(value ?? '')} onChange={(e) => set(e.target.value || null)}>
          <option value="">— Select —</option>
          {options.map((o, i) => {
            const lbl = typeof o === 'string' ? o : (o?.label ?? o?.value ?? `Option ${i + 1}`)
            const val = typeof o === 'string' ? o : (o?.value ?? o?.label ?? lbl)
            return <option key={i} value={val}>{lbl}</option>
          })}
          {options.length === 0 && <option disabled value="">(no options configured for this field)</option>}
        </SelectField>
      )
    case 'IMAGE':
      return (
        <div className="space-y-2">
          <TextInput value={String(value ?? '')} onChange={(e) => set(e.target.value)} placeholder="Image URL or file path (preview sandbox only)" />
          <p className="text-[11px] text-gray-500">For template preview: paste a public image URL. Real documents use file upload UI.</p>
        </div>
      )
    case 'ATTACHMENT':
      return (
        <div className="space-y-2">
          <TextInput value={String(value ?? '')} onChange={(e) => set(e.target.value)} placeholder="Attachment filename (preview only)" />
          <p className="text-[11px] text-gray-500">Sandbox only — real documents show file upload widget.</p>
        </div>
      )
    case 'TABLE': {
      const initialCols = tryParseColSchema(field.tableSchemaJson)
      const [dynamicCols, setDynamicCols] = useState(initialCols)
      const [editingHeader, setEditingHeader] = useState(null)
      const [headerDraft, setHeaderDraft] = useState('')

      useEffect(() => {
        setDynamicCols(initialCols)
      }, [field.fieldKey, JSON.stringify(initialCols.map((c) => `${c.fieldKey}|${c.headerLabel}|${c.inputType}`))])

      const cols = dynamicCols.length ? dynamicCols : []
      const cur = Array.isArray(value) ? value : []

      function addDynamicCol() {
        const n = cols.length + 1
        const fk = `col${n}`
        const label = `Column ${n}`
        const newCols = [...cols, { fieldKey: fk, headerLabel: label, inputType: 'TEXT', optionsJson: null, defaultValue: undefined }]
        setDynamicCols(newCols)
        set(cur.map((rw) => ({ ...rw, [fk]: '' })))
      }

      function removeDynamicCol(i) {
        const target = cols[i]
        if (!target) return
        const fk = String(target.fieldKey || target.key || target.name || '')
        const newCols = cols.filter((_, idx) => idx !== i)
        setDynamicCols(newCols)
        if (fk) {
          set(cur.map((rw) => {
            const next = { ...rw }
            delete next[fk]
            return next
          }))
        }
      }

      function renameColType(i, patch) {
        const old = cols[i]
        if (!old) return
        const oldKey = String(old.fieldKey || old.key || old.name || '')
        const newCols = cols.map((c, idx) => idx !== i ? c : { ...c, ...patch })
        const newKey = String(patch.fieldKey || oldKey || '')
        setDynamicCols(newCols)
        if (patch.fieldKey && patch.fieldKey !== oldKey) {
          set(cur.map((rw) => {
            const next = { ...rw }
            if (oldKey && Object.prototype.hasOwnProperty.call(next, oldKey)) {
              next[newKey] = next[oldKey]
              delete next[oldKey]
            } else if (newKey && !Object.prototype.hasOwnProperty.call(next, newKey)) {
              next[newKey] = ''
            }
            return next
          }))
        }
      }

      function startHeaderEdit(i, labelValue, typeValue, keyValue) {
        setEditingHeader(i)
        setHeaderDraft(labelValue)
      }
      function commitHeaderEdit(i) {
        const lbl = (headerDraft || '').trim() || cols[i]?.headerLabel || `Col ${i + 1}`
        setEditingHeader(null)
        renameColType(i, { headerLabel: lbl })
      }

      if (cols.length === 0) {
        return (
          <div className="space-y-2">
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              💡 No columns yet. Click <strong>Add Column</strong> below to define your first column.
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button size="sm" variant="secondary" onClick={addDynamicCol}><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Add Column</Button>
              <details className="text-[11px] text-gray-500">
                <summary className="cursor-pointer">Edit rows as raw JSON</summary>
                <TextArea className="mt-2 font-mono text-[11px]" rows={4} value={safeJsonStringify(cur)} onChange={(e) => { try { const v = JSON.parse(e.target.value || '[]'); set(Array.isArray(v) ? v : []) } catch { /* ignore */ } }} />
              </details>
            </div>
          </div>
        )
      }

      const rowInputByType = (r, col, i, j) => {
        const colKey = String(col.fieldKey || col.key || col.name || `col${j}`)
        const rowVal = (r || {})[colKey]
        const setRow = (nv) => {
          set(cur.map((rw, ri) => ri !== i ? rw : { ...rw, [colKey]: nv }))
        }
        const it = (col.inputType || 'TEXT').toUpperCase()
        switch (it) {
          case 'NUMBER': return <TextInput size="sm" type="number" value={rowVal === undefined || rowVal === null ? '' : Number(rowVal)} onChange={(e) => setRow(e.target.value === '' ? null : Number(e.target.value))} />
          case 'DATE': return <TextInput size="sm" type="date" value={String(rowVal ?? '')} onChange={(e) => setRow(e.target.value)} />
          case 'TIME': return <TextInput size="sm" type="time" value={String(rowVal ?? '')} onChange={(e) => setRow(e.target.value)} />
          case 'DATETIME': return <TextInput size="sm" type="datetime-local" value={String(rowVal ?? '')} onChange={(e) => setRow(e.target.value)} />
          case 'CHECKBOX': return <input type="checkbox" className="h-4 w-4 mt-2" checked={!!rowVal} onChange={(e) => setRow(e.target.checked)} />
          case 'DROPDOWN': {
            let copts = []
            try { if (typeof col.optionsJson === 'string') copts = JSON.parse(col.optionsJson) || []; else if (Array.isArray(col.optionsJson)) copts = col.optionsJson } catch {}
            return (
              <select className="rounded border border-gray-300 text-sm px-2 py-1 w-full" value={String(rowVal ?? '')} onChange={(e) => setRow(e.target.value || null)}>
                <option value="">— —</option>
                {copts.map((o, k) => { const lbl = typeof o === 'string' ? o : (o.label ?? o.value ?? `O${k+1}`); const val = typeof o === 'string' ? o : (o.value ?? o.label ?? lbl); return <option key={k} value={val}>{lbl}</option> })}
              </select>
            )
          }
          case 'TEXTAREA': case 'RICH_TEXT': return <TextArea size="sm" rows={2} value={String(rowVal ?? '')} onChange={(e) => setRow(e.target.value)} />
          default: return <TextInput size="sm" value={String(rowVal ?? '')} onChange={(e) => setRow(e.target.value)} placeholder={col.headerLabel || col.fieldKey} />
        }
      }

      return (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th className="w-10 text-center">#</Th>
                  {cols.map((c, ci) => (
                    <Th key={ci} className="align-top">
                      <div className="space-y-1.5 min-w-[140px]">
                        {editingHeader === ci ? (
                          <div className="flex items-center gap-1">
                            <TextInput
                              size="sm"
                              value={headerDraft}
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') commitHeaderEdit(ci) }}
                              onChange={(e) => setHeaderDraft(e.target.value)}
                            />
                            <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700" title="Save" onClick={() => commitHeaderEdit(ci)}>✓</button>
                            <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 text-gray-500" title="Cancel" onClick={() => setEditingHeader(null)}>✕</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="flex-1 text-left hover:bg-white/60 rounded px-1 py-0.5 border border-transparent hover:border-gray-300 transition-colors"
                              title="Click to rename column header"
                              onClick={() => startHeaderEdit(ci, c.headerLabel || c.label || c.fieldKey || `Col ${ci + 1}`)}
                            >
                              {c.headerLabel || c.label || c.fieldKey || `Col ${ci + 1}`}
                              <span className="ml-1 text-gray-400 text-[10px]">✎</span>
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <SelectField
                            size="sm"
                            value={c.inputType}
                            onChange={(e) => renameColType(ci, { inputType: e.target.value })}
                          >
                            {TABLE_COLUMN_INPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </SelectField>
                          <button
                            type="button"
                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40"
                            title="Remove column"
                            onClick={() => removeDynamicCol(ci)}
                            disabled={cols.length <= 1}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </Th>
                  ))}
                  <Th className="w-14">Row</Th>
                </tr>
              </thead>
              <tbody>
                {cur.length === 0 ? (
                  <tr><Td colSpan={cols.length + 2} className="text-center text-xs text-gray-500 py-6">No rows yet. Click <strong>Add row</strong> below to start.</Td></tr>
                ) : cur.map((r, i) => (
                  <Tr key={i}>
                    <Td className="text-center text-gray-500 text-xs">{i + 1}</Td>
                    {cols.map((c, ci) => (
                      <Td key={ci}>{rowInputByType(r, c, i, ci)}</Td>
                    ))}
                    <Td className="text-center">
                      <button type="button" className="text-red-500 hover:text-red-700 text-sm" title="Remove row" onClick={() => set(cur.filter((_, ri) => ri !== i))}>✕</button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="secondary" onClick={addDynamicCol}><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Add Column</Button>
              <Button size="sm" variant="secondary" onClick={() => {
                const newRow = {}
                cols.forEach((c) => {
                  const k = String(c.fieldKey || c.key || c.name || '')
                  if (!k) return
                  const it = (c.inputType || 'TEXT').toUpperCase()
                  if (it === 'NUMBER') newRow[k] = null
                  else if (it === 'CHECKBOX') newRow[k] = false
                  else newRow[k] = c.defaultValue !== undefined ? c.defaultValue : ''
                })
                set([...cur, newRow])
              }}>+ Add row</Button>
            </div>
            <details className="text-[11px] text-gray-500">
              <summary className="cursor-pointer">Edit as raw JSON</summary>
              <TextArea className="mt-2 font-mono text-[11px]" rows={4} value={safeJsonStringify(cur)} onChange={(e) => { try { const v = JSON.parse(e.target.value || '[]'); set(Array.isArray(v) ? v : []) } catch { /* ignore */ } }} />
            </details>
          </div>
        </div>
      )
    }
    case 'REPEATER':
      return (
        <div className="space-y-2">
          <TextArea rows={4} className="font-mono text-xs" value={safeJsonStringify(value || [])} onChange={(e) => { try { const v = JSON.parse(e.target.value || '[]'); set(Array.isArray(v) ? v : []) } catch { /* ignore */ } }} placeholder='[{...repeatRow1},{...repeatRow2}]' />
          <p className="text-[11px] text-gray-500">Repeated section rows as JSON array (advanced).</p>
        </div>
      )
    default:
      return <TextInput value={String(value ?? '')} onChange={(e) => set(e.target.value)} placeholder={`${field.inputType || 'TEXT'} — enter value`} />
  }
}

function FallbackDynamicTestForm({ version, values, setValues }) {
  const sections = version.sections || []
  const fields = (version.formFields || []).filter((f) => f.isVisibleInForm !== false)
  const bySection = {}
  fields.forEach((f) => {
    const sid = f.smartTemplateSectionId || f.sectionId || '__nosect__'
    if (!bySection[sid]) bySection[sid] = []
    bySection[sid].push(f)
  })
  const sortedSects = [...sections].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const hasSections = sortedSects.length > 0
  if (!hasSections && (bySection['__nosect__'] || []).length > 0) {
    sortedSects.push({ id: '__nosect__', sectionName: 'Uncategorized Fields' })
    bySection['__nosect__'] = bySection['__nosect__'] || []
  }
  if (fields.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        ⚠️ No Form Fields defined yet. Go back to Step 4 (Form Fields) or Step 5 and click <span className="font-semibold">"Auto-Generate Fields + Map"</span> to create fields from placeholders first.
      </div>
    )
  }
  const updateOne = (key, val) => setValues((prev) => ({ ...(prev || {}), [key]: val }))
  return (
    <div className="space-y-5">
      {sortedSects.map((s) => {
        const rows = (bySection[s.id] || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        if (!rows.length) return null
        return (
          <div key={s.id} className="space-y-4">
            <div className="border-b border-gray-200 pb-2">
              <h4 className="text-sm font-semibold text-gray-900">{s.sectionName || 'Uncategorized Fields'}</h4>
              {s.sectionDescription && <p className="text-xs text-gray-500 mt-0.5">{s.sectionDescription}</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rows.map((f) => (
                <div key={f.id ?? f._cid ?? f.fieldKey}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {f.fieldLabel || f.fieldKey}
                    {f.isMandatory && <span className="text-red-500 ml-1">*</span>}
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">{f.inputType || 'TEXT'}</span>
                  </label>
                  {f.fieldHelpText && <p className="text-[11px] text-gray-500 mb-1.5">{f.fieldHelpText}</p>}
                  <FieldByTypeInput field={f} value={values ? values[f.fieldKey] : undefined} onChange={updateOne} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PreviewTab({ template, notify, activeDesignVersionId = null }) {
  const versions = template.versions || []
  const exactVersion = activeDesignVersionId ? versions.find((v) => String(v.id) === String(activeDesignVersionId)) : null
  const currentVersion = exactVersion || (versions.find((v) => v.isCurrent) || versions[0] || null)
  const [testValues, setTestValues] = useState({})
  const [generating, setGenerating] = useState(false)
  const [previewSrc, setPreviewSrc] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [showJsonEditor, setShowJsonEditor] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleGeneratePreview() {
    if (!currentVersion) return
    setGenerating(true); setPreviewError(''); setPreviewSrc(''); setFormError('')
    try {
      const vals = typeof testValues === 'object' && testValues ? testValues : {}
      const fieldKeys = new Set((currentVersion.formFields || []).filter((f) => f.isMandatory).map((f) => String(f.fieldKey)))
      const missing = []
      fieldKeys.forEach((k) => {
        const v = vals[k]
        if (v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0)) missing.push(k)
      })
      if (missing.length > 0) {
        setFormError(`Please fill in required fields: ${missing.join(', ')}`)
        setGenerating(false)
        return
      }
      const payload = { fieldValues: vals, systemValues: {} }
      const res = await api.post(`/smart-templates/versions/${currentVersion.id}/preview-pdf`, payload, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: res.data?.type || 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setPreviewSrc(url)
      notify('Preview PDF generated', 'success')
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.message ||
        err?.message ||
        'Failed to generate preview PDF'
      setPreviewError(msg)
    } finally {
      setGenerating(false)
    }
  }

  const hasFields = currentVersion && Array.isArray(currentVersion.formFields) && currentVersion.formFields.length > 0
  const SmartFormComp = SmartForm && typeof SmartForm === 'function' ? SmartForm : null

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Preview & Test"
        subtitle="For admin test only; real documents use saved values. Fill the form below — no JSON needed!"
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={handleGeneratePreview} loading={generating} disabled={!currentVersion}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Generate Preview PDF
            </Button>
          </div>
        }
      />

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        ℹ️ This is a sandbox for template validation only. <span className="font-semibold">Fill the form fields below like a real end-user</span> then click Generate Preview PDF to verify placeholder rendering and style profile output.
      </div>

      {formError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{formError}</div>
      )}
      {previewError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">{previewError}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center justify-between">
            <span>Test Form Values {hasFields ? `(${currentVersion.formFields.length} fields)` : ''}</span>
            <button
              type="button"
              onClick={() => setShowJsonEditor((s) => !s)}
              className="text-[11px] text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              {showJsonEditor ? 'Hide Advanced JSON Editor' : 'Show Advanced JSON Editor'}
            </button>
          </h3>
          {!currentVersion ? (
            <EmptyPanelState title="No current version" description="Create or publish a version first." />
          ) : !hasFields ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                ⚠️ No Form Fields defined for this version yet — no form to display.
              </div>
              <p className="text-sm text-gray-700">
                Go back to <span className="font-semibold">Step 5 Placeholder Mapping</span> and click the blue primary button <span className="font-semibold">"Auto-Generate Fields + Map"</span> to create one Form Field per placeholder automatically, or define fields manually in Step 4.
              </p>
            </div>
          ) : SmartFormComp ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <SmartFormComp
                templateVersion={currentVersion}
                initialValues={testValues}
                onChange={(v) => setTestValues(v)}
                readonly={false}
              />
              {showJsonEditor && (
                <div className="mt-4 pt-3 border-t border-gray-200 space-y-2">
                  <p className="text-xs text-gray-500">Advanced — edit JSON directly (fieldKey → value):</p>
                  <TextArea
                    rows={10}
                    className="font-mono text-xs"
                    value={safeJsonStringify(testValues)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value || '{}')
                        setTestValues(parsed)
                      } catch {}
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
              <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2 border border-amber-200/50">
                ℹ️ SmartForm component loader falling back to lightweight auto-generated form (works for all standard input types).
              </p>
              <FallbackDynamicTestForm version={currentVersion} values={testValues} setValues={setTestValues} />
              {showJsonEditor && (
                <div className="pt-3 border-t border-gray-200 space-y-2">
                  <p className="text-xs text-gray-500">Advanced — edit JSON directly (fieldKey → value):</p>
                  <TextArea
                    rows={10}
                    className="font-mono text-xs"
                    value={safeJsonStringify(testValues)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value || '{}')
                        setTestValues(parsed)
                      } catch {}
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">PDF Preview</h3>
          <div className="rounded-lg border border-gray-200 bg-white p-2 min-h-[520px] h-[70vh]">
            {previewSrc ? (
              <iframe title="Preview" src={previewSrc} className="w-full h-full rounded-lg border-0 bg-white" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-center">
                <EmptyPanelState
                  title="No preview yet"
                  description={generating ? 'Generating preview PDF...' : 'Click "Generate Preview PDF" after filling in test values.'}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
