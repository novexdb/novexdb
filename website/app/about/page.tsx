import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Founder } from '@/sections/Founder'
import { Newsletter } from '@/sections/Newsletter'

export const metadata: Metadata = {
  title: 'About the founder',
  description: 'Asif Zaheer — React + AI engineer and the solo builder behind NovexDB.'
}

export default function AboutPage(): ReactNode {
  return (
    <>
      <div className="pt-12">
        <Founder />
      </div>
      <Newsletter />
    </>
  )
}
