import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ContainerProps {
  children: ReactNode
  className?: string
}

/** Max-width wrapper used by every section — keeps copy line-length sane. */
export function Container({ children, className }: ContainerProps): ReactNode {
  return (
    <div className={cn('mx-auto w-full max-w-7xl px-6 lg:px-8', className)}>
      {children}
    </div>
  )
}
