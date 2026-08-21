import type { DateOnly } from '../../lib/date'

/** 그 달의 1일. 히트맵을 달 단위로 묶을 때 쓴다. */
export function monthKey(date: DateOnly): DateOnly {
  return `${date.slice(0, 8)}01`
}

export function monthLabel(month: DateOnly): string {
  return `${Number(month.slice(5, 7))}월`
}
