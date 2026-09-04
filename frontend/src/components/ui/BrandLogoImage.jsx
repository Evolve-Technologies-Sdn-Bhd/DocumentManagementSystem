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
  useEffect(() => {
    console.log(`%c[DEBUG-BRANDIMG:${compId.current}] ===== MOUNT/RE-MOUNT =====`, 'color:#5B21B6;font-weight:bold')
    console.log(`[DEBUG-BRANDIMG:${compId.current}] props.src=`, src, typeof src)
    console.log(`[DEBUG-BRANDIMG:${compId.current}] props.placeholderSrc=`, placeholderSrc)
    console.log(`[DEBUG-BRANDIMG:${compId.current}] IN_MEMORY_FAILED.size=`, IN_MEMORY_FAILED.size, 'entries=', [...IN_MEMORY_FAILED.keys()])
  }, [src, placeholderSrc])
  // #endregion
  const normalizedSrc = useMemo(() => normalizeAppPath(src), [src])
  const normalizedPlaceholder = useMemo(() => normalizeAppPath(placeholderSrc), [placeholderSrc])
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
    console.log(`%c[DEBUG-BRANDIMG:${compId.current}] ⚠️ handleImgError TRIGGERED (inline onError)`, 'color:#DC2626;font-weight:bold')
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   normalizedSrc=`, normalizedSrc)
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   normalizedPlaceholder=`, normalizedPlaceholder)
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   displaySrc BEFORE=`, displaySrc, '— loadedFull=', loadedFull)
    // #endregion
    setDisplaySrc((prev) => {
      // Always prefer placeholder FIRST if available — regardless of what prev was
      if (normalizedPlaceholder) {
        // #region debug-point D,H:brandLogoImage
        if (prev === normalizedPlaceholder) {
          console.log(`[DEBUG-BRANDIMG:${compId.current}]   ⚠️ prev already WAS placeholder; but normalizedPlaceholder is set → still USE placeholder (prevent NULL fallback)`)
        } else {
          console.log(`[DEBUG-BRANDIMG:${compId.current}]   displaySrc AFTER= normalizedPlaceholder=`, normalizedPlaceholder)
        }
        // #endregion
        return normalizedPlaceholder
      }
      // #region debug-point D,H:brandLogoImage
      console.log(`%c[DEBUG-BRANDIMG:${compId.current}]   displaySrc AFTER= NULL — NO PLACEHOLDER, LOGO HIDDEN (expected: no placeholder available)`, 'color:#B45309;font-weight:bold')
      // #endregion
      return null
    })
    setLoadedFull(true)
  }, [normalizedPlaceholder, normalizedSrc, displaySrc, loadedFull])

  useEffect(() => {
    // #region debug-point D,H:brandLogoImage
    console.log(`[DEBUG-BRANDIMG:${compId.current}] --- useEffect RUN ---`)
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   normalizedSrc=`, normalizedSrc)
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   normalizedPlaceholder=`, normalizedPlaceholder)
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

    if (_isFailedCached(normalizedSrc)) {
      // #region debug-point D,H:brandLogoImage
      console.log(`%c[DEBUG-BRANDIMG:${compId.current}]   IN_MEMORY_FAILED (TTL) HIT → trigger error immediately (will auto-clear after ${IN_MEMORY_FAILED_TTL_MS / 1000}s)`, 'color:#B91C1C')
      // #endregion
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

    const image = new Image()
    image.onload = () => {
      // #region debug-point D,H:brandLogoImage
      console.log(`%c[DEBUG-BRANDIMG:${compId.current}] ✅ image.onload → LOGO APPEARS (setDisplaySrc=normalizedSrc)`, 'color:#065F46;font-weight:bold')
      // #endregion
      setDisplaySrc(normalizedSrc)
      setLoadedFull(true)
    }
    image.onerror = () => {
      // #region debug-point D,H:brandLogoImage
      console.log(`%c[DEBUG-BRANDIMG:${compId.current}] ⚠️ image.onerror (preload) → _markFailedCached(normalizedSrc) [TTL ${IN_MEMORY_FAILED_TTL_MS / 1000}s]`, 'color:#DC2626;font-weight:bold')
      // #endregion
      _markFailedCached(normalizedSrc)
      handleImgError()
    }
    // #region debug-point D,H:brandLogoImage
    console.log(`[DEBUG-BRANDIMG:${compId.current}]   start preloading image. src=`, normalizedSrc)
    // #endregion
    image.src = normalizedSrc

    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [normalizedPlaceholder, normalizedSrc, handleImgError])

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
