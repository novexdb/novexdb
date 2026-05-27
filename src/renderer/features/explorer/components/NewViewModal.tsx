import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { Input } from '@renderer/components/Input'
import { Select } from '@renderer/components/Select'
import { ipc } from '@renderer/services/ipc'
import { useExplorerStore } from '@renderer/features/explorer/stores/explorerStore'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useSchemaExplorer } from '@renderer/features/explorer/hooks/useSchemaExplorer'
import { quoteRelation } from '@renderer/utils/sql'

interface NewViewModalProps {
  connectionId: string
  schema: string
  onClose: () => void
}

/** A form dialog for composing and running a CREATE VIEW statement. */
export function NewViewModal({ connectionId, schema, onClose }: NewViewModalProps): ReactNode {
  const snapshot = useExplorerStore((s) => s.snapshots[connectionId])
  const engine =
    useConnectionStore((s) => s.connections.find((c) => c.id === connectionId)?.engine) ??
    'postgres'
  const { introspect } = useSchemaExplorer()

  const schemas = snapshot?.schemas ?? [schema]
  const [targetSchema, setTargetSchema] = useState(schema)
  const [viewName, setViewName] = useState('')
  const [selectSql, setSelectSql] = useState('SELECT 1')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const trimmedSelect = selectSql.trim().replace(/;+\s*$/, '')
  const trimmedName = viewName.trim()

  const preview = useMemo(() => {
    if (!trimmedName || !trimmedSelect) return null
    return `CREATE VIEW ${quoteRelation(engine, targetSchema, trimmedName)} AS\n${trimmedSelect};`
  }, [engine, targetSchema, trimmedName, trimmedSelect])

  const handleCreate = async (): Promise<void> => {
    if (!trimmedName) {
      setError('View name is required.')
      return
    }
    if (!trimmedSelect) {
      setError('SELECT statement is required.')
      return
    }

    const sql = `CREATE VIEW ${quoteRelation(engine, targetSchema, trimmedName)} AS\n${trimmedSelect};`
    setBusy(true)
    setError(null)
    const result = await ipc.query.batch({ connectionId, statements: [{ sql }] })
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
      title="New View"
      description="Name the view and provide its SELECT statement."
      width={680}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleCreate()} loading={busy}>
            Create View
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_180px] gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">View name</span>
            <Input
              autoFocus
              value={viewName}
              placeholder="my_view"
              onChange={(e) => setViewName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Schema</span>
            <Select value={targetSchema} onChange={(e) => setTargetSchema(e.target.value)}>
              {schemas.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">SELECT statement</span>
          <textarea
            value={selectSql}
            onChange={(e) => setSelectSql(e.target.value)}
            spellCheck={false}
            rows={8}
            placeholder="SELECT id, name FROM …"
            className="block w-full rounded-md border border-line bg-app px-3 py-2 font-mono text-[12px] leading-relaxed text-content outline-none transition-colors focus:border-accent"
          />
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
