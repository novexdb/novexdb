import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Copy, GitCompare, Search } from 'lucide-react'
import { Input } from '@renderer/components/Input'
import { IconButton } from '@renderer/components/IconButton'
import { cn } from '@renderer/utils/cn'
import { SeverityBadge } from '@renderer/features/intelligence-dashboard/widgets/SeverityBadge'
import {
  groupIssues,
  isDuplicateIssue,
  typeLabel
} from '@renderer/features/data-anomalies/utils/classify'
import type { Issue } from '@shared/types/intelligence'

interface DuplicateGroupsPanelProps {
  issues: Issue[]
  /** Called when the user clicks "Compare" on a group. */
  onCompare: (issue: Issue) => void
}

/** Group duplicate-class issues by `${table}::${type}`, expandable per row. */
export function DuplicateGroupsPanel({
  issues,
  onCompare
}: DuplicateGroupsPanelProps): ReactNode {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const filtered = issues.filter(isDuplicateIssue)
    const all = groupIssues(filtered)
    const needle = search.trim().toLowerCase()
    if (!needle) return all
    return all.filter(
      (g) =>
        (g.table ?? '').toLowerCase().includes(needle) ||
        typeLabel(g.type).toLowerCase().includes(needle)
    )
  }, [issues, search])

  const toggle = (key: string): void =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface/60 backdrop-blur-sm">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          Duplicate groups
        </span>
        <span className="rounded bg-app px-1.5 py-px text-[10px] text-subtle">{groups.length}</span>
        <span className="flex-1" />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-subtle" />
          <Input
            value={search}
            placeholder="Filter table or type…"
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-52 pl-7 text-xs"
          />
        </div>
      </div>
      {groups.length === 0 ? (
        <div className="flex items-center justify-center px-3 py-10 text-[11px] text-subtle">
          No duplicate-class issues — run a Data quality / Transaction scan.
        </div>
      ) : (
        <ul className="max-h-[460px] divide-y divide-line/60 overflow-y-auto text-xs">
          {groups.map((group) => {
            const isOpen = open.has(group.key)
            const worst = group.issues[0] // groupIssues sorts by rows; severity correlates loosely
            return (
              <li key={group.key}>
                <button
                  type="button"
                  onClick={() => toggle(group.key)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-app/50"
                >
                  {isOpen ? (
                    <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
                  )}
                  <SeverityBadge severity={worst.severity} />
                  <span className="shrink-0 font-mono text-[11px] text-content">
                    {group.table ?? '—'}
                  </span>
                  <span className="flex-1 truncate text-muted">{typeLabel(group.type)}</span>
                  <span className="shrink-0 text-[10px] text-subtle">
                    {group.totalRowsAffected.toLocaleString()} rows ·{' '}
                    {group.issues.length} finding{group.issues.length === 1 ? '' : 's'}
                  </span>
                </button>
                {isOpen && (
                  <div className={cn('space-y-2 border-t border-line/40 bg-app/40 px-9 py-2')}>
                    {group.issues.map((issue) => (
                      <div key={issue.id} className="space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="flex-1 text-muted">{issue.description}</span>
                          <IconButton
                            label="Compare records"
                            className="h-6 w-6"
                            onClick={() => onCompare(issue)}
                          >
                            <GitCompare className="h-3 w-3" />
                          </IconButton>
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
                        {issue.suggestedSql && (
                          <pre className="overflow-x-auto rounded border border-line bg-app p-2 font-mono text-[11px] leading-relaxed text-content">
                            {issue.suggestedSql}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
