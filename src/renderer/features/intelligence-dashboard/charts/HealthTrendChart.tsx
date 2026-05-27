import { useMemo, type ReactNode } from 'react'
import type { EChartsOption } from 'echarts'
import { ChartContainer } from '@renderer/features/intelligence-dashboard/charts/ChartContainer'
import type { ScanResult } from '@shared/types/intelligence'

interface HealthTrendChartProps {
  /** Newest-first scan history. */
  history: ScanResult[]
}

/** Composite health score over time — needs ≥ 2 scans to draw a meaningful line. */
export function HealthTrendChart({ history }: HealthTrendChartProps): ReactNode {
  // Oldest-first for chart consumption.
  const series = useMemo(() => [...history].reverse(), [history])

  const option: EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        valueFormatter: (value) => `${Number(value).toFixed(0)} / 100`
      },
      grid: { left: 36, right: 24, top: 16, bottom: 28 },
      xAxis: {
        type: 'category',
        data: series.map((s) => new Date(s.finishedAt).toLocaleString()),
        axisLabel: { fontSize: 10, hideOverlap: true }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { fontSize: 10 }
      },
      series: [
        {
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: series.map((s) => s.health.overall),
          itemStyle: { color: '#4f8cff' },
          areaStyle: { color: 'rgba(79, 140, 255, 0.18)' }
        }
      ]
    }),
    [series]
  )

  return (
    <ChartContainer
      title="Health score over time"
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
