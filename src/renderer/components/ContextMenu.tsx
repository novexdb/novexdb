import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@renderer/utils/cn'

/** A single actionable row in a context menu. */
export interface ContextMenuItem {
  id: string
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  /** Right-aligned hint text — e.g. "⌘C" or "⇧⌘C". Purely visual. */
  shortcut?: string
  /** Leaf action — runs on click. Ignored when `submenu` is set. */
  onSelect?: () => void
  /** When set, the row opens a hover flyout instead of acting. */
  submenu?: ContextMenuItem[]
}

/** Either a menu row or a horizontal divider. */
export type ContextMenuEntry = ContextMenuItem | { separator: true }

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
}

/** Rough panel/submenu width used for edge-flip decisions before measuring. */
const PANEL_WIDTH = 184

function isSeparator(entry: ContextMenuEntry): entry is { separator: true } {
  return 'separator' in entry
}

/** One menu surface — the root menu and each submenu flyout render this. */
function MenuPanel({
  items,
  onClose,
  flipSubmenu
}: {
  items: ContextMenuEntry[]
  onClose: () => void
  flipSubmenu: boolean
}): ReactNode {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="min-w-[184px] rounded-md border border-line bg-elevated py-1 shadow-xl">
      {items.map((entry, index) => {
        if (isSeparator(entry)) {
          return <div key={`sep-${index}`} className="my-1 border-t border-line" />
        }

        const item = entry
        const hasSubmenu = Boolean(item.submenu?.length)
        const open = hasSubmenu && openId === item.id

        return (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => setOpenId(hasSubmenu && !item.disabled ? item.id : null)}
          >
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled || hasSubmenu) return
                onClose()
                item.onSelect?.()
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                item.disabled
                  ? 'cursor-default text-subtle/50'
                  : open
                    ? 'bg-surface'
                    : 'hover:bg-surface',
                item.danger && !item.disabled ? 'text-danger' : 'text-content'
              )}
            >
              {item.icon && (
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-subtle">
                  {item.icon}
                </span>
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && !hasSubmenu && (
                <span className="shrink-0 text-subtle">{item.shortcut}</span>
              )}
              {hasSubmenu && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
              )}
            </button>

            {open && item.submenu && (
              <div
                className={cn(
                  'absolute top-0 -mt-1',
                  flipSubmenu ? 'right-full -mr-px pr-1' : 'left-full -ml-px pl-1'
                )}
              >
                <MenuPanel
                  items={item.submenu}
                  onClose={onClose}
                  flipSubmenu={flipSubmenu}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * A portalled, cursor-positioned context menu with one level of hover-flyout
 * submenus. Closes on outside click, right-click, Escape, or window blur.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Keep the menu inside the viewport once its real size is known.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx =
      x + rect.width > window.innerWidth - 8
        ? Math.max(8, window.innerWidth - rect.width - 8)
        : x
    const ny =
      y + rect.height > window.innerHeight - 8
        ? Math.max(8, window.innerHeight - rect.height - 8)
        : y
    setPos({ x: nx, y: ny })
  }, [x, y])

  // Read onClose through a ref so the effect below has a stable [] dependency.
  // The parent typically passes `onClose={() => setMenu(null)}` — a fresh
  // arrow every render — and if the effect re-ran each render it would tear
  // the listeners back down (and clear the pending setTimeout) before they
  // had a chance to attach, leaving the menu un-dismissable.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const close = (): void => onCloseRef.current()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    // Defer the dismiss listeners by a tick: the right-click that opens the
    // menu keeps bubbling to `window`, and without this delay it would hit
    // these listeners and close the menu the instant it appears.
    const timer = window.setTimeout(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
      window.addEventListener('blur', close)
    }, 0)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <MenuPanel
        items={items}
        onClose={onClose}
        flipSubmenu={pos.x + PANEL_WIDTH * 2 > window.innerWidth}
      />
    </div>,
    document.body
  )
}
