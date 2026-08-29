import type { DateOnly } from '../../lib/date'

/** 그 달의 1일. 히트맵을 달 단위로 묶을 때 쓴다. */
export function monthKey(date: DateOnly): DateOnly {
  return `${date.slice(0, 8)}01`
}

/**
 * 다음 달의 첫날.
 *
 * 날짜에 서른 날을 더해 찾으면 달을 건너뛴다. 8월 30일에 서른두 날을 더하면
 * 10월이 되어 9월이 통째로 빠진다. 달은 달로 세야 한다.
 */
export function nextMonthKey(date: DateOnly): DateOnly {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`
}

export function monthLabel(month: DateOnly): string {
  return `${Number(month.slice(5, 7))}월`
}
