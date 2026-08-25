import React from 'react'
import InlineSpinner from './InlineSpinner'

const sizeMap = {
  sm: 'px-4 py-2 text-sm font-medium rounded-lg',
  md: 'px-5 py-2.5 text-sm font-medium rounded-lg',
  lg: 'px-6 py-3 text-sm font-medium rounded-lg'
}

const variantMap = {
  primary: 'bg-[#003366] text-white hover:bg-[#002244] transition-colors',
  secondary: 'bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors',
  danger: 'bg-red-600 text-white hover:bg-red-700 transition-colors'
}

export default function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  loading = false,
  loadingText = null,
  spinnerClassName = '',
  disabled = false,
  ...props
}) {
  const classes = [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366]/30 disabled:cursor-not-allowed disabled:opacity-50',
    sizeMap[size] || sizeMap.md,
    variantMap[variant] || variantMap.primary,
    className
  ].filter(Boolean).join(' ')

  const spinnerVariantClass = variant === 'primary' || variant === 'danger'
    ? 'border-white/30 border-t-white'
    : 'border-gray-300 border-t-[#003366]'

  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading} {...props}>
      {loading ? (
        <>
          <InlineSpinner className={['h-4 w-4 border-2', spinnerVariantClass, spinnerClassName].filter(Boolean).join(' ')} />
          <span>{loadingText || children}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}
