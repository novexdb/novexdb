import { useMemo, type ReactNode } from 'react'
import type { EChartsOption } from 'echarts'
import { ChartContainer } from '@renderer/features/intelligence-dashboard/charts/ChartContainer'
import type { TableSizeStats } from '@shared/types/intelligence'

interface TableSizeBarProps {
  tables: TableSizeStats[]
  /** Cap shown so the axis stays readable on huge schemas. */
  topN?: number
}

function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, exp)).toFixed(1)} ${units[exp]}`
}

/** Horizontal bar chart — the largest tables by total relation size. */
export function TableSizeBar({ tables, topN = 10 }: TableSizeBarProps): ReactNode {
  const slice = useMemo(
    () => [...tables].sort((a, b) => b.bytes - a.bytes).slice(0, topN).reverse(),
    [tables, topN]
  )

  const option: EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value) => humanBytes(Number(value))
      },
      grid: { left: 100, right: 24, top: 12, bottom: 24 },
      xAxis: {
        type: 'value',
        axisLabel: { fontSize: 10, formatter: (value: number) => humanBytes(value) }
      },
      yAxis: {
        type: 'category',
        data: slice.map((t) => `${t.schema}.${t.table}`),
        axisLabel: { fontSize: 10 }
      },
      series: [
        {
          type: 'bar',
          data: slice.map((t) => t.bytes),
          itemStyle: { color: '#4f8cff', borderRadius: [0, 4, 4, 0] }
        }
      ]
    }),
    [slice]
  )

  return (
    <ChartContainer
      title={`Top ${topN} tables by size`}
      option={option}
      height={Math.max(220, slice.length * 26 + 60)}
      empty={
        slice.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-subtle">
            No table data — run a scan.
          </div>
        ) : undefined
      }
    />
  )
}
