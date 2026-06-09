import { randomUUID } from 'node:crypto'
import { JsonStore } from '@main/utils/json-store'
import { credentialVault } from '@main/services/credential-vault'
import type {
  Connection,
  ConnectionInput,
  SshConfig,
  SshConnectionConfig,
  UpdateConnectionPayload
} from '@shared/types/connection'

/** On-disk shape: connection metadata plus the encrypted secret blobs. */
interface StoredConnection extends Connection {
  encryptedPassword: string
  /** Encrypted SSH account password (password auth). */
  encryptedSshPassword?: string
  /** Encrypted SSH private-key passphrase (privateKey auth). */
  encryptedSshPassphrase?: string
}

interface ConnectionsFile {
  connections: StoredConnection[]
}

/** Strip every secret blob before a record ever crosses the IPC boundary. */
function toPublic({
  encryptedPassword: _password,
  encryptedSshPassword: _sshPassword,
  encryptedSshPassphrase: _sshPassphrase,
  ...metadata
}: StoredConnection): Connection {
  return metadata
}

/**
 * Split an incoming SSH config into the secret-free metadata that gets
 * persisted on the record and the two secrets that get encrypted into the vault.
 */
function splitSshSecrets(ssh: SshConfig | undefined): {
  meta: SshConnectionConfig | undefined
  encryptedSshPassword?: string
  encryptedSshPassphrase?: string
} {
  if (!ssh) return { meta: undefined }
  const { password, passphrase, ...meta } = ssh
  return {
    meta,
    encryptedSshPassword: password ? credentialVault.encrypt(password) : undefined,
    encryptedSshPassphrase: passphrase ? credentialVault.encrypt(passphrase) : undefined
  }
}

/**
 * Owns the persistence of saved connections. Metadata is stored as plain JSON;
 * the database password and the SSH secrets are the only fields encrypted (via
 * CredentialVault) and are never exposed to the renderer — they are resolved
 * here, in main, at connect time.
 */
class ConnectionStore {
  private readonly store = new JsonStore<ConnectionsFile>('connections.json', {
    connections: []
  })

  async list(): Promise<Connection[]> {
    const { connections } = await this.store.read()
    return connections.map(toPublic)
  }

  async create(input: ConnectionInput): Promise<Connection> {
    const file = await this.store.read()
    const now = new Date().toISOString()
    const ssh = splitSshSecrets(input.ssh)
    const record: StoredConnection = {
      id: randomUUID(),
      name: input.name,
      engine: input.engine,
      host: input.host,
      port: input.port,
      database: input.database,
      username: input.username,
      ssl: input.ssl,
      color: input.color,
      options: input.options,
      ssh: ssh.meta,
      createdAt: now,
      updatedAt: now,
      encryptedPassword: credentialVault.encrypt(input.password),
      encryptedSshPassword: ssh.encryptedSshPassword,
      encryptedSshPassphrase: ssh.encryptedSshPassphrase
    }
    await this.store.write({ connections: [...file.connections, record] })
    return toPublic(record)
  }

  async update({ id, changes }: UpdateConnectionPayload): Promise<Connection> {
    const file = await this.store.read()
    const index = file.connections.findIndex((c) => c.id === id)
    if (index === -1) throw new Error(`Connection ${id} not found`)

    const existing = file.connections[index]
    // Pull secrets out so plaintext never lands in the persisted record.
    const { password, ssh, ...metadataChanges } = changes

    let sshMeta = existing.ssh
    let encryptedSshPassword = existing.encryptedSshPassword
    let encryptedSshPassphrase = existing.encryptedSshPassphrase
    if (ssh !== undefined) {
      const { password: sshPassword, passphrase: sshPassphrase, ...meta } = ssh
      sshMeta = { ...existing.ssh, ...meta } as SshConnectionConfig
      // Blank means "keep the existing one" — only re-encrypt when supplied.
      if (sshPassword !== undefined && sshPassword !== '') {
        encryptedSshPassword = credentialVault.encrypt(sshPassword)
      }
      if (sshPassphrase !== undefined && sshPassphrase !== '') {
        encryptedSshPassphrase = credentialVault.encrypt(sshPassphrase)
      }
    }

    const updated: StoredConnection = {
      ...existing,
      ...metadataChanges,
      ssh: sshMeta,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      encryptedPassword:
        password !== undefined && password !== ''
          ? credentialVault.encrypt(password)
          : existing.encryptedPassword,
      encryptedSshPassword,
      encryptedSshPassphrase
    }
    const connections = [...file.connections]
    connections[index] = updated
    await this.store.write({ connections })
    return toPublic(updated)
  }

  async delete(id: string): Promise<void> {
    const file = await this.store.read()
    await this.store.write({
      connections: file.connections.filter((c) => c.id !== id)
    })
  }

  async getRecord(id: string): Promise<Connection> {
    const { connections } = await this.store.read()
    const record = connections.find((c) => c.id === id)
    if (!record) throw new Error(`Connection ${id} not found`)
    return toPublic(record)
  }

  async getPassword(id: string): Promise<string> {
    const { connections } = await this.store.read()
    const record = connections.find((c) => c.id === id)
    if (!record) throw new Error(`Connection ${id} not found`)
    return credentialVault.decrypt(record.encryptedPassword)
  }

  /** Decrypts the SSH secrets for a connection (used at tunnel-open time). */
  async getSshSecrets(id: string): Promise<{ password?: string; passphrase?: string }> {
    const { connections } = await this.store.read()
    const record = connections.find((c) => c.id === id)
    if (!record) throw new Error(`Connection ${id} not found`)
    return {
      password: record.encryptedSshPassword
        ? credentialVault.decrypt(record.encryptedSshPassword)
        : undefined,
      passphrase: record.encryptedSshPassphrase
        ? credentialVault.decrypt(record.encryptedSshPassphrase)
        : undefined
    }
  }
}

export const connectionStore = new ConnectionStore()
