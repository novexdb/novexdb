import { useEffect, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Copy, FilePlus2 } from 'lucide-react'
import { IconButton } from '@renderer/components/IconButton'
import { useHistoryStore } from '@renderer/features/results/stores/historyStore'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import type { QueryHistoryEntry } from '@shared/types/history'

function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString()
}

function HistoryRow({
  entry,
  onOpen
}: {
  entry: QueryHistoryEntry
  onOpen: () => void
}): ReactNode {
  const succeeded = entry.status === 'success'
  return (
    <div className="group flex items-start gap-2 border-b border-line/50 px-3 py-2 hover:bg-surface">
      {succeeded ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
      ) : (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[12px] text-content">
          {entry.sql.replace(/\s+/g, ' ').trim()}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-subtle">
          {entry.connectionName} · {relativeTime(entry.executedAt)}
          {succeeded
            ? ` · ${entry.rowCount.toLocaleString()} rows · ${entry.durationMs} ms`
            : ` · ${entry.errorMessage ?? 'failed'}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton
          label="Copy SQL"
          className="h-6 w-6"
          onClick={() => void navigator.clipboard.writeText(entry.sql)}
        >
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Open in new tab" className="h-6 w-6" onClick={onOpen}>
          <FilePlus2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  )
}

/** The History tab: past query executions, newest first. */
export function HistoryList(): ReactNode {
  const entries = useHistoryStore((s) => s.entries)
  const loading = useHistoryStore((s) => s.loading)
  const load = useHistoryStore((s) => s.load)
  const clear = useHistoryStore((s) => s.clear)
  const createTab = useEditorStore((s) => s.createTab)

  useEffect(() => {
    void load()
  }, [load])

  if (!loading && entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-subtle">No query history yet</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="text-[11px] text-subtle">{entries.length} queries</span>
        <button
          type="button"
          onClick={() => void clear()}
          className="text-[11px] font-medium text-muted hover:text-danger"
        >
          Clear
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {entries.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} onOpen={() => createTab(entry.sql)} />
        ))}
      </div>
    </div>
  )
}
