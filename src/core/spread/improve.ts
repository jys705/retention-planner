import { fromEpochDay, toEpochDay } from '../../lib/date'
import type { Assignment, SpreadCandidate } from './assign'

export type DayLoad = Map<number, number>

/**
 * 배정을 다 마친 뒤에 가장 몰린 날을 덜어낸다.
 *
 * 가장 높은 날에서 항목 하나를 골라, 자기 구간 안에 두 개 이상 여유가 있는 날로 옮긴다.
 * 두 개 차이를 요구하는 건 옮기고 나서 새 봉우리가 생기지 않게 하기 위해서다.
 * 옮길 게 없으면 더 나아질 여지가 없으므로 그때 멈춘다.
 */
export function improveAssignment(
  assignments: Assignment[],
  candidates: SpreadCandidate[],
  load: DayLoad,
  maxRounds: number
): void {
  const intervalOf = new Map(
    candidates.map((c) => [c.interval.itemId, c.interval])
  )

  for (let round = 0; round < maxRounds; round += 1) {
    const peakDay = findPeakDay(load)
    if (peakDay === null) return
    const peakLoad = load.get(peakDay) ?? 0
    if (peakLoad <= 1) return

    const move = findMove(assignments, intervalOf, load, peakDay, peakLoad)
    if (!move) return

    const { assignment, toDay } = move
    adjust(load, peakDay, -1)
    adjust(load, toDay, 1)
    assignment.date = fromEpochDay(toDay)
  }
}

/** 부하가 가장 높은 날. 같으면 이른 날을 고른다. 결과가 흔들리면 안 된다. */
function findPeakDay(load: DayLoad): number | null {
  let peakDay: number | null = null
  let peakLoad = 0
  for (const [day, count] of load) {
    if (count > peakLoad || (count === peakLoad && peakDay !== null && day < peakDay)) {
      peakLoad = count
      peakDay = day
    }
  }
  return peakDay
}

function findMove(
  assignments: Assignment[],
  intervalOf: Map<string, { earliest: number; latest: number }>,
  load: DayLoad,
  peakDay: number,
  peakLoad: number
): { assignment: Assignment; toDay: number } | null {
  const onPeak = assignments
    .filter((a) => toEpochDay(a.date) === peakDay)
    .sort(
      (a, b) =>
        (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0) ||
        a.ordinal - b.ordinal
    )

  for (const assignment of onPeak) {
    const interval = intervalOf.get(assignment.itemId)
    if (!interval) continue
    const sameItemDays = new Set(
      assignments
        .filter((a) => a.itemId === assignment.itemId && a !== assignment)
        .map((a) => toEpochDay(a.date))
    )

    let bestDay: number | null = null
    let bestLoad = Number.POSITIVE_INFINITY
    for (let d = interval.earliest; d <= interval.latest; d += 1) {
      if (d === peakDay || sameItemDays.has(d)) continue
      const current = load.get(d) ?? 0
      if (current <= peakLoad - 2 && current < bestLoad) {
        bestLoad = current
        bestDay = d
      }
    }
    if (bestDay !== null) return { assignment, toDay: bestDay }
  }
  return null
}

function adjust(load: DayLoad, day: number, delta: number): void {
  const next = (load.get(day) ?? 0) + delta
  if (next <= 0) load.delete(day)
  else load.set(day, next)
}
