'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { Download, Menu, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { Logo } from '@/components/Logo'

const NAV = [
  { href: '/features', label: 'Features' },
  { href: '/download', label: 'Download' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' }
]

/** Sticky glassmorphic header. Borderless until the user scrolls. */
export function Header(): ReactNode {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-200',
        scrolled
          ? 'border-b border-line/60 bg-bg/70 backdrop-blur-xl'
          : 'border-b border-transparent'
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13px] font-medium text-muted transition-colors hover:text-content"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Button href="https://github.com/Asif-Saheer-k" variant="ghost" size="sm">
            GitHub
          </Button>
          <Button href="/download" size="sm">
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-muted md:hidden"
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </Container>
      {open && (
        <div className="border-t border-line bg-bg/95 backdrop-blur-xl md:hidden">
          <Container className="flex flex-col gap-1 py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-[14px] text-muted hover:bg-surface hover:text-content"
              >
                {item.label}
              </Link>
            ))}
            <Button href="/download" className="mt-2 w-full" size="md">
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </Container>
        </div>
      )}
    </header>
  )
}
