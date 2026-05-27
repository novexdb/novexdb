'use client'

import { motion } from 'framer-motion'
import { Activity, GitCompare, Receipt, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { Section } from '@/components/Section'
import { cn } from '@/lib/cn'

interface Showcase {
  eyebrow: string
  title: string
  body: string
  bullets: string[]
  visual: ReactNode
  flip?: boolean
}

const SHOWCASES: Showcase[] = [
  {
    eyebrow: 'Intelligence Dashboard',
    title: 'A single health score for your whole database.',
    body: 'Schema, data quality, performance, transactions, security — five categories rolled into one number. Each scan compares against the last 30 so the trend chart tells you whether the team is improving.',
    bullets: [
      'Weighted health score updates in real time',
      'Trend charts persist 30 scans per connection',
      'Risk-severity donut + table-size bars in ECharts'
    ],
    visual: <HealthVisual />
  },
  {
    eyebrow: 'Multi-scanner audit engine',
    title: 'Every issue your database has, in one ranked list.',
    body: 'Five scanners run in parallel — schema, data quality, performance, transactions, security. Each finding lands with severity, an investigation SQL and a one-click compare viewer so you can see the affected rows side-by-side.',
    bullets: [
      'Schema, data quality, performance, transactions, security — all in one pass',
      'Per-finding investigation SQL + side-by-side row comparison',
      'CSV export for finance / audit teams'
    ],
    flip: true,
    visual: <IssuesVisual />
  },
  {
    eyebrow: 'AI Insights',
    title: 'AI writes the post-mortem for every scan.',
    body: 'Each scan ends with a Markdown summary that cites your tables by name, ranks the top three risks, explains the user-facing impact, and recommends what to fix first. Bring your own key — Claude or OpenAI, both supported. Falls back to mechanical templates when AI is offline.',
    bullets: [
      'Bring-your-own-key for Claude or OpenAI (GPT-5)',
      'Streaming output — tokens appear as they arrive',
      'Mechanical fallback so the panel is never empty'
    ],
    visual: <AiVisual />
  }
]

export function DashboardShowcase(): ReactNode {
  return (
    <Section
      eyebrow="In action"
      heading={
        <>
          See what <span className="gradient-text">runs every minute</span> on your database.
        </>
      }
      subheading="Three of the most-used surfaces inside NovexDB — composed from the same primitives, all running locally."
    >
      <div className="space-y-24">
        {SHOWCASES.map((showcase) => (
          <ShowcaseRow key={showcase.title} showcase={showcase} />
        ))}
      </div>
    </Section>
  )
}

function ShowcaseRow({ showcase }: { showcase: Showcase }): ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.55 }}
      className={cn(
        'grid items-center gap-10 lg:grid-cols-2 lg:gap-16',
        showcase.flip && 'lg:[&>*:first-child]:order-2'
      )}
    >
      <div>
        <span className="rounded-full border border-line bg-surface/40 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          {showcase.eyebrow}
        </span>
        <h3 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-content sm:text-4xl">
          {showcase.title}
        </h3>
        <p className="mt-4 text-pretty text-[15px] leading-relaxed text-muted">
          {showcase.body}
        </p>
        <ul className="mt-6 space-y-2">
          {showcase.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-[13px] text-content/90">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgba(122,162,255,0.7)]" />
              {bullet}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative">
        <div
          aria-hidden
          className="glow-orb -z-10 left-1/4 top-1/4 h-[260px] w-[260px] bg-accent/15"
        />
        {showcase.visual}
      </div>
    </motion.div>
  )
}

// ────────────────────────────────────────────────────────────────── visuals ──

function HealthVisual(): ReactNode {
  return (
    <div className="gradient-border rounded-2xl bg-surface/70 p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-accent" />
          Health trend
        </span>
        <span>last 12 scans</span>
      </div>
      <svg viewBox="0 0 320 100" className="mt-3 h-32 w-full">
        <defs>
          <linearGradient id="trend-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5ad2ff" />
            <stop offset="100%" stopColor="#b07aff" />
          </linearGradient>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(122,162,255,0.4)" />
            <stop offset="100%" stopColor="rgba(122,162,255,0)" />
          </linearGradient>
        </defs>
        <path
          d="M0,72 L26,68 L52,74 L78,60 L104,55 L130,48 L156,52 L182,40 L208,36 L234,28 L260,30 L286,22 L320,18 L320,100 L0,100 Z"
          fill="url(#trend-fill)"
        />
        <path
          d="M0,72 L26,68 L52,74 L78,60 L104,55 L130,48 L156,52 L182,40 L208,36 L234,28 L260,30 L286,22 L320,18"
          fill="none"
          stroke="url(#trend-line)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-4 grid grid-cols-4 gap-2 text-[10px]">
        <Bucket label="Schema" value="92" colour="text-success" />
        <Bucket label="Quality" value="61" colour="text-amber" />
        <Bucket label="Perf" value="75" colour="text-success" />
        <Bucket label="Tx" value="48" colour="text-danger" />
      </div>
    </div>
  )
}

