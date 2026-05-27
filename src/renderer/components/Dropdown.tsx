import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@renderer/utils/cn'

export interface DropdownItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
}

interface DropdownProps {
  trigger: ReactNode
  items: DropdownItem[]
  align?: 'left' | 'right'
}

/** A minimal menu: a trigger that toggles a list, closing on outside click or Escape. */
export function Dropdown({ trigger, items, align = 'right' }: DropdownProps): ReactNode {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((value) => !value)}>{trigger}</div>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 mt-1 min-w-[168px] overflow-hidden rounded-md border border-line',
            'bg-elevated py-1 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-content hover:bg-surface"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
