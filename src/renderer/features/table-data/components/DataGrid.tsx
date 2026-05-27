import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Braces,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Code,
  Copy,
  CopyPlus,
  Database,
  Download,
  Eraser,
  FileCode2,
  FileSpreadsheet,
  KeyRound,
  ListChecks,
  MinusCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { clamp } from '@renderer/utils/clamp'
import { ipc } from '@renderer/services/ipc'
import { ContextMenu, type ContextMenuEntry } from '@renderer/components/ContextMenu'
import {
  useTableDataStore,
  type TableTabData
} from '@renderer/features/table-data/stores/tableDataStore'
import { refreshTable, toggleTableSort } from '@renderer/features/table-data/runner'
import {
  coerceInput,
  computeRowKey,
  primaryKeyIndexes
} from '@renderer/features/table-data/utils'
import {
  buildSqlInserts,
  columnValuesText,
  rowsCsv,
  rowsJson
} from '@renderer/features/table-data/utils/grid-clipboard'
import {
  CellEditorModal,
  type CellEditorTarget
} from '@renderer/features/table-data/components/CellEditorModal'
import { ImportModal } from '@renderer/features/explorer/components/ImportModal'
import { SqlImportModal } from '@renderer/features/explorer/components/SqlImportModal'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import { formatCellValue, isNull } from '@renderer/features/results/utils/format-cell'
import type { DatabaseEngine } from '@shared/types/connection'
import type { SqlImportKind } from '@shared/types/query'

const ROW_HEIGHT = 28
const DEFAULT_COL_WIDTH = 180
const MIN_COL_WIDTH = 64
const MAX_COL_WIDTH = 720
const ROWNUM_WIDTH = 52
const CHECK_WIDTH = 36

interface EditingCell {
  rowId: string
  colIndex: number
}

interface ColumnDrag {
  column: string
  width: number
}

/** Cursor + identity of a right-clicked cell. `isNewRow` switches the menu
 *  to the new-row variant and `tempId` lets us patch it via editNewRow. */
interface GridMenu {
  x: number
  y: number
  rowKey: string
  isNewRow: boolean
  tempId: string | null
  colIndex: number
  value: unknown
}

/** A picked import file (CSV/JSON) handed to the ImportModal. */
interface GridImportState {
  format: 'csv' | 'json'
  fileName: string
  content: string
  error?: string
}

interface GridSqlImportState {
  path: string
  name: string
  size: number
  preview: string
  kind: SqlImportKind
  error?: string
}

interface DataGridProps {
  tabId: string
  data: TableTabData
}

/** Loose heuristic — keep TablePlus-style "Empty String" disabled on
 *  obviously-numeric / boolean / date columns. */
function looksLikeTextColumn(dataType: string): boolean {
  const t = dataType.toLowerCase()
  return (
    t.includes('char') ||
    t.includes('text') ||
    t.includes('string') ||
    t.includes('json') ||
    t === 'xml' ||
    t === 'uuid' ||
    t.includes('enum') ||
    t.includes('citext')
  )
}

