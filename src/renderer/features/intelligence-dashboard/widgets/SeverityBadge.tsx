import type { ReactNode } from 'react'
import { cn } from '@renderer/utils/cn'
import type { Severity } from '@shared/types/intelligence'

const STYLES: Record<Severity, string> = {
  critical: 'bg-danger/15 text-danger',
  high: 'bg-warning/20 text-warning',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-accent/15 text-accent',
  info: 'bg-line text-subtle'
}

const LABELS: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info'
}

/** Inline pill — every severity rendering in the dashboard uses this. */
export function SeverityBadge({ severity }: { severity: Severity }): ReactNode {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wide',
        STYLES[severity]
      )}
    >
      {LABELS[severity]}
    </span>
  )
}
