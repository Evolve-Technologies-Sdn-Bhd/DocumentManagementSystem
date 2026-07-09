import React from 'react'
import { Link } from 'react-router-dom'
import BrandLogoImage from '../ui/BrandLogoImage'

export default function AppTopbarBrand({
  logo,
  logoPlaceholder,
  companyName,
  appLabel,
  compact = false
}) {
  return (
    <Link
      to="/dashboard"
      className="group flex min-w-0 items-center gap-3 rounded-2xl px-1.5 py-1 transition-colors hover:bg-topbar-surfaceHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dms-color-accent)]"
      aria-label="Go to dashboard"
    >
      {logo ? (
        <div className="inline-flex items-center rounded-xl border border-topbar-border bg-surface px-2 py-1.5 shadow-dms-soft">
          <BrandLogoImage
            src={logo}
            placeholderSrc={logoPlaceholder}
            alt="Company Logo"
            className="block h-auto max-h-8 w-auto max-w-[120px] object-contain sm:max-w-[168px]"
          />
        </div>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-topbar-border bg-surface text-sm font-bold text-brand shadow-dms-soft">
          {String(companyName || 'FN').substring(0, 2).toUpperCase()}
        </div>
      )}

      {!compact && (
        <div className="hidden min-w-0 md:flex md:flex-col">
          <span className="truncate text-sm font-semibold text-ink-inverse">{companyName}</span>
          <span className="text-xs text-ink-meta">{appLabel}</span>
        </div>
      )}
    </Link>
  )
}
