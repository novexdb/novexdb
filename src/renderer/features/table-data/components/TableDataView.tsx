import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { Select } from '@renderer/components/Select'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import {
  createTabData,
  useTableDataStore,
  type TableTabData
} from '@renderer/features/table-data/stores/tableDataStore'
import { changePageSize, goToPage, loadTablePage } from '@renderer/features/table-data/runner'
import { DataToolbar, type TableViewMode } from '@renderer/features/table-data/components/DataToolbar'
import { DataGrid } from '@renderer/features/table-data/components/DataGrid'
import { StructurePanel } from '@renderer/features/table-data/components/StructurePanel'
import { PAGE_SIZE_OPTIONS } from '@shared/types/table-data'

function PaginationBar({ tabId, data }: { tabId: string; data: TableTabData }): ReactNode {
  const page = data.page
  if (!page) return null

  const totalPages = Math.max(1, Math.ceil(page.totalRows / data.pageSize))
  const currentPage = data.pageIndex + 1
  const from = page.totalRows === 0 ? 0 : data.pageIndex * data.pageSize + 1
  const to = data.pageIndex * data.pageSize + page.rows.length

  const navButton =
    'flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-surface disabled:opacity-30'

  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-t border-line bg-surface px-3 text-[11px] text-subtle">
      <span>
        {from.toLocaleString()}–{to.toLocaleString()} of {page.totalRows.toLocaleString()}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        aria-label="Previous page"
        className={navButton}
        disabled={data.pageIndex === 0}
        onClick={() => goToPage(tabId, data.pageIndex - 1)}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="text-muted">
        Page {currentPage} / {totalPages}
      </span>
      <button
        type="button"
        aria-label="Next page"
        className={navButton}
        disabled={currentPage >= totalPages}
        onClick={() => goToPage(tabId, data.pageIndex + 1)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <Select
        value={data.pageSize}
        onChange={(event) => changePageSize(tabId, Number(event.target.value))}
        className="h-6 w-auto text-[11px]"
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size} / page
          </option>
        ))}
      </Select>
    </div>
  )
}

/** The Data tab body — loading / error states, then the editable grid. */
function DataBody({ tabId, data }: { tabId: string; data: TableTabData }): ReactNode {
  if (!data.page) {
    if (data.status === 'error') {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <AlertCircle className="h-5 w-5 text-danger" />
          <p className="text-xs text-muted">{data.error}</p>
          <button
            type="button"
            onClick={() => void loadTablePage(tabId)}
            className="text-xs font-medium text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      )
    }
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-xs text-subtle">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading table…
      </div>
    )
  }

  return (
    <>
      {data.error && (
        <div className={cn('flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-3 py-1.5')}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
          <span className="font-mono text-[11px] text-danger">{data.error}</span>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <DataGrid tabId={tabId} data={data} />
      </div>
      <PaginationBar tabId={tabId} data={data} />
    </>
  )
}

/** The table viewer: a Data tab (paginated editable grid) and a Structure tab. */
export function TableDataView({ tabId }: { tabId: string }): ReactNode {
  const tab = useEditorStore((s) => {
    const found = s.tabs.find((t) => t.id === tabId)
    return found && found.kind === 'table' ? found : null
  })
  const [viewMode, setViewMode] = useState<TableViewMode>(tab?.initialView ?? 'data')
  const data = useTableDataStore((s) => s.tabs[tabId])

  useEffect(() => {
    const existing = useTableDataStore.getState().tabs[tabId]
    if (!existing || existing.status === 'idle') void loadTablePage(tabId)
  }, [tabId])

  if (!tab) return null
  const effective = data ?? createTabData()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DataToolbar
        tabId={tabId}
        data={effective}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      {viewMode === 'structure' ? (
        <StructurePanel connectionId={tab.connectionId} schema={tab.schema} table={tab.table} />
      ) : (
        <DataBody tabId={tabId} data={effective} />
      )}
    </div>
  )
}
