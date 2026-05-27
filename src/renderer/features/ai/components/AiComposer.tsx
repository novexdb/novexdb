import { useState, type ComponentType, type ReactNode } from 'react'
import { type LucideProps, MessageSquare, Send, Sparkles, Square } from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { Button } from '@renderer/components/Button'
import { useAiStore } from '@renderer/features/ai/stores/aiStore'
import { isAiBusy } from '@renderer/features/ai/types'
import { cancelChat, generateSql, sendChat } from '@renderer/features/ai/runner'

type ComposerMode = 'chat' | 'sql'

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: ComponentType<LucideProps>
  label: string
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
        active ? 'bg-accent-soft text-accent' : 'text-subtle hover:text-content'
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )
}

/** Input row for the AI tab — chat mode or NL→SQL mode. */
export function AiComposer(): ReactNode {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<ComposerMode>('chat')
  const busy = useAiStore((s) => isAiBusy(s.messages))
  const streaming = useAiStore((s) => s.chatCancel !== null)

  const submit = (): void => {
    const value = text.trim()
    if (!value || busy) return
    setText('')
    if (mode === 'sql') void generateSql(value)
    else sendChat(value)
  }

  return (
    <div className="shrink-0 border-t border-line p-2">
      <div className="mb-1.5 flex gap-1">
        <ModeButton
          active={mode === 'chat'}
          onClick={() => setMode('chat')}
          icon={MessageSquare}
          label="Chat"
        />
        <ModeButton
          active={mode === 'sql'}
          onClick={() => setMode('sql')}
          icon={Sparkles}
          label="Generate SQL"
        />
      </div>
      <div className="flex items-end gap-1.5">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          rows={2}
          placeholder={
            mode === 'sql' ? 'Describe the query you need…' : 'Ask anything about your database…'
          }
          className="max-h-32 min-h-[40px] flex-1 resize-none select-text rounded-md border border-line bg-app px-2.5 py-1.5 text-[13px] text-content placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        {streaming ? (
          <Button variant="danger" onClick={() => cancelChat()}>
            <Square className="h-3 w-3" />
            Stop
          </Button>
        ) : (
          <Button variant="primary" disabled={!text.trim() || busy} onClick={submit}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
