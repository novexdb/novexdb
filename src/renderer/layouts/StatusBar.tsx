import type { ReactNode } from 'react'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { ENGINE_LABELS } from '@renderer/features/connections/constants'

/** Slim bottom strip summarising the active connection. */
export function StatusBar(): ReactNode {
  const activeId = useConnectionStore((s) => s.activeConnectionId)
  const active = useConnectionStore((s) => s.connections.find((c) => c.id === activeId) ?? null)

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-line bg-surface px-3 text-[11px] text-subtle">
      <div className="flex items-center gap-2">
        {active ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span className="text-muted">
              {active.username}@{active.host}:{active.port}
            </span>
            {active.database && (
              <>
                <span>·</span>
                <span>{active.database}</span>
              </>
            )}
          </>
        ) : (
          <span>Not connected</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {active && <span>{ENGINE_LABELS[active.engine]}</span>}
        <span>NovexDB 0.1.0</span>
      </div>
    </footer>
  )
}
