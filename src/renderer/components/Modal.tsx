import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@renderer/utils/cn'
import { IconButton } from '@renderer/components/IconButton'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  footer?: ReactNode
  width?: number
  children: ReactNode
}

/** A centered, portalled dialog. Closes on Escape or backdrop click. */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  width = 460,
  children
}: ModalProps): ReactNode {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className={cn(
          'flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-xl',
          'border border-line bg-elevated shadow-2xl'
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-content">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-1.5">
            <X className="h-4 w-4" />
          </IconButton>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  )
}
