import { ipc } from '@renderer/services/ipc'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useResultStore } from '@renderer/features/results/stores/resultStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { useAiStore } from '@renderer/features/ai/stores/aiStore'
import type { AiMessage } from '@renderer/features/ai/types'
import type { AiChatMessage } from '@shared/types/ai'
import type { IpcResult } from '@shared/types/ipc'

const MAX_HISTORY = 24

function openAiPanel(): void {
  useUiStore.getState().setResultPanelCollapsed(false)
  useResultStore.getState().setPanelTab('ai')
}

function addUserMessage(text: string): void {
  useAiStore.getState().addMessage({
    id: crypto.randomUUID(),
    role: 'user',
    kind: 'user',
    text,
    createdAt: Date.now()
  })
}

function addPending(label: string): string {
  const id = crypto.randomUUID()
  useAiStore.getState().addMessage({
    id,
    role: 'assistant',
    kind: 'pending',
    label,
    createdAt: Date.now()
  })
  return id
}

function addFailure(error: string): void {
  useAiStore.getState().addMessage({
    id: crypto.randomUUID(),
    role: 'assistant',
    kind: 'failed',
    error,
    createdAt: Date.now()
  })
}

function requireConnectionId(): string | null {
  const connectionId = useConnectionStore.getState().activeConnectionId
  if (!connectionId) {
    openAiPanel()
    addFailure('Connect to a database first — AI features use its schema for context.')
    return null
  }
  return connectionId
}

/** Shared flow for the structured (request/response) features. */
async function runStructured<T>(
  userText: string,
  pendingLabel: string,
  call: (connectionId: string) => Promise<IpcResult<T>>,
  toMessage: (data: T) => Extract<AiMessage, { role: 'assistant' }>
): Promise<void> {
  const connectionId = requireConnectionId()
  if (!connectionId) return
  openAiPanel()
  addUserMessage(userText)
  const pendingId = addPending(pendingLabel)
  const result = await call(connectionId)
  useAiStore.getState().updateMessage(pendingId, (message) => {
    const base = { id: message.id, createdAt: message.createdAt }
    if (result.ok) return { ...base, ...toMessage(result.data) }
    return { ...base, role: 'assistant', kind: 'failed', error: result.error.message }
  })
}

export function generateSql(prompt: string): Promise<void> {
  return runStructured(
    prompt,
    'Generating SQL…',
    (connectionId) => ipc.ai.nl2sql({ connectionId, prompt }),
    (result) => ({ id: '', createdAt: 0, role: 'assistant', kind: 'nl2sql', result })
  )
}

export function explainSql(sql: string): Promise<void> {
  return runStructured(
    'Explain the current query.',
    'Explaining query…',
    (connectionId) => ipc.ai.explain({ connectionId, sql }),
    (result) => ({ id: '', createdAt: 0, role: 'assistant', kind: 'explain', result })
  )
}

export function optimizeSql(sql: string): Promise<void> {
  return runStructured(
    'Optimize the current query.',
    'Analyzing performance…',
    (connectionId) => ipc.ai.optimize({ connectionId, sql }),
    (result) => ({ id: '', createdAt: 0, role: 'assistant', kind: 'optimize', result })
  )
}

export function explainQueryError(sql: string, errorMessage: string): Promise<void> {
  return runStructured(
    'Explain the query error.',
    'Explaining error…',
    (connectionId) => ipc.ai.explainError({ connectionId, sql, errorMessage }),
    (result) => ({ id: '', createdAt: 0, role: 'assistant', kind: 'errorExplain', result })
  )
}

export function analyzeDatabase(): Promise<void> {
  return runStructured(
    'Analyze my database.',
    'Analyzing database…',
    (connectionId) => ipc.ai.analyze({ connectionId }),
    (result) => ({ id: '', createdAt: 0, role: 'assistant', kind: 'analysis', result })
  )
}

function buildHistory(): AiChatMessage[] {
  const history: AiChatMessage[] = []
  for (const message of useAiStore.getState().messages) {
    if (message.kind === 'user') {
      history.push({ role: 'user', content: message.text })
    } else if (message.kind === 'chat' && message.text.trim()) {
      history.push({ role: 'assistant', content: message.text })
    }
  }
  return history.slice(-MAX_HISTORY)
}

/** Send a schema-aware chat message; the answer streams in token by token. */
export function sendChat(text: string): void {
  const connectionId = requireConnectionId()
  if (!connectionId) return
  openAiPanel()
  addUserMessage(text)

  const history = buildHistory()
  const assistantId = crypto.randomUUID()
  useAiStore.getState().addMessage({
    id: assistantId,
    role: 'assistant',
    kind: 'chat',
    text: '',
    streaming: true,
    createdAt: Date.now()
  })

  const cancel = ipc.ai.streamChat(
    { connectionId, messages: history },
    {
      onChunk: (delta) =>
        useAiStore.getState().updateMessage(assistantId, (message) =>
          message.kind === 'chat' ? { ...message, text: message.text + delta } : message
        ),
      onDone: () => {
        useAiStore.getState().updateMessage(assistantId, (message) =>
          message.kind === 'chat' ? { ...message, streaming: false } : message
        )
        useAiStore.getState().setChatCancel(null)
      },
      onError: (error) => {
        useAiStore.getState().updateMessage(assistantId, (message) => {
          if (message.kind !== 'chat') return message
          if (message.text) return { ...message, streaming: false }
          return {
            id: message.id,
            createdAt: message.createdAt,
            role: 'assistant',
            kind: 'failed',
            error
          }
        })
        useAiStore.getState().setChatCancel(null)
      }
    }
  )
  useAiStore.getState().setChatCancel(cancel)
}

/** Stop the streaming chat and finalize the partial answer. */
export function cancelChat(): void {
  const { chatCancel, messages } = useAiStore.getState()
  if (!chatCancel) return
  chatCancel()
  useAiStore.getState().setChatCancel(null)
  const streaming = messages.find((m) => m.kind === 'chat' && m.streaming)
  if (streaming) {
    useAiStore.getState().updateMessage(streaming.id, (message) =>
      message.kind === 'chat' ? { ...message, streaming: false } : message
    )
  }
}
