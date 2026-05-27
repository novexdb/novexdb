import type { ReactNode } from 'react'
import { Database, GitCompare, ListChecks, Sparkles, Table2 } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Pure-CSS approximation of the NovexDB Intelligence Dashboard — used as
 * the hero "screenshot" without shipping a real PNG. Lives in its own file
 * so the rest of the marketing site can reuse it (Features page, etc.).
 */
export function AppMockup({ className }: { className?: string }): ReactNode {
  return (
    <div
      className={cn(
        'gradient-border relative overflow-hidden rounded-2xl bg-surface/80 backdrop-blur-xl',
        className
      )}
    >
      {/* macOS chrome */}
      <div className="flex h-9 items-center gap-2 border-b border-line/80 bg-surface-2/80 px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
        <span className="ml-3 font-mono text-[11px] text-subtle">
          NovexDB — alhind / mysql / gamer-over-test
        </span>
      </div>
      <div className="grid grid-cols-[210px_1fr]">
        {/* Sidebar */}
        <aside className="border-r border-line/80 bg-surface/40 p-3 text-[11px]">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold uppercase tracking-[0.18em] text-subtle">
              Explorer
            </span>
            <Sparkles className="h-3 w-3 text-accent" />
          </div>
          <SidebarItem icon={<Database className="h-3 w-3 text-accent" />} label="public" depth={0} bold />
          <SidebarItem icon={<Table2 className="h-3 w-3 text-accent" />} label="Tables" depth={1} bold trailing="14" />
          <SidebarItem label="customers" depth={2} />
          <SidebarItem label="invoices" depth={2} active />
          <SidebarItem label="invoice_lines" depth={2} />
          <SidebarItem label="orders" depth={2} />
          <SidebarItem label="payments" depth={2} />
          <SidebarItem icon={<ListChecks className="h-3 w-3 text-success" />} label="Views" depth={1} bold trailing="3" />
          <SidebarItem icon={<GitCompare className="h-3 w-3 text-warning" />} label="Indexes" depth={1} bold trailing="22" />
        </aside>

        {/* Main */}
        <div className="bg-bg p-4">
          {/* Health summary row */}
          <div className="mb-4 grid grid-cols-4 gap-2 text-[11px]">
            <Stat label="Tables" value="14" />
            <Stat label="Rows" value="2.4M" />
            <Stat label="Duplicates" value="142" accent="text-warning" />
            <Stat label="Active risks" value="9" accent="text-danger" />
          </div>

          {/* Health ring + bars */}
          <div className="mb-4 grid grid-cols-[160px_1fr] gap-3 rounded-lg border border-line/80 bg-surface/40 p-3">
            <HealthRing score={78} />
            <div className="space-y-2 text-[10.5px]">
              <ScoreBar label="Schema" pct={92} />
              <ScoreBar label="Data quality" pct={61} colour="bg-warning" />
              <ScoreBar label="Performance" pct={75} />
              <ScoreBar label="Transactions" pct={48} colour="bg-danger" />
            </div>
          </div>

          {/* Issues block */}
          <div className="rounded-lg border border-line/80 bg-surface/40">
            <div className="flex items-center justify-between border-b border-line/80 px-3 py-2 text-[11px] text-subtle">
              <span className="font-semibold uppercase tracking-[0.18em]">Top issues</span>
              <span className="font-mono text-amber">5 of 142</span>
            </div>
            <ul className="divide-y divide-line/60 text-[10.5px]">
              <IssueRow
                severity="critical"
                table="public.invoices"
                type="duplicate_invoice_record"
                rows="3 keys"
              />
              <IssueRow
                severity="high"
                table="public.invoice_lines"
                type="subtotal_vat_mismatch"
                rows="42 rows"
              />
              <IssueRow
                severity="medium"
                table="public.customers"
                type="invalid_emails"
                rows="11 rows"
              />
              <IssueRow
                severity="medium"
                table="public.orders"
                type="missing_fk_index"
                rows="—"
              />
              <IssueRow
                severity="low"
                table="public.payments"
                type="excessive_nulls"
                rows="2.1k"
              />
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────── primitives ──

function SidebarItem({
  icon,
  label,
  depth,
  trailing,
  bold,
  active
}: {
  icon?: ReactNode
  label: string
  depth: number
  trailing?: string
  bold?: boolean
  active?: boolean
}): ReactNode {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 truncate rounded px-1.5 py-1 leading-none',
        active && 'bg-accent-soft text-content',
        !active && bold && 'text-content',
        !active && !bold && 'text-muted'
      )}
      style={{ paddingLeft: depth * 10 + 6 }}
    >
      {icon ?? <span className="h-3 w-3" />}
      <span className="truncate text-[10.5px]">{label}</span>
      {trailing && <span className="ml-auto text-[9px] text-subtle">{trailing}</span>}
    </div>
  )
}

function Stat({
  label,
  value,
  accent
}: {
  label: string
  value: string
  accent?: string
}): ReactNode {
  return (
    <div className="rounded-md border border-line/80 bg-surface/40 px-2.5 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-subtle">
        {label}
      </div>
      <div className={cn('mt-0.5 text-[13px] font-semibold', accent ?? 'text-accent')}>
        {value}
      </div>
    </div>
  )
}

function HealthRing({ score }: { score: number }): ReactNode {
  const size = 110
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - score / 100)
  const colour = score >= 80 ? '#4ade80' : score >= 60 ? '#f5b049' : '#ef4f4f'
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colour}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold" style={{ color: colour }}>
            {score}
          </span>
          <span className="text-[9px] uppercase tracking-[0.18em] text-subtle">/ 100</span>
        </div>
      </div>
      <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-subtle">Health</span>
    </div>
  )
}

function ScoreBar({
  label,
  pct,
  colour = 'bg-success'
}: {
  label: string
  pct: number
  colour?: string
}): ReactNode {
  return (
    <div>
      <div className="flex justify-between text-muted">
        <span>{label}</span>
        <span className="text-content">{pct}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className={cn('h-full', colour)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const SEVERITY: Record<string, string> = {
  critical: 'bg-danger/20 text-danger',
  high: 'bg-amber/25 text-amber',
  medium: 'bg-amber/15 text-amber',
  low: 'bg-accent/20 text-accent'
}

function IssueRow({
  severity,
  table,
  type,
  rows
}: {
  severity: keyof typeof SEVERITY
  table: string
  type: string
  rows: string
}): ReactNode {
  return (
    <li className="flex items-center gap-2 px-3 py-1.5">
      <span
        className={cn(
          'rounded px-1.5 py-px text-[8.5px] font-medium uppercase tracking-[0.12em]',
          SEVERITY[severity]
        )}
      >
        {severity}
      </span>
      <span className="font-mono text-[10px] text-content">{table}</span>
      <span className="font-mono text-[10px] text-subtle">{type}</span>
      <span className="ml-auto text-[10px] text-subtle">{rows}</span>
    </li>
  )
}
