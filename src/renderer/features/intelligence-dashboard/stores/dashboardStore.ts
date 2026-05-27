import { create } from 'zustand'
import type { ScanProgress, ScanResult, ScanStatus } from '@shared/types/intelligence'

/** Per-connection slice of dashboard state. */
export interface DashboardTabState {
  /** The most recent persisted scan result, if any. */
  result: ScanResult | null
  /** Newest-first history (capped on main side) — drives trend charts. */
  history: ScanResult[]
  /** Live progress of the in-flight scan, if any. */
  progress: ScanProgress | null
  /** Lifecycle of the in-flight scan. */
  status: ScanStatus
  /** Error message from the last failed scan. */
  error: string | null
  /** Id of the scan currently running, so the UI can wire Cancel. */
  runningScanId: string | null
}

interface DashboardState {
  /** State per connectionId — independent dashboards across connections. */
  tabs: Record<string, DashboardTabState>

  setResult: (connectionId: string, result: ScanResult) => void
  setHistory: (connectionId: string, history: ScanResult[]) => void
  setProgress: (connectionId: string, progress: ScanProgress) => void
  setError: (connectionId: string, message: string, cancelled: boolean) => void
  setRunning: (connectionId: string, scanId: string | null) => void
  resetError: (connectionId: string) => void
}

const EMPTY_TAB: DashboardTabState = {
  result: null,
  history: [],
  progress: null,
  status: 'idle',
  error: null,
  runningScanId: null
}

/** State container for the Intelligence Dashboard, one slice per connection. */
export const useDashboardStore = create<DashboardState>((set) => {
  const patch = (
    connectionId: string,
    updater: (current: DashboardTabState) => DashboardTabState
  ): void =>
    set((state) => ({
      tabs: { ...state.tabs, [connectionId]: updater(state.tabs[connectionId] ?? EMPTY_TAB) }
    }))

  return {
    tabs: {},

    setResult: (connectionId, result) =>
      patch(connectionId, (current) => {
        // Prepend (or replace by scanId — main process dedupes naturally on
        // newest-first push, but we guard the renderer side as well).
        const without = current.history.filter((h) => h.scanId !== result.scanId)
        const history = [result, ...without].slice(0, 30)
        return {
          ...current,
          result,
          history,
          progress: null,
          status: 'success',
          error: null,
          runningScanId: null
        }
      }),

    setHistory: (connectionId, history) =>
      patch(connectionId, (current) => ({
        ...current,
        history,
        // Hydration: if we didn't already have a result loaded, surface the
        // newest history entry so the dashboard paints on first open.
        result: current.result ?? history[0] ?? null
      })),

    setProgress: (connectionId, progress) =>
      patch(connectionId, (current) => ({
        ...current,
        progress,
        status: progress.status,
        runningScanId: progress.status === 'running' ? progress.scanId : current.runningScanId
      })),

    setError: (connectionId, message, cancelled) =>
      patch(connectionId, (current) => ({
        ...current,
        progress: null,
        status: cancelled ? 'cancelled' : 'error',
        error: cancelled ? null : message,
        runningScanId: null
      })),

    setRunning: (connectionId, scanId) =>
      patch(connectionId, (current) => ({
        ...current,
        runningScanId: scanId,
        status: scanId ? 'running' : current.status
      })),

    resetError: (connectionId) =>
      patch(connectionId, (current) => ({ ...current, error: null }))
  }
})

/** Selector helper — falls back to a stable empty slice when the tab is new. */
export function selectDashboardTab(
  state: DashboardState,
  connectionId: string
): DashboardTabState {
  return state.tabs[connectionId] ?? EMPTY_TAB
}
