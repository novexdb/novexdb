import { type ComponentType, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { type LucideProps } from 'lucide-react'
import { cn } from '@renderer/utils/cn'

interface StatCardProps {
  label: string
  value: string
  /** Optional supporting line — "+ 12% this week" etc. */
  hint?: string
  /** Lucide icon for the card chip. */
  icon: ComponentType<LucideProps>
  /** Tailwind text token, e.g. `'text-accent'` — drives the chip + value tint. */
  accent?: string
  /** Renders a shimmer instead of the value while the first scan is loading. */
  loading?: boolean
}

/** A compact, animated metric card — the top row of the dashboard. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'text-accent',
  loading
}: StatCardProps): ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'flex flex-col gap-1.5 rounded-xl border border-line bg-surface/60 p-3 backdrop-blur-sm'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-app/60',
            accent
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
          {label}
        </span>
      </div>
      {loading ? (
        <span className="h-6 w-20 animate-pulse rounded bg-line/70" />
      ) : (
        <span className={cn('text-xl font-semibold', accent)}>{value}</span>
      )}
      {hint && <span className="text-[10px] text-subtle">{hint}</span>}
    </motion.div>
  )
}
