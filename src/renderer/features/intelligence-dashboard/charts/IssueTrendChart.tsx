import { useMemo, type ReactNode } from 'react'
import type { EChartsOption } from 'echarts'
import { ChartContainer } from '@renderer/features/intelligence-dashboard/charts/ChartContainer'
import type { ScanResult, Severity } from '@shared/types/intelligence'

interface IssueTrendChartProps {
  history: ScanResult[]
}

/** Stack order (bottom → top) + per-severity colour, matching the badges. */
const SEVERITY_STACK: { key: Severity; label: string; colour: string }[] = [
  { key: 'critical', label: 'Critical', colour: '#ef4444' },
  { key: 'high', label: 'High', colour: '#f97316' },
  { key: 'medium', label: 'Medium', colour: '#eab308' },
  { key: 'low', label: 'Low', colour: '#3b82f6' }
]

/** Stacked-area chart — issue counts per severity bucket per scan. */
export function IssueTrendChart({ history }: IssueTrendChartProps): ReactNode {
  const series = useMemo(() => [...history].reverse(), [history])

  const option: EChartsOption = useMemo(() => {
    const buckets = SEVERITY_STACK.map(({ key }) =>
      series.map((scan) => scan.issues.filter((i) => i.severity === key).length)
    )
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
      legend: {
        bottom: 4,
        textStyle: { fontSize: 10 },
        data: SEVERITY_STACK.map((s) => s.label)
      },
      grid: { left: 36, right: 24, top: 16, bottom: 36 },
      xAxis: {
        type: 'category',
        data: series.map((s) => new Date(s.finishedAt).toLocaleString()),
        axisLabel: { fontSize: 10, hideOverlap: true }
      },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 }, minInterval: 1 },
      series: SEVERITY_STACK.map((s, i) => ({
        name: s.label,
        type: 'line',
        stack: 'issues',
        areaStyle: { color: s.colour, opacity: 0.4 },
        lineStyle: { color: s.colour, width: 1 },
        symbol: 'circle',
        symbolSize: 4,
        itemStyle: { color: s.colour },
        data: buckets[i]
      }))
    }
  }, [series])

  return (
    <ChartContainer
      title="Issues over time"
      option={option}
      height={220}
      empty={
        series.length < 2 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-subtle">
            {series.length === 0
              ? 'No scan history yet — run a scan.'
              : 'Run a second scan to see the trend.'}
          </div>
        ) : undefined
      }
    />
  )
}
