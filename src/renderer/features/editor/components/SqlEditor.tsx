import type { ReactNode } from 'react'
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react'
import '@renderer/features/editor/monaco/setup'
import {
  defineEditorThemes,
  EDITOR_THEME_DARK,
  EDITOR_THEME_LIGHT
} from '@renderer/features/editor/monaco/themes'
import { registerSqlCompletion } from '@renderer/features/editor/monaco/completion'
import { activeEditor } from '@renderer/features/editor/monaco/activeEditor'
import { formatActiveTab } from '@renderer/features/editor/utils/format'
import { runActiveQuery } from '@renderer/features/results/runner'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useUiStore } from '@renderer/stores/uiStore'

function handleBeforeMount(monaco: Monaco): void {
  defineEditorThemes(monaco)
  registerSqlCompletion(monaco)
}

const handleMount: OnMount = (editor, monaco) => {
  activeEditor.set(editor)
  editor.addAction({
    id: 'novexdb.format-sql',
    label: 'Format SQL',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
    run: () => formatActiveTab()
  })
  editor.addAction({
    id: 'novexdb.run-query',
    label: 'Run Query',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    run: () => runActiveQuery()
  })
}

/** The Monaco-backed SQL editor for the active query tab. */
export function SqlEditor(): ReactNode {
  const tab = useEditorStore((s) => {
    const found = s.tabs.find((t) => t.id === s.activeTabId)
    return found && found.kind === 'query' ? found : null
  })
  const updateTabSql = useEditorStore((s) => s.updateTabSql)
  const fontSize = useSettingsStore((s) => s.settings.fontSize)
  const theme = useUiStore((s) => s.resolvedTheme)

  if (!tab) return null

  return (
    <Editor
      path={tab.id}
      language="sql"
      theme={theme === 'dark' ? EDITOR_THEME_DARK : EDITOR_THEME_LIGHT}
      value={tab.sql}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={(value) => updateTabSql(tab.id, value ?? '')}
      loading={
        <div className="flex h-full items-center justify-center text-xs text-subtle">
          Loading editor…
        </div>
      }
      options={{
        fontSize,
        fontFamily: "'SF Mono', 'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 10, bottom: 10 },
        lineNumbersMinChars: 3,
        renderLineHighlight: 'line',
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        tabSize: 2,
        wordWrap: 'off',
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }
      }}
    />
  )
}
