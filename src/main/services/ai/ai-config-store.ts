import type { AiProvider } from '@shared/types/ai'
import { JsonStore } from '@main/utils/json-store'
import { credentialVault } from '@main/services/credential-vault'

interface AiCredentialsFile {
  encryptedApiKey: string | null
}

/** Env var consulted as a dev-convenience fallback when no key is saved. */
const ENV_VAR: Record<AiProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY'
}

/**
 * Stores the AI provider API key, encrypted with the OS keychain via
 * CredentialVault. When no key is saved, falls back to the environment
 * variable for the active provider (e.g. GEMINI_API_KEY for Gemini).
 */
class AiConfigStore {
  private readonly store = new JsonStore<AiCredentialsFile>('ai-credentials.json', {
    encryptedApiKey: null
  })

  async getApiKey(provider: AiProvider = 'anthropic'): Promise<string | null> {
    const { encryptedApiKey } = await this.store.read()
    if (encryptedApiKey) {
      try {
        return credentialVault.decrypt(encryptedApiKey)
      } catch {
        /* fall through to the env var */
      }
    }
    return process.env[ENV_VAR[provider]] ?? null
  }

  async setApiKey(apiKey: string): Promise<void> {
    await this.store.write({ encryptedApiKey: credentialVault.encrypt(apiKey) })
  }

  async hasApiKey(provider: AiProvider = 'anthropic'): Promise<boolean> {
    return (await this.getApiKey(provider)) !== null
  }
}

export const aiConfigStore = new AiConfigStore()
