import { addDays, toEpochDay, type DateOnly } from '../../lib/date'

/**
 * 학습 지평. 언제까지 기억하고 싶은지를 세 가지로 받는다.
 *
 * 셋 다 안쪽에서는 구간 하나로 바뀐다. 정확한 날짜는 폭이 0 인 구간이고,
 * 무기한은 끝이 무한히 먼 구간이다. 그래서 계산 경로가 하나로 유지된다.
 */
export type Horizon =
  | { kind: 'open' }
  | { kind: 'date'; at: DateOnly }
  | { kind: 'window'; readyAt: DateOnly; holdUntil: DateOnly }

/** 무기한을 나타내는 값. 날짜 비교와 뺄셈이 그대로 통한다. */
export const NEVER = Number.POSITIVE_INFINITY

/**
 * 계산에 쓰는 형태. 두 끝을 1970-01-01 기준 일수로 들고 있는다.
 *
 * `readyAt` 은 준비 완료 마감선이다. 이 날에는 이미 준비돼 있어야 한다.
 * `holdUntil` 은 유지 마감선이다. 두 날 사이에는 기억률을 목표치 위로 붙잡아 둔다.
 */
export interface ResolvedHorizon {
  readyAt: number
  holdUntil: number
}

export function resolveHorizon(horizon: Horizon): ResolvedHorizon {
  switch (horizon.kind) {
    case 'open':
      return { readyAt: NEVER, holdUntil: NEVER }
    case 'date': {
      const at = toEpochDay(horizon.at)
      return { readyAt: at, holdUntil: at }
    }
    case 'window':
      return {
        readyAt: toEpochDay(horizon.readyAt),
        holdUntil: toEpochDay(horizon.holdUntil),
      }
  }
}

export function isOpen(horizon: ResolvedHorizon): boolean {
  return !Number.isFinite(horizon.readyAt)
}

/** 기본 여유 폭. 중심까지 거리의 25% 만큼 앞뒤로 벌린다. */
export const DEFAULT_UNCERTAINTY = 0.25

/**
 * "두 달쯤 뒤" 같은 상대 표현을 구간으로 바꾼다.
 *
 * 여유 폭이 0 이면 두 끝이 한 점으로 모여 정확한 날짜와 같아진다.
 */
export function relativeWindow(
  today: DateOnly,
  centerDays: number,
  uncertainty: number = DEFAULT_UNCERTAINTY
): { readyAt: DateOnly; holdUntil: DateOnly } {
  const u = Math.max(0, uncertainty)
  return {
    readyAt: addDays(today, Math.round(centerDays / (1 + u))),
    holdUntil: addDays(today, Math.round(centerDays * (1 + u))),
  }
}

export function relativeHorizon(
  today: DateOnly,
  centerDays: number,
  uncertainty: number = DEFAULT_UNCERTAINTY
): Horizon {
  const { readyAt, holdUntil } = relativeWindow(today, centerDays, uncertainty)
  return { kind: 'window', readyAt, holdUntil }
}

export type ApproxUnit = 'week' | 'month' | 'year'

export const UNIT_DAYS: Record<ApproxUnit, number> = {
  week: 7,
  month: 30,
  year: 365,
}

export const UNIT_LABEL: Record<ApproxUnit, string> = {
  week: '주',
  month: '개월',
  year: '년',
}

export interface ApproxPreset {
  id: string
  label: string
  centerDays: number
}

/**
 * 대략 프리셋 8개와 그 뒤에 붙는 `직접`.
 *
 * 촘촘하게 두지 않는다. 대략 모드는 이미 앞뒤로 25% 폭을 갖고 있어서
 * 이웃한 프리셋끼리 구간이 겹친다. 남는 구간은 `직접` 이 덮는다.
 */
export const APPROX_PRESETS: readonly ApproxPreset[] = Object.freeze([
  { id: 'w1', label: '1주쯤', centerDays: 7 },
  { id: 'w2', label: '2주쯤', centerDays: 14 },
  { id: 'w3', label: '3주쯤', centerDays: 21 },
  { id: 'm1', label: '1개월쯤', centerDays: 30 },
  { id: 'm2', label: '2개월쯤', centerDays: 60 },
  { id: 'm3', label: '3개월쯤', centerDays: 90 },
  { id: 'm6', label: '6개월쯤', centerDays: 180 },
  { id: 'y1', label: '1년쯤', centerDays: 365 },
])

export const CUSTOM_PRESET_ID = 'custom'

/** `직접` 으로 고른 숫자와 단위를 중심까지 일수로. */
export function customCenterDays(amount: number, unit: ApproxUnit): number {
  const n = Math.round(amount)
  if (!Number.isFinite(n) || n < 1 || n > 99) {
    throw new Error('직접 입력은 1 에서 99 사이의 정수여야 한다')
  }
  return n * UNIT_DAYS[unit]
}
