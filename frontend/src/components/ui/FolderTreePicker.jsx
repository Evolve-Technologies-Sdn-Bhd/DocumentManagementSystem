import React, { useEffect, useMemo, useState } from 'react'
import TextInput from './TextInput'

const normalizeFolderId = (value) => String(value ?? '').trim()

const splitPathSegments = (folder) => {
  if (Array.isArray(folder?.fullPath) && folder.fullPath.length > 0) {
    return folder.fullPath.map((part) => String(part || '').trim()).filter(Boolean)
  }

  const rawPath = String(folder?.path || folder?.name || '')
  return rawPath
    .split('›')
    .map((part) => part.trim())
    .filter(Boolean)
}

const buildTreeFromFlatFolders = (folders) => {
  const root = []
  const nodeMap = new Map()

  ;(Array.isArray(folders) ? folders : []).forEach((folder) => {
    const folderId = normalizeFolderId(folder?.id)
    if (!folderId) return

    const pathSegments = splitPathSegments(folder)
    if (pathSegments.length === 0) return

    let currentLevel = root
    let currentPath = []

    pathSegments.forEach((segment, index) => {
      currentPath = [...currentPath, segment]
      const nodeKey = currentPath.join(' / ')
      let node = nodeMap.get(nodeKey)

      if (!node) {
        node = {
          key: nodeKey,
          id: '',
          name: segment,
          icon: index === 0 ? '📁' : '📂',
          fullPathLabel: nodeKey,
          pathSegments: [...currentPath],
          selectable: false,
          meta: null,
          children: []
        }
        nodeMap.set(nodeKey, node)
        currentLevel.push(node)
      }

      if (index === pathSegments.length - 1) {
        node.id = folderId
        node.selectable = true
        node.icon = folder?.icon || (index === 0 ? '📁' : '📂')
        node.meta = folder
      }

      currentLevel = node.children
    })
  })

  return root
}

const buildTreeFromNestedFolders = (folders, parentPath = []) => {
  return (folders || []).map((folder, index) => {
    const name = String(folder?.name || '').trim()
    const pathSegments = [...parentPath, name].filter(Boolean)
    return {
      key: `${normalizeFolderId(folder?.id) || pathSegments.join(' / ')}-${index}`,
      id: normalizeFolderId(folder?.id),
      name,
      icon: folder?.icon || (parentPath.length === 0 ? '📁' : '📂'),
      fullPathLabel: pathSegments.join(' / '),
      pathSegments,
      selectable: true,
      meta: folder,
      children: buildTreeFromNestedFolders(folder?.children || [], pathSegments)
    }
  })
}

const filterNodes = (nodes, query) => {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  return (nodes || []).reduce((acc, node) => {
    const children = filterNodes(node.children, normalizedQuery)
    const matchesQuery = !normalizedQuery || node.fullPathLabel.toLowerCase().includes(normalizedQuery)

    if (matchesQuery || children.length > 0) {
      acc.push({
        ...node,
        children
      })
    }

    return acc
  }, [])
}

