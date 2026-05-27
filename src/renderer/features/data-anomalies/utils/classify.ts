import type { Issue } from '@shared/types/intelligence'

/** Issue types the Anomalies Center treats as "duplicate" findings. */
const DUPLICATE_TYPES = new Set<string>([
  'duplicate_emails',
  'duplicate_phones',
  'duplicate_amounts',
  'duplicate_identifiers',
  'duplicate_invoice_record',
  'duplicate_index'
])

/** Issue types the Anomalies Center treats as "financial mismatch" findings. */
const FINANCIAL_TYPES = new Set<string>([
  'subtotal_vat_mismatch',
  'negative_amount'
])

export function isDuplicateIssue(issue: Issue): boolean {
  return DUPLICATE_TYPES.has(issue.type)
}

export function isFinancialIssue(issue: Issue): boolean {
  return FINANCIAL_TYPES.has(issue.type)
}

/** Anomaly-relevant subset of the scan's full issue list. */
export function anomalyIssues(issues: Issue[]): Issue[] {
  return issues.filter((i) => isDuplicateIssue(i) || isFinancialIssue(i))
}

/** Group issues by `${table}::${type}` so the panel can render expandable groups. */
export interface IssueGroup {
  key: string
  table: string | null
  type: string
  issues: Issue[]
  totalRowsAffected: number
}

export function groupIssues(issues: Issue[]): IssueGroup[] {
  const map = new Map<string, IssueGroup>()
  for (const issue of issues) {
    const key = `${issue.table ?? '—'}::${issue.type}`
    const group = map.get(key) ?? {
      key,
      table: issue.table,
      type: issue.type,
      issues: [],
      totalRowsAffected: 0
    }
    group.issues.push(issue)
    group.totalRowsAffected += issue.rowsAffected ?? 0
    map.set(key, group)
  }
  return [...map.values()].sort((a, b) => b.totalRowsAffected - a.totalRowsAffected)
}

/** Friendly issue-type label for the panel UI. */
export function typeLabel(type: string): string {
  switch (type) {
    case 'duplicate_emails': return 'Duplicate emails'
    case 'duplicate_phones': return 'Duplicate phone numbers'
    case 'duplicate_amounts': return 'Duplicate transactional amounts'
    case 'duplicate_identifiers': return 'Duplicate business identifiers'
    case 'duplicate_invoice_record': return 'Duplicate invoice records (composite key)'
    case 'duplicate_index': return 'Duplicate indexes'
    case 'subtotal_vat_mismatch': return 'Subtotal + VAT ≠ Total'
    case 'negative_amount': return 'Negative amounts'
    default: return type
  }
}
