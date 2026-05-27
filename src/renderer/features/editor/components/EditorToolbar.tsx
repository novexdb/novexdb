import type { ReactNode } from 'react'
import { AlignLeft, Play, Sparkles, Square } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { Dropdown } from '@renderer/components/Dropdown'
import { formatActiveTab } from '@renderer/features/editor/utils/format'
import { getActiveSql } from '@renderer/features/editor/monaco/activeEditor'
import { cancelActiveQuery, runActiveQuery } from '@renderer/features/results/runner'
import { explainSql, optimizeSql } from '@renderer/features/ai/runner'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useResultStore } from '@renderer/features/results/stores/resultStore'

/** Action row above the SQL editor: run/cancel, format, AI actions, status. */
export function EditorToolbar(): ReactNode {
  const activeId = useConnectionStore((s) => s.activeConnectionId)
  const active = useConnectionStore(
    (s) => s.connections.find((c) => c.id === activeId) ?? null
  )
  const running = useResultStore((s) => s.status === 'running')

  const withSql = (action: (sql: string) => void): void => {
    const sql = getActiveSql().trim()
    if (sql) action(sql)
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-2">
      {running ? (
        <Button size="sm" variant="danger" onClick={() => void cancelActiveQuery()}>
          <Square className="h-3 w-3" />
          Cancel
        </Button>
      ) : (
        <Button
          size="sm"
          variant="primary"
          disabled={!activeId}
          title={activeId ? 'Run query (⌘↵)' : 'Connect to a database first'}
          onClick={() => runActiveQuery()}
        >
          <Play className="h-3.5 w-3.5" />
          Run
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => formatActiveTab()}>
        <AlignLeft className="h-3.5 w-3.5" />
        Format
      </Button>
      <Dropdown
        align="left"
        trigger={
          <Button size="sm" variant="secondary">
            <Sparkles className="h-3.5 w-3.5" />
            AI
          </Button>
        }
        items={[
          { label: 'Explain query', onSelect: () => withSql((sql) => void explainSql(sql)) },
          { label: 'Optimize query', onSelect: () => withSql((sql) => void optimizeSql(sql)) }
        ]}
      />

      <span className="flex-1" />

      {active ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: active.color }}
          />
          {active.name}
        </div>
      ) : (
        <span className="text-[11px] text-subtle">No connection · autocomplete limited</span>
      )}
    </div>
  )
}
