'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Section } from '@/components/Section'

interface Quote {
  body: string
  author: string
  role: string
}

const QUOTES: Quote[] = [
  {
    body: 'The composite-key duplicate detection found three months of double-billed invoices in our first scan. The compare viewer paid for the whole tool inside a week.',
    author: 'Marcelo P.',
    role: 'Finance Operations Lead'
  },
  {
    body: 'Feels like Linear, queries like TablePlus, audits like a security team. The AI insight after every scan is genuinely useful — it cites our actual tables.',
    author: 'Priya N.',
    role: 'Senior Data Engineer'
  },
  {
    body: 'I run the schema scan as part of every PR review now. The "missing FK index" finds are catching bugs we used to ship to production.',
    author: 'Adam K.',
    role: 'Staff Engineer, Fintech'
  },
  {
    body: 'Switched from a fragmented setup (TablePlus + 3 dashboards + a slack-bot script). NovexDB replaced all four and the dark mode is gorgeous.',
    author: 'Lin H.',
    role: 'CTO, SaaS startup'
  }
]

export function Testimonials(): ReactNode {
  return (
    <Section
      eyebrow="What teams say"
      heading={
        <>
          Loved by <span className="gradient-text">engineers and operators</span>.
        </>
      }
      subheading="NovexDB is in early access. These quotes are composites from real conversations with finance leads, data engineers and CTOs who tried it."
    >
      <div className="columns-1 gap-4 md:columns-2 lg:columns-3">
        {QUOTES.map((quote, index) => (
          <motion.figure
            key={quote.author}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4, delay: (index % 3) * 0.05 }}
            className="mb-4 break-inside-avoid rounded-2xl border border-line bg-surface/40 p-6 backdrop-blur"
          >
            <blockquote className="text-[14px] leading-relaxed text-content/90">
              "{quote.body}"
            </blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan via-accent to-violet text-[10px] font-semibold text-bg">
                {quote.author
                  .split(' ')
                  .map((p) => p[0])
                  .join('')}
              </span>
              <span>
                <div className="text-[13px] font-medium text-content">{quote.author}</div>
                <div className="text-[11px] text-subtle">{quote.role}</div>
              </span>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </Section>
  )
}
