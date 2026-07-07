export const BRANDING_UPDATED_EVENT = 'brandingUpdated'
export const LANDING_SETTINGS_UPDATED_EVENT = 'landingPageSettingsUpdated'

const inMemoryBranding = {
  theme: null,
  companyInfo: null
}

const HEAVY_THEME_ASSET_KEYS = ['mainLogo', 'favicon', 'bgImage']

function cloneValue(value) {
  if (!value || typeof value !== 'object') return value ?? null
  if (Array.isArray(value)) return value.map((item) => cloneValue(item))
  return { ...value }
}

function sanitizeThemeForStorage(theme) {
  if (!theme || typeof theme !== 'object') return theme ?? null
  const sanitizedTheme = { ...theme }
  for (const key of HEAVY_THEME_ASSET_KEYS) {
    delete sanitizedTheme[key]
  }
  return sanitizedTheme
}

function parseColorToRgb(input) {
  if (!input || typeof input !== 'string') return null
  const s = input.trim()
  if (!s) return null
  if (s[0] === '#') {
    const hex = s.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? { r, g, b } : null
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? { r, g, b } : null
    }
    return null
  }
  const m = s.match(/rgba?\(([^)]+)\)/i)
  if (!m) return null
  const parts = m[1].split(',').map((v) => v.trim())
  const r = Number(parts[0])
  const g = Number(parts[1])
  const b = Number(parts[2])
  if (![r, g, b].every(Number.isFinite)) return null
  return { r, g, b }
}

