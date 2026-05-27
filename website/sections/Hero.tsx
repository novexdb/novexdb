'use client'

import { motion } from 'framer-motion'
import { Apple, BookOpen, Download, MessageSquare } from 'lucide-react'
import type { ReactNode } from 'react'
import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { AppMockup } from '@/sections/AppMockup'

/** Headline + sub + CTAs + animated app mockup. The first paint of the site. */
export function Hero(): ReactNode {
  return (
    <section className="relative isolate overflow-hidden pt-20 pb-28 sm:pt-28 sm:pb-32">
      {/* Background — dotted grid with a soft radial mask. */}
      <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
      <div
        aria-hidden
        className="glow-orb -z-10 left-1/2 top-[-200px] h-[480px] w-[680px] -translate-x-1/2 bg-accent/30"
      />
      <div
        aria-hidden
        className="glow-orb -z-10 left-[10%] top-[40%] h-[320px] w-[320px] bg-violet/20"
      />
      <div
        aria-hidden
        className="glow-orb -z-10 right-[8%] top-[20%] h-[320px] w-[320px] bg-cyan/15"
      />

      <Container className="flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-2"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/40 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            v0.1 · early access
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-success">
            Free forever · no account
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mt-6 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
        >
          <span className="gradient-text">A modern database client.</span>
          <br />
          <span className="text-content/85">
            Fast queries. AI that actually understands them.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="mt-6 max-w-2xl text-pretty text-[15px] leading-relaxed text-muted sm:text-base"
        >
          NovexDB is a native desktop client for Postgres, MySQL, SQLite, and
          MSSQL. Browse and edit tables inline, write SQL with autocomplete and
          one-click optimize, and audit your whole database with one click — AI
          that explains every finding in plain English. Free forever, runs
          entirely on your machine.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18 }}
          className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Button href="/download" size="lg">
            <Apple className="h-4 w-4" />
            Download for macOS
          </Button>
          <Button href="/download" size="lg" variant="secondary">
            <Download className="h-4 w-4" />
            Download for Windows
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-subtle"
        >
          <a href="/features" className="inline-flex items-center gap-1.5 hover:text-content">
            <BookOpen className="h-3.5 w-3.5" /> See what's inside
          </a>
          <a href="https://github.com/Asif-Saheer-k" className="inline-flex items-center gap-1.5 hover:text-content">
            <MessageSquare className="h-3.5 w-3.5" /> Join the community
          </a>
          <span>Postgres · MySQL · SQLite · MSSQL</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="relative mt-16 w-full max-w-[1080px]"
        >
          <AppMockup className="mx-auto shadow-[0_40px_100px_-30px_rgba(122,162,255,0.5)]" />
        </motion.div>
      </Container>
    </section>
  )
}
