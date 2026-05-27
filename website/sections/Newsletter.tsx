'use client'

import { motion } from 'framer-motion'
import { Mail } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Section } from '@/components/Section'
import { Button } from '@/components/Button'

/** Email-capture strip. Submits client-side only — wire to a real list later. */
export function Newsletter(): ReactNode {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    if (!email.includes('@')) return
    // TODO: POST to Resend / ConvertKit / Buttondown — placeholder for now.
    setSubmitted(true)
  }

  return (
    <Section>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.4 }}
        className="grid items-center gap-8 rounded-2xl border border-line bg-surface/40 px-8 py-10 backdrop-blur md:grid-cols-[1fr_auto]"
      >
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
            <Mail className="h-3 w-3" />
            Changelog · launch alerts
          </div>
          <h3 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-content sm:text-3xl">
            One email when NovexDB ships its next scanner.
          </h3>
          <p className="mt-2 max-w-xl text-[13.5px] text-muted">
            No drip campaigns, no marketing. Roughly one email a month — the new
            feature, the bug you'd have hit otherwise, the AI prompt I tuned.
          </p>
        </div>
        {submitted ? (
          <p className="text-[13px] text-success">Thanks — you're on the list.</p>
        ) : (
          <form onSubmit={onSubmit} className="flex w-full max-w-md gap-2">
            <input
              type="email"
              required
              placeholder="you@team.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 flex-1 rounded-full border border-line-strong bg-bg/40 px-4 text-[13px] text-content placeholder:text-subtle focus:border-accent focus:outline-none"
            />
            <Button size="lg" type="submit">
              Subscribe
            </Button>
          </form>
        )}
      </motion.div>
    </Section>
  )
}
