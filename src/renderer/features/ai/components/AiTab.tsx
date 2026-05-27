import { useEffect, useRef, type ReactNode } from 'react'
import { Database, Sparkles } from 'lucide-react'
import { useAiStore } from '@renderer/features/ai/stores/aiStore'
import { AiMessage } from '@renderer/features/ai/components/AiMessage'
import { AiComposer } from '@renderer/features/ai/components/AiComposer'
import { AiSetupNotice } from '@renderer/features/ai/components/AiSetupNotice'
import { analyzeDatabase } from '@renderer/features/ai/runner'

function EmptyConversation(): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <Sparkles className="h-6 w-6 text-subtle" />
      <p className="text-xs text-muted">Ask about your schema, generate SQL, or explain a query.</p>
      <p className="text-[11px] text-subtle">
        Use the toolbar above the editor to explain or optimize the current query.
      </p>
    </div>
  )
}

/** The AI copilot — bottom-panel tab hosting the schema-aware conversation. */
export function AiTab(): ReactNode {
  const messages = useAiStore((s) => s.messages)
  const status = useAiStore((s) => s.status)
  const loadStatus = useAiStore((s) => s.loadStatus)
  const clear = useAiStore((s) => s.clear)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  if (status && !status.configured) {
    return <AiSetupNotice />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="text-[11px] text-subtle">
          {status ? `AI · ${status.model}` : 'AI'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void analyzeDatabase()}
            className="flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
          >
            <Database className="h-3 w-3" />
            Analyze Database
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="text-[11px] font-medium text-muted hover:text-danger"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <EmptyConversation />
        ) : (
          messages.map((message) => <AiMessage key={message.id} message={message} />)
        )}
      </div>

      <AiComposer />
    </div>
  )
}
