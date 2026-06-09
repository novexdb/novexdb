import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Download, Loader2 } from 'lucide-react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { Field } from '@renderer/components/Field'
import { Select } from '@renderer/components/Select'
import { ipc } from '@renderer/services/ipc'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { defaultExportFilename, type ExportContents, type ExportFormat } from '@shared/types/query'

type Phase = 'idle' | 'running' | 'done' | 'cancelled' | 'error'

interface ExportResult {
  path: string
  bytesWritten: number
  durationMs: number
}

interface ExportDatabaseModalProps {
  connectionId: string
  onClose: () => void
}

/** Human-readable byte size. */
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

const CONTENTS_OPTIONS: { value: ExportContents; label: string }[] = [
  { value: 'all', label: 'Schema + data' },
  { value: 'schema', label: 'Schema only' },
  { value: 'data', label: 'Data only' }
]

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p

/** Streams a whole-database dump to a file the user picks (pg_dump / mysqldump / generated SQL). */
export function ExportDatabaseModal({
  connectionId,
  onClose
}: ExportDatabaseModalProps): ReactNode {
  const connection = useConnectionStore((s) => s.connections.find((c) => c.id === connectionId))
  const engine = connection?.engine ?? 'postgres'
  const database = connection?.database ?? 'database'

  // Custom (pg_dump archive) is Postgres-only.
  const formatOptions: { value: ExportFormat; label: string }[] = [
    { value: 'plain', label: 'Plain SQL (.sql)' },
    { value: 'gzip', label: 'Compressed (.sql.gz)' },
    ...(engine === 'postgres'
      ? [{ value: 'custom' as const, label: 'Custom archive (.dump)' }]
      : [])
  ]

  const [format, setFormat] = useState<ExportFormat>('plain')
  const [contents, setContents] = useState<ExportContents>('all')
  const [path, setPath] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [bytes, setBytes] = useState(0)
  const [objectCount, setObjectCount] = useState(0)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const cancelRef = useRef<(() => void) | null>(null)

  // Abort the export if the modal is closed while it is still running.
  useEffect(() => {
    return () => cancelRef.current?.()
  }, [])

  const chooseDestination = async (): Promise<void> => {
    const picked = await ipc.file.pickSave({ defaultName: defaultExportFilename(database, format) })
    if (picked.ok && !picked.data.canceled && picked.data.path) {
      setPath(picked.data.path)
    }
  }

  const handleFormatChange = (next: ExportFormat): void => {
    setFormat(next)
    setPath(null) // the extension changed — re-pick the destination
  }

  const handleRun = (): void => {
    if (!path) return
    setPhase('running')
    setErrorMsg(null)
    setBytes(0)
    setObjectCount(0)
    cancelRef.current = ipc.database.exportDump(
      { connectionId, path, format, contents },
      {
        onProgress: (p) => {
          setBytes(p.bytesWritten)
          setObjectCount(p.objectCount)
        },
        onDone: (d) => {
          cancelRef.current = null
          if (d.cancelled) {
            setPhase('cancelled')
            return
          }
          setResult({ path: d.path, bytesWritten: d.bytesWritten, durationMs: d.durationMs })
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
      title="Export database"
      description={`Back up the ${database} database to a file.`}
      width={520}
      footer={
        phase === 'running' ? (
          <Button variant="danger" onClick={handleCancel}>
            Cancel
          </Button>
        ) : phase === 'idle' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRun} disabled={!path}>
              Export
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {phase === 'idle' ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Format">
              <Select
                value={format}
                onChange={(event) => handleFormatChange(event.target.value as ExportFormat)}
              >
                {formatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contents">
              <Select
                value={contents}
                onChange={(event) => setContents(event.target.value as ExportContents)}
              >
                {CONTENTS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Destination">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={chooseDestination}>
                <Download className="h-3.5 w-3.5" />
                Choose destination…
              </Button>
              <span
                className="min-w-0 flex-1 truncate text-xs text-muted"
                title={path ?? undefined}
              >
                {path ? baseName(path) : 'No file selected'}
              </span>
            </div>
          </Field>
          <p className="text-[11px] text-subtle">
            {engine === 'mssql'
              ? 'SQL Server export generates CREATE TABLE + INSERT statements (best-effort — re-import via sqlcmd / SSMS).'
              : `Runs ${engine === 'postgres' ? 'pg_dump' : 'mysqldump'} locally; the client tools must be installed.`}
          </p>
        </div>
      ) : phase === 'running' ? (
        <div className="flex items-center gap-2 py-8 text-xs text-subtle">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Exporting… {formatBytes(bytes)} written
          {objectCount > 0 ? ` · ${objectCount} object${objectCount === 1 ? '' : 's'}` : ''}
        </div>
      ) : phase === 'done' && result ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" />
          <p className="text-sm text-content">Export complete</p>
          <p className="text-xs text-subtle">
            {formatBytes(result.bytesWritten)} · {(result.durationMs / 1000).toFixed(1)}s
          </p>
          <p className="max-w-full truncate font-mono text-[11px] text-muted" title={result.path}>
            {result.path}
          </p>
        </div>
      ) : phase === 'cancelled' ? (
        <div className="py-8 text-center">
          <p className="text-sm text-content">Export cancelled</p>
          <p className="mt-1 text-xs text-subtle">The partial file was removed.</p>
        </div>
      ) : (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {errorMsg ?? 'Export failed.'}
        </p>
      )}
    </Modal>
  )
}
