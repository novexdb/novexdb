import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Copy,
  FileWarning,
  GitCompare,
  PlugZap,
  ScanSearch
} from 'lucide-react'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import {
  selectDashboardTab,
  useDashboardStore,
  type DashboardTabState
} from '@renderer/features/intelligence-dashboard/stores/dashboardStore'
import { hydrate } from '@renderer/features/intelligence-dashboard/services/dashboard-runner'
import { ScanControls } from '@renderer/features/intelligence-dashboard/components/ScanControls'
import { StatCard } from '@renderer/features/intelligence-dashboard/widgets/StatCard'
import { AiInsightsPanel } from '@renderer/features/intelligence-dashboard/components/AiInsightsPanel'
import { DuplicateGroupsPanel } from '@renderer/features/data-anomalies/components/DuplicateGroupsPanel'
import { FinancialMismatchPanel } from '@renderer/features/data-anomalies/components/FinancialMismatchPanel'
import { RecordComparisonViewer } from '@renderer/features/data-anomalies/components/RecordComparisonViewer'
import {
  anomalyIssues,
  isDuplicateIssue,
  isFinancialIssue
} from '@renderer/features/data-anomalies/utils/classify'
import { ipc } from '@renderer/services/ipc'
import { rowsCsv } from '@renderer/features/table-data/utils/grid-clipboard'
import { Button } from '@renderer/components/Button'
import type { Issue } from '@shared/types/intelligence'

const EMPTY_SLICE: DashboardTabState = {
  result: null,
  history: [],
  progress: null,
  status: 'idle',
  error: null,
  runningScanId: null
}

/**
 * Duplicate & Data Mismatch Analysis Center — a focused workflow for
 * anomaly investigation. Re-uses the Intelligence scan engine + store; the
 * page filters the issue list to duplicate / financial-mismatch classes and
 * adds the comparison viewer + CSV report download.
 */
