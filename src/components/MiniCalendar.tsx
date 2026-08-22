import { useState } from 'react'
import { cn } from '../lib/cn'
import { toEpochDay, type DateOnly } from '../lib/date'
import { fullDate } from '../lib/format'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export interface MiniCalendarProps {
  /** 지금 고른 날. */
  value: DateOnly
  /** 오늘. 시계를 직접 읽지 않고 늘 받아 쓴다. */
  today: DateOnly
  /** 이 날보다 이르면 못 고른다. */
  min?: DateOnly | null | undefined
  /** 이 날보다 늦으면 못 고른다. */
  max?: DateOnly | null | undefined
  onChange: (date: DateOnly) => void
  /** 격자를 읽어 주는 이름. 화면마다 다르게 붙인다. */
  label: string
}

/**
 * 달력 한 달치.
 *
 * 예보 화면의 히트맵과 같은 격자를 쓴다. 칸 크기, 간격, 요일 머리글, 모서리가 같아서
 * 날짜를 고르는 자리와 날짜를 읽는 자리가 한 앱처럼 보인다.
 * 다른 점은 농도 대신 고른 날과 오늘만 칠한다는 것이다.
 */
export function MiniCalendar({
  value,
  today,
  min,
  max,
  onChange,
  label,
}: MiniCalendarProps) {
  const [month, setMonth] = useState(() => firstOfMonth(value))
  // 밖에서 값이 바뀌면 그 달로 따라간다. 어제 칩을 눌렀는데 달력이 지난달에 머물면 안 된다.
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setMonth(firstOfMonth(value))
  }

  const total = daysInMonth(month)
  const lead = weekdayIndex(month)
  const cells: (DateOnly | null)[] = Array.from({ length: lead }, () => null)
  for (let i = 0; i < total; i += 1) cells.push(dayOfMonth(month, i))

  // 앞뒤 달에 고를 수 있는 날이 하나도 없으면 화살표를 잠근다.
  const prevBlocked = min != null && lastOfMonth(shiftMonth(month, -1)) < min
  const nextBlocked = max != null && shiftMonth(month, 1) > max

  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-[236px] flex-col gap-[8px]"
    >
      <div className="flex items-center justify-between">
        <Arrow
          label="지난달"
          disabled={prevBlocked}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </Arrow>
        <span className="num text-[12.5px] font-medium text-text-2">
          {monthTitle(month)}
        </span>
        <Arrow
          label="다음달"
          disabled={nextBlocked}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </Arrow>
      </div>

      <div className="grid grid-cols-7 gap-[3px] text-center text-[10.5px] text-text-3">
        {WEEKDAY_LABELS.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((date, index) => {
          if (date === null) return <span key={`pad-${index}`} />
          const outOfRange =
            (min != null && date < min) || (max != null && date > max)
          const selected = date === value
          const isToday = date === today
          return (
            <button
              key={date}
              type="button"
              disabled={outOfRange}
              aria-current={selected ? 'date' : undefined}
              aria-label={fullDate(date)}
              title={fullDate(date)}
              onClick={() => onChange(date)}
              className={cn(
                'num aspect-square rounded-[5px] border text-[11px] transition-colors',
                outOfRange && 'cursor-not-allowed border-transparent text-text-3 opacity-35',
                !outOfRange && selected &&
                  'border-transparent bg-accent font-semibold text-surface',
                !outOfRange && !selected && isToday &&
                  'border-accent-2 bg-rail font-semibold text-accent',
                !outOfRange && !selected && !isToday &&
                  'border-transparent bg-rail text-text-2 hover:bg-hover'
              )}
            >
              {Number(date.slice(8, 10))}
            </button>
          )
        })}
      </div>

      <p className="text-[11px] text-text-3">
        고른 날: <span className="num text-text-2">{fullDate(value)}</span>
      </p>
    </div>
  )
}

function Arrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="rounded-ctl px-[7px] py-[2px] text-[13px] text-text-3 transition-colors hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/** 그 달의 1일. 달력은 늘 1일을 기준으로 격자를 만든다. */
function firstOfMonth(date: DateOnly): DateOnly {
  return `${date.slice(0, 8)}01`
}

function lastOfMonth(month: DateOnly): DateOnly {
  return dayOfMonth(month, daysInMonth(month) - 1)
}

function dayOfMonth(month: DateOnly, offset: number): DateOnly {
  return `${month.slice(0, 8)}${String(offset + 1).padStart(2, '0')}`
}

/** 달을 옮긴다. 연도 경계를 넘어도 맞게 돈다. */
function shiftMonth(month: DateOnly, step: number): DateOnly {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + step
  const year = Math.floor(total / 12)
  const index = ((total % 12) + 12) % 12
  return `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}-01`
}

function daysInMonth(month: DateOnly): number {
  return toEpochDay(shiftMonth(month, 1)) - toEpochDay(month)
}

/** 0 이 일요일. 1970-01-01 이 목요일이라 4 를 더해서 맞춘다. */
function weekdayIndex(date: DateOnly): number {
  return (((toEpochDay(date) + 4) % 7) + 7) % 7
}

function monthTitle(month: DateOnly): string {
  return `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`
}
