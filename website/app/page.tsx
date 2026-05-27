import type { ReactNode } from 'react'
import { Hero } from '@/sections/Hero'
import { Features } from '@/sections/Features'
import { DashboardShowcase } from '@/sections/DashboardShowcase'
import { Founder } from '@/sections/Founder'
import { Testimonials } from '@/sections/Testimonials'
import { DownloadCta } from '@/sections/DownloadCta'
import { Newsletter } from '@/sections/Newsletter'

export default function HomePage(): ReactNode {
  return (
    <>
      <Hero />
      <Features />
      <DashboardShowcase />
      <Founder />
      <Testimonials />
      <DownloadCta />
      <Newsletter />
    </>
  )
}
