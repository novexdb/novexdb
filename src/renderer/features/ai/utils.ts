import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import type { IssueSeverity } from '@shared/types/ai'

/** Insert generated SQL into the active query tab, or open a new tab for it. */
export function insertSqlIntoEditor(sql: string): void {
  const store = useEditorStore.getState()
  const active = store.tabs.find((tab) => tab.id === store.activeTabId)
  if (active && active.kind === 'query') {
    const existing = active.sql.trim()
    store.updateTabSql(active.id, existing ? `${existing}\n\n${sql}` : sql)
  } else {
    store.createTab(sql)
  }
}

export function copyText(text: string): void {
  void navigator.clipboard.writeText(text)
}

export const SEVERITY_BADGE: Record<IssueSeverity, string> = {
  high: 'bg-danger/15 text-danger',
  medium: 'bg-warning/15 text-warning',
  low: 'bg-accent-soft text-accent'
}
