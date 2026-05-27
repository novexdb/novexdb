import type { Monaco } from '@monaco-editor/react'

export const EDITOR_THEME_DARK = 'novexdb-dark'
export const EDITOR_THEME_LIGHT = 'novexdb-light'

let defined = false

/** Register Monaco themes whose backgrounds match the NovexDB design tokens. */
export function defineEditorThemes(monaco: Monaco): void {
  if (defined) return
  defined = true

  monaco.editor.defineTheme(EDITOR_THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#e6edf3',
      'editorGutter.background': '#0d1117',
      'editorLineNumber.foreground': '#6e7681',
      'editorLineNumber.activeForeground': '#8b949e',
      'editor.lineHighlightBackground': '#161b22',
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': '#4f8cff',
      'editorWidget.background': '#161b22',
      'editorWidget.border': '#2a3038',
      'editorSuggestWidget.background': '#161b22',
      'editorSuggestWidget.border': '#2a3038',
      'input.background': '#0d1117'
    }
  })

  monaco.editor.defineTheme(EDITOR_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1f2328',
      'editorGutter.background': '#ffffff',
      'editorLineNumber.foreground': '#8c959f',
      'editor.lineHighlightBackground': '#f6f8fa',
      'editor.lineHighlightBorder': '#00000000'
    }
  })
}
