import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { ipc } from '@renderer/services/ipc'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useConnections } from '@renderer/features/connections/hooks/useConnections'
import { EngineIcon } from '@renderer/features/connections/components/EngineIcon'
import type { Connection } from '@shared/types/connection'
import type { ConnectionStatus } from '@shared/types/database'

const STATUS_DOT: Record<ConnectionStatus, string> = {
  disconnected: 'bg-subtle',
  connecting: 'bg-warning',
  connected: 'bg-success',
  error: 'bg-danger'
}

interface ContextMenuState {
  x: number
  y: number
  connection: Connection
}

function RailItem({
  connection,
  onContextMenu
}: {
  connection: Connection
  onContextMenu: (event: MouseEvent) => void
}): ReactNode {
  const status = useConnectionStore((s) => s.statuses[connection.id] ?? 'disconnected')
  const isActive = useConnectionStore((s) => s.activeConnectionId === connection.id)
  const setActive = useConnectionStore((s) => s.setActive)
  const { connect } = useConnections()

  const handleClick = (): void => {
    if (status === 'connected') setActive(connection.id)
    else if (status !== 'connecting') void connect(connection.id)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={onContextMenu}
      title={`${connection.name}\n${connection.host}:${connection.port}/${connection.database}`}
      className={cn(
        'relative flex w-full flex-col items-center gap-1 px-1 py-1.5 transition-colors',
        isActive ? 'bg-app' : 'hover:bg-app/50'
      )}
    >
      {isActive && (
        <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />
      )}
      <div className="relative">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: connection.color }}
        >
          <EngineIcon engine={connection.engine} className="h-5 w-5" />
        </div>
        {status === 'connecting' ? (
          <Loader2 className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 animate-spin text-warning" />
        ) : (
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface',
              STATUS_DOT[status]
            )}
          />
        )}
      </div>
      <span className="w-full truncate text-center text-[10px] leading-tight text-muted">
        {connection.name}
      </span>
    </button>
  )
}

function RailContextMenu({
  state,
  onClose
}: {
  state: ContextMenuState
  onClose: () => void
}): ReactNode {
  // Select stable references — a derived selector that filtered + mapped would
  // return a fresh array each call and trip Zustand's "infinite loop" guard.
  const connections = useConnectionStore((s) => s.connections)
  const statuses = useConnectionStore((s) => s.statuses)
  const openEditor = useConnectionStore((s) => s.openEditor)
  const { connect, disconnect, remove } = useConnections()

  const status = statuses[state.connection.id] ?? 'disconnected'
  const otherConnectedIds = connections
    .filter((c) => c.id !== state.connection.id && statuses[c.id] === 'connected')
    .map((c) => c.id)

  useEffect(() => {
    const close = (): void => onClose()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    // Defer the dismiss listeners so the very right-click that opened the menu
    // does not immediately close it via the global handlers.
    const timer = window.setTimeout(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
    }, 0)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const item = (label: string, action: () => void, danger = false): ReactNode => (
    <button
      type="button"
      onClick={() => {
        onClose()
        action()
      }}
      className={cn(
        'w-full px-3 py-1.5 text-left text-xs hover:bg-surface',
        danger ? 'text-danger' : 'text-content'
      )}
    >
      {label}
    </button>
  )

  const separator = (
    <div className="my-1 border-t border-line" aria-hidden="true" />
  )

  const closeOthers = (): void => {
    for (const id of otherConnectedIds) void disconnect(id)
  }

  return (
    <div
      role="menu"
      style={{ left: state.x, top: state.y }}
      className="fixed z-50 min-w-[200px] overflow-hidden rounded-md border border-line bg-elevated py-1 shadow-xl"
    >
      {status === 'connected'
        ? item('Close connection', () => void disconnect(state.connection.id))
        : item('Connect', () => void connect(state.connection.id))}
      {status === 'connected' &&
        otherConnectedIds.length > 0 &&
        item('Close other connections', closeOthers)}
      {separator}
      {item('Move Tab to New Window', () =>
        void ipc.window.openWithConnection(state.connection.id)
      )}
      {separator}
      {item('Edit connection', () => openEditor(state.connection))}
      {item(
        'Delete connection',
        () => {
          if (window.confirm(`Delete connection "${state.connection.name}"?`)) {
            void remove(state.connection.id)
          }
        },
        true
      )}
    </div>
  )
}

/** The far-left rail of saved connections — click to connect, right-click to manage. */
export function ConnectionRail(): ReactNode {
  const connections = useConnectionStore((s) => s.connections)
  const openEditor = useConnectionStore((s) => s.openEditor)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  return (
    <aside className="flex w-[76px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1.5">
        {connections.map((connection) => (
          <RailItem
            key={connection.id}
            connection={connection}
            onContextMenu={(event) => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, connection })
            }}
          />
        ))}
      </div>
      <div className="flex shrink-0 justify-center border-t border-line py-2">
        <button
          type="button"
          title="New connection"
          onClick={() => openEditor(null)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-line-strong text-subtle transition-colors hover:border-accent hover:text-accent"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
      {menu && <RailContextMenu state={menu} onClose={() => setMenu(null)} />}
    </aside>
  )
}
