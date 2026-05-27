import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Features } from '@/sections/Features'
import { DashboardShowcase } from '@/sections/DashboardShowcase'
import { DownloadCta } from '@/sections/DownloadCta'

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Every scanner, every dashboard, every AI feature in NovexDB — laid out in detail.'
}

export default function FeaturesPage(): ReactNode {
  return (
    <>
      <div className="pt-12">
        <Features />
      </div>
      <DashboardShowcase />
      <DownloadCta />
    </>
  )
}
