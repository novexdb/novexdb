import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Apple, Cpu, Download } from 'lucide-react'
import { Section } from '@/components/Section'
import { Button } from '@/components/Button'

export const metadata: Metadata = {
  title: 'Download',
  description:
    'Download NovexDB for macOS or Windows. Native desktop client, free for personal use.'
}

interface ChannelProps {
  os: 'macOS' | 'Windows' | 'Linux'
  icon: ReactNode
  ext: string
  arch: string
  size: string
  href: string
  available: boolean
}

const CHANNELS: ChannelProps[] = [
  {
    os: 'macOS',
    icon: <Apple className="h-6 w-6" />,
    ext: '.dmg · Universal',
    arch: 'Apple Silicon + Intel',
    size: '94 MB',
    href: '#',
    available: true
  },
  {
    os: 'Windows',
    icon: <Download className="h-6 w-6" />,
    ext: '.exe · x64',
    arch: 'Windows 10 / 11',
    size: '88 MB',
    href: '#',
    available: true
  },
  {
    os: 'Linux',
    icon: <Cpu className="h-6 w-6" />,
    ext: '.AppImage · x64',
    arch: 'Coming soon',
    size: '—',
    href: '#',
    available: false
  }
]

export default function DownloadPage(): ReactNode {
  return (
    <Section
      eyebrow="Download"
      heading={
        <>
          Install <span className="gradient-text">NovexDB v0.1</span> in 30 seconds.
        </>
      }
      subheading="Native installers for macOS and Windows. Linux ships next. 100% free — every scanner, every AI feature, every connection. No accounts, no telemetry by default."
    >
      <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
        {CHANNELS.map((channel) => (
          <div
            key={channel.os}
            className="flex flex-col gap-4 rounded-2xl border border-line bg-surface/40 p-6 backdrop-blur"
          >
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2/70 text-content">
              {channel.icon}
            </div>
            <div>
              <div className="text-[15px] font-semibold text-content">{channel.os}</div>
              <div className="font-mono text-[11px] text-subtle">{channel.ext}</div>
            </div>
            <div className="space-y-1 text-[12px] text-muted">
              <div>{channel.arch}</div>
              <div>{channel.size}</div>
            </div>
            <Button
              href={channel.href}
              size="md"
              variant={channel.available ? 'primary' : 'secondary'}
              className="w-full justify-center"
            >
              <Download className="h-3.5 w-3.5" />
              {channel.available ? `Download for ${channel.os}` : 'Notify me'}
            </Button>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-xl text-center text-[12px] text-subtle">
        v0.1 · early access ·{' '}
        <Link href="/blog" className="underline-offset-4 hover:underline">
          release notes
        </Link>{' '}
        ·{' '}
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          telemetry policy
        </Link>
      </p>
    </Section>
  )
}
