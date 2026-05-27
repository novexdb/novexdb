import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface CommonProps {
  variant?: Variant
  size?: Size
  className?: string
  children: ReactNode
}

type AnchorProps = CommonProps & ComponentProps<typeof Link>
type ButtonProps = CommonProps &
  ComponentProps<'button'> & { href?: undefined }

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-content text-bg shadow-[0_10px_30px_-12px_rgba(122,162,255,0.7)] hover:bg-content/90',
  secondary:
    'border border-line-strong bg-surface/40 text-content backdrop-blur hover:bg-surface',
  ghost: 'text-muted hover:text-content'
}

const SIZE: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-full px-3 text-[12px]',
  md: 'h-10 gap-2 rounded-full px-4 text-[13px]',
  lg: 'h-12 gap-2 rounded-full px-5 text-[14px]'
}

const BASE =
  'inline-flex shrink-0 items-center justify-center font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-50'

/** Polymorphic button — renders as `<Link>` when given an `href`, `<button>` otherwise. */
export function Button(props: AnchorProps | ButtonProps): ReactNode {
  const variant: Variant = props.variant ?? 'primary'
  const size: Size = props.size ?? 'md'
  const className = cn(BASE, VARIANT[variant], SIZE[size], props.className)

  if ('href' in props && props.href) {
    const { variant: _v, size: _s, className: _c, children, ...linkProps } = props
    void _v
    void _s
    void _c
    return (
      <Link {...linkProps} className={className}>
        {children}
      </Link>
    )
  }
  const { variant: _v, size: _s, className: _c, children, ...buttonProps } =
    props as ButtonProps
  void _v
  void _s
  void _c
  return (
    <button {...buttonProps} className={className}>
      {children}
    </button>
  )
}
