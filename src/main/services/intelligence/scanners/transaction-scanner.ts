import { connectionManager } from '@main/services/connection-manager'
import { quoteIdent, quoteMysqlIdent } from '@main/utils/sql'
import type { Issue } from '@shared/types/intelligence'
import type { Scanner, ScannerOutput, ScanContext } from '@main/services/intelligence/scanner-types'
import { issueFactory, tryQuery } from '@main/services/intelligence/scanners/scanner-utils'

const issue = issueFactory('transaction')

/** Tables whose name matches one of these tokens are treated as transactional. */
const TX_TABLE_TOKENS = /(invoice|payment|transaction|order|receipt|charge|ledger|bill)/i
/** Column names that look like a money amount. */
const AMOUNT_COLUMN = /(amount|total|price|cost|balance|debit|credit|value)/i
/** Catalog-shaped columns where value repetition is expected (a $30 SKU sells
 *  100×) — skip the duplicate-amount check on these to drop the noise. */
const NOISY_AMOUNT_COLUMN =
  /^(unit_price|price|cost|rate|unit_cost|tax_rate|vat_rate|exchange_rate|fee|markup|discount_rate|discount_percent)$/i

/**
 * ERP-aware anomaly scanner. It does not depend on a specific schema — it
 * discovers transactional tables and money-shaped columns by name, then
 * surfaces duplicate amounts (potential duplicate payments) and unusually
 * negative amounts.
 */
export class TransactionScanner implements Scanner {
  readonly kind = 'transaction' as const
  readonly label = 'Transaction risk scan'

  async run(ctx: ScanContext): Promise<ScannerOutput> {
    const engine = await connectionManager.getEngine(ctx.connectionId)
    if (engine === 'postgres') return runPostgres(ctx)
    if (engine === 'mysql') return runMysql(ctx)
    throw new Error(`Transaction scan is not yet supported for engine "${engine}".`)
  }
}

interface NumericColumn {
  schema: string
  table: string
  column: string
}

// ────────────────────────────────────────────────────────────── PostgreSQL ──

async function runPostgres(ctx: ScanContext): Promise<ScannerOutput> {
  const issues: Issue[] = []

  ctx.reportTask('Discovering transactional tables…')
  const cols = await tryQuery(
    ctx,
    'List numeric columns on transactional tables',
    `
      SELECT c.table_schema, c.table_name, c.column_name
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND c.data_type IN ('numeric', 'double precision', 'real', 'integer', 'bigint', 'money')
      ORDER BY c.table_schema, c.table_name, c.ordinal_position
    `,
    issues,
    'transaction'
  )
  ctx.signal.throwIfAborted()

  const moneyColumns = pickMoneyColumns(cols.rows)
  if (moneyColumns.length === 0) {
    issues.push(
      issue({
        severity: 'info',
        type: 'no_transactional_tables',
        table: null,
        description:
          'No transactional tables matched the built-in patterns (invoice/payment/transaction/order/receipt/charge/ledger) — scan skipped.'
      })
    )
    return { issues }
  }

  // Financial-calculation checks — runs once per discovered transactional
  // table that has subtotal/tax/total all in one place.
  await runFinancialChecksPostgres(ctx, issues)
  // Real duplicate-invoice detection — composite key over identifier + total
  // + (customer or date). Much higher signal than `duplicate_amounts`.
  await runDuplicateInvoiceChecksPostgres(ctx, issues)

  for (const col of moneyColumns) {
    if (ctx.signal.aborted) break
    const qualified = `"${col.schema}"."${col.table}"`
    const colExpr = quoteIdent(col.column)
    ctx.reportTask(`Inspecting ${col.schema}.${col.table}.${col.column}…`)

    // Duplicate amounts — strong signal for re-charged invoices / re-runs.
    const dupGroups = await tryQuery(
      ctx,
      `Count duplicate-amount groups in ${col.schema}.${col.table}.${col.column}`,
      `SELECT count(*) FROM (
         SELECT ${colExpr}
         FROM ${qualified}
         WHERE ${colExpr} IS NOT NULL AND ${colExpr} <> 0
         GROUP BY ${colExpr}
         HAVING count(*) > 1
       ) t`,
      issues,
      'transaction',
      { failureSeverity: 'low' }
    )
    const groups = Number(dupGroups.rows[0]?.[0] ?? 0)
    if (groups > 0) {
      issues.push(
        issue({
          severity: 'medium',
          type: 'duplicate_amounts',
          table: `${col.schema}.${col.table}`,
          column: col.column,
          rowsAffected: groups,
          description: `${groups.toLocaleString()} distinct ${col.column} value(s) on "${col.schema}"."${col.table}" appear more than once — review for duplicate ${classify(col.table)}.`,
          suggestedSql: `SELECT ${colExpr}, count(*) AS occurrences\nFROM "${col.schema}"."${col.table}"\nGROUP BY ${colExpr}\nHAVING count(*) > 1\nORDER BY 2 DESC\nLIMIT 25;`
        })
      )
    }

    // Negative amounts — sometimes legitimate (refunds) but often a data bug.
    const negative = await tryQuery(
      ctx,
      `Count negative values in ${col.schema}.${col.table}.${col.column}`,
      `SELECT count(*) FROM ${qualified} WHERE ${colExpr} < 0`,
      issues,
      'transaction',
      { failureSeverity: 'low' }
    )
    const negCount = Number(negative.rows[0]?.[0] ?? 0)
    if (negCount > 0) {
      issues.push(
        issue({
          severity: 'low',
          type: 'negative_amount',
          table: `${col.schema}.${col.table}`,
          column: col.column,
          rowsAffected: negCount,
          description: `${negCount.toLocaleString()} row(s) in "${col.schema}"."${col.table}".${col.column} are negative — check whether refunds are expected here.`,
          suggestedSql: `SELECT * FROM "${col.schema}"."${col.table}" WHERE ${colExpr} < 0 LIMIT 25;`
        })
      )
    }
  }

  return { issues }
}

