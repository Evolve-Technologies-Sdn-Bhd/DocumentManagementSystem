import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeAppPath } from '../../utils/normalizeUrl'

const IN_MEMORY_FAILED = new Map()
const IN_MEMORY_FAILED_TTL_MS = 60 * 1000

const _isFailedCached = (key) => {
  const entry = IN_MEMORY_FAILED.get(key)
  if (!entry) return false
  if (Date.now() - entry.ts > IN_MEMORY_FAILED_TTL_MS) {
    IN_MEMORY_FAILED.delete(key)
    return false
  }
  return true
}
const _markFailedCached = (key) => {
  IN_MEMORY_FAILED.set(key, { ts: Date.now() })
}
const _clearFailedCached = (key) => {
  if (key) IN_MEMORY_FAILED.delete(key)
}

const _uploadsBrandingToApiUrl = (url) => {
  if (!url || typeof url !== 'string') return null
  if (url.startsWith('data:') || url.startsWith('blob:') || /^https?:\/\//i.test(url)) return null
  // Match both /uploads/branding/xxx and uploads/branding/xxx (any leading slashes)
  const m = url.match(/^\/?uploads\/branding\/([^/?#]+)(?:[?#].*)?$/i)
  if (!m) return null
  const fname = m[1]
  return `/api/public/branding-file/branding/${encodeURIComponent(fname)}`
}

const _isApiBrandingUrl = (url) => {
  return typeof url === 'string' && /^\/?api\/public\/branding-file\//i.test(url)
}

export default function BrandLogoImage({
  src,
  placeholderSrc,
  alt,
  className,
  style
}) {
  const prevNormalizedSrcRef = useRef(null)
  const apiFallbackTriedRef = useRef(false)
  useEffect(() => {
    apiFallbackTriedRef.current = false
  }, [src, placeholderSrc])
  const normalizedSrc = useMemo(() => normalizeAppPath(src), [src])
  const normalizedPlaceholder = useMemo(() => normalizeAppPath(placeholderSrc), [placeholderSrc])
  const apiFallbackSrc = useMemo(() => _uploadsBrandingToApiUrl(normalizedSrc), [normalizedSrc])
  useEffect(() => {
    if (normalizedSrc && prevNormalizedSrcRef.current && prevNormalizedSrcRef.current !== normalizedSrc) {
      _clearFailedCached(prevNormalizedSrcRef.current)
    }
    prevNormalizedSrcRef.current = normalizedSrc
    return () => {
      if (normalizedSrc) _clearFailedCached(normalizedSrc)
    }
  }, [normalizedSrc])
  const [displaySrc, setDisplaySrc] = useState(() => normalizedPlaceholder || normalizedSrc || null)
  const [loadedFull, setLoadedFull] = useState(() => !normalizedPlaceholder || normalizedPlaceholder === normalizedSrc)
  const imgRef = useRef(null)
  const attemptedRef = useRef(null)

  const handleImgError = useCallback(() => {
    // ⭐ FINAL FALLBACK SWAP (inline rendered img):
    // If current displaySrc failed AND it's a /uploads/branding/* URL, try the API fallback
    setDisplaySrc((prev) => {
      const isOldStatic = typeof prev === 'string' && _uploadsBrandingToApiUrl(prev)
      if (isOldStatic && apiFallbackSrc && !apiFallbackTriedRef.current && !_isApiBrandingUrl(prev)) {
        apiFallbackTriedRef.current = true
        setLoadedFull(false)
        return apiFallbackSrc
      }
      // Always prefer placeholder if available (prevent NULL flash/disappear)
      if (normalizedPlaceholder) {
        return normalizedPlaceholder
      }
      return null
    })
    setLoadedFull((was) => was ? true : false)
  }, [normalizedPlaceholder, normalizedSrc, displaySrc, loadedFull, apiFallbackSrc])

  const tryImageSrc = useCallback((srcToTry, level) => {
    const image = new Image()
    image.onload = () => {
      setDisplaySrc(srcToTry)
      setLoadedFull(true)
    }
    image.onerror = () => {
      // LEVEL 1: /uploads/branding/xxx.png failed → try /api/public/branding-file/branding/xxx.png
      if (level === 1 && apiFallbackSrc && !apiFallbackTriedRef.current && !_isApiBrandingUrl(srcToTry)) {
        apiFallbackTriedRef.current = true
        tryImageSrc(apiFallbackSrc, 2)
        return
      }
      // LEVEL 2 (both failed) OR no fallback available → mark as failed + use placeholder
      _markFailedCached(normalizedSrc)
      if (apiFallbackSrc) _markFailedCached(apiFallbackSrc)
      handleImgError()
    }
    image.src = srcToTry
    return image
  }, [apiFallbackSrc, handleImgError, normalizedSrc])

  useEffect(() => {
    if (!normalizedSrc) {
      setDisplaySrc(null)
      setLoadedFull(true)
      return
    }

    const cacheKey = normalizedSrc + '||' + (normalizedPlaceholder || '')
    if (attemptedRef.current === cacheKey) {
      return
    }
    attemptedRef.current = cacheKey
    apiFallbackTriedRef.current = false

    if (_isFailedCached(normalizedSrc)) {
      if (apiFallbackSrc && !_isFailedCached(apiFallbackSrc) && !apiFallbackTriedRef.current) {
        apiFallbackTriedRef.current = true
        const preferPlaceholder = Boolean(normalizedPlaceholder && normalizedPlaceholder !== normalizedSrc)
        if (preferPlaceholder) { setDisplaySrc(normalizedPlaceholder); setLoadedFull(false) }
        const img = tryImageSrc(apiFallbackSrc, 2)
        return () => { if (img) { img.onload = null; img.onerror = null } }
      }
      handleImgError()
      return
    }

    const preferPlaceholder = Boolean(normalizedPlaceholder && normalizedPlaceholder !== normalizedSrc)
    if (preferPlaceholder) {
      setDisplaySrc(normalizedPlaceholder)
      setLoadedFull(false)
    } else {
      setDisplaySrc(normalizedSrc)
      setLoadedFull(false)
    }

    const image = tryImageSrc(normalizedSrc, 1)

    return () => {
      if (image) { image.onload = null; image.onerror = null }
    }
  }, [normalizedPlaceholder, normalizedSrc, handleImgError, tryImageSrc, apiFallbackSrc])

  if (!displaySrc) return null

  return (
    <img
      ref={imgRef}
      src={displaySrc}
      alt={alt}
      className={className}
      loading="eager"
      decoding="async"
      fetchpriority="high"
      onError={handleImgError}
      style={{
        ...style,
        transition: 'filter 180ms ease, opacity 180ms ease',
        filter: loadedFull ? 'none' : 'blur(0.5px)',
        opacity: loadedFull ? 1 : 0.94
      }}
    />
  )
}
