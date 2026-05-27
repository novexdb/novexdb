import type { ReactNode } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Markdown } from '@renderer/components/Markdown'
import {
  AnalysisCard,
  ErrorCard,
  ExplainCard,
  Nl2SqlCard,
  OptimizeCard
} from '@renderer/features/ai/components/AiCards'
import type { AiMessage as AiMessageModel } from '@renderer/features/ai/types'

/** Renders one conversation message, dispatching on its kind. */
export function AiMessage({ message }: { message: AiMessageModel }): ReactNode {
  switch (message.kind) {
    case 'user':
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-accent px-3 py-1.5 text-[13px] text-white">
            {message.text}
          </div>
        </div>
      )

    case 'pending':
      return (
        <div className="flex items-center gap-2 text-xs text-subtle">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {message.label}
        </div>
      )

    case 'failed':
      return (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2">
          <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger" />
          <span className="text-[12px] text-danger">{message.error}</span>
        </div>
      )

    case 'chat':
      if (!message.text) {
        return (
          <div className="flex items-center gap-2 text-xs text-subtle">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </div>
        )
      }
      return (
        <div>
          <Markdown content={message.text} />
          {message.streaming && (
            <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-accent align-middle" />
          )}
        </div>
      )

    case 'nl2sql':
      return <Nl2SqlCard result={message.result} />
    case 'explain':
      return <ExplainCard result={message.result} />
    case 'optimize':
      return <OptimizeCard result={message.result} />
    case 'errorExplain':
      return <ErrorCard result={message.result} />
    case 'analysis':
      return <AnalysisCard result={message.result} />
  }
}
