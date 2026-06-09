import { useState, type ComponentType, type MouseEvent, type ReactNode } from 'react'
import {
  Box,
  Braces,
  ChevronRight,
  Copy,
  Database,
  Download,
  Eraser,
  ExternalLink,
  Eye,
  FileCode2,
  FileSpreadsheet,
  FolderClosed,
  FunctionSquare,
  Key,
  Layers,
  ListChecks,
  ListTree,
  type LucideProps,
  Pin,
  Plus,
  Sheet,
  Table2,
  Trash2,
  Upload,
  Zap
} from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { ipc } from '@renderer/services/ipc'
import { ContextMenu, type ContextMenuEntry } from '@renderer/components/ContextMenu'
import { useExplorerStore } from '@renderer/features/explorer/stores/explorerStore'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useSchemaExplorer } from '@renderer/features/explorer/hooks/useSchemaExplorer'
import { NewTableModal } from '@renderer/features/explorer/components/NewTableModal'
import { NewViewModal } from '@renderer/features/explorer/components/NewViewModal'
import { CloneTableModal } from '@renderer/features/explorer/components/CloneTableModal'
import { ExportTableModal } from '@renderer/features/explorer/components/ExportTableModal'
import { ImportModal } from '@renderer/features/explorer/components/ImportModal'
import { SqlImportModal } from '@renderer/features/explorer/components/SqlImportModal'
import { ExportDatabaseModal } from '@renderer/features/explorer/components/ExportDatabaseModal'
import { quoteRelation } from '@renderer/utils/sql'
import type { TreeNode, TreeNodeKind } from '@renderer/features/explorer/types'
import type { DatabaseEngine } from '@shared/types/connection'
import type { PinnedTable } from '@shared/types/settings'
import type { SqlImportKind } from '@shared/types/query'

const NODE_ICON: Partial<Record<TreeNodeKind, ComponentType<LucideProps>>> = {
  schema: Box,
  group: FolderClosed,
  table: Table2,
  view: Eye,
  materialized_view: Sheet,
  function: FunctionSquare,
  procedure: FunctionSquare,
  trigger: Zap,
  index: ListTree
}

const NODE_ICON_COLOR: Partial<Record<TreeNodeKind, string>> = {
  table: 'text-accent',
  view: 'text-success',
  materialized_view: 'text-success',
  function: 'text-warning',
  procedure: 'text-warning'
}

const GROUP_ID_PREFIX = 'group:'
const TABLES_GROUP_SUFFIX = '.tables'
/** Id of the synthetic "Pinned" group rendered above the schema tree. */
const PINNED_GROUP_ID = 'group:_pinned'

/** True for the "Tables" group folder, which carries the right-click menu. */
function isTablesGroup(node: TreeNode): boolean {
  return node.kind === 'group' && node.id.endsWith(TABLES_GROUP_SUFFIX)
}

/** Extract the schema name from a `group:<schema>.tables` node id. */
function schemaOfTablesGroup(nodeId: string): string {
  return nodeId.slice(GROUP_ID_PREFIX.length, -TABLES_GROUP_SUFFIX.length)
}

type RelationKind = 'table' | 'view' | 'materialized_view'

/** True for a relation leaf — table, view, or materialized view. */
function isRelationLeaf(node: TreeNode): node is TreeNode & {
  kind: RelationKind
  openTable: { schema: string; table: string }
} {
  return (
    (node.kind === 'table' || node.kind === 'view' || node.kind === 'materialized_view') &&
    Boolean(node.openTable)
  )
}

interface TreeRowProps {
  node: TreeNode
  depth: number
  forceExpand: boolean
  onContextMenu: (node: TreeNode, event: MouseEvent) => void
}

