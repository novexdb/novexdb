import { useRef, useState, type ReactNode } from 'react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { Select } from '@renderer/components/Select'
import { ipc } from '@renderer/services/ipc'
import { toCsv, toJson } from '@renderer/features/results/utils/export'
import { DEFAULT_PAGE_SIZE, type TableColumn } from '@shared/types/table-data'

interface ExportTableModalProps {
  connectionId: string
  schema: string
  table: string
  onClose: () => void
}

type ExportFormat = 'csv' | 'json'

/** Adapt a TableColumn to the narrow shape `toCsv`/`toJson` use (only `name`). */
function toQueryColumns(columns: TableColumn[]): { name: string; dataTypeId: number }[] {
  return columns.map((column) => ({ name: column.name, dataTypeId: 0 }))
}

/** Streams a table to CSV or JSON, paging through every row via ipc.table.fetch. */
export function ExportTableModal({
  connectionId,
  schema,
  table,
  onClose
}: ExportTableModalProps): ReactNode {
  const [format, setFormat] = useState<ExportFormat>('csv')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ fetched: number; total: number } | null>(null)
  const [done, setDone] = useState<{ rows: number; saved: boolean; path?: string } | null>(null)
  const cancelRef = useRef(false)

  const handleExport = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setProgress({ fetched: 0, total: 0 })
    setDone(null)
    cancelRef.current = false

    let columns: TableColumn[] = []
    const allRows: unknown[][] = []
    let offset = 0
    let total = 0

    try {
      // Paginate until every row has been fetched.
      do {
        const result = await ipc.table.fetch({
          connectionId,
          schema,
          table,
          limit: DEFAULT_PAGE_SIZE,
          offset,
          orderBy: null,
          orderDir: 'asc',
          search: ''
        })
        if (!result.ok) {
          throw new Error(result.error.message)
        }
        if (cancelRef.current) {
          setBusy(false)
          setProgress(null)
          return
        }

        const page = result.data
        if (offset === 0) {
          columns = page.columns
          total = page.totalRows
        }
        for (const row of page.rows) allRows.push(row)
        offset += page.rows.length
        setProgress({ fetched: allRows.length, total })

        // Defensive — stop if the driver returned an empty page so we don't loop.
        if (page.rows.length === 0) break
      } while (allRows.length < total)

      const queryColumns = toQueryColumns(columns)
      const content =
        format === 'csv' ? toCsv(queryColumns, allRows) : toJson(queryColumns, allRows)
      const defaultName = `${table}.${format}`
      const result = await ipc.file.export({ defaultName, content })
      setBusy(false)
      setProgress(null)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setDone({ rows: allRows.length, saved: result.data.saved, path: result.data.path })
    } catch (err) {
      setBusy(false)
      setProgress(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCancel = (): void => {
    if (busy) {
      cancelRef.current = true
      return
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`Export ${table}`}
      description="Paginates through every row and saves a CSV or JSON file."
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={handleCancel}>
            {busy ? 'Cancel' : 'Close'}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleExport()}
            loading={busy}
            disabled={done?.saved === true}
          >
            Export
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Format</span>
          <Select
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            disabled={busy}
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </Select>
        </label>

        {progress && (
          <p className="rounded-md border border-line bg-app px-3 py-2 font-mono text-[11px] text-muted">
            Fetched {progress.fetched.toLocaleString()}
            {progress.total > 0 && <> / {progress.total.toLocaleString()}</>} rows…
          </p>
        )}

        {done && (
          <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
            {done.saved
              ? `Saved ${done.rows.toLocaleString()} rows${done.path ? ` to ${done.path}` : ''}.`
              : `Fetched ${done.rows.toLocaleString()} rows (save was cancelled).`}
          </p>
        )}

        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
