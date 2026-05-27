import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Info,
  Loader2,
  Network,
  Search,
  Trash2
} from 'lucide-react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { Input } from '@renderer/components/Input'
import { Field } from '@renderer/components/Field'
import { ipc } from '@renderer/services/ipc'
import { cn } from '@renderer/utils/cn'
import { formatCellValue } from '@renderer/features/results/utils/format-cell'
import type {
  CascadeDeletionStat,
  CascadeNode,
  CascadeScanResult,
  CascadeSelection
} from '@shared/types/cascade'

interface CascadeDeleteModalProps {
  connectionId: string
  schema: string
  table: string
  /** PK column→value maps for each row the user picked. Usually one row. */
  rowKeys: Record<string, unknown>[]
  /** Called after a successful (or dry-run) execute, with the per-table counts. */
  onSuccess: (deleted: CascadeDeletionStat[], dryRun: boolean) => void
  onClose: () => void
}

/** Phrase the user types to unlock the real Delete button. */
const CONFIRM_PHRASE = 'DELETE'

/**
 * The "Smart delete" confirmation modal — walks the FK graph for the picked
 * row(s), shows an expandable dependency tree, lets the user uncheck branches,
 * then issues a transactional cascade.
 */
export function CascadeDeleteModal({
  connectionId,
  schema,
  table,
  rowKeys,
  onSuccess,
  onClose
}: CascadeDeleteModalProps): ReactNode {
  const [result, setResult] = useState<CascadeScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)

  // Tree expansion + selection state, keyed by node id.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [executing, setExecuting] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)

  // Run the scan once on mount.
  useEffect(() => {
    let cancelled = false
    setScanning(true)
    setScanError(null)

    // Bridge-existence guard — the cascade channels are new; a stale
    // preload (running `npm run dev` from before they were added) will
    // silently reject every invoke. Surface that as a clear error rather
    // than hanging on the spinner forever.
    const bridge = (ipc as { cascade?: typeof ipc.cascade }).cascade
    if (!bridge) {
      setScanning(false)
      setScanError(
        'Smart delete IPC is not available on window.api. Stop the dev server (Ctrl+C) and run `npm run dev` again so Electron picks up the new main/preload.'
      )
      return
    }

    // Hard fallback timeout — if main is genuinely stuck (slow catalog query
    // or unindexed FK scan on a huge table), bail out so the user isn't
    // staring at a spinner indefinitely.
    const timeout = window.setTimeout(() => {
      if (cancelled) return
      console.error('[cascade] scan timed out after 60s')
      setScanning(false)
      setScanError(
        'Scan took longer than 60 seconds. Likely missing FK indexes on the referencing tables. Add indexes or scan a narrower selection.'
      )
    }, 60_000)

    console.debug('[cascade] scan starting', { connectionId, schema, table, rowKeys })
    void (async () => {
      try {
        const response = await bridge.scan({ connectionId, schema, table, rowKeys })
        if (cancelled) return
        window.clearTimeout(timeout)
        setScanning(false)
        if (!response.ok) {
          console.error('[cascade] scan rejected by main', response.error)
          setScanError(response.error.message)
          return
        }
        console.debug(
          '[cascade] scan completed',
          `${response.data.totalDescendants} descendants in ${response.data.durationMs} ms`
        )
        setResult(response.data)
        setExpanded(new Set(response.data.roots.map((root) => root.id)))
      } catch (err) {
        if (cancelled) return
        window.clearTimeout(timeout)
        const raw = err instanceof Error ? err.message : String(err)
        // "No handler registered for X" means the main process is running
        // older code than the renderer — full dev-server restart needed.
        const message = /No handler registered for/i.test(raw)
          ? `${raw}\n\nMain process is out of date — Ctrl+C the dev server and re-run \`npm run dev\` so it picks up the new IPC handler.`
          : raw
        console.error('[cascade] scan threw', err)
        setScanning(false)
        setScanError(message)
      }
    })()
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [connectionId, schema, table, rowKeys])

  // Flatten the tree for search + selection counting.
  const allNodes = useMemo(
    () => (result ? flatten(result.roots) : []),
    [result]
  )

  const checkedNodes = useMemo(
    () => allNodes.filter((node) => !unchecked.has(node.id)),
    [allNodes, unchecked]
  )

  // Group checked-node counts by table for the impact summary header.
  const tableCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const node of checkedNodes) {
      const key = `${node.schema}.${node.table}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [checkedNodes])

  const matchesSearch = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return null // no filter
    const set = new Set<string>()
    for (const node of allNodes) {
      const haystack = `${node.schema}.${node.table} ${formatRowKey(node.rowKey)}`.toLowerCase()
      if (haystack.includes(needle)) set.add(node.id)
    }
    return set
  }, [allNodes, search])

  const toggleExpanded = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Toggling a node also toggles every descendant — typical tree-checkbox UX. */
  const toggleChecked = (node: CascadeNode): void => {
    const descendantIds = new Set(flatten([node]).map((n) => n.id))
    setUnchecked((prev) => {
      const next = new Set(prev)
      const isUnchecked = next.has(node.id)
      for (const id of descendantIds) {
        if (isUnchecked) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const handleExecute = async (dryRun: boolean): Promise<void> => {
    if (!result) return
    if (!dryRun && confirmText.trim().toUpperCase() !== CONFIRM_PHRASE) return
    setExecuting(true)
    setExecuteError(null)
    const selections: CascadeSelection[] = checkedNodes.map((node) => ({
      schema: node.schema,
      table: node.table,
      rowKey: node.rowKey
    }))
    try {
      console.debug(
        '[cascade]',
        dryRun ? 'dry-run' : 'execute',
        `${selections.length} rows`
      )
      const response = await ipc.cascade.execute({ connectionId, selections, dryRun })
      setExecuting(false)
      if (!response.ok) {
        console.error('[cascade] execute rejected by main', response.error)
        setExecuteError(response.error.message)
        return
      }
      console.debug('[cascade] execute done', response.data)
      onSuccess(response.data.deleted, response.data.dryRun)
      onClose()
    } catch (err) {
      setExecuting(false)
      const message = err instanceof Error ? err.message : String(err)
      console.error('[cascade] execute threw', err)
      setExecuteError(message)
    }
  }

  const confirmReady = confirmText.trim().toUpperCase() === CONFIRM_PHRASE

  return (
    <Modal
      open
      onClose={onClose}
      title="Smart delete"
      description={
        scanning
          ? 'Scanning every table for rows that reference your selection…'
          : `Review ${checkedNodes.length} record${checkedNodes.length === 1 ? '' : 's'} that will be deleted in one transaction.`
      }
      width={780}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={executing}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handleExecute(true)}
            disabled={scanning || executing || checkedNodes.length === 0}
          >
            Dry run
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleExecute(false)}
            loading={executing}
            disabled={
              scanning ||
              !!scanError ||
              checkedNodes.length === 0 ||
              !confirmReady
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete {checkedNodes.length.toLocaleString()} rows
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {scanning && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-subtle">
            <Loader2 className="h-4 w-4 animate-spin" />
            Walking the foreign-key graph…
          </div>
        )}

        {scanError && (
          <p className="whitespace-pre-line rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {scanError}
          </p>
        )}

        {result && !scanning && (
          <>
            {/*
              1. THE ROW(S) BEING DELETED — biggest, most prominent section.
                 Answers "what am I about to destroy?" before anything else.
            */}
            {result.roots.map((root) => (
              <SourceRecord key={root.id} root={root} />
            ))}

            {/*
              2. THE IMPACT — answers "what else gets deleted because of this?".
                 Loud, table-grouped, with a clear empty-state message.
            */}
            <ImpactPanel
              result={result}
              tableCounts={tableCounts}
              checkedCount={checkedNodes.length}
            />

            {result.truncatedTables.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11.5px] text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Some tables hit the per-table row cap and their subtrees are
                  partial:&nbsp;
                  {result.truncatedTables
                    .map((t) => `${t.schema}.${t.table} (${t.foundSoFar}+)`)
                    .join(', ')}
                  . Rerun on a narrower selection to see all rows.
                </span>
              </div>
            )}

            {/*
              3. UNRESOLVED FKs — never silent. If the scanner found FKs
                 pointing at the row but couldn't follow them (missing column
                 in the row body), surface that so the user knows the impact
                 list may be incomplete.
            */}
            {result.unresolvedFks.length > 0 && (
              <UnresolvedFksHint unresolvedFks={result.unresolvedFks} />
            )}

            {/*
              4. THE TREE — for users who want to drill into individual
                 dependent rows and uncheck branches.
            */}
            {result.totalDescendants > 0 && (
              <details className="group rounded-md border border-line bg-app/40">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[11.5px] text-content hover:bg-app/60">
                  <span className="inline-flex items-center gap-1.5">
                    <Network className="h-3.5 w-3.5 text-accent" />
                    Dependent records · drill-down ({result.totalDescendants})
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-line p-2">
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-subtle" />
                    <Input
                      value={search}
                      placeholder="Filter dependent records…"
                      onChange={(event) => setSearch(event.target.value)}
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  <div className="max-h-[300px] overflow-y-auto rounded-md border border-line bg-app/40">
                    {result.roots.map((root) =>
                      root.children.map((child) => (
                        <TreeRow
                          key={child.id}
                          node={child}
                          depth={0}
                          expanded={expanded}
                          unchecked={unchecked}
                          matchSet={matchesSearch}
                          onToggleExpand={toggleExpanded}
                          onToggleChecked={toggleChecked}
                        />
                      ))
                    )}
                  </div>
                </div>
              </details>
            )}

            <Field
              label={`Type "${CONFIRM_PHRASE}" to confirm`}
              hint="Cascade deletes are irreversible. Try Dry run first."
            >
              <Input
                value={confirmText}
                placeholder={CONFIRM_PHRASE}
                onChange={(event) => setConfirmText(event.target.value)}
              />
            </Field>

            {executeError && (
              <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {executeError}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// ───────────────────────────────────────────────────────────── components ──

/**
 * The record(s) the user picked — displayed in full so they see exactly
 * what they're about to destroy before reviewing the cascade impact.
 */
function SourceRecord({ root }: { root: CascadeNode }): ReactNode {
  const entries = root.fullRow ? Object.entries(root.fullRow) : []
  return (
    <div className="rounded-md border border-danger/30 bg-danger/5 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Trash2 className="h-3.5 w-3.5 text-danger" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-danger/90">
          Deleting this record
        </span>
        <span className="ml-auto font-mono text-[11px] text-content">
          {root.schema}.{root.table}
        </span>
      </div>
      {entries.length > 0 ? (
        <div className="max-h-[200px] overflow-y-auto rounded border border-line/60 bg-app/60">
          <table className="w-full text-[11px]">
            <tbody>
              {entries.map(([column, value], index) => (
                <tr
                  key={column}
                  className={cn(
                    'border-b border-line/30 last:border-0',
                    index % 2 === 1 && 'bg-app/40'
                  )}
                >
                  <td className="w-1/3 truncate px-2 py-1 font-mono text-[10.5px] text-subtle">
                    {column}
                  </td>
                  <td
                    className={cn(
                      'truncate px-2 py-1 font-mono',
                      value === null || value === undefined
                        ? 'italic text-subtle'
                        : 'text-content'
                    )}
                  >
                    {formatCellValue(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
          <AlertTriangle className="mr-1.5 inline h-3 w-3" />
          Couldn't read the row body
          {root.fullRowError ? (
            <>
              : <span className="font-mono">{root.fullRowError}</span>
            </>
          ) : (
            '.'
          )}
        </div>
      )}
    </div>
  )
}

/**
 * "What else gets deleted because of this?" — the headline answer to the
 * user's question. Loud table-grouped chips when there's cascade, a clear
 * "nothing else" message when there isn't.
 */
function ImpactPanel({
  result,
  tableCounts,
  checkedCount
}: {
  result: CascadeScanResult
  tableCounts: [string, number][]
  checkedCount: number
}): ReactNode {
  const cascadeCount = checkedCount - result.roots.length
  return (
    <div className="rounded-md border border-line bg-surface/40 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <Network className="h-3 w-3 text-accent" />
          Cascading impact
        </span>
        <span className="text-muted">scan {result.durationMs} ms</span>
      </div>
      {result.totalDescendants === 0 ? (
        <div className="flex items-start gap-2 rounded border border-success/40 bg-success/10 px-3 py-2 text-[12px] text-success">
          <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium">No other records reference this row.</p>
            <p className="mt-0.5 text-[11px] text-success/80">
              Only the {result.roots.length === 1 ? 'record above' : `${result.roots.length} records above`} will be deleted.
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-2 text-[12px] text-content">
            Deleting will <span className="font-semibold text-danger">also remove {cascadeCount.toLocaleString()} related record{cascadeCount === 1 ? '' : 's'}</span> across {tableCounts.length} table{tableCounts.length === 1 ? '' : 's'}, in one transaction:
          </p>
          <div className="space-y-1">
            {tableCounts
              .filter(([key]) => !result.roots.some((r) => `${r.schema}.${r.table}` === key))
              .map(([table, count]) => (
                <div
                  key={table}
                  className="flex items-center justify-between rounded border border-line/60 bg-app/60 px-2 py-1.5"
                >
                  <span className="truncate font-mono text-[11.5px] text-content">
                    {table}
                  </span>
                  <span className="ml-2 shrink-0 rounded bg-danger/15 px-2 py-0.5 font-mono text-[11px] text-danger">
                    {count.toLocaleString()} row{count === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * When the scanner found FKs pointing at a row but couldn't follow them
 * (because the row we have doesn't carry the referenced column), surface
 * the gap so the impact list never silently under-reports.
 */
function UnresolvedFksHint({
  unresolvedFks
}: {
  unresolvedFks: CascadeScanResult['unresolvedFks']
}): ReactNode {
  return (
    <details className="group rounded-md border border-warning/40 bg-warning/10">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11.5px] text-warning">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>
          {unresolvedFks.length} foreign-key constraint{unresolvedFks.length === 1 ? '' : 's'} couldn't be followed —
          the dependent record list may be incomplete.
        </span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-warning transition-transform group-open:rotate-180" />
      </summary>
      <ul className="border-t border-warning/30 px-3 py-2 text-[11px] text-warning/90">
        {unresolvedFks.map((fk) => (
          <li
            key={`${fk.childSchema}.${fk.childTable}::${fk.constraintName}`}
            className="font-mono"
          >
            {fk.childSchema}.{fk.childTable} (via {fk.constraintName}) —
            missing column{fk.missingParentColumns.length === 1 ? '' : 's'}:{' '}
            {fk.missingParentColumns.join(', ')}
          </li>
        ))}
      </ul>
    </details>
  )
}

interface TreeRowProps {
  node: CascadeNode
  depth: number
  expanded: Set<string>
  unchecked: Set<string>
  /** Search hits; `null` when no filter is active. Non-matching rows dim down. */
  matchSet: Set<string> | null
  onToggleExpand: (id: string) => void
  onToggleChecked: (node: CascadeNode) => void
}

function TreeRow({
  node,
  depth,
  expanded,
  unchecked,
  matchSet,
  onToggleExpand,
  onToggleChecked
}: TreeRowProps): ReactNode {
  const hasChildren = node.children.length > 0
  // Even leaf rows are expandable — opening them reveals the full row body.
  const isOpen = expanded.has(node.id)
  const isUnchecked = unchecked.has(node.id)
  const isDimmed = matchSet !== null && !matchSet.has(node.id)
  return (
    <>
      <div
        className={cn(
          'flex h-7 items-center gap-1.5 border-b border-line/40 px-2 text-[11.5px] transition-colors hover:bg-app/40',
          isDimmed && 'opacity-40'
        )}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        <button
          type="button"
          onClick={() => onToggleExpand(node.id)}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-subtle hover:text-content"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <input
          type="checkbox"
          aria-label={`Include ${node.schema}.${node.table} in delete`}
          className="h-3.5 w-3.5 shrink-0 accent-danger"
          checked={!isUnchecked}
          onChange={() => onToggleChecked(node)}
        />

        <span className="shrink-0 font-mono text-[11px] text-content">
          {node.schema}.{node.table}
        </span>
        <span className="truncate text-muted">{formatRowKey(node.rowKey)}</span>
        {node.viaColumn && (
          <span className="ml-auto shrink-0 text-[10px] text-subtle">
            via {node.viaColumn}
          </span>
        )}
        {node.truncated && (
          <span className="shrink-0 rounded bg-warning/15 px-1.5 py-px text-[9.5px] text-warning">
            +{node.truncated.foundSoFar} truncated
          </span>
        )}
      </div>

      {isOpen && (
        <RowDetail node={node} depth={depth} />
      )}

      {isOpen &&
        hasChildren &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            unchecked={unchecked}
            matchSet={matchSet}
            onToggleExpand={onToggleExpand}
            onToggleChecked={onToggleChecked}
          />
        ))}
    </>
  )
}

/**
 * The expanded body of a tree row — a 2-column key/value table showing every
 * column on the underlying database row. Indented to line up under the row's
 * label so it visually belongs to the parent.
 */
function RowDetail({ node, depth }: { node: CascadeNode; depth: number }): ReactNode {
  const entries = node.fullRow ? Object.entries(node.fullRow) : []
  return (
    <div
      className="border-b border-line/40 bg-app/30 px-2 py-2"
      style={{ paddingLeft: depth * 16 + 36 }}
    >
      {entries.length === 0 ? (
        <p className="text-[10.5px] italic text-subtle">
          {node.fullRowError ?? 'Full row body unavailable.'}
        </p>
      ) : (
        <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[11px]">
          {entries.map(([column, value]) => (
            <RowDetailField key={column} column={column} value={value} />
          ))}
        </div>
      )}
    </div>
  )
}

function RowDetailField({ column, value }: { column: string; value: unknown }): ReactNode {
  const display = formatCellValue(value)
  const isNullish = value === null || value === undefined
  return (
    <>
      <span className="truncate font-mono text-[10.5px] text-subtle">{column}</span>
      <span
        className={cn(
          'truncate font-mono',
          isNullish ? 'italic text-subtle' : 'text-content'
        )}
        title={display}
      >
        {display}
      </span>
    </>
  )
}

// ──────────────────────────────────────────────────────────────── helpers ──

function flatten(roots: CascadeNode[]): CascadeNode[] {
  const out: CascadeNode[] = []
  const visit = (node: CascadeNode): void => {
    out.push(node)
    for (const child of node.children) visit(child)
  }
  for (const root of roots) visit(root)
  return out
}

function formatRowKey(rowKey: Record<string, unknown>): string {
  const parts = Object.entries(rowKey).map(
    ([column, value]) => `${column}=${formatCellValue(value)}`
  )
  return parts.join(', ')
}
