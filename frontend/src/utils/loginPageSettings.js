const DEFAULT_FEATURE_PILLS = [
  'RFID Tracking',
  'Live Dashboard',
  'MES Integration',
  'Mobile Handheld',
  'Receiving & Shipping'
]

export const DEFAULT_LOGIN_PAGE_SETTINGS = {
  showTopbar: false,
  showFooter: false,
  pageBackground: '#f3f4f6',
  formCardBackground: '#f3f4f6',
  formCardBorderColor: '#e5e7eb',
  heroSection: {
    brandName: 'Zora Pro ERP',
    platformLabel: '',
    heroImage: null,
    heroFocalX: 50,
    heroFocalY: 50,
    heroTextOffsetX: 0,
    heroTextMaxWidth: 420,
    heroDescriptionMaxWidth: 360,
    heroFontFamily: '',
    heroTitleFontSize: 50,
    heroTitleFontWeight: 800,
    heroTitleLetterSpacing: -0.03,
    heroTitleLineHeight: 1.02,
    heroHighlightColor: '#F6AA3B',
    heroDescriptionFontSize: 15,
    heroDescriptionLineHeight: 1.85,
    heroTextShadowEnabled: true,
    heroTitleTextShadow: '0 14px 30px rgba(0, 0, 0, 0.45)',
    heroDescriptionTextShadow: '0 10px 22px rgba(0, 0, 0, 0.35)',
    featurePillFontSize: 10,
    featurePillHeight: 24,
    featurePillPaddingX: 12,
    headline: 'Smart Warehouse',
    highlightedHeadline: 'at Your Fingertips',
    description: 'End-to-end RFID-powered inventory management, MES integration, and real-time analytics - all in one platform.',
    footerNote: `© ${new Date().getFullYear()} CLB Group - Zora Pro ERP`,
    featurePills: DEFAULT_FEATURE_PILLS
  }
}

export const DEFAULT_LOGIN_FORM_COPY = {
  title: 'Welcome back',
  subtitle: 'Sign in to your account',
  usernameLabel: 'Email',
  usernamePlaceholder: 'name@company.com',
  passwordLabel: 'Password',
  passwordPlaceholder: 'Enter your password',
  rememberMeLabel: 'Keep me logged in',
  showForgotPassword: false,
  forgotPasswordText: 'Change Password?',
  showRequiredAsterisk: true,
  loginButtonLabel: 'Sign In',
  backToHomeText: 'Back to home'
}

function clampPercent(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(100, Math.max(0, n))
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  if (Number.isFinite(min) && n < min) return min
  if (Number.isFinite(max) && n > max) return max
  return n
}

function mergeObjects(base, override) {
  const next = { ...base }
  if (!override || typeof override !== 'object') return next

  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      next[key] = [...value]
      continue
    }
    if (value && typeof value === 'object') {
      next[key] = mergeObjects(base[key] && typeof base[key] === 'object' ? base[key] : {}, value)
      continue
    }
    next[key] = value
  }

  return next
}

export function normalizeLoginPageSettings(settings) {
  const merged = mergeObjects(DEFAULT_LOGIN_PAGE_SETTINGS, settings)
  const pills = Array.isArray(merged.heroSection?.featurePills) ? merged.heroSection.featurePills : []
  const focalX = clampPercent(merged.heroSection?.heroFocalX, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroFocalX)
  const focalY = clampPercent(merged.heroSection?.heroFocalY, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroFocalY)
  const textOffsetX = clampNumber(merged.heroSection?.heroTextOffsetX, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroTextOffsetX, -200, 200)
  const textMaxWidth = clampNumber(merged.heroSection?.heroTextMaxWidth, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroTextMaxWidth, 280, 900)
  const descriptionMaxWidth = clampNumber(merged.heroSection?.heroDescriptionMaxWidth, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroDescriptionMaxWidth, 240, 900)
  const titleFontSize = clampNumber(merged.heroSection?.heroTitleFontSize, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroTitleFontSize, 28, 88)
  const titleFontWeight = clampNumber(merged.heroSection?.heroTitleFontWeight, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroTitleFontWeight, 300, 900)
  const titleLetterSpacing = clampNumber(merged.heroSection?.heroTitleLetterSpacing, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroTitleLetterSpacing, -0.2, 0.3)
  const titleLineHeight = clampNumber(merged.heroSection?.heroTitleLineHeight, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroTitleLineHeight, 0.9, 1.6)
  const descriptionFontSize = clampNumber(merged.heroSection?.heroDescriptionFontSize, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroDescriptionFontSize, 11, 22)
  const descriptionLineHeight = clampNumber(merged.heroSection?.heroDescriptionLineHeight, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroDescriptionLineHeight, 1.2, 2.6)
  const featurePillFontSize = clampNumber(merged.heroSection?.featurePillFontSize, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.featurePillFontSize, 9, 18)
  const featurePillHeight = clampNumber(merged.heroSection?.featurePillHeight, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.featurePillHeight, 18, 60)
  const featurePillPaddingX = clampNumber(merged.heroSection?.featurePillPaddingX, DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.featurePillPaddingX, 6, 32)

  return {
    showTopbar: !!merged.showTopbar,
    showFooter: !!merged.showFooter,
    pageBackground: merged.pageBackground || DEFAULT_LOGIN_PAGE_SETTINGS.pageBackground,
    formCardBackground: merged.formCardBackground || DEFAULT_LOGIN_PAGE_SETTINGS.formCardBackground,
    formCardBorderColor: merged.formCardBorderColor || DEFAULT_LOGIN_PAGE_SETTINGS.formCardBorderColor,
    heroSection: {
      brandName: merged.heroSection?.brandName || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.brandName,
      platformLabel: merged.heroSection?.platformLabel || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.platformLabel,
      heroImage: merged.heroSection?.heroImage || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroImage,
      heroFocalX: focalX,
      heroFocalY: focalY,
      heroTextOffsetX: textOffsetX,
      heroTextMaxWidth: textMaxWidth,
      heroDescriptionMaxWidth: descriptionMaxWidth,
      heroFontFamily: merged.heroSection?.heroFontFamily || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroFontFamily,
      heroTitleFontSize: titleFontSize,
      heroTitleFontWeight: titleFontWeight,
      heroTitleLetterSpacing: titleLetterSpacing,
      heroTitleLineHeight: titleLineHeight,
      heroHighlightColor: merged.heroSection?.heroHighlightColor || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroHighlightColor,
      heroDescriptionFontSize: descriptionFontSize,
      heroDescriptionLineHeight: descriptionLineHeight,
      heroTextShadowEnabled: merged.heroSection?.heroTextShadowEnabled !== false,
      heroTitleTextShadow: merged.heroSection?.heroTitleTextShadow || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroTitleTextShadow,
      heroDescriptionTextShadow: merged.heroSection?.heroDescriptionTextShadow || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.heroDescriptionTextShadow,
      featurePillFontSize,
      featurePillHeight,
      featurePillPaddingX,
      headline: merged.heroSection?.headline || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.headline,
      highlightedHeadline: merged.heroSection?.highlightedHeadline || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.highlightedHeadline,
      description: merged.heroSection?.description || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.description,
      footerNote: merged.heroSection?.footerNote || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.footerNote,
      featurePills: [...pills, ...DEFAULT_FEATURE_PILLS].slice(0, 5)
    }
  }
}
