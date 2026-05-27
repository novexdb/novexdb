import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { ipc } from '@renderer/services/ipc'
import { cn } from '@renderer/utils/cn'
import { formatCellValue } from '@renderer/features/results/utils/format-cell'
import type { Issue } from '@shared/types/intelligence'
import type { QueryColumn } from '@shared/types/query'

interface RecordComparisonViewerProps {
  issue: Issue
  connectionId: string
  onClose: () => void
}

interface LoadedRows {
  columns: QueryColumn[]
  rows: unknown[][]
}

/** Generate an investigation query that returns full rows for the duplicate
 *  group, derived from the issue's table + column. Falls back to the issue's
 *  `suggestedSql` when we can't parse the table reference. */
function buildInvestigationSql(issue: Issue): string {
  if (!issue.table || !issue.column) return issue.suggestedSql ?? ''
  // The issue's `column` may be a comma-separated list for some types — use the first.
  const firstCol = issue.column.split(/[,+]/)[0].trim()
  const [schema, table] = issue.table.split('.')
  // Engine-neutral identifier quoting via double-quotes — postgres accepts it
  // verbatim; mysql in ANSI_QUOTES mode does too. If the connection is mysql
  // without ANSI_QUOTES, the issue's `suggestedSql` is the safe fallback.
  return `SELECT * FROM "${schema}"."${table}"\nWHERE "${firstCol}" IN (\n  SELECT "${firstCol}" FROM "${schema}"."${table}"\n  WHERE "${firstCol}" IS NOT NULL\n  GROUP BY "${firstCol}" HAVING count(*) > 1\n)\nORDER BY "${firstCol}"\nLIMIT 100`
}

/** Modal that runs the issue's investigation SQL and renders rows side-by-side. */
export function RecordComparisonViewer({
  issue,
  connectionId,
  onClose
}: RecordComparisonViewerProps): ReactNode {
  const [data, setData] = useState<LoadedRows | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sql = useMemo(() => issue.suggestedSql ?? buildInvestigationSql(issue), [issue])

  useEffect(() => {
    if (!sql) {
      setError('No investigation SQL available for this issue.')
      return
    }
    let cancelled = false
    setBusy(true)
    void (async () => {
      const result = await ipc.query.execute({
        connectionId,
        queryId: crypto.randomUUID(),
        sql
      })
      if (cancelled) return
      setBusy(false)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setData({ columns: result.data.columns, rows: result.data.rows })
    })()
    return () => {
      cancelled = true
    }
  }, [connectionId, sql])

  // Per-column diff: highlight cells whose value differs across the rows shown.
  const diffMap = useMemo(() => {
    if (!data) return new Set<number>()
    const dirty = new Set<number>()
    for (let col = 0; col < data.columns.length; col += 1) {
      const first = data.rows[0]?.[col]
      const firstText = first === null || first === undefined ? '' : formatCellValue(first)
      for (let row = 1; row < data.rows.length; row += 1) {
        const value = data.rows[row][col]
        const text = value === null || value === undefined ? '' : formatCellValue(value)
        if (text !== firstText) {
          dirty.add(col)
          break
        }
      }
    }
    return dirty
  }, [data])

  return (
    <Modal
      open
      onClose={onClose}
      title={`Compare records — ${issue.table ?? '—'}`}
      description={issue.description}
      width={1100}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={() => void navigator.clipboard.writeText(sql)}
          >
            Copy SQL
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <pre className="overflow-x-auto rounded border border-line bg-app p-2 font-mono text-[11px] leading-relaxed text-content">
          {sql}
        </pre>

        {busy && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-subtle">
            <Loader2 className="h-4 w-4 animate-spin" />
            Fetching the duplicate group…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {data && !busy && !error && (
          <div className="max-h-[480px] overflow-auto rounded border border-line">
            <table className="min-w-full border-collapse font-mono text-[11px]">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  {data.columns.map((column, index) => (
                    <th
                      key={`${column.name}-${index}`}
                      className={cn(
                        'border-b border-r border-line px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider',
                        diffMap.has(index) ? 'text-warning' : 'text-subtle'
                      )}
                    >
                      {column.name}
                      {diffMap.has(index) && (
                        <span className="ml-1 rounded bg-warning/20 px-1 text-[9px] text-warning">
                          differs
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="even:bg-app/30">
                    {row.map((value, colIndex) => {
                      const isDiff = diffMap.has(colIndex)
                      const text =
                        value === null || value === undefined ? 'NULL' : formatCellValue(value)
                      const isNull = value === null || value === undefined
                      return (
                        <td
                          key={colIndex}
                          className={cn(
                            'border-b border-r border-line/60 px-2 py-1 align-top',
                            isDiff && 'bg-warning/10',
                            isNull && 'italic text-subtle'
                          )}
                        >
                          {text}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.rows.length === 0 && (
          <p className="rounded border border-line bg-app/40 px-3 py-2 text-[11px] text-subtle">
            No rows returned — the duplicates may have already been resolved.
          </p>
        )}
      </div>
    </Modal>
  )
}
