import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { Markdown } from '@renderer/components/Markdown'
import { SeverityBadge } from '@renderer/features/intelligence-dashboard/widgets/SeverityBadge'
import type { AiInsight } from '@shared/types/intelligence'

interface AiInsightsPanelProps {
  insights: AiInsight[]
}

/** Stacked cards — each insight is a small Markdown-rendered summary. */
export function AiInsightsPanel({ insights }: AiInsightsPanelProps): ReactNode {
  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface/60 backdrop-blur-sm">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          AI insights
        </span>
        <span className="rounded bg-app px-1.5 py-px text-[10px] text-subtle">
          {insights.length}
        </span>
      </div>
      {insights.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 py-8 text-center text-[11px] text-subtle">
          Run a scan to generate insights.
        </div>
      ) : (
        <ul className="max-h-[420px] divide-y divide-line/60 overflow-y-auto">
          {insights.map((insight, index) => (
            <motion.li
              key={insight.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16, delay: index * 0.04 }}
              className="space-y-2 px-3 py-3"
            >
              <div className="flex items-center gap-2">
                <SeverityBadge severity={insight.severity} />
                <h3 className="flex-1 truncate text-[12px] font-semibold text-content">
                  {insight.title}
                </h3>
              </div>
              <div className="text-[12px] leading-relaxed text-muted">
                <Markdown content={insight.body} />
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}
