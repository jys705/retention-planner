import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'

export interface SelectOption {
  value: string | null
  label: string
  /** 앞에 찍을 점 색. 목표처럼 색을 가진 것에만 준다. */
  dot?: string | undefined
  /** 줄 아래 작게 붙는 말. */
  note?: string | undefined
}

/**
 * 한 줄짜리 고르기 칸.
 *
 * 고를 것이 서넛을 넘으면 칩을 늘어놓는 방식은 줄이 접히면서 아래 칸을 밀어낸다.
 * 접어 두면 늘 같은 높이를 쓰고, 지금 고른 것 하나만 또렷하게 남는다.
 */
export function SelectField({
  value,
  options,
  onChange,
  label,
}: {
  value: string | null
  options: SelectOption[]
  onChange: (value: string | null) => void
  /** 화면 낭독기와 시험이 이 칸을 부르는 이름. */
  label: string
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      // 화면 전체가 Esc 를 들을 수 있다. 여기서 멈춰야 이 칸만 닫힌다.
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
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-[8px] rounded-ctl border bg-surface px-[12px] py-[9px] text-left text-[13px] transition-colors',
          open ? 'border-accent' : 'border-line-2 hover:bg-hover'
        )}
      >
        {current?.dot ? (
          <span
            aria-hidden
            className="h-[6px] w-[6px] flex-none rounded-full"
            style={{ background: current.dot }}
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-text">
          {current?.label ?? ''}
        </span>
        <span aria-hidden className="flex-none text-[10px] text-text-3">
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 top-[calc(100%+5px)] z-20 flex max-h-[264px] flex-col overflow-y-auto rounded-card border border-line-2 bg-surface p-[4px] shadow-[var(--shadow-md)]"
        >
          {options.map((option) => (
            <button
              key={option.value ?? '__none__'}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                setOpen(false)
                onChange(option.value)
              }}
              className={cn(
                'flex items-center gap-[8px] rounded-ctl px-[9px] py-[7px] text-left text-[13px]',
                option.value === value
                  ? 'bg-accent-soft font-semibold text-accent'
                  : 'text-text-2 hover:bg-hover'
              )}
            >
              {option.dot ? (
                <span
                  aria-hidden
                  className="h-[6px] w-[6px] flex-none rounded-full"
                  style={{ background: option.dot }}
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.note ? (
                <span className="num flex-none text-[11.5px] text-text-3">
                  {option.note}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