function FolderTreePickerItem({
  node,
  level,
  forceExpanded,
  expandedKeys,
  selectedId,
  onToggle,
  onSelect
}) {
  const hasChildren = (node.children || []).length > 0
  const isExpanded = forceExpanded || expandedKeys.includes(node.key)
  const isSelected = normalizeFolderId(selectedId) === normalizeFolderId(node.id)

  const handleSelect = () => {
    if (node.selectable && node.id) {
      onSelect(node)
    }

    if (hasChildren && !forceExpanded) {
      onToggle(node.key)
    }
  }

  return (
    <div key={node.key}>
      <div
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
          isSelected
            ? 'bg-brand/10 text-brand ring-1 ring-brand/20'
            : node.selectable
              ? 'cursor-pointer text-ink hover:bg-surface-muted'
              : 'text-ink-soft'
        }`}
        style={{ paddingLeft: `${12 + level * 18}px` }}
        onClick={handleSelect}
      >
        <span className="text-base leading-none">{node.icon || (level === 0 ? '📁' : '📂')}</span>
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {!node.selectable && (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-soft">
            Parent
          </span>
        )}
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!forceExpanded) onToggle(node.key)
            }}
            disabled={forceExpanded}
            className="rounded-full p-1 text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:cursor-default disabled:opacity-40"
            aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
          >
            <svg
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <FolderTreePickerItem
              key={child.key}
              node={child}
              level={level + 1}
              forceExpanded={forceExpanded}
              expandedKeys={expandedKeys}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FolderTreePicker({
  folders = [],
  selectedId = '',
  onSelect,
  searchPlaceholder = 'Search folder name or path',
  selectedLabel = 'Selected folder',
  emptySelectionText = 'Select a folder',
  noResultsText = 'No matching folders found.',
  disabled = false,
  className = '',
  treeClassName = 'max-h-72',
  mode = 'auto'
}) {
  const [query, setQuery] = useState('')
  const [expandedKeys, setExpandedKeys] = useState([])

  const normalizedSelectedId = normalizeFolderId(selectedId)
  const effectiveMode = useMemo(() => {
    if (mode !== 'auto') return mode
    return (folders || []).some((folder) => Array.isArray(folder?.children)) ? 'nested' : 'flat'
  }, [folders, mode])

  const treeNodes = useMemo(() => (
    effectiveMode === 'nested'
      ? buildTreeFromNestedFolders(folders)
      : buildTreeFromFlatFolders(folders)
  ), [effectiveMode, folders])

  const nodeMap = useMemo(() => {
    const map = new Map()
    const visit = (nodes) => {
      ;(nodes || []).forEach((node) => {
        if (node.id) map.set(normalizeFolderId(node.id), node)
        visit(node.children)
      })
    }
    visit(treeNodes)
    return map
  }, [treeNodes])

  const selectedNode = normalizedSelectedId ? (nodeMap.get(normalizedSelectedId) || null) : null
  const filteredNodes = useMemo(() => filterNodes(treeNodes, query), [treeNodes, query])

  useEffect(() => {
    if (!selectedNode) {
      setExpandedKeys([])
      return
    }

    const ancestors = selectedNode.pathSegments
      .slice(0, -1)
      .map((_, index) => {
        const pathKey = selectedNode.pathSegments.slice(0, index + 1).join(' / ')
        if (effectiveMode === 'nested') {
          const match = Array.from(nodeMap.values()).find((node) => node.fullPathLabel === pathKey)
          return match?.key || pathKey
        }
        return pathKey
      })
      .filter(Boolean)

    setExpandedKeys(ancestors)
  }, [effectiveMode, nodeMap, selectedNode])

  const handleToggle = (nodeKey) => {
    setExpandedKeys((prev) => (
      prev.includes(nodeKey)
        ? prev.filter((key) => key !== nodeKey)
        : [...prev, nodeKey]
    ))
  }

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        disabled={disabled}
      />

      {selectedNode ? (
        <div className="rounded-lg border border-border bg-surface-muted px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">{selectedLabel}</div>
          <div className="mt-1 text-sm font-medium text-ink">{selectedNode.name}</div>
          <div className="mt-1 text-xs text-ink-secondary break-words">{selectedNode.fullPathLabel}</div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-ink-soft">
          {emptySelectionText}
        </div>
      )}

      <div className={`${treeClassName} overflow-y-auto rounded-lg border border-border bg-surface p-2 space-y-1`}>
        {filteredNodes.length > 0 ? (
          filteredNodes.map((node) => (
            <FolderTreePickerItem
              key={node.key}
              node={node}
              level={0}
              forceExpanded={Boolean(String(query || '').trim())}
              expandedKeys={expandedKeys}
              selectedId={normalizedSelectedId}
              onToggle={handleToggle}
              onSelect={(selectedNodeValue) => onSelect?.(selectedNodeValue.id, selectedNodeValue)}
            />
          ))
        ) : (
          <div className="px-3 py-4 text-sm text-ink-soft">{noResultsText}</div>
        )}
      </div>
    </div>
  )
}
