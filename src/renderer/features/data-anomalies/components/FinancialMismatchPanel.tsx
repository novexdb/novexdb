import { useMemo, type ComponentType, type ReactNode } from 'react'
import { Calculator, Copy, MinusCircle, Percent, Receipt } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { IconButton } from '@renderer/components/IconButton'
import { SeverityBadge } from '@renderer/features/intelligence-dashboard/widgets/SeverityBadge'
import { isFinancialIssue, typeLabel } from '@renderer/features/data-anomalies/utils/classify'
import type { Issue } from '@shared/types/intelligence'

interface FinancialMismatchPanelProps {
  issues: Issue[]
}

interface Bucket {
  type: string
  icon: ComponentType<LucideProps>
  emptyLabel: string
}

const BUCKETS: Bucket[] = [
  {
    type: 'subtotal_vat_mismatch',
    icon: Calculator,
    emptyLabel: 'No subtotal+VAT vs total mismatches detected.'
  },
  {
    type: 'negative_amount',
    icon: MinusCircle,
    emptyLabel: 'No negative-amount rows detected.'
  }
]

/** Four bucketed sub-panels under one header — easy to add more buckets later. */
export function FinancialMismatchPanel({ issues }: FinancialMismatchPanelProps): ReactNode {
  const byType = useMemo(() => {
    const map = new Map<string, Issue[]>()
    for (const issue of issues.filter(isFinancialIssue)) {
      const list = map.get(issue.type) ?? []
      list.push(issue)
      map.set(issue.type, list)
    }
    return map
  }, [issues])

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface/60 backdrop-blur-sm">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <Receipt className="h-3.5 w-3.5 text-subtle" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          Financial mismatches
        </span>
        <span className="rounded bg-app px-1.5 py-px text-[10px] text-subtle">
          {issues.filter(isFinancialIssue).length}
        </span>
      </div>
      <div className="space-y-3 p-3">
        {BUCKETS.map(({ type, icon: Icon, emptyLabel }) => {
          const bucketIssues = byType.get(type) ?? []
          return (
            <section key={type} className="rounded-lg border border-line/60 bg-app/30">
              <header className="flex items-center gap-2 border-b border-line/60 px-3 py-2">
                <Icon className="h-3.5 w-3.5 text-warning" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-content">
                  {typeLabel(type)}
                </span>
                <span className="rounded bg-app px-1.5 py-px text-[10px] text-subtle">
                  {bucketIssues.length}
                </span>
              </header>
              {bucketIssues.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-subtle">{emptyLabel}</p>
              ) : (
                <ul className="divide-y divide-line/40">
                  {bucketIssues.map((issue) => (
                    <li key={issue.id} className="space-y-1 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={issue.severity} />
                        {issue.table && (
                          <span className="font-mono text-[11px] text-content">{issue.table}</span>
                        )}
                        {issue.column && (
                          <span className="font-mono text-[10px] text-subtle">{issue.column}</span>
                        )}
                        <span className="flex-1" />
                        {issue.rowsAffected !== undefined && (
                          <span className="text-[10px] text-subtle">
                            {issue.rowsAffected.toLocaleString()} rows
                          </span>
                        )}
                        {issue.suggestedSql && (
                          <IconButton
                            label="Copy investigation SQL"
                            className="h-6 w-6"
                            onClick={() =>
                              void navigator.clipboard.writeText(issue.suggestedSql ?? '')
                            }
                          >
                            <Copy className="h-3 w-3" />
                          </IconButton>
                        )}
                      </div>
                      <p className="text-[11.5px] text-muted">{issue.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
        <p className="text-[10px] text-subtle">
          <Percent className="mr-1 inline h-3 w-3" />
          Tax/balance/inventory mismatch buckets land alongside these as future scanners
          contribute issues — the panel is type-driven.
        </p>
      </div>
    </div>
  )
}
