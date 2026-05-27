import type { editor } from 'monaco-editor'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'

let instance: editor.IStandaloneCodeEditor | null = null

/**
 * Holds a reference to the live Monaco editor so non-React code (the query
 * runner, the AI toolbar) can read the current selection.
 */
export const activeEditor = {
  get: (): editor.IStandaloneCodeEditor | null => instance,
  set: (value: editor.IStandaloneCodeEditor | null): void => {
    instance = value
  }
}

/** The editor's selected text, or — if nothing is selected — the active tab's full SQL. */
export function getActiveSql(): string {
  if (instance) {
    const selection = instance.getSelection()
    const model = instance.getModel()
    if (selection && model && !selection.isEmpty()) {
      return model.getValueInRange(selection)
    }
  }
  const { tabs, activeTabId } = useEditorStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  return tab?.kind === 'query' ? tab.sql : ''
}
