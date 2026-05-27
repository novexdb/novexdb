import { create } from 'zustand'

export type UpdateStatus = 'idle' | 'downloading' | 'ready'

interface UpdateState {
  status: UpdateStatus
  version: string | null
  /** Download progress, 0–100. */
  percent: number
  dismissed: boolean

  onAvailable: (version: string) => void
  onProgress: (percent: number) => void
  onDownloaded: (version: string) => void
  dismiss: () => void
}

/** Tracks auto-update progress for the update banner. */
export const useUpdateStore = create<UpdateState>((set) => ({
  status: 'idle',
  version: null,
  percent: 0,
  dismissed: false,

  onAvailable: (version) =>
    set({ status: 'downloading', version, percent: 0, dismissed: false }),
  onProgress: (percent) => set({ percent }),
  onDownloaded: (version) => set({ status: 'ready', version, dismissed: false }),
  dismiss: () => set({ dismissed: true })
}))
