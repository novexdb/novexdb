import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@renderer/utils/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full select-text rounded-md border bg-app px-2.5 text-[13px] text-content',
        'placeholder:text-subtle transition-colors',
        'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-danger' : 'border-line',
        className
      )}
      {...props}
    />
  )
)

Input.displayName = 'Input'
