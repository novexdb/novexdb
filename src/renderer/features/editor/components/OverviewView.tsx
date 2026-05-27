import type { ReactNode } from 'react'
import { Eye, Sheet, Table2 } from 'lucide-react'
import { useExplorerStore } from '@renderer/features/explorer/stores/explorerStore'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import { formatRowEstimate } from '@renderer/features/explorer/utils'
import type { RelationKind } from '@shared/types/schema'

const KIND_ICON = {
  table: Table2,
  view: Eye,
  materialized_view: Sheet
} as const

const KIND_LABEL: Record<RelationKind, string> = {
  table: 'Table',
  view: 'View',
  materialized_view: 'Materialized view'
}

interface OverviewViewProps {
  connectionId: string
  schema: string
}

/** A read-only overview tab listing every relation in one schema. */
export function OverviewView({ connectionId, schema }: OverviewViewProps): ReactNode {
  const snapshot = useExplorerStore((s) => s.snapshots[connectionId])
  const openTableTab = useEditorStore((s) => s.openTableTab)

  if (!snapshot) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
        <p className="text-xs text-subtle">
          Schema not loaded — open or refresh the Explorer.
        </p>
      </div>
    )
  }

  const relations = snapshot.relations
    .filter((r) => r.schema === schema)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-app">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-content">{schema}</h2>
        <p className="mt-0.5 text-xs text-subtle">
          {relations.length} {relations.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {relations.length === 0 ? (
        <p className="px-4 py-6 text-xs text-subtle">This schema has no tables or views.</p>
      ) : (
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-subtle">
              <th className="py-1.5 pl-4 pr-4 font-medium">Name</th>
              <th className="py-1.5 pr-4 font-medium">Kind</th>
              <th className="py-1.5 pr-4 text-right font-medium">Columns</th>
              <th className="py-1.5 pr-4 text-right font-medium">Rows (est.)</th>
            </tr>
          </thead>
          <tbody>
            {relations.map((relation) => {
              const Icon = KIND_ICON[relation.kind]
              return (
                <tr
                  key={relation.name}
                  onClick={() => openTableTab(connectionId, schema, relation.name)}
                  className="cursor-pointer border-b border-line/50 transition-colors hover:bg-surface"
                >
                  <td className="py-1.5 pl-4 pr-4">
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="text-content">{relation.name}</span>
                    </span>
                  </td>
                  <td className="py-1.5 pr-4 text-muted">{KIND_LABEL[relation.kind]}</td>
                  <td className="py-1.5 pr-4 text-right text-subtle">
                    {relation.columns.length}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-subtle">
                    {relation.estimatedRows !== null
                      ? formatRowEstimate(relation.estimatedRows)
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
