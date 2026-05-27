import Link from 'next/link'
import type { ReactNode } from 'react'
import { Github, Linkedin, Mail, Twitter } from 'lucide-react'
import { Container } from '@/components/Container'
import { Logo } from '@/components/Logo'

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/download', label: 'Download' },
      { href: '/blog', label: 'Changelog' }
    ]
  },
  {
    heading: 'Developers',
    links: [
      { href: '/blog', label: 'Blog' },
      { href: 'https://github.com/novexdb/novexdb', label: 'GitHub' },
      { href: '/contact', label: 'Support' }
    ]
  },
  {
    heading: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' }
    ]
  }
]

const SOCIALS: { href: string; label: string; icon: typeof Github }[] = [
  { href: 'https://github.com/novexdb/novexdb', label: 'GitHub', icon: Github },
  { href: 'https://linkedin.com/in/asifzaheer', label: 'LinkedIn', icon: Linkedin },
  { href: 'https://twitter.com/asifzaheer', label: 'Twitter', icon: Twitter },
  { href: 'mailto:hello@novexdb.app', label: 'Email', icon: Mail }
]

export function Footer(): ReactNode {
  return (
    <footer className="relative mt-32 border-t border-line/60 bg-surface/30">
      <Container className="grid gap-12 py-16 md:grid-cols-[1.5fr_repeat(3,_1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-[13px] leading-relaxed text-muted">
            NovexDB is an AI-powered desktop database client — query, audit
            and explain your data with one shortcut.
          </p>
          <div className="flex items-center gap-1">
            {SOCIALS.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                aria-label={label}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-content"
              >
                <Icon className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.heading} className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
              {column.heading}
            </h3>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-muted transition-colors hover:text-content"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-t border-line/60">
        <Container className="flex flex-col items-center justify-between gap-2 py-6 text-[11px] text-subtle sm:flex-row">
          <span>© {new Date().getFullYear()} NovexDB. Built by Asif Zaheer.</span>
          <span>Made with React, Electron and a lot of espresso.</span>
        </Container>
      </div>
    </footer>
  )
}
