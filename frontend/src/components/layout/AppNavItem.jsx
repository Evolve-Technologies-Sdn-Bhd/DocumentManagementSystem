import React from 'react'
import { Link } from 'react-router-dom'

export default function AppNavItem({
  item,
  active = false,
  collapsed = false,
  onClick,
  isTourTarget = false
}) {
  const showIcon = collapsed || !item.hideIcon
  const stateClasses = active
    ? 'bg-sidebar-active text-sidebar-text shadow-dms-soft'
    : 'text-sidebar-text opacity-90 hover:bg-sidebar-hover hover:opacity-100'

  const baseLinkClasses = collapsed
    ? 'justify-center h-10 px-2'
    : 'relative h-10 rounded-xl pl-0 pr-4'

  return (
    <Link
      to={item.path}
      onClick={onClick}
      data-tour-id={item.tourId}
      title={collapsed ? item.name : undefined}
      className={[
        'group flex items-center rounded-2xl text-[12px] font-medium leading-4 transition-all duration-200 lg:text-[13px]',
        baseLinkClasses,
        stateClasses,
        isTourTarget ? 'ring-2 ring-[var(--dms-color-accent)] animate-pulse' : ''
      ].filter(Boolean).join(' ')}
    >
      {!collapsed && (
        <span className={['absolute left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-brand-secondary transition-opacity', active ? 'opacity-100' : 'opacity-0'].join(' ')} />
      )}
      {!collapsed && showIcon && (
        <span className={['absolute left-5 top-1/2 -translate-y-1/2 shrink-0 transition-transform', active ? 'scale-105' : ''].join(' ')}>
          {item.icon}
        </span>
      )}
      {!collapsed && (
        <span
          className="absolute left-8 right-4 top-1/2 -translate-y-1/2 min-w-0 truncate text-left"
          title={item.name}
        >
          {item.name}
        </span>
      )}
      {collapsed && (
        <>
          {showIcon && <span>{item.icon}</span>}
          <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-lg border border-border bg-surface-strong px-2 py-1 text-xs text-ink opacity-0 translate-x-1 shadow-dms-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
            {item.name}
          </span>
        </>
      )}
    </Link>
  )
}
