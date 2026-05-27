import type { ComponentType, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'

interface PanelStubProps {
  title: string
  icon: ComponentType<LucideProps>
  /** Short, user-facing reason the panel is empty (e.g. "Run a scan to see…"). */
  hint: string
  /** Optional inline content rendered above the hint. */
  children?: ReactNode
}

/**
 * Visible placeholder for sections wired in later phases (AI Insights, Recommendations,
 * Transaction Risk, Data Quality). Keeps the dashboard layout final so we
 * don't reshuffle when those scanners land.
 */
export function PanelStub({ title, icon: Icon, hint, children }: PanelStubProps): ReactNode {
  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface/60 backdrop-blur-sm">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon className="h-3.5 w-3.5 text-subtle" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          {title}
        </span>
        <span className="ml-2 rounded bg-app px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-subtle">
          Coming next
        </span>
      </div>
      <div className="flex flex-1 flex-col items-stretch justify-center gap-2 px-4 py-6 text-center">
        {children}
        <p className="text-[11px] text-subtle">{hint}</p>
      </div>
    </div>
  )
}
