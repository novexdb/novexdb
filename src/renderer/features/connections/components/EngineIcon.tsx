import type { ReactNode, SVGProps } from 'react'
import { Database } from 'lucide-react'
import type { DatabaseEngine } from '@shared/types/connection'

/**
 * Simple brand glyphs for the engine. Lucide doesn't ship vendor logos, so the
 * SQL Server / PostgreSQL / MySQL marks are hand-stroked at 24×24 with
 * `currentColor` strokes so they pick up the surrounding text color.
 */

interface IconProps extends SVGProps<SVGSVGElement> {
  className?: string
}

function SqlServerIcon({ className, ...props }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
      <path d="M5 11.5v6c0 1.4 3.1 2.5 7 2.5 1.4 0 2.7-.15 3.8-.4" />
      <path d="M14.5 17.2c.5.5 1.4.8 2.5.8 1.7 0 2.5-.7 2.5-1.4 0-1.9-5-1-5-2.9 0-.7.8-1.4 2.5-1.4 1.1 0 2 .3 2.5.8" />
    </svg>
  )
}

function PostgresIcon({ className, ...props }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M17 4.5c-1.7-.6-3.4-.7-5-.4-1.8-.4-3.2 0-4 .8-2 0-3 1.4-3 4 0 2.5.5 5 1.3 7 .5 1.3 1.3 1.9 2 1.9.7 0 1.2-.6 1.5-1.5" />
      <path d="M14.5 19.5c.6 0 1.1-.4 1.3-1 .6-1.6 2.2-6.4 2.2-9.4 0-2-.7-3.4-2-4.1" />
      <path d="M11 9c0 1.5.6 6 2 8.5" />
      <circle cx="9.5" cy="8.5" r=".5" />
    </svg>
  )
}

function MysqlIcon({ className, ...props }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M3 5c2.5 0 4.5 1.2 6 3.5 1.4 2.3 2.3 5 2.5 8" />
      <path d="M9 8c1.6.4 2.8 1.4 3.5 3" />
      <path d="M14 11c1.8 0 3.2.8 4 2 .8-1.2 2-2 4-2-1 1.5-2.5 4-2 6 .3 1.5-.8 2.7-2 3-1.5.3-2.5-.5-2.5-1.5" />
    </svg>
  )
}

interface EngineIconProps {
  engine: DatabaseEngine
  className?: string
}

/** Returns the brand mark for the given engine; falls back to the lucide Database. */
export function EngineIcon({ engine, className }: EngineIconProps): ReactNode {
  switch (engine) {
    case 'mssql':
      return <SqlServerIcon className={className} />
    case 'postgres':
      return <PostgresIcon className={className} />
    case 'mysql':
      return <MysqlIcon className={className} />
    default:
      return <Database className={className} aria-hidden="true" />
  }
}
