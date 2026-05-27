import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@renderer/utils/cn'

interface ScoreRingProps {
  /** 0–100 score; renders as a fraction of the ring. */
  score: number
  /** Diameter in pixels. */
  size?: number
  label?: string
  hint?: string
}

/** Colour-banded score:  ≥ 80 green, ≥ 60 amber, otherwise red. */
function colourFor(score: number): string {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#eab308'
  return '#ef4444'
}

/**
 * Circular progress ring — the centrepiece of the Health section.
 *
 * SVG stroke-dashoffset trick with a Framer-Motion stroke animation, so the
 * ring fills in smoothly the first time data arrives.
 */
export function ScoreRing({ score, size = 132, label, hint }: ScoreRingProps): ReactNode {
  const clamped = Math.max(0, Math.min(100, score))
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  const colour = colourFor(clamped)

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgb(125 125 125 / 0.2)"
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colour}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-3xl font-semibold')} style={{ color: colour }}>
            {Math.round(clamped)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-subtle">/ 100</span>
        </div>
      </div>
      {label && (
        <span className="text-[11px] font-semibold uppercase tracking-wider text-content">
          {label}
        </span>
      )}
      {hint && <span className="text-[10px] text-subtle">{hint}</span>}
    </div>
  )
}