function contrastRatio(a, b) {
  const lum = (c) => {
    const f = (v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const L1 = lum(a)
  const L2 = lum(b)
  const hi = Math.max(L1, L2)
  const lo = Math.min(L1, L2)
  return (hi + 0.05) / (lo + 0.05)
}

function isAccessibleTextColor(textColor, backgroundColor, threshold = 4.5) {
  const fg = parseColorToRgb(textColor)
  const bg = parseColorToRgb(backgroundColor)
  if (!fg || !bg) return false
  return contrastRatio(fg, bg) >= threshold
}

export function readStoredJson(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function readThemeSettings() {
  const storedTheme = readStoredJson('dms_theme_settings')
  const inMemoryTheme = inMemoryBranding.theme
  if (!storedTheme) return cloneValue(inMemoryTheme)
  if (!inMemoryTheme) return storedTheme
  const merged = { ...storedTheme }
  for (const key of HEAVY_THEME_ASSET_KEYS) {
    if (inMemoryTheme[key]) merged[key] = inMemoryTheme[key]
  }
  return merged
}

export function readThemeMode() {
  const preferences = readStoredJson('userPreferences')
  return preferences?.themeMode === 'dark' ? 'dark' : 'light'
}

export function readCompanyInfo() {
  return readStoredJson('dms_company_info') || cloneValue(inMemoryBranding.companyInfo)
}

export function readBranding() {
  const theme = readThemeSettings()
  const companyInfo = readCompanyInfo()

  return {
    theme,
    companyInfo,
    logo: theme?.mainLogo || null,
    companyName: companyInfo?.companyName || 'FileNix',
    welcomeMessage: theme?.loginWelcomeMessage || 'Welcome to {companyName}'
  }
}

export function readLandingPageSettings() {
  return readStoredJson('dms_landing_page_settings')
}

export function subscribeBranding(callback) {
  const handler = () => callback?.(readBranding())
  window.addEventListener('storage', handler)
  window.addEventListener(BRANDING_UPDATED_EVENT, handler)
  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener(BRANDING_UPDATED_EVENT, handler)
  }
}

export function subscribeLandingPageSettings(callback) {
  const handler = () => callback?.(readLandingPageSettings())
  window.addEventListener('storage', handler)
  window.addEventListener(LANDING_SETTINGS_UPDATED_EVENT, handler)
  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener(LANDING_SETTINGS_UPDATED_EVENT, handler)
  }
}

export function persistLandingPageSettings(settings) {
  if (settings && typeof settings === 'object') {
    try {
      localStorage.setItem('dms_landing_page_settings', JSON.stringify(settings))
    } catch {}
  }
  window.dispatchEvent(new Event(LANDING_SETTINGS_UPDATED_EVENT))
}

export function applyTheme(themeObj) {
  if (!themeObj || typeof themeObj !== 'object') return
  inMemoryBranding.theme = cloneValue(themeObj)
  const root = document.documentElement
  const isDark = root.dataset.theme === 'dark'
  const computed = getComputedStyle(root)
  const surfaceBg = computed.getPropertyValue('--dms-color-bg-surface').trim() || getComputedStyle(document.body).backgroundColor
  if (!isDark) {
    root.style.removeProperty('--dms-text-muted')
    root.style.removeProperty('--dms-color-text-muted')
    root.style.removeProperty('--dms-color-text-soft')
    root.style.removeProperty('--dms-color-text-meta')
  }
  const lightOnlyVars = [
    '--dms-sidebar-bg',
    '--dms-sidebar-text',
    '--dms-tab-text',
    '--dms-tab-active',
    '--dms-text-primary',
    '--dms-color-text-primary',
    '--dms-text-secondary',
    '--dms-color-text-secondary',
    '--dms-text-muted',
    '--dms-color-text-muted',
    '--dms-text-disabled',
    '--dms-color-text-soft',
    '--dms-color-text-meta',
    '--dms-border-light',
    '--dms-border-medium',
    '--dms-border-dark',
    '--dms-bg-card',
    '--dms-bg-panel',
    '--dms-bg-hover',
    '--dms-bg-selected',
    '--dms-main-bg',
    '--dms-bg-image'
  ]
  if (isDark) {
    for (const key of lightOnlyVars) root.style.removeProperty(key)
  }
  if (themeObj.primaryColor) root.style.setProperty('--dms-primary', themeObj.primaryColor)
  if (themeObj.secondaryColor) root.style.setProperty('--dms-secondary', themeObj.secondaryColor)
  if (themeObj.accentColor) root.style.setProperty('--dms-accent', themeObj.accentColor)
  if (!isDark && themeObj.sidebarBgColor) root.style.setProperty('--dms-sidebar-bg', themeObj.sidebarBgColor)
  if (!isDark && themeObj.sidebarTextColor) root.style.setProperty('--dms-sidebar-text', themeObj.sidebarTextColor)
  if (!isDark && themeObj.tabTextColor) root.style.setProperty('--dms-tab-text', themeObj.tabTextColor)
  if (!isDark && themeObj.tabActiveColor) root.style.setProperty('--dms-tab-active', themeObj.tabActiveColor)

  if (themeObj.successColor) root.style.setProperty('--dms-success', themeObj.successColor)
  if (themeObj.warningColor) root.style.setProperty('--dms-warning', themeObj.warningColor)
  if (themeObj.errorColor) root.style.setProperty('--dms-error', themeObj.errorColor)
  if (themeObj.infoColor) root.style.setProperty('--dms-info', themeObj.infoColor)
  if (!isDark && themeObj.textPrimary) {
    root.style.setProperty('--dms-text-primary', themeObj.textPrimary)
    root.style.setProperty('--dms-color-text-primary', themeObj.textPrimary)
  }
  if (!isDark && themeObj.textSecondary) {
    root.style.setProperty('--dms-text-secondary', themeObj.textSecondary)
    root.style.setProperty('--dms-color-text-secondary', themeObj.textSecondary)
  }
  if (!isDark && themeObj.textMuted && isAccessibleTextColor(themeObj.textMuted, surfaceBg, 4.5)) {
    root.style.setProperty('--dms-text-muted', themeObj.textMuted)
    root.style.setProperty('--dms-color-text-muted', themeObj.textMuted)
  }
  if (!isDark && themeObj.textSoft) {
    root.style.setProperty('--dms-color-text-soft', themeObj.textSoft)
  }
  if (!isDark && themeObj.textMeta) {
    root.style.setProperty('--dms-color-text-meta', themeObj.textMeta)
  }
  if (!isDark && themeObj.textDisabled) {
    root.style.setProperty('--dms-text-disabled', themeObj.textDisabled)
  }
  if (!isDark && themeObj.borderLight) root.style.setProperty('--dms-border-light', themeObj.borderLight)
  if (!isDark && themeObj.borderMedium) root.style.setProperty('--dms-border-medium', themeObj.borderMedium)
  if (!isDark && themeObj.borderDark) root.style.setProperty('--dms-border-dark', themeObj.borderDark)
  if (!isDark && themeObj.bgCard) root.style.setProperty('--dms-bg-card', themeObj.bgCard)
  if (!isDark && themeObj.bgPanel) root.style.setProperty('--dms-bg-panel', themeObj.bgPanel)
  if (!isDark && themeObj.bgHover) root.style.setProperty('--dms-bg-hover', themeObj.bgHover)
  if (!isDark && themeObj.bgSelected) root.style.setProperty('--dms-bg-selected', themeObj.bgSelected)

  if (themeObj.fontFamily) {
    document.body.style.fontFamily = `'${themeObj.fontFamily}', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial`
  }
  if (themeObj.fontSizeH1) root.style.setProperty('--dms-font-size-h1', themeObj.fontSizeH1)
  if (themeObj.fontSizeH2) root.style.setProperty('--dms-font-size-h2', themeObj.fontSizeH2)
  if (themeObj.fontSizeH3) root.style.setProperty('--dms-font-size-h3', themeObj.fontSizeH3)
  if (themeObj.fontSizeH4) root.style.setProperty('--dms-font-size-h4', themeObj.fontSizeH4)
  if (themeObj.fontSizeH5) root.style.setProperty('--dms-font-size-h5', themeObj.fontSizeH5)
  if (themeObj.fontSizeH6) root.style.setProperty('--dms-font-size-h6', themeObj.fontSizeH6)
  if (themeObj.fontSizeBody) root.style.setProperty('--dms-font-size-body', themeObj.fontSizeBody)
  if (themeObj.fontSizeSmall) root.style.setProperty('--dms-font-size-small', themeObj.fontSizeSmall)
  if (themeObj.fontSizeLabel) root.style.setProperty('--dms-font-size-label', themeObj.fontSizeLabel)
  if (themeObj.lineHeightNormal) root.style.setProperty('--dms-line-height', themeObj.lineHeightNormal)

  if (themeObj.btnPrimaryBg) root.style.setProperty('--dms-btn-primary-bg', themeObj.btnPrimaryBg)
  if (themeObj.btnPrimaryText) root.style.setProperty('--dms-btn-primary-text', themeObj.btnPrimaryText)
  if (themeObj.btnPrimaryHover) root.style.setProperty('--dms-btn-primary-hover', themeObj.btnPrimaryHover)
  if (themeObj.buttonBorderRadius) root.style.setProperty('--dms-btn-radius', themeObj.buttonBorderRadius)
  if (themeObj.buttonShadow) root.style.setProperty('--dms-btn-shadow', themeObj.buttonShadow)

  if (themeObj.cardShadow) root.style.setProperty('--dms-card-shadow', themeObj.cardShadow)
  if (themeObj.focusRingColor) root.style.setProperty('--dms-focus-ring', themeObj.focusRingColor)
  if (themeObj.transitionSpeed) root.style.setProperty('--dms-transition-speed', themeObj.transitionSpeed)

  if (themeObj.borderRadiusMedium) root.style.setProperty('--dms-border-radius', themeObj.borderRadiusMedium)
  if (themeObj.cardPadding) root.style.setProperty('--dms-card-padding', themeObj.cardPadding)

  if (!isDark && themeObj.bgImage) {
    root.style.setProperty('--dms-bg-image', `url('${themeObj.bgImage}')`)
    if (themeObj.mainBgColor) root.style.setProperty('--dms-main-bg', themeObj.mainBgColor + 'cc')
  } else {
    root.style.setProperty('--dms-bg-image', 'none')
    if (!isDark && themeObj.mainBgColor) root.style.setProperty('--dms-main-bg', themeObj.mainBgColor)
  }

  if (themeObj.favicon) {
    let link = document.querySelector("link[rel~='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = themeObj.favicon
  }

  if (themeObj.landingNavBg) root.style.setProperty('--dms-landing-nav-bg', themeObj.landingNavBg)
  if (themeObj.landingNavText) root.style.setProperty('--dms-landing-nav-text', themeObj.landingNavText)
  if (themeObj.landingHeroGradientStart) root.style.setProperty('--dms-landing-hero-start', themeObj.landingHeroGradientStart)
  if (themeObj.landingHeroGradientMid) root.style.setProperty('--dms-landing-hero-mid', themeObj.landingHeroGradientMid)
  if (themeObj.landingHeroGradientEnd) root.style.setProperty('--dms-landing-hero-end', themeObj.landingHeroGradientEnd)
  if (themeObj.landingHeroText) root.style.setProperty('--dms-landing-hero-text', themeObj.landingHeroText)
  if (themeObj.landingButtonPrimary) root.style.setProperty('--dms-landing-btn-primary', themeObj.landingButtonPrimary)
  if (themeObj.landingButtonPrimaryText) root.style.setProperty('--dms-landing-btn-primary-text', themeObj.landingButtonPrimaryText)
  if (themeObj.landingButtonSecondary) root.style.setProperty('--dms-landing-btn-secondary', themeObj.landingButtonSecondary)
  if (themeObj.landingButtonSecondaryText) root.style.setProperty('--dms-landing-btn-secondary-text', themeObj.landingButtonSecondaryText)
  if (themeObj.landingAboutBg) root.style.setProperty('--dms-landing-about-bg', themeObj.landingAboutBg)
  if (themeObj.landingCoreFeaturesBg) root.style.setProperty('--dms-landing-core-features-bg', themeObj.landingCoreFeaturesBg)
  if (themeObj.landingSystemFeaturesBg) root.style.setProperty('--dms-landing-system-features-bg', themeObj.landingSystemFeaturesBg)
  if (themeObj.landingRolesBg) root.style.setProperty('--dms-landing-roles-bg', themeObj.landingRolesBg)
  if (themeObj.landingWorkflowBg) root.style.setProperty('--dms-landing-workflow-bg', themeObj.landingWorkflowBg)
  if (themeObj.landingContactBg) root.style.setProperty('--dms-landing-contact-bg', themeObj.landingContactBg)

  if (themeObj.loginBgGradientStart) root.style.setProperty('--dms-login-bg-start', themeObj.loginBgGradientStart)
  if (themeObj.loginBgGradientEnd) root.style.setProperty('--dms-login-bg-end', themeObj.loginBgGradientEnd)
  if (themeObj.loginCardBg) root.style.setProperty('--dms-login-card-bg', themeObj.loginCardBg)
  if (themeObj.loginCardShadow) root.style.setProperty('--dms-login-card-shadow', themeObj.loginCardShadow)
  if (themeObj.loginButtonBg) root.style.setProperty('--dms-login-btn-bg', themeObj.loginButtonBg)
  if (themeObj.loginButtonText) root.style.setProperty('--dms-login-btn-text', themeObj.loginButtonText)
  if (themeObj.loginButtonHover) root.style.setProperty('--dms-login-btn-hover', themeObj.loginButtonHover)
  if (themeObj.loginAccentBg) root.style.setProperty('--dms-login-accent-bg', themeObj.loginAccentBg)
  if (themeObj.loginAccentIcon) root.style.setProperty('--dms-login-accent-icon', themeObj.loginAccentIcon)
}

export function applyThemeMode(mode = 'light') {
  const root = document.documentElement
  const nextMode = mode === 'dark' ? 'dark' : 'light'
  root.dataset.theme = nextMode
  root.style.colorScheme = nextMode
  if (nextMode === 'dark') {
    const clearVars = [
      '--dms-sidebar-bg',
      '--dms-sidebar-text',
      '--dms-tab-text',
      '--dms-tab-active',
      '--dms-text-primary',
      '--dms-color-text-primary',
      '--dms-text-secondary',
      '--dms-color-text-secondary',
      '--dms-text-muted',
      '--dms-color-text-muted',
      '--dms-text-disabled',
      '--dms-color-text-soft',
      '--dms-color-text-meta',
      '--dms-border-light',
      '--dms-border-medium',
      '--dms-border-dark',
      '--dms-bg-card',
      '--dms-bg-panel',
      '--dms-bg-hover',
      '--dms-bg-selected',
      '--dms-main-bg',
      '--dms-bg-image'
    ]
    for (const key of clearVars) root.style.removeProperty(key)
  }
}

export function applyCompanyInfo(companyInfo) {
  if (!companyInfo || typeof companyInfo !== 'object') return
  inMemoryBranding.companyInfo = cloneValue(companyInfo)
  if (companyInfo.companyName) {
    document.title = `${companyInfo.companyName} DMS`
  }
}

export function persistBranding({ companyInfo, theme }) {
  if (companyInfo && typeof companyInfo === 'object') {
    inMemoryBranding.companyInfo = cloneValue(companyInfo)
    try {
      localStorage.setItem('dms_company_info', JSON.stringify(companyInfo))
    } catch (error) {
      console.warn('Failed to persist company branding to localStorage; using in-memory fallback.', error)
    }
  }
  if (theme && typeof theme === 'object') {
    inMemoryBranding.theme = cloneValue(theme)
    const sanitizedTheme = sanitizeThemeForStorage(theme)
    try {
      localStorage.setItem('dms_theme_settings', JSON.stringify(sanitizedTheme))
    } catch (error) {
      console.warn('Failed to persist theme branding to localStorage; using in-memory fallback.', error)
    }
  }
  window.dispatchEvent(new Event(BRANDING_UPDATED_EVENT))
}