/** Editable, virtualized grid with resizable columns for the table data viewer. */
export function DataGrid({ tabId, data }: DataGridProps): ReactNode {
  const store = useTableDataStore
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<ColumnDrag | null>(null)
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [draft, setDraft] = useState('')
  const [drag, setDrag] = useState<ColumnDrag | null>(null)
  const [menu, setMenu] = useState<GridMenu | null>(null)
  const [cellEditor, setCellEditor] = useState<CellEditorTarget | null>(null)
  const [importState, setImportState] = useState<GridImportState | null>(null)
  const [sqlImport, setSqlImport] = useState<GridSqlImportState | null>(null)
  // NOTE: cascade ("Smart delete") state + modal are intentionally removed
  // from the grid while the feature is hidden. To restore, bring back the
  // `cascadeTarget`/`setCascadeTarget` state and the `<CascadeDeleteModal>`
  // slot near the bottom of this component.
  // The focused cell — left-click sets it, right-click also focuses before
  // opening the menu. Cleared whenever the page swaps (its rowKey may be gone).
  const [active, setActive] = useState<{ rowKey: string; colIndex: number } | null>(
    null
  )

  // Look up the parent table tab so menu actions can quote the relation,
  // pick the engine for SQL Insert output, and open the right Import modal.
  const tab = useEditorStore((s) => {
    const found = s.tabs.find((t) => t.id === tabId)
    return found && found.kind === 'table' ? found : null
  })
  const engine: DatabaseEngine =
    useConnectionStore((s) =>
      tab ? s.connections.find((c) => c.id === tab.connectionId)?.engine : undefined
    ) ?? 'postgres'

  const page = data.page
  const pkIndexes = useMemo(
    () => (page ? primaryKeyIndexes(page.columns) : []),
    [page]
  )

  // A fresh page can render different rowKeys — drop the stale active cell.
  useEffect(() => setActive(null), [page])

  const virtualizer = useVirtualizer({
    count: page ? page.rows.length + data.newRows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  if (!page) return null

  const { columns, rows, editable } = page

  const widthOf = (name: string): number => {
    if (drag && drag.column === name) return drag.width
    return data.columnWidths[name] ?? DEFAULT_COL_WIDTH
  }

  const totalWidth =
    (editable ? CHECK_WIDTH : 0) +
    ROWNUM_WIDTH +
    columns.reduce((sum, column) => sum + widthOf(column.name), 0)

  const startColumnResize = (event: ReactPointerEvent, columnName: string): void => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = widthOf(columnName)

    const onMove = (moveEvent: PointerEvent): void => {
      const width = clamp(
        startWidth + moveEvent.clientX - startX,
        MIN_COL_WIDTH,
        MAX_COL_WIDTH
      )
      dragRef.current = { column: columnName, width }
      setDrag(dragRef.current)
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      if (dragRef.current) {
        store.getState().setColumnWidth(tabId, dragRef.current.column, dragRef.current.width)
      }
      dragRef.current = null
      setDrag(null)
    }

    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const beginEdit = (rowId: string, colIndex: number, value: unknown): void => {
    if (!editable) return
    setEditing({ rowId, colIndex })
    setDraft(isNull(value) ? '' : formatCellValue(value))
  }

  const commitEdit = (): void => {
    if (!editing) return
    const column = columns[editing.colIndex]
    const value = coerceInput(draft, column)
    if (editing.rowId.startsWith('new:')) {
      store.getState().editNewRow(tabId, editing.rowId.slice(4), column.name, value)
    } else {
      store.getState().editExisting(tabId, editing.rowId, column.name, value)
    }
    setEditing(null)
  }

  const renderCell = (
    rowId: string,
    colIndex: number,
    value: unknown,
    dirty: boolean
  ): ReactNode => {
    const isEditingThis = editing?.rowId === rowId && editing.colIndex === colIndex
    if (isEditingThis) {
      return (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitEdit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitEdit()
            else if (event.key === 'Escape') setEditing(null)
          }}
          className="h-full w-full select-text bg-app px-2 text-[12px] text-content outline-none ring-1 ring-inset ring-accent"
        />
      )
    }
    return (
      <div
        onDoubleClick={() => beginEdit(rowId, colIndex, value)}
        title={formatCellValue(value)}
        className={cn('h-full truncate px-2 leading-[27px]', dirty && 'bg-accent-soft')}
      >
        {isNull(value) ? (
          <span className="italic text-subtle">NULL</span>
        ) : (
          <span className="text-content">{formatCellValue(value)}</span>
        )}
      </div>
    )
  }

  // --- Right-click menu plumbing -------------------------------------------

  const handleCellContextMenu = (
    event: ReactMouseEvent,
    rowKey: string,
    isNewRow: boolean,
    tempId: string | null,
    colIndex: number,
    value: unknown
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    // Focus the right-clicked cell so the user can see what the menu acts on.
    setActive({ rowKey, colIndex })
    setMenu({ x: event.clientX, y: event.clientY, rowKey, isNewRow, tempId, colIndex, value })
  }

  /** Stage a new value into the right-clicked cell, choosing the right action. */
  const stageCellValue = (m: GridMenu, value: unknown): void => {
    const column = page.columns[m.colIndex]
    if (m.isNewRow && m.tempId) {
      store.getState().editNewRow(tabId, m.tempId, column.name, value)
    } else {
      store.getState().editExisting(tabId, m.rowKey, column.name, value)
    }
  }

  /** Native dialog opened from the menu (not from a modal effect — StrictMode safe). */
  const openImportFile = async (format: 'csv' | 'json'): Promise<void> => {
    const result = await ipc.file.open({ format })
    if (result.ok && result.data.canceled) return
    setImportState({
      format,
      fileName: result.ok ? (result.data.name ?? '') : '',
      content: result.ok ? (result.data.content ?? '') : '',
      error: result.ok ? undefined : result.error.message
    })
  }

  const openSqlImportFile = async (): Promise<void> => {
    const result = await ipc.file.openSql()
    if (result.ok && result.data.canceled) return
    if (!result.ok) {
      setSqlImport({
        path: '',
        name: '',
        size: 0,
        preview: '',
        kind: 'plain',
        error: result.error.message
      })
      return
    }
    setSqlImport({
      path: result.data.path ?? '',
      name: result.data.name ?? '',
      size: result.data.size ?? 0,
      preview: result.data.preview ?? '',
      kind: result.data.kind ?? 'plain'
    })
  }

  /** Build the items for a right-click on the given grid cell. */
  const buildGridMenu = (m: GridMenu): ContextMenuEntry[] => {
    if (!page || !tab) return []
    const { columns: pageColumns, rows: pageRows } = page
    const column = pageColumns[m.colIndex]

    // Materialize a current snapshot of each existing row, staged edits applied.
    const rowByKey = new Map<string, unknown[]>()
    for (const row of pageRows) rowByKey.set(computeRowKey(row, pkIndexes), row)
    const overlay = (rowKey: string): unknown[] | null => {
      const row = rowByKey.get(rowKey)
      if (!row) return null
      const edits = data.edits[rowKey]
      if (!edits || Object.keys(edits).length === 0) return row
      return pageColumns.map((c, i) => (c.name in edits ? edits[c.name] : row[i]))
    }

    // Row-set semantics: if the right-clicked row is in the selection, the
    // selection is the target; otherwise it's just this row. New (staged)
    // rows are never bundled with the selection.
    const includesMe =
      !m.isNewRow && data.selected.length > 0 && data.selected.includes(m.rowKey)
    const targetRowKeys = includesMe
      ? data.selected
      : m.isNewRow
        ? []
        : [m.rowKey]
    const targetRows: unknown[][] = []
    for (const rowKey of targetRowKeys) {
      const row = overlay(rowKey)
      if (row) targetRows.push(row)
    }

    // The cell value, respecting staged edits.
    const myRow = !m.isNewRow ? overlay(m.rowKey) : null
    const cellValue = myRow ? myRow[m.colIndex] : m.value

    const copy = (text: string): void => void navigator.clipboard.writeText(text)

    const onQuickLook = (): void => {
      setCellEditor({
        rowKey: m.rowKey,
        tempId: m.isNewRow ? m.tempId : null,
        column,
        value: cellValue
      })
    }

    const onPaste = async (): Promise<void> => {
      try {
        const text = await navigator.clipboard.readText()
        stageCellValue(m, coerceInput(text, column))
      } catch (err) {
        window.alert(
          'Paste failed — the browser blocked clipboard access. ' +
            (err instanceof Error ? err.message : String(err))
        )
      }
    }

    const onDuplicate = (): void => {
      const sourceRow = overlay(m.rowKey)
      if (!sourceRow) return
      store.getState().addRow(tabId)
      // The freshly-added row is always at the end of newRows.
      const tempId = useTableDataStore.getState().tabs[tabId]?.newRows.at(-1)?.tempId
      if (!tempId) return
      // Skip primary-key columns so the driver auto-generates / the user fills in.
      pageColumns.forEach((c, i) => {
        if (c.isPrimaryKey) return
        store.getState().editNewRow(tabId, tempId, c.name, sourceRow[i])
      })
    }

    const onDelete = (): void => {
      if (m.isNewRow && m.tempId) {
        store.getState().discardNewRow(tabId, m.tempId)
        return
      }
      if (includesMe) {
        store.getState().deleteSelected(tabId)
      } else {
        store.getState().toggleDeleted(tabId, m.rowKey)
      }
    }

    const exportPage = (format: 'csv' | 'json'): void => {
      const safeName = tab.table.replace(/[^a-z0-9_-]+/gi, '_')
      const defaultName = `${safeName}-page-${data.pageIndex + 1}.${format}`
      const content =
        format === 'csv' ? rowsCsv(pageColumns, pageRows) : rowsJson(pageColumns, pageRows)
      void ipc.file.export({ defaultName, content })
    }

    const isTextColumn = looksLikeTextColumn(column.dataType)
    const canDelete = m.isNewRow ? Boolean(m.tempId) : true
    const deleteLabel = m.isNewRow
      ? 'Discard new row'
      : includesMe
        ? `Delete ${data.selected.length} rows`
        : 'Delete'

    return [
      {
        id: 'quick-look',
        label: 'Quick Look Editor',
        icon: <Pencil className="h-3.5 w-3.5" />,
        shortcut: '⌘↵',
        onSelect: onQuickLook
      },
      {
        id: 'refresh',
        label: 'Refresh',
        icon: <RefreshCw className="h-3.5 w-3.5" />,
        shortcut: '⌥⌘R',
        onSelect: () => refreshTable(tabId)
      },
      { separator: true },
      {
        id: 'paste',
        label: 'Paste',
        icon: <ClipboardPaste className="h-3.5 w-3.5" />,
        shortcut: '⌘V',
        onSelect: () => void onPaste()
      },
      {
        id: 'add-row',
        label: 'Add Row',
        icon: <Plus className="h-3.5 w-3.5" />,
        shortcut: '⌘I',
        onSelect: () => store.getState().addRow(tabId)
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        icon: <CopyPlus className="h-3.5 w-3.5" />,
        shortcut: '⌘D',
        disabled: m.isNewRow,
        onSelect: onDuplicate
      },
      { separator: true },
      {
        id: 'set-value',
        label: 'Set Value',
        icon: <ListChecks className="h-3.5 w-3.5" />,
        shortcut: '⌥↵',
        submenu: [
          {
            id: 'set-null',
            label: 'NULL',
            icon: <MinusCircle className="h-3.5 w-3.5" />,
            disabled: !column.nullable,
            onSelect: () => stageCellValue(m, null)
          },
          {
            id: 'set-empty',
            label: 'Empty String',
            icon: <Eraser className="h-3.5 w-3.5" />,
            disabled: !isTextColumn,
            onSelect: () => stageCellValue(m, '')
          },
          {
            id: 'set-default',
            // Driver omits null on INSERT for columns with DEFAULT — best-effort.
            label: 'Default',
            icon: <RotateCcw className="h-3.5 w-3.5" />,
            onSelect: () => stageCellValue(m, null)
          }
        ]
      },
      { separator: true },
      {
        id: 'copy',
        label: 'Copy',
        icon: <Copy className="h-3.5 w-3.5" />,
        shortcut: '⌘C',
        onSelect: () => copy(isNull(cellValue) ? '' : formatCellValue(cellValue))
      },
      {
        id: 'copy-cell',
        label: 'Copy Cell Value',
        icon: <Copy className="h-3.5 w-3.5" />,
        shortcut: '⇧⌘C',
        onSelect: () => copy(isNull(cellValue) ? '' : formatCellValue(cellValue))
      },
      {
        id: 'copy-column',
        label: 'Copy All Column Values',
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => copy(columnValuesText(pageRows, m.colIndex))
      },
      {
        id: 'copy-rows',
        label: 'Copy Rows As',
        icon: <Copy className="h-3.5 w-3.5" />,
        disabled: targetRows.length === 0,
        submenu: [
          {
            id: 'copy-rows-csv',
            label: 'CSV',
            icon: <FileSpreadsheet className="h-3.5 w-3.5" />,
            onSelect: () => copy(rowsCsv(pageColumns, targetRows))
          },
          {
            id: 'copy-rows-json',
            label: 'JSON',
            icon: <Braces className="h-3.5 w-3.5" />,
            onSelect: () => copy(rowsJson(pageColumns, targetRows))
          },
          {
            id: 'copy-rows-sql',
            label: 'SQL Insert',
            icon: <Code className="h-3.5 w-3.5" />,
            onSelect: () =>
              copy(buildSqlInserts(engine, tab.schema, tab.table, pageColumns, targetRows))
          }
        ]
      },
      { separator: true },
      {
        id: 'import',
        label: 'Import',
        icon: <Upload className="h-3.5 w-3.5" />,
        submenu: [
          {
            id: 'import-csv',
            label: 'From CSV…',
            icon: <FileSpreadsheet className="h-3.5 w-3.5" />,
            onSelect: () => void openImportFile('csv')
          },
          {
            id: 'import-json',
            label: 'From JSON…',
            icon: <Braces className="h-3.5 w-3.5" />,
            onSelect: () => void openImportFile('json')
          },
          {
            id: 'import-sql',
            label: 'From SQL dump…',
            icon: <Database className="h-3.5 w-3.5" />,
            onSelect: () => void openSqlImportFile()
          }
        ]
      },
      {
        id: 'export-page',
        label: 'Export current page…',
        icon: <Download className="h-3.5 w-3.5" />,
        submenu: [
          {
            id: 'export-page-csv',
            label: 'as CSV',
            icon: <FileSpreadsheet className="h-3.5 w-3.5" />,
            onSelect: () => exportPage('csv')
          },
          {
            id: 'export-page-json',
            label: 'as JSON',
            icon: <FileCode2 className="h-3.5 w-3.5" />,
            onSelect: () => exportPage('json')
          }
        ]
      },
      { separator: true },
      // Smart delete (cascade) is temporarily hidden from the menu. The
      // scanner, IPC, and modal still live in the codebase — re-add a
      // menu entry that calls setCascadeTarget(...) and remount the
      // <CascadeDeleteModal> slot below to bring it back.
      {
        id: 'delete',
        label: deleteLabel,
        icon: m.isNewRow ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />,
        shortcut: '⌫',
        danger: true,
        disabled: !canDelete,
        onSelect: onDelete
      }
    ]
  }

  const cellEditorColumn = cellEditor?.column.name
  const onCellEditorSave = (value: unknown): void => {
    if (!cellEditor) return
    if (cellEditor.tempId) {
      store.getState().editNewRow(tabId, cellEditor.tempId, cellEditor.column.name, value)
    } else {
      store.getState().editExisting(tabId, cellEditor.rowKey, cellEditor.column.name, value)
    }
  }
  // Suppress an unused-variable warning if React fast-refresh trims the
  // cellEditorColumn lookup in the future — it's referenced via cellEditor.
  void cellEditorColumn

  return (
    <div ref={scrollRef} className="h-full overflow-auto font-mono">
      <div style={{ width: totalWidth }} className="relative">
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex border-b border-line bg-surface"
          style={{ height: ROW_HEIGHT }}
        >
          {editable && (
            <div style={{ width: CHECK_WIDTH }} className="shrink-0 border-r border-line" />
          )}
          <div style={{ width: ROWNUM_WIDTH }} className="shrink-0 border-r border-line" />
          {columns.map((column) => {
            const sorted = data.orderBy === column.name
            return (
              <div
                key={column.name}
                style={{ width: widthOf(column.name) }}
                className="relative shrink-0 border-r border-line"
              >
                <button
                  type="button"
                  onClick={() => toggleTableSort(tabId, column.name)}
                  className="flex h-full w-full items-center gap-1 px-2 text-left hover:bg-elevated"
                  title={`${column.name} · ${column.dataType}`}
                >
                  {column.isPrimaryKey && (
                    <KeyRound className="h-3 w-3 shrink-0 text-warning" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-content">
                    {column.name}
                  </span>
                  {sorted &&
                    (data.orderDir === 'asc' ? (
                      <ChevronUp className="h-3 w-3 shrink-0 text-accent" />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0 text-accent" />
                    ))}
                </button>
                <div
                  onPointerDown={(event) => startColumnResize(event, column.name)}
                  onDoubleClick={(event) => event.stopPropagation()}
                  title="Drag to resize column"
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent/60"
                />
              </div>
            )
          })}
        </div>

        {/* Virtualized rows */}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const isExisting = virtualRow.index < rows.length
            const rowStyle = {
              top: virtualRow.start,
              height: ROW_HEIGHT,
              width: totalWidth
            }

            if (isExisting) {
              const row = rows[virtualRow.index]
              const rowKey = computeRowKey(row, pkIndexes)
              const rowEdits = data.edits[rowKey]
              const isDeleted = data.deleted.includes(rowKey)
              const isSelected = data.selected.includes(rowKey)
              const isActiveRow = active?.rowKey === rowKey
              return (
                <div
                  key={rowKey}
                  className={cn(
                    'absolute left-0 flex border-b border-line/50 text-[12px]',
                    isDeleted && 'bg-danger/10 text-subtle line-through',
                    isSelected && !isDeleted && 'bg-accent-soft',
                    isActiveRow && !isSelected && !isDeleted && 'bg-row-active'
                  )}
                  style={rowStyle}
                >
                  {editable && (
                    <div
                      style={{ width: CHECK_WIDTH }}
                      className="flex shrink-0 items-center justify-center border-r border-line"
                    >
                      {isDeleted ? (
                        <button
                          type="button"
                          aria-label="Restore row"
                          onClick={() => store.getState().toggleDeleted(tabId, rowKey)}
                          className="text-subtle hover:text-content"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => store.getState().toggleSelected(tabId, rowKey)}
                          className="accent-accent"
                        />
                      )}
                    </div>
                  )}
                  <div
                    style={{ width: ROWNUM_WIDTH }}
                    className="shrink-0 border-r border-line bg-surface px-2 text-right text-[11px] leading-[27px] text-subtle"
                  >
                    {virtualRow.index + 1}
                  </div>
                  {columns.map((column, colIndex) => {
                    const edited = rowEdits ? column.name in rowEdits : false
                    const value = edited ? rowEdits[column.name] : row[colIndex]
                    return (
                      <div
                        key={column.name}
                        style={{ width: widthOf(column.name) }}
                        onClick={() => setActive({ rowKey, colIndex })}
                        onContextMenu={(event) =>
                          handleCellContextMenu(event, rowKey, false, null, colIndex, value)
                        }
                        className="shrink-0 overflow-hidden border-r border-line/50"
                      >
                        {renderCell(rowKey, colIndex, value, edited && !isDeleted)}
                      </div>
                    )
                  })}
                </div>
              )
            }

            // New (staged) row
            const newRow = data.newRows[virtualRow.index - rows.length]
            const rowId = `new:${newRow.tempId}`
            const isActiveNewRow = active?.rowKey === rowId
            return (
              <div
                key={rowId}
                className={cn(
                  'absolute left-0 flex border-b border-line/50 bg-success/10 text-[12px]',
                  // Thin accent stripe on the row's left edge marks the focused
                  // new row without overriding the green "unsaved" tint.
                  isActiveNewRow &&
                    'before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-0.5 before:bg-accent'
                )}
                style={rowStyle}
              >
                {editable && (
                  <div
                    style={{ width: CHECK_WIDTH }}
                    className="flex shrink-0 items-center justify-center border-r border-line"
                  >
                    <button
                      type="button"
                      aria-label="Discard new row"
                      onClick={() => store.getState().discardNewRow(tabId, newRow.tempId)}
                      className="text-subtle hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div
                  style={{ width: ROWNUM_WIDTH }}
                  className="shrink-0 border-r border-line bg-surface px-2 text-right text-[11px] leading-[27px] text-success"
                >
                  new
                </div>
                {columns.map((column, colIndex) => {
                  const has = column.name in newRow.values
                  const cellValue = has ? newRow.values[column.name] : ''
                  return (
                    <div
                      key={column.name}
                      style={{ width: widthOf(column.name) }}
                      onClick={() => setActive({ rowKey: rowId, colIndex })}
                      onContextMenu={(event) =>
                        handleCellContextMenu(event, rowId, true, newRow.tempId, colIndex, cellValue)
                      }
                      className="shrink-0 overflow-hidden border-r border-line/50"
                    >
                      {renderCell(rowId, colIndex, cellValue, false)}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={buildGridMenu(menu)}
          onClose={() => setMenu(null)}
        />
      )}

      {cellEditor && (
        <CellEditorModal
          target={cellEditor}
          onSave={onCellEditorSave}
          onClose={() => setCellEditor(null)}
        />
      )}

      {importState && tab && (
        <ImportModal
          connectionId={tab.connectionId}
          schema={tab.schema}
          format={importState.format}
          fileName={importState.fileName}
          content={importState.content}
          error={importState.error}
          onClose={() => setImportState(null)}
        />
      )}

      {sqlImport && tab && (
        <SqlImportModal
          connectionId={tab.connectionId}
          path={sqlImport.path}
          name={sqlImport.name}
          size={sqlImport.size}
          preview={sqlImport.preview}
          kind={sqlImport.kind}
          error={sqlImport.error}
          onClose={() => setSqlImport(null)}
        />
      )}

    </div>
  )
}
