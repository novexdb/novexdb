import type { Monaco } from '@monaco-editor/react'
import type { languages } from 'monaco-editor'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useExplorerStore } from '@renderer/features/explorer/stores/explorerStore'
import type { DatabaseEngine } from '@shared/types/connection'

const COMMON_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 'JOIN',
  'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON',
  'USING', 'AND', 'OR', 'NOT', 'NULL', 'IS NULL', 'IS NOT NULL', 'GROUP BY',
  'ORDER BY', 'HAVING', 'DISTINCT', 'AS', 'IN', 'BETWEEN',
  'LIKE', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'UNION',
  'UNION ALL', 'WITH', 'VALUES', 'SET', 'ASC', 'DESC', 'TRUE',
  'FALSE', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE'
]

/** Engine-specific keywords appended on top of the common set. */
const ENGINE_KEYWORDS: Record<DatabaseEngine, string[]> = {
  postgres: ['LIMIT', 'OFFSET', 'RETURNING', 'ILIKE', 'NOW', 'CURRENT_DATE', 'SERIAL'],
  mysql: ['LIMIT', 'OFFSET', 'NOW', 'CURRENT_DATE', 'AUTO_INCREMENT'],
  mssql: [
    'TOP', 'OFFSET', 'FETCH NEXT', 'ROWS ONLY', 'IDENTITY', 'NVARCHAR', 'VARCHAR',
    'UNIQUEIDENTIFIER', 'GETDATE', 'GETUTCDATE', 'SYSDATETIME', 'NEWID', 'ISNULL',
    'OUTPUT', 'WITH (NOLOCK)', 'MERGE', 'PIVOT', 'UNPIVOT', 'TRY_CAST', 'TRY_CONVERT'
  ]
}

let registered = false

/**
 * Register a SQL completion provider: static keywords plus schema-aware table
 * and column names pulled live from the active connection's introspected schema.
 */
export function registerSqlCompletion(monaco: Monaco): void {
  if (registered) return
  registered = true

  monaco.languages.registerCompletionItemProvider('sql', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range: languages.CompletionItem['range'] = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      const activeId = useConnectionStore.getState().activeConnectionId
      const activeEngine = activeId
        ? useConnectionStore
            .getState()
            .connections.find((c) => c.id === activeId)?.engine
        : undefined
      const keywordSet = new Set<string>(COMMON_KEYWORDS)
      if (activeEngine) {
        for (const keyword of ENGINE_KEYWORDS[activeEngine]) keywordSet.add(keyword)
      }

      const suggestions: languages.CompletionItem[] = [...keywordSet].map((keyword) => ({
        label: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: keyword,
        range
      }))

      const snapshot = activeId
        ? useExplorerStore.getState().snapshots[activeId]
        : undefined

      if (snapshot) {
        const seenColumns = new Set<string>()
        for (const relation of snapshot.relations) {
          suggestions.push({
            label: relation.name,
            detail: `${relation.kind} · ${relation.schema}`,
            kind: monaco.languages.CompletionItemKind.Struct,
            insertText: relation.name,
            range
          })
          for (const column of relation.columns) {
            if (seenColumns.has(column.name)) continue
            seenColumns.add(column.name)
            suggestions.push({
              label: column.name,
              detail: `${column.dataType} · column`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: column.name,
              range
            })
          }
        }
      }

      return { suggestions }
    }
  })
}
