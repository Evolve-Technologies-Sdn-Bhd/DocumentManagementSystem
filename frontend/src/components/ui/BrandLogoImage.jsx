import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeAppPath } from '../../utils/normalizeUrl'

const IN_MEMORY_FAILED = new Set()

export default function BrandLogoImage({
  src,
  placeholderSrc,
  alt,
  className,
  style
}) {
  const normalizedSrc = useMemo(() => normalizeAppPath(src), [src])
  const normalizedPlaceholder = useMemo(() => normalizeAppPath(placeholderSrc), [placeholderSrc])
  const [displaySrc, setDisplaySrc] = useState(() => normalizedPlaceholder || normalizedSrc || null)
  const [loadedFull, setLoadedFull] = useState(() => !normalizedPlaceholder || normalizedPlaceholder === normalizedSrc)
  const imgRef = useRef(null)
  const attemptedRef = useRef(null)

  const handleImgError = useCallback(() => {
    setDisplaySrc((prev) => {
      if (normalizedPlaceholder && normalizedPlaceholder !== prev) {
        return normalizedPlaceholder
      }
      return null
    })
    setLoadedFull(true)
  }, [normalizedPlaceholder])

  useEffect(() => {
    if (!normalizedSrc) {
      setDisplaySrc(null)
      setLoadedFull(true)
      return
    }

    const cacheKey = normalizedSrc + '||' + (normalizedPlaceholder || '')
    if (attemptedRef.current === cacheKey) return
    attemptedRef.current = cacheKey

    if (IN_MEMORY_FAILED.has(normalizedSrc)) {
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

    const image = new Image()
    image.onload = () => {
      setDisplaySrc(normalizedSrc)
      setLoadedFull(true)
    }
    image.onerror = () => {
      IN_MEMORY_FAILED.add(normalizedSrc)
      handleImgError()
    }
    image.src = normalizedSrc

    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [normalizedPlaceholder, normalizedSrc, handleImgError])

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
