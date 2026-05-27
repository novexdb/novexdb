import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { IconButton } from '@renderer/components/IconButton'
import { ResizeHandle } from '@renderer/components/ResizeHandle'
import { clamp } from '@renderer/utils/clamp'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { useResultStore } from '@renderer/features/results/stores/resultStore'
import { ResultsArea } from '@renderer/features/results/components/ResultsArea'
import { ResultToolbar } from '@renderer/features/results/components/ResultToolbar'
import { HistoryList } from '@renderer/features/results/components/HistoryList'

// react-markdown is heavy — load the AI tab in its own chunk.
const AiTab = lazy(() =>
  import('@renderer/features/ai/components/AiTab').then((m) => ({ default: m.AiTab }))
)

const MIN_HEIGHT = 120
const MAX_HEIGHT = 640
const COLLAPSED_HEIGHT = 32

function PanelTabButton({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-full border-b-2 px-2.5 text-[11px] font-medium transition-colors',
        active
          ? 'border-accent text-content'
          : 'border-transparent text-subtle hover:text-content'
      )}
    >
      {label}
    </button>
  )
}

/** Bottom panel: tabbed Results / History, resizable and collapsible. */
export function ResultPanel(): ReactNode {
  const persistedHeight = useSettingsStore((s) => s.settings.resultPanelHeight)
  const updateSettings = useSettingsStore((s) => s.update)
  const collapsed = useUiStore((s) => s.resultPanelCollapsed)
  const toggle = useUiStore((s) => s.toggleResultPanel)
  const panelTab = useResultStore((s) => s.panelTab)
  const setPanelTab = useResultStore((s) => s.setPanelTab)
  const running = useResultStore((s) => s.status === 'running')
  const [height, setHeight] = useState(persistedHeight)

  useEffect(() => setHeight(persistedHeight), [persistedHeight])

  return (
    <section
      style={{ height: collapsed ? COLLAPSED_HEIGHT : height }}
      className="relative flex shrink-0 flex-col border-t border-line bg-app"
    >
      {!collapsed && (
        <ResizeHandle
          orientation="horizontal"
          className="absolute inset-x-0 top-0"
          onResize={(delta) => setHeight((h) => clamp(h - delta, MIN_HEIGHT, MAX_HEIGHT))}
          onResizeEnd={() => void updateSettings({ resultPanelHeight: height })}
        />
      )}

      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line bg-surface pl-1 pr-2">
        <PanelTabButton
          label="Results"
          active={panelTab === 'results'}
          onClick={() => setPanelTab('results')}
        />
        <PanelTabButton
          label="History"
          active={panelTab === 'history'}
          onClick={() => setPanelTab('history')}
        />
        <PanelTabButton
          label="AI"
          active={panelTab === 'ai'}
          onClick={() => setPanelTab('ai')}
        />
        {running && <Loader2 className="ml-1 h-3 w-3 animate-spin text-accent" />}
        <span className="flex-1" />
        {!collapsed && panelTab === 'results' && <ResultToolbar />}
        <IconButton
          label={collapsed ? 'Expand panel' : 'Collapse panel'}
          className="h-6 w-6"
          onClick={toggle}
        >
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </IconButton>
      </div>

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-hidden">
          {panelTab === 'results' && <ResultsArea />}
          {panelTab === 'history' && <HistoryList />}
          {panelTab === 'ai' && (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-xs text-subtle">
                  Loading AI…
                </div>
              }
            >
              <AiTab />
            </Suspense>
          )}
        </div>
      )}
    </section>
  )
}
