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
  // #region debug-point D,H:brandLogoImage
  const compId = useRef(`bli-${Math.random().toString(36).slice(2, 8)}`)
  const prevNormalizedSrcRef = useRef(null)
  const apiFallbackTriedRef = useRef(false)
  useEffect(() => {
    console.log(`%c[DEBUG-BRANDIMG:${compId.current}] ===== MOUNT/RE-MOUNT =====`, 'color:#5B21B6;font-weight:bold')
    console.log(`[DEBUG-BRANDIMG:${compId.current}] props.src=`, src, typeof src)
    console.log(`[DEBUG-BRANDIMG:${compId.current}] props.placeholderSrc=`, placeholderSrc)
    console.log(`[DEBUG-BRANDIMG:${compId.current}] IN_MEMORY_FAILED.size=`, IN_MEMORY_FAILED.size, 'entries=', [...IN_MEMORY_FAILED.keys()])
    apiFallbackTriedRef.current = false
  }, [src, placeholderSrc])
  // #endregion
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
  // #region debug-point D,H:brandLogoImage
  console.log(`[DEBUG-BRANDIMG:${compId.current}] normalizedSrc=`, normalizedSrc, `| normalizedPlaceholder=`, normalizedPlaceholder)
  // #endregion
  const [displaySrc, setDisplaySrc] = useState(() => normalizedPlaceholder || normalizedSrc || null)
  const [loadedFull, setLoadedFull] = useState(() => !normalizedPlaceholder || normalizedPlaceholder === normalizedSrc)
  const imgRef = useRef(null)
  const attemptedRef = useRef(null)

  const handleImgError = useCallback(() => {
    // #region debug-point D,H:brandLogoImage
    console.log(`%c[DEBUG-BRANDIMG:${compId.current}] ⚠️ handleImgError TRIGGERED (inline onError on rendered img)`, 'color:#DC2626;font-weight:bold')
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   normalizedSrc=`, normalizedSrc)
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   normalizedPlaceholder=`, normalizedPlaceholder)
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   displaySrc BEFORE=`, displaySrc, '— loadedFull=', loadedFull)
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   apiFallbackSrc=`, apiFallbackSrc, '| apiFallbackTriedRef=', apiFallbackTriedRef.current)
    // #endregion
    // ⭐ FINAL FALLBACK SWAP (inline rendered img):
    // If current displaySrc failed AND it's a /uploads/branding/* URL, try the API fallback
    setDisplaySrc((prev) => {
      const isOldStatic = typeof prev === 'string' && _uploadsBrandingToApiUrl(prev)
      if (isOldStatic && apiFallbackSrc && !apiFallbackTriedRef.current && !_isApiBrandingUrl(prev)) {
        // #region debug-point D,H:brandLogoImage
        console.log(`%c[DEBUG-BRANDIMG:${compId.current}] 🔁 INLINE RENDER onerror: prev=${prev} is old static URL → swap to ${apiFallbackSrc}`, 'color:#7C3AED;font-weight:bold')
        // #endregion
        apiFallbackTriedRef.current = true
        setLoadedFull(false)
        return apiFallbackSrc
      }
      // Always prefer placeholder if available (prevent NULL flash/disappear)
      if (normalizedPlaceholder) {
        // #region debug-point D,H:brandLogoImage
        if (prev === normalizedPlaceholder) {
          console.log(`[DEBUG-BRANDIMG:${compId.current}]   ⚠️ prev already WAS placeholder; still keep placeholder (no NULL)`)
        } else {
          console.log(`[DEBUG-BRANDIMG:${compId.current}]   displaySrc AFTER= normalizedPlaceholder`)
        }
        // #endregion
        return normalizedPlaceholder
      }
      // #region debug-point D,H:brandLogoImage
      console.log(`%c[DEBUG-BRANDIMG:${compId.current}]   displaySrc AFTER= NULL — NO PLACEHOLDER (keep blank)`, 'color:#B45309;font-weight:bold')
      // #endregion
      return null
    })
    setLoadedFull((was) => was ? true : false)
  }, [normalizedPlaceholder, normalizedSrc, displaySrc, loadedFull, apiFallbackSrc])

  const tryImageSrc = useCallback((srcToTry, level) => {
    const image = new Image()
    image.onload = () => {
      // #region debug-point D,H:brandLogoImage
      console.log(`%c[DEBUG-BRANDIMG:${compId.current}] ✅ image.onload (level=${level}) srcToTry=${srcToTry} → LOGO APPEARS FULL QUALITY`, 'color:#065F46;font-weight:bold')
      // #endregion
      setDisplaySrc(srcToTry)
      setLoadedFull(true)
    }
    image.onerror = () => {
      // #region debug-point D,H:brandLogoImage
      console.log(`%c[DEBUG-BRANDIMG:${compId.current}] ⚠️ image.onerror (level=${level}) srcToTry=${srcToTry}`, 'color:#DC2626;font-weight:bold')
      // #endregion
      // LEVEL 1: /uploads/branding/xxx.png failed → try /api/public/branding-file/branding/xxx.png
      if (level === 1 && apiFallbackSrc && !apiFallbackTriedRef.current && !_isApiBrandingUrl(srcToTry)) {
        // #region debug-point D,H:brandLogoImage
        console.log(`%c[DEBUG-BRANDIMG:${compId.current}] 🔁 LEVEL=1 SWAP FALLBACK: /uploads/branding/... failed → retry via ${apiFallbackSrc} (bypasses Nginx static)`, 'color:#7C3AED;font-weight:bold')
        // #endregion
        apiFallbackTriedRef.current = true
        tryImageSrc(apiFallbackSrc, 2)
        return
      }
      // LEVEL 2 (both failed) OR no fallback available → mark as failed + use placeholder
      _markFailedCached(normalizedSrc)
      if (apiFallbackSrc) _markFailedCached(apiFallbackSrc)
      handleImgError()
    }
    // #region debug-point D,H:brandLogoImage
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   [level=${level}] preloading: ${srcToTry}`)
    // #endregion
    image.src = srcToTry
    return image
  }, [apiFallbackSrc, handleImgError, normalizedSrc])

  useEffect(() => {
    // #region debug-point D,H:brandLogoImage
    console.log(`[DEBUG-BRANDIMG:${compId.current}] --- useEffect RUN ---`)
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   normalizedSrc=`, normalizedSrc)
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   normalizedPlaceholder=`, normalizedPlaceholder)
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   apiFallbackSrc=`, apiFallbackSrc)
    // #endregion
    if (!normalizedSrc) {
      // #region debug-point D,H:brandLogoImage
      console.log(`%c[DEBUG-BRANDIMG:${compId.current}]   normalizedSrc EMPTY → setDisplaySrc NULL`, 'color:#B91C1C')
      // #endregion
      setDisplaySrc(null)
      setLoadedFull(true)
      return
    }

    const cacheKey = normalizedSrc + '||' + (normalizedPlaceholder || '')
    if (attemptedRef.current === cacheKey) {
      // #region debug-point D,H:brandLogoImage
      console.log(`[DEBUG-BRANDIMG:${compId.current}]   same cacheKey, skip (already attempted)`)
      // #endregion
      return
    }
    attemptedRef.current = cacheKey
    apiFallbackTriedRef.current = false

    if (_isFailedCached(normalizedSrc)) {
      // #region debug-point D,H:brandLogoImage
      console.log(`%c[DEBUG-BRANDIMG:${compId.current}]   IN_MEMORY_FAILED (TTL) HIT on normalizedSrc → check if API fallback not yet tried`, 'color:#B91C1C')
      // #endregion
      if (apiFallbackSrc && !_isFailedCached(apiFallbackSrc) && !apiFallbackTriedRef.current) {
        // #region debug-point D,H:brandLogoImage
        console.log(`%c[DEBUG-BRANDIMG:${compId.current}]   🔁 API fallback NOT in failed cache yet → jump straight to apiFallbackSrc: ${apiFallbackSrc}`, 'color:#7C3AED;font-weight:bold')
        // #endregion
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
      // #region debug-point D,H:brandLogoImage
      console.log(`[DEBUG-BRANDIMG:${compId.current}]   preferPlaceholder=true → display placeholder first`)
      // #endregion
      setDisplaySrc(normalizedPlaceholder)
      setLoadedFull(false)
    } else {
      // #region debug-point D,H:brandLogoImage
      console.log(`[DEBUG-BRANDIMG:${compId.current}]   preferPlaceholder=false → display src directly`)
      // #endregion
      setDisplaySrc(normalizedSrc)
      setLoadedFull(false)
    }

    const image = tryImageSrc(normalizedSrc, 1)

    return () => {
      if (image) { image.onload = null; image.onerror = null }
    }
  }, [normalizedPlaceholder, normalizedSrc, handleImgError, tryImageSrc, apiFallbackSrc])

  // #region debug-point D,H:brandLogoImage
  console.log(`[DEBUG-BRANDIMG:${compId.current}] RENDER — displaySrc=`, displaySrc, `| loadedFull=`, loadedFull)
  if (!displaySrc) {
    console.log(`%c[DEBUG-BRANDIMG:${compId.current}] → return null (no image rendered)`, 'color:#B91C1C')
  }
  // #endregion
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
