import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { ipc } from '@renderer/services/ipc'
import { useSchemaExplorer } from '@renderer/features/explorer/hooks/useSchemaExplorer'
import type { SqlImportKind } from '@shared/types/query'

const PREVIEW_CHARS = 4_000

const ARCHIVE_NOTE =
  'This is a binary pg_dump archive (custom or tar format). NovexDB will ' +
  'restore it with pg_restore — that requires the PostgreSQL client tools ' +
  'installed on this machine.'

type Phase = 'idle' | 'running' | 'done' | 'cancelled' | 'error'

interface ImportResult {
  statements: number
  rows: number
  failed: number
  errors: string[]
  durationMs: number
}

interface SqlImportModalProps {
  connectionId: string
  path: string
  name: string
  size: number
  preview: string
  kind: SqlImportKind
  /** Set when picking the file failed. */
  error?: string
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

/** Streams a .sql dump into the database (or restores an archive via pg_restore). */
export function SqlImportModal({
  connectionId,
  path,
  name,
  size,
  preview,
  kind,
  error: pickError,
  onClose
}: SqlImportModalProps): ReactNode {
  const { introspect } = useSchemaExplorer()
  const isArchive = kind === 'archive'

  const [phase, setPhase] = useState<Phase>(pickError ? 'error' : 'idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(pickError ?? null)
  const [bytes, setBytes] = useState(0)
  const [statements, setStatements] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  // Archive restores only: drop & recreate existing objects (--clean).
  const [clean, setClean] = useState(false)

  const cancelRef = useRef<(() => void) | null>(null)

  // Abort the import if the modal is closed while it is still running.
  useEffect(() => {
    return () => cancelRef.current?.()
  }, [])

  const handleRun = (): void => {
    setPhase('running')
    setErrorMsg(null)
    cancelRef.current = ipc.sql.importDump(
      { connectionId, path, clean: isArchive && clean },
      {
        onProgress: (p) => {
          setBytes(p.bytesProcessed)
          setStatements(p.statementCount)
        },
        onDone: (d) => {
          cancelRef.current = null
          if (d.cancelled) {
            setPhase('cancelled')
            return
          }
          setResult({
            statements: d.statementCount,
            rows: d.affectedRows,
            failed: d.failedCount,
            errors: d.errors,
            durationMs: d.durationMs
          })
          setPhase('done')
          void introspect(connectionId)
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

  const percent = size > 0 ? Math.min(100, Math.round((bytes / size) * 100)) : 0
  const unit = isArchive ? 'items' : 'statements'

  return (
    <Modal
      open
      onClose={onClose}
      title={isArchive ? 'Restore archive' : 'Import SQL dump'}
      description={
        isArchive
          ? 'Restore a pg_dump archive into the connected database.'
          : 'Stream a .sql file into the connected database.'
      }
      width={680}
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
            <Button variant="primary" onClick={handleRun}>
              {isArchive ? 'Restore' : 'Run import'}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {phase === 'error' ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {errorMsg ?? 'Could not read the file.'}
        </p>
      ) : phase === 'done' && result ? (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            {result.failed > 0 ? (
              <AlertTriangle className="h-8 w-8 text-warning" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-success" />
            )}
            <p className="text-sm text-content">
              {result.failed > 0
                ? `${isArchive ? 'Restore' : 'Import'} finished with errors`
                : `${isArchive ? 'Restore' : 'Import'} complete`}
            </p>
            <p className="text-xs text-subtle">
              {result.statements - result.failed} of {result.statements} {unit} applied
              {result.failed > 0 ? ` · ${result.failed} failed` : ''}
              {result.rows > 0 ? ` · ${result.rows} rows affected` : ''} ·{' '}
              {(result.durationMs / 1000).toFixed(1)}s
            </p>
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-auto rounded-md border border-line bg-app p-3">
              {result.errors.map((message, index) => (
                <p key={index} className="font-mono text-[11px] text-danger">
                  {message}
                </p>
              ))}
              {result.failed > result.errors.length && (
                <p className="text-[11px] text-subtle">
                  …and {result.failed - result.errors.length} more.
                </p>
              )}
            </div>
          )}
        </div>
      ) : phase === 'cancelled' ? (
        <div className="py-8 text-center">
          <p className="text-sm text-content">{isArchive ? 'Restore' : 'Import'} cancelled</p>
          <p className="mt-1 text-xs text-subtle">
            Anything applied before you cancelled remains in the database.
          </p>
        </div>
      ) : phase === 'running' ? (
        <div className="space-y-3 py-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-content">{name}</span>
            <span className="text-subtle">
              {isArchive
                ? `${formatBytes(size)}`
                : `${formatBytes(bytes)} / ${formatBytes(size)} · ${percent}%`}
            </span>
          </div>
          {isArchive ? (
            <div className="flex items-center gap-2 text-xs text-subtle">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Restoring… {statements.toLocaleString()} items processed
            </div>
          ) : (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-[11px] text-subtle">
                {statements.toLocaleString()} statements executed…
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-content">{name}</span>
            <span className="text-subtle">
              {formatBytes(size)}
              {kind === 'gzip' ? ' · gzip' : ''}
            </span>
          </div>
          {preview && (
            <pre className="max-h-72 overflow-auto rounded-md border border-line bg-app p-3 font-mono text-[11px] leading-relaxed text-muted">
              {preview.slice(0, PREVIEW_CHARS)}
              {preview.length > PREVIEW_CHARS ? '\n…' : ''}
            </pre>
          )}
          <p className="text-[11px] text-subtle">
            {isArchive
              ? ARCHIVE_NOTE
              : (kind === 'gzip' ? 'Gzip-compressed — decompressed automatically. ' : '') +
                'Each statement runs independently — any that fail are skipped and ' +
                'reported, like `psql`.'}
          </p>
          {isArchive && (
            <div className="space-y-2 rounded-md border border-line bg-app p-3">
              <label className="flex items-center gap-2 text-xs text-content">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-accent"
                  checked={clean}
                  onChange={(event) => setClean(event.target.checked)}
                />
                Replace existing objects (drop &amp; recreate)
              </label>
              <p className="text-[11px] text-subtle">
                Restoring into a database that already has these tables otherwise fails with
                “already exists”. With this on, each object is dropped and recreated (
                <span className="font-mono">pg_restore --clean --if-exists</span>).
              </p>
              {clean && (
                <p className="flex items-start gap-1.5 text-[11px] text-warning">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  Destructive — this overwrites the current data for every object in the archive.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
