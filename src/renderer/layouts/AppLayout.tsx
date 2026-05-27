import { lazy, Suspense, type ReactNode } from 'react'
import { TitleBar } from '@renderer/layouts/TitleBar'
import { Sidebar } from '@renderer/layouts/Sidebar'
import { StatusBar } from '@renderer/layouts/StatusBar'
import { ResultPanel } from '@renderer/layouts/ResultPanel'
import { EditorTabs } from '@renderer/features/editor/components/EditorTabs'
import { OverviewView } from '@renderer/features/editor/components/OverviewView'
import { TableDataView } from '@renderer/features/table-data/components/TableDataView'
import { IntelligenceDashboard } from '@renderer/features/intelligence-dashboard/components/IntelligenceDashboard'
import { AnomaliesDashboard } from '@renderer/features/data-anomalies/components/AnomaliesDashboard'
import { ConnectionRail } from '@renderer/features/connections/components/ConnectionRail'
import { ConnectionModal } from '@renderer/features/connections/components/ConnectionModal'
import { DatabasePickerModal } from '@renderer/features/connections/components/DatabasePickerModal'
import { SettingsModal } from '@renderer/features/settings/components/SettingsModal'
import { UpdateBanner } from '@renderer/features/updates/components/UpdateBanner'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import { useUiStore } from '@renderer/stores/uiStore'

// Monaco is heavy — load the editor in its own chunk so the shell paints fast.
const EditorView = lazy(() =>
  import('@renderer/features/editor/components/EditorView').then((m) => ({
    default: m.EditorView
  }))
)

/** The VS Code-style application shell: title bar, sidebar, editor, results. */
export function AppLayout(): ReactNode {
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const leftCollapsed = useUiStore((s) => s.leftPanelCollapsed)
  const railCollapsed = useUiStore((s) => s.connectionRailCollapsed)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app text-content">
      <TitleBar />
      <UpdateBanner />
      <div className="flex min-h-0 flex-1">
        {!leftCollapsed && (
          <>
            {!railCollapsed && <ConnectionRail />}
            <Sidebar />
          </>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <EditorTabs />
          {activeTab?.kind === 'table' ? (
            <TableDataView key={activeTab.id} tabId={activeTab.id} />
          ) : activeTab?.kind === 'overview' ? (
            <OverviewView
              key={activeTab.id}
              connectionId={activeTab.connectionId}
              schema={activeTab.schema}
            />
          ) : activeTab?.kind === 'intelligence' ? (
            <IntelligenceDashboard key={activeTab.id} />
          ) : activeTab?.kind === 'anomalies' ? (
            <AnomaliesDashboard key={activeTab.id} />
          ) : (
            <Suspense
              fallback={
                <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-subtle">
                  Loading editor…
                </div>
              }
            >
              <EditorView />
            </Suspense>
          )}
          <ResultPanel />
        </main>
      </div>
      <StatusBar />
      <ConnectionModal />
      <DatabasePickerModal />
      <SettingsModal />
    </div>
  )
}
