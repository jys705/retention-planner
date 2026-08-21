import { describe, expect, it } from 'vitest'
import { defaultFsrs } from '../../src/core/fsrs/fsrs6'
import type { Grade, MemoryState } from '../../src/core/fsrs/types'
import { spread, type SpreadCandidate } from '../../src/core/spread/assign'
import { feasibleInterval } from '../../src/core/spread/feasible'
import { addDays, fromEpochDay, toEpochDay } from '../../src/lib/date'
import { makeRng, randInt } from '../golden/rng'

const TODAY = '2026-10-01'
const READY_AT = addDays(TODAY, 45)

function stateFrom(rng: () => number): MemoryState {
  const length = randInt(rng, 1, 6)
  let state = defaultFsrs.nextState(null, 0, randInt(rng, 1, 4) as Grade)
  for (let i = 1; i < length; i += 1) {
    state = defaultFsrs.nextState(
      state,
      randInt(rng, 1, 30),
      randInt(rng, 2, 4) as Grade
    )
  }
  return state
}

function buildCandidates(count: number, seed: number): SpreadCandidate[] {
  const rng = makeRng(seed)
  const candidates: SpreadCandidate[] = []
  for (let i = 0; i < count; i += 1) {
    const state = stateFrom(rng)
    // 시작일이 제각각인 상황을 만든다.
    const anchor = addDays(TODAY, -randInt(rng, 0, 60))
    const interval = feasibleInterval({
      itemId: `i${String(i).padStart(3, '0')}`,
      state,
      anchor,
      readyAt: READY_AT,
      notBefore: TODAY,
      bufferDays: 1,
      targetRetention: 0.9,
    })
    candidates.push({
      interval,
      // 날짜를 옮기기 전에는 다들 마감선 직전으로 몰린다.
      naturalDue: fromEpochDay(interval.latest),
    })
  }
  return candidates
}

/**
 * 어떤 배치로도 이보다 낮출 수 없는 하루 부하의 하한.
 * 어떤 날짜 구간을 잡아도, 그 안에만 들어갈 수 있는 복습들은 그 안에 나눠 담아야 한다.
 */
function loadLowerBound(candidates: SpreadCandidate[]): number {
  const demands = candidates.flatMap((c) =>
    Array.from({ length: c.interval.atRisk ? 2 : 1 }, () => c.interval)
  )
  const days = new Set<number>()
  for (const d of demands) {
    days.add(d.earliest)
    days.add(d.latest)
  }
  const sorted = [...days].sort((a, b) => a - b)
  let bound = 0
  for (const a of sorted) {
    for (const b of sorted) {
      if (b < a) continue
      const contained = demands.filter(
        (d) => d.earliest >= a && d.latest <= b
      ).length
      if (contained === 0) continue
      bound = Math.max(bound, Math.ceil(contained / (b - a + 1)))
    }
  }
  return bound
}

