function getWindowOrigin() {
  if (typeof window === 'undefined' || !window.location?.origin) return null
  return window.location.origin
}

function getApiOrigin() {
  const fallbackOrigin = getWindowOrigin()
  const rawBaseUrl = import.meta.env.VITE_API_URL
  if (!rawBaseUrl) return fallbackOrigin

  try {
    return new URL(rawBaseUrl, fallbackOrigin || undefined).origin
  } catch {
    return fallbackOrigin
  }
}

export function resolveBackendAssetUrl(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return urlOrPath

  const value = urlOrPath.trim()
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return value

  try {
    return new URL(value).toString()
  } catch {}

  if (value.startsWith('/uploads/')) {
    const apiOrigin = getApiOrigin()
    if (!apiOrigin) return value

    try {
      return new URL(value, apiOrigin).toString()
    } catch {
      return value
    }
  }

  return value
}

export function normalizeAppPath(urlOrPath) {
  return resolveBackendAssetUrl(urlOrPath)
}
