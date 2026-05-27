import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@renderer/utils/cn'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label — also used as the tooltip. */
  label: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted no-drag',
        'transition-colors hover:bg-surface hover:text-content',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
      {...props}
    />
  )
)

IconButton.displayName = 'IconButton'
