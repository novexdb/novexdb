import { ipc } from '@renderer/services/ipc'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useEditorStore } from '@renderer/features/editor/stores/editorStore'
import { activeEditor } from '@renderer/features/editor/monaco/activeEditor'
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

/** Run the editor's current selection, or the whole active tab when nothing is selected. */
export function runActiveQuery(): void {
  let sql = ''

  const editor = activeEditor.get()
  if (editor) {
    const selection = editor.getSelection()
    const model = editor.getModel()
    if (selection && model && !selection.isEmpty()) {
      sql = model.getValueInRange(selection)
    }
  }

  if (!sql.trim()) {
    const { tabs, activeTabId } = useEditorStore.getState()
    const tab = tabs.find((t) => t.id === activeTabId)
    sql = tab?.kind === 'query' ? tab.sql : ''
  }

  void runSql(sql)
}

/** Request cancellation of the query currently running. */
export async function cancelActiveQuery(): Promise<void> {
  const { runningQueryId } = useResultStore.getState()
  const connectionId = useConnectionStore.getState().activeConnectionId
  if (!runningQueryId || !connectionId) return
  await ipc.query.cancel({ connectionId, queryId: runningQueryId })
}
