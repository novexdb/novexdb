import { useEffect, useMemo, type ReactNode } from 'react'
import { AlertCircle, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { IconButton } from '@renderer/components/IconButton'
import { Input } from '@renderer/components/Input'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import { useExplorerStore } from '@renderer/features/explorer/stores/explorerStore'
import { useSchemaExplorer } from '@renderer/features/explorer/hooks/useSchemaExplorer'
import { SchemaTree } from '@renderer/features/explorer/components/SchemaTree'
import { buildTree } from '@renderer/features/explorer/utils'

function CenteredHint({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8 text-center">
      <p className="text-xs text-subtle">{children}</p>
    </div>
  )
}

/** Sidebar panel: schema tree for the active connection, with search & refresh. */
export function ExplorerPanel(): ReactNode {
  const activeId = useConnectionStore((s) => s.activeConnectionId)
  const snapshot = useExplorerStore((s) => (activeId ? s.snapshots[activeId] : undefined))
  const loading = useExplorerStore((s) => (activeId ? (s.loading[activeId] ?? false) : false))
  const error = useExplorerStore((s) => (activeId ? s.errors[activeId] : undefined))
  const filter = useExplorerStore((s) => s.filter)
  const setFilter = useExplorerStore((s) => s.setFilter)
  const { introspect } = useSchemaExplorer()

  // Introspect automatically the first time a connection becomes active.
  useEffect(() => {
    if (activeId && !snapshot && !loading && !error) void introspect(activeId)
  }, [activeId, snapshot, loading, error, introspect])

  const tree = useMemo(
    () => (snapshot ? buildTree(snapshot, filter) : []),
    [snapshot, filter]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton
            label="Open Intelligence dashboard"
            className="h-6 w-6"
            onClick={() => useEditorStore.getState().openIntelligenceTab()}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </IconButton>
          {/*
            The "Open Anomalies Center" entry point (Duplicate & Mismatch
            Analysis) is hidden. The AnomaliesDashboard component, the
            editor-store `openAnomaliesTab` action, and the dashboard's
            route in AppLayout still exist — to re-enable, restore an
            IconButton here that calls openAnomaliesTab().
          */}
          <IconButton
            label="Refresh schema"
            className="h-6 w-6"
            disabled={!activeId || loading}
            onClick={() => activeId && void introspect(activeId)}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </IconButton>
        </div>
      </div>

      {!activeId && <CenteredHint>Connect to a database to browse its schema.</CenteredHint>}

      {activeId && loading && !snapshot && (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-subtle">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading schema…
        </div>
      )}

      {activeId && error && !snapshot && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <AlertCircle className="h-5 w-5 text-danger" />
          <p className="text-xs text-muted">{error}</p>
          <button
            type="button"
            onClick={() => void introspect(activeId)}
            className="text-xs font-medium text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {activeId && snapshot && (
        <>
          <div className="relative shrink-0 px-2 pb-1.5 pt-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <Input
              value={filter}
              placeholder="Filter objects…"
              onChange={(event) => setFilter(event.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {tree.length > 0 ? (
              <SchemaTree nodes={tree} forceExpand={filter.trim() !== ''} />
            ) : (
              <CenteredHint>
                {filter.trim() ? 'No objects match your filter.' : 'This database is empty.'}
              </CenteredHint>
            )}
          </div>
        </>
      )}
    </div>
  )
}