export function AnomaliesDashboard(): ReactNode {
  const connectionId = useConnectionStore((s) => s.activeConnectionId)
  const connection = useConnectionStore((s) =>
    connectionId ? s.connections.find((c) => c.id === connectionId) ?? null : null
  )
  const status = useConnectionStore((s) =>
    connectionId ? s.statuses[connectionId] ?? 'disconnected' : 'disconnected'
  )
  const slice = useDashboardStore((s) =>
    connectionId ? selectDashboardTab(s, connectionId) : EMPTY_SLICE
  )

  const [comparing, setComparing] = useState<Issue | null>(null)

  useEffect(() => {
    if (connectionId) void hydrate(connectionId)
  }, [connectionId])

  const anomalies = useMemo(
    () => anomalyIssues(slice.result?.issues ?? []),
    [slice.result]
  )
  const duplicateCount = useMemo(() => anomalies.filter(isDuplicateIssue).length, [anomalies])
  const financialCount = useMemo(() => anomalies.filter(isFinancialIssue).length, [anomalies])

  const aiSummary = useMemo(
    () => slice.result?.insights.filter((i) => i.title === 'AI scan summary') ?? [],
    [slice.result]
  )

  if (!connectionId || !connection) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-app">
        <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
          <PlugZap className="h-7 w-7 text-subtle" />
          <h2 className="text-sm font-medium text-content">
            Pick a connection to audit
          </h2>
          <p className="text-[12px] text-subtle">
            The Anomalies Center runs against whichever connection is active in the
            left rail.
          </p>
        </div>
      </div>
    )
  }

  const isLive = status === 'connected'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-app">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-4">
        <header className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <ScanSearch className="h-4 w-4 self-center text-accent" />
              <h1 className="text-lg font-semibold tracking-tight text-content">
                Duplicate &amp; Mismatch Analysis
              </h1>
              <span
                className="h-2 w-2 shrink-0 self-center rounded-full"
                style={{ backgroundColor: connection.color }}
                aria-hidden
              />
              <span className="truncate font-mono text-[12px] text-muted">
                {connection.name}
                <span className="text-subtle"> · {connection.engine} · {connection.database}</span>
              </span>
            </div>
            <p className="text-[11px] text-subtle">
              Focused audit view of every duplicate and financial-mismatch finding
              from the active connection's scan history.
            </p>
          </div>
          {slice.error && (
            <span className="shrink-0 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] text-danger">
              {slice.error}
            </span>
          )}
        </header>

        {!isLive && (
          <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
            <PlugZap className="h-3.5 w-3.5" />
            This connection isn't open yet — click it in the rail to connect, then run a scan.
          </div>
        )}

        <ScanControls
          connectionId={connectionId}
          status={slice.status}
          progress={slice.progress}
          lastFinishedAt={slice.result?.finishedAt ?? null}
        />

        <SummaryRow
          anomalies={anomalies}
          duplicates={duplicateCount}
          financial={financialCount}
          loading={slice.status === 'running' && !slice.result}
        />

        <ExportBar issues={anomalies} disabled={anomalies.length === 0} />

        <DuplicateGroupsPanel issues={anomalies} onCompare={setComparing} />

        <FinancialMismatchPanel issues={anomalies} />

        <div className="grid grid-cols-1 gap-3">
          <AiInsightsPanel insights={aiSummary} />
        </div>

        {!slice.result && slice.status !== 'running' && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line py-8 text-[11px] text-subtle">
            <AlertTriangle className="h-4 w-4 text-warning" />
            No scan results yet. Run a Data quality + Transaction scan (or a Full scan)
            to populate the center.
          </div>
        )}
      </div>

      {comparing && (
        <RecordComparisonViewer
          issue={comparing}
          connectionId={connectionId}
          onClose={() => setComparing(null)}
        />
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────── Summary ──

function SummaryRow({
  anomalies,
  duplicates,
  financial,
  loading
}: {
  anomalies: Issue[]
  duplicates: number
  financial: number
  loading: boolean
}): ReactNode {
  // Count distinct tables touched by anomaly findings.
  const tables = useMemo(() => {
    const seen = new Set<string>()
    for (const i of anomalies) if (i.table) seen.add(i.table)
    return seen.size
  }, [anomalies])

  // Rough financial "impact" — sum of rowsAffected on financial-mismatch issues.
  const financialImpact = useMemo(() => {
    let n = 0
    for (const issue of anomalies) {
      if (isFinancialIssue(issue) && issue.rowsAffected) n += issue.rowsAffected
    }
    return n
  }, [anomalies])

  const highRisk = anomalies.filter((i) => i.severity === 'high' || i.severity === 'critical').length

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
      <StatCard
        label="Total anomalies"
        value={anomalies.length.toLocaleString()}
        icon={FileWarning}
        accent="text-warning"
        loading={loading && anomalies.length === 0}
      />
      <StatCard
        label="Duplicates"
        value={duplicates.toLocaleString()}
        icon={GitCompare}
        accent="text-accent"
        loading={loading && anomalies.length === 0}
      />
      <StatCard
        label="Financial"
        value={financial.toLocaleString()}
        icon={Copy}
        accent="text-warning"
        loading={loading && anomalies.length === 0}
      />
      <StatCard
        label="High-risk"
        value={highRisk.toLocaleString()}
        icon={AlertTriangle}
        accent="text-danger"
        loading={loading && anomalies.length === 0}
      />
      <StatCard
        label="Tables touched"
        value={`${tables} · ${financialImpact.toLocaleString()} rows`}
        icon={ScanSearch}
        loading={loading && anomalies.length === 0}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────── Export bar ──

function ExportBar({
  issues,
  disabled
}: {
  issues: Issue[]
  disabled: boolean
}): ReactNode {
  const exportCsv = async (): Promise<void> => {
    const columns = [
      { name: 'severity', dataType: 'text', nullable: false, isPrimaryKey: false },
      { name: 'type', dataType: 'text', nullable: false, isPrimaryKey: false },
      { name: 'table', dataType: 'text', nullable: true, isPrimaryKey: false },
      { name: 'column', dataType: 'text', nullable: true, isPrimaryKey: false },
      { name: 'rowsAffected', dataType: 'integer', nullable: true, isPrimaryKey: false },
      { name: 'description', dataType: 'text', nullable: false, isPrimaryKey: false },
      { name: 'suggestedSql', dataType: 'text', nullable: true, isPrimaryKey: false },
      { name: 'detectedAt', dataType: 'timestamptz', nullable: false, isPrimaryKey: false }
    ]
    const rows = issues.map((i) => [
      i.severity,
      i.type,
      i.table,
      i.column ?? null,
      i.rowsAffected ?? null,
      i.description,
      i.suggestedSql ?? null,
      i.detectedAt
    ])
    await ipc.file.export({
      defaultName: `anomalies-report-${new Date().toISOString().slice(0, 10)}.csv`,
      content: rowsCsv(columns, rows)
    })
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface/60 px-3 py-2 text-[11px] backdrop-blur-sm">
      <span className="text-muted">Export report</span>
      <span className="flex-1" />
      <Button size="sm" variant="secondary" onClick={() => void exportCsv()} disabled={disabled}>
        CSV
      </Button>
      <Button size="sm" variant="ghost" disabled title="PDF export ships in the next phase">
        PDF (soon)
      </Button>
      <Button size="sm" variant="ghost" disabled title="Excel export ships in the next phase">
        Excel (soon)
      </Button>
    </div>
  )
}
