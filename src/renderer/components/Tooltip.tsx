import type { ReactNode } from 'react'
import { cn } from '@renderer/utils/cn'

interface TooltipProps {
  /** The visible text rendered in the popover. */
  label: string
  /** The trigger — anything hoverable. */
  children: ReactNode
  /** Where the popover floats relative to the trigger. */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Extra classes for the outer wrapper (rarely needed). */
  className?: string
}

const SIDE_CLASSES: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2'
}

/**
 * A pure-CSS hover popover. No portal, no JS positioning — the tooltip is
 * an absolutely positioned child of a `group` wrapper, so it inherits the
 * stacking context of whatever encloses it. Sufficient for one-word labels
 * on toolbar items; reach for a real floating-ui primitive if anyone
 * needs reach-into-clipped-containers or arrow indicators.
 */
export function Tooltip({
  label,
  children,
  side = 'bottom',
  className
}: TooltipProps): ReactNode {
  return (
    <span className={cn('relative inline-flex group', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md',
          'border border-line bg-elevated px-2 py-1 text-[11px] font-medium text-content shadow-lg',
          'opacity-0 scale-95 transition-all duration-150 ease-out',
          'group-hover:opacity-100 group-hover:scale-100',
          SIDE_CLASSES[side]
        )}
      >
        {label}
      </span>
    </span>
  )
}
