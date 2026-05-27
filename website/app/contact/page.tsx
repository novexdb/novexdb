'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { Github, Linkedin, Mail, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { Section } from '@/components/Section'
import { Button } from '@/components/Button'

export default function ContactPage(): ReactNode {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    if (!email.includes('@') || message.trim().length < 5) return
    // TODO: POST to /api/contact (Resend / SendGrid) — placeholder for now.
    setSubmitted(true)
  }

  return (
    <Section
      eyebrow="Contact"
      heading={
        <>
          Send us a note — we <span className="gradient-text">reply ourselves</span>.
        </>
      }
      subheading="Sales, support, or feature requests — every message goes straight to the founder."
    >
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          {[
            { icon: Mail, label: 'Email', value: 'hello@novexdb.app', href: 'mailto:hello@novexdb.app' },
            { icon: Github, label: 'GitHub', value: 'asifzaheer', href: 'https://github.com/Asif-Saheer-k' },
            { icon: Linkedin, label: 'LinkedIn', value: 'asifzaheer', href: 'https://linkedin.com/in/asifzaheer' },
            { icon: MessageSquare, label: 'Community', value: 'Join the Discord', href: '#' }
          ].map(({ icon: Icon, label, value, href }) => (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface/40 p-4 transition-colors hover:bg-surface/70"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2/70 text-accent">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <div className="text-[11px] uppercase tracking-[0.18em] text-subtle">{label}</div>
                <div className="text-[13px] font-medium text-content">{value}</div>
              </span>
            </Link>
          ))}
        </div>
        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded-2xl border border-line bg-surface/40 p-6 backdrop-blur"
        >
          {submitted ? (
            <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-[13px] text-success">
              Thanks — message received. Expect a reply within 24 hours.
            </p>
          ) : null}
          <Field label="Your name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded-lg border border-line-strong bg-bg/40 px-3 text-[13px] text-content focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-line-strong bg-bg/40 px-3 text-[13px] text-content focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Message">
            <textarea
              required
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-line-strong bg-bg/40 px-3 py-2 text-[13px] text-content focus:border-accent focus:outline-none"
            />
          </Field>
          <Button type="submit" size="md" className="w-full justify-center">
            Send message
          </Button>
        </form>
      </div>
    </Section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
        {label}
      </span>
      {children}
    </label>
  )
}
