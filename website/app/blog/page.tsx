import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, Clock } from 'lucide-react'
import { Section } from '@/components/Section'
import { cn } from '@/lib/cn'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Engineering notes on AI databases, SQL optimization, anomaly detection and Electron product work.'
}

interface Post {
  slug: string
  title: string
  body: string
  category: 'AI databases' | 'SQL optimization' | 'Engineering' | 'Anomaly detection'
  readingMinutes: number
  published: string
  author: string
  featured?: boolean
}

const POSTS: Post[] = [
  {
    slug: 'composite-key-duplicate-detection',
    title: 'Composite-key duplicate detection that actually works',
    body: 'Why a single duplicated unit_price isn\'t a duplicate invoice — and what to check instead. A practical walk-through of the GROUP BY heuristic shipped in NovexDB.',
    category: 'Anomaly detection',
    readingMinutes: 7,
    published: 'May 25, 2026',
    author: 'Asif Zaheer',
    featured: true
  },
  {
    slug: 'streaming-sql-dump-importer',
    title: 'Importing a 1.5 GB pg_dump without blowing up V8',
    body: 'How NovexDB streams an arbitrary-size SQL dump through a chunk-boundary-safe tokenizer, never materializing the file as a JS string.',
    category: 'Engineering',
    readingMinutes: 9,
    published: 'May 20, 2026',
    author: 'Asif Zaheer'
  },
  {
    slug: 'ai-as-a-post-mortem-writer',
    title: 'Using an LLM as a database post-mortem writer',
    body: 'One LLM call per scan, structured prompts, mechanical fallback — the recipe that powers the AI Insights panel.',
    category: 'AI databases',
    readingMinutes: 6,
    published: 'May 14, 2026',
    author: 'Asif Zaheer'
  },
  {
    slug: 'why-most-fk-indexes-are-missing',
    title: 'Why most foreign-key columns are missing an index',
    body: 'Postgres won\'t create an FK index for you. MySQL only sometimes does. Here\'s the query that finds the missing ones in 50 ms.',
    category: 'SQL optimization',
    readingMinutes: 4,
    published: 'May 7, 2026',
    author: 'Asif Zaheer'
  }
]

const CATEGORIES: Post['category'][] = [
  'AI databases',
  'SQL optimization',
  'Engineering',
  'Anomaly detection'
]

export default function BlogPage(): ReactNode {
  const featured = POSTS.find((p) => p.featured)
  const rest = POSTS.filter((p) => p !== featured)
  return (
    <Section
      eyebrow="Engineering blog"
      heading={
        <>
          Notes from a <span className="gradient-text">working product</span>.
        </>
      }
      subheading="Build notes, AI-engineering recipes and SQL deep-dives — published as NovexDB ships."
    >
      <div className="mb-10 flex flex-wrap items-center justify-center gap-2 text-[12px]">
        {CATEGORIES.map((category) => (
          <span
            key={category}
            className="rounded-full border border-line bg-surface/40 px-3 py-1 text-muted backdrop-blur"
          >
            {category}
          </span>
        ))}
      </div>

      {featured && <FeaturedCard post={featured} />}

      <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line/60 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </ul>
    </Section>
  )
}

function FeaturedCard({ post }: { post: Post }): ReactNode {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="gradient-border block overflow-hidden rounded-2xl bg-surface/60 p-8 backdrop-blur-xl transition-all hover:bg-surface/80 lg:p-10"
    >
      <span className="rounded-full border border-line bg-bg/60 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-accent">
        Featured
      </span>
      <h3 className="mt-4 text-balance text-2xl font-semibold tracking-tight text-content sm:text-3xl">
        {post.title}
      </h3>
      <p className="mt-3 max-w-2xl text-pretty text-[14.5px] leading-relaxed text-muted">
        {post.body}
      </p>
      <div className="mt-5 flex items-center gap-3 text-[12px] text-subtle">
        <span>{post.author}</span>
        <span>·</span>
        <span>{post.published}</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {post.readingMinutes} min read
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-content">
          Read <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  )
}

function BlogCard({ post }: { post: Post }): ReactNode {
  return (
    <li>
      <Link
        href={`/blog/${post.slug}`}
        className={cn(
          'flex h-full flex-col gap-2 bg-bg p-6 transition-colors hover:bg-surface/40'
        )}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          {post.category}
        </span>
        <h3 className="text-[15px] font-semibold tracking-tight text-content">
          {post.title}
        </h3>
        <p className="line-clamp-3 text-[13px] text-muted">{post.body}</p>
        <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-subtle">
          <span>{post.published}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {post.readingMinutes} min
          </span>
        </div>
      </Link>
    </li>
  )
}
