import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { Input } from '@renderer/components/Input'
import { Select } from '@renderer/components/Select'
import { ipc } from '@renderer/services/ipc'
import { quoteIdent, quoteQualified } from '@renderer/utils/sql'
import { useExplorerStore } from '@renderer/features/explorer/stores/explorerStore'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import { useSchemaExplorer } from '@renderer/features/explorer/hooks/useSchemaExplorer'
import {
  PG_COLUMN_TYPES,
  buildCreateTableSql,
  type ColumnDef
} from '@renderer/features/explorer/ddl'
import { parseCsv } from '@renderer/features/explorer/import/csv'
import { parseJsonRows } from '@renderer/features/explorer/import/json'
import { inferColumns, type ImportCell } from '@renderer/features/explorer/import/infer'
import type { BatchStatement } from '@shared/types/query'

/** Hard cap on statements per batch — mirrors `executeBatchSchema`. */
const MAX_BATCH_STATEMENTS = 5_000
const PREVIEW_ROWS = 10

interface ImportModalProps {
  connectionId: string
  schema: string
  format: 'csv' | 'json'
  fileName: string
  content: string
  /** Set when the file pick itself failed (too large, read error). */
  error?: string
  onClose: () => void
}

/** Turn a file name into a safe table identifier. */
function tableNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '')
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'imported_table'
}

/** Build chunked, parameterized multi-row INSERT statements. */
function buildInsertStatements(
  schema: string,
  table: string,
  columns: ColumnDef[],
  rows: ImportCell[][]
): BatchStatement[] {
  if (rows.length === 0) return []
  const qualified = quoteQualified(schema, table)
  const colList = columns.map((c) => quoteIdent(c.name.trim())).join(', ')
  // Keep each statement well under Postgres' 65535-bind-parameter limit.
  const rowsPerChunk = Math.max(1, Math.floor(50_000 / columns.length))
  const statements: BatchStatement[] = []

  for (let start = 0; start < rows.length; start += rowsPerChunk) {
    const chunk = rows.slice(start, start + rowsPerChunk)
    const params: ImportCell[] = []
    const tuples = chunk.map((row) => {
      const placeholders = columns.map((_, c) => {
        params.push(row[c] ?? null)
        return `$${params.length}`
      })
      return `(${placeholders.join(', ')})`
    })
    statements.push({
      sql: `INSERT INTO ${qualified} (${colList}) VALUES ${tuples.join(', ')}`,
      params
    })
  }
  return statements
}

/** A dialog that imports a CSV/JSON file into a new table. */
export function ImportModal({
  connectionId,
  schema,
  format,
  fileName,
  content,
  error: pickError,
  onClose
}: ImportModalProps): ReactNode {
  const snapshot = useExplorerStore((s) => s.snapshots[connectionId])
  const openTableTab = useEditorStore((s) => s.openTableTab)
  const { introspect } = useSchemaExplorer()

  // Parse the already-read file once — props are fixed for the modal's life.
  const parsed = useMemo(() => {
    try {
      const table = format === 'csv' ? parseCsv(content) : parseJsonRows(content)
      return { table, parseError: null as string | null }
    } catch (err) {
      return { table: null, parseError: err instanceof Error ? err.message : String(err) }
    }
  }, [content, format])

  const [columns, setColumns] = useState<ColumnDef[]>(() =>
    parsed.table ? inferColumns(parsed.table) : []
  )
  const [tableName, setTableName] = useState(() => tableNameFromFile(fileName))
  const [targetSchema, setTargetSchema] = useState(schema)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const schemas = snapshot?.schemas ?? [schema]
  const rows = useMemo(() => parsed.table?.rows ?? [], [parsed])
  const fatal = pickError ?? parsed.parseError
  const ready = !fatal && columns.length > 0
  const preview = useMemo(() => rows.slice(0, PREVIEW_ROWS), [rows])

  const patchColumn = (index: number, patch: Partial<ColumnDef>): void => {
    setColumns((cols) => cols.map((col, i) => (i === index ? { ...col, ...patch } : col)))
  }

  const handleImport = async (): Promise<void> => {
    let createSql: string
    try {
      createSql = buildCreateTableSql({ schema: targetSchema, tableName, columns })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }

    const inserts = buildInsertStatements(targetSchema, tableName.trim(), columns, rows)
    if (inserts.length + 1 > MAX_BATCH_STATEMENTS) {
      setError('This file has too many rows to import at once — split it into smaller files.')
      return
    }

    setBusy(true)
    setError(null)
    const result = await ipc.query.batch({
      connectionId,
      statements: [{ sql: createSql }, ...inserts]
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    await introspect(connectionId)
    openTableTab(connectionId, targetSchema, tableName.trim())
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Import ${format.toUpperCase()}`}
      description="Review the detected columns, then create and fill the table."
      width={720}
      footer={
        fatal ? (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleImport()}
              loading={busy}
              disabled={!ready}
            >
              Import {rows.length} {rows.length === 1 ? 'row' : 'rows'}
            </Button>
          </>
        )
      }
    >
      {fatal ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {fatal}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_180px] gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Table name</span>
              <Input value={tableName} onChange={(e) => setTableName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Schema</span>
              <Select
                value={targetSchema}
                onChange={(e) => setTargetSchema(e.target.value)}
              >
                {schemas.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Columns · {columns.length}
            </span>
            <div className="space-y-1.5">
              {columns.map((column, index) => (
                <div key={index} className="grid grid-cols-[1fr_150px] gap-2">
                  <Input
                    value={column.name}
                    onChange={(e) => patchColumn(index, { name: e.target.value })}
                  />
                  <Select
                    value={column.type}
                    onChange={(e) =>
                      patchColumn(index, { type: e.target.value as ColumnDef['type'] })
                    }
                  >
                    {PG_COLUMN_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {preview.length > 0 && (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">
                Preview · first {preview.length} of {rows.length}
              </span>
              <div className="max-h-48 overflow-auto rounded-md border border-line">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-line bg-surface text-left text-subtle">
                      {columns.map((column, i) => (
                        <th key={i} className="whitespace-nowrap px-2 py-1 font-medium">
                          {column.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {preview.map((row, r) => (
                      <tr key={r} className="border-b border-line/50">
                        {columns.map((_, c) => (
                          <td
                            key={c}
                            className="max-w-[220px] truncate px-2 py-1 text-muted"
                          >
                            {row[c] === null || row[c] === undefined ? (
                              <span className="text-subtle/60 italic">null</span>
                            ) : (
                              row[c]
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
