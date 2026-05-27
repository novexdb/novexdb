import { ipc } from '@renderer/services/ipc'
import {
  selectDashboardTab,
  useDashboardStore
} from '@renderer/features/intelligence-dashboard/stores/dashboardStore'
import type { ScanKind } from '@shared/types/intelligence'

/**
 * Long-lived bridge between `ipc.intelligence` events and the dashboard store.
 * Every event payload carries `connectionId`, so the routing needs no lookup.
 *
 * Every public function in this module is wrapped in try/catch and pumps
 * failures back to the store via `setError`. Without that, an unhandled
 * rejection (e.g. a stale preload that never registered the `intelligence`
 * channels) leaves the dashboard silently inert.
 */
let unsubscribe: (() => void) | null = null

const STALE_BRIDGE_MESSAGE =
  'Intelligence APIs not available on window.api. Stop the dev server (Ctrl+C) and run `npm run dev` again so Electron picks up the new main / preload code.'

function debug(...args: unknown[]): void {
  // Single tag so DevTools' console filter ("intelligence") catches all of it.
  console.debug('[intelligence]', ...args)
}

/** Throw with a clear, actionable message if the preload bridge is stale.
 *  `ipc.intelligence` is typed non-null but may be `undefined` at runtime if
 *  the renderer hot-reloaded against an older preload that pre-dates this
 *  feature — that's the most common reason scans look frozen on dev. */
function assertBridge(): void {
  if (!(ipc as { intelligence?: unknown }).intelligence) {
    throw new Error(STALE_BRIDGE_MESSAGE)
  }
}

function ensureSubscribed(): void {
  if (unsubscribe) return
  assertBridge()
  debug('subscribing to scan events')
  const store = useDashboardStore
  unsubscribe = ipc.intelligence.subscribe({
    onProgress: (progress) => {
      debug('progress', progress.connectionId, progress.status, progress.progress, progress.currentTask)
      store.getState().setProgress(progress.connectionId, progress)
    },
    onDone: (result) => {
      debug('done', result.connectionId, `${result.issues.length} issues in ${result.durationMs}ms`)
      store.getState().setResult(result.connectionId, result)
      // Refresh the full series so the trend charts include this scan.
      void loadHistory(result.connectionId)
    },
    onError: (failure) => {
      debug('error', failure.connectionId, failure.status, failure.message)
      store
        .getState()
        .setError(failure.connectionId, failure.message, failure.status === 'cancelled')
    }
  })
}

/** Pull the full per-connection scan history into the store. */
export async function loadHistory(connectionId: string): Promise<void> {
  const store = useDashboardStore.getState()
  try {
    assertBridge()
    const result = await ipc.intelligence.history(connectionId)
    if (result.ok) {
      debug('history loaded', connectionId, result.data.length)
      store.setHistory(connectionId, result.data)
    } else {
      debug('history rejected', result.error)
    }
  } catch (err) {
    // History is a best-effort signal — log but don't surface to the UI; the
    // user already sees the live `result` and trend charts degrade silently.
    console.error('[intelligence] loadHistory threw:', err)
  }
}

/** Kick off a scan. Subscribes if needed; updates the store optimistically. */
export async function startScan(connectionId: string, kind: ScanKind): Promise<void> {
  const store = useDashboardStore.getState()
  try {
    assertBridge()
    ensureSubscribed()
    debug('startScan called', { connectionId, kind })
    store.resetError(connectionId)
    const result = await ipc.intelligence.startScan({ connectionId, kind })
    if (!result.ok) {
      debug('startScan rejected by main', result.error)
      store.setError(connectionId, result.error.message, false)
      return
    }
    debug('scan started id=', result.data.scanId)
    store.setRunning(connectionId, result.data.scanId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[intelligence] startScan threw:', err)
    store.setError(connectionId, message, false)
  }
}

/** Cancel the connection's in-flight scan, if any. */
export async function cancelScan(connectionId: string): Promise<void> {
  const store = useDashboardStore.getState()
  try {
    assertBridge()
    const slice = selectDashboardTab(store, connectionId)
    if (!slice.runningScanId) return
    debug('cancelScan', slice.runningScanId)
    await ipc.intelligence.cancelScan({ scanId: slice.runningScanId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[intelligence] cancelScan threw:', err)
    store.setError(connectionId, message, false)
  }
}

/** Hydrate the dashboard with the persisted last result for this connection. */
export async function hydrate(connectionId: string): Promise<void> {
  const store = useDashboardStore.getState()
  try {
    assertBridge()
    ensureSubscribed()
    debug('hydrate', connectionId)
    const result = await ipc.intelligence.latest(connectionId)
    if (result.ok && result.data) {
      debug('hydrate landed', result.data.issues.length, 'issues')
      store.setResult(connectionId, result.data)
    }
    // Always pull the history series so trend charts paint on first open.
    await loadHistory(connectionId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[intelligence] hydrate threw:', err)
    store.setError(connectionId, message, false)
  }
}
