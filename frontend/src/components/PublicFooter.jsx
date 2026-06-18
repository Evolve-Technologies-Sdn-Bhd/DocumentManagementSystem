import React, { useEffect, useMemo, useState } from 'react'
import MarkdownRenderer from './MarkdownRenderer'
import { readLandingPageSettings, subscribeLandingPageSettings } from '../utils/branding'

export default function PublicFooter({ copyrightText, footerLinks, onPdfLinkClick }) {
  const [stored, setStored] = useState(() => readLandingPageSettings())

  useEffect(() => {
    setStored(readLandingPageSettings())
    return subscribeLandingPageSettings((next) => setStored(next))
  }, [])

  const resolvedCopyright = copyrightText ?? stored?.copyrightText ?? '© 2025 CLB Groups. All rights reserved.'
  const resolvedLinks = useMemo(() => {
    const list = footerLinks ?? stored?.footerLinks ?? []
    const arr = Array.isArray(list) ? list : []
    return arr.filter((l) => {
      const label = String(l?.label || '').toLowerCase()
      const href = String(l?.href || '').toLowerCase()
      return !(label.includes('contact') || href.includes('#contact') || href.endsWith('/contact'))
    })
  }, [footerLinks, stored])

  const onLinkClick = (link) => {
    if (typeof onPdfLinkClick === 'function') {
      onPdfLinkClick(link)
      return
    }
    if (link?.pdf) {
      window.open(link.pdf, '_blank', 'noopener,noreferrer')
      return
    }
    if (typeof link?.href === 'string' && link.href) {
      window.open(link.href, '_blank', 'noopener,noreferrer')
      return
    }
  }

  return (
    <footer className="fixed bottom-0 inset-x-0 z-40 bg-[color:var(--dms-primary)] text-white border-t border-white/15">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 h-11">
          <p className="text-white/95 text-xs leading-tight truncate max-w-[55%] sm:max-w-none">
            <MarkdownRenderer inline value={resolvedCopyright} />
          </p>

          <div className="flex items-center gap-2 shrink-0">
            {resolvedLinks.slice(0, 3).map((link, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onLinkClick(link)}
                className={`${idx >= 2 ? 'hidden md:inline' : 'inline'} text-xs text-white/95 hover:text-white transition-colors max-w-[6.5rem] sm:max-w-none truncate`}
                disabled={!link?.pdf && !link?.href}
              >
                <MarkdownRenderer inline value={link?.label || ''} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
