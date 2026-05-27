import type { ComponentType, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'

interface EmptyStateProps {
  icon: ComponentType<LucideProps>
  title: string
  description?: string
  action?: ReactNode
}

/** A centered placeholder for empty panels and zero-result states. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-subtle">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-content">{title}</p>
        {description && <p className="max-w-xs text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
