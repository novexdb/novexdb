import { useMemo, useState, type ReactNode } from 'react'
import { Link2, Plus, Trash2, X } from 'lucide-react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { Input } from '@renderer/components/Input'
import { Select } from '@renderer/components/Select'
import { IconButton } from '@renderer/components/IconButton'
import { cn } from '@renderer/utils/cn'
import { ipc } from '@renderer/services/ipc'
import { useExplorerStore } from '@renderer/features/explorer/stores/explorerStore'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import { useSchemaExplorer } from '@renderer/features/explorer/hooks/useSchemaExplorer'
import {
  FK_ACTIONS,
  PG_COLUMN_TYPES,
  buildCreateTableSql,
  emptyColumn,
  type ColumnDef,
  type FkAction,
  type ForeignKeyDef
} from '@renderer/features/explorer/ddl'
import type { ColumnInfo, RelationInfo } from '@shared/types/schema'

interface NewTableModalProps {
  connectionId: string
  schema: string
  onClose: () => void
}

/** The first column most tables want — a surrogate primary key. */
function initialColumns(): ColumnDef[] {
  return [
    {
      name: 'id',
      type: 'bigserial',
      nullable: false,
      primaryKey: true,
      defaultValue: '',
      references: null
    }
  ]
}

/** A visual form dialog for composing and running a CREATE TABLE statement. */
export function NewTableModal({ connectionId, schema, onClose }: NewTableModalProps): ReactNode {
  const snapshot = useExplorerStore((s) => s.snapshots[connectionId])
  const openTableTab = useEditorStore((s) => s.openTableTab)
  const { introspect } = useSchemaExplorer()

  const schemas = snapshot?.schemas ?? [schema]
  const relations = useMemo<RelationInfo[]>(
    () => snapshot?.relations.filter((r) => r.kind === 'table') ?? [],
    [snapshot]
  )

  const [targetSchema, setTargetSchema] = useState(schema)
  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<ColumnDef[]>(initialColumns)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const preview = useMemo(() => {
    try {
      return buildCreateTableSql({ schema: targetSchema, tableName, columns })
    } catch {
      return null
    }
  }, [targetSchema, tableName, columns])

  const patchColumn = (index: number, patch: Partial<ColumnDef>): void => {
    setColumns((cols) => cols.map((col, i) => (i === index ? { ...col, ...patch } : col)))
  }

  /** Toggle the FK reveal — create a draft when none exists, otherwise leave it. */
  const startFkDraft = (index: number): void => {
    const column = columns[index]
    if (column.references) return
    patchColumn(index, {
      references: {
        schema: targetSchema,
        table: '',
        column: '',
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION'
      }
    })
  }

  const clearFk = (index: number): void => patchColumn(index, { references: null })

  const patchFk = (index: number, patch: Partial<ForeignKeyDef>): void => {
    const current = columns[index].references
    if (!current) return
    patchColumn(index, { references: { ...current, ...patch } })
  }

  const handleCreate = async (): Promise<void> => {
    let sql: string
    try {
      sql = buildCreateTableSql({ schema: targetSchema, tableName, columns })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }

    setBusy(true)
    setError(null)
    const result = await ipc.query.batch({ connectionId, statements: [{ sql }] })
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
      title="New Table"
      description="Define the columns, then create the table."
      width={680}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleCreate()} loading={busy}>
            Create Table
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_180px] gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Table name</span>
            <Input
              autoFocus
              value={tableName}
              placeholder="my_table"
              onChange={(e) => setTableName(e.target.value)}
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

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Columns</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setColumns((cols) => [...cols, emptyColumn()])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add column
            </Button>
          </div>

          <div className="grid grid-cols-[1fr_130px_44px_44px_1fr_28px_28px] items-center gap-2 px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-subtle">
            <span>Name</span>
            <span>Type</span>
            <span className="text-center">Null</span>
            <span className="text-center">PK</span>
            <span>Default</span>
            <span />
            <span />
          </div>

          <div className="space-y-2">
            {columns.map((column, index) => (
              <div key={index} className="space-y-1">
                <div className="grid grid-cols-[1fr_130px_44px_44px_1fr_28px_28px] items-center gap-2">
                  <Input
                    value={column.name}
                    placeholder="column_name"
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
                  <input
                    type="checkbox"
                    aria-label="Nullable"
                    className="mx-auto h-3.5 w-3.5 accent-accent"
                    checked={column.nullable && !column.primaryKey}
                    disabled={column.primaryKey}
                    onChange={(e) => patchColumn(index, { nullable: e.target.checked })}
                  />
                  <input
                    type="checkbox"
                    aria-label="Primary key"
                    className="mx-auto h-3.5 w-3.5 accent-accent"
                    checked={column.primaryKey}
                    onChange={(e) => patchColumn(index, { primaryKey: e.target.checked })}
                  />
                  <Input
                    value={column.defaultValue}
                    placeholder="—"
                    onChange={(e) => patchColumn(index, { defaultValue: e.target.value })}
                  />
                  <IconButton
                    label={column.references ? 'Edit foreign key' : 'Add foreign key'}
                    className={cn('h-7 w-7', column.references && 'text-accent')}
                    onClick={() => startFkDraft(index)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label="Remove column"
                    className="h-7 w-7"
                    onClick={() =>
                      setColumns((cols) =>
                        cols.length > 1 ? cols.filter((_, i) => i !== index) : cols
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>

                {column.references && (
                  <ForeignKeyReveal
                    fk={column.references}
                    relations={relations}
                    excludeKey={`${targetSchema}.${tableName.trim()}`}
                    onPatch={(patch) => patchFk(index, patch)}
                    onClear={() => clearFk(index)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

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

// ────────────────────────────────────── Foreign-key reveal sub-component ──

interface ForeignKeyRevealProps {
  fk: ForeignKeyDef
  relations: RelationInfo[]
  /** `schema.tableName` of the table being created — excluded from the picker. */
  excludeKey: string
  onPatch: (patch: Partial<ForeignKeyDef>) => void
  onClear: () => void
}

function ForeignKeyReveal({
  fk,
  relations,
  excludeKey,
  onPatch,
  onClear
}: ForeignKeyRevealProps): ReactNode {
  const schemas = useMemo(
    () => [...new Set(relations.map((r) => r.schema))].sort(),
    [relations]
  )

  // Tables in the chosen schema, with the table-being-created filtered out so
  // a self-reference can't be picked by accident.
  const tablesInSchema = useMemo(
    () =>
      relations
        .filter((r) => r.schema === fk.schema)
        .filter((r) => `${r.schema}.${r.name}` !== excludeKey)
        .map((r) => r.name)
        .sort(),
    [relations, fk.schema, excludeKey]
  )

  const targetColumns = useMemo<ColumnInfo[]>(() => {
    const relation = relations.find(
      (r) => r.schema === fk.schema && r.name === fk.table
    )
    return relation?.columns ?? []
  }, [relations, fk.schema, fk.table])

  const noSnapshot = relations.length === 0
  const indent = 'ml-1 rounded-md border border-line/70 bg-surface/40 p-2'

  if (noSnapshot) {
    return (
      <div className={cn(indent, 'flex items-center justify-between gap-2 text-[11px] text-subtle')}>
        <span>↳ Refresh the schema explorer first to pick a target table.</span>
        <IconButton label="Clear foreign key" className="h-6 w-6" onClick={onClear}>
          <X className="h-3 w-3" />
        </IconButton>
      </div>
    )
  }

  return (
    <div className={cn(indent, 'space-y-1.5')}>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <span className="shrink-0">↳ References</span>
        <Select
          value={fk.schema}
          onChange={(event) => onPatch({ schema: event.target.value, table: '', column: '' })}
          className="h-7 w-auto min-w-[100px] text-[11px]"
        >
          {schemas.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          value={fk.table}
          onChange={(event) => {
            const table = event.target.value
            const relation = relations.find(
              (r) => r.schema === fk.schema && r.name === table
            )
            const defaultColumn =
              relation?.columns.find((c) => c.isPrimaryKey)?.name ??
              relation?.columns[0]?.name ??
              ''
            onPatch({ table, column: defaultColumn })
          }}
          className="h-7 w-auto min-w-[140px] text-[11px]"
        >
          <option value="">Select table…</option>
          {tablesInSchema.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <span>(</span>
        <Select
          value={fk.column}
          onChange={(event) => onPatch({ column: event.target.value })}
          disabled={targetColumns.length === 0}
          className="h-7 w-auto min-w-[100px] text-[11px]"
        >
          {targetColumns.length === 0 && <option value="">—</option>}
          {targetColumns.map((column) => (
            <option key={column.name} value={column.name}>
              {column.name}
              {column.isPrimaryKey ? ' · pk' : ''}
            </option>
          ))}
        </Select>
        <span>)</span>
        <span className="ml-auto" />
        <IconButton label="Clear foreign key" className="h-6 w-6" onClick={onClear}>
          <X className="h-3 w-3" />
        </IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <span className="shrink-0">ON DELETE</span>
        <Select
          value={fk.onDelete ?? 'NO ACTION'}
          onChange={(event) => onPatch({ onDelete: event.target.value as FkAction })}
          className="h-7 w-auto min-w-[120px] text-[11px]"
        >
          {FK_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </Select>
        <span className="ml-2 shrink-0">ON UPDATE</span>
        <Select
          value={fk.onUpdate ?? 'NO ACTION'}
          onChange={(event) => onPatch({ onUpdate: event.target.value as FkAction })}
          className="h-7 w-auto min-w-[120px] text-[11px]"
        >
          {FK_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
