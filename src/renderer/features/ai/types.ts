import type {
  AnalysisResult,
  ErrorExplainResult,
  ExplainResult,
  Nl2SqlResult,
  OptimizeResult
} from '@shared/types/ai'

interface BaseMessage {
  id: string
  createdAt: number
}

/**
 * A message in the AI conversation. Every AI feature posts a typed message;
 * the renderer dispatches on `kind` to the matching card.
 */
export type AiMessage =
  | (BaseMessage & { role: 'user'; kind: 'user'; text: string })
  | (BaseMessage & { role: 'assistant'; kind: 'chat'; text: string; streaming: boolean })
  | (BaseMessage & { role: 'assistant'; kind: 'pending'; label: string })
  | (BaseMessage & { role: 'assistant'; kind: 'nl2sql'; result: Nl2SqlResult })
  | (BaseMessage & { role: 'assistant'; kind: 'explain'; result: ExplainResult })
  | (BaseMessage & { role: 'assistant'; kind: 'optimize'; result: OptimizeResult })
  | (BaseMessage & { role: 'assistant'; kind: 'errorExplain'; result: ErrorExplainResult })
  | (BaseMessage & { role: 'assistant'; kind: 'analysis'; result: AnalysisResult })
  | (BaseMessage & { role: 'assistant'; kind: 'failed'; error: string })

/** True while any AI request (structured or streaming) is in progress. */
export function isAiBusy(messages: AiMessage[]): boolean {
  return messages.some(
    (m) => m.kind === 'pending' || (m.kind === 'chat' && m.streaming)
  )
}
