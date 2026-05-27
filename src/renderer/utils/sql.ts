/**
 * SQL identifier quoting for the renderer. Mirrors `src/main/utils/sql.ts` —
 * the renderer cannot import from `@main/*`, so the helpers live in both layers.
 */

import type { DatabaseEngine } from '@shared/types/connection'

/** Double-quote a SQL identifier, escaping embedded quotes — safe against injection. */
export function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

/** Backtick-quote a MySQL identifier, escaping embedded backticks. */
export function quoteMysqlIdent(identifier: string): string {
  return `\`${identifier.replace(/`/g, '``')}\``
}

/** Quote a schema-qualified relation name. */
export function quoteQualified(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`
}

/** Quote a database-qualified relation name for the given engine. */
export function quoteRelation(
  engine: DatabaseEngine,
  schema: string,
  table: string
): string {
  return engine === 'mysql'
    ? `${quoteMysqlIdent(schema)}.${quoteMysqlIdent(table)}`
    : quoteQualified(schema, table)
}

/** Wrap a string value as a single-quoted SQL literal, escaping embedded quotes. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}
