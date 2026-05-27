/**
 * Prompt templates. GENERAL_SYSTEM is the stable system identity (cached);
 * the per-feature builders produce the user-message text so the cached prefix
 * (system + schema) is shared across every feature.
 */

export const GENERAL_SYSTEM = `You are NovexDB AI, an expert PostgreSQL database copilot embedded in a desktop SQL client.

Operating rules:
- The target database is always PostgreSQL — generate PostgreSQL-dialect SQL only.
- The database schema is provided below and is the single source of truth. Never invent tables, columns, or relationships that are not in it.
- Use schema-qualified names (e.g. public.users). Double-quote identifiers only when required.
- Never produce destructive statements (DROP, TRUNCATE, ALTER, GRANT, REVOKE) unless the user explicitly and unambiguously asks for them.
- For UPDATE or DELETE, always include a WHERE clause unless the user explicitly asks to affect all rows.
- Be precise and concise. If the schema cannot satisfy a request, say so plainly instead of guessing.`

export function nl2SqlPrompt(request: string): string {
  return `Write a single PostgreSQL query that satisfies this request.

Request: ${request}

Return: the SQL, a short plain-English explanation, any safety warnings (empty list if none), and a confidence score between 0 and 1.`
}

export function explainPrompt(sql: string): string {
  return `Explain this PostgreSQL query in plain English.

\`\`\`sql
${sql}
\`\`\`

Return a one-paragraph summary, then an ordered list of steps. Break down every JOIN (what it connects and why), every subquery, every window function, and every aggregation.`
}

export function optimizePrompt(sql: string, explainPlan: string | null): string {
  const planSection = explainPlan
    ? `\n\nPostgreSQL EXPLAIN plan (JSON, planner estimates):\n${explainPlan}`
    : ''
  return `Analyze this PostgreSQL query for performance problems.

\`\`\`sql
${sql}
\`\`\`${planSection}

Identify performance issues (sequential scans, missing indexes, inefficient joins, unnecessary subqueries), each with a severity. Suggest concrete missing indexes as CREATE INDEX statements. Provide an optimized rewrite of the query if one helps (or null if the query is already optimal), and explain your reasoning.`
}

export function errorExplainPrompt(sql: string, errorMessage: string): string {
  return `A PostgreSQL query failed. Explain the error in plain English and fix it.

\`\`\`sql
${sql}
\`\`\`

Error message:
${errorMessage}

Return a plain-English explanation of what went wrong, the exact fix to apply, and a corrected version of the query (or null if it cannot be corrected from the information given).`
}

export function analyzePrompt(): string {
  return `Analyze the database schema provided above and produce a structured review.

Return: an overview of what the database appears to model; a list of issues (missing indexes on foreign keys, tables without primary keys, inconsistent or unclear naming, missing foreign-key constraints, denormalization risks), each with a severity; and a list of concrete recommendations to improve the schema.`
}
