import { describe, expect, it } from 'vitest'
import { classifyConnectError, SshTunnelError } from '@main/services/ssh/ssh-tunnel'

/** Build an Error with an optional ssh2 `level` tag. */
function sshError(message: string, level?: string): Error & { level?: string } {
  return Object.assign(new Error(message), level ? { level } : {})
}

describe('classifyConnectError', () => {
  it('flags ssh2 client-authentication failures as AUTH', () => {
    const result = classifyConnectError(
      sshError('All configured authentication methods failed', 'client-authentication')
    )
    expect(result).toBeInstanceOf(SshTunnelError)
    expect(result.reason).toBe('AUTH')
    expect(result.message).toMatch(/authentication failed/i)
  })

  it('treats the auth-methods message as AUTH even without a level tag', () => {
    expect(
      classifyConnectError(sshError('All configured authentication methods failed')).reason
    ).toBe('AUTH')
  })

  it('classifies network failures as UNREACHABLE', () => {
    for (const msg of [
      'getaddrinfo ENOTFOUND bastion',
      'connect ECONNREFUSED 1.2.3.4:22',
      'Timed out while waiting for handshake'
    ]) {
      expect(classifyConnectError(sshError(msg)).reason).toBe('UNREACHABLE')
    }
  })

  it('classifies key/passphrase problems as KEY_PASSPHRASE', () => {
    for (const msg of [
      'Encrypted private OpenSSH key detected, but no passphrase given',
      'Cannot parse privateKey: bad passphrase',
      'integrity check failed'
    ]) {
      expect(classifyConnectError(sshError(msg)).reason).toBe('KEY_PASSPHRASE')
    }
  })

  it('falls back to UNKNOWN for unrecognized errors', () => {
    const result = classifyConnectError(sshError('something weird happened'))
    expect(result.reason).toBe('UNKNOWN')
    expect(result.message).toContain('something weird happened')
  })

  it('preserves the original error as cause', () => {
    const original = sshError('boom')
    expect(classifyConnectError(original).cause).toBe(original)
  })
})
