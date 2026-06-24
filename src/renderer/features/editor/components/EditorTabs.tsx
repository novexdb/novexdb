import { useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import {
  FileCode2,
  ListChecks,
  Plus,
  ScanSearch,
  Sparkles,
  Table2,
  X,
  XSquare
} from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { IconButton } from '@renderer/components/IconButton'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'

/** Tracks which side of the hovered tab the dragged tab will land on. */
interface DragOver {
  id: string
  side: 'before' | 'after'
}

/** The query-editor tab strip — create, switch, close and reorder tabs via drag-and-drop. */
export function EditorTabs(): ReactNode {
  const tabs = useEditorStore((s) => s.tabs)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const closeTab = useEditorStore((s) => s.closeTab)
  const closeAllTabs = useEditorStore((s) => s.closeAllTabs)
  const createTab = useEditorStore((s) => s.createTab)
  const reorderTab = useEditorStore((s) => s.reorderTab)
  const promoteTab = useEditorStore((s) => s.promoteTab)

  // The id of the tab currently being dragged, and the would-be drop target.
  // Both are cleared on dragend / drop.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<DragOver | null>(null)

  const handleDragStart = (event: DragEvent<HTMLDivElement>, id: string): void => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    // Dragging a preview tab pins it, matching VS Code.
    promoteTab(id)
    setDragId(id)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>, id: string): void => {
    if (!dragId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    const side: DragOver['side'] =
      event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
    if (dragOver?.id !== id || dragOver.side !== side) setDragOver({ id, side })
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, id: string): void => {
    event.preventDefault()
    const fromId = event.dataTransfer.getData('text/plain') || dragId
    if (fromId && fromId !== id) {
      reorderTab(fromId, id, dragOver?.id === id ? dragOver.side : 'before')
    }
    setDragId(null)
    setDragOver(null)
  }

  const handleDragEnd = (): void => {
    setDragId(null)
    setDragOver(null)
  }

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-line bg-surface">
      <div className="flex h-full min-w-0 flex-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          const isDragging = dragId === tab.id
          const isPreview = tab.kind === 'table' && tab.preview === true
          const indicator =
            dragOver?.id === tab.id && dragId !== tab.id ? dragOver.side : null
          const TabIcon =
            tab.kind === 'table'
              ? Table2
              : tab.kind === 'overview'
                ? ListChecks
                : tab.kind === 'intelligence'
                  ? Sparkles
                  : tab.kind === 'anomalies'
                    ? ScanSearch
                    : FileCode2
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              draggable
              onDragStart={(event) => handleDragStart(event, tab.id)}
              onDragOver={(event) => handleDragOver(event, tab.id)}
              onDragLeave={() => {
                // Only clear the indicator if it was ours — sibling DragOver
                // events can race the leave, so we guard by id.
                if (dragOver?.id === tab.id) setDragOver(null)
              }}
              onDrop={(event) => handleDrop(event, tab.id)}
              onDragEnd={handleDragEnd}
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={() => promoteTab(tab.id)}
              className={cn(
                'group relative flex h-full min-w-0 items-center gap-1.5 border-r border-line px-3 transition-opacity',
                active ? 'bg-app text-content' : 'text-muted hover:text-content',
                isDragging ? 'cursor-grabbing opacity-40' : 'cursor-pointer'
              )}
            >
              {indicator === 'before' && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-accent shadow-[0_0_8px_rgba(122,162,255,0.8)]"
                />
              )}
              {indicator === 'after' && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-0 w-0.5 bg-accent shadow-[0_0_8px_rgba(122,162,255,0.8)]"
                />
              )}
              <TabIcon
                className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-accent' : 'text-subtle')}
              />
              <span
                className={cn('max-w-[140px] truncate text-xs', isPreview && 'italic')}
              >
                {tab.title}
              </span>
              <button
                type="button"
                aria-label={`Close ${tab.title}`}
                draggable={false}
                onMouseDown={(event: MouseEvent) => event.stopPropagation()}
                onClick={(event: MouseEvent) => {
                  event.stopPropagation()
                  closeTab(tab.id)
                }}
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded',
                  'text-subtle hover:bg-line hover:text-content',
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                )}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>
      <IconButton
        label="New query tab"
        className="ml-1 h-6 w-6 shrink-0"
        onClick={() => createTab()}
      >
        <Plus className="h-4 w-4" />
      </IconButton>
      <IconButton
        label="Close all tabs"
        className="mx-1 h-6 w-6 shrink-0"
        onClick={() => closeAllTabs()}
      >
        <XSquare className="h-4 w-4" />
      </IconButton>
    </div>
  )
}
