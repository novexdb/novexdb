import { describe, expect, it } from 'vitest'
import { parseConnectionUrl } from '@renderer/features/connections/url-import'

describe('parseConnectionUrl', () => {
  it('parses a TablePlus postgres + SSH (private key) URL', () => {
    const result = parseConnectionUrl(
      'postgresql+ssh://forge@13.207.105.133/forge:kR5UYdH6d1AvomOQ2Exl@127.0.0.1/forge?name=acodax-axispro-new-01&usePrivateKey=true'
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      engine: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      database: 'forge',
      username: 'forge',
      password: 'kR5UYdH6d1AvomOQ2Exl',
      name: 'acodax-axispro-new-01'
    })
    expect(result.value.ssh).toMatchObject({
      enabled: true,
      host: '13.207.105.133',
      port: 22,
      username: 'forge',
      authMethod: 'privateKey'
    })
  })

  it('uses password auth when usePrivateKey is absent, and carries an explicit SSH port + password', () => {
    const result = parseConnectionUrl(
      'mysql+ssh://ec2:sshpass@bastion.example.com:2222/root:dbpass@10.0.0.5:3307/app'
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      engine: 'mysql',
      host: '10.0.0.5',
      port: 3307,
      database: 'app',
      username: 'root',
      password: 'dbpass'
    })
    expect(result.value.ssh).toMatchObject({
      enabled: true,
      host: 'bastion.example.com',
      port: 2222,
      username: 'ec2',
      authMethod: 'password',
      password: 'sshpass'
    })
  })

  it('parses a plain URL and disables SSH', () => {
    const result = parseConnectionUrl('postgresql://app:secret@db.internal:5432/store')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      engine: 'postgres',
      host: 'db.internal',
      port: 5432,
      database: 'store',
      username: 'app',
      password: 'secret'
    })
    expect(result.value.ssh?.enabled).toBe(false)
  })

  it('defaults the port per engine when omitted', () => {
    const mysql = parseConnectionUrl('mysql://root@localhost/app')
    const mssql = parseConnectionUrl('sqlserver://sa@localhost/master')
    expect(mysql.ok && mysql.value.port).toBe(3306)
    expect(mssql.ok && mssql.value.engine).toBe('mssql')
    expect(mssql.ok && mssql.value.port).toBe(1433)
  })

  it('maps sslmode and percent-decodes credentials', () => {
    const result = parseConnectionUrl('postgresql://u%40d:p%2Fass@host/db?sslmode=require')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.username).toBe('u@d')
    expect(result.value.password).toBe('p/ass')
    expect(result.value.ssl).toBe('require')
  })

  it('rejects empty input, non-URLs, and unsupported schemes', () => {
    expect(parseConnectionUrl('').ok).toBe(false)
    expect(parseConnectionUrl('not a url').ok).toBe(false)
    expect(parseConnectionUrl('redis://localhost:6379').ok).toBe(false)
  })
})
