import { describe, expect, it } from 'vitest'
import { analyzeSql } from '@main/services/ai/sql-safety'

describe('analyzeSql', () => {
  it('returns no warnings for a plain SELECT', () => {
    expect(analyzeSql('SELECT * FROM users').warnings).toEqual([])
  })

  it('flags DROP, TRUNCATE, ALTER, GRANT, REVOKE', () => {
    for (const keyword of ['DROP', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE']) {
      const { warnings } = analyzeSql(`${keyword} TABLE foo;`)
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0]).toContain(keyword)
    }
  })

  it('is case-insensitive on the leading keyword', () => {
    expect(analyzeSql('drop table foo;').warnings.length).toBeGreaterThan(0)
  })

  it('flags DELETE without a WHERE clause', () => {
    const { warnings } = analyzeSql('DELETE FROM users')
    expect(warnings.some((w) => w.includes('DELETE') && w.includes('WHERE'))).toBe(true)
  })

  it('flags UPDATE without a WHERE clause', () => {
    const { warnings } = analyzeSql("UPDATE users SET active = false")
    expect(warnings.some((w) => w.includes('UPDATE') && w.includes('WHERE'))).toBe(true)
  })

  it('allows a scoped UPDATE / DELETE with a WHERE', () => {
    expect(analyzeSql('UPDATE users SET active = false WHERE id = 1').warnings).toEqual([])
    expect(analyzeSql('DELETE FROM users WHERE id = 1').warnings).toEqual([])
  })

  it('handles multiple statements separately', () => {
    const { warnings } = analyzeSql('SELECT 1; DROP TABLE foo; DELETE FROM bar')
    expect(warnings.length).toBe(2)
  })
})