function IssuesVisual(): ReactNode {
  const rows: { sev: 'critical' | 'high' | 'medium' | 'low'; source: string; type: string; table: string; rows: string }[] = [
    { sev: 'critical', source: 'data-quality', type: 'duplicate_invoice_record', table: 'public.invoices', rows: '3 keys' },
    { sev: 'high', source: 'transaction', type: 'subtotal_vat_mismatch', table: 'public.invoice_lines', rows: '42 rows' },
    { sev: 'high', source: 'schema', type: 'missing_primary_key', table: 'public.audit_log', rows: '—' },
    { sev: 'medium', source: 'performance', type: 'slow_query', table: 'pg_stat_statements', rows: '8.2k calls' },
    { sev: 'medium', source: 'data-quality', type: 'invalid_emails', table: 'public.customers', rows: '11 rows' },
    { sev: 'medium', source: 'schema', type: 'missing_fk_index', table: 'public.orders', rows: '—' },
    { sev: 'low', source: 'data-quality', type: 'excessive_nulls', table: 'public.payments', rows: '2.1k rows' },
    { sev: 'low', source: 'schema', type: 'duplicate_index', table: 'public.products', rows: '—' }
  ]
  const SEV: Record<typeof rows[number]['sev'], string> = {
    critical: 'bg-danger/20 text-danger',
    high: 'bg-amber/25 text-amber',
    medium: 'bg-amber/15 text-amber',
    low: 'bg-accent/20 text-accent'
  }
  return (
    <div className="gradient-border overflow-hidden rounded-2xl bg-surface/70 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-line/80 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <GitCompare className="h-3 w-3 text-accent" />
          Issues — 47 total · ranked by severity
        </span>
        <span className="text-amber">filter · CSV</span>
      </div>
      <ul className="divide-y divide-line/60 font-mono text-[10.5px]">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-2 px-3 py-1.5">
            <span className={cn('rounded px-1.5 py-px text-[8.5px] font-medium uppercase tracking-[0.12em]', SEV[row.sev])}>
              {row.sev}
            </span>
            <span className="text-content">{row.type}</span>
            <span className="text-subtle">{row.source}</span>
            <span className="ml-auto text-subtle">{row.table}</span>
            <span className="text-subtle">{row.rows}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AiVisual(): ReactNode {
  return (
    <div className="gradient-border rounded-2xl bg-surface/70 p-5 backdrop-blur-xl">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-subtle">
        <Sparkles className="h-3 w-3 text-accent" />
        AI scan summary
      </div>
      <div className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-content/90">
        <p>
          <strong className="text-content">Three critical findings</strong> across this scan,
          two of them concentrated in <span className="font-mono text-cyan">public.invoices</span>:
        </p>
        <ul className="space-y-1.5 pl-4 text-muted">
          <li className="flex gap-2">
            <span className="text-danger">●</span>
            <span>
              <strong className="text-content">Duplicate invoice records</strong> — same
              <span className="font-mono text-cyan"> invoice_number + customer + total + date</span>{' '}
              appears 3 times. Two were created by an import job; one looks legitimate.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber">●</span>
            <span>
              <strong className="text-content">42 rows</strong> in{' '}
              <span className="font-mono text-cyan">invoice_lines</span> have subtotal + VAT ≠
              total. The drift is consistently 0.01–0.03 — looks like a rounding regression.
            </span>
          </li>
        </ul>
        <p className="text-muted">
          Fix the duplicate records first — they're the only category that affects revenue
          numbers. The rounding drift is cosmetic until it isn't.
        </p>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[10px] text-subtle">
        <Receipt className="h-3 w-3" />
        Generated by AI · 1.2s · falls back to mechanical templates offline
      </div>
    </div>
  )
}

function Bucket({
  label,
  value,
  colour
}: {
  label: string
  value: string
  colour: string
}): ReactNode {
  return (
    <div className="rounded-md border border-line/80 bg-surface/40 px-2 py-1.5">
      <div className="uppercase tracking-[0.18em] text-subtle">{label}</div>
      <div className={cn('mt-0.5 text-sm font-semibold', colour)}>{value}</div>
    </div>
  )
}

