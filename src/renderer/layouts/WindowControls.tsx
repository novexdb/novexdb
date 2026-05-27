import type { ReactNode } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { ipc } from '@renderer/services/ipc'

/** Custom minimize/maximize/close controls for Windows & Linux frameless windows. */
export function WindowControls(): ReactNode {
  const base =
    'no-drag flex h-9 w-11 items-center justify-center text-muted transition-colors'

  return (
    <div className="flex">
      <button
        type="button"
        aria-label="Minimize"
        className={`${base} hover:bg-app hover:text-content`}
        onClick={() => void ipc.window.minimize()}
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Maximize"
        className={`${base} hover:bg-app hover:text-content`}
        onClick={() => void ipc.window.maximize()}
      >
        <Square className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label="Close"
        className={`${base} hover:bg-danger hover:text-white`}
        onClick={() => void ipc.window.close()}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
