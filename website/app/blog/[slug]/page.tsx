import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Section } from '@/components/Section'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return {
    title: slug.replace(/-/g, ' '),
    description: 'NovexDB engineering blog post.'
  }
}

/** Per-post stub. Real posts will move to MDX under content/blog/ next phase. */
export default async function BlogPostPage({ params }: Props): Promise<ReactNode> {
  const { slug } = await params
  return (
    <Section
      eyebrow="Coming soon"
      heading={slug.replace(/-/g, ' ')}
      subheading="This post is being written. The blog will move to MDX-backed content next phase — for now every post URL is reserved."
    >
      <div className="mx-auto max-w-2xl text-center">
        <Link href="/blog" className="text-[13px] text-accent hover:underline">
          ← back to all posts
        </Link>
      </div>
    </Section>
  )
}
