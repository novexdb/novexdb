import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Loader2, PlayCircle, Sparkles, Square } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { useResultStore } from '@renderer/features/results/stores/resultStore'
import { ResultGrid } from '@renderer/features/results/components/ResultGrid'
import { cancelActiveQuery } from '@renderer/features/results/runner'
import { explainQueryError } from '@renderer/features/ai/runner'
import { MAX_RESULT_ROWS } from '@shared/types/query'

/** Renders the Results tab: run status, errors, and the result grid. */
export function ResultsArea(): ReactNode {
  const status = useResultStore((s) => s.status)
  const result = useResultStore((s) => s.result)
  const error = useResultStore((s) => s.error)
  const ranSql = useResultStore((s) => s.ranSql)

  if (status === 'running') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
        <p className="text-xs text-muted">Running query…</p>
        <Button size="sm" variant="secondary" onClick={() => void cancelActiveQuery()}>
          <Square className="h-3 w-3" />
          Cancel
        </Button>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center gap-2 overflow-auto p-6">
        <div className="flex max-w-2xl items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5">
          <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger" />
          <p className="whitespace-pre-wrap font-mono text-xs text-danger">{error}</p>
        </div>
        {ranSql && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void explainQueryError(ranSql, error ?? 'Unknown error')}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Explain with AI
          </Button>
        )}
      </div>
    )
  }

  if (status === 'success' && result) {
    if (result.columns.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <p className="text-xs text-content">{result.command || 'Statement'} executed</p>
          <p className="text-[11px] text-subtle">
            {result.affectedRows.toLocaleString()} row{result.affectedRows === 1 ? '' : 's'}{' '}
            affected · {result.durationMs} ms
          </p>
        </div>
      )
    }

    return (
      <div className="flex h-full flex-col">
        <div className="flex h-6 shrink-0 items-center gap-2 border-b border-line px-3 text-[11px] text-subtle">
          <span className="text-muted">{result.rowCount.toLocaleString()} rows</span>
          <span>·</span>
          <span>{result.durationMs} ms</span>
          {result.truncated && (
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning">
              capped at {MAX_RESULT_ROWS.toLocaleString()}
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <ResultGrid result={result} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
      <PlayCircle className="h-6 w-6 text-subtle" />
      <p className="text-xs text-muted">Run a query to see results</p>
      <p className="text-[11px] text-subtle">Press ⌘↵ / Ctrl+↵ in the editor</p>
    </div>
  )
}
