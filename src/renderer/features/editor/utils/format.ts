import { format } from 'sql-formatter'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'

/** Pretty-print a SQL string; returns the input unchanged if it cannot be parsed. */
export function formatSql(sql: string): string {
  try {
    return format(sql, {
      language: 'postgresql',
      keywordCase: 'upper',
      tabWidth: 2
    })
  } catch {
    return sql
  }
}

/** Format the SQL in the currently active editor tab, in place. */
export function formatActiveTab(): void {
  const { tabs, activeTabId, updateTabSql } = useEditorStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab || tab.kind !== 'query' || tab.sql.trim() === '') return
  updateTabSql(activeTabId, formatSql(tab.sql))
}
