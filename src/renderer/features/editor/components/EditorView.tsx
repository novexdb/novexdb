import type { ReactNode } from 'react'
import { EditorToolbar } from '@renderer/features/editor/components/EditorToolbar'
import { SqlEditor } from '@renderer/features/editor/components/SqlEditor'

/** The main workspace surface: editor toolbar above the Monaco SQL editor. */
export function EditorView(): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorToolbar />
      <div className="min-h-0 flex-1">
        <SqlEditor />
      </div>
    </div>
  )
}
