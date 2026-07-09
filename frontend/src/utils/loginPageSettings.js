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
  brandLogoOverride: null,
  heroSection: {
    brandName: 'Zora Pro ERP',
    platformLabel: '',
    heroImage: null,
    overlayStart: 'rgba(23, 23, 35, 0.58)',
    overlayEnd: 'rgba(12, 25, 58, 0.32)',
    headline: 'Smart Warehouse',
    highlightedHeadline: 'at Your Fingertips',
    description: 'End-to-end RFID-powered inventory management, MES integration, and real-time analytics - all in one platform.',
    footerNote: `© ${new Date().getFullYear()} CLB Group - Zora Pro ERP`,
    featurePills: DEFAULT_FEATURE_PILLS
  },
  formSection: {
    title: 'Welcome back',
    subtitle: 'Sign in to your account',
    showcaseImage: null,
    showcaseBadge: 'Save',
    usernameLabel: 'Username or Email',
    usernamePlaceholder: 'username or you@company.com',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    rememberMeLabel: 'Keep me logged in',
    showForgotPassword: false,
    forgotPasswordText: 'Change Password?',
    showRequiredAsterisk: true,
    loginButtonLabel: 'Sign In',
    backToHomeText: 'Back to home'
  }
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

  return {
    ...merged,
    heroSection: {
      ...merged.heroSection,
      featurePills: [...pills, ...DEFAULT_FEATURE_PILLS].slice(0, 5)
    }
  }
}
