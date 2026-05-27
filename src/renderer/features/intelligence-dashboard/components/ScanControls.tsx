import { useState, type ReactNode } from 'react'
import { Loader2, Pause, Play, Sparkles } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { cn } from '@renderer/utils/cn'
import {
  cancelScan,
  startScan
} from '@renderer/features/intelligence-dashboard/services/dashboard-runner'
import type { ScanKind, ScanProgress, ScanStatus } from '@shared/types/intelligence'

interface ScanControlsProps {
  connectionId: string
  status: ScanStatus
  progress: ScanProgress | null
  lastFinishedAt: string | null
}

const SECONDARY_KINDS: { kind: ScanKind; label: string }[] = [
  { kind: 'schema', label: 'Schema' },
  { kind: 'data-quality', label: 'Data quality' },
  { kind: 'transaction', label: 'Transactions' },
  { kind: 'performance', label: 'Performance' }
]

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s - m * 60)}s`
}

/** Top-of-dashboard scan controls + progress bar. */
export function ScanControls({
  connectionId,
  status,
  progress,
  lastFinishedAt
}: ScanControlsProps): ReactNode {
  // Local "click landed" flag — gives instant button feedback before the first
  // progress event arrives from main (or surfaces a thrown IPC error
  // immediately if `startScan` rejects).
  const [starting, setStarting] = useState(false)

  const handleStart = async (kind: ScanKind): Promise<void> => {
    setStarting(true)
    try {
      await startScan(connectionId, kind)
    } finally {
      setStarting(false)
    }
  }

  const running = status === 'running' || starting
  const pct = Math.min(100, Math.round((progress?.progress ?? 0) * 100))
  const taskLabel = progress?.currentTask ?? (starting ? 'Starting scan…' : null)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface/60 p-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleStart('full')}
          disabled={running}
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Run full scan
        </Button>
        {SECONDARY_KINDS.map(({ kind, label }) => (
          <Button
            key={kind}
            variant="secondary"
            size="sm"
            onClick={() => void handleStart(kind)}
            disabled={running}
          >
            <Play className="h-3 w-3" />
            {label}
          </Button>
        ))}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void cancelScan(connectionId)}
          disabled={!running}
        >
          <Pause className="h-3.5 w-3.5" />
          Stop scan
        </Button>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-subtle">
          <span className="truncate">
            {running
              ? taskLabel ?? 'Starting scan…'
              : lastFinishedAt
                ? `Last scan: ${new Date(lastFinishedAt).toLocaleString()}`
                : 'No scans yet. Run one to populate the dashboard.'}
          </span>
          {running && progress && (
            <span className="shrink-0 font-mono text-content">
              {pct}% · {formatDuration(progress.elapsedMs)}
            </span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-app">
          <div
            className={cn(
              'h-full bg-accent transition-all',
              running ? 'opacity-100' : 'opacity-0'
            )}
            // While `starting` and progress hasn't started flowing yet, paint a
            // small slice so the bar doesn't look stuck at empty.
            style={{ width: `${running ? Math.max(pct, starting && pct === 0 ? 8 : pct) : 0}%` }}
          />
        </div>
      </div>
    </div>
  )
}
