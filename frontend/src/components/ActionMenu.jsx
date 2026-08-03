import React, { useState, useRef, useEffect } from 'react'
import * as ReactDOM from 'react-dom'

/**
 * ActionMenu Component
 * A reusable dropdown menu with 3-dot icon for table actions
 * 
 * @param {Array} actions - Array of action objects with shape:
 *   { label: string, onClick: function, variant: 'default'|'destructive', dividerAfter: boolean }
 */
export default function ActionMenu({ actions, dataTourId }) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, placement: 'bottom' })
  const buttonRef = useRef(null)
  const dropdownRef = useRef(null)
  const actionCount = Array.isArray(actions) ? actions.length : 0

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth
      const dropdownWidth = 192 // w-48 = 12rem = 192px
      const estimatedDropdownHeight = actionCount * 42 // Estimate based on button height
      
      const spaceBelow = viewportHeight - buttonRect.bottom
      const spaceAbove = buttonRect.top
      const spaceRight = viewportWidth - buttonRect.right

      // Determine vertical placement
      let top
      let placement = 'bottom'
      if (spaceBelow < estimatedDropdownHeight + 10 && spaceAbove > estimatedDropdownHeight) {
        // Show above
        top = buttonRect.top - estimatedDropdownHeight - 8
        placement = 'top'
      } else {
        // Show below
        top = buttonRect.bottom + 8
      }

      // Determine horizontal placement
      let left
      if (spaceRight < dropdownWidth) {
        // Align to right edge if not enough space
        left = buttonRect.right - dropdownWidth
      } else {
        // Default: align right edge of dropdown with right edge of button
        left = buttonRect.right - dropdownWidth
      }

      setDropdownPosition({ top, left, placement })
    }
  }, [isOpen, actionCount])

  // Keep hook order stable even when the menu has no actions.
  if (actionCount === 0) {
    return null
  }

  const dropdown = isOpen && (
    <>
      <div 
        className="fixed inset-0 z-[70]" 
        onClick={() => setIsOpen(false)} 
      />
      <div 
        ref={dropdownRef}
        className="fixed w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-[71]"
        style={{
          top: `${dropdownPosition.top}px`,
          left: `${dropdownPosition.left}px`
        }}
      >
        {actions.map((action, index) => (
          <React.Fragment key={action.label}>
            <button
              onClick={() => { 
                action.onClick()
                setIsOpen(false) 
              }}
              className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors first:rounded-t-lg last:rounded-b-lg ${
                action.variant === 'destructive'
                  ? 'hover:bg-red-50 text-red-600'
                  : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              {action.label}
            </button>
            {action.dividerAfter && <div className="border-t border-gray-200" />}
          </React.Fragment>
        ))}
      </div>
    </>
  )

  const renderedDropdown =
    typeof document !== 'undefined' && isOpen && ReactDOM?.createPortal && document.body
      ? ReactDOM.createPortal(dropdown, document.body)
      : dropdown

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          data-tour-id={dataTourId}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>
      {renderedDropdown}
    </>
  )
}
