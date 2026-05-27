import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cn } from '@renderer/utils/cn'

interface ResizeHandleProps {
  /** `vertical` = a vertical bar dragged horizontally (resizes width). */
  orientation: 'vertical' | 'horizontal'
  onResize: (deltaPx: number) => void
  onResizeEnd?: () => void
  className?: string
}

/** A thin draggable divider for resizing adjacent panels. */
export function ResizeHandle({
  orientation,
  onResize,
  onResizeEnd,
  className
}: ResizeHandleProps): ReactNode {
  // Refs keep the active drag listeners pointed at the latest callbacks.
  const onResizeRef = useRef(onResize)
  const onResizeEndRef = useRef(onResizeEnd)
  onResizeRef.current = onResize
  onResizeEndRef.current = onResizeEnd

  const isVertical = orientation === 'vertical'

  const handlePointerDown = (event: ReactPointerEvent): void => {
    event.preventDefault()
    let last = isVertical ? event.clientX : event.clientY

    const handleMove = (moveEvent: PointerEvent): void => {
      const current = isVertical ? moveEvent.clientX : moveEvent.clientY
      onResizeRef.current(current - last)
      last = current
    }

    const handleUp = (): void => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onResizeEndRef.current?.()
    }

    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return (
    <div
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      onPointerDown={handlePointerDown}
      className={cn(
        'shrink-0 bg-transparent transition-colors hover:bg-accent/40',
        isVertical ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
        className
      )}
    />
  )
}