// ─────────────────────────────────────────────────────────────────── MySQL ──

async function runMysql(ctx: ScanContext): Promise<ScannerOutput> {
  const issues: Issue[] = []

  ctx.reportTask('Discovering transactional tables…')
  const cols = await tryQuery(
    ctx,
    'List numeric columns on transactional tables',
    `
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND data_type IN ('decimal', 'numeric', 'float', 'double', 'int', 'bigint', 'smallint', 'mediumint')
      ORDER BY table_schema, table_name, ordinal_position
    `,
    issues,
    'transaction'
  )
  ctx.signal.throwIfAborted()

  const moneyColumns = pickMoneyColumns(cols.rows)
  if (moneyColumns.length === 0) {
    issues.push(
      issue({
        severity: 'info',
        type: 'no_transactional_tables',
        table: null,
        description:
          'No transactional tables matched the built-in patterns (invoice/payment/transaction/order/receipt/charge/ledger) — scan skipped.'
      })
    )
    return { issues }
  }

  await runFinancialChecksMysql(ctx, issues)
  await runDuplicateInvoiceChecksMysql(ctx, issues)

  for (const col of moneyColumns) {
    if (ctx.signal.aborted) break
    const qualified = `\`${col.schema}\`.\`${col.table}\``
    const colExpr = quoteMysqlIdent(col.column)
    ctx.reportTask(`Inspecting ${col.schema}.${col.table}.${col.column}…`)

    const dupGroups = await tryQuery(
      ctx,
      `Count duplicate-amount groups in ${col.schema}.${col.table}.${col.column}`,
      `SELECT count(*) FROM (
         SELECT ${colExpr}
         FROM ${qualified}
         WHERE ${colExpr} IS NOT NULL AND ${colExpr} <> 0
         GROUP BY ${colExpr}
         HAVING count(*) > 1
       ) t`,
      issues,
      'transaction',
      { failureSeverity: 'low' }
    )
    const groups = Number(dupGroups.rows[0]?.[0] ?? 0)
    if (groups > 0) {
      issues.push(
        issue({
          severity: 'medium',
          type: 'duplicate_amounts',
          table: `${col.schema}.${col.table}`,
          column: col.column,
          rowsAffected: groups,
          description: `${groups.toLocaleString()} distinct ${col.column} value(s) on \`${col.schema}\`.\`${col.table}\` appear more than once — review for duplicate ${classify(col.table)}.`,
          suggestedSql: `SELECT ${colExpr}, count(*) AS occurrences\nFROM \`${col.schema}\`.\`${col.table}\`\nGROUP BY ${colExpr}\nHAVING count(*) > 1\nORDER BY 2 DESC\nLIMIT 25;`
        })
      )
    }

    const negative = await tryQuery(
      ctx,
      `Count negative values in ${col.schema}.${col.table}.${col.column}`,
      `SELECT count(*) FROM ${qualified} WHERE ${colExpr} < 0`,
      issues,
      'transaction',
      { failureSeverity: 'low' }
    )
    const negCount = Number(negative.rows[0]?.[0] ?? 0)
    if (negCount > 0) {
      issues.push(
        issue({
          severity: 'low',
          type: 'negative_amount',
          table: `${col.schema}.${col.table}`,
          column: col.column,
          rowsAffected: negCount,
          description: `${negCount.toLocaleString()} row(s) in \`${col.schema}\`.\`${col.table}\`.${col.column} are negative — check whether refunds are expected here.`,
          suggestedSql: `SELECT * FROM \`${col.schema}\`.\`${col.table}\` WHERE ${colExpr} < 0 LIMIT 25;`
        })
      )
    }
  }

  return { issues }
}

