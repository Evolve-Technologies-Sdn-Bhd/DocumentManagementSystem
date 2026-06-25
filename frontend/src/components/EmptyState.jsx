import React from 'react'
import Button from './ui/Button'

export default function EmptyState({ 
  message = 'No documents found', 
  description = null,
  actionLabel = null,
  onAction = null 
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {/* Document Icon */}
      <div className="w-24 h-24 mb-4 text-ink-soft">
        <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM18 20H6V4H13V9H18V20Z"/>
          <path d="M9 13H15V15H9V13Z" opacity="0.5"/>
          <path d="M9 16H15V18H9V16Z" opacity="0.3"/>
        </svg>
      </div>
      
      {/* Message */}
      <h3 className="text-lg font-medium text-ink mb-1">{message}</h3>
      
      {/* Description */}
      {description && (
        <p className="text-sm text-ink-secondary text-center max-w-sm mb-4">
          {description}
        </p>
      )}
      
      {/* Action Button */}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
