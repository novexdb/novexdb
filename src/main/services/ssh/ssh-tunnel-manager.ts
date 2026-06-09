import { openSshTunnel, type OpenTunnel, type SshTunnelConfig } from '@main/services/ssh/ssh-tunnel'

/**
 * Owns the lifecycle of SSH tunnels, one per live connection. The connection
 * manager opens a tunnel before the DB driver connects and closes it on
 * disconnect / app quit; `endpointFor` lets pg_dump / pg_restore reuse the live
 * tunnel's local endpoint.
 */
class SshTunnelManager {
  private readonly tunnels = new Map<string, OpenTunnel>()

  /** Persistent tunnel for a live connection. Replaces any existing one. */
  async open(connectionId: string, cfg: SshTunnelConfig): Promise<OpenTunnel> {
    await this.close(connectionId)
    const tunnel = await openSshTunnel(cfg)
    this.tunnels.set(connectionId, tunnel)
    return tunnel
  }

  /** Ephemeral tunnel for a Test — the caller must close it in a `finally`. */
  openEphemeral(cfg: SshTunnelConfig): Promise<OpenTunnel> {
    return openSshTunnel(cfg)
  }

  /** The live tunnel's local endpoint, or null when the connection isn't tunneled. */
  endpointFor(connectionId: string): { host: string; port: number } | null {
    const tunnel = this.tunnels.get(connectionId)
    return tunnel ? { host: tunnel.localHost, port: tunnel.localPort } : null
  }

  async close(connectionId: string): Promise<void> {
    const tunnel = this.tunnels.get(connectionId)
    if (!tunnel) return
    this.tunnels.delete(connectionId)
    await tunnel.close()
  }

  async closeAll(): Promise<void> {
    const all = [...this.tunnels.values()]
    this.tunnels.clear()
    await Promise.allSettled(all.map((tunnel) => tunnel.close()))
  }
}

export const sshTunnelManager = new SshTunnelManager()
