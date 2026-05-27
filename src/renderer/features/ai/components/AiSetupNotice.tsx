import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { useUiStore } from '@renderer/stores/uiStore'

/** Shown in the AI tab until an API key is configured. */
export function AiSetupNotice(): ReactNode {
  const openSettings = useUiStore((s) => s.openSettings)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Sparkles className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-content">Set up your AI copilot</p>
        <p className="max-w-sm text-xs text-muted">
          Add an Anthropic API key to enable natural-language SQL, query explanation,
          optimization, error fixes and schema-aware chat.
        </p>
      </div>
      <Button variant="primary" onClick={openSettings}>
        Open AI Settings
      </Button>
    </div>
  )
}
