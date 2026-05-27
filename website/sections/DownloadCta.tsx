'use client'

import { motion } from 'framer-motion'
import { Apple, Cpu, Download } from 'lucide-react'
import type { ReactNode } from 'react'
import { Section } from '@/components/Section'
import { Button } from '@/components/Button'

/** Big final CTA strip — one stop closer to "install it". */
export function DownloadCta(): ReactNode {
  return (
    <Section>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.5 }}
        className="gradient-border relative isolate overflow-hidden rounded-3xl bg-surface/70 px-8 py-14 text-center backdrop-blur-xl sm:px-14"
      >
        <div
          aria-hidden
          className="glow-orb -z-10 left-1/2 top-1/2 h-[480px] w-[680px] -translate-x-1/2 -translate-y-1/2 bg-accent/20"
        />
        <h2 className="mx-auto max-w-3xl text-balance text-3xl font-semibold tracking-tight text-content sm:text-4xl lg:text-5xl">
          Stop tabbing between five tools. <span className="gradient-text">Install NovexDB.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-muted">
          One workspace, four databases, every audit you'd otherwise stitch together
          in spreadsheets. <span className="text-success">Completely free</span> — every
          scanner, every AI feature. No accounts, runs entirely on your machine.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button href="/download" size="lg">
            <Apple className="h-4 w-4" />
            Download for macOS
          </Button>
          <Button href="/download" size="lg" variant="secondary">
            <Download className="h-4 w-4" />
            Download for Windows
          </Button>
        </div>
        <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-subtle">
          <span className="inline-flex items-center gap-1.5">
            <Cpu className="h-3 w-3" /> Apple Silicon + Intel · Windows 10/11 · Linux soon
          </span>
        </div>
      </motion.div>
    </Section>
  )
}
