import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '@renderer/utils/cn'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-8 w-full rounded-md border border-line bg-app px-2 text-[13px] text-content',
        'transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)

Select.displayName = 'Select'
