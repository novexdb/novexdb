import { JsonStore } from '@main/utils/json-store'
import { credentialVault } from '@main/services/credential-vault'

interface AiCredentialsFile {
  encryptedApiKey: string | null
}

/**
 * Stores the AI provider API key, encrypted with the OS keychain via
 * CredentialVault. Falls back to the ANTHROPIC_API_KEY environment variable.
 */
class AiConfigStore {
  private readonly store = new JsonStore<AiCredentialsFile>('ai-credentials.json', {
    encryptedApiKey: null
  })

  async getApiKey(): Promise<string | null> {
    const { encryptedApiKey } = await this.store.read()
    if (encryptedApiKey) {
      try {
        return credentialVault.decrypt(encryptedApiKey)
      } catch {
        /* fall through to the env var */
      }
    }
    return process.env.ANTHROPIC_API_KEY ?? null
  }

  async setApiKey(apiKey: string): Promise<void> {
    await this.store.write({ encryptedApiKey: credentialVault.encrypt(apiKey) })
  }

  async hasApiKey(): Promise<boolean> {
    return (await this.getApiKey()) !== null
  }
}

export const aiConfigStore = new AiConfigStore()
