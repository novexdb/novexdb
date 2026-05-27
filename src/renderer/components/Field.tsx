import type { ReactNode } from 'react'
import { cn } from '@renderer/utils/cn'

interface FieldProps {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  className?: string
  children: ReactNode
}

/** A labelled form control with optional hint and validation error. */
export function Field({ label, htmlFor, error, hint, className, children }: FieldProps): ReactNode {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  )
}
