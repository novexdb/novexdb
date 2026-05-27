import type { ReactNode } from 'react'
import { KeyRound } from 'lucide-react'
import { useExplorerStore } from '@renderer/features/explorer/stores/explorerStore'

function Section({
  title,
  count,
  children
}: {
  title: string
  count: number
  children: ReactNode
}): ReactNode {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
        {title} · {count}
      </h3>
      {children}
    </section>
  )
}

interface StructurePanelProps {
  connectionId: string
  schema: string
  table: string
}

/** The Structure tab — columns, indexes, foreign keys and triggers for one table. */
export function StructurePanel({ connectionId, schema, table }: StructurePanelProps): ReactNode {
  const snapshot = useExplorerStore((s) => s.snapshots[connectionId])

  if (!snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-xs text-subtle">
          Schema not loaded — open or refresh the Explorer.
        </p>
      </div>
    )
  }

  const relation = snapshot.relations.find((r) => r.schema === schema && r.name === table)
  if (!relation) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-xs text-subtle">Structure is unavailable for this table.</p>
      </div>
    )
  }

  const indexes = snapshot.indexes.filter((i) => i.schema === schema && i.table === table)
  const foreignKeys = snapshot.foreignKeys.filter(
    (fk) => fk.schema === schema && fk.table === table
  )
  const triggers = snapshot.triggers.filter((t) => t.schema === schema && t.table === table)

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
      <Section title="Columns" count={relation.columns.length}>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-subtle">
              <th className="py-1 pr-4 font-medium">Column</th>
              <th className="py-1 pr-4 font-medium">Type</th>
              <th className="py-1 pr-4 font-medium">Nullable</th>
              <th className="py-1 font-medium">Default</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {relation.columns.map((column) => (
              <tr key={column.name} className="border-b border-line/50">
                <td className="py-1 pr-4">
                  <span className="flex items-center gap-1">
                    {column.isPrimaryKey && (
                      <KeyRound className="h-3 w-3 shrink-0 text-warning" />
                    )}
                    <span className="text-content">{column.name}</span>
                  </span>
                </td>
                <td className="py-1 pr-4 text-muted">{column.dataType}</td>
                <td className="py-1 pr-4 text-subtle">{column.nullable ? 'YES' : 'NO'}</td>
                <td className="py-1 text-subtle">{column.defaultValue ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {indexes.length > 0 && (
        <Section title="Indexes" count={indexes.length}>
          <div className="space-y-1">
            {indexes.map((index) => (
              <div
                key={index.name}
                className="rounded-md border border-line bg-app px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[12px] text-content">{index.name}</span>
                  {index.isPrimary && (
                    <span className="rounded bg-warning/15 px-1 text-[10px] text-warning">
                      PRIMARY
                    </span>
                  )}
                  {index.isUnique && !index.isPrimary && (
                    <span className="rounded bg-accent-soft px-1 text-[10px] text-accent">
                      UNIQUE
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-subtle">{index.definition}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {foreignKeys.length > 0 && (
        <Section title="Foreign Keys" count={foreignKeys.length}>
          <div className="space-y-1">
            {foreignKeys.map((fk) => (
              <div
                key={fk.constraintName}
                className="rounded-md border border-line bg-app px-2 py-1.5 font-mono text-[12px]"
              >
                <span className="text-content">({fk.columns.join(', ')})</span>
                <span className="mx-1.5 text-subtle">→</span>
                <span className="text-accent">
                  {fk.referencedSchema}.{fk.referencedTable}
                </span>
                <span className="text-muted">({fk.referencedColumns.join(', ')})</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {triggers.length > 0 && (
        <Section title="Triggers" count={triggers.length}>
          <div className="space-y-1">
            {triggers.map((trigger) => (
              <div
                key={trigger.name}
                className="rounded-md border border-line bg-app px-2 py-1.5"
              >
                <span className="font-mono text-[12px] text-content">{trigger.name}</span>
                <span className="ml-1.5 text-[11px] text-subtle">
                  {trigger.timing} {trigger.events}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
