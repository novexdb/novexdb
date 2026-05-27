import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Copy, Download, Search } from 'lucide-react'
import { Input } from '@renderer/components/Input'
import { Select } from '@renderer/components/Select'
import { IconButton } from '@renderer/components/IconButton'
import { Button } from '@renderer/components/Button'
import { ipc } from '@renderer/services/ipc'
import { cn } from '@renderer/utils/cn'
import { SeverityBadge } from '@renderer/features/intelligence-dashboard/widgets/SeverityBadge'
import { rowsCsv } from '@renderer/features/table-data/utils/grid-clipboard'
import type { Issue, Severity } from '@shared/types/intelligence'

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1
}

interface IssuesTableProps {
  issues: Issue[]
}

/** The "Issues" table — filter / sort / expand / copy SQL / export CSV. */
export function IssuesTable({ issues }: IssuesTableProps): ReactNode {
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState<Severity | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return issues
      .filter((issue) => {
        if (severity !== 'all' && issue.severity !== severity) return false
        if (!needle) return true
        return (
          issue.description.toLowerCase().includes(needle) ||
          issue.type.toLowerCase().includes(needle) ||
          (issue.table ?? '').toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
  }, [issues, search, severity])

  const toggle = (id: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const exportCsv = async (): Promise<void> => {
    const columns = [
      { name: 'severity', dataType: 'text', nullable: false, isPrimaryKey: false },
      { name: 'type', dataType: 'text', nullable: false, isPrimaryKey: false },
      { name: 'table', dataType: 'text', nullable: true, isPrimaryKey: false },
      { name: 'description', dataType: 'text', nullable: false, isPrimaryKey: false },
      { name: 'rowsAffected', dataType: 'integer', nullable: true, isPrimaryKey: false },
      { name: 'detectedAt', dataType: 'timestamptz', nullable: false, isPrimaryKey: false }
    ]
    const rows = filtered.map((i) => [
      i.severity,
      i.type,
      i.table,
      i.description,
      i.rowsAffected ?? null,
      i.detectedAt
    ])
    const content = rowsCsv(columns, rows)
    await ipc.file.export({ defaultName: 'intelligence-issues.csv', content })
  }

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface/60 backdrop-blur-sm">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          Issues
        </span>
        <span className="rounded bg-app px-1.5 py-px text-[10px] text-subtle">
          {filtered.length} / {issues.length}
        </span>
        <span className="flex-1" />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-subtle" />
          <Input
            value={search}
            placeholder="Filter issues…"
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-44 pl-7 text-xs"
          />
        </div>
        <Select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as Severity | 'all')}
          className="h-7 w-32 text-xs"
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </Select>
        <Button size="sm" variant="ghost" onClick={() => void exportCsv()} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5" />
          CSV
        </Button>
      </div>
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center px-3 py-10 text-[11px] text-subtle">
          {issues.length === 0
            ? 'No issues detected — run a scan or enjoy the clean bill of health.'
            : 'No issues match your filter.'}
        </div>
      ) : (
        <ul className="max-h-[420px] divide-y divide-line/60 overflow-y-auto text-xs">
          {filtered.map((issue) => {
            const open = expanded.has(issue.id)
            return (
              <li key={issue.id}>
                <button
                  type="button"
                  onClick={() => toggle(issue.id)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-app/50"
                >
                  {open ? (
                    <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
                  )}
                  <SeverityBadge severity={issue.severity} />
                  <span className="font-mono text-[11px] text-subtle">{issue.type}</span>
                  {issue.table && (
                    <span className="font-mono text-[11px] text-content">{issue.table}</span>
                  )}
                  <span className="flex-1 truncate text-muted">{issue.description}</span>
                  {issue.rowsAffected !== undefined && (
                    <span className="shrink-0 text-[10px] text-subtle">
                      {issue.rowsAffected.toLocaleString()} rows
                    </span>
                  )}
                </button>
                {open && (
                  <div className={cn('space-y-2 border-t border-line/40 bg-app/40 px-9 py-2')}>
                    <p className="text-muted">{issue.description}</p>
                    {issue.suggestedSql && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider text-subtle">
                            Suggested fix
                          </span>
                          <IconButton
                            label="Copy SQL"
                            className="h-6 w-6"
                            onClick={() => void navigator.clipboard.writeText(issue.suggestedSql ?? '')}
                          >
                            <Copy className="h-3 w-3" />
                          </IconButton>
                        </div>
                        <pre className="overflow-x-auto rounded border border-line bg-app p-2 font-mono text-[11px] leading-relaxed text-content">
                          {issue.suggestedSql}
                        </pre>
                      </div>
                    )}
                    <span className="block text-[10px] text-subtle">
                      Detected {new Date(issue.detectedAt).toLocaleString()}
                    </span>
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
