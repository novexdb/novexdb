import type { ComponentType, ReactNode } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Bug,
  Copy,
  Database,
  FileInput,
  Gauge,
  KeyRound,
  Lightbulb,
  type LucideProps,
  ScrollText,
  Sparkles
} from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { IconButton } from '@renderer/components/IconButton'
import { copyText, insertSqlIntoEditor, SEVERITY_BADGE } from '@renderer/features/ai/utils'
import type {
  AnalysisResult,
  ErrorExplainResult,
  ExplainResult,
  IssueSeverity,
  Nl2SqlResult,
  OptimizeResult
} from '@shared/types/ai'

function AiCard({
  icon: Icon,
  title,
  iconClass,
  children
}: {
  icon: ComponentType<LucideProps>
  title: string
  iconClass: string
  children: ReactNode
}): ReactNode {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5">
        <Icon className={cn('h-3.5 w-3.5', iconClass)} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {title}
        </span>
      </div>
      <div className="space-y-2.5 p-3 text-[13px] text-content">{children}</div>
    </div>
  )
}

/** A SQL block with copy + insert-into-editor actions. */
function SqlBlock({ sql }: { sql: string }): ReactNode {
  return (
    <div className="group relative rounded-md border border-line bg-app">
      <pre className="overflow-x-auto p-2.5 font-mono text-[12px] leading-relaxed text-content">
        <code>{sql}</code>
      </pre>
      <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton label="Copy SQL" className="h-6 w-6 bg-surface" onClick={() => copyText(sql)}>
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          label="Insert into editor"
          className="h-6 w-6 bg-surface"
          onClick={() => insertSqlIntoEditor(sql)}
        >
          <FileInput className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: IssueSeverity }): ReactNode {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
        SEVERITY_BADGE[severity]
      )}
    >
      {severity}
    </span>
  )
}

function IssueList({
  issues
}: {
  issues: { severity: IssueSeverity; title: string; detail: string }[]
}): ReactNode {
  return (
    <div className="space-y-2">
      {issues.map((issue, index) => (
        <div key={index} className="rounded-md border border-line bg-app p-2">
          <div className="flex items-center gap-1.5">
            <SeverityBadge severity={issue.severity} />
            <span className="text-[12px] font-medium text-content">{issue.title}</span>
          </div>
          <p className="mt-1 text-[12px] text-muted">{issue.detail}</p>
        </div>
      ))}
    </div>
  )
}

export function Nl2SqlCard({ result }: { result: Nl2SqlResult }): ReactNode {
  const confidence = Math.round(result.confidence * 100)
  return (
    <AiCard icon={Sparkles} title="Generated SQL" iconClass="text-accent">
      <SqlBlock sql={result.sql} />
      <p className="text-muted">{result.explanation}</p>
      {result.warnings.length > 0 && (
        <div className="space-y-1 rounded-md border border-warning/30 bg-warning/10 p-2">
          {result.warnings.map((warning, index) => (
            <p key={index} className="flex items-start gap-1.5 text-[12px] text-warning">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-app">
          <div className="h-full rounded-full bg-accent" style={{ width: `${confidence}%` }} />
        </div>
        <span className="text-[11px] text-subtle">Confidence {confidence}%</span>
      </div>
    </AiCard>
  )
}

export function ExplainCard({ result }: { result: ExplainResult }): ReactNode {
  return (
    <AiCard icon={ScrollText} title="Query Explanation" iconClass="text-accent">
      <p className="text-content">{result.summary}</p>
      <ol className="space-y-1.5">
        {result.steps.map((step, index) => (
          <li key={index} className="flex gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent">
              {index + 1}
            </span>
            <span className="text-[12px]">
              <span className="font-medium text-content">{step.title}</span>
              <span className="text-muted"> — {step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </AiCard>
  )
}

export function OptimizeCard({ result }: { result: OptimizeResult }): ReactNode {
  return (
    <AiCard icon={Gauge} title="Query Optimization" iconClass="text-warning">
      {result.issues.length > 0 ? (
        <IssueList issues={result.issues} />
      ) : (
        <p className="text-muted">No significant performance issues found.</p>
      )}
      {result.missingIndexes.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-subtle">
            <KeyRound className="h-3 w-3" /> Suggested indexes
          </p>
          {result.missingIndexes.map((index, i) => (
            <SqlBlock key={i} sql={index} />
          ))}
        </div>
      )}
      {result.suggestedSql && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase text-subtle">Optimized query</p>
          <SqlBlock sql={result.suggestedSql} />
        </div>
      )}
      <p className="text-[12px] text-muted">{result.reasoning}</p>
    </AiCard>
  )
}

export function ErrorCard({ result }: { result: ErrorExplainResult }): ReactNode {
  return (
    <AiCard icon={Bug} title="Error Explanation" iconClass="text-danger">
      <p className="text-content">{result.explanation}</p>
      <div className="rounded-md border border-line bg-app p-2">
        <p className="text-[11px] font-semibold uppercase text-subtle">Fix</p>
        <p className="mt-0.5 text-[12px] text-muted">{result.fix}</p>
      </div>
      {result.correctedSql && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase text-subtle">Corrected query</p>
          <SqlBlock sql={result.correctedSql} />
        </div>
      )}
    </AiCard>
  )
}

export function AnalysisCard({ result }: { result: AnalysisResult }): ReactNode {
  return (
    <AiCard icon={Database} title="Database Analysis" iconClass="text-accent">
      <div>
        <p className="text-[11px] font-semibold uppercase text-subtle">Overview</p>
        <p className="mt-0.5 text-muted">{result.overview}</p>
      </div>
      {result.issues.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase text-subtle">Issues</p>
          <IssueList issues={result.issues} />
        </div>
      )}
      {result.recommendations.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase text-subtle">Recommendations</p>
          <ul className="space-y-1">
            {result.recommendations.map((recommendation, index) => (
              <li key={index} className="flex items-start gap-1.5 text-[12px] text-muted">
                <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                {recommendation}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-subtle">
        <BadgeCheck className="h-3.5 w-3.5 text-success" />
        Analysis based on the live database schema.
      </p>
    </AiCard>
  )
}
