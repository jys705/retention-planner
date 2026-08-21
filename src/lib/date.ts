/**
 * 이 앱의 시간 단위는 하루다. 시각은 어디에도 저장하지 않고 `YYYY-MM-DD` 문자열만 쓴다.
 * 문자열을 쓰면 시간대가 바뀌어도 날짜가 하루 밀리지 않고, 사전순 비교가 곧 시간순 비교가 된다.
 */
export type DateOnly = string

const DAY_MS = 86_400_000

export function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toEpochDay(value))
}

/** `YYYY-MM-DD` 를 1970-01-01 기준 일수로. 정수 산술만 하면 되도록 만든다. */
export function toEpochDay(date: DateOnly): number {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  const d = Number(date.slice(8, 10))
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)
}

export function fromEpochDay(day: number): DateOnly {
  const t = new Date(day * DAY_MS)
  const y = String(t.getUTCFullYear()).padStart(4, '0')
  const m = String(t.getUTCMonth() + 1).padStart(2, '0')
  const d = String(t.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date: DateOnly, days: number): DateOnly {
  return fromEpochDay(toEpochDay(date) + Math.round(days))
}

/** `to - from` 을 일수로. 음수가 나올 수 있다. */
export function diffDays(from: DateOnly, to: DateOnly): number {
  return toEpochDay(to) - toEpochDay(from)
}

export function minDate(a: DateOnly, b: DateOnly): DateOnly {
  return a <= b ? a : b
}

export function maxDate(a: DateOnly, b: DateOnly): DateOnly {
  return a >= b ? a : b
}

/** 로컬 자정 기준의 오늘. core 바깥에서만 부른다. */
export function todayLocal(now: Date = new Date()): DateOnly {
  const y = String(now.getFullYear()).padStart(4, '0')
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
