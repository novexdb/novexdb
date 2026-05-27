import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface LogoProps {
  className?: string
  /** When false, renders as a static span instead of a Link (e.g. inside footer). */
  asLink?: boolean
}

/**
 * NovexDB wordmark — the canonical app icon (purple gradient rounded square
 * with the stacked-disc database) inlined as SVG so it scales without a
 * round-trip, plus the "NovexDB" wordmark. Same artwork as the desktop
 * app icon in [/assets/logo/icon.svg], simplified to drop the network-dot
 * texture which would muddy the mark at header-row sizes.
 */
export function Logo({ className, asLink = true }: LogoProps): ReactNode {
  const body = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] shadow-[0_4px_18px_-4px_rgba(124,58,237,0.6)]"
      >
        <svg viewBox="0 0 1024 1024" className="h-7 w-7">
          <defs>
            <linearGradient id="logo-bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#a78bfa" />
              <stop offset="0.45" stopColor="#7c3aed" />
              <stop offset="1" stopColor="#312e81" />
            </linearGradient>
            <linearGradient id="logo-discTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#bae6fd" />
            </linearGradient>
            <linearGradient id="logo-discSide" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#60a5fa" />
              <stop offset="1" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          {/* Rounded square (full canvas — no extra margin for the small header
              mark; the macOS-icon margin only matters for the Dock). */}
          <rect width="1024" height="1024" rx="224" ry="224" fill="url(#logo-bg)" />
          {/* Database cylinder, centred. */}
          <g transform="translate(326 346)">
            <ellipse cx="186" cy="332" rx="186" ry="36" fill="#1e40af" />
            <path d="M 0 296 L 0 332 A 186 36 0 0 0 372 332 L 372 296 Z" fill="url(#logo-discSide)" />
            <ellipse cx="186" cy="296" rx="186" ry="36" fill="url(#logo-discTop)" />
            <path d="M 0 184 L 0 220 A 186 36 0 0 0 372 220 L 372 184 Z" fill="url(#logo-discSide)" />
            <ellipse cx="186" cy="184" rx="186" ry="36" fill="url(#logo-discTop)" />
            <path d="M 0 72 L 0 108 A 186 36 0 0 0 372 108 L 372 72 Z" fill="url(#logo-discSide)" />
            <ellipse cx="186" cy="72" rx="186" ry="36" fill="url(#logo-discTop)" />
            <ellipse cx="150" cy="64" rx="110" ry="9" fill="#ffffff" opacity="0.55" />
          </g>
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-content">
        NovexDB
      </span>
    </span>
  )

  if (!asLink) return body
  return (
    <Link href="/" className="inline-flex">
      {body}
    </Link>
  )
}
