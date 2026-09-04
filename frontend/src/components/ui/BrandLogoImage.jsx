import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeAppPath } from '../../utils/normalizeUrl'

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

  const handleImgError = useCallback(() => {
    if (normalizedPlaceholder && normalizedPlaceholder !== displaySrc) {
      setDisplaySrc(normalizedPlaceholder)
    } else {
      setDisplaySrc(null)
    }
    setLoadedFull(true)
  }, [normalizedPlaceholder, displaySrc])

  useEffect(() => {
    if (!normalizedSrc) {
      setDisplaySrc(null)
      setLoadedFull(true)
      return
    }

    if (!normalizedPlaceholder || normalizedPlaceholder === normalizedSrc) {
      setDisplaySrc(normalizedSrc)
      setLoadedFull(false)
      const image = new Image()
      image.onload = () => setLoadedFull(true)
      image.onerror = handleImgError
      image.src = normalizedSrc
      return () => {
        image.onload = null
        image.onerror = null
      }
    }

    setDisplaySrc(normalizedPlaceholder)
    setLoadedFull(false)

    const image = new Image()
    image.onload = () => {
      setDisplaySrc(normalizedSrc)
      setLoadedFull(true)
    }
    image.onerror = handleImgError
    image.src = normalizedSrc

    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [normalizedPlaceholder, normalizedSrc, handleImgError])

  if (!displaySrc) return null

  return (
    <img
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
