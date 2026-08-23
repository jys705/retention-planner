import { addDays, diffDays, type DateOnly } from '../../lib/date'
import { cn } from '../../lib/cn'
import { monthDay } from '../../lib/format'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/** 달 단위 히트맵. 셀 농도가 그날 복습 수다. */
export function CalendarHeatmap({
  month,
  counts,
  cap,
  selected,
  onSelect,
  onHover,
}: {
  /** 그 달의 아무 날짜나. 1일로 맞춰서 쓴다. */
  month: DateOnly
  counts: Readonly<Record<DateOnly, number>>
  cap?: number | null
  selected?: DateOnly | null
  onSelect?: (date: DateOnly) => void
  onHover?: (date: DateOnly | null) => void
}) {
  const first = `${month.slice(0, 8)}01`
  const firstWeekday = new Date(`${first}T00:00:00Z`).getUTCDay()
  const daysInMonth = diffDays(
    first,
    addDays(`${nextMonth(month)}-01`, 0)
  )

  const cells: (DateOnly | null)[] = Array.from(
    { length: firstWeekday },
    () => null
  )
  for (let i = 0; i < daysInMonth; i += 1) cells.push(addDays(first, i))

  const peak = Math.max(1, ...Object.values(counts))

  return (
    <div className="flex flex-col gap-[6px]">
      <div className="grid grid-cols-7 gap-[3px] text-center text-[10.5px] text-text-3">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((date, index) => {
          if (date === null) return <span key={`pad-${index}`} />
          const count = counts[date] ?? 0
          const over = cap !== null && cap !== undefined && count > cap
          const intensity = count === 0 ? 0 : 0.18 + 0.82 * (count / peak)
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect?.(date)}
              onMouseEnter={() => onHover?.(date)}
              onMouseLeave={() => onHover?.(null)}
              title={`${monthDay(date)} ${count}개`}
              className={cn(
                'num aspect-square rounded-[5px] border text-[10px] transition-colors',
                selected === date ? 'border-accent-2' : 'border-transparent',
                over && 'ring-1 ring-imp-fg'
              )}
              style={{
                background:
                  count === 0
                    ? 'var(--rail)'
                    : `color-mix(in oklab, var(--accent) ${Math.round(
                        intensity * 100
                      )}%, var(--surface))`,
                color: intensity > 0.55 ? 'var(--surface)' : 'var(--text-3)',
              }}
            >
              {Number(date.slice(8, 10))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 색이 무엇을 뜻하는지.
 *
 * 달마다 붙이면 두 달을 나란히 놓았을 때 같은 범례가 두 번 선다.
 * 격자 밖에서 한 번만 그린다.
 */
export function CalendarLegend({ cap }: { cap?: number | null }) {
  return (
    <div className="flex items-center gap-2 text-[10.5px] text-text-3">
        <span>적음</span>
        <span className="h-[9px] w-[9px] rounded-[3px] bg-rail" />
        <span
          className="h-[9px] w-[9px] rounded-[3px]"
          style={{
            background: 'color-mix(in oklab, var(--accent) 45%, var(--surface))',
          }}
        />
        <span className="h-[9px] w-[9px] rounded-[3px] bg-accent" />
        <span>많음</span>
        {cap ? (
          <>
            <span className="ml-2 h-[9px] w-[9px] rounded-[3px] ring-1 ring-imp-fg" />
            <span>상한 초과</span>
          </>
        ) : null}
      </div>
  )
}

function nextMonth(month: DateOnly): string {
  const year = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return m === 12
    ? `${year + 1}-01`
    : `${year}-${String(m + 1).padStart(2, '0')}`
}
