const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const crypto = require('crypto')
const mammoth = require('mammoth')
const puppeteer = require('puppeteer-core')
const config = require('../config/app')
const { BadRequestError } = require('../utils/errors')

const WIN_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.PROGRAMFILES || ''}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['PROGRAMFILES(X86)'] || ''}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  `${process.env.LOCALAPPDATA || ''}\\Microsoft\\Edge\\Application\\msedge.exe`
]

function generateUuid() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'tmp_' + Date.now() + '_' + Math.floor(Math.random() * 1e9)
}

class DocxToPdfService {
  constructor() {
    this._cachedBrowser = null
    this._cachedBrowserPath = null
    this._shutdownHandlersRegistered = false
  }

  _registerShutdownHandlers() {
    if (this._shutdownHandlersRegistered) return
    this._shutdownHandlersRegistered = true
    const cleanup = async () => {
      if (this._cachedBrowser) {
        try { await this._cachedBrowser.close() } catch {}
        this._cachedBrowser = null
      }
    }
    process.on('beforeExit', cleanup)
    process.on('SIGINT', async () => { await cleanup(); process.exit(0) })
    process.on('SIGTERM', async () => { await cleanup(); process.exit(0) })
  }

  _findChromeExecutable() {
    if (process.env.CHROME_BIN) {
      try { fsSync.accessSync(process.env.CHROME_BIN); return process.env.CHROME_BIN } catch {}
    }
    for (const p of WIN_CHROME_PATHS) {
      if (!p) continue
      try { fsSync.accessSync(p); return p } catch {}
    }
    if (process.platform !== 'win32') {
      const candidates = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/snap/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      for (const p of candidates) {
        try { fsSync.accessSync(p); return p } catch {}
      }
    }
    return null
  }