function TreeRow({ node, depth, forceExpand, onContextMenu }: TreeRowProps): ReactNode {
  const toggleNode = useExplorerStore((s) => s.toggleNode)
  const storeExpanded = useExplorerStore((s) => s.expanded.has(node.id))
  const openTableTab = useEditorStore((s) => s.openTableTab)

  const children = node.children ?? []
  const hasChildren = children.length > 0
  // While filtering, force-expand only the schema node — the group folders
  // (Tables, Indexes, …) and tables stay collapsed until the user opens them.
  // The synthetic Pinned group is always open so its contents are visible.
  const expanded =
    (forceExpand && node.kind === 'schema') || node.id === PINNED_GROUP_ID || storeExpanded
  const Icon = NODE_ICON[node.kind]

  const openTable = (): void => {
    if (!node.openTable) return
    const connectionId = useConnectionStore.getState().activeConnectionId
    if (connectionId) {
      openTableTab(connectionId, node.openTable.schema, node.openTable.table)
    }
  }

  // Row click opens a table directly; container nodes toggle instead.
  const handleRowClick = (): void => {
    if (node.openTable) openTable()
    else if (hasChildren) toggleNode(node.id)
  }

  // The chevron always toggles expansion — that is how table columns are revealed.
  const handleChevronClick = (event: MouseEvent): void => {
    event.stopPropagation()
    if (hasChildren) toggleNode(node.id)
  }

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={handleRowClick}
        onContextMenu={(event) => onContextMenu(node, event)}
        style={{ paddingLeft: depth * 12 + 6 }}
        title={node.detail ? `${node.label} — ${node.detail}` : node.label}
        className="flex h-[26px] cursor-pointer items-center gap-1.5 pr-2 transition-colors hover:bg-surface"
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={handleChevronClick}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="flex h-full w-4 shrink-0 items-center justify-center text-subtle hover:text-content"
          >
            <ChevronRight
              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {node.kind === 'column' ? (
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              node.pk ? 'bg-warning' : 'bg-subtle'
            )}
          />
        ) : Icon ? (
          <Icon
            className={cn('h-3.5 w-3.5 shrink-0', NODE_ICON_COLOR[node.kind] ?? 'text-muted')}
          />
        ) : null}

        <span
          className={cn(
            'min-w-0 truncate text-[12px]',
            node.kind === 'column' ? 'text-muted' : 'text-content'
          )}
        >
          {node.label}
        </span>

        {node.kind === 'column' && node.pk && <Key className="h-3 w-3 shrink-0 text-warning" />}
        {typeof node.count === 'number' && (
          <span className="shrink-0 text-[10px] text-subtle">{node.count}</span>
        )}

        <span className="flex-1" />

        {node.detail && (
          <span className="max-w-[48%] shrink-0 truncate text-[10px] text-subtle">
            {node.detail}
          </span>
        )}
      </div>

      {hasChildren &&
        expanded &&
        children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            forceExpand={forceExpand}
            onContextMenu={onContextMenu}
          />
        ))}
    </>
  )
}

interface SchemaTreeProps {
  nodes: TreeNode[]
  forceExpand: boolean
}

/** Discriminated state — the Tables-folder menu and the per-row relation menu
 *  share the same `<ContextMenu>` slot but build different item lists. */
type RailMenu =
  | { kind: 'tablesGroup'; x: number; y: number; schema: string }
  | {
      kind: 'relation'
      x: number
      y: number
      schema: string
      table: string
      relationKind: RelationKind
    }

interface TableModalState {
  connectionId: string
  schema: string
}

interface CloneModalState extends TableModalState {
  table: string
}

/** A picked import file (or the error from picking it), handed to a modal. */
interface PickedFile {
  fileName: string
  content: string
  error?: string
}

interface ImportModalState extends TableModalState, PickedFile {
  format: 'csv' | 'json'
}

interface SqlImportState {
  connectionId: string
  path: string
  name: string
  size: number
  preview: string
  kind: SqlImportKind
  error?: string
}

/** Recursive schema explorer tree, with right-click menus on the Tables
 *  folder and on every table / view / materialized-view leaf. */
