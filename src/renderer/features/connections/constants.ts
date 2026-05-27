import type { DatabaseEngine, SslMode } from '@shared/types/connection'

export const ENGINE_LABELS: Record<DatabaseEngine, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  mssql: 'SQL Server'
}

/** Engines with a working driver today — others render as "coming soon". */
export const SUPPORTED_ENGINES: DatabaseEngine[] = ['postgres', 'mysql', 'mssql']

export const ALL_ENGINES: DatabaseEngine[] = ['postgres', 'mysql', 'mssql']

export const DEFAULT_PORTS: Record<DatabaseEngine, number> = {
  postgres: 5432,
  mysql: 3306,
  mssql: 1433
}

/** Placeholder text shown in the database/username fields per engine. */
export const ENGINE_PLACEHOLDERS: Record<DatabaseEngine, { database: string; username: string }> = {
  postgres: { database: 'postgres', username: 'postgres' },
  mysql: { database: 'mysql', username: 'root' },
  mssql: { database: 'master', username: 'sa' }
}

/** Per-engine defaults that get merged into `options` when the user selects an engine. */
export const ENGINE_OPTION_DEFAULTS: Partial<
  Record<DatabaseEngine, { encrypt: boolean; trustServerCertificate: boolean; connectionTimeoutMs: number }>
> = {
  mssql: { encrypt: true, trustServerCertificate: false, connectionTimeoutMs: 15_000 }
}

export const SSL_OPTIONS: { value: SslMode; label: string }[] = [
  { value: 'disable', label: 'Disabled' },
  { value: 'prefer', label: 'Prefer' },
  { value: 'require', label: 'Require' }
]

/** Accent colors a user can tag a connection with (shown in the sidebar). */
export const CONNECTION_COLORS: string[] = [
  '#4f8cff',
  '#3fb950',
  '#d29922',
  '#f85149',
  '#a371f7',
  '#ec6cb9',
  '#39c5cf',
  '#8b949e'
]
