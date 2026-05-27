import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { useResultStore } from '@renderer/features/results/stores/resultStore'
import { formatCellValue, isNull } from '@renderer/features/results/utils/format-cell'
import type { QueryResultSet } from '@shared/types/query'

const ROW_HEIGHT = 26
const COL_WIDTH = 180
const ROWNUM_WIDTH = 60

interface SelectedCell {
  row: number
  col: number
}

/** Compare two cell values for sorting — NULLs sort last, numbers numerically. */
function compareCells(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

/** A virtualized, sortable grid for a query result set. */
export function ResultGrid({ result }: { result: QueryResultSet }): ReactNode {
  const sortColumn = useResultStore((s) => s.sortColumn)
  const sortDir = useResultStore((s) => s.sortDir)
  const toggleSort = useResultStore((s) => s.toggleSort)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<SelectedCell | null>(null)

  // Display order — an index map so the original rows array is never mutated.
  const order = useMemo(() => {
    const indices = result.rows.map((_, index) => index)
    if (sortColumn === null) return indices
    const direction = sortDir === 'asc' ? 1 : -1
    return indices.sort(
      (a, b) => compareCells(result.rows[a][sortColumn], result.rows[b][sortColumn]) * direction
    )
  }, [result.rows, sortColumn, sortDir])

  const virtualizer = useVirtualizer({
    count: order.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16
  })

  const totalWidth = ROWNUM_WIDTH + result.columns.length * COL_WIDTH

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selected) {
      const value = result.rows[selected.row]?.[selected.col]
      void navigator.clipboard.writeText(formatCellValue(value))
    }
  }

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="h-full overflow-auto font-mono outline-none"
    >
      <div style={{ width: totalWidth }} className="relative">
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex border-b border-line bg-surface"
          style={{ height: ROW_HEIGHT }}
        >
          <div style={{ width: ROWNUM_WIDTH }} className="shrink-0 border-r border-line" />
          {result.columns.map((column, columnIndex) => {
            const active = sortColumn === columnIndex
            return (
              <button
                key={columnIndex}
                type="button"
                onClick={() => toggleSort(columnIndex)}
                style={{ width: COL_WIDTH }}
                className="flex h-full shrink-0 items-center gap-1 border-r border-line px-2 text-left hover:bg-elevated"
              >
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-content">
                  {column.name}
                </span>
                {active &&
                  (sortDir === 'asc' ? (
                    <ChevronUp className="h-3 w-3 shrink-0 text-accent" />
                  ) : (
                    <ChevronDown className="h-3 w-3 shrink-0 text-accent" />
                  ))}
              </button>
            )
          })}
        </div>

        {/* Virtualized body */}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const rowIndex = order[virtualRow.index]
            const row = result.rows[rowIndex]
            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 flex border-b border-line/50"
                style={{ top: virtualRow.start, height: ROW_HEIGHT, width: totalWidth }}
              >
                <div
                  style={{ width: ROWNUM_WIDTH }}
                  className="shrink-0 border-r border-line bg-surface px-2 text-right text-[11px] leading-[25px] text-subtle"
                >
                  {virtualRow.index + 1}
                </div>
                {result.columns.map((_, columnIndex) => {
                  const value = row[columnIndex]
                  const isSelected =
                    selected?.row === rowIndex && selected.col === columnIndex
                  return (
                    <div
                      key={columnIndex}
                      onClick={() => setSelected({ row: rowIndex, col: columnIndex })}
                      title={formatCellValue(value)}
                      style={{ width: COL_WIDTH }}
                      className={cn(
                        'shrink-0 cursor-default truncate border-r border-line/50 px-2 text-[12px] leading-[25px]',
                        isSelected && 'bg-accent-soft ring-1 ring-inset ring-accent'
                      )}
                    >
                      {isNull(value) ? (
                        <span className="italic text-subtle">NULL</span>
                      ) : (
                        <span className="text-content">{formatCellValue(value)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
