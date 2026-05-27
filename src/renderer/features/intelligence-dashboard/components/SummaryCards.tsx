import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Database,
  HardDrive,
  Layers,
  Link2,
  Search,
  ShieldAlert,
  TableProperties
} from 'lucide-react'
import { StatCard } from '@renderer/features/intelligence-dashboard/widgets/StatCard'
import type { SummaryStats } from '@shared/types/intelligence'

interface SummaryCardsProps {
  summary: SummaryStats | null
  loading: boolean
}

function humanBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, exp)).toFixed(1)} ${units[exp]}`
}

function humanCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** Top row of metrics — pulled from the merged scanner summary. */
export function SummaryCards({ summary, loading }: SummaryCardsProps): ReactNode {
  const s = summary
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <StatCard
        label="Tables"
        value={s ? String(s.totalTables) : '—'}
        icon={TableProperties}
        loading={loading && !s}
      />
      <StatCard
        label="Rows"
        value={s ? humanCount(s.totalRows) : '—'}
        icon={Layers}
        loading={loading && !s}
      />
      <StatCard
        label="DB size"
        value={s ? humanBytes(s.databaseSizeBytes) : '—'}
        icon={HardDrive}
        loading={loading && !s}
      />
      <StatCard
        label="Duplicates"
        value={s ? humanCount(s.duplicateRecordsCount) : '—'}
        icon={Search}
        accent="text-warning"
        loading={loading && !s}
      />
      <StatCard
        label="Invalid rows"
        value={s ? humanCount(s.invalidRecordsCount) : '—'}
        icon={AlertTriangle}
        accent="text-warning"
        loading={loading && !s}
      />
      <StatCard
        label="Missing FKs"
        value={s ? String(s.missingForeignKeys) : '—'}
        icon={Link2}
        accent="text-danger"
        loading={loading && !s}
      />
      <StatCard
        label="Missing indexes"
        value={s ? String(s.missingIndexes) : '—'}
        icon={Database}
        accent="text-danger"
        loading={loading && !s}
      />
      <StatCard
        label="Active risks"
        value={s ? String(s.activeRisks) : '—'}
        icon={ShieldAlert}
        accent="text-danger"
        loading={loading && !s}
      />
    </div>
  )
}
