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
      headline: merged.heroSection?.headline || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.headline,
      highlightedHeadline: merged.heroSection?.highlightedHeadline || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.highlightedHeadline,
      description: merged.heroSection?.description || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.description,
      footerNote: merged.heroSection?.footerNote || DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.footerNote,
      featurePills: [...pills, ...DEFAULT_FEATURE_PILLS].slice(0, 5)
    }
  }
}
