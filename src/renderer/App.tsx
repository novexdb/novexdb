import { useEffect, type ReactNode } from 'react'
import { useTheme } from '@renderer/hooks/useTheme'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { useConnections } from '@renderer/features/connections/hooks/useConnections'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import {
  selectAllWorkspaces,
  useEditorStore,
  workspaceKeyFor
} from '@renderer/features/editor/stores/editorStore'
import { useUpdateStore } from '@renderer/features/updates/stores/updateStore'
import { ipc } from '@renderer/services/ipc'
import { AppLayout } from '@renderer/layouts/AppLayout'

export default function App(): ReactNode {
  useTheme()
  const loadSettings = useSettingsStore((s) => s.load)
  const { refresh } = useConnections()

  // Hydrate persisted state from the main process on startup. After the
  // connections list loads, mirror the main-process pool state into the rail
  // (so reloaded windows / new windows show live connections as connected),
  // then activate the optional `?initialConnection=<id>` from the URL.
  useEffect(() => {
    void loadSettings()
    void (async () => {
      const persisted = await ipc.workspaces.get()
      if (persisted.ok) useEditorStore.getState().hydrateWorkspaces(persisted.data)

      await refresh()
      const result = await ipc.database.activeConnections()
      const store = useConnectionStore.getState()
      if (result.ok) {
        for (const id of result.data) store.setStatus(id, 'connected')
      }
      const initial = new URLSearchParams(window.location.search).get('initialConnection')
      if (initial) store.setActive(initial)
    })()
  }, [loadSettings, refresh])

  // Swap the editor's workspace whenever the active (connection, database)
  // changes — including when `switchDatabase` mutates the connection in place.
  useEffect(() => {
    const apply = (): void => {
      const conn = useConnectionStore.getState()
      const active = conn.connections.find((c) => c.id === conn.activeConnectionId)
      useEditorStore
        .getState()
        .setWorkspace(workspaceKeyFor(active?.id ?? null, active?.database ?? null))
    }
    apply()
    return useConnectionStore.subscribe(apply)
  }, [])

  // Persist the workspace map to disk, debounced. Gated on the existing
  // `autoSaveTabs` setting so the user can opt out.
  useEffect(() => {
    let timer: number | undefined
    const unsub = useEditorStore.subscribe((state) => {
      if (!useSettingsStore.getState().settings.autoSaveTabs) return
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void ipc.workspaces.set(selectAllWorkspaces(state))
      }, 300)
    })
    return () => {
      if (timer) window.clearTimeout(timer)
      unsub()
    }
  }, [])

  // Track the window's fullscreen state so the title bar can reclaim the
  // macOS traffic-light reserve when there are no traffic lights to clear.
  useEffect(() => {
    const setFullScreen = useUiStore.getState().setFullScreen
    void ipc.window.isFullScreen().then(setFullScreen)
    return ipc.window.subscribeFullScreen(setFullScreen)
  }, [])

  // Subscribe to auto-update events (a no-op feed-wise outside packaged builds).
  useEffect(() => {
    const store = useUpdateStore.getState
    return ipc.update.subscribe({
      onAvailable: (info) => store().onAvailable(info.version),
      onProgress: (info) => store().onProgress(info.percent),
      onDownloaded: (info) => store().onDownloaded(info.version),
      onError: () => undefined
    })
  }, [])

  return <AppLayout />
}
