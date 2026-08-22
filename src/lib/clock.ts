import { toDateOnly, type DateOnly } from './date'

/**
 * 앱이 보는 현재 시각.
 *
 * 화면과 저장 계층은 시계를 직접 읽지 않고 여기를 거친다. 그래야 시험에서
 * 오늘을 임의의 날짜로 고정해 놓고 사람이 하는 동작을 그대로 재현할 수 있다.
 * 계산 자체는 이미 순수해서 시각을 인자로 받는다. 여기는 그 인자를 만드는 자리다.
 */
let frozenToday: DateOnly | null = null
let frozenInstant: string | null = null
let frozenMinutes: number | null = null

/** 로컬 자정 기준의 오늘. */
export function today(): DateOnly {
  return frozenToday ?? toDateOnly(new Date())
}

/** 기록한 시각. 감사용이라 날짜보다 정밀하다. */
export function nowIso(): string {
  return frozenInstant ?? new Date().toISOString()
}

/** 자정부터 지금까지의 분. 알림 시각을 지났는지 볼 때 쓴다. */
export function nowMinutes(): number {
  if (frozenMinutes !== null) return frozenMinutes
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

/**
 * 오늘을 고정한다. 시험에서만 쓴다.
 * 시각도 같이 고정해서 기록 순서가 흔들리지 않게 한다.
 */
export function freezeToday(date: DateOnly, minutesOfDay = 0): void {
  frozenToday = date
  frozenMinutes = minutesOfDay
  const hh = String(Math.floor(minutesOfDay / 60)).padStart(2, '0')
  const mm = String(minutesOfDay % 60).padStart(2, '0')
  frozenInstant = `${date}T${hh}:${mm}:00.000Z`
}

export function unfreezeToday(): void {
  frozenToday = null
  frozenInstant = null
  frozenMinutes = null
}
