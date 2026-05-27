import { useEffect, useState, type ReactNode } from 'react'
import { Check, Database, Loader2, Search } from 'lucide-react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { Input } from '@renderer/components/Input'
import { cn } from '@renderer/utils/cn'
import { ipc } from '@renderer/services/ipc'
import { useUiStore } from '@renderer/stores/uiStore'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useSchemaExplorer } from '@renderer/features/explorer/hooks/useSchemaExplorer'

/** The "Open database" dialog — list, search, switch and create databases. */
export function DatabasePickerModal(): ReactNode {
  const open = useUiStore((s) => s.databasePickerOpen)
  const close = useUiStore((s) => s.closeDatabasePicker)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const connection = useConnectionStore((s) =>
    s.connections.find((c) => c.id === s.activeConnectionId)
  )
  const { introspect } = useSchemaExplorer()

  const currentDatabase = connection?.database ?? null

  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [loading, setLoading] = useState(false)
  const [databases, setDatabases] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadDatabases = async (): Promise<void> => {
    if (!activeConnectionId) return
    setLoading(true)
    setError(null)
    const result = await ipc.database.listDatabases(activeConnectionId)
    setLoading(false)
    if (result.ok) {
      setDatabases(result.data)
      setSelected(currentDatabase ?? result.data[0] ?? null)
    } else {
      setError(result.error.message)
    }
  }

  // Re-seed and fetch the list every time the modal opens.
  useEffect(() => {
    if (!open) return
    setMode('list')
    setSearch('')
    setNewName('')
    setError(null)
    setBusy(false)
    void loadDatabases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeConnectionId])

  if (!open) return null

  const filtered = databases.filter((db) =>
    db.toLowerCase().includes(search.trim().toLowerCase())
  )

  const handleOpen = async (database: string): Promise<void> => {
    if (!activeConnectionId) return
    if (database === currentDatabase) {
      close()
      return
    }
    setBusy(true)
    setError(null)
    const result = await ipc.database.switchDatabase({
      connectionId: activeConnectionId,
      database
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    useConnectionStore.getState().upsertConnection(result.data)
    await introspect(activeConnectionId)
    close()
  }

  const handleCreate = async (): Promise<void> => {
    if (!activeConnectionId) return
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    const result = await ipc.database.createDatabase({
      connectionId: activeConnectionId,
      name
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setMode('list')
    setNewName('')
    await loadDatabases()
    setSelected(name)
  }

  const errorBox = error && (
    <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
      {error}
    </p>
  )

  if (mode === 'create') {
    return (
      <Modal
        open={open}
        onClose={close}
        title="New database"
        description="Create a new database on this server."
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode('list')} disabled={busy}>
              Back
            </Button>
            <span className="flex-1" />
            <Button
              variant="primary"
              onClick={() => void handleCreate()}
              loading={busy}
              disabled={!newName.trim()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Database name</span>
            <Input
              autoFocus
              value={newName}
              placeholder="my_database"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate()
              }}
            />
          </label>
          {errorBox}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Open database"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <span className="flex-1" />
          <Button variant="secondary" onClick={() => setMode('create')} disabled={busy}>
            New…
          </Button>
          <Button
            variant="primary"
            onClick={() => selected && void handleOpen(selected)}
            loading={busy}
            disabled={!selected}
          >
            Open
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
          <Input
            autoFocus
            value={search}
            placeholder="Search for database…"
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-subtle">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading databases…
          </div>
        ) : error && databases.length === 0 ? (
          errorBox
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-xs text-subtle">
            {databases.length === 0 ? 'No databases found.' : 'No databases match.'}
          </p>
        ) : (
          <>
            <div className="max-h-[320px] overflow-auto rounded-md border border-line">
              {filtered.map((db) => {
                const isSelected = db === selected
                const isCurrent = db === currentDatabase
                return (
                  <button
                    key={db}
                    type="button"
                    onClick={() => setSelected(db)}
                    onDoubleClick={() => void handleOpen(db)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors',
                      isSelected
                        ? 'bg-accent text-white'
                        : 'text-content hover:bg-surface'
                    )}
                  >
                    <Database
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isSelected ? 'text-white' : 'text-accent'
                      )}
                    />
                    <span className="flex-1 truncate">{db}</span>
                    {isCurrent && (
                      <span
                        className={cn(
                          'flex items-center gap-1 text-[10px]',
                          isSelected ? 'text-white/80' : 'text-subtle'
                        )}
                      >
                        <Check className="h-3 w-3" />
                        current
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {error && errorBox}
          </>
        )}
      </div>
    </Modal>
  )
}