describe('그룹 분산', () => {
  it('모든 항목이 자기 구간 안에 배치된다', () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      const candidates = buildCandidates(200, seed)
      const result = spread(candidates)
      const byId = new Map(candidates.map((c) => [c.interval.itemId, c.interval]))
      for (const assignment of result.assignments) {
        const interval = byId.get(assignment.itemId)
        expect(interval).toBeDefined()
        const day = toEpochDay(assignment.date)
        expect(day).toBeGreaterThanOrEqual(interval!.earliest)
        expect(day).toBeLessThanOrEqual(interval!.latest)
      }
    }
  })

  it('항목 200개의 최대 일일 부하가 가용일수로 나눈 값 + 1 을 넘지 않는다', () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      const candidates = buildCandidates(200, seed)
      const result = spread(candidates)
      const availableDays = new Set<number>()
      for (const c of candidates) {
        for (let d = c.interval.earliest; d <= c.interval.latest; d += 1) {
          availableDays.add(d)
        }
      }
      const total = result.assignments.length
      expect(result.peakAfter).toBeLessThanOrEqual(
        Math.ceil(total / availableDays.size) + 1
      )
    }
  })

  it('최대 일일 부하가 이론적 하한 + 1 을 넘지 않는다', () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      const candidates = buildCandidates(200, seed)
      const result = spread(candidates)
      const bound = loadLowerBound(candidates)
      expect(result.peakAfter).toBeLessThanOrEqual(bound + 1)
    }
  })

  it('날짜 조정이 몰림을 실제로 덜어낸다', () => {
    const candidates = buildCandidates(200, 5)
    const result = spread(candidates)
    expect(result.peakBefore).toBeGreaterThan(result.peakAfter)
    expect(result.peakBefore).toBe(200)
  })

  it('같은 입력을 두 번 돌리면 완전히 같은 결과가 나온다', () => {
    for (const seed of [1, 9, 77]) {
      const first = spread(buildCandidates(200, seed))
      const second = spread(buildCandidates(200, seed))
      expect(second).toEqual(first)
    }
  })

  it('조정 전 분포와 봉우리를 함께 돌려준다', () => {
    const candidates = buildCandidates(30, 11)
    const result = spread(candidates)
    const beforeTotal = Object.values(result.dailyLoadBefore).reduce(
      (a, b) => a + b,
      0
    )
    const afterTotal = Object.values(result.dailyLoadAfter).reduce(
      (a, b) => a + b,
      0
    )
    expect(beforeTotal).toBe(30)
    expect(afterTotal).toBe(result.assignments.length)
    expect(result.peakBefore).toBeGreaterThanOrEqual(result.peakAfter)
  })

  it('한 번으로 부족한 항목에는 복습을 둘 잡는다', () => {
    const state = defaultFsrs.nextState(null, 0, 1)
    const interval = feasibleInterval({
      itemId: 'weak',
      state,
      anchor: TODAY,
      readyAt: addDays(TODAY, 8),
      notBefore: TODAY,
      bufferDays: 1,
      targetRetention: 0.97,
    })
    expect(interval.atRisk).toBe(true)
    const result = spread([
      { interval, naturalDue: fromEpochDay(interval.latest) },
    ])
    const mine = result.assignments.filter((a) => a.itemId === 'weak')
    expect(mine).toHaveLength(2)
    expect(mine[0].date).not.toBe(mine[1].date)
  })

  it('항목이 하나면 자기 구간의 늦은 쪽에 놓인다', () => {
    const candidates = buildCandidates(1, 3)
    const result = spread(candidates)
    const interval = candidates[0].interval
    const day = toEpochDay(result.assignments[0].date)
    expect(day).toBe(interval.latest)
  })

  it('가용일이 하루뿐이면 전부 그날에 모인다', () => {
    const candidates: SpreadCandidate[] = Array.from({ length: 8 }, (_, i) => ({
      interval: {
        itemId: `x${i}`,
        earliest: toEpochDay(TODAY),
        latest: toEpochDay(TODAY),
        atRisk: false,
        bestRetentionAtGoal: 0.95,
        hasRoomBeforeGoal: true,
      },
      naturalDue: TODAY,
    }))
    const result = spread(candidates)
    expect(result.peakAfter).toBe(8)
    expect(result.assignments.every((a) => a.date === TODAY)).toBe(true)
  })

  it('구간이 뒤집힌 항목이 섞여 있어도 배치된다', () => {
    const collapsed = feasibleInterval({
      itemId: 'past',
      state: defaultFsrs.nextState(null, 0, 3),
      anchor: TODAY,
      readyAt: TODAY,
      notBefore: TODAY,
      bufferDays: 1,
      targetRetention: 0.9,
    })
    expect(collapsed.hasRoomBeforeGoal).toBe(false)
    const candidates = [
      { interval: collapsed, naturalDue: TODAY },
      ...buildCandidates(20, 4),
    ]
    const result = spread(candidates)
    expect(
      result.assignments.filter((a) => a.itemId === 'past').length
    ).toBeGreaterThanOrEqual(1)
    expect(result.primaryDue['past']).toBe(TODAY)
  })

  it('옮겨진 항목을 알려준다', () => {
    const candidates = buildCandidates(40, 6)
    const result = spread(candidates)
    expect(result.movedItemIds.length).toBeGreaterThan(0)
    for (const id of result.movedItemIds) {
      const candidate = candidates.find((c) => c.interval.itemId === id)
      expect(result.primaryDue[id]).not.toBe(candidate!.naturalDue)
    }
  })
})
