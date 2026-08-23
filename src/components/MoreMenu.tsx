import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'

export interface MoreMenuItem {
  label: string
  onSelect: () => void
  /** 되돌릴 수 없는 것. 빨갛게 띄운다. */
  danger?: boolean
}

/**
 * 점 세 개 메뉴.
 *
 * 자주 쓰지 않는 단추를 화면에 늘어놓으면 정작 읽어야 할 숫자와 자리를 다툰다.
 * 여기에 접어 두고 필요할 때만 편다. 바깥을 누르거나 Esc 로 닫힌다.
 */
export function MoreMenu({
  items,
  label,
}: {
  items: MoreMenuItem[]
  label: string
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      // 화면 전체가 Esc 를 들을 수 있다. 여기서 멈춰야 메뉴만 닫힌다.
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-[26px] w-[26px] items-center justify-center rounded-ctl border text-[15px] leading-none transition-colors',
          open
            ? 'border-line-2 bg-hover text-text'
            : 'border-transparent text-text-3 hover:border-line-2 hover:bg-hover hover:text-text-2'
        )}
      >
        <span aria-hidden>⋯</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+5px)] z-20 flex w-[136px] flex-col rounded-card border border-line-2 bg-surface p-[4px] shadow-[var(--shadow-md)]"
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
              className={cn(
                'rounded-ctl px-[9px] py-[7px] text-left text-[13px] hover:bg-hover',
                item.danger ? 'text-imp-fg' : 'text-text-2'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
