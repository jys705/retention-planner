import { fromEpochDay, toEpochDay, type DateOnly } from '../../lib/date'
import { improveAssignment, type DayLoad } from './improve'
import type { FeasibleInterval } from './feasible'

export interface SpreadCandidate {
  interval: FeasibleInterval
  /** 날짜를 옮기기 전에 FSRS 가 잡아둔 날. 비교 표시에 쓴다. */
  naturalDue: DateOnly
}

export interface Assignment {
  itemId: string
  date: DateOnly
  /** 한 항목에 복습이 둘 배정될 수 있다. 0 이 먼저 보는 쪽이다. */
  ordinal: number
}

export interface SpreadResult {
  assignments: Assignment[]
  /** 항목별로 가장 이른 배정일. 화면의 `다음에 볼 날` 이 이 값이다. */
  primaryDue: Record<string, DateOnly>
  dailyLoadAfter: Record<DateOnly, number>
  dailyLoadBefore: Record<DateOnly, number>
  peakBefore: number
  peakAfter: number
  /** 날짜가 옮겨진 항목. `날짜 조정됨` 배지가 붙는다. */
  movedItemIds: string[]
}

/**
 * 같은 목표 시점을 향하는 항목들을 서로 다른 날로 편다.
 *
 * 제약이 강한 것부터 자리를 잡는다. 늦게 볼 수 있는 날이 이른 항목이 먼저고,
 * 같으면 옮길 수 있는 폭이 좁은 항목이 먼저다. 흔드는 값이 없어서 같은 입력이면
 * 언제 돌려도 같은 결과가 나온다.
 */
export function spread(
  candidates: SpreadCandidate[],
  options: { maxImproveRounds?: number } = {}
): SpreadResult {
  const ordered = [...candidates].sort(compareCandidates)

  const load: DayLoad = new Map()
  const assignments: Assignment[] = []

  for (const candidate of ordered) {
    const { interval } = candidate
    // 한 번으로 부족한 항목에는 복습을 둘 잡는다.
    const wanted = interval.atRisk ? 2 : 1
    const taken: number[] = []
    for (let ordinal = 0; ordinal < wanted; ordinal += 1) {
      const day = pickDay(interval, load, taken)
      if (day === null) break
      taken.push(day)
      bump(load, day, 1)
      assignments.push({
        itemId: interval.itemId,
        date: fromEpochDay(day),
        ordinal,
      })
    }
  }

  improveAssignment(assignments, ordered, load, options.maxImproveRounds ?? 100)

  return summarize(assignments, candidates, load)
}

function compareCandidates(a: SpreadCandidate, b: SpreadCandidate): number {
  if (a.interval.latest !== b.interval.latest) {
    return a.interval.latest - b.interval.latest
  }
  const widthA = a.interval.latest - a.interval.earliest
  const widthB = b.interval.latest - b.interval.earliest
  if (widthA !== widthB) return widthA - widthB
  // 남은 동점은 id 로 가른다. 정렬이 흔들리면 결과도 흔들린다.
  return a.interval.itemId < b.interval.itemId ? -1 : 1
}

/**
 * 구간 안에서 이미 배정된 항목이 가장 적은 날을 고른다.
 * 같은 부하가 여럿이면 늦은 날을 고른다. 목표한 날의 기억률이 그만큼 높아진다.
 */
function pickDay(
  interval: FeasibleInterval,
  load: DayLoad,
  exclude: number[]
): number | null {
  let best: number | null = null
  let bestLoad = Number.POSITIVE_INFINITY
  for (let d = interval.earliest; d <= interval.latest; d += 1) {
    if (exclude.includes(d)) continue
    const current = load.get(d) ?? 0
    if (current <= bestLoad) {
      bestLoad = current
      best = d
    }
  }
  return best
}

export function bump(load: DayLoad, day: number, delta: number): void {
  const next = (load.get(day) ?? 0) + delta
  if (next <= 0) load.delete(day)
  else load.set(day, next)
}

function summarize(
  assignments: Assignment[],
  candidates: SpreadCandidate[],
  load: DayLoad
): SpreadResult {
  const dailyLoadAfter: Record<DateOnly, number> = {}
  for (const [day, count] of [...load.entries()].sort((a, b) => a[0] - b[0])) {
    dailyLoadAfter[fromEpochDay(day)] = count
  }

  const dailyLoadBefore: Record<DateOnly, number> = {}
  for (const candidate of candidates) {
    const key = candidate.naturalDue
    dailyLoadBefore[key] = (dailyLoadBefore[key] ?? 0) + 1
  }

  const primaryDue: Record<string, DateOnly> = {}
  for (const a of assignments) {
    const current = primaryDue[a.itemId]
    if (current === undefined || a.date < current) primaryDue[a.itemId] = a.date
  }

  const movedItemIds: string[] = []
  for (const candidate of candidates) {
    const placed = primaryDue[candidate.interval.itemId]
    if (placed !== undefined && placed !== candidate.naturalDue) {
      movedItemIds.push(candidate.interval.itemId)
    }
  }
  movedItemIds.sort()

  return {
    assignments: [...assignments].sort(
      (a, b) =>
        (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
        (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0) ||
        a.ordinal - b.ordinal
    ),
    primaryDue,
    dailyLoadAfter,
    dailyLoadBefore,
    peakBefore: peak(dailyLoadBefore),
    peakAfter: peak(dailyLoadAfter),
    movedItemIds,
  }
}

function peak(loads: Record<DateOnly, number>): number {
  let max = 0
  for (const count of Object.values(loads)) max = Math.max(max, count)
  return max
}

export function loadOn(result: SpreadResult, date: DateOnly): number {
  return result.dailyLoadAfter[date] ?? 0
}

export function toDayLoad(loads: Record<DateOnly, number>): DayLoad {
  const map: DayLoad = new Map()
  for (const [date, count] of Object.entries(loads)) {
    map.set(toEpochDay(date), count)
  }
  return map
}
