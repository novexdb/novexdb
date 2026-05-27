import { randomUUID } from 'node:crypto'
import { JsonStore } from '@main/utils/json-store'
import { credentialVault } from '@main/services/credential-vault'
import type {
  Connection,
  ConnectionInput,
  UpdateConnectionPayload
} from '@shared/types/connection'

/** On-disk shape: connection metadata plus the encrypted password blob. */
interface StoredConnection extends Connection {
  encryptedPassword: string
}

interface ConnectionsFile {
  connections: StoredConnection[]
}

/** Strip the secret blob before a record ever crosses the IPC boundary. */
function toPublic({ encryptedPassword: _secret, ...metadata }: StoredConnection): Connection {
  return metadata
}

/**
 * Owns the persistence of saved connections. Metadata is stored as plain JSON;
 * the password is the only field encrypted (via CredentialVault) and is never
 * exposed to the renderer — it is resolved here, in main, at connect time.
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
      createdAt: now,
      updatedAt: now,
      encryptedPassword: credentialVault.encrypt(input.password)
    }
    await this.store.write({ connections: [...file.connections, record] })
    return toPublic(record)
  }

  async update({ id, changes }: UpdateConnectionPayload): Promise<Connection> {
    const file = await this.store.read()
    const index = file.connections.findIndex((c) => c.id === id)
    if (index === -1) throw new Error(`Connection ${id} not found`)

    const existing = file.connections[index]
    // Pull `password` out so plaintext never lands in the persisted record.
    const { password, ...metadataChanges } = changes
    const updated: StoredConnection = {
      ...existing,
      ...metadataChanges,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      encryptedPassword:
        password !== undefined
          ? credentialVault.encrypt(password)
          : existing.encryptedPassword
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
}

export const connectionStore = new ConnectionStore()
