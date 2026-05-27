import { useMemo, type ReactNode } from 'react'
import type { EChartsOption } from 'echarts'
import { ChartContainer } from '@renderer/features/intelligence-dashboard/charts/ChartContainer'
import type { Issue, Severity } from '@shared/types/intelligence'

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info'
}

/** Match the badges in the issues table for visual continuity. */
const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  info: '#6b7280'
}

interface RiskSeverityPieProps {
  issues: Issue[]
}

/** Donut chart — count of issues per severity bucket. */
export function RiskSeverityPie({ issues }: RiskSeverityPieProps): ReactNode {
  const data = useMemo(() => {
    const counts = new Map<Severity, number>()
    for (const issue of issues) counts.set(issue.severity, (counts.get(issue.severity) ?? 0) + 1)
    return SEVERITY_ORDER.filter((s) => counts.get(s)).map((severity) => ({
      name: SEVERITY_LABEL[severity],
      value: counts.get(severity) ?? 0,
      itemStyle: { color: SEVERITY_COLOR[severity] }
    }))
  }, [issues])

  const option: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'item' },
      legend: {
        bottom: 4,
        left: 'center',
        textStyle: { fontSize: 11 }
      },
      series: [
        {
          name: 'Issues by severity',
          type: 'pie',
          radius: ['50%', '72%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: false,
          label: { show: false },
          labelLine: { show: false },
          data
        }
      ]
    }),
    [data]
  )

  return (
    <ChartContainer
      title="Risk severity breakdown"
      option={option}
      empty={
        data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-subtle">
            No issues yet — run a scan.
          </div>
        ) : undefined
      }
    />
  )
}
