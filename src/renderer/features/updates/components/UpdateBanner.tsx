import type { ReactNode } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { IconButton } from '@renderer/components/IconButton'
import { ipc } from '@renderer/services/ipc'
import { useUpdateStore } from '@renderer/features/updates/stores/updateStore'

/** Slim banner shown below the title bar while an update downloads / is ready. */
export function UpdateBanner(): ReactNode {
  const status = useUpdateStore((s) => s.status)
  const version = useUpdateStore((s) => s.version)
  const percent = useUpdateStore((s) => s.percent)
  const dismissed = useUpdateStore((s) => s.dismissed)
  const dismiss = useUpdateStore((s) => s.dismiss)

  if (status === 'idle' || dismissed) return null

  if (status === 'downloading') {
    return (
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 text-[11px] text-muted">
        <RefreshCw className="h-3 w-3 animate-spin text-accent" />
        Downloading NovexDB {version}… {percent}%
      </div>
    )
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-3">
      <Download className="h-3.5 w-3.5 shrink-0 text-accent" />
      <span className="text-xs text-content">
        NovexDB {version} is ready — restart to install it.
      </span>
      <span className="flex-1" />
      <Button size="sm" variant="primary" onClick={() => void ipc.update.install()}>
        Restart now
      </Button>
      <IconButton label="Dismiss" className="h-6 w-6" onClick={dismiss}>
        <X className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )
}
