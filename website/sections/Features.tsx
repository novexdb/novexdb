'use client'

import { motion } from 'framer-motion'
import {
  Activity,
  Brain,
  Database,
  Gauge,
  LineChart,
  ListChecks,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Table2,
  type LucideIcon
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Section } from '@/components/Section'
import { cn } from '@/lib/cn'

interface Feature {
  icon: LucideIcon
  title: string
  body: string
  accent?: string
}

const FEATURES: Feature[] = [
  {
    icon: ScanSearch,
    title: 'AI Scan Engine',
    body: 'A modular engine that audits your entire database — schema, data quality, performance, transactions, security — and reports findings with severity, suggested fix and the SQL to investigate.',
    accent: 'from-accent/30 to-violet/20'
  },
  {
    icon: Activity,
    title: 'Database Health Score',
    body: 'A composite 0–100 score across five categories, trending across your last 30 scans. Tells you whether your database is getting healthier or quietly degrading.',
    accent: 'from-cyan/30 to-accent/20'
  },
  {
    icon: Gauge,
    title: 'Performance Audits',
    body: 'Pulls slow queries from pg_stat_statements / performance_schema and ranks them by latency. Flags missing FK indexes, duplicate indexes and tables without primary keys.',
    accent: 'from-amber/30 to-amber/10'
  },
  {
    icon: ListChecks,
    title: 'Data Quality Checks',
    body: 'Invalid emails, NULL spikes, orphaned rows, duplicated business identifiers, calculation drift. Sample-based so the audit finishes in seconds even on million-row tables.',
    accent: 'from-violet/30 to-accent/20'
  },
  {
    icon: ShieldCheck,
    title: 'Transaction & Financial Audits',
    body: 'Heuristic ERP audits — composite-key duplicate detection, subtotal + VAT ≠ total, negative balances. Catches the issues finance teams currently find weeks later in spreadsheets.',
    accent: 'from-amber/30 to-accent/10'
  },
  {
    icon: Brain,
    title: 'AI-written Post-mortems',
    body: 'Every scan ends with an AI-written Markdown summary that cites your tables by name, ranks the top risks and tells you exactly what to fix first — backed by your choice of provider.',
    accent: 'from-violet/30 to-accent/10'
  },
  {
    icon: Sparkles,
    title: 'AI SQL Copilot',
    body: 'Describe the query in English and the AI writes the SQL with full schema awareness. Safety analyzer flags destructive intent before you run it.',
    accent: 'from-cyan/30 to-accent/20'
  },
  {
    icon: LineChart,
    title: 'Live Visual Analytics',
    body: 'ECharts dashboards for health trend, issue severity, table sizes and growth — dark-mode tuned, zero configuration, refresh after every scan.',
    accent: 'from-success/25 to-accent/10'
  },
  {
    icon: Table2,
    title: 'Polished SQL Workspace',
    body: 'Postgres, MySQL, SQLite and SQL Server in one place. Schema explorer, editable data grid, streaming dump imports, right-click context menus everywhere.',
    accent: 'from-accent/30 to-violet/20'
  }
]

export function Features(): ReactNode {
  return (
    <Section
      id="features"
      eyebrow="Capabilities"
      heading={
        <>
          One AI scanner. <span className="gradient-text">Every issue, surfaced.</span>
        </>
      }
      subheading="NovexDB runs a multi-scanner audit across your whole database — health, performance, data quality, transactions, security — then lets the AI explain the findings. Bring your own key for Claude or OpenAI. A polished SQL workspace ships in the same window."
    >
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line/60 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <FeatureCard key={feature.title} feature={feature} index={index} />
        ))}
      </div>
    </Section>
  )
}

function FeatureCard({ feature, index }: { feature: Feature; index: number }): ReactNode {
  const Icon = feature.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, delay: (index % 3) * 0.05 }}
      className="group relative isolate flex flex-col gap-3 bg-bg p-7 transition-colors hover:bg-surface/50"
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-10 top-0 -z-10 h-px bg-gradient-to-r opacity-0 transition-opacity group-hover:opacity-100',
          feature.accent ?? 'from-accent/30 to-violet/20'
        )}
      />
      <div
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-content shadow-[0_6px_24px_-12px_rgba(122,162,255,0.7)]',
          feature.accent ?? 'from-accent/30 to-violet/20'
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-[15px] font-semibold tracking-tight text-content">
        {feature.title}
      </h3>
      <p className="text-[13.5px] leading-relaxed text-muted">{feature.body}</p>
    </motion.div>
  )
}
