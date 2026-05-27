import type { ReactNode } from 'react'
import { ScoreRing } from '@renderer/features/intelligence-dashboard/widgets/ScoreRing'
import type { HealthCategoryScore, HealthScore } from '@shared/types/intelligence'

interface HealthScoreCardProps {
  health: HealthScore | null
  loading: boolean
}

const CATEGORIES: { key: keyof Omit<HealthScore, 'overall'>; label: string }[] = [
  { key: 'schema', label: 'Schema' },
  { key: 'dataQuality', label: 'Data quality' },
  { key: 'performance', label: 'Performance' },
  { key: 'transactionSafety', label: 'Transactions' },
  { key: 'security', label: 'Security' }
]

function ScoreBar({ category, score }: { category: string; score: HealthCategoryScore }): ReactNode {
  const colour = score.score >= 80 ? 'bg-success' : score.score >= 60 ? 'bg-warning' : 'bg-danger'
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted">{category}</span>
        <span className="text-content">
          {score.score}
          <span className="text-subtle"> · {score.issueCount} issue{score.issueCount === 1 ? '' : 's'}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-app">
        <div
          className={`h-full transition-all ${colour}`}
          style={{ width: `${score.score}%` }}
        />
      </div>
    </div>
  )
}

/** The composite health score — ring on the left, per-category bars on the right. */
export function HealthScoreCard({ health, loading }: HealthScoreCardProps): ReactNode {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface/60 p-4 backdrop-blur-sm md:flex-row md:items-center">
      <div className="flex-shrink-0">
        <ScoreRing
          score={health?.overall ?? 0}
          label="Health"
          hint={loading && !health ? 'Awaiting first scan…' : 'Composite score'}
        />
      </div>
      <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
        {CATEGORIES.map(({ key, label }) => (
          <ScoreBar
            key={key}
            category={label}
            score={health ? health[key] : { score: 0, issueCount: 0 }}
          />
        ))}
      </div>
    </div>
  )
}
