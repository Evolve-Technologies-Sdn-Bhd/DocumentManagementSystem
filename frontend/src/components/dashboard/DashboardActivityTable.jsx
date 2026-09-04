import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import AppSurface from '../ui/AppSurface'
import SectionHeader from '../ui/SectionHeader'
import ColumnSettingsButton from '../ui/ColumnSettingsButton'
import EmptyPanelState from '../ui/EmptyPanelState'
import { normalizeAppPath } from '../../utils/normalizeUrl'
import { TableContainer, Table, Th, Td, Tr } from '../ui/Table'
import useTableFeatures from '../../hooks/useTableFeatures'

function Avatar({ name, profileImage }) {
  const safeName = String(name || 'User').trim()
  const names = safeName.split(' ').filter(Boolean)
  const initials = names.length >= 2
    ? `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
    : safeName.substring(0, 2).toUpperCase()

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-secondary to-brand text-sm font-semibold text-ink-inverse shadow-dms-soft">
      {profileImage ? (
        <img src={normalizeAppPath(profileImage)} alt={safeName} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </div>
  )
}

export default function DashboardActivityTable({
  title,
  subtitle,
  recent,
  formatRelativeTime,
  viewAllLabel,
  columns,
  viewAllTo = '/logs',
  emptyTitle,
  emptyDescription
}) {
  const [dragColIndex, setDragColIndex] = useState(null)
  const [dragOverColIndex, setDragOverColIndex] = useState(null)

  const activityColumns = useMemo(() => [
    {
      id: 'userDocument',
      key: 'userDocument',
      accessor: 'userDocument',
      label: columns?.userDocument || 'User / Document',
      sortable: true,
      required: true,
      render: (_v, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.user} profileImage={row.profileImage} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink">{row.user}</div>
            <div className="truncate text-xs text-brand">{row.document}</div>
          </div>
        </div>
      )
    },
    {
      id: 'action',
      key: 'action',
      accessor: 'action',
      label: columns?.action || 'Action',
      sortable: true,
      render: (value) => <span className="text-sm text-ink-secondary">{value}</span>
    },
    {
      id: 'time',
      key: 'time',
      accessor: 'time',
      label: columns?.time || 'Time',
      sortable: true,
      required: true,
      align: 'right',
      sortType: 'date',
      sortComparer: (a, b, aRow, bRow) => {
        const aTime = aRow.updatedAt || aRow.when || 0
        const bTime = bRow.updatedAt || bRow.when || 0
        return new Date(aTime || 0) - new Date(bTime || 0)
      },
      render: (_v, row) => (
        <span className="whitespace-nowrap text-xs text-ink-muted">
          {row.updatedAt ? formatRelativeTime(row.updatedAt) : row.when}
        </span>
      )
    }
  ], [columns, formatRelativeTime])

  const tableFeatures = useTableFeatures({
    tableId: 'dashboard-activity-table',
    columns: activityColumns,
    data: recent,
    defaultSortKey: 'time',
    defaultSortDirection: 'desc'
  })

  const {
    sortedData,
    visibleColumns,
    orderedColumns,
    getSortDirectionFor,
    toggleSort,
    moveColumn,
    hiddenColumns,
    toggleColumnVisibility,
    resetTableSettings
  } = tableFeatures

  const handleColDragStart = (idx, e) => {
    const col = visibleColumns[idx]
    if (!col || col.stickyRight) { e.preventDefault(); return }
    setDragColIndex(idx)
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)) } catch {}
  }
  const handleColDragOver = (idx, e) => {
    e.preventDefault()
    const col = visibleColumns[idx]
    if (!col || col.stickyRight) return
    setDragOverColIndex(idx)
  }
  const handleColDragLeave = () => setDragOverColIndex(null)
  const handleColDrop = (toIdx, e) => {
    e.preventDefault()
    const fromIdx = dragColIndex
    setDragColIndex(null)
    setDragOverColIndex(null)
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return
    const fromId = visibleColumns[fromIdx]?.id
    const toId = visibleColumns[toIdx]?.id
    if (!fromId || !toId) return
    const globalFrom = orderedColumns.findIndex((c) => c.id === fromId)
    const globalTo = orderedColumns.findIndex((c) => c.id === toId)
    if (globalFrom >= 0 && globalTo >= 0) moveColumn(globalFrom, globalTo)
  }
  const handleColDragEnd = () => { setDragColIndex(null); setDragOverColIndex(null) }

  return (
    <AppSurface padding="lg" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <SectionHeader title={title} subtitle={subtitle} />
        {recent.length > 0 && (
          <ColumnSettingsButton
            orderedColumns={orderedColumns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={toggleColumnVisibility}
            onReset={resetTableSettings}
          />
        )}
      </div>

      {recent.length > 0 ? (
        <>
          <div className="hidden md:block">
            <TableContainer>
              <Table>
                <thead>
                  <Tr>
                    {visibleColumns.map((col, idx) => {
                      const id = col.id || col.key
                      const canDrag = !col.stickyRight
                      const isDragOver = canDrag && dragOverColIndex === idx
                      return (
                        <Th
                          key={id}
                          align={col.align || 'left'}
                          stickyRight={col.stickyRight || false}
                          sortable={Boolean(col.sortable)}
                          sortDirection={getSortDirectionFor(id)}
                          sortKey={id}
                          onSort={col.sortable ? toggleSort : undefined}
                          draggable={canDrag}
                          dragOver={isDragOver}
                          onDragStart={(e) => handleColDragStart(idx, e)}
                          onDragOver={(e) => handleColDragOver(idx, e)}
                          onDragLeave={handleColDragLeave}
                          onDrop={(e) => handleColDrop(idx, e)}
                          onDragEnd={handleColDragEnd}
                          title={canDrag ? 'Click to sort • Drag to reorder' : col.sortable ? 'Click to sort' : undefined}
                        >
                          {col.label || col.header || id}
                        </Th>
                      )
                    })}
                  </Tr>
                </thead>
                <tbody>
                  {sortedData.map((item, index) => (
                    <Tr key={index} className="hover:bg-surface-muted">
                      {visibleColumns.map((col) => {
                        const id = col.id || col.key || col.accessor
                        const accessor = col.accessor || id
                        let value
                        if (typeof accessor === 'function') {
                          value = accessor(item, col)
                        } else if (accessor === '__actions') {
                          value = null
                        } else {
                          value = item?.[accessor]
                        }
                        const content = typeof col.render === 'function' ? col.render(value, item) : (value != null ? value : '')
                        return (
                          <Td
                            key={id}
                            align={col.align || 'left'}
                            stickyRight={col.stickyRight || false}
                            className={col.stickyRight ? 'py-3' : ''}
                          >
                            {content}
                          </Td>
                        )
                      })}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          </div>

          <div className="space-y-3 md:hidden">
            {sortedData.map((item, index) => (
              <div key={index} className="rounded-2xl border border-border bg-surface-muted p-3">
                <div className="flex items-start gap-3">
                  <Avatar name={item.user} profileImage={item.profileImage} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{item.user}</div>
                        <div className="truncate text-xs text-brand">{item.document}</div>
                      </div>
                      <div className="shrink-0 text-[11px] text-ink-muted">
                        {item.updatedAt ? formatRelativeTime(item.updatedAt) : item.when}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-ink-secondary">{item.action}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-4 text-center">
            <Link className="text-sm font-medium text-brand transition-colors hover:text-brand-hover hover:underline" to={viewAllTo}>
              {viewAllLabel} →
            </Link>
          </div>
        </>
      ) : (
        <EmptyPanelState
          title={emptyTitle}
          description={emptyDescription}
        />
      )}
    </AppSurface>
  )
}
