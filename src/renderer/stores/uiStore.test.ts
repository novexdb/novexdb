import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '@renderer/stores/uiStore'

beforeEach(() => {
  useUiStore.setState({
    resolvedTheme: 'dark',
    leftPanelCollapsed: false,
    connectionRailCollapsed: false,
    resultPanelCollapsed: false,
    settingsOpen: false,
    databasePickerOpen: false,
    isFullScreen: false
  })
})

describe('uiStore — theme', () => {
  it('setResolvedTheme stores the value', () => {
    useUiStore.getState().setResolvedTheme('light')
    expect(useUiStore.getState().resolvedTheme).toBe('light')
  })
})

describe('uiStore — layout toggles', () => {
  it('toggleLeftPanel inverts', () => {
    useUiStore.getState().toggleLeftPanel()
    expect(useUiStore.getState().leftPanelCollapsed).toBe(true)
    useUiStore.getState().toggleLeftPanel()
    expect(useUiStore.getState().leftPanelCollapsed).toBe(false)
  })

  it('toggleConnectionRail inverts', () => {
    useUiStore.getState().toggleConnectionRail()
    expect(useUiStore.getState().connectionRailCollapsed).toBe(true)
  })

  it('toggleResultPanel inverts', () => {
    useUiStore.getState().toggleResultPanel()
    expect(useUiStore.getState().resultPanelCollapsed).toBe(true)
  })

  it('setResultPanelCollapsed assigns directly', () => {
    useUiStore.getState().setResultPanelCollapsed(true)
    expect(useUiStore.getState().resultPanelCollapsed).toBe(true)
  })
})

describe('uiStore — modals', () => {
  it('open/close settings', () => {
    useUiStore.getState().openSettings()
    expect(useUiStore.getState().settingsOpen).toBe(true)
    useUiStore.getState().closeSettings()
    expect(useUiStore.getState().settingsOpen).toBe(false)
  })

  it('open/close database picker', () => {
    useUiStore.getState().openDatabasePicker()
    expect(useUiStore.getState().databasePickerOpen).toBe(true)
    useUiStore.getState().closeDatabasePicker()
    expect(useUiStore.getState().databasePickerOpen).toBe(false)
  })
})

describe('uiStore — fullscreen', () => {
  it('setFullScreen records the value', () => {
    useUiStore.getState().setFullScreen(true)
    expect(useUiStore.getState().isFullScreen).toBe(true)
  })
})
