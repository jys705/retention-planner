import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import type { DateOnly } from '../lib/date'
import { MiniCalendar } from './MiniCalendar'

export interface DateFieldProps {
  value: DateOnly
  today: DateOnly
  min?: DateOnly | null | undefined
  max?: DateOnly | null | undefined
  onChange: (date: DateOnly) => void
  /** 단추에 적히는 말. 아직 안 골랐으면 날짜 대신 이게 보인다. */
  text: string
  /** 화면 낭독기와 시험이 이 단추를 부르는 이름. */
  label: string
  /** 골라 둔 상태로 강조할지. */
  active?: boolean
}

/**
 * 날짜 한 칸.
 *
 * 브라우저가 주는 달력은 앱과 서체도 색도 모서리도 다르다. 그래서 쓰지 않고
 * 예보 화면과 같은 격자를 팝오버로 띄운다. 바깥을 누르거나 Esc 로 닫힌다.
 */
export function DateField({
  value,
  today,
  min,
  max,
  onChange,
  text,
  label,
  active = false,
}: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 화면 아래쪽에서 열면 달력이 접힌 자리 밖으로 나간다. 열자마자 보이는 데까지 끌어올린다.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (typeof panel?.scrollIntoView === 'function') {
      panel.scrollIntoView({ block: 'nearest' })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      // 화면 전체가 Esc 를 듣고 있다. 여기서 멈추지 않으면 달력만 닫으려다
      // 펼쳐 둔 항목까지 같이 접힌다.
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
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex items-center gap-1 rounded-ctl border px-[10px] py-[6px] text-[13px] transition-colors',
          active
            ? 'border-accent bg-accent-soft font-semibold text-accent'
            : 'border-line-2 bg-surface text-text-2 hover:bg-hover'
        )}
      >
        <span className={cn(active && 'num')}>{text}</span>
        <span aria-hidden className="text-[10px]">
          ▾
        </span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          className="absolute left-0 top-[calc(100%+5px)] z-20 rounded-card border border-line-2 bg-surface p-[12px] shadow-[var(--shadow-md)]"
        >
          <MiniCalendar
            value={value}
            today={today}
            min={min}
            max={max}
            label={`${label} 달력`}
            onChange={(date) => {
              onChange(date)
              setOpen(false)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
