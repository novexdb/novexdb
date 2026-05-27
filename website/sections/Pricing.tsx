'use client'

import { motion } from 'framer-motion'
import { Check, type LucideIcon, Sparkles, Users, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { Section } from '@/components/Section'
import { Button } from '@/components/Button'
import { cn } from '@/lib/cn'

interface Plan {
  name: string
  icon: LucideIcon
  price: string
  period?: string
  description: string
  features: string[]
  cta: { label: string; href: string }
  highlight?: boolean
}

const PLANS: Plan[] = [
  {
    name: 'Free',
    icon: Zap,
    price: '$0',
    description: 'For solo engineers running the desktop app on personal databases.',
    features: [
      'Unlimited connections',
      'Schema explorer + query editor',
      'Schema + Data quality scans',
      'Local AI via Ollama',
      '30-scan history per connection'
    ],
    cta: { label: 'Download free', href: '/download' }
  },
  {
    name: 'Pro',
    icon: Sparkles,
    price: '$12',
    period: '/month',
    description: 'For working professionals who depend on the AI copilot every day.',
    features: [
      'Everything in Free',
      'Bring-your-own-key — Claude or OpenAI',
      'Transaction + Financial scanners',
      'Duplicate-invoice composite detection',
      'PDF / Excel report export',
      'Priority email support'
    ],
    cta: { label: 'Start 14-day trial', href: '/download' },
    highlight: true
  },
  {
    name: 'Team',
    icon: Users,
    price: 'Custom',
    description: 'For teams that share connection profiles and want centrally-managed AI keys.',
    features: [
      'Everything in Pro',
      'Shared connection vault',
      'Org-wide AI key management',
      'Slack / webhook scan notifications',
      'SSO + audit log',
      'Dedicated onboarding'
    ],
    cta: { label: 'Contact sales', href: '/contact' }
  }
]

export function Pricing(): ReactNode {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      heading={
        <>
          Simple plans for <span className="gradient-text">every engineer</span>.
        </>
      }
      subheading="The desktop app is free forever for personal use. Upgrade when you want AI-powered insights, financial audits or team collaboration."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {PLANS.map((plan, index) => {
          const Icon = plan.icon
          return (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.45, delay: index * 0.06 }}
              className={cn(
                'relative flex flex-col rounded-2xl border bg-surface/40 p-7 backdrop-blur',
                plan.highlight
                  ? 'gradient-border border-transparent shadow-[0_30px_80px_-40px_rgba(122,162,255,0.5)]'
                  : 'border-line'
              )}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan via-accent to-violet px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-bg">
                  Most popular
                </span>
              )}
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2/70 text-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="text-[15px] font-semibold tracking-tight text-content">
                  {plan.name}
                </div>
              </div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight text-content">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-[12px] text-subtle">{plan.period}</span>
                )}
              </div>
              <p className="mt-2 text-[13px] text-muted">{plan.description}</p>
              <ul className="mt-6 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[13px] text-content/90">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                href={plan.cta.href}
                size="md"
                variant={plan.highlight ? 'primary' : 'secondary'}
                className="mt-8 w-full justify-center"
              >
                {plan.cta.label}
              </Button>
            </motion.div>
          )
        })}
      </div>
    </Section>
  )
}
