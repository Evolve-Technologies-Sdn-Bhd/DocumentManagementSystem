export const BRANDING_UPDATED_EVENT = 'brandingUpdated'
export const LANDING_SETTINGS_UPDATED_EVENT = 'landingPageSettingsUpdated'

export function readStoredJson(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function readThemeSettings() {
  return readStoredJson('dms_theme_settings')
}

export function readCompanyInfo() {
  return readStoredJson('dms_company_info')
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
  const root = document.documentElement
  if (themeObj.primaryColor) root.style.setProperty('--dms-primary', themeObj.primaryColor)
  if (themeObj.secondaryColor) root.style.setProperty('--dms-secondary', themeObj.secondaryColor)
  if (themeObj.accentColor) root.style.setProperty('--dms-accent', themeObj.accentColor)
  if (themeObj.sidebarBgColor) root.style.setProperty('--dms-sidebar-bg', themeObj.sidebarBgColor)
  if (themeObj.sidebarTextColor) root.style.setProperty('--dms-sidebar-text', themeObj.sidebarTextColor)
  if (themeObj.tabTextColor) root.style.setProperty('--dms-tab-text', themeObj.tabTextColor)
  if (themeObj.tabActiveColor) root.style.setProperty('--dms-tab-active', themeObj.tabActiveColor)

  if (themeObj.successColor) root.style.setProperty('--dms-success', themeObj.successColor)
  if (themeObj.warningColor) root.style.setProperty('--dms-warning', themeObj.warningColor)
  if (themeObj.errorColor) root.style.setProperty('--dms-error', themeObj.errorColor)
  if (themeObj.infoColor) root.style.setProperty('--dms-info', themeObj.infoColor)
  if (themeObj.textPrimary) root.style.setProperty('--dms-text-primary', themeObj.textPrimary)
  if (themeObj.textSecondary) root.style.setProperty('--dms-text-secondary', themeObj.textSecondary)
  if (themeObj.textMuted) root.style.setProperty('--dms-text-muted', themeObj.textMuted)
  if (themeObj.textDisabled) root.style.setProperty('--dms-text-disabled', themeObj.textDisabled)
  if (themeObj.borderLight) root.style.setProperty('--dms-border-light', themeObj.borderLight)
  if (themeObj.borderMedium) root.style.setProperty('--dms-border-medium', themeObj.borderMedium)
  if (themeObj.borderDark) root.style.setProperty('--dms-border-dark', themeObj.borderDark)
  if (themeObj.bgCard) root.style.setProperty('--dms-bg-card', themeObj.bgCard)
  if (themeObj.bgPanel) root.style.setProperty('--dms-bg-panel', themeObj.bgPanel)
  if (themeObj.bgHover) root.style.setProperty('--dms-bg-hover', themeObj.bgHover)
  if (themeObj.bgSelected) root.style.setProperty('--dms-bg-selected', themeObj.bgSelected)

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

  if (themeObj.bgImage) {
    root.style.setProperty('--dms-bg-image', `url('${themeObj.bgImage}')`)
    if (themeObj.mainBgColor) root.style.setProperty('--dms-main-bg', themeObj.mainBgColor + 'cc')
  } else {
    root.style.setProperty('--dms-bg-image', 'none')
    if (themeObj.mainBgColor) root.style.setProperty('--dms-main-bg', themeObj.mainBgColor)
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

export function applyCompanyInfo(companyInfo) {
  if (!companyInfo || typeof companyInfo !== 'object') return
  if (companyInfo.companyName) {
    document.title = `${companyInfo.companyName} DMS`
  }
}

export function persistBranding({ companyInfo, theme }) {
  if (companyInfo && typeof companyInfo === 'object') {
    try {
      localStorage.setItem('dms_company_info', JSON.stringify(companyInfo))
    } catch {}
  }
  if (theme && typeof theme === 'object') {
    try {
      localStorage.setItem('dms_theme_settings', JSON.stringify(theme))
    } catch {}
  }
  window.dispatchEvent(new Event(BRANDING_UPDATED_EVENT))
}
