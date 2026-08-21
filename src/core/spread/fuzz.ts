import { addDays, toEpochDay, type DateOnly } from '../../lib/date'

/**
 * 목표 시점이 없는 항목의 날짜를 살짝 흔든다.
 *
 * 목표를 공유하지 않으면 몰림이 구조적으로 생기지 않으므로 이걸로 충분하다.
 * 목표가 있는 항목에는 쓰지 않는다. 그쪽은 배정이 이미 자리를 정한다.
 */
export function fuzzRange(intervalDays: number): number {
  if (intervalDays < 2.5) return 0
  if (intervalDays < 7) return 0.15
  if (intervalDays < 20) return 0.1
  return 0.05
}

export interface FuzzInput {
  from: DateOnly
  intervalDays: number
  /** 날짜별로 이미 예정된 항목 수. */
  dailyLoad: Readonly<Record<DateOnly, number>>
  /** 이 날보다 이르게는 옮기지 않는다. */
  notBefore?: DateOnly
}

/**
 * 흔들 수 있는 폭 안에서 예정된 항목이 가장 적은 날을 고른다.
 *
 * 무작위로 고르지 않는다. 몰림을 푸는 게 목적이니 적은 날을 고르는 게 낫고,
 * 그래야 앱을 껐다 켜도 일정이 그대로다.
 */
export function fuzzDue(input: FuzzInput): DateOnly {
  const ratio = fuzzRange(input.intervalDays)
  const natural = addDays(input.from, input.intervalDays)
  if (ratio === 0) return natural

  const delta = Math.max(1, Math.round(input.intervalDays * ratio))
  const lowestAllowed = input.notBefore
    ? toEpochDay(input.notBefore)
    : Number.NEGATIVE_INFINITY

  let best: DateOnly | null = null
  let bestLoad = Number.POSITIVE_INFINITY
  let bestDistance = Number.POSITIVE_INFINITY
  for (let offset = -delta; offset <= delta; offset += 1) {
    const candidate = addDays(natural, offset)
    if (toEpochDay(candidate) < lowestAllowed) continue
    if (toEpochDay(candidate) <= toEpochDay(input.from)) continue
    const load = input.dailyLoad[candidate] ?? 0
    const distance = Math.abs(offset)
    // 부하가 같으면 원래 날짜에 가까운 쪽을 남긴다. 이유 없이 옮기지 않는다.
    if (load < bestLoad || (load === bestLoad && distance < bestDistance)) {
      bestLoad = load
      bestDistance = distance
      best = candidate
    }
  }
  return best ?? natural
}
