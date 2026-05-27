import { useEffect, useState, type ReactNode } from 'react'
import { ResizeHandle } from '@renderer/components/ResizeHandle'
import { clamp } from '@renderer/utils/clamp'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { ExplorerPanel } from '@renderer/features/explorer/components/ExplorerPanel'

const MIN_WIDTH = 200
const MAX_WIDTH = 480

/** Left sidebar: the schema explorer for the active connection. Resizable width. */
export function Sidebar(): ReactNode {
  const persistedWidth = useSettingsStore((s) => s.settings.sidebarWidth)
  const updateSettings = useSettingsStore((s) => s.update)
  const [width, setWidth] = useState(persistedWidth)

  useEffect(() => setWidth(persistedWidth), [persistedWidth])

  return (
    <aside
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-line bg-surface"
    >
      <ExplorerPanel />

      <ResizeHandle
        orientation="vertical"
        className="absolute inset-y-0 right-0"
        onResize={(delta) => setWidth((w) => clamp(w + delta, MIN_WIDTH, MAX_WIDTH))}
        onResizeEnd={() => void updateSettings({ sidebarWidth: width })}
      />
    </aside>
  )
}
