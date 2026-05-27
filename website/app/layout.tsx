import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import './globals.css'

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
})
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap'
})

export const metadata: Metadata = {
  metadataBase: new URL('https://novexdb.app'),
  title: {
    default: 'NovexDB — A modern database client with AI built in',
    template: '%s — NovexDB'
  },
  description:
    'Native desktop client for Postgres, MySQL, SQLite, and SQL Server. Browse and edit tables, write SQL with autocomplete, and audit your whole database with AI that explains every finding in plain English. Free forever.',
  applicationName: 'NovexDB',
  keywords: [
    'database client',
    'SQL editor',
    'PostgreSQL client',
    'MySQL client',
    'SQLite client',
    'AI database',
    'database GUI',
    'TablePlus alternative',
    'DBeaver alternative',
    'database audit',
    'data quality'
  ],
  authors: [{ name: 'Asif Zaheer' }],
  creator: 'Asif Zaheer',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icon-64.png', sizes: '64x64', type: 'image/png' }
    ],
    apple: '/icon-512.png'
  },
  openGraph: {
    title: 'NovexDB — A modern database client with AI built in',
    description:
      'Native desktop client for Postgres, MySQL, SQLite, and SQL Server — with AI that audits your database in one click. Free forever.',
    siteName: 'NovexDB',
    type: 'website',
    locale: 'en_US',
    images: [{ url: '/icon-512.png', width: 512, height: 512, alt: 'NovexDB' }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NovexDB — A modern database client with AI built in',
    description:
      'Native desktop client for Postgres, MySQL, SQLite, and SQL Server — with AI built in. Free forever.',
    creator: '@asifzaheer',
    images: ['/icon-512.png']
  }
}

export const viewport: Viewport = {
  themeColor: '#07070b',
  width: 'device-width',
  initialScale: 1
}

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
