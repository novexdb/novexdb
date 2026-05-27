import { randomUUID } from 'node:crypto'
import { aiService } from '@main/services/ai/ai-service'
import type { AiInsight, Issue, Severity } from '@shared/types/intelligence'

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1
}

/** Issues sent verbatim to the AI — kept short to control context tokens. */
const ISSUE_CAP = 60

/**
 * Generate AI-authored insights from a scan's merged issue list. Returns one
 * Markdown-bodied `AiInsight` on success, or `null` when AI isn't configured /
 * fails / is cancelled — the engine then keeps the mechanical insights as a
 * fall-back so the panel is never empty.
 */
export async function generateAiInsight(
  connectionId: string,
  issues: Issue[],
  signal: AbortSignal
): Promise<AiInsight | null> {
  if (issues.length === 0) return null

  try {
    const prompt = buildPrompt(issues)
    let buffered = ''
    const text = await aiService.chat(
      connectionId,
      [{ role: 'user', content: prompt }],
      (delta) => {
        buffered += delta
      },
      signal
    )
    const body = (text || buffered).trim()
    if (!body) return null
    return {
      id: randomUUID(),
      severity: worstSeverity(issues),
      title: 'AI scan summary',
      body,
      detectedAt: new Date().toISOString()
    }
  } catch (err) {
    // Silent fallback — the mechanical insights still ship in the result. We
    // log so a configuration mistake is debuggable from the main console.
    console.warn('[intelligence] AI insight generation skipped:', err instanceof Error ? err.message : err)
    return null
  }
}

function worstSeverity(issues: Issue[]): Severity {
  let worst: Severity = 'info'
  for (const issue of issues) {
    if (SEVERITY_RANK[issue.severity] > SEVERITY_RANK[worst]) worst = issue.severity
  }
  return worst
}

/** Severity-ordered, capped, deduplicated issue list for prompt context. */
function summarizeForPrompt(issues: Issue[]): Issue[] {
  return [...issues]
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, ISSUE_CAP)
}

function buildPrompt(issues: Issue[]): string {
  const ranked = summarizeForPrompt(issues)
  const lines = ranked.map((issue) => {
    const tag = `[${issue.severity.toUpperCase()}/${issue.source}/${issue.type}]`
    const where = issue.table ? ` ${issue.table}${issue.column ? `.${issue.column}` : ''}` : ''
    const rows = issue.rowsAffected !== undefined ? ` (${issue.rowsAffected} rows)` : ''
    return `${tag}${where}${rows} — ${issue.description}`
  })
  return [
    `You are a senior database reliability engineer reviewing the results of an automated multi-scanner audit. The user is the DBA / owner — give them a tight, actionable summary in Markdown.`,
    '',
    `## Detected issues (${issues.length} total, top ${ranked.length} shown by severity)`,
    '',
    ...lines.map((line) => `- ${line}`),
    '',
    `## What I need from you`,
    '',
    `Write a 3-6 paragraph Markdown summary that:`,
    `1. Calls out the **two or three** most important risks by name (cite the table/column).`,
    `2. Explains the user-facing impact of each — slow queries, data loss risk, billing errors, etc. Be concrete.`,
    `3. Gives a clear "fix this first" recommendation.`,
    `4. Closes with one positive observation if anything looks healthy.`,
    '',
    `Avoid:`,
    `- Restating the issue list verbatim.`,
    `- Hedging language ("you might want to consider…").`,
    `- Generic database advice that isn't specific to these findings.`,
    `- Code fences for SQL — the dashboard already shows the suggested fixes elsewhere.`
  ].join('\n')
}