// ────────────────────────────────────────────────────────────────── helpers ──

/** Pick numeric columns whose parent table looks transactional and whose name
 *  looks like money. Caller passes the raw `(schema, table, column)` rows from
 *  information_schema. */
function pickMoneyColumns(rows: unknown[][]): NumericColumn[] {
  const out: NumericColumn[] = []
  for (const row of rows) {
    const schema = String(row[0])
    const table = String(row[1])
    const column = String(row[2])
    if (!TX_TABLE_TOKENS.test(table)) continue
    if (!AMOUNT_COLUMN.test(column)) continue
    // Skip catalog-shaped columns where value repetition is by design.
    if (NOISY_AMOUNT_COLUMN.test(column)) continue
    out.push({ schema, table, column })
  }
  return out
}

// ─────────────────────────────────────────── financial-mismatch checks ──

interface FinancialTriple {
  schema: string
  table: string
  subtotal: string
  tax: string
  total: string
}

/** Allowed rounding tolerance for `subtotal + tax = total` comparisons. */
const FINANCIAL_TOLERANCE = 0.01

/** Find tables that have columns named subtotal + (vat|tax) + total. */
function pickFinancialTriples(rows: unknown[][]): FinancialTriple[] {
  const byTable = new Map<string, Set<string>>()
  for (const row of rows) {
    const key = `${String(row[0])}.${String(row[1])}`
    const set = byTable.get(key) ?? new Set<string>()
    set.add(String(row[2]).toLowerCase())
    byTable.set(key, set)
  }
  const triples: FinancialTriple[] = []
  for (const [key, cols] of byTable) {
    const [schema, table] = key.split('.')
    const subtotal = pick(cols, ['subtotal', 'sub_total', 'net', 'net_amount'])
    const tax = pick(cols, ['vat', 'tax', 'vat_amount', 'tax_amount'])
    const total = pick(cols, ['total', 'grand_total', 'total_amount', 'amount_due'])
    if (subtotal && tax && total) {
      triples.push({ schema, table, subtotal, tax, total })
    }
  }
  return triples
}

function pick(cols: Set<string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (cols.has(candidate)) return candidate
  }
  return null
}

async function runFinancialChecksPostgres(ctx: ScanContext, issues: Issue[]): Promise<void> {
  ctx.reportTask('Discovering financial-calculation triples…')
  const cols = await tryQuery(
    ctx,
    'List subtotal/tax/total columns',
    `
      SELECT c.table_schema, c.table_name, c.column_name
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND c.data_type IN ('numeric', 'double precision', 'real', 'integer', 'bigint', 'money')
    `,
    issues,
    'transaction'
  )
  const triples = pickFinancialTriples(cols.rows)
  for (const t of triples) {
    if (ctx.signal.aborted) break
    const qualified = `"${t.schema}"."${t.table}"`
    const sub = `"${t.subtotal}"`
    const tax = `"${t.tax}"`
    const tot = `"${t.total}"`
    ctx.reportTask(`Validating ${t.schema}.${t.table} calculations…`)
    const result = await tryQuery(
      ctx,
      `Validate subtotal+tax=total on ${t.schema}.${t.table}`,
      `SELECT count(*) AS mismatched,
              COALESCE(SUM(ABS(${sub} + ${tax} - ${tot})), 0) AS total_drift
       FROM ${qualified}
       WHERE ${sub} IS NOT NULL AND ${tax} IS NOT NULL AND ${tot} IS NOT NULL
         AND ABS(${sub} + ${tax} - ${tot}) > ${FINANCIAL_TOLERANCE}`,
      issues,
      'transaction',
      { failureSeverity: 'low' }
    )
    const row = result.rows[0]
    const mismatched = Number(row?.[0] ?? 0)
    const drift = Number(row?.[1] ?? 0)
    if (mismatched > 0) {
      issues.push(
        issue({
          severity: 'high',
          type: 'subtotal_vat_mismatch',
          table: `${t.schema}.${t.table}`,
          column: `${t.subtotal}+${t.tax} vs ${t.total}`,
          rowsAffected: mismatched,
          description: `${mismatched.toLocaleString()} row(s) in "${t.schema}"."${t.table}" have ${t.subtotal} + ${t.tax} ≠ ${t.total} (cumulative drift ${drift.toFixed(2)}).`,
          suggestedSql: `SELECT *, (${sub} + ${tax}) AS computed_total, ${tot} AS stored_total\nFROM ${qualified}\nWHERE ABS(${sub} + ${tax} - ${tot}) > ${FINANCIAL_TOLERANCE}\nLIMIT 25;`
        })
      )
    }
  }
}

