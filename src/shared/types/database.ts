export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ActiveConnectionInfo {
  connectionId: string
  serverVersion: string
  connectedAt: string
}
