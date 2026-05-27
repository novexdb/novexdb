/** Statement keywords that are destructive and should be flagged prominently. */
const DESTRUCTIVE = new Set(['DROP', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE'])

export interface SqlSafetyReport {
  warnings: string[]
}

/**
 * Heuristic safety scan of (AI-generated) SQL — flags destructive statements
 * and unscoped DELETE/UPDATE. The user always reviews SQL before running it;
 * this surfaces risks, it is not a parser.
 */
export function analyzeSql(sql: string): SqlSafetyReport {
  const warnings: string[] = []

  const statements = sql
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  for (const statement of statements) {
    const upper = statement.toUpperCase()
    const firstWord = upper.split(/\s+/)[0] ?? ''

    if (DESTRUCTIVE.has(firstWord)) {
      warnings.push(`Destructive statement (${firstWord}) — review carefully before running.`)
    }
    if ((firstWord === 'DELETE' || firstWord === 'UPDATE') && !/\bWHERE\b/.test(upper)) {
      warnings.push(`${firstWord} has no WHERE clause — it affects every row in the table.`)
    }
  }

  return { warnings }
}