async function runFinancialChecksMysql(ctx: ScanContext, issues: Issue[]): Promise<void> {
  ctx.reportTask('Discovering financial-calculation triples…')
  const cols = await tryQuery(
    ctx,
    'List subtotal/tax/total columns',
    `
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND data_type IN ('decimal', 'numeric', 'float', 'double', 'int', 'bigint', 'smallint', 'mediumint')
    `,
    issues,
    'transaction'
  )
  const triples = pickFinancialTriples(cols.rows)
  for (const t of triples) {
    if (ctx.signal.aborted) break
    const qualified = `\`${t.schema}\`.\`${t.table}\``
    const sub = `\`${t.subtotal}\``
    const tax = `\`${t.tax}\``
    const tot = `\`${t.total}\``
    ctx.reportTask(`Validating ${t.schema}.${t.table} calculations…`)
    const result = await tryQuery(
      ctx,
      `Validate subtotal+tax=total on ${t.schema}.${t.table}`,
      `SELECT count(*) AS mismatched,
              COALESCE(SUM(ABS(${sub} + ${tax} - ${tot})), 0) AS total_drift
       FROM ${qualified}
       WHERE ${sub} IS NOT NULL AND ${tax} IS NOT NULL AND ${tot} IS NOT NULL
         AND ABS(${sub} + ${tax} - ${tot}) > ${FINANCIAL_TOLERANCE}`,
      issues,
      'transaction',
      { failureSeverity: 'low' }
    )
    const row = result.rows[0]
    const mismatched = Number(row?.[0] ?? 0)
    const drift = Number(row?.[1] ?? 0)
    if (mismatched > 0) {
      issues.push(
        issue({
          severity: 'high',
          type: 'subtotal_vat_mismatch',
          table: `${t.schema}.${t.table}`,
          column: `${t.subtotal}+${t.tax} vs ${t.total}`,
          rowsAffected: mismatched,
          description: `${mismatched.toLocaleString()} row(s) in \`${t.schema}\`.\`${t.table}\` have ${t.subtotal} + ${t.tax} ≠ ${t.total} (cumulative drift ${drift.toFixed(2)}).`,
          suggestedSql: `SELECT *, (${sub} + ${tax}) AS computed_total, ${tot} AS stored_total\nFROM ${qualified}\nWHERE ABS(${sub} + ${tax} - ${tot}) > ${FINANCIAL_TOLERANCE}\nLIMIT 25;`
        })
      )
    }
  }
}

// ─────────────────────────────────── composite-key duplicate invoice ──

/** Identifier columns that anchor a unique invoice / order / receipt. */
const INVOICE_ID_COLUMN =
  /^(invoice_?(number|no)|order_?(number|no)|receipt_?(number|no)|bill_?(number|no)|reference|ref_?no|document_?no)$/i
/** Money column that represents the invoice total — *not* a line-level price. */
const TOTAL_COLUMN =
  /^(total|grand_?total|total_?amount|amount_?due|net_?total|invoice_?total|order_?total)$/i
/** Foreign-key column to a customer/supplier/account — the "who" of the invoice. */
const PARTY_COLUMN =
  /^(customer_?id|client_?id|vendor_?id|supplier_?id|party_?id|account_?id|buyer_?id|payer_?id)$/i
/** Column whose value identifies the issue/post day. */
const DATE_COLUMN =
  /^(date|issue_?date|invoice_?date|order_?date|posting_?date|posted_?at|transaction_?date|bill_?date|created_?at)$/i

interface InvoiceShape {
  schema: string
  table: string
  identifier: string
  total: string
  party: string | null
  date: string | null
}

