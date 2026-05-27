import type { ReactNode } from 'react'
import { Lock, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { Button } from '@renderer/components/Button'
import { Input } from '@renderer/components/Input'
import { useTableDataStore, type TableTabData } from '@renderer/features/table-data/stores/tableDataStore'
import { refreshTable, saveTableChanges, setTableSearch } from '@renderer/features/table-data/runner'
import { hasStagedChanges, pendingCounts } from '@renderer/features/table-data/utils'

export type TableViewMode = 'data' | 'structure'

function summarize(counts: ReturnType<typeof pendingCounts>): string {
  const parts: string[] = []
  if (counts.added) parts.push(`${counts.added} added`)
  if (counts.edited) parts.push(`${counts.edited} edited`)
  if (counts.removed) parts.push(`${counts.removed} to delete`)
  return parts.join(' · ')
}

function ViewModeTabs({
  value,
  onChange
}: {
  value: TableViewMode
  onChange: (mode: TableViewMode) => void
}): ReactNode {
  const tab = (mode: TableViewMode, label: string): ReactNode => (
    <button
      type="button"
      onClick={() => onChange(mode)}
      className={cn(
        'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
        value === mode ? 'bg-accent text-white' : 'text-muted hover:text-content'
      )}
    >
      {label}
    </button>
  )
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-app p-0.5">
      {tab('data', 'Data')}
      {tab('structure', 'Structure')}
    </div>
  )
}

interface DataToolbarProps {
  tabId: string
  data: TableTabData
  viewMode: TableViewMode
  onViewModeChange: (mode: TableViewMode) => void
}

/** Top action row of the table viewer — Data/Structure toggle + data actions. */
export function DataToolbar({
  tabId,
  data,
  viewMode,
  onViewModeChange
}: DataToolbarProps): ReactNode {
  const editable = data.page?.editable ?? false
  const counts = pendingCounts(data)
  const dirty = hasStagedChanges(data)
  const saving = data.status === 'saving'
  const selectedCount = data.selected.length
  const store = useTableDataStore

  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-2">
      <ViewModeTabs value={viewMode} onChange={onViewModeChange} />

      {viewMode === 'structure' ? (
        <span className="flex-1" />
      ) : (
        <>
          <div className="h-4 w-px bg-line" />
          <Button size="sm" variant="secondary" onClick={() => refreshTable(tabId)} disabled={saving}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>

          {editable ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => store.getState().addRow(tabId)}
                disabled={saving}
              >
                <Plus className="h-3.5 w-3.5" />
                Add row
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={selectedCount === 0 || saving}
                onClick={() => store.getState().deleteSelected(tabId)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </Button>
            </>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-subtle">
              <Lock className="h-3 w-3" />
              Read-only · no primary key
            </span>
          )}

          <span className="flex-1" />

          {data.page && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-subtle" />
              <Input
                value={data.search}
                placeholder="Search this table…"
                onChange={(event) => setTableSearch(tabId, event.target.value)}
                className="h-7 w-56 pl-7 pr-6 text-xs"
              />
              {data.search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setTableSearch(tabId, '')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-content"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {dirty && <span className="text-[11px] text-warning">{summarize(counts)}</span>}
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => store.getState().clearStaged(tabId)}
              disabled={saving}
            >
              Discard
            </Button>
          )}
          {dirty && (
            <Button
              size="sm"
              variant="primary"
              loading={saving}
              onClick={() => void saveTableChanges(tabId)}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          )}
        </>
      )}
    </div>
  )
}