  async _getOrLaunchBrowser(chromePath) {
    this._registerShutdownHandlers()
    if (this._cachedBrowser && this._cachedBrowserPath === chromePath) {
      try {
        const pages = await this._cachedBrowser.pages()
        if (Array.isArray(pages)) return this._cachedBrowser
      } catch {}
      try { await this._cachedBrowser.close() } catch {}
      this._cachedBrowser = null
    }
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--mute-audio',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync'
      ],
      ignoreHTTPSErrors: true,
      timeout: 60000
    })
    this._cachedBrowser = browser
    this._cachedBrowserPath = chromePath
    return browser
  }

  _resolvePageFormat(styleProfile) {
    const sp = styleProfile || {}
    const sizeEnum = String(sp.pageSize || 'A4').toUpperCase()
    const orient = String(sp.pageOrientation || 'PORTRAIT').toUpperCase()
    const landscape = orient.includes('LAND')
    let format = 'A4'
    if (sizeEnum === 'LETTER' || sizeEnum === 'USLETTER') format = 'Letter'
    else if (sizeEnum === 'LEGAL') format = 'Legal'
    else if (sizeEnum === 'A3') format = 'A3'
    else if (sizeEnum === 'A5') format = 'A5'
    else format = 'A4'
    let width = undefined
    let height = undefined
    if (Number.isFinite(Number(sp.pageWidthMm)) && Number(sp.pageWidthMm) > 0) {
      width = `${Number(sp.pageWidthMm)}mm`
    }
    if (Number.isFinite(Number(sp.pageHeightMm)) && Number(sp.pageHeightMm) > 0) {
      height = `${Number(sp.pageHeightMm)}mm`
    }
    return { format, landscape, width, height }
  }

  _resolveMarginsMm(styleProfile, pageFmt) {
    const sp = styleProfile || {}
    const defaults = { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 }
    const _num = (v) => {
      if (v === null || v === undefined || v === '') return NaN
      const n = typeof v.toNumber === 'function' ? Number(v.toNumber()) : Number(v)
      return Number.isFinite(n) ? n : NaN
    }
    let top = _num(sp.marginTopMm)
    let right = _num(sp.marginRightMm)
    let bottom = _num(sp.marginBottomMm)
    let left = _num(sp.marginLeftMm)
    if (!Number.isFinite(top) || top <= 0) top = defaults.top
    if (!Number.isFinite(right) || right <= 0) right = defaults.right
    if (!Number.isFinite(bottom) || bottom <= 0) bottom = defaults.bottom
    if (!Number.isFinite(left) || left <= 0) left = defaults.left
    const headerH = _num(sp.headerHeightMm) || 0
    const footerH = _num(sp.footerHeightMm) || 0

    let minTop = defaults.top
    let minBottom = defaults.bottom

    if (sp.headerEnabled) {
      if (headerH > 0) {
        minTop = Math.max(headerH + 4, 24)
      } else if (sp.headerUseProfessionalLayout === true) {
        minTop = 36
      } else {
        minTop = 22
      }
    }

    if (sp.footerEnabled) {
      if (footerH > 0) {
        minBottom = footerH + 6
      } else if (sp.footerUseProfessionalLayout === true) {
        const hasTopRow = Boolean(
          (sp.footerShowDocCodeAndRev || sp.footerShowEffectiveDate || sp.footerShowPreparedBy || sp.footerShowApprovedBy) ||
          sp.footerClassificationMark || sp.footerConfidentialText || sp.footerDisclaimerText
        )
        const rows = (hasTopRow ? 1 : 0) + ((sp.showPageNumbers !== false && sp.pageNumberFormat !== 'None') ? 1 : 0)
        minBottom = Math.max((rows * 8) + 10, 18)
      } else if (sp.showPageNumbers === true) {
        minBottom = 17
      } else {
        minBottom = 15
      }
    } else if (sp.showPageNumbers === true) {
      minBottom = Math.max(minBottom, 15)
    }

    const result = {
      top: Math.max(top, minTop),
      right,
      bottom: Math.max(bottom, minBottom),
      left
    }
    console.log('[docxToPdfService] MARGINS resolve: raw profile( T=' + JSON.stringify(sp.marginTopMm) + ' R=' + JSON.stringify(sp.marginRightMm) + ' B=' + JSON.stringify(sp.marginBottomMm) + ' L=' + JSON.stringify(sp.marginLeftMm) + ' ) → used values ( T=' + result.top.toFixed(2) + ' R=' + result.right.toFixed(2) + ' B=' + result.bottom.toFixed(2) + ' L=' + result.left.toFixed(2) + ' ) | minTop=' + minTop.toFixed(2) + ' minBottom=' + minBottom.toFixed(2))
    return result
  }

  _escapeHtml(str) {
    if (str === null || str === undefined) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  _normalizeSystemValues(styleProfile, sysValues) {
    const sp = styleProfile || {}
    const sv = sysValues || {}
    const refCode = sv.referenceCode || sv.docCode || sv.fileCode || sv.documentReferenceCode || ''
    const ver = sv.version || sv.revision || ''
    let effDate = sv.effectiveDate || sv.preparedDate || sv.publishedDate || ''
    if (effDate) {
      try {
        const d = effDate instanceof Date ? effDate : new Date(String(effDate))
        if (!isNaN(d.getTime())) {
          const dd = String(d.getDate()).padStart(2, '0')
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          effDate = `${dd}/${mm}/${d.getFullYear()}`
        }
      } catch (_) { /* use raw */ }
    }
    const preparedBy = sv.preparedByName || sv.preparedByFullName || sv.preparedBy || ''
    const approvedBy = sv.approvedByName || sv.approvedByFullName || sv.approvedBy || ''
    const companyName = sp.headerCompanyName || sp.companyName || sv.companyName || ''
    const classification = sp.footerClassificationMark || sp.classificationMark || ''
    const confidential = sp.footerConfidentialText || sp.confidentialText || ''
    const copyright = sp.footerDisclaimerText || sp.copyrightText || ''
    return {
      referenceCode: refCode,
      docCode: refCode,
      revision: ver,
      version: ver,
      effectiveDate: effDate,
      preparedByName: preparedBy,
      approvedByName: approvedBy,
      reviewedByName: sv.reviewedByFullName || sv.reviewedByName || sv.reviewedBy || '',
      documentTypeName: sv.documentTypeName || '',
      companyName,
      classification,
      classificationConfidential: confidential,
      copyright,
      disclaimer: sp.footerDisclaimerText || ''
    }
  }

  _resolveColumnContent(rawValue, styleProfile, sysValues, forSlot) {
    const sp = styleProfile || {}
    const sv = this._normalizeSystemValues(sp, sysValues)
    if (!rawValue) return ''
    if (typeof rawValue !== 'string') return this._escapeHtml(String(rawValue))
    if (!rawValue.startsWith('__TYPE:')) return this._escapeHtml(rawValue)
    const typeKey = rawValue.slice('__TYPE:'.length)
    const pageNumber = (fmt) => {
      const format = (fmt || sp.pageNumberFormat || 'Page X of Y').toString()
      const pg = '<span class="pageNumber"></span>'
      const tot = '<span class="totalPages"></span>'
      if (format === '- X -') return `- ${pg} -`
      if (format === 'Page X') return `Page ${pg}`
      return `Page ${pg} of ${tot}`
    }
    switch (typeKey) {
      case 'page_number':
        return pageNumber(sp.pageNumberFormat)
      case 'doc_code_rev': {
        const parts = []
        if (sv.referenceCode) parts.push(this._escapeHtml(sv.referenceCode))
        if (sv.revision) parts.push('Rev ' + this._escapeHtml(sv.revision))
        return parts.join(' ')
      }
      case 'effective_date':
        return this._escapeHtml(sv.effectiveDate)
      case 'prepared_by':
        return sv.preparedByName ? `Prepared: ${this._escapeHtml(sv.preparedByName)}` : ''
      case 'approved_by':
        return sv.approvedByName ? `Approved: ${this._escapeHtml(sv.approvedByName)}` : ''
      case 'copyright':
        return this._escapeHtml(sv.copyright || sp.footerDisclaimerText || '')
      case 'classification': {
        const clsParts = []
        if (sv.classification) clsParts.push(this._escapeHtml(sv.classification))
        if (sv.classificationConfidential) clsParts.push(this._escapeHtml(sv.classificationConfidential))
        return clsParts.join(' ')
      }
      case 'company_name':
        return this._escapeHtml(sv.companyName)
      default:
        return ''
    }
  }

  async _loadLogoBase64(logoPathFromProfile) {
    if (!logoPathFromProfile) return null
    try {
      const appConfig = require('../config/app')
      const uploadDir = appConfig.uploadDir || path.resolve(process.cwd(), 'uploads')
      const backendDir = path.resolve(process.cwd())
      const projectRoot = path.resolve(backendDir, '..')

      const raw = String(logoPathFromProfile)
      const strippedLeading = raw.replace(/^\/+/, '')
      const strippedUploadsPrefix = strippedLeading.replace(/^uploads[\\/]+/i, '')
      const absoluteCandidates = []
      if (path.isAbsolute(raw)) absoluteCandidates.push(raw)

      absoluteCandidates.push(path.join(uploadDir, strippedUploadsPrefix))
      absoluteCandidates.push(path.join(uploadDir, strippedLeading))
      absoluteCandidates.push(path.resolve(backendDir, strippedLeading))
      absoluteCandidates.push(path.resolve(backendDir, strippedUploadsPrefix))
      absoluteCandidates.push(path.resolve(projectRoot, strippedLeading))
      absoluteCandidates.push(path.resolve(projectRoot, strippedUploadsPrefix))
      absoluteCandidates.push(path.resolve(projectRoot, 'backend', strippedLeading))
      absoluteCandidates.push(path.resolve(projectRoot, 'backend', strippedUploadsPrefix))
      absoluteCandidates.push(path.resolve(projectRoot, 'public', strippedLeading))
      absoluteCandidates.push(path.resolve(projectRoot, 'public', strippedUploadsPrefix))

      let absolutePath = null
      for (const c of absoluteCandidates) {
        if (fsSync.existsSync(c)) { absolutePath = c; break }
      }

      if (!absolutePath) {
        console.warn('[docxToPdfService] Logo file not found on disk (profile path=' + raw + '); tried candidates:', absoluteCandidates.slice(0, 5).join(' | '))
        return null
      }
      const ext = path.extname(absolutePath).toLowerCase().replace('.', '')
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }
      const mime = mimeMap[ext] || 'image/png'
      const buf = await fs.readFile(absolutePath)
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch (e) {
      console.warn('[docxToPdfService] Failed to load logo base64:', e?.message || e)
      return null
    }
  }

  async _buildHeaderTemplate(styleProfile, systemValues, opts) {
    const sp = styleProfile || {}
    if (!sp.headerEnabled) return '<div></div>'
    const fontFamily = this._escapeHtml(sp.headingFontFamily || sp.bodyFontFamily || 'Calibri, Arial, sans-serif')

    const _num = (v) => {
      if (v === null || v === undefined || v === '') return NaN
      const n = typeof v.toNumber === 'function' ? Number(v.toNumber()) : Number(v)
      return Number.isFinite(n) ? n : NaN
    }
    let leftPadMm = _num(sp.marginLeftMm)
    let rightPadMm = _num(sp.marginRightMm)
    if (!Number.isFinite(leftPadMm) || leftPadMm <= 0) leftPadMm = 25.4
    if (!Number.isFinite(rightPadMm) || rightPadMm <= 0) rightPadMm = 25.4

    console.log('[docxToPdfService] HEADER PADDING: leftPadMm=' + leftPadMm + ' rightPadMm=' + rightPadMm + ' (raw marginLeftMm=' + JSON.stringify(sp.marginLeftMm) + ' marginRightMm=' + JSON.stringify(sp.marginRightMm) + ')')

    const _wrapWithMargins = (innerHtml) => {
      return `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; border-spacing:0; table-layout:fixed; margin:0; padding:0;">
        <tr>
          <td width="${leftPadMm}mm" style="width:${leftPadMm}mm; min-width:${leftPadMm}mm; max-width:${leftPadMm}mm; padding:0; margin:0;"></td>
          <td width="*" style="width:auto; padding:0; margin:0;">${innerHtml}</td>
          <td width="${rightPadMm}mm" style="width:${rightPadMm}mm; min-width:${rightPadMm}mm; max-width:${rightPadMm}mm; padding:0; margin:0;"></td>
        </tr>
      </table>`
    }

    const usePro = sp.headerUseProfessionalLayout === true
    if (usePro) {
      try {
        const userLogoWidthMm = sp.logoWidthMm != null ? Number(sp.logoWidthMm) : 0
        const userLogoHeightMm = sp.logoHeightMm != null ? Number(sp.logoHeightMm) : 0
        const LOGO_MAX_WIDTH_MM = 50
        const LOGO_MAX_HEIGHT_MM = 25
        const LOGO_TEXT_GAP_MM = 5
        let effLogoWidthMm = userLogoWidthMm > 0 ? userLogoWidthMm : 45
        if (effLogoWidthMm > LOGO_MAX_WIDTH_MM) effLogoWidthMm = LOGO_MAX_WIDTH_MM
        const logoCssWidth = `width: ${effLogoWidthMm}mm; max-width: ${LOGO_MAX_WIDTH_MM}mm;`
        let logoCssHeight = 'height: auto;'
        if (userLogoHeightMm > 0) {
          const effH = Math.min(userLogoHeightMm, LOGO_MAX_HEIGHT_MM)
          logoCssHeight = `max-height: ${LOGO_MAX_HEIGHT_MM}mm; height: ${effH}mm;`
        } else {
          logoCssHeight = `max-height: ${LOGO_MAX_HEIGHT_MM}mm; height: auto;`
        }

        let logoImg = ''
        if (sp.headerLogoPath) {
          const logoDataUrl = opts && opts._cachedLogoUrl ? opts._cachedLogoUrl : await this._loadLogoBase64(sp.headerLogoPath)
          if (logoDataUrl) {
            logoImg = `<img src="${logoDataUrl}" alt="Logo" style="${logoCssWidth}${logoCssHeight} object-fit: contain; display: block;"/>`
          }
        }

        const companyName = this._escapeHtml(sp.headerCompanyName || '')
        const companyRegNo = this._escapeHtml(sp.headerCompanyRegNo || '')
        const companyNameColor = this._escapeHtml(sp.headerCompanyNameColor || '#1F2937')
        const companyNameUnderline = sp.headerCompanyNameUnderline === true ? 'text-decoration: underline;' : ''

        let addressLines = []
        try {
          let addrJson = sp.headerCompanyAddressJson
          if (typeof addrJson === 'string' && addrJson) {
            try { addrJson = JSON.parse(addrJson) } catch (_) { addrJson = null }
          }
          if (Array.isArray(addrJson)) {
            addressLines = addrJson.filter(l => l && String(l).trim().length > 0)
          }
        } catch (_) { addressLines = [] }

        const phone = this._escapeHtml(sp.headerCompanyPhone || '')
        const email = this._escapeHtml(sp.headerCompanyEmail || '')
        const emailColor = this._escapeHtml(sp.headerCompanyEmailColor || '#0563C1')

        let companyInfoHtml = ''
        if (companyName || companyRegNo) {
          const regSpan = companyRegNo ? `<span style="color: #4B5563; font-size: 12px; font-weight: 400; margin-left: 8px;">${companyRegNo}</span>` : ''
          companyInfoHtml += `<div style="font-weight: 700; font-size: 17px; color: ${companyNameColor}; ${companyNameUnderline} line-height: 1.2; margin-bottom: 3px;">${companyName}${regSpan}</div>`
        }
        if (addressLines.length === 1) {
          companyInfoHtml += `<div style="font-size: 11px; color: #4B5563; line-height: 1.3;">${this._escapeHtml(addressLines[0])}</div>`
        } else if (addressLines.length === 2) {
          companyInfoHtml += `<div style="font-size: 11px; color: #4B5563; line-height: 1.3;">${this._escapeHtml(addressLines[0])}</div>`
          companyInfoHtml += `<div style="font-size: 11px; color: #4B5563; line-height: 1.3;">${this._escapeHtml(addressLines[1])}</div>`
        } else if (addressLines.length >= 3) {
          const firstTwo = addressLines.slice(0, 2).map(l => this._escapeHtml(l)).join(', ')
          const rest = addressLines.slice(2).map(l => this._escapeHtml(l)).join(', ')
          companyInfoHtml += `<div style="font-size: 11px; color: #4B5563; line-height: 1.3;">${firstTwo}</div>`
          if (rest && rest.length) companyInfoHtml += `<div style="font-size: 11px; color: #4B5563; line-height: 1.3;">${rest}</div>`
        }
        if (phone) {
          companyInfoHtml += `<div style="font-size: 11px; color: #4B5563; line-height: 1.35; margin-top: 1px;">Tel: ${phone}</div>`
        }
        if (email) {
          companyInfoHtml += `<div style="font-size: 11px; color: #4B5563; line-height: 1.35; margin-top: 1px;"><span style="color: ${emailColor}; text-decoration: underline;">${email}</span></div>`
        }

        const showDivider = sp.headerBottomDividerEnabled !== false
        let dividerEdgeToEdgeHtml = ''
        if (showDivider) {
          const thicknessPt = sp.headerBottomDividerWidthPt != null ? Number(sp.headerBottomDividerWidthPt) : 0.75
          const thicknessPx = Math.max(1, Math.round(thicknessPt * 1.333))
          const dividerColor = this._escapeHtml(sp.headerBottomDividerColor || '#6B7280')
          dividerEdgeToEdgeHtml = `<div style="border-bottom: ${thicknessPx}px solid ${dividerColor}; width:100%; margin: 1mm 0 0 0; padding:0;"></div>`
        }

        const letterheadRowStyles = `display: flex; flex-direction: row; align-items: center; justify-content: flex-start; width: 100%; box-sizing: border-box;`
        const logoBoxStyles = `flex: 0 0 ${effLogoWidthMm}mm; max-width: ${effLogoWidthMm}mm; display: flex; align-items: center; justify-content: flex-start; box-sizing: border-box;`
        const textBoxStyles = `flex: 1 1 auto; min-width: 0; padding-left: ${LOGO_TEXT_GAP_MM}mm; display: flex; flex-direction: column; justify-content: center; box-sizing: border-box;`

        const letterheadOnly = `<div style="padding: 0 0 1mm 0; box-sizing: border-box; width:100%;">
          <div style="${letterheadRowStyles}">
            <div style="${logoBoxStyles}">${logoImg || '&nbsp;'}</div>
            <div style="${textBoxStyles}">${companyInfoHtml || '&nbsp;'}</div>
          </div>
        </div>`
        return `<div style="width:100%; font-family:${fontFamily}; padding:1mm 0 0 0; box-sizing:border-box; margin:0;">
          ${_wrapWithMargins(letterheadOnly)}
          ${dividerEdgeToEdgeHtml}
        </div>`
      } catch (e) {
        console.warn('[docxToPdfService] Pro header build failed (fallback to simple):', e?.message || e)
      }
    }

    const left = this._resolveColumnContent(sp.headerLeftText, sp, systemValues, 'header-left')
    const center = this._resolveColumnContent(sp.headerCenterText, sp, systemValues, 'header-center')
    const right = this._resolveColumnContent(sp.headerRightText, sp, systemValues, 'header-right')
    const showBorder = sp.headerBorderBottomStyle === true
    const colsRow = `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; table-layout:fixed; margin:0; padding:0; font-size:9px; color:#333; line-height:1.4;">
      <tr>
        <td width="33.333%" style="text-align:left; vertical-align:top; padding:0; margin:0;">${left || '&nbsp;'}</td>
        <td width="33.333%" style="text-align:center; vertical-align:top; padding:0; margin:0;">${center || '&nbsp;'}</td>
        <td width="33.333%" style="text-align:right; vertical-align:top; padding:0; margin:0;">${right || '&nbsp;'}</td>
      </tr>
    </table>`
    const dividerEdgeToEdgeHtml = showBorder ? `<div style="border-bottom: 1px solid #888; width:100%; margin: 0 0 4px 0; padding:0;"></div>` : ''
    return `<div style="width:100%; font-family:${fontFamily}; padding:4mm 0 0 0; box-sizing:border-box; margin:0;">
      ${dividerEdgeToEdgeHtml}
      ${_wrapWithMargins(colsRow)}
    </div>`
  }

  async _buildFooterTemplate(styleProfile, systemValues) {
    const sp = styleProfile || {}
    if (!sp.footerEnabled && !sp.showPageNumbers) return '<div></div>'
    const fontFamily = this._escapeHtml(sp.bodyFontFamily || 'Calibri, Arial, sans-serif')
    const sv = this._normalizeSystemValues(sp, systemValues)

    const _num = (v) => {
      if (v === null || v === undefined || v === '') return NaN
      const n = typeof v.toNumber === 'function' ? Number(v.toNumber()) : Number(v)
      return Number.isFinite(n) ? n : NaN
    }
    let leftPadMm = _num(sp.marginLeftMm)
    let rightPadMm = _num(sp.marginRightMm)
    if (!Number.isFinite(leftPadMm) || leftPadMm <= 0) leftPadMm = 25.4
    if (!Number.isFinite(rightPadMm) || rightPadMm <= 0) rightPadMm = 25.4

    console.log('[docxToPdfService] FOOTER PADDING: leftPadMm=' + leftPadMm + ' rightPadMm=' + rightPadMm + ' (raw marginLeftMm=' + JSON.stringify(sp.marginLeftMm) + ' marginRightMm=' + JSON.stringify(sp.marginRightMm) + ')')

    const pageContentWidthPct = 100
    const _wrapWithMargins = (innerHtml) => {
      return `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; border-spacing:0; table-layout:fixed; margin:0; padding:0;">
        <tr>
          <td width="${leftPadMm}mm" style="width:${leftPadMm}mm; min-width:${leftPadMm}mm; max-width:${leftPadMm}mm; padding:0; margin:0;"></td>
          <td width="*" style="width:auto; padding:0; margin:0;">${innerHtml}</td>
          <td width="${rightPadMm}mm" style="width:${rightPadMm}mm; min-width:${rightPadMm}mm; max-width:${rightPadMm}mm; padding:0; margin:0;"></td>
        </tr>
      </table>`
    }

    const usePro = sp.footerUseProfessionalLayout === true
    if (usePro) {
      try {
        const footerColor = '#6B7280'

        let showDiv = sp.footerTopDividerEnabled !== false
        let dividerEdgeToEdgeHtml = ''
        if (showDiv) {
          const thicknessPt = sp.footerTopDividerWidthPt != null ? Number(sp.footerTopDividerWidthPt) : 0.75
          const thicknessPx = Math.max(1, Math.round(thicknessPt * 1.333))
          const dividerColor = this._escapeHtml(sp.footerTopDividerColor || '#6B7280')
          dividerEdgeToEdgeHtml = `<div style="border-top: ${thicknessPx}px solid ${dividerColor}; width:100%; margin: 0 0 2mm 0; padding:0;"></div>`
        }

        let leftHtml = ''
        const clsItems = []
        if (sp.footerClassificationMark) clsItems.push(`<span style="font-weight: 700;">${this._escapeHtml(sp.footerClassificationMark)}</span>`)
        if (sp.footerConfidentialText) clsItems.push(`<span>${this._escapeHtml(sp.footerConfidentialText)}</span>`)
        if (clsItems.length > 0) leftHtml = clsItems.join(' ')

        let centerHtml = ''
        const centerItems = []
        if (sp.footerShowDocCodeAndRev && (sv.referenceCode || sv.revision)) {
          const parts = []
          if (sv.referenceCode) parts.push(this._escapeHtml(sv.referenceCode))
          if (sv.revision) parts.push('Rev ' + this._escapeHtml(sv.revision))
          centerItems.push(parts.join(' '))
        }
        if (sp.footerShowEffectiveDate && sv.effectiveDate) centerItems.push(this._escapeHtml(sv.effectiveDate))
        if (sp.footerShowPreparedBy && sv.preparedByName) centerItems.push(`Prepared: ${this._escapeHtml(sv.preparedByName)}`)
        if (sp.footerShowApprovedBy && sv.approvedByName) centerItems.push(`Approved: ${this._escapeHtml(sv.approvedByName)}`)
        centerHtml = centerItems.filter(Boolean).join(' — ')

        let rightHtml = ''
        if (sp.footerDisclaimerText) rightHtml = this._escapeHtml(sp.footerDisclaimerText)

        const hasTopRow = leftHtml || centerHtml || rightHtml
        let topRowInner = ''
        if (hasTopRow) {
          topRowInner = `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; table-layout:fixed; margin:0 0 2mm 0; padding:0; font-size:8px; color:${footerColor}; line-height:1.4;">
            <tr>
              <td width="33.333%" style="text-align:left; vertical-align:top; padding:0; margin:0;">${leftHtml}</td>
              <td width="33.333%" style="text-align:center; vertical-align:top; padding:0; margin:0;">${centerHtml}</td>
              <td width="33.333%" style="text-align:right; vertical-align:top; padding:0; margin:0;">${rightHtml}</td>
            </tr>
          </table>`
        }

        let pageRowInner = ''
        const pnf = (sp.pageNumberFormat || '').toString()
        const showPage = sp.showPageNumbers !== false && pnf !== 'None'
        if (showPage) {
          const pg = '<span class="pageNumber"></span>'
          const tot = '<span class="totalPages"></span>'
          let pageText = ''
          if (pnf === '- X -') pageText = `- ${pg} -`
          else if (pnf === 'Page X') pageText = `Page ${pg}`
          else pageText = `Page ${pg} of ${tot}`
          pageRowInner = `<div style="text-align:center; font-size:9px; color:${footerColor}; line-height:1.4; width:100%;">${pageText}</div>`
        }

        return `<div style="width:100%; font-family:${fontFamily}; padding:0 0 2mm 0; box-sizing:border-box; margin:0;">
          ${dividerEdgeToEdgeHtml}
          ${_wrapWithMargins(`${topRowInner}${pageRowInner}`)}
        </div>`
      } catch (e) {
        console.warn('[docxToPdfService] Pro footer build failed (fallback to simple):', e?.message || e)
      }
    }

    let left = this._resolveColumnContent(sp.footerLeftText, sp, sv, 'footer-left')
    let center = this._resolveColumnContent(sp.footerCenterText, sp, sv, 'footer-center')
    let right = this._resolveColumnContent(sp.footerRightText, sp, sv, 'footer-right')

    const hasTypePageNumber = (s) => typeof s === 'string' && s.startsWith('__TYPE:page_number')
    const explicitPage =
      (sp.footerRightText && hasTypePageNumber(sp.footerRightText)) ||
      (sp.footerCenterText && hasTypePageNumber(sp.footerCenterText)) ||
      (sp.footerLeftText && hasTypePageNumber(sp.footerLeftText))

    if (!explicitPage) {
      if (sp.showPageNumbers && !right) {
        const pnf = (sp.pageNumberFormat || '').toString()
        const pg = '<span class="pageNumber"></span>'
        const tot = '<span class="totalPages"></span>'
        if (pnf === '- X -') right = `- ${pg} -`
        else if (pnf === 'Page X') right = `Page ${pg}`
        else right = `Page ${pg} of ${tot}`
      } else if (sp.showPageNumbers) {
        const pnf = (sp.pageNumberFormat || '').toString()
        const pg = '<span class="pageNumber"></span>'
        const tot = '<span class="totalPages"></span>'
        let pText = (pnf === '- X -') ? `- ${pg} -` : (pnf === 'Page X') ? `Page ${pg}` : `Page ${pg} of ${tot}`
        right = right + '  ·  ' + pText
      }
    }

    const showTopDivider = sp.footerBorderTopStyle === true || sp.footerTopDividerEnabled !== false
    const dividerEdgeToEdgeHtml = showTopDivider ? `<div style="border-top:1px solid #9CA3AF; width:100%; margin:0 0 2mm 0; padding:0;"></div>` : ''
    const colsRow = `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; table-layout:fixed; margin:0; padding:0; font-size:9px; color:#374151; line-height:1.4;">
      <tr>
        <td width="33.333%" style="text-align:left; vertical-align:top; padding:0; margin:0;">${left || '&nbsp;'}</td>
        <td width="33.333%" style="text-align:center; vertical-align:top; padding:0; margin:0;">${center || '&nbsp;'}</td>
        <td width="33.333%" style="text-align:right; vertical-align:top; padding:0; margin:0;">${right || '&nbsp;'}</td>
      </tr>
    </table>`

    return `<div style="width:100%; font-family:${fontFamily}; padding:0 0 2mm 0; box-sizing:border-box; margin:0;">
      ${dividerEdgeToEdgeHtml}
      ${_wrapWithMargins(colsRow)}
    </div>`
  }

  async convertDocxBufferToPdf(docxBuffer, opts = {}) {
    if (!Buffer.isBuffer(docxBuffer)) throw new BadRequestError('docxBuffer must be a Buffer')

    const chromePath = this._findChromeExecutable()
    if (!chromePath) {
      throw new BadRequestError(
        'PDF conversion requires Google Chrome or Microsoft Edge. Neither was found on this system. ' +
        'Please install Google Chrome or Microsoft Edge (Windows 10/11 includes Edge by default). ' +
        'You can also set CHROME_BIN environment variable to the full path of chrome.exe or msedge.exe.'
      )
    }

    const styleProfile = opts.styleProfile || null
    const systemValues = opts.systemValues || opts.headerValues || opts.footerValues || null

    if (styleProfile) {
      const pageFmt0 = this._resolvePageFormat(styleProfile)
      const margins0 = this._resolveMarginsMm(styleProfile, pageFmt0)
      console.log('[docxToPdfService] PDF PREV CONFIG: margins(mm)=' + JSON.stringify(margins0) +
        ' | headerEnabled=' + !!styleProfile.headerEnabled +
        ' headerUsePro=' + !!styleProfile.headerUseProfessionalLayout +
        ' headerLogoPath=' + (styleProfile.headerLogoPath || 'NONE') +
        ' | footerEnabled=' + !!styleProfile.footerEnabled +
        ' footerUsePro=' + !!styleProfile.footerUseProfessionalLayout +
        ' footerLeft=' + JSON.stringify(styleProfile.footerLeftText || '') +
        ' footerCenter=' + JSON.stringify(styleProfile.footerCenterText || '') +
        ' footerRight=' + JSON.stringify(styleProfile.footerRightText || '') +
        ' showPageNumbers=' + !!styleProfile.showPageNumbers +
        ' pageNumberFormat=' + JSON.stringify(styleProfile.pageNumberFormat || 'None')
      )
      if (systemValues) {
        console.log('[docxToPdfService] PDF PREV SYSVALUES: ' + JSON.stringify({
          referenceCode: systemValues.referenceCode || systemValues.docCode || '',
          version: systemValues.version || systemValues.revision || '',
          preparedByName: systemValues.preparedByName || systemValues.preparedByFullName || '',
          approvedByName: systemValues.approvedByName || systemValues.approvedByFullName || '',
          effectiveDate: systemValues.effectiveDate || ''
        }))
      }
    }

    const mammothResult = await mammoth.convertToHtml(
      { buffer: docxBuffer },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Heading 1'] => h2:fresh",
          "p[style-name='Heading 2'] => h3:fresh",
          "p[style-name='Heading 3'] => h4:fresh",
          "r[style-name='Strong'] => strong",
          "r[style-name='Emphasis'] => em"
        ],
        includeDefaultStyleMap: true,
        convertImage: mammoth.images.imgElement((image) => {
          return image.read('base64').then((b64) => {
            return { src: `data:${image.contentType};base64,${b64}` }
          })
        })
      }
    )

    const html = this._wrapHtml(mammothResult.value || '', { styleProfile })
    const tmpDir = path.join(config.uploadDir, '_tmp', 'docx-pdf-v2')
    await fs.mkdir(tmpDir, { recursive: true })
    const uuid = generateUuid()
    const htmlPath = path.join(tmpDir, `${uuid}.html`)
    const pdfPath = path.join(tmpDir, `${uuid}.pdf`)

    await fs.writeFile(htmlPath, html, 'utf-8')

    const pageFmt = this._resolvePageFormat(styleProfile)
    const margins = this._resolveMarginsMm(styleProfile, pageFmt)
    const displayHeaderFooter = Boolean(
      (styleProfile && styleProfile.headerEnabled) ||
      (styleProfile && styleProfile.footerEnabled) ||
      (styleProfile && styleProfile.showPageNumbers)
    )

    let cachedLogoUrl = null
    if (styleProfile && styleProfile.headerLogoPath && styleProfile.headerUseProfessionalLayout === true) {
      cachedLogoUrl = await this._loadLogoBase64(styleProfile.headerLogoPath)
    }

    let page = null
    try {
      const browser = await this._getOrLaunchBrowser(chromePath)
      page = await browser.newPage()
      await page.goto('file:///' + htmlPath.split(path.sep).join('/'), {
        waitUntil: ['networkidle2', 'load'],
        timeout: 60000
      })

      const pdfOptions = {
        path: pdfPath,
        printBackground: true,
        margin: {
          top: `${margins.top}mm`,
          right: `${margins.right}mm`,
          bottom: `${margins.bottom}mm`,
          left: `${margins.left}mm`
        },
        preferCSSPageSize: true,
        displayHeaderFooter,
        timeout: 60000
      }
      if (pageFmt.width && pageFmt.height) {
        pdfOptions.width = pageFmt.width
        pdfOptions.height = pageFmt.height
      } else {
        pdfOptions.format = pageFmt.format
        pdfOptions.landscape = pageFmt.landscape
      }
      if (displayHeaderFooter) {
        pdfOptions.headerTemplate = await this._buildHeaderTemplate(styleProfile, systemValues, { _cachedLogoUrl: cachedLogoUrl })
        pdfOptions.footerTemplate = await this._buildFooterTemplate(styleProfile, systemValues)
      }

      await page.pdf(pdfOptions)
    } finally {
      if (page) { try { await page.close() } catch {} }
      fs.unlink(htmlPath).catch(() => {})
    }

    let pdfBuffer
    try {
      pdfBuffer = await fs.readFile(pdfPath)
    } catch {
      throw new BadRequestError('PDF conversion failed: Chrome did not produce a PDF output file.')
    } finally {
      fs.unlink(pdfPath).catch(() => {})
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new BadRequestError('PDF conversion failed: output PDF is empty.')
    }

    return {
      pdfBuffer,
      byteLength: pdfBuffer.length,
      mammothWarnings: mammothResult.messages || []
    }
  }

  _wrapHtml(content, opts = {}) {
    const sp = (opts && opts.styleProfile) || {}
    const bodyFontFamily = sp.bodyFontFamily ? this._escapeHtml(sp.bodyFontFamily) + ', Calibri, Arial, sans-serif' : "'Calibri', 'Arial', sans-serif"
    const headingFontFamily = sp.headingFontFamily ? this._escapeHtml(sp.headingFontFamily) + ', Calibri, Arial, sans-serif' : "inherit"
    const tableFontFamily = sp.tableFontFamily ? this._escapeHtml(sp.tableFontFamily) + ', Calibri, Arial, sans-serif' : "inherit"
    const bodyFontSizePt = Number.isFinite(Number(sp.bodyFontSizePt)) ? Number(sp.bodyFontSizePt) : 11
    const h1 = Number.isFinite(Number(sp.heading1FontSizePt)) ? Number(sp.heading1FontSizePt) : 20
    const h2 = Number.isFinite(Number(sp.heading2FontSizePt)) ? Number(sp.heading2FontSizePt) : 16
    const h3 = Number.isFinite(Number(sp.heading3FontSizePt)) ? Number(sp.heading3FontSizePt) : 13
    const headingBold = sp.headingFontBold === false ? 'normal' : '700'
    const tableFontSizePt = Number.isFinite(Number(sp.tableFontSizePt)) ? Number(sp.tableFontSizePt) : bodyFontSizePt
    const lineHeight = Number.isFinite(Number(sp.lineSpacing)) && Number(sp.lineSpacing) > 0 ? Number(sp.lineSpacing) : 1.5
    const paraBeforePt = Number.isFinite(Number(sp.paragraphSpacingBeforePt)) ? Number(sp.paragraphSpacingBeforePt) : 0
    const paraAfterPt = Number.isFinite(Number(sp.paragraphSpacingAfterPt)) ? Number(sp.paragraphSpacingAfterPt) : 8
    const pageFmt = this._resolvePageFormat(sp)
    const margins = this._resolveMarginsMm(sp, pageFmt)

    let sizeRule
    if (pageFmt.width && pageFmt.height) {
      sizeRule = `size: ${pageFmt.width} ${pageFmt.height};`
    } else {
      const fmt = pageFmt.format || 'A4'
      const land = pageFmt.landscape ? ' landscape' : ''
      sizeRule = `size: ${fmt}${land};`
    }

    const tableBorderWidthPt = Number.isFinite(Number(sp.tableBorderWidthPt)) ? Number(sp.tableBorderWidthPt) : 0.75
    const tableBorder = sp.tableBorderStyle === 'none' ? 'none' : `${tableBorderWidthPt}pt solid #888`
    const tableHeaderFill = sp.tableHeaderFillColor ? this._escapeHtml(sp.tableHeaderFillColor) : null
    const tableHeaderBold = sp.tableHeaderFontBold === false ? 'normal' : '700'

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Document Preview</title>
<style>
  @page {
    ${sizeRule}
    margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
  }
  *, *::before, *::after { box-sizing: border-box; }
  html {
    margin: 0;
    padding: 0;
    width: 100%;
  }
  body {
    font-family: ${bodyFontFamily};
    font-size: ${bodyFontSizePt}pt;
    line-height: ${lineHeight};
    color: #111;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
  }
  body > *:first-child { margin-top: 0; }
  body > *:last-child { margin-bottom: 0; }
  table { border-collapse: collapse; width: 100%; max-width: 100%; margin: 8px 0; font-family: ${tableFontFamily}; font-size: ${tableFontSizePt}pt; table-layout: auto; }
  table td, table th { border: ${tableBorder}; padding: 6px 10px; vertical-align: top; word-break: break-word; }
  table th { ${tableHeaderFill ? `background: ${tableHeaderFill};` : ''} font-weight: ${tableHeaderBold}; }
  p { margin: 0 0 ${paraAfterPt}pt 0; padding-top: ${paraBeforePt}pt; }
  h1, h2, h3, h4, h5, h6 { font-family: ${headingFontFamily}; font-weight: ${headingBold}; }
  h1 { font-size: ${h1}pt; margin: 16px 0 10px 0; }
  h2 { font-size: ${h2}pt; margin: 14px 0 8px 0; }
  h3 { font-size: ${h3}pt; margin: 12px 0 6px 0; }
  h4 { font-size: 12pt; margin: 10px 0 4px 0; }
  ul, ol { margin: 6px 0 6px 24px; padding: 0; }
  li { margin-bottom: 4px; }
  img { max-width: 100%; height: auto; }
  a { color: #003366; }
  hr { border: none; border-top: 1px solid #ccc; margin: 14px 0; }
</style>
</head>
<body>
${content}
</body>
</html>`
  }
}

module.exports = new DocxToPdfService()
