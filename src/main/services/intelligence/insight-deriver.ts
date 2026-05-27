import { randomUUID } from 'node:crypto'
import type {
  AiInsight,
  Issue,
  Recommendation,
  ScanKind,
  Severity
} from '@shared/types/intelligence'

const NOW = (): string => new Date().toISOString()

/** Severity ranking — higher first when sorted. */
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1
}

/** Per-source human label used in the insight summary cards. */
const SOURCE_LABEL: Record<ScanKind, string> = {
  full: 'Full scan',
  schema: 'schema',
  'data-quality': 'data quality',
  transaction: 'transaction-risk',
  performance: 'performance'
}

/** Per-issue-type human label used in the recommendation card titles. */
const TYPE_LABEL: Record<string, string> = {
  missing_primary_key: 'Add a primary key',
  missing_fk_index: 'Index this foreign-key column',
  duplicate_index: 'Drop a duplicate index',
  invalid_emails: 'Clean up invalid emails',
  duplicate_emails: 'Deduplicate emails',
  duplicate_phones: 'Deduplicate phone numbers',
  excessive_nulls: 'Investigate NULL-heavy column',
  slow_query: 'Optimise a slow query',
  duplicate_amounts: 'Review duplicate transactional amounts',
  duplicate_invoice_record: 'Review duplicate invoice records',
  duplicate_identifiers: 'Deduplicate business identifiers',
  subtotal_vat_mismatch: 'Fix subtotal + VAT ≠ total',
  negative_amount: 'Confirm negative amounts are intentional',
  tracking_unavailable: 'Enable query tracking',
  scanner_failure: 'Scanner crashed',
  scanner_query_failure: 'Scan query failed'
}

/**
 * Turn the merged issue list into a small set of human-readable insights
 * and actionable recommendations. Mechanical (template-driven) so it works
 * without an AI provider configured — calling out to AI is a Phase 3 swap
 * that just replaces these functions.
 */
export function deriveInsightsAndRecommendations(issues: Issue[]): {
  insights: AiInsight[]
  recommendations: Recommendation[]
} {
  return {
    insights: deriveInsights(issues),
    recommendations: deriveRecommendations(issues)
  }
}

function deriveInsights(issues: Issue[]): AiInsight[] {
  if (issues.length === 0) return [cleanBillInsight()]

  const insights: AiInsight[] = []
  insights.push(overallInsight(issues))

  // One insight per scanner source that actually fired, ranked by worst severity.
  const bySource = new Map<ScanKind, Issue[]>()
  for (const issue of issues) {
    const list = bySource.get(issue.source) ?? []
    list.push(issue)
    bySource.set(issue.source, list)
  }
  const orderedSources = [...bySource.entries()]
    .sort(([, a], [, b]) => worstSeverityRank(b) - worstSeverityRank(a))
    .slice(0, 3)

  for (const [source, group] of orderedSources) {
    insights.push(sourceInsight(source, group))
  }
  return insights
}

function deriveRecommendations(issues: Issue[]): Recommendation[] {
  // Only issues that carried a suggested fix → actionable rec.
  const actionable = issues.filter((issue) => issue.suggestedSql)
  // Sort by severity then by issue type so similar fixes cluster.
  actionable.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.type.localeCompare(b.type)
  )
  return actionable.slice(0, 25).map((issue) => ({
    id: randomUUID(),
    severity: issue.severity,
    title: titleFor(issue),
    rationale: issue.description,
    sql: issue.suggestedSql ?? '',
    sourceIssueId: issue.id
  }))
}

// ────────────────────────────────────────────────── templates / shorthands ──

function cleanBillInsight(): AiInsight {
  return {
    id: randomUUID(),
    severity: 'info',
    title: 'No issues detected',
    body:
      'Every scanner reported a clean run against this connection. ' +
      'Re-run after schema or data changes to confirm nothing slipped in.',
    detectedAt: NOW()
  }
}

function overallInsight(issues: Issue[]): AiInsight {
  const total = issues.length
  const critical = issues.filter((i) => i.severity === 'critical').length
  const high = issues.filter((i) => i.severity === 'high').length
  const top = pickTopIssue(issues)
  const lines: string[] = []
  lines.push(`**${total}** issue${total === 1 ? '' : 's'} surfaced across all scanners.`)
  if (critical > 0) lines.push(`- ${critical} **critical** — fix immediately.`)
  if (high > 0) lines.push(`- ${high} **high** — address before the next release.`)
  if (top) {
    lines.push('')
    lines.push(`Most pressing: **${TYPE_LABEL[top.type] ?? top.type}** on \`${top.table ?? '—'}\`.`)
    lines.push('')
    lines.push(`> ${top.description}`)
  }
  return {
    id: randomUUID(),
    severity: top?.severity ?? 'info',
    title: top
      ? `Top concern: ${TYPE_LABEL[top.type] ?? top.type}`
      : 'Scan summary',
    body: lines.join('\n'),
    detectedAt: NOW()
  }
}

function sourceInsight(source: ScanKind, group: Issue[]): AiInsight {
  const worst = pickTopIssue(group)
  const byType = new Map<string, number>()
  for (const issue of group) byType.set(issue.type, (byType.get(issue.type) ?? 0) + 1)
  const topTypes = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, n]) => `- **${TYPE_LABEL[type] ?? type}** — ${n}`)

  const body = [
    `The ${SOURCE_LABEL[source]} scan flagged **${group.length}** finding${group.length === 1 ? '' : 's'}.`,
    '',
    ...topTypes,
    worst ? `\nTopmost: ${worst.description}` : ''
  ]
    .filter(Boolean)
    .join('\n')

  return {
    id: randomUUID(),
    severity: worst?.severity ?? 'info',
    title: `${capitalise(SOURCE_LABEL[source])} highlights`,
    body,
    detectedAt: NOW()
  }
}

function pickTopIssue(issues: Issue[]): Issue | null {
  if (issues.length === 0) return null
  return [...issues].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0]
}

function worstSeverityRank(issues: Issue[]): number {
  return issues.reduce((max, i) => Math.max(max, SEVERITY_RANK[i.severity]), 0)
}

function titleFor(issue: Issue): string {
  const base = TYPE_LABEL[issue.type] ?? issue.type
  if (issue.table) return `${base} — ${issue.table}`
  return base
}

function capitalise(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text
}
