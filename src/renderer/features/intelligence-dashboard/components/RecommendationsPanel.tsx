import type { ReactNode } from 'react'
import { Copy, Lightbulb } from 'lucide-react'
import { IconButton } from '@renderer/components/IconButton'
import { SeverityBadge } from '@renderer/features/intelligence-dashboard/widgets/SeverityBadge'
import type { Recommendation } from '@shared/types/intelligence'

interface RecommendationsPanelProps {
  recommendations: Recommendation[]
}

/** A scrollable list — each rec has rationale text + a one-click copy of its fix SQL. */
export function RecommendationsPanel({ recommendations }: RecommendationsPanelProps): ReactNode {
  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface/60 backdrop-blur-sm">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <Lightbulb className="h-3.5 w-3.5 text-warning" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          Recommendations
        </span>
        <span className="rounded bg-app px-1.5 py-px text-[10px] text-subtle">
          {recommendations.length}
        </span>
      </div>
      {recommendations.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 py-8 text-center text-[11px] text-subtle">
          No actionable recommendations — fix any open issues or run a scan to populate this list.
        </div>
      ) : (
        <ul className="max-h-[420px] divide-y divide-line/60 overflow-y-auto">
          {recommendations.map((rec) => (
            <li key={rec.id} className="space-y-2 px-3 py-3">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={rec.severity} />
                <h3 className="flex-1 truncate text-[12px] font-semibold text-content">
                  {rec.title}
                </h3>
                <IconButton
                  label="Copy SQL fix"
                  className="h-6 w-6"
                  onClick={() => void navigator.clipboard.writeText(rec.sql)}
                >
                  <Copy className="h-3 w-3" />
                </IconButton>
              </div>
              <p className="text-[11.5px] leading-relaxed text-muted">{rec.rationale}</p>
              <pre className="overflow-x-auto rounded border border-line bg-app p-2 font-mono text-[11px] leading-relaxed text-content">
                {rec.sql}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