/** Group columns by table and pick out the (identifier, total, party?, date?)
 *  shape. Tables that don't match the minimum pattern are skipped. */
function pickInvoiceShapes(rows: unknown[][]): InvoiceShape[] {
  const byTable = new Map<string, { schema: string; table: string; columns: string[] }>()
  for (const row of rows) {
    const schema = String(row[0])
    const table = String(row[1])
    const column = String(row[2])
    if (!TX_TABLE_TOKENS.test(table)) continue
    const key = `${schema}.${table}`
    const entry = byTable.get(key) ?? { schema, table, columns: [] }
    entry.columns.push(column)
    byTable.set(key, entry)
  }

  const out: InvoiceShape[] = []
  for (const { schema, table, columns } of byTable.values()) {
    const identifier = columns.find((c) => INVOICE_ID_COLUMN.test(c))
    const total = columns.find((c) => TOTAL_COLUMN.test(c))
    if (!identifier || !total) continue
    const party = columns.find((c) => PARTY_COLUMN.test(c)) ?? null
    const date = columns.find((c) => DATE_COLUMN.test(c)) ?? null
    // Require at least one *additional* anchor beyond identifier+total — that's
    // what makes this stronger than the plain duplicate_identifiers check.
    if (!party && !date) continue
    out.push({ schema, table, identifier, total, party, date })
  }
  return out
}

/** Build a (composite-key, group-by) pair tailored to the columns we found. */
interface KeyExpr {
  /** Column expressions used for GROUP BY + SELECT. */
  exprs: string[]
  /** Comma-joined names for the `WHERE … IN (…)` left side. */
  whereTuple: string
  /** Per-column NULL filter. */
  notNulls: string[]
  /** Human-friendly description, e.g. `invoice_number + customer_id + total + DATE(issue_date)`. */
  label: string
}

function postgresKeyExpr(shape: InvoiceShape): KeyExpr {
  const ident = `"${shape.identifier}"`
  const total = `"${shape.total}"`
  const exprs: string[] = [ident, total]
  const notNulls: string[] = [`${ident} IS NOT NULL`, `${total} IS NOT NULL`]
  const labelParts: string[] = [shape.identifier, shape.total]
  if (shape.party) {
    const party = `"${shape.party}"`
    exprs.push(party)
    notNulls.push(`${party} IS NOT NULL`)
    labelParts.push(shape.party)
  }
  if (shape.date) {
    // DATE-cast so timestamps captured the same calendar day still match.
    const dateExpr = `DATE("${shape.date}")`
    exprs.push(dateExpr)
    notNulls.push(`"${shape.date}" IS NOT NULL`)
    labelParts.push(`DATE(${shape.date})`)
  }
  return {
    exprs,
    whereTuple: exprs.join(', '),
    notNulls,
    label: labelParts.join(' + ')
  }
}

function mysqlKeyExpr(shape: InvoiceShape): KeyExpr {
  const ident = `\`${shape.identifier}\``
  const total = `\`${shape.total}\``
  const exprs: string[] = [ident, total]
  const notNulls: string[] = [`${ident} IS NOT NULL`, `${total} IS NOT NULL`]
  const labelParts: string[] = [shape.identifier, shape.total]
  if (shape.party) {
    const party = `\`${shape.party}\``
    exprs.push(party)
    notNulls.push(`${party} IS NOT NULL`)
    labelParts.push(shape.party)
  }
  if (shape.date) {
    const dateExpr = `DATE(\`${shape.date}\`)`
    exprs.push(dateExpr)
    notNulls.push(`\`${shape.date}\` IS NOT NULL`)
    labelParts.push(`DATE(${shape.date})`)
  }
  return {
    exprs,
    whereTuple: exprs.join(', '),
    notNulls,
    label: labelParts.join(' + ')
  }
}

