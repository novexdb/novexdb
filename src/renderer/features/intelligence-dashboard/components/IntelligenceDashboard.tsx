import { useEffect, type ReactNode } from 'react'
import { AlertTriangle, ListChecks, PlugZap, Receipt, Timer } from 'lucide-react'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import {
  selectDashboardTab,
  useDashboardStore
} from '@renderer/features/intelligence-dashboard/stores/dashboardStore'
import { hydrate } from '@renderer/features/intelligence-dashboard/services/dashboard-runner'
import { SummaryCards } from '@renderer/features/intelligence-dashboard/components/SummaryCards'
import { HealthScoreCard } from '@renderer/features/intelligence-dashboard/components/HealthScoreCard'
import { ScanControls } from '@renderer/features/intelligence-dashboard/components/ScanControls'
import { IssuesTable } from '@renderer/features/intelligence-dashboard/components/IssuesTable'
import { AiInsightsPanel } from '@renderer/features/intelligence-dashboard/components/AiInsightsPanel'
import { RecommendationsPanel } from '@renderer/features/intelligence-dashboard/components/RecommendationsPanel'
import { SourceIssuesPanel } from '@renderer/features/intelligence-dashboard/components/SourceIssuesPanel'
import { RiskSeverityPie } from '@renderer/features/intelligence-dashboard/charts/RiskSeverityPie'
import { TableSizeBar } from '@renderer/features/intelligence-dashboard/charts/TableSizeBar'
import { HealthTrendChart } from '@renderer/features/intelligence-dashboard/charts/HealthTrendChart'
import { IssueTrendChart } from '@renderer/features/intelligence-dashboard/charts/IssueTrendChart'
import type { DashboardTabState } from '@renderer/features/intelligence-dashboard/stores/dashboardStore'

/** Module-level stable empty slice — the no-connection branch returns this
 *  from the selector so Zustand's getSnapshot cache stays valid. */
const EMPTY_SLICE: DashboardTabState = {
  result: null,
  history: [],
  progress: null,
  status: 'idle',
  error: null,
  runningScanId: null
}

/**
 * The AI Database Intelligence dashboard — follows the currently active
 * connection, so switching the connection rail swaps the dashboard's data
 * without opening a second tab. All four scanners (schema, data-quality,
 * performance, transaction) are live; insights + recommendations are
 * derived mechanically from issues (real AI provider is a Phase 3 swap).
 */
export function IntelligenceDashboard(): ReactNode {
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

  useEffect(() => {
    if (connectionId) void hydrate(connectionId)
  }, [connectionId])

  if (!connectionId || !connection) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-app">
        <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
          <PlugZap className="h-7 w-7 text-subtle" />
          <h2 className="text-sm font-medium text-content">
            Pick a connection to analyse
          </h2>
          <p className="text-[12px] text-subtle">
            The Intelligence dashboard runs against whichever connection is
            active in the left rail. Click a connection to start.
          </p>
        </div>
      </div>
    )
  }

  const loading = slice.status === 'running' && !slice.result
  const result = slice.result
  const isLive = status === 'connected'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-app">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-4">
        <header className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-content">
                Database Intelligence
              </h1>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: connection.color }}
                aria-hidden
              />
              <span className="truncate font-mono text-[12px] text-muted">
                {connection.name}
                <span className="text-subtle"> · {connection.engine} · {connection.database}</span>
              </span>
            </div>
            <p className="text-[11px] text-subtle">
              Health, risks and AI-generated insights for the active connection.
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
            This connection isn’t open yet — click it in the rail to connect, then run a scan.
          </div>
        )}

        <ScanControls
          connectionId={connectionId}
          status={slice.status}
          progress={slice.progress}
          lastFinishedAt={result?.finishedAt ?? null}
        />

        <SummaryCards summary={result?.summary ?? null} loading={loading} />

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <HealthScoreCard health={result?.health ?? null} loading={loading} />
          <RiskSeverityPie issues={result?.issues ?? []} />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <IssuesTable issues={result?.issues ?? []} />
          <TableSizeBar tables={result?.tableSizes ?? []} />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <HealthTrendChart history={slice.history} />
          <IssueTrendChart history={slice.history} />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <AiInsightsPanel insights={result?.insights ?? []} />
          <RecommendationsPanel recommendations={result?.recommendations ?? []} />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <SourceIssuesPanel
            title="Data quality"
            icon={ListChecks}
            source="data-quality"
            issues={result?.issues ?? []}
            emptyLabel="Run a Data quality scan to see invalid emails, NULL spikes and duplicates."
          />
          <SourceIssuesPanel
            title="Transaction risk"
            icon={Receipt}
            source="transaction"
            issues={result?.issues ?? []}
            emptyLabel="Run a Transactions scan to surface duplicate amounts and negative balances."
          />
        </div>

        <div className="grid grid-cols-1 gap-3">
          <SourceIssuesPanel
            title="Performance"
            icon={Timer}
            source="performance"
            issues={result?.issues ?? []}
            emptyLabel="Run a Performance scan — needs pg_stat_statements (Postgres) or performance_schema (MySQL)."
          />
        </div>

        {!result && !loading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line py-8 text-[11px] text-subtle">
            <AlertTriangle className="h-4 w-4 text-warning" />
            No scan results yet. Run a Schema scan to populate the dashboard.
          </div>
        )}
      </div>
    </div>
  )
}
