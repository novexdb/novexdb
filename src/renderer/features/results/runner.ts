import { ipc } from '@renderer/services/ipc'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import { activeEditor } from '@renderer/features/editor/monaco/activeEditor'
import { statementAtOffset } from '@renderer/features/editor/utils/statements'
import { useResultStore } from '@renderer/features/results/stores/resultStore'
import { useHistoryStore } from '@renderer/features/results/stores/historyStore'
import { useUiStore } from '@renderer/stores/uiStore'

/** Execute a SQL string against the active connection and store the outcome. */
export async function runSql(sql: string): Promise<void> {
  const trimmed = sql.trim()
  const resultStore = useResultStore.getState()
  if (resultStore.status === 'running') return

  useUiStore.getState().setResultPanelCollapsed(false)
  resultStore.setPanelTab('results')

  if (!trimmed) {
    resultStore.finishError('Nothing to run — the query is empty')
    return
  }

  const connectionId = useConnectionStore.getState().activeConnectionId
  if (!connectionId) {
    resultStore.finishError('Connect to a database before running a query')
    return
  }

  const queryId = crypto.randomUUID()
  resultStore.startRun(queryId, trimmed)

  const response = await ipc.query.execute({ connectionId, queryId, sql: trimmed })
  if (response.ok) useResultStore.getState().finishSuccess(response.data)
  else useResultStore.getState().finishError(response.error.message)

  // Refresh history if its tab happens to be open.
  void useHistoryStore.getState().load()
}

/**
 * Run what the user means: the current selection if there is one, otherwise the
 * single statement under the cursor. Falls back to the whole active tab only
 * when the live editor isn't available (e.g. it hasn't mounted yet).
 */
export function runActiveQuery(): void {
  const editor = activeEditor.get()
  const model = editor?.getModel()

  if (editor && model) {
    const selection = editor.getSelection()
    if (selection && !selection.isEmpty()) {
      void runSql(model.getValueInRange(selection))
      return
    }
    const position = editor.getPosition()
    if (position) {
      const statement = statementAtOffset(model.getValue(), model.getOffsetAt(position))
      if (statement) {
        void runSql(statement)
        return
      }
    }
  }

  const { tabs, activeTabId } = useEditorStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  void runSql(tab?.kind === 'query' ? tab.sql : '')
}

/** Request cancellation of the query currently running. */
export async function cancelActiveQuery(): Promise<void> {
  const { runningQueryId } = useResultStore.getState()
  const connectionId = useConnectionStore.getState().activeConnectionId
  if (!runningQueryId || !connectionId) return
  await ipc.query.cancel({ connectionId, queryId: runningQueryId })
}
