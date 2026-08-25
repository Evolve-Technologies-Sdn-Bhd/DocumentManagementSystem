import React from 'react'

export default function TextArea({
  className = '',
  invalid = false,
  ...props
}) {
  const classes = [
    'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-sm text-gray-900 placeholder:text-gray-400',
    invalid ? 'border-red-300 focus:ring-red-200/80 focus:border-red-500' : 'border-gray-300',
    className
  ].filter(Boolean).join(' ')

  return <textarea className={classes} {...props} />
}

