import { lazy, Suspense, type ReactNode } from 'react'
import type { EChartsOption } from 'echarts'
import { useUiStore } from '@renderer/stores/uiStore'
import { cn } from '@renderer/utils/cn'

// Defer the ECharts bundle until a chart actually mounts — keeps the dashboard
// shell light when no scan has run yet.
const ReactECharts = lazy(() =>
  import('echarts-for-react').then((module) => ({ default: module.default }))
)

interface ChartContainerProps {
  title: string
  /** Right-aligned label or control next to the title. */
  trailing?: ReactNode
  /** Fixed chart body height in pixels. */
  height?: number
  /** Full echarts option object. */
  option: EChartsOption
  /** Empty-state node — shown when there's no data to draw. */
  empty?: ReactNode
  className?: string
}

/**
 * Themed ECharts wrapper. Picks the dark / default theme from `useUiStore`
 * and lazy-loads the chart bundle on first mount.
 */
export function ChartContainer({
  title,
  trailing,
  height = 240,
  option,
  empty,
  className
}: ChartContainerProps): ReactNode {
  const theme = useUiStore((s) => s.resolvedTheme)
  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border border-line bg-surface/60 backdrop-blur-sm',
        className
      )}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          {title}
        </span>
        {trailing}
      </div>
      <div className="relative" style={{ height }}>
        {empty ?? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-[11px] text-subtle">
                Loading chart…
              </div>
            }
          >
            <ReactECharts
              option={option}
              theme={theme === 'dark' ? 'dark' : undefined}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              notMerge
              lazyUpdate
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
