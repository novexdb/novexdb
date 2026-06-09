import net from 'node:net'
import { readFile } from 'node:fs/promises'
import { Client, type ConnectConfig } from 'ssh2'

/** Reasons an SSH tunnel can fail — used to phrase a clear, distinct message. */
export type SshTunnelErrorReason =
  | 'AUTH'
  | 'UNREACHABLE'
  | 'KEY_READ'
  | 'KEY_PASSPHRASE'
  | 'FORWARD'
  | 'UNKNOWN'

/** Distinguishable from DB errors so the UI can label failures "SSH …". */
export class SshTunnelError extends Error {
  constructor(
    message: string,
    readonly reason: SshTunnelErrorReason,
    override readonly cause?: unknown
  ) {
    super(message)
    this.name = 'SshTunnelError'
  }
}

export type SshTunnelAuth =
  | { method: 'password'; password: string }
  | { method: 'privateKey'; privateKeyPath: string; passphrase?: string }

export interface SshTunnelConfig {
  sshHost: string
  sshPort: number
  sshUsername: string
  auth: SshTunnelAuth
  /** The DB endpoint as seen *from the bastion* (e.g. 127.0.0.1:5432). */
  destHost: string
  destPort: number
}

export interface OpenTunnel {
  /** Always 127.0.0.1 — the local end the DB driver dials. */
  localHost: string
  /** Ephemeral local port allocated for this tunnel. */
  localPort: number
  /** Idempotent teardown — closes the local server and the SSH client. */
  close: () => Promise<void>
}

const KEEPALIVE_MS = 10_000
const HANDSHAKE_TIMEOUT_MS = 15_000

/** Turn our auth shape into an ssh2 ConnectConfig (reads the key file for key auth). */
async function buildConnectConfig(cfg: SshTunnelConfig): Promise<ConnectConfig> {
  const base: ConnectConfig = {
    host: cfg.sshHost,
    port: cfg.sshPort,
    username: cfg.sshUsername,
    readyTimeout: HANDSHAKE_TIMEOUT_MS,
    keepaliveInterval: KEEPALIVE_MS
    // No agent / default-key fallback by design (scope decision).
  }
  if (cfg.auth.method === 'password') {
    return { ...base, password: cfg.auth.password }
  }
  let privateKey: Buffer
  try {
    privateKey = await readFile(cfg.auth.privateKeyPath)
  } catch (err) {
    throw new SshTunnelError(
      `Cannot read SSH private key at ${cfg.auth.privateKeyPath}`,
      'KEY_READ',
      err
    )
  }
  return { ...base, privateKey, passphrase: cfg.auth.passphrase || undefined }
}

/** Map a raw ssh2 connect error onto a user-facing SshTunnelError. */
export function classifyConnectError(err: Error & { level?: string }): SshTunnelError {
  const msg = err.message || ''
  if (
    err.level === 'client-authentication' ||
    /All configured authentication methods failed/i.test(msg)
  ) {
    return new SshTunnelError(
      'SSH authentication failed — check the SSH username, password, or key.',
      'AUTH',
      err
    )
  }
  if (
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|getaddrinfo|Timed out/i.test(msg)
  ) {
    return new SshTunnelError(`SSH host unreachable: ${msg}`, 'UNREACHABLE', err)
  }
  if (
    /no matching|cannot parse privateKey|bad passphrase|Encrypted private OpenSSH key|integrity check failed|Malformed/i.test(
      msg
    )
  ) {
    return new SshTunnelError(
      'SSH private key could not be used — it may need a passphrase or be an unsupported format.',
      'KEY_PASSPHRASE',
      err
    )
  }
  return new SshTunnelError(`SSH error: ${msg}`, 'UNKNOWN', err)
}

/**
 * Open an SSH tunnel that forwards a local ephemeral 127.0.0.1 port to
 * `destHost:destPort` as reached from the bastion. The DB driver then connects
 * to the returned `localHost:localPort` instead of the original host/port.
 */
export async function openSshTunnel(cfg: SshTunnelConfig): Promise<OpenTunnel> {
  const connectConfig = await buildConnectConfig(cfg)
  const client = new Client()
  const sockets = new Set<net.Socket>()
  let closed = false

  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    for (const socket of sockets) socket.destroy()
    sockets.clear()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    client.end()
  }

  // 1) Establish the SSH client connection.
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      client.removeListener('ready', onReady)
      reject(classifyConnectError(err))
    }
    const onReady = (): void => {
      client.removeListener('error', onError)
      resolve()
    }
    client.once('ready', onReady)
    client.once('error', onError)
    client.connect(connectConfig)
  })

  // 2) Local forwarding server: each inbound socket is piped to a forwarded channel.
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    client.forwardOut(
      socket.remoteAddress ?? '127.0.0.1',
      socket.remotePort ?? 0,
      cfg.destHost,
      cfg.destPort,
      (err, stream) => {
        if (err) {
          // The bastion could not reach the DB endpoint.
          socket.destroy()
          return
        }
        socket.pipe(stream).pipe(socket)
        stream.on('error', () => socket.destroy())
      }
    )
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    await close()
    throw new SshTunnelError('Failed to allocate a local tunnel port', 'FORWARD')
  }

  // If the SSH layer dies after open, tear everything down so the DB pool
  // surfaces a clean connection error instead of hanging on dead sockets.
  client.on('error', () => {
    void close()
  })
  client.on('close', () => {
    for (const socket of sockets) socket.destroy()
    sockets.clear()
    if (!closed) server.close()
  })

  return { localHost: '127.0.0.1', localPort: address.port, close }
}
