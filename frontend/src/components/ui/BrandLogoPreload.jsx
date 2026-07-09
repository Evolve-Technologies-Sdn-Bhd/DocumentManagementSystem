import { useEffect, useMemo } from 'react'
import { normalizeAppPath } from '../../utils/normalizeUrl'

export default function BrandLogoPreload({ src }) {
  const normalizedSrc = useMemo(() => normalizeAppPath(src), [src])

  useEffect(() => {
    if (!normalizedSrc || typeof document === 'undefined') return undefined

    const selector = `link[rel="preload"][as="image"][href="${normalizedSrc}"]`
    let link = document.head.querySelector(selector)
    let created = false

    if (!link) {
      link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = normalizedSrc
      document.head.appendChild(link)
      created = true
    }

    return () => {
      if (created && link?.parentNode) {
        link.parentNode.removeChild(link)
      }
    }
  }, [normalizedSrc])

  return null
}
