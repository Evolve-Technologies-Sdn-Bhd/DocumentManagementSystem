import React, { useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
    if (!normalizedSrc) {
      setDisplaySrc(null)
      setLoadedFull(true)
      return
    }

    if (!normalizedPlaceholder || normalizedPlaceholder === normalizedSrc) {
      setDisplaySrc(normalizedSrc)
      setLoadedFull(true)
      return
    }

    setDisplaySrc(normalizedPlaceholder)
    setLoadedFull(false)

    const image = new Image()
    image.onload = () => {
      setDisplaySrc(normalizedSrc)
      setLoadedFull(true)
    }
    image.onerror = () => {
      setDisplaySrc(normalizedSrc)
      setLoadedFull(true)
    }
    image.src = normalizedSrc

    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [normalizedPlaceholder, normalizedSrc])

  if (!displaySrc) return null

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      loading="eager"
      decoding="async"
      fetchPriority="high"
      style={{
        ...style,
        transition: 'filter 180ms ease, opacity 180ms ease',
        filter: loadedFull ? 'none' : 'blur(0.5px)',
        opacity: loadedFull ? 1 : 0.94
      }}
    />
  )
}
