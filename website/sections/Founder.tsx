'use client'

import { motion } from 'framer-motion'
import {
  Cloud,
  Code2,
  Cpu,
  Database,
  Github,
  Linkedin,
  Mail,
  Twitter
} from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Section } from '@/components/Section'

const SKILLS = [
  { icon: Code2, label: 'React & Electron' },
  { icon: Cpu, label: 'AI product engineering' },
  { icon: Database, label: 'Postgres, MySQL, MSSQL' },
  { icon: Cloud, label: 'AWS, Node.js, Laravel' }
]

const SOCIALS = [
  { href: 'https://github.com/Asif-Saheer-k', label: 'GitHub', icon: Github },
  { href: 'https://linkedin.com/in/asifzaheer', label: 'LinkedIn', icon: Linkedin },
  { href: 'https://twitter.com/asifzaheer', label: 'Twitter', icon: Twitter },
  { href: 'mailto:hello@novexdb.app', label: 'Email', icon: Mail }
]

export function Founder(): ReactNode {
  return (
    <Section
      eyebrow="Founder"
      alignLeft
      heading={
        <>
          Built by one engineer who got tired of <span className="gradient-text">spreadsheet audits</span>.
        </>
      }
      subheading="NovexDB is a solo-built product. Every scanner, every IPC channel, every dashboard pixel was crafted to be the tool I wished I had during years of ERP work."
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
        className="gradient-border grid items-center gap-8 overflow-hidden rounded-2xl bg-surface/60 p-8 backdrop-blur-xl lg:grid-cols-[220px_1fr]"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-40 w-40 overflow-hidden rounded-full bg-gradient-to-br from-cyan via-accent to-violet p-[2px] shadow-[0_0_40px_-8px_rgba(122,162,255,0.6)]">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-surface text-3xl font-semibold text-content">
              AZ
            </div>
          </div>
          <div className="text-center">
            <div className="text-[15px] font-semibold tracking-tight text-content">
              Asif Zaheer
            </div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-subtle">
              Founder · React & AI
            </div>
          </div>
          <div className="flex items-center gap-1">
            {SOCIALS.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                aria-label={label}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-content"
              >
                <Icon className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-5 text-[14px] leading-relaxed text-content/90">
          <p>
            I've spent the last several years building React + Electron front-ends for
            ERP and analytics teams — the kind of work where a single duplicate
            invoice can ripple into quarterly numbers and finance teams chase the bug
            through Excel exports for days.
          </p>
          <p className="text-muted">
            NovexDB started as a TablePlus-style SQL workspace I built for my own
            use, then grew into the audit engine I wished existed at every job: live
            scanners, an AI copilot, and a dashboard that turns "what changed?" into
            a one-second question.
          </p>
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            {SKILLS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-lg border border-line/60 bg-surface-2/40 px-3 py-2 text-[12.5px]"
              >
                <Icon className="h-3.5 w-3.5 text-accent" />
                <span className="text-content">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </Section>
  )
}
