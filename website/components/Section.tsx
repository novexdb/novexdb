import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Container } from '@/components/Container'

interface SectionProps {
  id?: string
  /** Optional eyebrow chip displayed above the heading. */
  eyebrow?: string
  /** The main h2 for the section. */
  heading?: ReactNode
  /** Subtext rendered below the heading. */
  subheading?: ReactNode
  /** Right-aligned helper (e.g. a link). */
  trailing?: ReactNode
  children: ReactNode
  className?: string
  /** When true, the section header isn't centred — used by the founder section. */
  alignLeft?: boolean
}

/** Standard marketing section — vertical rhythm + optional headlined header. */
export function Section({
  id,
  eyebrow,
  heading,
  subheading,
  trailing,
  children,
  className,
  alignLeft
}: SectionProps): ReactNode {
  return (
    <section id={id} className={cn('relative py-24 sm:py-32', className)}>
      <Container>
        {(eyebrow || heading || subheading) && (
          <header
            className={cn(
              'mb-12 flex flex-col gap-3',
              alignLeft ? 'items-start text-left' : 'items-center text-center'
            )}
          >
            {eyebrow && (
              <span className="rounded-full border border-line bg-surface/40 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted backdrop-blur">
                {eyebrow}
              </span>
            )}
            {heading && (
              <h2 className="text-balance text-3xl font-semibold tracking-tight text-content sm:text-4xl lg:text-5xl">
                {heading}
              </h2>
            )}
            {subheading && (
              <p
                className={cn(
                  'max-w-2xl text-pretty text-[15px] leading-relaxed text-muted',
                  alignLeft ? '' : 'mx-auto'
                )}
              >
                {subheading}
              </p>
            )}
            {trailing}
          </header>
        )}
        {children}
      </Container>
    </section>
  )
}
