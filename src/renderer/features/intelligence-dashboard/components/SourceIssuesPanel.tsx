import { useMemo, type ComponentType, type ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { SeverityBadge } from '@renderer/features/intelligence-dashboard/widgets/SeverityBadge'
import type { Issue, ScanKind, Severity } from '@shared/types/intelligence'

interface SourceIssuesPanelProps {
  title: string
  icon: ComponentType<LucideProps>
  /** Source filter — only issues with this `source` are shown. */
  source: ScanKind
  issues: Issue[]
  emptyLabel: string
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1
}

/**
 * Source-scoped issues panel — a compact summary of counts by type plus the
 * full list, severity-sorted. Used by Data Quality and Transaction Risk;
 * cheap to add for any future scan kind.
 */
export function SourceIssuesPanel({
  title,
  icon: Icon,
  source,
  issues,
  emptyLabel
}: SourceIssuesPanelProps): ReactNode {
  const filtered = useMemo(
    () =>
      issues
        .filter((i) => i.source === source)
        .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]),
    [issues, source]
  )
  const summary = useMemo(() => {
    const counts = new Map<string, number>()
    for (const issue of filtered) counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [filtered])

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface/60 backdrop-blur-sm">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon className="h-3.5 w-3.5 text-subtle" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          {title}
        </span>
        <span className="rounded bg-app px-1.5 py-px text-[10px] text-subtle">
          {filtered.length}
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 py-8 text-center text-[11px] text-subtle">
          {emptyLabel}
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          {summary.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b border-line/60 px-3 py-2">
              {summary.map(([type, n]) => (
                <span
                  key={type}
                  className="rounded bg-app px-1.5 py-0.5 font-mono text-[10px] text-muted"
                >
                  {type} · {n}
                </span>
              ))}
            </div>
          )}
          <ul className="max-h-[320px] divide-y divide-line/60 overflow-y-auto text-xs">
            {filtered.map((issue) => (
              <li key={issue.id} className="flex items-start gap-2 px-3 py-2">
                <SeverityBadge severity={issue.severity} />
                {issue.table && (
                  <span className="shrink-0 font-mono text-[11px] text-content">
                    {issue.table}
                  </span>
                )}
                <span className="flex-1 text-muted">{issue.description}</span>
                {issue.rowsAffected !== undefined && (
                  <span className="shrink-0 text-[10px] text-subtle">
                    {issue.rowsAffected.toLocaleString()} rows
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
