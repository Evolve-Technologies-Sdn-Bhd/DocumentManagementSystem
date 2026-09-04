import React from 'react'

export default function TextInput({
  className = '',
  invalid = false,
  ...props
}) {
  const classes = [
    'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366] outline-none bg-white text-sm text-gray-900 placeholder:text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-200 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-300',
    invalid ? 'border-red-300 focus:ring-red-200/80 focus:border-red-500' : 'border-gray-300',
    className
  ].filter(Boolean).join(' ')

  return <input className={classes} {...props} />
}

