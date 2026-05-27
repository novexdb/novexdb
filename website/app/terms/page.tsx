import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Section } from '@/components/Section'

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The simple terms that govern your use of NovexDB.'
}

export default function TermsPage(): ReactNode {
  return (
    <Section
      eyebrow="Legal"
      heading="Terms of service"
      subheading="A draft, in plain English. A counsel-reviewed version replaces this placeholder before the v1.0 release."
    >
      <article className="mx-auto max-w-3xl space-y-6 text-[14px] leading-relaxed text-content/90">
        <Block heading="License">
          <p>
            NovexDB is licensed, not sold. The Free tier is permitted for
            personal use; Pro and Team require a valid subscription. You may
            install on as many machines as you personally use.
          </p>
        </Block>

        <Block heading="Your data">
          <p>
            You retain all rights to your databases, queries and AI prompts.
            NovexDB processes them locally; we claim no licence over your
            content.
          </p>
        </Block>

        <Block heading="No warranty">
          <p>
            NovexDB ships as-is. We've tried hard to make every scanner
            non-destructive (read-only queries, opt-in mutations), but you are
            responsible for taking backups before running any AI-generated SQL
            against production.
          </p>
        </Block>

        <Block heading="Acceptable use">
          <p>
            Don't use NovexDB to break laws, access systems you don't own, or
            scan databases without authorization. We reserve the right to
            terminate paid accounts for clearly abusive behaviour.
          </p>
        </Block>

        <Block heading="Cancellation">
          <p>
            Cancel any paid tier at any time. Your subscription keeps working
            until the end of the billing period; we don't pro-rate refunds for
            unused days.
          </p>
        </Block>

        <Block heading="Contact">
          <p>
            <a href="mailto:hello@novexdb.app" className="text-accent hover:underline">hello@novexdb.app</a>
          </p>
        </Block>

        <p className="rounded-lg border border-line bg-surface/40 p-4 text-[12px] text-subtle">
          Placeholder text. A binding terms-of-service document will be drafted
          by counsel before public launch.
        </p>
      </article>
    </Section>
  )
}

function Block({ heading, children }: { heading: string; children: ReactNode }): ReactNode {
  return (
    <section>
      <h2 className="mb-2 text-[15px] font-semibold tracking-tight text-content">{heading}</h2>
      <div className="text-muted">{children}</div>
    </section>
  )
}