async function runDuplicateInvoiceChecksPostgres(
  ctx: ScanContext,
  issues: Issue[]
): Promise<void> {
  ctx.reportTask('Looking for duplicate invoice records…')
  const cols = await tryQuery(
    ctx,
    'List columns on transactional tables for shape detection',
    `
      SELECT c.table_schema, c.table_name, c.column_name
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
    `,
    issues,
    'transaction'
  )
  const shapes = pickInvoiceShapes(cols.rows)
  for (const shape of shapes) {
    if (ctx.signal.aborted) break
    const qualified = `"${shape.schema}"."${shape.table}"`
    const key = postgresKeyExpr(shape)
    const exprList = key.exprs.join(', ')
    const groupBy = key.exprs.map((_, i) => i + 1).join(', ')
    const whereClause = key.notNulls.join(' AND ')

    ctx.reportTask(`Auditing ${shape.schema}.${shape.table} for duplicate records…`)
    const result = await tryQuery(
      ctx,
      `Count duplicate invoice keys on ${shape.schema}.${shape.table}`,
      `SELECT count(*) FROM (
         SELECT ${exprList}
         FROM ${qualified}
         WHERE ${whereClause}
         GROUP BY ${groupBy}
         HAVING count(*) > 1
       ) t`,
      issues,
      'transaction',
      { failureSeverity: 'low' }
    )
    const groups = Number(result.rows[0]?.[0] ?? 0)
    if (groups === 0) continue

    // Investigation SQL returns the actual rows, surfaced via the
    // RecordComparisonViewer's preferred `suggestedSql` path.
    const investigation =
      `SELECT *\nFROM ${qualified}\n` +
      `WHERE (${key.whereTuple}) IN (\n` +
      `  SELECT ${exprList}\n  FROM ${qualified}\n  WHERE ${whereClause}\n` +
      `  GROUP BY ${groupBy}\n  HAVING count(*) > 1\n)\n` +
      `ORDER BY ${groupBy}\nLIMIT 100`

    issues.push(
      issue({
        severity: 'high',
        type: 'duplicate_invoice_record',
        table: `${shape.schema}.${shape.table}`,
        column: key.label,
        rowsAffected: groups,
        description: `${groups.toLocaleString()} composite key${
          groups === 1 ? '' : 's'
        } on "${shape.schema}"."${shape.table}" repeat across multiple rows (matched on ${key.label}) — strong duplicate-invoice signal.`,
        suggestedSql: investigation
      })
    )
  }
}

async function runDuplicateInvoiceChecksMysql(
  ctx: ScanContext,
  issues: Issue[]
): Promise<void> {
  ctx.reportTask('Looking for duplicate invoice records…')
  const cols = await tryQuery(
    ctx,
    'List columns on transactional tables for shape detection',
    `
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
    `,
    issues,
    'transaction'
  )
  const shapes = pickInvoiceShapes(cols.rows)
  for (const shape of shapes) {
    if (ctx.signal.aborted) break
    const qualified = `\`${shape.schema}\`.\`${shape.table}\``
    const key = mysqlKeyExpr(shape)
    const exprList = key.exprs.join(', ')
    const groupBy = key.exprs.map((_, i) => i + 1).join(', ')
    const whereClause = key.notNulls.join(' AND ')

    ctx.reportTask(`Auditing ${shape.schema}.${shape.table} for duplicate records…`)
    const result = await tryQuery(
      ctx,
      `Count duplicate invoice keys on ${shape.schema}.${shape.table}`,
      `SELECT count(*) FROM (
         SELECT ${exprList}
         FROM ${qualified}
         WHERE ${whereClause}
         GROUP BY ${groupBy}
         HAVING count(*) > 1
       ) t`,
      issues,
      'transaction',
      { failureSeverity: 'low' }
    )
    const groups = Number(result.rows[0]?.[0] ?? 0)
    if (groups === 0) continue

    const investigation =
      `SELECT *\nFROM ${qualified}\n` +
      `WHERE (${key.whereTuple}) IN (\n` +
      `  SELECT ${exprList}\n  FROM ${qualified}\n  WHERE ${whereClause}\n` +
      `  GROUP BY ${groupBy}\n  HAVING count(*) > 1\n)\n` +
      `ORDER BY ${groupBy}\nLIMIT 100`

    issues.push(
      issue({
        severity: 'high',
        type: 'duplicate_invoice_record',
        table: `${shape.schema}.${shape.table}`,
        column: key.label,
        rowsAffected: groups,
        description: `${groups.toLocaleString()} composite key${
          groups === 1 ? '' : 's'
        } on \`${shape.schema}\`.\`${shape.table}\` repeat across multiple rows (matched on ${key.label}) — strong duplicate-invoice signal.`,
        suggestedSql: investigation
      })
    )
  }
}

/** Short, human-readable label for the table's transactional role. */
function classify(table: string): string {
  if (/invoice/i.test(table)) return 'invoices'
  if (/payment/i.test(table)) return 'payments'
  if (/order/i.test(table)) return 'orders'
  if (/receipt/i.test(table)) return 'receipts'
  if (/charge/i.test(table)) return 'charges'
  return 'transactions'
}
