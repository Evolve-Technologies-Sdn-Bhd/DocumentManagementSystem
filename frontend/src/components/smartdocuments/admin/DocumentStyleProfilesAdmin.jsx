import React, { useState, useEffect, useMemo } from 'react'
import api from '../../../api/axios'
import Button from '../../ui/Button'
import TextInput from '../../ui/TextInput'
import TextArea from '../../ui/TextArea'
import SelectField from '../../ui/SelectField'
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../ui/Modal'
import PageHeader from '../../ui/PageHeader'
import SectionHeader from '../../ui/SectionHeader'
import EmptyPanelState from '../../ui/EmptyPanelState'
import { generateHybridPageSeries, formatHybridPageNumberLabel } from '../../../utils/pageNumbering'
import InlineSpinner from '../../ui/InlineSpinner'
import PageContainer from '../../ui/PageContainer'
import AppSurface from '../../ui/AppSurface'
import { TableContainer, Table, Th, Td, Tr } from '../../ui/Table'
import ActionMenu from '../../ActionMenu'

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

const PAGE_SIZES = ['A4', 'LETTER', 'LEGAL']
const ORIENTATIONS = ['PORTRAIT', 'LANDSCAPE']

const STYLE_PROFILE_STEPS = [
  { id: 0, key: 'general', label: 'General' },
  { id: 1, key: 'page', label: 'Page Settings' },
  { id: 2, key: 'typography', label: 'Typography' },
  { id: 3, key: 'header', label: 'Header' },
  { id: 4, key: 'footer', label: 'Footer' },
  { id: 5, key: 'tables', label: 'Tables' },
  { id: 6, key: 'pagination', label: 'Pagination' }
]

const STYLE_PROFILE_STEP_REQUIRED = {
  0: { required: true },
  1: { required: false },
  2: { required: false },
  3: { required: false },
  4: { required: false },
  5: { required: false },
  6: { required: false }
}
const FONT_FAMILIES = ['Arial', 'Calibri', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma', 'Georgia', 'Garamond', 'Helvetica', 'Cambria']
const FONT_SIZES_PT = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24]
const PAGE_NUMBER_FORMATS = ['Page X of Y', 'Page X', '- X -', 'None']

const DEFAULT_TYPOGRAPHY = {
  heading1: { fontFamily: 'Calibri', fontSizePt: 16, bold: true, italic: false, underline: false, color: '#1F2937', spacingBeforePt: 18, spacingAfterPt: 6, lineSpacingMultiplier: 1.1 },
  heading2: { fontFamily: 'Calibri', fontSizePt: 14, bold: true, italic: false, underline: false, color: '#1F2937', spacingBeforePt: 12, spacingAfterPt: 6 },
  heading3: { fontFamily: 'Calibri', fontSizePt: 12, bold: true, italic: false, underline: false, color: '#374151', spacingBeforePt: 8, spacingAfterPt: 4 },
  heading4: { fontFamily: 'Calibri', fontSizePt: 11, bold: true, italic: false, underline: false, color: '#374151', spacingBeforePt: 6, spacingAfterPt: 4 },
  body: { fontFamily: 'Calibri', fontSizePt: 11, bold: false, italic: false, color: '#111827', lineSpacingMultiplier: 1.15, firstLineIndentMm: 0 },
  tableHeader: { fontFamily: 'Calibri', fontSizePt: 10, bold: true, italic: false, color: '#FFFFFF', fillColor: '#1F2937', verticalAlign: 'middle' },
  tableCell: { fontFamily: 'Calibri', fontSizePt: 10, bold: false, italic: false, color: '#1F2937', verticalAlign: 'top', lineSpacingMultiplier: 1.1 },
  listItem: { fontFamily: 'Calibri', fontSizePt: 11, color: '#111827', bulletStyle: 'disc', indentMm: 6.35 },
  headerText: { fontFamily: 'Calibri', fontSizePt: 9, bold: false, color: '#374151' },
  footerText: { fontFamily: 'Calibri', fontSizePt: 8, bold: false, color: '#6B7280' },
  caption: { fontFamily: 'Calibri', fontSizePt: 9, italic: true, color: '#6B7280', position: 'below' }
}

function emptyProfile() {
  return {
    profileName: '',
    description: '',
    isActive: true,
    isDefault: false,
    pageSize: 'A4',
    pageOrientation: 'PORTRAIT',
    orientation: 'PORTRAIT',
    marginTopMm: 25.4,
    marginLeftMm: 25.4,
    marginBottomMm: 25.4,
    marginRightMm: 25.4,
    pageWidthMm: null,
    pageHeightMm: null,
    headerHeightMm: null,
    footerHeightMm: null,
    bodyFontFamily: 'Calibri',
    bodyFontSizePt: 11,
    lineSpacing: 1.15,
    lineSpacingMultiplier: 1.15,
    headingFontFamily: 'Calibri',
    heading1FontSizePt: 16,
    heading2FontSizePt: 14,
    heading3FontSizePt: 12,
    heading4FontSizePt: 11,
    tableFontFamily: 'Calibri',
    tableFontSizePt: 10,
    paragraphSpacingBeforePt: 0,
    paragraphSpacingAfterPt: 6,
    typographyJson: { ...DEFAULT_TYPOGRAPHY },
    headerEnabled: true,
    headerUseProfessionalLayout: true,
    headerLeftText: '',
    headerCenterText: '',
    headerRightText: '',
    headerLogoPath: '',
    logoWidthMm: 35,
    logoHeightMm: null,
    headerCompanyName: '',
    headerCompanyRegNo: '',
    headerCompanyNameUnderline: true,
    headerCompanyNameColor: '#1F2937',
    headerCompanyAddressJson: [],
    headerCompanyPhone: '',
    headerCompanyEmail: '',
    headerCompanyEmailColor: '#0563C1',
    headerBottomDividerEnabled: true,
    headerBottomDividerWidthPt: 1.5,
    headerBottomDividerColor: '#000000',
    footerEnabled: true,
    footerUseProfessionalLayout: true,
    footerLeftText: '',
    footerCenterText: '',
    footerRightText: '',
    footerConfidentialText: '',
    footerClassificationMark: '',
    footerShowDocCodeAndRev: true,
    footerShowEffectiveDate: true,
    footerShowPreparedBy: true,
    footerShowApprovedBy: false,
    footerDisclaimerText: '',
    footerTopDividerEnabled: true,
    footerTopDividerWidthPt: 0.75,
    footerTopDividerColor: '#6B7280',
    footerTopDividerWidthMode: 'full',
    footerContentPrimaryPosition: 'left',
    showPageNumbers: true,
    pageNumberFormat: 'Page X of Y',
    pageNumberPosition: 'right',
    showDocumentInfo: true,
    tableBorderStyle: 'solid',
    tableBorderWidthPt: 0.5,
    tableBorderWidth: 0.5,
    tableHeaderFillColor: '#1F2937',
    tableHeaderFontBold: true,
    tableCellPaddingPt: 5,
    cellPaddingPt: 5,
    tableAlignment: 'left',
    headerRowBgColor: '#1F2937',
    headerRowFontBold: true,
    pageBreakBeforeHeadings: true,
    widowOrphanControl: true,
    firstPageNumber: 1,
    restartOnEachSection: false,
    useHybridPageNumbering: false,
    frontMatterThreshold: 4,
    frontMatterFormat: 'lowerRoman'
  }
}

const Label = ({ children, required }) => (
  <label className="block text-sm font-medium text-gray-900 mb-2">
    {children}{required ? <span className="text-red-500 ml-1">*</span> : null}
  </label>
)