export function SchemaTree({ nodes, forceExpand }: SchemaTreeProps): ReactNode {
  const [menu, setMenu] = useState<RailMenu | null>(null)
  const [newTable, setNewTable] = useState<TableModalState | null>(null)
  const [newView, setNewView] = useState<TableModalState | null>(null)
  const [cloneTarget, setCloneTarget] = useState<CloneModalState | null>(null)
  const [exportTarget, setExportTarget] = useState<CloneModalState | null>(null)
  const [importState, setImportState] = useState<ImportModalState | null>(null)
  const [sqlImport, setSqlImport] = useState<SqlImportState | null>(null)
  const [exportDb, setExportDb] = useState<{ connectionId: string } | null>(null)
  const { introspect } = useSchemaExplorer()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  // `?? []` covers two cases: the store has not finished loading yet, and a
  // running main process that pre-dates the pinnedTables field (hot-reload).
  const pinnedTables: PinnedTable[] = useSettingsStore((s) => s.settings.pinnedTables) ?? []
  const updateSettings = useSettingsStore((s) => s.update)

  const activePins: PinnedTable[] = activeConnectionId
    ? pinnedTables.filter((p) => p.connectionId === activeConnectionId)
    : []

  const isPinned = (schema: string, table: string): boolean =>
    activePins.some((p) => p.schema === schema && p.table === table)

  const togglePin = (schema: string, table: string): void => {
    if (!activeConnectionId) return
    const exists = isPinned(schema, table)
    const next = exists
      ? pinnedTables.filter(
          (p) =>
            !(p.connectionId === activeConnectionId && p.schema === schema && p.table === table)
        )
      : [...pinnedTables, { connectionId: activeConnectionId, schema, table }]
    void updateSettings({ pinnedTables: next })
  }

  // Build a synthetic group node so pinned tables render with the same
  // TreeRow code path as the real explorer entries.
  const pinnedGroup: TreeNode | null =
    activePins.length > 0
      ? {
          id: PINNED_GROUP_ID,
          label: 'Pinned',
          kind: 'group',
          count: activePins.length,
          children: activePins.map((p) => ({
            id: `pinned:${p.schema}.${p.table}`,
            label: p.table,
            kind: 'table' as const,
            detail: p.schema,
            openTable: { schema: p.schema, table: p.table }
          }))
        }
      : null

  const handleContextMenu = (node: TreeNode, event: MouseEvent): void => {
    if (isTablesGroup(node)) {
      event.preventDefault()
      setMenu({
        kind: 'tablesGroup',
        x: event.clientX,
        y: event.clientY,
        schema: schemaOfTablesGroup(node.id)
      })
      return
    }
    if (isRelationLeaf(node)) {
      event.preventDefault()
      setMenu({
        kind: 'relation',
        x: event.clientX,
        y: event.clientY,
        schema: node.openTable.schema,
        table: node.openTable.table,
        relationKind: node.kind
      })
    }
  }

  // The native file dialog is opened here, from the menu-click event — never
  // from a modal's effect, which React StrictMode would double-invoke.
  const openImportFile = async (
    connectionId: string,
    schema: string,
    format: 'csv' | 'json'
  ): Promise<void> => {
    const result = await ipc.file.open({ format })
    if (result.ok && result.data.canceled) return
    setImportState({
      connectionId,
      schema,
      format,
      fileName: result.ok ? (result.data.name ?? '') : '',
      content: result.ok ? (result.data.content ?? '') : '',
      error: result.ok ? undefined : result.error.message
    })
  }

  const openSqlImportFile = async (connectionId: string): Promise<void> => {
    const result = await ipc.file.openSql()
    if (result.ok && result.data.canceled) return
    if (!result.ok) {
      setSqlImport({
        connectionId,
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
      connectionId,
      path: result.data.path ?? '',
      name: result.data.name ?? '',
      size: result.data.size ?? 0,
      preview: result.data.preview ?? '',
      kind: result.data.kind ?? 'plain'
    })
  }

  const tablesGroupItems = (schema: string): ContextMenuEntry[] => {
    const openOverview = (): void => {
      const connectionId = useConnectionStore.getState().activeConnectionId
      if (connectionId) useEditorStore.getState().openOverviewTab(connectionId, schema)
    }

    const openNewTable = (): void => {
      const connectionId = useConnectionStore.getState().activeConnectionId
      if (connectionId) setNewTable({ connectionId, schema })
    }

    return [
      {
        id: 'overview',
        label: 'Item overview',
        icon: <ListChecks className="h-3.5 w-3.5" />,
        onSelect: openOverview
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
            onSelect: () => {
              const connectionId = useConnectionStore.getState().activeConnectionId
              if (connectionId) void openImportFile(connectionId, schema, 'csv')
            }
          },
          {
            id: 'import-json',
            label: 'From JSON…',
            icon: <Braces className="h-3.5 w-3.5" />,
            onSelect: () => {
              const connectionId = useConnectionStore.getState().activeConnectionId
              if (connectionId) void openImportFile(connectionId, schema, 'json')
            }
          },
          {
            id: 'import-sql',
            label: 'From SQL dump…',
            icon: <Database className="h-3.5 w-3.5" />,
            onSelect: () => {
              const connectionId = useConnectionStore.getState().activeConnectionId
              if (connectionId) void openSqlImportFile(connectionId)
            }
          }
        ]
      },
      {
        id: 'export-db',
        label: 'Export database…',
        icon: <Download className="h-3.5 w-3.5" />,
        onSelect: () => {
          const connectionId = useConnectionStore.getState().activeConnectionId
          if (connectionId) setExportDb({ connectionId })
        }
      },
      {
        id: 'new',
        label: 'New',
        icon: <Plus className="h-3.5 w-3.5" />,
        submenu: [
          {
            id: 'new-table',
            label: 'New Table…',
            icon: <Table2 className="h-3.5 w-3.5" />,
            onSelect: openNewTable
          },
          {
            id: 'new-query',
            label: 'New Query',
            icon: <FileCode2 className="h-3.5 w-3.5" />,
            onSelect: () => useEditorStore.getState().createTab()
          }
        ]
      }
    ]
  }

  const relationItems = (rel: Extract<RailMenu, { kind: 'relation' }>): ContextMenuEntry[] => {
    const { schema, table, relationKind } = rel
    const connState = useConnectionStore.getState()
    const connectionId = connState.activeConnectionId
    const engine: DatabaseEngine =
      (connectionId && connState.connections.find((c) => c.id === connectionId)?.engine) ||
      'postgres'

    const qualified = quoteRelation(engine, schema, table)
    const dropKeyword =
      relationKind === 'view'
        ? 'VIEW'
        : relationKind === 'materialized_view'
          ? 'MATERIALIZED VIEW'
          : 'TABLE'
    const canTruncate = relationKind === 'table'

    const openTab = (initialView?: 'data' | 'structure'): void => {
      if (!connectionId) return
      useEditorStore.getState().openTableTab(connectionId, schema, table, initialView)
    }
    const openOverview = (): void => {
      if (!connectionId) return
      useEditorStore.getState().openOverviewTab(connectionId, schema)
    }
    const copy = (text: string): void => {
      void navigator.clipboard.writeText(text)
    }
    const runDdl = async (sql: string): Promise<void> => {
      if (!connectionId) return
      const result = await ipc.query.batch({ connectionId, statements: [{ sql }] })
      if (!result.ok) {
        window.alert(result.error.message)
        return
      }
      await introspect(connectionId)
    }
    const onTruncate = (): void => {
      if (!canTruncate) return
      if (!window.confirm(`Truncate ${qualified}? All rows will be deleted.`)) return
      void runDdl(`TRUNCATE TABLE ${qualified};`)
    }
    const onDelete = (): void => {
      const label = dropKeyword.toLowerCase()
      if (!window.confirm(`Delete ${label} ${qualified}? This cannot be undone.`)) return
      void runDdl(`DROP ${dropKeyword} ${qualified};`)
    }
    const onCopyCreation = async (): Promise<void> => {
      if (!connectionId) return
      const result = await ipc.database.scriptCreate({ connectionId, schema, table })
      if (result.ok) copy(result.data)
      else window.alert(result.error.message)
    }

    return [
      {
        id: 'open-tab',
        label: 'Open in new tab',
        icon: <ExternalLink className="h-3.5 w-3.5" />,
        onSelect: () => openTab()
      },
      {
        id: 'open-structure',
        label: 'Open structure',
        icon: <Layers className="h-3.5 w-3.5" />,
        onSelect: () => openTab('structure')
      },
      {
        id: 'overview',
        label: 'Item overview',
        icon: <ListChecks className="h-3.5 w-3.5" />,
        onSelect: openOverview
      },
      {
        id: 'copy-name',
        label: 'Copy name',
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => copy(table)
      },
      {
        id: 'pin',
        label: isPinned(schema, table) ? 'Unpin' : 'Pin to top',
        icon: <Pin className="h-3.5 w-3.5" />,
        onSelect: () => togglePin(schema, table)
      },
      { separator: true },
      {
        id: 'export',
        label: 'Export',
        icon: <Download className="h-3.5 w-3.5" />,
        submenu: [
          {
            id: 'export-tables',
            label: 'Export Tables…',
            icon: <Download className="h-3.5 w-3.5" />,
            onSelect: () => {
              if (connectionId) setExportTarget({ connectionId, schema, table })
            }
          },
          {
            id: 'export-columns',
            label: 'Export this Table with Column Selection…',
            icon: <Download className="h-3.5 w-3.5" />,
            disabled: true // Out of scope
          }
        ]
      },
      {
        id: 'import',
        label: 'Import',
        icon: <Upload className="h-3.5 w-3.5" />,
        submenu: [
          {
            id: 'import-csv',
            label: 'From CSV…',
            icon: <FileSpreadsheet className="h-3.5 w-3.5" />,
            onSelect: () => {
              if (connectionId) void openImportFile(connectionId, schema, 'csv')
            }
          },
          {
            id: 'import-json',
            label: 'From JSON…',
            icon: <Braces className="h-3.5 w-3.5" />,
            onSelect: () => {
              if (connectionId) void openImportFile(connectionId, schema, 'json')
            }
          },
          {
            id: 'import-sql',
            label: 'From SQL dump…',
            icon: <Database className="h-3.5 w-3.5" />,
            onSelect: () => {
              if (connectionId) void openSqlImportFile(connectionId)
            }
          }
        ]
      },
      {
        id: 'new',
        label: 'New',
        icon: <Plus className="h-3.5 w-3.5" />,
        submenu: [
          {
            id: 'new-table',
            label: 'New Table…',
            icon: <Table2 className="h-3.5 w-3.5" />,
            onSelect: () => {
              if (connectionId) setNewTable({ connectionId, schema })
            }
          },
          {
            id: 'new-view',
            label: 'New View…',
            icon: <Eye className="h-3.5 w-3.5" />,
            onSelect: () => {
              if (connectionId) setNewView({ connectionId, schema })
            }
          }
        ]
      },
      { separator: true },
      {
        id: 'copy-script',
        label: 'Copy Script As',
        icon: <FileCode2 className="h-3.5 w-3.5" />,
        submenu: [
          {
            id: 'copy-creation',
            label: 'Creation SQL',
            icon: <FileCode2 className="h-3.5 w-3.5" />,
            onSelect: () => void onCopyCreation()
          },
          {
            id: 'copy-drop',
            label: 'Drop',
            icon: <Trash2 className="h-3.5 w-3.5" />,
            onSelect: () => copy(`DROP ${dropKeyword} ${qualified};`)
          },
          {
            id: 'copy-truncate',
            label: 'Truncate',
            icon: <Eraser className="h-3.5 w-3.5" />,
            disabled: !canTruncate,
            onSelect: () => copy(`TRUNCATE TABLE ${qualified};`)
          },
          {
            id: 'copy-select',
            label: 'Select top 100',
            icon: <Table2 className="h-3.5 w-3.5" />,
            onSelect: () => copy(`SELECT * FROM ${qualified} LIMIT 100;`)
          }
        ]
      },
      {
        id: 'clone',
        label: 'Clone…',
        icon: <Copy className="h-3.5 w-3.5" />,
        disabled: relationKind !== 'table',
        onSelect: () => {
          if (connectionId) setCloneTarget({ connectionId, schema, table })
        }
      },
      { separator: true },
      {
        id: 'truncate',
        label: 'Truncate…',
        icon: <Eraser className="h-3.5 w-3.5" />,
        disabled: !canTruncate,
        onSelect: onTruncate
      },
      {
        id: 'delete',
        label: 'Delete…',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onSelect: onDelete
      }
    ]
  }

  const menuItems: ContextMenuEntry[] =
    menu === null
      ? []
      : menu.kind === 'tablesGroup'
        ? tablesGroupItems(menu.schema)
        : relationItems(menu)

  return (
    <div role="tree" className="py-1">
      {pinnedGroup && (
        <TreeRow
          key={pinnedGroup.id}
          node={pinnedGroup}
          depth={0}
          forceExpand={forceExpand}
          onContextMenu={handleContextMenu}
        />
      )}
      {nodes.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          forceExpand={forceExpand}
          onContextMenu={handleContextMenu}
        />
      ))}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}

      {newTable && (
        <NewTableModal
          connectionId={newTable.connectionId}
          schema={newTable.schema}
          onClose={() => setNewTable(null)}
        />
      )}

      {newView && (
        <NewViewModal
          connectionId={newView.connectionId}
          schema={newView.schema}
          onClose={() => setNewView(null)}
        />
      )}

      {cloneTarget && (
        <CloneTableModal
          connectionId={cloneTarget.connectionId}
          schema={cloneTarget.schema}
          table={cloneTarget.table}
          onClose={() => setCloneTarget(null)}
        />
      )}

      {exportTarget && (
        <ExportTableModal
          connectionId={exportTarget.connectionId}
          schema={exportTarget.schema}
          table={exportTarget.table}
          onClose={() => setExportTarget(null)}
        />
      )}

      {importState && (
        <ImportModal
          connectionId={importState.connectionId}
          schema={importState.schema}
          format={importState.format}
          fileName={importState.fileName}
          content={importState.content}
          error={importState.error}
          onClose={() => setImportState(null)}
        />
      )}

      {sqlImport && (
        <SqlImportModal
          connectionId={sqlImport.connectionId}
          path={sqlImport.path}
          name={sqlImport.name}
          size={sqlImport.size}
          preview={sqlImport.preview}
          kind={sqlImport.kind}
          error={sqlImport.error}
          onClose={() => setSqlImport(null)}
        />
      )}

      {exportDb && (
        <ExportDatabaseModal
          connectionId={exportDb.connectionId}
          onClose={() => setExportDb(null)}
        />
      )}
    </div>
  )
}
