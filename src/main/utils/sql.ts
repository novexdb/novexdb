/** Double-quote a SQL identifier, escaping embedded quotes — safe against injection. */
export function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

/** Quote a schema-qualified relation name. */
export function quoteQualified(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`
}

/** Backtick-quote a MySQL identifier, escaping embedded backticks. */
export function quoteMysqlIdent(identifier: string): string {
  return `\`${identifier.replace(/`/g, '``')}\``
}

/** Backtick-quote a MySQL database-qualified relation name. */
export function quoteMysqlQualified(database: string, table: string): string {
  return `${quoteMysqlIdent(database)}.${quoteMysqlIdent(table)}`
}

/** Bracket-quote a SQL Server identifier, escaping embedded `]`. */
export function quoteMssqlIdent(identifier: string): string {
  return `[${identifier.replace(/]/g, ']]')}]`
}

/** Bracket-quote a SQL Server schema-qualified relation name. */
export function quoteMssqlQualified(schema: string, table: string): string {
  return `${quoteMssqlIdent(schema)}.${quoteMssqlIdent(table)}`
}