const GroupTitle = ({ children, hint }) => (
  <div className="pt-2 pb-2 -mx-2 -mt-2 mb-3 border-b border-gray-200/70">
    <h4 className="text-[13px] font-semibold text-gray-900">{children}</h4>
    {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
  </div>
)

const AccordionCard = ({
  id,
  active,
  onToggle,
  headerBadge,
  headerTitle,
  headerSubtitle,
  children,
  defaultOpenPadding = 'px-4 py-4'
}) => {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white overflow-hidden transition-all ${active ? 'shadow-sm' : 'bg-gray-50/40'}`}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {headerBadge !== undefined && headerBadge !== null ? (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold shrink-0">
              {headerBadge}
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-gray-900 leading-tight">{headerTitle}</div>
            {headerSubtitle && <div className="text-[10px] text-gray-500 mt-0.5">{headerSubtitle}</div>}
          </div>
        </div>
        <svg
          className={`h-4 w-4 text-gray-500 shrink-0 transition-transform duration-200 ${active ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {active && (
        <div className={`border-t border-gray-200 space-y-4 ${defaultOpenPadding}`}>
          {children}
        </div>
      )}
    </div>
  )
}

function TypographyCard({ categoryKey, categoryTitle, form, setForm, showSpacing = false, showLineSpacing = false, showFill = false, showIndent = false, showVerticalAlign = false, showBold = true, showItalic = true, showUnderline = false, showBullet = false, showCaptionPosition = false }) {
  const t = form.typographyJson?.[categoryKey] || {}
  const update = (patch) => {
    setForm({
      ...form,
      typographyJson: {
        ...(form.typographyJson || DEFAULT_TYPOGRAPHY),
        [categoryKey]: { ...t, ...patch }
      }
    })
  }
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <Label className="!mb-1 !text-[10px]">Font</Label>
          <SelectField value={t.fontFamily || 'Calibri'} onChange={(e) => update({ fontFamily: e.target.value })}>
            {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </SelectField>
        </div>
        <div>
          <Label className="!mb-1 !text-[10px]">Size (pt)</Label>
          <SelectField value={String(t.fontSizePt ?? 11)} onChange={(e) => update({ fontSizePt: Number(e.target.value) })}>
            {FONT_SIZES_PT.map((s) => <option key={s} value={String(s)}>{s}</option>)}
          </SelectField>
        </div>
        <div className="col-span-2 flex items-center gap-3 flex-wrap">
          {showBold && (
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                checked={!!t.bold} onChange={(e) => update({ bold: e.target.checked })} />
              <span className="text-[11px] font-bold text-gray-700">B</span>
            </label>
          )}
          {showItalic && (
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                checked={!!t.italic} onChange={(e) => update({ italic: e.target.checked })} />
              <span className="text-[11px] italic text-gray-700">I</span>
            </label>
          )}
          {showUnderline && (
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                checked={!!t.underline} onChange={(e) => update({ underline: e.target.checked })} />
              <span className="text-[11px] underline text-gray-700">U</span>
            </label>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">Color</span>
            <input type="color" className="h-6 w-9 rounded border border-gray-300 cursor-pointer"
              value={t.color || '#111827'} onChange={(e) => update({ color: e.target.value })} />
          </div>
          {showFill && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500">Fill</span>
              <input type="color" className="h-6 w-9 rounded border border-gray-300 cursor-pointer"
                value={t.fillColor || '#FFFFFF'} onChange={(e) => update({ fillColor: e.target.value })} />
            </div>
          )}
        </div>
        {showSpacing && (
          <>
            <div>
              <Label className="!mb-1 !text-[10px]">Space Before (pt)</Label>
              <TextInput type="number" step="0.5" min="0" value={t.spacingBeforePt ?? 0} onChange={(e) => update({ spacingBeforePt: Number(e.target.value || 0) })} />
            </div>
            <div>
              <Label className="!mb-1 !text-[10px]">Space After (pt)</Label>
              <TextInput type="number" step="0.5" min="0" value={t.spacingAfterPt ?? 0} onChange={(e) => update({ spacingAfterPt: Number(e.target.value || 0) })} />
            </div>
          </>
        )}
        {showLineSpacing && (
          <div className="col-span-2">
            <Label className="!mb-1 !text-[10px]">Line Spacing (0.8–2.5)</Label>
            <TextInput type="number" step="0.05" min="0.8" max="2.5" value={t.lineSpacingMultiplier ?? 1.15} onChange={(e) => update({ lineSpacingMultiplier: Number(e.target.value || 1) })} />
          </div>
        )}
        {showIndent && (
          <div className="col-span-2">
            <Label className="!mb-1 !text-[10px]">Indent (mm)</Label>
            <TextInput type="number" step="0.1" min="0" value={t.indentMm ?? 0} onChange={(e) => update({ indentMm: Number(e.target.value || 0) })} />
          </div>
        )}
        {showBullet && (
          <div>
            <Label className="!mb-1 !text-[10px]">Bullet Style</Label>
            <SelectField value={t.bulletStyle || 'disc'} onChange={(e) => update({ bulletStyle: e.target.value })}>
              <option value="disc">Disc</option>
              <option value="circle">Circle</option>
              <option value="square">Square</option>
              <option value="decimal">Decimal (1.)</option>
              <option value="lower-alpha">Lower Alpha (a.)</option>
              <option value="upper-alpha">Upper Alpha (A.)</option>
            </SelectField>
          </div>
        )}
        {showVerticalAlign && (
          <div>
            <Label className="!mb-1 !text-[10px]">Vertical Align</Label>
            <SelectField value={t.verticalAlign || 'top'} onChange={(e) => update({ verticalAlign: e.target.value })}>
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </SelectField>
          </div>
        )}
        {showCaptionPosition && (
          <div>
            <Label className="!mb-1 !text-[10px]">Position</Label>
            <SelectField value={t.position || 'below'} onChange={(e) => update({ position: e.target.value })}>
              <option value="below">Below</option>
              <option value="above">Above</option>
            </SelectField>
          </div>
        )}
      </div>
  )
}

const MAX_LOGO_SIZE_MB = 2
const ACCEPTED_LOGO_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
const ACCEPTED_LOGO_EXTS = ['.jpg', '.jpeg', '.png']

function LogoUploadField({ value, onChange, disabled }) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const fileInputRef = React.useRef(null)

  function validateFile(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!ACCEPTED_LOGO_TYPES.includes(file.type) && !ACCEPTED_LOGO_EXTS.includes(ext)) {
      return 'Invalid file type. Only JPEG and PNG images are allowed.'
    }
    const sizeMb = file.size / (1024 * 1024)
    if (sizeMb > MAX_LOGO_SIZE_MB) {
      return `File too large. Maximum size is ${MAX_LOGO_SIZE_MB}MB (your file: ${sizeMb.toFixed(2)}MB).`
    }
    return null
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError('')
    const validationError = validateFile(file)
    if (validationError) {
      setUploadError(validationError)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      const res = await api.post('/smart-document-style/upload-logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const logoPath = res?.data?.data?.logoPath || res?.data?.logoPath
      if (logoPath) {
        onChange(logoPath)
      } else {
        setUploadError('Upload failed: invalid response from server')
      }
    } catch (err) {
      setUploadError(err?.response?.data?.message || err?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleRemove() {
    onChange('')
  }

  const isUrl = value && (value.startsWith('http://') || value.startsWith('https://'))
  const previewSrc = value ? (isUrl ? value : (value.startsWith('/') ? value : '/' + value)) : null

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <div className="w-24 h-24 rounded-lg border border-gray-200 bg-white flex items-center justify-center overflow-hidden">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt="Logo preview"
                className="max-w-full max-h-full object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <div className="text-[11px] text-gray-500 text-center px-2">
                No logo
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              onChange={handleFileChange}
              disabled={disabled || uploading}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
            >
              {uploading ? 'Uploading...' : 'Upload Logo'}
            </Button>
            {value && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleRemove}
                disabled={disabled || uploading}
                className="!text-red-600"
              >
                Remove
              </Button>
            )}
          </div>
          <div className="text-[11px] text-gray-500 space-y-0.5">
            <div>Format: <span className="font-medium">JPEG, PNG</span> &nbsp;|&nbsp; Max size: <span className="font-medium">{MAX_LOGO_SIZE_MB}MB</span></div>
          </div>
          {uploadError && (
            <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
              {uploadError}
            </div>
          )}
        </div>
      </div>

      <div>
        <Label>Logo Path</Label>
        <TextInput
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/uploads/branding/logos/...png or full URL"
          disabled={disabled}
        />
        <div className="text-[10px] text-gray-500 mt-1">
          Enter path manually or use upload button above
        </div>
      </div>
    </div>
  )
}

export default function DocumentStyleProfilesAdmin() {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterActive, setFilterActive] = useState('all')

  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState(emptyProfile())
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create')
  const [formStep, setFormStep] = useState(0)
  const [formErrorModal, setFormErrorModal] = useState({ open: false, title: '', message: '' })
  const [formSaving, setFormSaving] = useState(false)
  const [headerAddressText, setHeaderAddressText] = useState('')

  const [openTypo, setOpenTypo] = useState('heading1')
  const [openHeaderSection, setOpenHeaderSection] = useState('A')
  const [openFooterSection, setOpenFooterSection] = useState('A')

  function toggleOpenTypo(key) { setOpenTypo(openTypo === key ? null : key) }
  function toggleOpenHeader(key) { setOpenHeaderSection(openHeaderSection === key ? null : key) }
  function toggleOpenFooter(key) { setOpenFooterSection(openFooterSection === key ? null : key) }

  function showFormError(title, message) {
    setFormErrorModal({ open: true, title: title || 'Error', message: message || '' })
  }

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleteSaving, setDeleteSaving] = useState(false)

  const [defaultTarget, setDefaultTarget] = useState(null)
  const [defaultError, setDefaultError] = useState('')
  const [defaultSaving, setDefaultSaving] = useState(false)

  useEffect(() => { loadProfiles() }, [])

  async function loadProfiles() {
    setLoading(true); setError('')
    try {
      const res = await api.get('/smart-document-style')
      const unwrap = (() => {
        if (Array.isArray(res?.data?.data?.styleProfiles)) return res.data.data.styleProfiles
        if (Array.isArray(res?.data?.styleProfiles)) return res.data.styleProfiles
        if (Array.isArray(res?.data?.data)) return res.data.data
        if (Array.isArray(res?.data)) return res.data
        return []
      })()
      setProfiles(unwrap)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const safe = Array.isArray(profiles) ? [...profiles] : []
    let list = safe
    if (filterActive === 'active') list = list.filter((p) => p.isActive)
    else if (filterActive === 'inactive') list = list.filter((p) => !p.isActive)
    return list
  }, [profiles, filterActive])

  function openCreate() {
    setModalMode('create')
    const blank = emptyProfile()
    setForm(blank)
    setFormStep(0)
    setHeaderAddressText(Array.isArray(blank.headerCompanyAddressJson) ? blank.headerCompanyAddressJson.join('\n') : '')
    setFormErrorModal({ open: false, title: '', message: '' })
    setEditTarget(null)
    setOpenTypo('heading1')
    setOpenHeaderSection('A')
    setOpenFooterSection('A')
    setModalOpen(true)
  }

  function openEdit(p) {
    setModalMode('edit')
    setEditTarget(p)
    const base = emptyProfile()
    const merged = { ...base, ...p }
    if (!merged.typographyJson || typeof merged.typographyJson !== 'object' || Array.isArray(merged.typographyJson)) {
      merged.typographyJson = { ...DEFAULT_TYPOGRAPHY }
    } else {
      const tj = { ...DEFAULT_TYPOGRAPHY }
      Object.keys(DEFAULT_TYPOGRAPHY).forEach((k) => {
        if (merged.typographyJson[k] && typeof merged.typographyJson[k] === 'object') {
          tj[k] = { ...DEFAULT_TYPOGRAPHY[k], ...merged.typographyJson[k] }
        }
      })
      merged.typographyJson = tj
    }
    if (!Array.isArray(merged.headerCompanyAddressJson)) {
      merged.headerCompanyAddressJson = []
    }
    setForm(merged)
    setFormStep(0)
    setHeaderAddressText(Array.isArray(merged.headerCompanyAddressJson) ? merged.headerCompanyAddressJson.join('\n') : '')
    setFormErrorModal({ open: false, title: '', message: '' })
    setOpenTypo('heading1')
    setOpenHeaderSection('A')
    setOpenFooterSection('A')
    setModalOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormErrorModal({ open: false, title: '', message: '' })
    const missing = []
    if (!form.profileName.trim()) missing.push('Profile Name')
    if (missing.length) {
      showFormError(
        'Compulsory Fields Missing',
        `Sila isi medan Compulsory yang berikut sebelum simpan:\n\n• ${missing.join('\n• ')}\n\nMedan bertanda [Compulsory] diperlukan untuk meneruskan.`
      )
      return
    }
    if (form.isDefault && !form.isActive) {
      showFormError(
        'Default Profile Must Be Active',
        `Anda tanda "Set as Default" tetapi lupa aktifkan profile ini.\n\nSila tick [Active] checkbox di Step 1 sebelum simpan profile sebagai System Default.`
      )
      return
    }
    setFormSaving(true)
    try {
      const addressArr = headerAddressText.split('\n').map((s) => s.trim()).filter(Boolean)
      const payload = {
        ...form,
        pageOrientation: form.orientation || form.pageOrientation || 'PORTRAIT',
        orientation: form.orientation || form.pageOrientation || 'PORTRAIT',
        tableBorderWidthPt: form.tableBorderWidthPt ?? form.tableBorderWidth ?? 0.5,
        tableBorderWidth: form.tableBorderWidth ?? form.tableBorderWidthPt ?? 0.5,
        tableCellPaddingPt: form.tableCellPaddingPt ?? form.cellPaddingPt ?? 5,
        cellPaddingPt: form.cellPaddingPt ?? form.tableCellPaddingPt ?? 5,
        tableHeaderFillColor: form.tableHeaderFillColor || form.headerRowBgColor || '#1F2937',
        headerRowBgColor: form.headerRowBgColor || form.tableHeaderFillColor || '#1F2937',
        tableHeaderFontBold: form.tableHeaderFontBold ?? form.headerRowFontBold ?? true,
        headerRowFontBold: form.headerRowFontBold ?? form.tableHeaderFontBold ?? true,
        headerCompanyAddressJson: addressArr,
        headerLeftText: form.headerLeftText ?? form.headerText1 ?? '',
        headerCenterText: form.headerCenterText ?? form.headerText2 ?? '',
        footerLeftText: form.footerLeftText ?? form.footerText1 ?? '',
        footerCenterText: form.footerCenterText ?? form.footerText2 ?? ''
      }
      if (form.headerText1 || form.headerText2) {
        payload.headerLeftText = form.headerText1 || payload.headerLeftText
        payload.headerCenterText = form.headerText2 || payload.headerCenterText
      }
      if (form.footerText1 || form.footerText2) {
        payload.footerLeftText = form.footerText1 || payload.footerLeftText
        payload.footerCenterText = form.footerText2 || payload.footerCenterText
      }
      if (modalMode === 'create') {
        await api.post('/smart-document-style', payload)
      } else {
        await api.put(`/smart-document-style/${editTarget.id}`, payload)
      }
      setModalOpen(false)
      await loadProfiles()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || (modalMode === 'create' ? 'Create failed' : 'Update failed')
      showFormError(modalMode === 'create' ? 'Create Profile Failed' : 'Save Changes Failed', msg)
    } finally {
      setFormSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteError(''); setDeleteSaving(true)
    try {
      await api.delete(`/smart-document-style/${deleteTarget.id}`)
      setDeleteTarget(null)
      await loadProfiles()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Delete failed'
      setDeleteError(msg)
    } finally {
      setDeleteSaving(false)
    }
  }

  async function handleSetDefault() {
    if (!defaultTarget) return
    setDefaultError(''); setDefaultSaving(true)
    try {
      await api.post(`/smart-document-style/${defaultTarget.id}/set-default`)
      setDefaultTarget(null)
      await loadProfiles()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Set default failed'
      setDefaultError(msg)
    } finally {
      setDefaultSaving(false)
    }
  }

  const stepIndicator = (
    <div className="w-full">
      <div className="flex items-start justify-between relative">
        <div className="absolute top-4 left-0 right-0 h-[2px] bg-gray-200 -z-0" />
        <div
          className="absolute top-4 left-0 h-[2px] bg-blue-600 -z-0 transition-all duration-300"
          style={{ width: `calc(${(formStep / (STYLE_PROFILE_STEPS.length - 1)) * 100}% )` }}
        />
        {STYLE_PROFILE_STEPS.map((tab, idx) => {
          const isActive = idx === formStep
          const isCompleted = idx < formStep
          const req = STYLE_PROFILE_STEP_REQUIRED[idx]?.required
          return (
            <div key={tab.id} className="flex flex-col items-center gap-2 flex-1 relative z-10 px-1">
              <div
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all',
                  isCompleted
                    ? 'bg-green-600 border-green-600 text-white'
                    : isActive
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm ring-4 ring-blue-600/10'
                    : 'bg-white border-gray-200 text-gray-500'
                ].join(' ')}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span
                  className={[
                    'text-[11px] font-medium leading-tight',
                    isActive ? 'text-gray-900' : isCompleted ? 'text-gray-900' : 'text-gray-500'
                  ].join(' ')}
                >
                  {tab.label}
                </span>
                {isActive && (
                  <span
                    className={[
                      'text-[10px] font-medium tracking-wide',
                      req ? 'text-red-600' : 'text-gray-500'
                    ].join(' ')}
                  >
                    {req ? 'Required *' : 'Optional'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-center text-[11px] text-gray-500 mt-2 tabular-nums tracking-wide">
        Step {formStep + 1} of {STYLE_PROFILE_STEPS.length}
      </p>
    </div>
  )

  return (
    <PageContainer className="space-y-5">
      <PageHeader
        title="Document Style Profiles"
        subtitle="Centralized formatting templates used by Smart Documents. Control page layout, typography, headers, footers, and table styling."
        actions={
          <Button onClick={openCreate}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Style Profile
          </Button>
        }
      />

      <AppSurface className="space-y-4">
        <div className="flex items-center gap-2">
          <span className={['inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-colors', filterActive === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'].join(' ')} onClick={() => setFilterActive('all')}>All</span>
          <span className={['inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-colors', filterActive === 'active' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'].join(' ')} onClick={() => setFilterActive('active')}>Active</span>
          <span className={['inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-colors', filterActive === 'inactive' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'].join(' ')} onClick={() => setFilterActive('inactive')}>Inactive</span>
        </div>

        <SectionHeader title={`Profiles (${filtered.length})`} />
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <InlineSpinner className="h-6 w-6 border-gray-200 border-t-blue-600" />
            <span className="ml-3 text-sm text-gray-500">Loading style profiles...</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyPanelState
            title="No style profiles"
            description="Create a profile to control page dimensions, fonts, headers/footers, and table formatting for Smart Documents."
          />
        ) : (
          <TableContainer>
            <Table>
              <thead>
                <Tr>
                  <Th>Profile Name</Th>
                  <Th>Description</Th>
                  <Th>Page</Th>
                  <Th align="center">Active</Th>
                  <Th align="center">Default</Th>
                  <Th>Created At</Th>
                  <Th align="right" stickyRight>Actions</Th>
                </Tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {p.profileName}
                        {p.isDefault && <Pill variant="info">DEFAULT</Pill>}
                      </div>
                    </Td>
                    <Td className="text-gray-500 text-xs">{p.description || '—'}</Td>
                    <Td className="text-xs text-gray-700">
                      <span className="font-semibold">{p.pageSize || '—'}</span>
                      <span className="mx-1 text-gray-400">·</span>
                      <span>{(p.orientation || p.pageOrientation || 'PORTRAIT').toLowerCase()}</span>
                    </Td>
                    <Td align="center">{p.isActive ? <Pill variant="success">Active</Pill> : <Pill variant="danger">Inactive</Pill>}</Td>
                    <Td align="center">{p.isDefault ? <Pill variant="success">Yes</Pill> : <span className="text-gray-400">—</span>}</Td>
                    <Td className="text-xs text-gray-500">{formatDate(p.createdAt)}</Td>
                    <Td align="right" stickyRight>
                      <ActionMenu
                        actions={[
                          { label: 'Edit', onClick: () => openEdit(p) },
                          { label: 'Set as Default', onClick: () => { setDefaultTarget(p); setDefaultError('') }, dividerAfter: true, disabled: !!p.isDefault || !p.isActive },
                          { label: 'Delete', onClick: () => { setDeleteTarget(p); setDeleteError('') }, variant: 'destructive', disabled: !!p.isDefault }
                        ]}
                      />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}
      </AppSurface>

      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} size="3xl">
          <ModalHeader
            title={modalMode === 'create' ? 'Create Style Profile' : `Edit: ${editTarget?.profileName || ''}`}
            subtitle=""
            onClose={() => setModalOpen(false)}
          />
          <form onSubmit={(e) => {
              if (formStep < 6) {
                e.preventDefault()
                if (formStep === 0) {
                  const missing = []
                  if (!form.profileName.trim()) missing.push('Profile Name')
                  if (missing.length) {
                    showFormError('Required fields missing', `Please complete the following required field before proceeding:\n- ${missing.join('\n- ')}`)
                    return
                  }
                }
                setFormStep(formStep + 1)
              } else handleSubmit(e)
            }}>
            <ModalBody className="space-y-8">
              <p className="text-xs text-gray-500">Fields marked with <span className="text-red-600 font-semibold">*</span> are required. All other fields are pre-filled with default values.</p>

              {stepIndicator}

            <div className="min-h-[300px]">
              {formStep === 0 && (
              <>
                <p className="text-xs font-semibold text-gray-900 tracking-wide uppercase mt-2 mb-5">General</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Profile Name <span className="text-red-600">*</span></label>
                    <TextInput value={form.profileName} onChange={(e) => setForm({ ...form, profileName: e.target.value })} placeholder="e.g. Company Letterhead A4" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Description</label>
                    <TextArea rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description / when to use" />
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                    <span className="text-sm text-gray-900">Active</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      checked={!!form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
                    <span className="text-sm text-gray-900">Set as Default</span>
                  </label>
                </div>
              </>
              )}
              {formStep === 1 && (
              <>
                <p className="text-xs font-semibold text-gray-900 tracking-wide uppercase mt-2 mb-5">Page Settings</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Page Size</label>
                    <SelectField value={form.pageSize} onChange={(e) => setForm({ ...form, pageSize: e.target.value })}>
                      {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </SelectField>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Orientation</label>
                    <SelectField value={form.orientation} onChange={(e) => setForm({ ...form, orientation: e.target.value, pageOrientation: e.target.value })}>
                      {ORIENTATIONS.map((o) => <option key={o} value={o}>{o[0]}{o.slice(1).toLowerCase()}</option>)}
                    </SelectField>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Page Width (mm)</label>
                    <TextInput type="number" step="0.1" value={form.pageWidthMm ?? ''} onChange={(e) => setForm({ ...form, pageWidthMm: e.target.value === '' ? null : Number(e.target.value) })} placeholder="auto" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Page Height (mm)</label>
                    <TextInput type="number" step="0.1" value={form.pageHeightMm ?? ''} onChange={(e) => setForm({ ...form, pageHeightMm: e.target.value === '' ? null : Number(e.target.value) })} placeholder="auto" />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Top Margin (mm)</label>
                    <TextInput type="number" step="0.1" value={form.marginTopMm} onChange={(e) => setForm({ ...form, marginTopMm: Number(e.target.value || 0) })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Bottom Margin (mm)</label>
                    <TextInput type="number" step="0.1" value={form.marginBottomMm} onChange={(e) => setForm({ ...form, marginBottomMm: Number(e.target.value || 0) })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Left Margin (mm)</label>
                    <TextInput type="number" step="0.1" value={form.marginLeftMm} onChange={(e) => setForm({ ...form, marginLeftMm: Number(e.target.value || 0) })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Right Margin (mm)</label>
                    <TextInput type="number" step="0.1" value={form.marginRightMm} onChange={(e) => setForm({ ...form, marginRightMm: Number(e.target.value || 0) })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Header Height (mm)</label>
                    <TextInput type="number" step="0.1" value={form.headerHeightMm ?? ''} onChange={(e) => setForm({ ...form, headerHeightMm: e.target.value === '' ? null : Number(e.target.value) })} placeholder="auto" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Footer Height (mm)</label>
                    <TextInput type="number" step="0.1" value={form.footerHeightMm ?? ''} onChange={(e) => setForm({ ...form, footerHeightMm: e.target.value === '' ? null : Number(e.target.value) })} placeholder="auto" />
                  </div>
                </div>
              </>
              )}
              {formStep === 2 && (
              <>
                <p className="text-xs font-semibold text-gray-900 tracking-wide uppercase mt-2 mb-5">Typography</p>
                <div className="space-y-5">
                  <AccordionCard id="heading1" active={openTypo === 'heading1'} onToggle={toggleOpenTypo} headerTitle="Heading 1">
                    <TypographyCard categoryKey="heading1" categoryTitle="Heading 1" form={form} setForm={setForm} showSpacing showUnderline />
                  </AccordionCard>
                  <AccordionCard id="heading2" active={openTypo === 'heading2'} onToggle={toggleOpenTypo} headerTitle="Heading 2">
                    <TypographyCard categoryKey="heading2" categoryTitle="Heading 2" form={form} setForm={setForm} showSpacing showUnderline />
                  </AccordionCard>
                  <AccordionCard id="heading3" active={openTypo === 'heading3'} onToggle={toggleOpenTypo} headerTitle="Heading 3">
                    <TypographyCard categoryKey="heading3" categoryTitle="Heading 3" form={form} setForm={setForm} showSpacing showUnderline />
                  </AccordionCard>
                  <AccordionCard id="heading4" active={openTypo === 'heading4'} onToggle={toggleOpenTypo} headerTitle="Heading 4">
                    <TypographyCard categoryKey="heading4" categoryTitle="Heading 4" form={form} setForm={setForm} showSpacing showUnderline />
                  </AccordionCard>
                  <AccordionCard id="body" active={openTypo === 'body'} onToggle={toggleOpenTypo} headerTitle="Body Paragraph">
                    <TypographyCard categoryKey="body" categoryTitle="Body Paragraph" form={form} setForm={setForm} showLineSpacing />
                  </AccordionCard>
                  <AccordionCard id="listItem" active={openTypo === 'listItem'} onToggle={toggleOpenTypo} headerTitle="List Item">
                    <TypographyCard categoryKey="listItem" categoryTitle="List Item" form={form} setForm={setForm} showIndent showBullet />
                  </AccordionCard>
                  <AccordionCard id="tableHeader" active={openTypo === 'tableHeader'} onToggle={toggleOpenTypo} headerTitle="Table Header">
                    <TypographyCard categoryKey="tableHeader" categoryTitle="Table Header" form={form} setForm={setForm} showFill showVerticalAlign />
                  </AccordionCard>
                  <AccordionCard id="tableCell" active={openTypo === 'tableCell'} onToggle={toggleOpenTypo} headerTitle="Table Cell">
                    <TypographyCard categoryKey="tableCell" categoryTitle="Table Cell" form={form} setForm={setForm} showVerticalAlign showLineSpacing />
                  </AccordionCard>
                  <AccordionCard id="headerText" active={openTypo === 'headerText'} onToggle={toggleOpenTypo} headerTitle="Header Text">
                    <TypographyCard categoryKey="headerText" categoryTitle="Header Text" form={form} setForm={setForm} />
                  </AccordionCard>
                  <AccordionCard id="footerText" active={openTypo === 'footerText'} onToggle={toggleOpenTypo} headerTitle="Footer Text">
                    <TypographyCard categoryKey="footerText" categoryTitle="Footer Text" form={form} setForm={setForm} />
                  </AccordionCard>
                  <AccordionCard id="caption" active={openTypo === 'caption'} onToggle={toggleOpenTypo} headerTitle="Caption">
                    <TypographyCard categoryKey="caption" categoryTitle="Caption" form={form} setForm={setForm} showCaptionPosition showItalic showBold={false} />
                  </AccordionCard>
                </div>
              </>
              )}
              {formStep === 3 && (
              <>
                <p className="text-xs font-semibold text-gray-900 tracking-wide uppercase mt-2 mb-5">Header</p>
                <label className="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors w-fit mb-5">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    checked={!!form.headerEnabled} onChange={(e) => setForm({ ...form, headerEnabled: e.target.checked })} />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Enable Header</span>
                    
                  </div>
                </label>
                {form.headerEnabled && (
                  <div className="space-y-5 pl-5 border-l-2 border-blue-500/30">
                    <label className="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors w-fit mb-3">
                      <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        checked={!!form.headerUseProfessionalLayout} onChange={(e) => setForm({ ...form, headerUseProfessionalLayout: e.target.checked })} />
                      <div>
                        <span className="text-sm text-gray-700 font-medium">Use Professional Header</span>
                        
                      </div>
                    </label>

                    {form.headerUseProfessionalLayout ? (
                      <div className="space-y-5">
                        <AccordionCard id="A" active={openHeaderSection === 'A'} onToggle={toggleOpenHeader} headerBadge="A" headerTitle="Logo Settings">
                          <LogoUploadField
                            value={form.headerLogoPath}
                            onChange={(v) => setForm({ ...form, headerLogoPath: v })}
                            disabled={formSaving}
                          />
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <label className="block text-sm font-medium text-gray-900 mb-2">Logo Width (mm) </label>
                              <TextInput type="number" step="0.1" min="0" value={form.logoWidthMm ?? ''} onChange={(e) => setForm({ ...form, logoWidthMm: e.target.value === '' ? null : Number(e.target.value) })} placeholder="35" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-900 mb-2">Logo Height (mm) </label>
                              <TextInput type="number" step="0.1" min="0" value={form.logoHeightMm ?? ''} onChange={(e) => setForm({ ...form, logoHeightMm: e.target.value === '' ? null : Number(e.target.value) })} placeholder="kosong = auto aspect ratio" />
                            </div>
                          </div>
                        </AccordionCard>

                        <AccordionCard id="B" active={openHeaderSection === 'B'} onToggle={toggleOpenHeader} headerBadge="B" headerTitle="Company Identity Line">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <label className="block text-sm font-medium text-gray-900 mb-2">Company Name </label>
                              <TextInput value={form.headerCompanyName || ''} onChange={(e) => setForm({ ...form, headerCompanyName: e.target.value })} placeholder="CLB Holdings Berhad" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-900 mb-2">Company Registration No. </label>
                              <TextInput value={form.headerCompanyRegNo || ''} onChange={(e) => setForm({ ...form, headerCompanyRegNo: e.target.value })} placeholder="e.g. 123456-K" />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                checked={!!form.headerCompanyNameUnderline} onChange={(e) => setForm({ ...form, headerCompanyNameUnderline: e.target.checked })} />
                              <span className="text-sm text-gray-700">Underline company name </span>
                            </label>
                            <div className="flex items-center gap-2">
                              <label className="block text-sm font-medium text-gray-900 mb-0">Underline Color</label>
                              <input type="color" className="h-8 w-14 rounded-lg border border-gray-300 cursor-pointer"
                                value={form.headerCompanyNameColor || '#1F2937'} onChange={(e) => setForm({ ...form, headerCompanyNameColor: e.target.value })} />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="block text-sm font-medium text-gray-900 mb-0">Name Color</label>
                              <input type="color" className="h-8 w-14 rounded-lg border border-gray-300 cursor-pointer"
                                value={form.headerCompanyNameColor || '#1F2937'} onChange={(e) => setForm({ ...form, headerCompanyNameColor: e.target.value })} />
                            </div>
                          </div>
                        </AccordionCard>

                        <AccordionCard id="C" active={openHeaderSection === 'C'} onToggle={toggleOpenHeader} headerBadge="C" headerTitle="Company Address (1 line per row)">
                          <div>
                            <label className="block text-sm font-medium text-gray-900 mb-2">Address Lines</label>
                            <TextArea rows={4} value={headerAddressText} onChange={(e) => setHeaderAddressText(e.target.value)} placeholder={'Level 3, Tower A\nThe Horizon, Bangsar South\n59200 Kuala Lumpur'} />
                          </div>
                        </AccordionCard>

                        <AccordionCard id="D" active={openHeaderSection === 'D'} onToggle={toggleOpenHeader} headerBadge="D" headerTitle="Contact Details">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <label className="block text-sm font-medium text-gray-900 mb-2">Phone</label>
                              <TextInput value={form.headerCompanyPhone || ''} onChange={(e) => setForm({ ...form, headerCompanyPhone: e.target.value })} placeholder="Tel: +60 12-719 2926" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-900 mb-2">Email Address</label>
                              <TextInput value={form.headerCompanyEmail || ''} onChange={(e) => setForm({ ...form, headerCompanyEmail: e.target.value })} placeholder="hello@clbholdings.com" />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="block text-sm font-medium text-gray-900 mb-0">Email Link Color </label>
                            <input type="color" className="h-8 w-14 rounded-lg border border-gray-300 cursor-pointer"
                              value={form.headerCompanyEmailColor || '#0563C1'} onChange={(e) => setForm({ ...form, headerCompanyEmailColor: e.target.value })} />
                          </div>
                        </AccordionCard>

                        <AccordionCard id="E" active={openHeaderSection === 'E'} onToggle={toggleOpenHeader} headerBadge="E" headerTitle="Bottom Divider Line">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                checked={!!form.headerBottomDividerEnabled} onChange={(e) => setForm({ ...form, headerBottomDividerEnabled: e.target.checked })} />
                              <span className="text-sm text-gray-700">Show divider line</span>
                            </label>
                            <div>
                              <label className="block text-sm font-medium text-gray-900 mb-2">Thickness (pt)</label>
                              <TextInput type="number" step="0.25" min="0" value={form.headerBottomDividerWidthPt ?? ''} onChange={(e) => setForm({ ...form, headerBottomDividerWidthPt: e.target.value === '' ? null : Number(e.target.value) })} placeholder="1.5" />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="block text-sm font-medium text-gray-900 mb-0">Divider Color</label>
                              <input type="color" className="h-8 w-14 rounded-lg border border-gray-300 cursor-pointer"
                                value={form.headerBottomDividerColor || '#000000'} onChange={(e) => setForm({ ...form, headerBottomDividerColor: e.target.value })} />
                            </div>
                          </div>
                        </AccordionCard>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">Header Left Text </label>
                          <TextInput value={form.headerLeftText || form.headerText1 || ''} onChange={(e) => setForm({ ...form, headerLeftText: e.target.value, headerText1: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">Header Center Text </label>
                          <TextInput value={form.headerCenterText || form.headerText2 || ''} onChange={(e) => setForm({ ...form, headerCenterText: e.target.value, headerText2: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">Header Right Text </label>
                          <TextInput value={form.headerRightText || ''} onChange={(e) => setForm({ ...form, headerRightText: e.target.value })} />
                        </div>
                        <div className="md:col-span-3">
                          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/40 p-3">
                            <div className="text-[12px] font-semibold text-gray-900">Logo Settings</div>
                            <LogoUploadField
                              value={form.headerLogoPath}
                              onChange={(v) => setForm({ ...form, headerLogoPath: v })}
                              disabled={formSaving}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
              )}
              {formStep === 4 && (
              <>
                <p className="text-xs font-semibold text-gray-900 tracking-wide uppercase mt-2 mb-5">Footer</p>
                <label className="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors w-fit mb-5">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    checked={!!form.footerEnabled} onChange={(e) => setForm({ ...form, footerEnabled: e.target.checked })} />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Enable Footer</span>
                    
                  </div>
                </label>
                {form.footerEnabled && (
                  <div className="space-y-5 pl-5 border-l-2 border-blue-500/30">
                    <label className="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors w-fit mb-3">
                      <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        checked={!!form.footerUseProfessionalLayout} onChange={(e) => setForm({ ...form, footerUseProfessionalLayout: e.target.checked })} />
                      <div>
                        <span className="text-sm text-gray-700 font-medium">Use Professional Footer Layout</span>
                        
                      </div>
                    </label>

                    {form.footerUseProfessionalLayout ? (
                      <div className="space-y-5">
                        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
                          <GroupTitle hint="Pilih SATU kandungan utama untuk footer">Footer Content (Choose One)</GroupTitle>
                          <div className="space-y-2">
                            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${openFooterSection === 'A' ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/30' : 'border-gray-200 hover:bg-gray-50'}`}>
                              <input
                                type="radio"
                                name="footerContent"
                                className="h-4 w-4 mt-0.5 text-blue-600 border-gray-300"
                                checked={openFooterSection === 'A'}
                                onChange={() => setOpenFooterSection('A')}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold shrink-0">A</span>
                                  <span className="text-sm font-semibold text-gray-900">Classification / Confidentiality</span>
                                  <SelectField
                                    className="!w-auto !min-w-[140px] !text-[11px] !h-7 !py-0 ml-auto"
                                    value={openFooterSection === 'A' ? (form.footerContentPrimaryPosition || 'left') : ''}
                                    onChange={(e) => setForm({ ...form, footerContentPrimaryPosition: e.target.value })}
                                    disabled={openFooterSection !== 'A'}
                                  >
                                    <option value="left">↤ Align Left</option>
                                    <option value="center">⬌ Center</option>
                                    <option value="right">↦ Align Right</option>
                                  </SelectField>
                                </div>
                                {openFooterSection === 'A' && (
                                  <div className="mt-3 space-y-3 pl-7">
                                    <div>
                                      <label className="block text-sm font-medium text-gray-900 mb-2">Confidentiality Text</label>
                                      <TextArea rows={2} value={form.footerConfidentialText || ''} onChange={(e) => setForm({ ...form, footerConfidentialText: e.target.value })} placeholder={'CONFIDENTIAL - This document is the property of CLB Holdings Berhad.'} />
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-900 mb-2">Classification Mark</label>
                                      <TextInput value={form.footerClassificationMark || ''} onChange={(e) => setForm({ ...form, footerClassificationMark: e.target.value })} placeholder="INTERNAL USE ONLY / SOP" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </label>

                            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${openFooterSection === 'B' ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/30' : 'border-gray-200 hover:bg-gray-50'}`}>
                              <input
                                type="radio"
                                name="footerContent"
                                className="h-4 w-4 mt-0.5 text-blue-600 border-gray-300"
                                checked={openFooterSection === 'B'}
                                onChange={() => setOpenFooterSection('B')}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold shrink-0">B</span>
                                  <span className="text-sm font-semibold text-gray-900">Auto-Document Metadata</span>
                                  <SelectField
                                    className="!w-auto !min-w-[140px] !text-[11px] !h-7 !py-0 ml-auto"
                                    value={openFooterSection === 'B' ? (form.footerContentPrimaryPosition || 'left') : ''}
                                    onChange={(e) => setForm({ ...form, footerContentPrimaryPosition: e.target.value })}
                                    disabled={openFooterSection !== 'B'}
                                  >
                                    <option value="left">↤ Align Left</option>
                                    <option value="center">⬌ Center</option>
                                    <option value="right">↦ Align Right</option>
                                  </SelectField>
                                </div>
                                {openFooterSection === 'B' && (
                                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 pl-7">
                                    <label className="flex items-start gap-2 cursor-pointer rounded-lg px-3 py-2 hover:bg-white transition-colors">
                                      <input type="checkbox" className="h-4 w-4 mt-0.5 rounded border-gray-300 text-blue-600"
                                        checked={!!form.footerShowDocCodeAndRev} onChange={(e) => setForm({ ...form, footerShowDocCodeAndRev: e.target.checked })} />
                                      <span className="text-sm text-gray-700">Show Document Code &amp; Revision</span>
                                    </label>
                                    <label className="flex items-start gap-2 cursor-pointer rounded-lg px-3 py-2 hover:bg-white transition-colors">
                                      <input type="checkbox" className="h-4 w-4 mt-0.5 rounded border-gray-300 text-blue-600"
                                        checked={!!form.footerShowEffectiveDate} onChange={(e) => setForm({ ...form, footerShowEffectiveDate: e.target.checked })} />
                                      <span className="text-sm text-gray-700">Show Effective Date</span>
                                    </label>
                                    <label className="flex items-start gap-2 cursor-pointer rounded-lg px-3 py-2 hover:bg-white transition-colors">
                                      <input type="checkbox" className="h-4 w-4 mt-0.5 rounded border-gray-300 text-blue-600"
                                        checked={!!form.footerShowPreparedBy} onChange={(e) => setForm({ ...form, footerShowPreparedBy: e.target.checked })} />
                                      <span className="text-sm text-gray-700">Show Prepared By Name</span>
                                    </label>
                                    <label className="flex items-start gap-2 cursor-pointer rounded-lg px-3 py-2 hover:bg-white transition-colors">
                                      <input type="checkbox" className="h-4 w-4 mt-0.5 rounded border-gray-300 text-blue-600"
                                        checked={!!form.footerShowApprovedBy} onChange={(e) => setForm({ ...form, footerShowApprovedBy: e.target.checked })} />
                                      <span className="text-sm text-gray-700">Show Approved By Name</span>
                                    </label>
                                  </div>
                                )}
                              </div>
                            </label>

                            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${openFooterSection === 'C' ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/30' : 'border-gray-200 hover:bg-gray-50'}`}>
                              <input
                                type="radio"
                                name="footerContent"
                                className="h-4 w-4 mt-0.5 text-blue-600 border-gray-300"
                                checked={openFooterSection === 'C'}
                                onChange={() => setOpenFooterSection('C')}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold shrink-0">C</span>
                                  <span className="text-sm font-semibold text-gray-900">Disclaimer / Copyright Line</span>
                                  <SelectField
                                    className="!w-auto !min-w-[140px] !text-[11px] !h-7 !py-0 ml-auto"
                                    value={openFooterSection === 'C' ? (form.footerContentPrimaryPosition || 'left') : ''}
                                    onChange={(e) => setForm({ ...form, footerContentPrimaryPosition: e.target.value })}
                                    disabled={openFooterSection !== 'C'}
                                  >
                                    <option value="left">↤ Align Left</option>
                                    <option value="center">⬌ Center</option>
                                    <option value="right">↦ Align Right</option>
                                  </SelectField>
                                </div>
                                {openFooterSection === 'C' && (
                                  <div className="mt-3 pl-7">
                                    <label className="block text-sm font-medium text-gray-900 mb-2">Disclaimer Text</label>
                                    <TextInput value={form.footerDisclaimerText || ''} onChange={(e) => setForm({ ...form, footerDisclaimerText: e.target.value })} placeholder="© 2025 CLB Holdings Berhad. All rights reserved." />
                                  </div>
                                )}
                              </div>
                            </label>
                          </div>
                        </div>

                        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
                          <GroupTitle hint="Optional add-ons untuk semua jenis footer">Universal Footer Options</GroupTitle>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold shrink-0">D</span>
                                <span className="text-sm font-semibold text-gray-900">Top Divider Line</span>
                              </div>
                              <div className="grid grid-cols-1 gap-3 pl-7">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                    checked={!!form.footerTopDividerEnabled} onChange={(e) => setForm({ ...form, footerTopDividerEnabled: e.target.checked })} />
                                  <span className="text-sm text-gray-700">Show divider</span>
                                </label>
                                <div>
                                  <label className="block text-sm font-medium text-gray-900 mb-2">Thickness (pt)</label>
                                  <TextInput type="number" step="0.25" min="0" value={form.footerTopDividerWidthPt ?? ''} onChange={(e) => setForm({ ...form, footerTopDividerWidthPt: e.target.value === '' ? null : Number(e.target.value) })} placeholder="0.75" />
                                </div>
                                <div className="grid grid-cols-2 gap-3 items-end">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-900 mb-2">Width Style</label>
                                    <SelectField value={form.footerTopDividerWidthMode || 'full'} onChange={(e) => setForm({ ...form, footerTopDividerWidthMode: e.target.value })}>
                                      <option value="full">▬▬ Full Width</option>
                                      <option value="eighty">▬ 80% Center</option>
                                      <option value="left">▬ Left Align 60%</option>
                                      <option value="right">▬ Right Align 60%</option>
                                    </SelectField>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <label className="block text-sm font-medium text-gray-900 mb-0">Color</label>
                                    <input type="color" className="h-8 w-14 rounded-lg border border-gray-300 cursor-pointer"
                                      value={form.footerTopDividerColor || '#6B7280'} onChange={(e) => setForm({ ...form, footerTopDividerColor: e.target.value })} />
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold shrink-0">E</span>
                                <span className="text-sm font-semibold text-gray-900">Page Numbers</span>
                              </div>
                              <div className="grid grid-cols-1 gap-3 pl-7">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                    checked={!!form.showPageNumbers} onChange={(e) => setForm({ ...form, showPageNumbers: e.target.checked })} />
                                  <span className="text-sm text-gray-700">Show Page Numbers</span>
                                </label>
                                <div>
                                  <label className="block text-sm font-medium text-gray-900 mb-2">Format</label>
                                  <SelectField value={form.pageNumberFormat} onChange={(e) => setForm({ ...form, pageNumberFormat: e.target.value })}>
                                    {PAGE_NUMBER_FORMATS.map((p) => <option key={p} value={p}>{p}</option>)}
                                  </SelectField>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-900 mb-2">Position</label>
                                  <SelectField value={form.pageNumberPosition || 'right'} onChange={(e) => setForm({ ...form, pageNumberPosition: e.target.value })}>
                                    <option value="left">↤ Left Column</option>
                                    <option value="center">⬌ Center Column</option>
                                    <option value="right">↦ Right Column</option>
                                  </SelectField>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                          <GroupTitle hint="3-slot footer: tentukan jenis kandungan untuk setiap kedudukan">Footer Columns (Left · Center · Right)</GroupTitle>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
                            <div className="space-y-3 p-3 rounded-lg bg-gray-50/60 border border-gray-100">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold shrink-0">L</span>
                                <span className="text-xs font-semibold text-gray-700 tracking-wide uppercase">Left Column</span>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Content Type</label>
                                <SelectField
                                  value={form.footerLeftText ? (form.footerLeftText.startsWith('__TYPE:') ? form.footerLeftText : 'free') : 'none'}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === 'none') setForm({ ...form, footerLeftText: '' })
                                    else if (v === 'free') setForm({ ...form, footerLeftText: '' })
                                    else setForm({ ...form, footerLeftText: v })
                                  }}
                                  className="!text-[12px]"
                                >
                                  <option value="none">— Empty —</option>
                                  <option value="free">Free Text</option>
                                  <option value="__TYPE:page_number">Page Number</option>
                                  <option value="__TYPE:doc_code_rev">Doc Code &amp; Revision</option>
                                  <option value="__TYPE:effective_date">Effective Date</option>
                                  <option value="__TYPE:prepared_by">Prepared By</option>
                                  <option value="__TYPE:approved_by">Approved By</option>
                                  <option value="__TYPE:copyright">Copyright</option>
                                  <option value="__TYPE:classification">Classification</option>
                                  <option value="__TYPE:company_name">Company Name</option>
                                </SelectField>
                              </div>
                              {(!form.footerLeftText || form.footerLeftText === 'free' || !form.footerLeftText.startsWith('__TYPE:')) && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Free Text Value</label>
                                  <TextInput
                                    value={form.footerLeftText && form.footerLeftText.startsWith('__TYPE:') ? '' : (form.footerLeftText || '')}
                                    onChange={(e) => setForm({ ...form, footerLeftText: e.target.value })}
                                    placeholder="e.g. CLB Holdings Berhad"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="space-y-3 p-3 rounded-lg bg-gray-50/60 border border-gray-100">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 text-white text-[11px] font-bold shrink-0">C</span>
                                <span className="text-xs font-semibold text-gray-700 tracking-wide uppercase">Center Column</span>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Content Type</label>
                                <SelectField
                                  value={form.footerCenterText ? (form.footerCenterText.startsWith('__TYPE:') ? form.footerCenterText : 'free') : 'none'}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === 'none') setForm({ ...form, footerCenterText: '' })
                                    else if (v === 'free') setForm({ ...form, footerCenterText: '' })
                                    else setForm({ ...form, footerCenterText: v })
                                  }}
                                  className="!text-[12px]"
                                >
                                  <option value="none">— Empty —</option>
                                  <option value="free">Free Text</option>
                                  <option value="__TYPE:page_number">Page Number</option>
                                  <option value="__TYPE:doc_code_rev">Doc Code &amp; Revision</option>
                                  <option value="__TYPE:effective_date">Effective Date</option>
                                  <option value="__TYPE:prepared_by">Prepared By</option>
                                  <option value="__TYPE:approved_by">Approved By</option>
                                  <option value="__TYPE:copyright">Copyright</option>
                                  <option value="__TYPE:classification">Classification</option>
                                  <option value="__TYPE:company_name">Company Name</option>
                                </SelectField>
                              </div>
                              {(!form.footerCenterText || form.footerCenterText === 'free' || !form.footerCenterText.startsWith('__TYPE:')) && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Free Text Value</label>
                                  <TextInput
                                    value={form.footerCenterText && form.footerCenterText.startsWith('__TYPE:') ? '' : (form.footerCenterText || '')}
                                    onChange={(e) => setForm({ ...form, footerCenterText: e.target.value })}
                                    placeholder="e.g. www.clbholdings.com"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="space-y-3 p-3 rounded-lg bg-gray-50/60 border border-gray-100">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-[11px] font-bold shrink-0">R</span>
                                <span className="text-xs font-semibold text-gray-700 tracking-wide uppercase">Right Column</span>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Content Type</label>
                                <SelectField
                                  value={form.footerRightText ? (form.footerRightText.startsWith('__TYPE:') ? form.footerRightText : 'free') : 'none'}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === 'none') setForm({ ...form, footerRightText: '' })
                                    else if (v === 'free') setForm({ ...form, footerRightText: '' })
                                    else setForm({ ...form, footerRightText: v })
                                  }}
                                  className="!text-[12px]"
                                >
                                  <option value="none">— Empty —</option>
                                  <option value="free">Free Text</option>
                                  <option value="__TYPE:page_number">Page Number</option>
                                  <option value="__TYPE:doc_code_rev">Doc Code &amp; Revision</option>
                                  <option value="__TYPE:effective_date">Effective Date</option>
                                  <option value="__TYPE:prepared_by">Prepared By</option>
                                  <option value="__TYPE:approved_by">Approved By</option>
                                  <option value="__TYPE:copyright">Copyright</option>
                                  <option value="__TYPE:classification">Classification</option>
                                  <option value="__TYPE:company_name">Company Name</option>
                                </SelectField>
                              </div>
                              {(!form.footerRightText || form.footerRightText === 'free' || !form.footerRightText.startsWith('__TYPE:')) && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Free Text Value</label>
                                  <TextInput
                                    value={form.footerRightText && form.footerRightText.startsWith('__TYPE:') ? '' : (form.footerRightText || '')}
                                    onChange={(e) => setForm({ ...form, footerRightText: e.target.value })}
                                    placeholder="e.g. Page 1 of 5"
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 p-3 rounded-lg bg-blue-50/30 border border-blue-100">
                            <div>
                              <label className="block text-xs font-semibold text-gray-800 mb-2">Page Number Format</label>
                              <SelectField value={form.pageNumberFormat} onChange={(e) => setForm({ ...form, pageNumberFormat: e.target.value })}>
                                {PAGE_NUMBER_FORMATS.map((p) => <option key={p} value={p}>{p}</option>)}
                              </SelectField>
                              <p className="text-[10px] text-gray-500 mt-1">Digunakan jika mana-mana column pilih "Page Number".</p>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-800 mb-2">Fallback Classification Text</label>
                              <TextInput
                                value={form.footerClassificationMark || ''}
                                onChange={(e) => setForm({ ...form, footerClassificationMark: e.target.value })}
                                placeholder="INTERNAL USE ONLY / CONFIDENTIAL"
                              />
                              <p className="text-[10px] text-gray-500 mt-1">Digunakan jika mana-mana column pilih "Classification".</p>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-800 mb-2">Fallback Copyright Text</label>
                              <TextInput
                                value={form.footerDisclaimerText || ''}
                                onChange={(e) => setForm({ ...form, footerDisclaimerText: e.target.value })}
                                placeholder="© 2025 CLB Holdings Berhad"
                              />
                              <p className="text-[10px] text-gray-500 mt-1">Digunakan jika mana-mana column pilih "Copyright".</p>
                            </div>
                            <div className="flex items-end">
                              <label className="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 transition-colors w-full justify-center">
                                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                  checked={!!form.footerTopDividerEnabled} onChange={(e) => setForm({ ...form, footerTopDividerEnabled: e.target.checked })} />
                                <span className="text-sm text-gray-700">Show Top Divider Line</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
              )}
              {formStep === 5 && (
              <>
                <p className="text-xs font-semibold text-gray-900 tracking-wide uppercase mt-2 mb-5">Tables</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Border Width (pt) </label>
                    <TextInput type="number" step="0.1" min="0" value={form.tableBorderWidthPt ?? form.tableBorderWidth ?? 0.5} onChange={(e) => setForm({ ...form, tableBorderWidthPt: Number(e.target.value || 0), tableBorderWidth: Number(e.target.value || 0) })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Cell Padding (pt) </label>
                    <TextInput type="number" step="0.5" min="0" value={form.tableCellPaddingPt ?? form.cellPaddingPt ?? 5} onChange={(e) => setForm({ ...form, tableCellPaddingPt: Number(e.target.value || 0), cellPaddingPt: Number(e.target.value || 0) })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Table Alignment </label>
                    <SelectField value={form.tableAlignment || 'left'} onChange={(e) => setForm({ ...form, tableAlignment: e.target.value })}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </SelectField>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Border Style </label>
                    <SelectField value={form.tableBorderStyle || 'solid'} onChange={(e) => setForm({ ...form, tableBorderStyle: e.target.value })}>
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                      <option value="none">None</option>
                    </SelectField>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-end mt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Header Row BG Color </label>
                    <input type="color" className="h-10 w-full rounded-lg border border-gray-300 cursor-pointer"
                      value={form.tableHeaderFillColor || form.headerRowBgColor || '#1F2937'} onChange={(e) => setForm({ ...form, tableHeaderFillColor: e.target.value, headerRowBgColor: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      checked={!!(form.tableHeaderFontBold ?? form.headerRowFontBold)} onChange={(e) => setForm({ ...form, tableHeaderFontBold: e.target.checked, headerRowFontBold: e.target.checked })} />
                    <div>
                      <span className="text-sm text-gray-700">Header Row Bold</span>
                      
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer md:col-span-2">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      checked={!!form.showDocumentInfo} onChange={(e) => setForm({ ...form, showDocumentInfo: e.target.checked })} />
                    <div>
                      <span className="text-sm text-gray-700">Show Document Info</span>
                      
                    </div>
                  </label>
                </div>
              </>
              )}
              {formStep === 6 && (
              <>
                <p className="text-xs font-semibold text-gray-900 tracking-wide uppercase mt-2 mb-5">Pagination</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">First Page Number </label>
                    <TextInput type="number" value={form.firstPageNumber} onChange={(e) => setForm({ ...form, firstPageNumber: Number(e.target.value || 1) })} />
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer md:items-end rounded-lg px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <input type="checkbox" className="h-4 w-4 mt-0.5 md:mt-0 rounded border-gray-300 text-blue-600"
                      checked={!!form.restartOnEachSection} onChange={(e) => setForm({ ...form, restartOnEachSection: e.target.checked })} />
                    <div>
                      <span className="text-sm text-gray-700">Restart Page Numbering on Each Section</span>
                      
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer md:items-end rounded-lg px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <input type="checkbox" className="h-4 w-4 mt-0.5 md:mt-0 rounded border-gray-300 text-blue-600"
                      checked={!!form.pageBreakBeforeHeadings} onChange={(e) => setForm({ ...form, pageBreakBeforeHeadings: e.target.checked })} />
                    <div>
                      <span className="text-sm text-gray-700">Page Break Before Headings</span>
                      
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer md:items-end rounded-lg px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <input type="checkbox" className="h-4 w-4 mt-0.5 md:mt-0 rounded border-gray-300 text-blue-600"
                      checked={!!form.widowOrphanControl} onChange={(e) => setForm({ ...form, widowOrphanControl: e.target.checked })} />
                    <div>
                      <span className="text-sm text-gray-700">Widow / Orphan Control</span>
                      
                      <p className="text-[10px] text-gray-500 mt-0.5">Prevent single lines dangling at page edges.</p>
                    </div>
                  </label>
                </div>

                <div className="mt-5 pt-5 border-t border-gray-200">
                  <label className="flex items-start gap-2 cursor-pointer rounded-lg px-3 py-2 bg-[#003366]/5 hover:bg-[#003366]/10 transition-colors border border-[#003366]/20">
                    <input type="checkbox" className="h-4 w-4 mt-0.5 rounded border-gray-300 text-[#003366]"
                      checked={!!form.useHybridPageNumbering} onChange={(e) => setForm({ ...form, useHybridPageNumbering: e.target.checked })} />
                    <div>
                      <span className="text-sm font-semibold text-gray-900">Separate Pagination Style</span>
                      <p className="text-[11px] text-gray-500 mt-0.5">Front matter pages use i-iv, main content restarts from 1.</p>
                    </div>
                  </label>
                </div>

                {!!form.useHybridPageNumbering && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Front Matter Threshold</Label>
                      <TextInput type="number" min={1} max={20}
                        value={form.frontMatterThreshold ?? 4}
                        onChange={(e) => setForm({ ...form, frontMatterThreshold: Math.min(20, Math.max(1, Number(e.target.value || 4))) })} />
                      <p className="text-[10px] text-gray-500 mt-1">Number of pages to treat as front matter (default 4).</p>
                    </div>
                    <div>
                      <Label>Front Matter Format</Label>
                      <SelectField
                        value={form.frontMatterFormat || 'lowerRoman'}
                        onChange={(e) => setForm({ ...form, frontMatterFormat: e.target.value })}
                      >
                        <option value="lowerRoman">i, ii, iii, iv (lowercase Roman)</option>
                        <option value="upperRoman">I, II, III, IV (uppercase Roman)</option>
                        <option value="lowerLetter">a, b, c, d (lowercase letter)</option>
                        <option value="upperLetter">A, B, C, D (uppercase letter)</option>
                      </SelectField>
                    </div>
                  </div>
                )}

                {!!form.useHybridPageNumbering && (() => {
                  const previewPages = 12;
                  const series = generateHybridPageSeries(previewPages, {
                    frontMatterThreshold: form.frontMatterThreshold ?? 4,
                    frontMatterFormat: form.frontMatterFormat || 'lowerRoman'
                  });
                  return (
                    <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50/70 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold tracking-wide uppercase text-gray-600">Live Preview — {previewPages}-page sample</span>
                        <span className="text-[10px] text-gray-400">Format: {form.pageNumberFormat || 'Page X of Y'}</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {series.map((p) => (
                          <div key={p.absolutePage}
                            className={`text-center text-xs rounded-md py-1.5 px-2 border ${
                              p.isFrontMatter
                                ? 'bg-amber-50 border-amber-200 text-amber-900'
                                : 'bg-white border-gray-200 text-gray-700'
                            }`}>
                            <div className="text-[9px] text-gray-400 mb-0.5">Abs. {p.absolutePage}</div>
                            <div className="font-mono truncate">
                              {formatHybridPageNumberLabel(p.absolutePage, {
                                labelFormat: form.pageNumberFormat || 'Page X of Y',
                                frontMatterThreshold: form.frontMatterThreshold ?? 4,
                                frontMatterFormat: form.frontMatterFormat || 'lowerRoman',
                                totalPages: previewPages,
                                uppercaseRoman: form.frontMatterFormat === 'upperRoman'
                              }) || <span className="text-gray-300">—</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-gray-500">
                        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-200 inline-block"></span> Front matter</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white border border-gray-200 inline-block"></span> Main content</span>
                      </div>
                    </div>
                  );
                })()}
              </>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            {formStep > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setFormStep(formStep - 1)} disabled={formSaving}>Back</Button>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={formSaving}>Cancel</Button>
            )}
            <Button type="submit" loading={formSaving}>
              {formStep < 6 ? 'Next' : (modalMode === 'create' ? 'Create Profile' : 'Save Changes')}
            </Button>
          </ModalFooter>
        </form>
        </Modal>
      )}

      {formErrorModal.open && (
        <Modal onClose={() => setFormErrorModal({ open: false, title: '', message: '' })} size="md">
          <ModalHeader
            title={formErrorModal.title}
            onClose={() => setFormErrorModal({ open: false, title: '', message: '' })}
          />
          <ModalBody>
            <div className="flex items-start gap-4">
              <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-red-50 border border-red-200">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{formErrorModal.message}</p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="primary" onClick={() => setFormErrorModal({ open: false, title: '', message: '' })}>
              OK, I Understand
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)} size="sm">
          <ModalHeader title="Delete Style Profile" subtitle={`Permanently delete "${deleteTarget.profileName}"?`} onClose={() => setDeleteTarget(null)} />
          <ModalBody className="space-y-3">
            {deleteError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">{deleteError}</div>}
            <p className="text-sm text-gray-700">This profile can only be deleted if it is not currently referenced by any Smart Template or in-flight document. The default profile cannot be deleted.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleteSaving}>Cancel</Button>
            <Button variant="danger" loading={deleteSaving} onClick={handleDelete}>Delete</Button>
          </ModalFooter>
        </Modal>
      )}

      {defaultTarget && (
        <Modal onClose={() => setDefaultTarget(null)} size="sm">
          <ModalHeader title="Set as Default Style Profile" subtitle={`Use "${defaultTarget.profileName}" as the system default?`} onClose={() => setDefaultTarget(null)} />
          <ModalBody className="space-y-3">
            {defaultError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">{defaultError}</div>}
            <p className="text-sm text-gray-700">Any Smart Template without an explicit style profile (and <code>isActive=true</code>) will use this formatting. The previous default will be cleared.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setDefaultTarget(null)} disabled={defaultSaving}>Cancel</Button>
            <Button loading={defaultSaving} onClick={handleSetDefault}>Set as Default</Button>
          </ModalFooter>
        </Modal>
      )}
    </PageContainer>
  )
}
