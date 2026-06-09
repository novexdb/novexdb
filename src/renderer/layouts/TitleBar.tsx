import { useState, type ReactNode } from 'react'
import {
  ChevronDown,
  Copy,
  Moon,
  PanelBottom,
  PanelLeft,
  Server,
  Settings,
  Sun
} from 'lucide-react'
import { ipc } from '@renderer/services/ipc'
import { cn } from '@renderer/utils/cn'
import { IconButton } from '@renderer/components/IconButton'
import { Tooltip } from '@renderer/components/Tooltip'
import { ContextMenu, type ContextMenuEntry } from '@renderer/components/ContextMenu'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { CloneDatabaseModal } from '@renderer/features/explorer/components/CloneDatabaseModal'
import { WindowControls } from '@renderer/layouts/WindowControls'
import appIconUrl from '@renderer/assets/icon-256.png'

function ThemeToggle(): ReactNode {
  const isDark = useUiStore((s) => s.resolvedTheme) === 'dark'
  const updateSettings = useSettingsStore((s) => s.update)

  return (
    <IconButton
      label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => void updateSettings({ theme: isDark ? 'light' : 'dark' })}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </IconButton>
  )
}

/** Toggles for the collapsible layout panels, mirroring VS Code's panel controls. */
function PanelToggles(): ReactNode {
  const leftCollapsed = useUiStore((s) => s.leftPanelCollapsed)
  const toggleLeft = useUiStore((s) => s.toggleLeftPanel)
  const railCollapsed = useUiStore((s) => s.connectionRailCollapsed)
  const toggleRail = useUiStore((s) => s.toggleConnectionRail)
  const bottomCollapsed = useUiStore((s) => s.resultPanelCollapsed)
  const toggleBottom = useUiStore((s) => s.toggleResultPanel)

  return (
    <>
      <IconButton
        label={railCollapsed ? 'Show connections' : 'Hide connections'}
        onClick={toggleRail}
      >
        <Server className={cn('h-4 w-4', railCollapsed ? 'text-subtle' : 'text-accent')} />
      </IconButton>
      <IconButton label={leftCollapsed ? 'Show sidebar' : 'Hide sidebar'} onClick={toggleLeft}>
        <PanelLeft className={cn('h-4 w-4', leftCollapsed ? 'text-subtle' : 'text-accent')} />
      </IconButton>
      <IconButton
        label={bottomCollapsed ? 'Show bottom panel' : 'Hide bottom panel'}
        onClick={toggleBottom}
      >
        <PanelBottom className={cn('h-4 w-4', bottomCollapsed ? 'text-subtle' : 'text-accent')} />
      </IconButton>
    </>
  )
}

/** The frameless custom title bar — draggable, with a connection chip and chrome. */
export function TitleBar(): ReactNode {
  const isMac = ipc.platform === 'darwin'
  const isFullScreen = useUiStore((s) => s.isFullScreen)
  const activeId = useConnectionStore((s) => s.activeConnectionId)
  const active = useConnectionStore((s) => s.connections.find((c) => c.id === activeId) ?? null)
  const isConnected = useConnectionStore((s) =>
    activeId ? s.statuses[activeId] === 'connected' : false
  )
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [cloneOpen, setCloneOpen] = useState(false)

  const chipMenuItems: ContextMenuEntry[] = [
    {
      id: 'clone-db',
      label: 'Clone database…',
      icon: <Copy className="h-3.5 w-3.5" />,
      onSelect: () => setCloneOpen(true)
    }
  ]

  return (
    <header className="drag-region flex h-9 shrink-0 items-center border-b border-line bg-surface">
      {/* Reserve the macOS traffic-light area in windowed mode; in fullscreen
          macOS hides the buttons, so the brand can sit fully flush-left. */}
      {isMac && !isFullScreen && <div className="w-[78px] shrink-0" />}

      <div className="flex min-w-0 items-center gap-2 pr-3">
        {/* App icon — hovering reveals the "NovexDB" name popover. The
            text label that used to live next to the icon is gone; the
            icon itself is the brand mark in this row now. */}
        <Tooltip label="NovexDB">
          <img
            src={appIconUrl}
            alt="NovexDB"
            width={20}
            height={20}
            draggable={false}
            className="no-drag h-5 w-5 shrink-0 select-none rounded-[5px]"
          />
        </Tooltip>
        {active && (
          <button
            type="button"
            disabled={!isConnected}
            onClick={() => useUiStore.getState().openDatabasePicker()}
            onContextMenu={(event) => {
              if (!isConnected) return
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY })
            }}
            title={isConnected ? 'Open database' : undefined}
            className={cn(
              'no-drag flex items-center gap-1.5 rounded-full bg-app px-2 py-0.5 transition-colors',
              isConnected ? 'hover:bg-elevated' : 'cursor-default'
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: active.color }} />
            <span className="text-[11px] text-muted">{active.name}</span>
            <span className="text-[11px] text-subtle">/</span>
            <span className="text-[11px] text-content">{active.database}</span>
            {isConnected && <ChevronDown className="h-3 w-3 text-subtle" />}
          </button>
        )}
      </div>

      <div className="flex-1" />

      <div className="no-drag flex items-center gap-0.5 px-1.5">
        <PanelToggles />
        <span className="mx-0.5 h-4 w-px bg-line" />
        <ThemeToggle />
        <IconButton label="Settings" onClick={() => useUiStore.getState().openSettings()}>
          <Settings className="h-4 w-4" />
        </IconButton>
      </div>

      {!isMac && <WindowControls />}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={chipMenuItems} onClose={() => setMenu(null)} />
      )}
      {cloneOpen && activeId && (
        <CloneDatabaseModal connectionId={activeId} onClose={() => setCloneOpen(false)} />
      )}
    </header>
  )
}
