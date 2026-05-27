import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Section } from '@/components/Section'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How NovexDB handles data — local-first by default.'
}

export default function PrivacyPage(): ReactNode {
  return (
    <Section
      eyebrow="Legal"
      heading="Privacy policy"
      subheading="NovexDB runs locally on your machine. The summary below is a plain-English statement of intent — a full lawyer-reviewed policy ships before public launch."
    >
      <article className="prose prose-invert mx-auto max-w-3xl space-y-6 text-[14px] leading-relaxed text-content/90">
        <Block heading="What stays on your machine">
          <p>
            All database connections, queries, scan results and AI prompts run on
            your computer. We never see your data, your credentials, or your
            schema. Credentials are stored in your OS keychain.
          </p>
        </Block>

        <Block heading="When data leaves your machine">
          <p>
            If you enable an AI provider (Anthropic, OpenAI, Ollama), the prompts
            you generate are sent directly from your machine to that provider.
            They never transit a NovexDB server. The provider's privacy policy
            applies to that traffic.
          </p>
        </Block>

        <Block heading="Telemetry">
          <p>
            NovexDB ships with telemetry <em>off</em>. If you opt in (Settings →
            Privacy), we collect anonymous, aggregated counts: app launches,
            scan completions, crash reports. No queries, no rows, no schema
            names. Opt out at any time and prior data is purged.
          </p>
        </Block>

        <Block heading="Updates">
          <p>
            The auto-updater checks our release endpoint for the current
            version. The request contains the running version and OS — nothing
            else.
          </p>
        </Block>

        <Block heading="Contact">
          <p>
            Questions? <a href="mailto:hello@novexdb.app" className="text-accent hover:underline">hello@novexdb.app</a>.
          </p>
        </Block>

        <p className="rounded-lg border border-line bg-surface/40 p-4 text-[12px] text-subtle">
          This page is a draft. The final policy will be reviewed by counsel and
          replace this placeholder before the v1.0 release.
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
