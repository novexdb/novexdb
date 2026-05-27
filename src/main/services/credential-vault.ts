import { safeStorage } from 'electron'

/**
 * Encrypts/decrypts secrets with the OS keychain via Electron's safeStorage
 * (Keychain on macOS, DPAPI on Windows, libsecret on Linux). Ciphertext is
 * returned as base64 so it can be embedded in plain JSON.
 */
class CredentialVault {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  encrypt(plainText: string): string {
    this.assertAvailable()
    return safeStorage.encryptString(plainText).toString('base64')
  }

  decrypt(cipherTextBase64: string): string {
    this.assertAvailable()
    return safeStorage.decryptString(Buffer.from(cipherTextBase64, 'base64'))
  }

  private assertAvailable(): void {
    if (!this.isAvailable()) {
      throw new Error('OS credential encryption is unavailable on this system')
    }
  }
}

export const credentialVault = new CredentialVault()
