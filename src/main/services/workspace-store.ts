import { JsonStore } from '@main/utils/json-store'
import type { PersistedWorkspaceMap } from '@shared/schemas/workspaces.schema'

interface PersistedShape {
  workspaces: PersistedWorkspaceMap
}

const DEFAULTS: PersistedShape = { workspaces: {} }

/** Persists per-database editor tab state to `workspaces.json`. The renderer
 *  pushes the entire map on every change (debounced), and reads it once on
 *  startup — mirroring the settings-store pattern. */
class WorkspaceStore {
  private readonly store = new JsonStore<PersistedShape>('workspaces.json', DEFAULTS)

  async get(): Promise<PersistedWorkspaceMap> {
    const current = await this.store.read()
    return current.workspaces
  }

  async set(workspaces: PersistedWorkspaceMap): Promise<PersistedWorkspaceMap> {
    await this.store.write({ workspaces })
    return workspaces
  }
}

export const workspaceStore = new WorkspaceStore()
