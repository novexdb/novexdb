import { create } from 'zustand'

export type ResolvedTheme = 'dark' | 'light'

interface UiState {
  /** The theme actually applied to the DOM (after resolving "system"). */
  resolvedTheme: ResolvedTheme
  setResolvedTheme: (theme: ResolvedTheme) => void

  /** Whether the left panel (connection rail + explorer) is collapsed. */
  leftPanelCollapsed: boolean
  toggleLeftPanel: () => void

  /** Whether only the connection rail (far-left DB list) is collapsed. */
  connectionRailCollapsed: boolean
  toggleConnectionRail: () => void

  /** Whether the bottom result panel is collapsed. */
  resultPanelCollapsed: boolean
  toggleResultPanel: () => void
  setResultPanelCollapsed: (collapsed: boolean) => void

  /** Whether the Settings modal is open. */
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void

  /** Whether the "Open database" picker modal is open. */
  databasePickerOpen: boolean
  openDatabasePicker: () => void
  closeDatabasePicker: () => void

  /** True when the window is in native fullscreen — used to reclaim left space. */
  isFullScreen: boolean
  setFullScreen: (isFullScreen: boolean) => void
}

/** Ephemeral, non-persisted UI state (layout toggles, derived theme, modals). */
export const useUiStore = create<UiState>((set) => ({
  resolvedTheme: 'dark',
  setResolvedTheme: (theme) => set({ resolvedTheme: theme }),

  leftPanelCollapsed: false,
  toggleLeftPanel: () => set((s) => ({ leftPanelCollapsed: !s.leftPanelCollapsed })),

  connectionRailCollapsed: false,
  toggleConnectionRail: () =>
    set((s) => ({ connectionRailCollapsed: !s.connectionRailCollapsed })),

  resultPanelCollapsed: false,
  toggleResultPanel: () => set((s) => ({ resultPanelCollapsed: !s.resultPanelCollapsed })),
  setResultPanelCollapsed: (collapsed) => set({ resultPanelCollapsed: collapsed }),

  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  databasePickerOpen: false,
  openDatabasePicker: () => set({ databasePickerOpen: true }),
  closeDatabasePicker: () => set({ databasePickerOpen: false }),

  isFullScreen: false,
  setFullScreen: (isFullScreen) => set({ isFullScreen })
}))
