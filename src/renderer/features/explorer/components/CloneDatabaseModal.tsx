import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { Field } from '@renderer/components/Field'
import { Select } from '@renderer/components/Select'
import { Input } from '@renderer/components/Input'
import { ipc } from '@renderer/services/ipc'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useConnections } from '@renderer/features/connections/hooks/useConnections'
import { useSchemaExplorer } from '@renderer/features/explorer/hooks/useSchemaExplorer'

type Phase = 'config' | 'running' | 'done' | 'cancelled' | 'error'

/** Matches createDatabaseSchema (trim 1..63). */
const DB_NAME_MAX = 63

interface CloneDatabaseModalProps {
  /** The source connection (its current database is cloned). */
  connectionId: string
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

/**
 * Clones the active connection's current database into a new database — on this
 * connection or another same-engine connection. A full, lossless copy (export →
 * create → import) with two-phase progress.
 */
export function CloneDatabaseModal({ connectionId, onClose }: CloneDatabaseModalProps): ReactNode {
  const source = useConnectionStore((s) => s.connections.find((c) => c.id === connectionId))
  const connections = useConnectionStore((s) => s.connections)
  const { connect, refresh } = useConnections()
  const { introspect } = useSchemaExplorer()

  const engine = source?.engine ?? 'postgres'
  const database = source?.database ?? 'database'
  const isMssql = engine === 'mssql'

  // Other saved connections of the same engine are valid clone targets.
  const targets = connections.filter((c) => c.id !== connectionId && c.engine === engine)

  const [target, setTarget] = useState<string>('this') // 'this' | <connectionId>
  const [dbName, setDbName] = useState('')
  const [phase, setPhase] = useState<Phase>('config')
  const [phaseLabel, setPhaseLabel] = useState<'export' | 'import'>('export')
  const [bytes, setBytes] = useState(0)
  const [count, setCount] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const cancelRef = useRef<(() => void) | null>(null)

  // Abort the clone if the modal closes mid-run.
  useEffect(() => {
    return () => cancelRef.current?.()
  }, [])

  const trimmed = dbName.trim()
  const nameValid = trimmed.length >= 1 && trimmed.length <= DB_NAME_MAX

  const handleRun = async (): Promise<void> => {
    if (!nameValid || isMssql) return
    const targetConnectionId = target === 'this' ? connectionId : target

    // A different target connection must be open before create/import.
    if (targetConnectionId !== connectionId) {
      const status = useConnectionStore.getState().statuses[targetConnectionId]
      if (status !== 'connected') {
        const res = await connect(targetConnectionId)
        if (!res.ok) {
          setErrorMsg(res.error.message)
          setPhase('error')
          return
        }
      }
    }

    setPhase('running')
    setPhaseLabel('export')
    setBytes(0)
    setCount(0)
    setErrorMsg(null)
    cancelRef.current = ipc.database.cloneDatabase(
      { sourceConnectionId: connectionId, targetConnectionId, targetDatabase: trimmed },
      {
        onProgress: (p) => {
          setPhaseLabel(p.phase)
          setBytes(p.bytes)
          setCount(p.count)
        },
        onDone: (d) => {
          cancelRef.current = null
          if (d.cancelled) {
            setPhase('cancelled')
            void introspect(connectionId)
            return
          }
          if (d.targetConnection) {
            useConnectionStore.getState().upsertConnection(d.targetConnection)
          }
          void refresh()
          void introspect(targetConnectionId)
          setDurationMs(d.durationMs)
          setPhase('done')
        },
        onError: (f) => {
          cancelRef.current = null
          setErrorMsg(f.error)
          setPhase('error')
        }
      }
    )
  }

  const handleCancel = (): void => {
    cancelRef.current?.()
    cancelRef.current = null
    setPhase('cancelled')
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Clone database"
      description={`Copy ${database} into a new database — schema and all data.`}
      width={520}
      footer={
        phase === 'running' ? (
          <Button variant="danger" onClick={handleCancel}>
            Cancel
          </Button>
        ) : phase === 'config' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleRun()}
              disabled={!nameValid || isMssql}
            >
              Clone
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {isMssql ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          Cloning isn't supported for SQL Server yet.
        </p>
      ) : phase === 'config' ? (
        <div className="flex flex-col gap-3">
          <Field label="Clone to">
            <Select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="this">This connection ({source?.name ?? 'current'})</option>
              {targets.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name} ({connection.host})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="New database name">
            <Input
              autoFocus
              value={dbName}
              placeholder="my_database_copy"
              onChange={(event) => setDbName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && nameValid) void handleRun()
              }}
            />
          </Field>
          <p className="text-[11px] text-subtle">
            A full, lossless copy of <span className="text-content">{database}</span> (schema + all
            data). The target connection switches to “{trimmed || 'the new database'}” when done. An
            existing name imports into it.
          </p>
        </div>
      ) : phase === 'running' ? (
        <div className="flex items-center gap-2 py-8 text-xs text-subtle">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          {phaseLabel === 'export' ? 'Exporting' : 'Importing'}… {formatBytes(bytes)}
          {count > 0 ? ` · ${count} ${phaseLabel === 'export' ? 'objects' : 'statements'}` : ''}
        </div>
      ) : phase === 'done' ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" />
          <p className="text-sm text-content">Clone complete</p>
          <p className="text-xs text-subtle">{(durationMs / 1000).toFixed(1)}s</p>
        </div>
      ) : phase === 'cancelled' ? (
        <div className="py-8 text-center">
          <p className="text-sm text-content">Clone cancelled</p>
          <p className="mt-1 text-xs text-subtle">
            The new database may have been created and partially populated.
          </p>
        </div>
      ) : (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {errorMsg ?? 'Clone failed.'}
        </p>
      )}
    </Modal>
  )
}
