import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { Input } from '@renderer/components/Input'
import { ipc } from '@renderer/services/ipc'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useSchemaExplorer } from '@renderer/features/explorer/hooks/useSchemaExplorer'
import { quoteRelation } from '@renderer/utils/sql'
import type { DatabaseEngine } from '@shared/types/connection'

interface CloneTableModalProps {
  connectionId: string
  schema: string
  table: string
  onClose: () => void
}

/** Build the two-statement clone DDL: create the empty target, then copy data. */
function buildCloneSql(
  engine: DatabaseEngine,
  schema: string,
  source: string,
  target: string,
  includeData: boolean
): string[] {
  const src = quoteRelation(engine, schema, source)
  const dst = quoteRelation(engine, schema, target)
  // PG's LIKE INCLUDING ALL copies defaults, constraints, indexes, comments;
  // MySQL's `CREATE TABLE … LIKE …` copies the structure (incl. indexes) by spec.
  const create =
    engine === 'mysql'
      ? `CREATE TABLE ${dst} LIKE ${src};`
      : `CREATE TABLE ${dst} (LIKE ${src} INCLUDING ALL);`
  if (!includeData) return [create]
  return [create, `INSERT INTO ${dst} SELECT * FROM ${src};`]
}

/** A dialog that clones a table — structure-only, or structure + data. */
export function CloneTableModal({
  connectionId,
  schema,
  table,
  onClose
}: CloneTableModalProps): ReactNode {
  const engine =
    useConnectionStore((s) => s.connections.find((c) => c.id === connectionId)?.engine) ??
    'postgres'
  const { introspect } = useSchemaExplorer()

  const [targetName, setTargetName] = useState(`${table}_copy`)
  const [includeData, setIncludeData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const trimmed = targetName.trim()
  const preview = useMemo(() => {
    if (!trimmed) return null
    return buildCloneSql(engine, schema, table, trimmed, includeData).join('\n')
  }, [engine, schema, table, trimmed, includeData])

  const handleClone = async (): Promise<void> => {
    if (!trimmed) {
      setError('Target name is required.')
      return
    }
    if (trimmed === table) {
      setError('Target name must differ from the source.')
      return
    }

    const statements = buildCloneSql(engine, schema, table, trimmed, includeData).map((sql) => ({
      sql
    }))
    setBusy(true)
    setError(null)
    const result = await ipc.query.batch({ connectionId, statements })
    setBusy(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    await introspect(connectionId)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Clone ${table}`}
      description="Copy the table structure, optionally including all rows."
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleClone()} loading={busy}>
            Clone Table
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Target table name</span>
          <Input
            autoFocus
            value={targetName}
            placeholder={`${table}_copy`}
            onChange={(e) => setTargetName(e.target.value)}
          />
          <span className="mt-1 block text-[11px] text-subtle">
            Created in schema <span className="font-mono">{schema}</span>.
          </span>
        </label>

        <label className="flex items-center gap-2 text-xs text-content">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-accent"
            checked={includeData}
            onChange={(e) => setIncludeData(e.target.checked)}
          />
          Include data (copies every row)
        </label>

        {preview && (
          <pre className="overflow-x-auto rounded-md border border-line bg-app p-3 font-mono text-[11px] leading-relaxed text-muted">
            {preview}
          </pre>
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
