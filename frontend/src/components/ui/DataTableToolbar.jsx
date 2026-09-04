import React from 'react'

export default function DataTableToolbar({
  children,
  left = null,
  right = null,
  rightSlot = null,
  className = '',
  paddingClassName = 'px-6 py-3',
  gap = 'gap-3',
  borderTop = false,
}) {
  const leftContent = left !== null ? left : children
  const rightContent = right !== null ? right : rightSlot

  return (
    <div
      className={[
        'flex w-full items-center',
        borderTop ? 'border-t border-gray-200' : 'border-b border-gray-200',
        'bg-gray-50/40',
        paddingClassName,
        gap,
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="flex items-center gap-3 flex-1 w-full">
        {leftContent}
      </div>
      {rightContent !== null && (
        <div className="flex items-center shrink-0 gap-2 ml-auto">
          {rightContent}
        </div>
      )}
    </div>
  )
}
