import React from 'react'
import { getCategoryStyle, formatTime24, isSameDay } from '../../utils/calendarUtils'

const getAssigneeLabel = (u) => {
  if (!u) return ''
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || ''
}

export default function CalendarEventBlock({
  event,
  size = 'md',
  onOpen,
  onEventClick,
  showTime = true
}) {
  const style = getCategoryStyle(event.category)
  const compact = size === 'sm'
  const extraCompact = size === 'xs'
  const onClick = (e) => {
    e.stopPropagation()
    if (onEventClick) onEventClick(event, e.currentTarget)
    else if (onOpen) onOpen(event)
  }

  const titleText = event.title || 'Untitled'
  const truncateClass = (compact || extraCompact) ? 'line-clamp-1' : 'line-clamp-2'

  const isMultiDay = event.endDateTime && !isSameDay(event.startDateTime, event.endDateTime)

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick && onClick(e)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      title={titleText + (event.description ? ' - ' + event.description : '')}
      className={[
        'group w-full cursor-pointer text-left rounded-md border border-transparent transition-all duration-150',
        extraCompact ? '' : 'hover:shadow-[0_4px_12px_rgba(15,23,42,0.12)] hover:-translate-y-0.5',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dms-color-brand-primary)]/50',
        style.bg, style.ink, style.ring,
        extraCompact ? 'px-1 py-px' : compact ? 'px-1.5 py-0.5' : 'px-2 py-1.5'
      ].filter(Boolean).join(' ')}
    >
      <div className="flex items-start gap-1 min-w-0">
        <span className={['mt-[3px] shrink-0 rounded-full', style.dot, extraCompact ? 'h-1 w-1' : compact ? 'h-1.5 w-1.5' : 'h-2 w-2'].join(' ')} />
        <div className="min-w-0 flex-1">
          <div className={[extraCompact ? 'text-[9px]' : 'text-[11px]', 'font-semibold leading-tight', truncateClass].join(' ')}>
            {titleText}
          </div>
          {!compact && !extraCompact && showTime && (
            <div className="mt-0.5 text-[10px] opacity-80 leading-tight line-clamp-1">
              {event.isAllDay && !isMultiDay
                ? 'All day'
                : isMultiDay
                  ? 'Multi-day'
                  : formatTime24(event.startDateTime)}
              {event.assignee ? ' · ' + getAssigneeLabel(event.assignee) : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
