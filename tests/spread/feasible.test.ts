import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { defaultFsrs } from '../../src/core/fsrs/fsrs6'
import type { Grade, MemoryState } from '../../src/core/fsrs/types'
import {
  feasibleInterval,
  retentionAtGoal,
  type FeasibleInput,
} from '../../src/core/spread/feasible'
import { addDays, toEpochDay } from '../../src/lib/date'

const TODAY = '2026-10-01'

function stateAfter(grades: Grade[], gap = 7): MemoryState {
  let state = defaultFsrs.nextState(null, 0, grades[0])
  for (let i = 1; i < grades.length; i += 1) {
    state = defaultFsrs.nextState(state, gap, grades[i])
  }
  return state
}

const arbGrades = fc.array(fc.constantFrom<Grade>(1, 2, 3, 4), {
  minLength: 1,
  maxLength: 8,
})

describe('목표한 날 기억률의 단조성', () => {
  it('복습일이 늦어질수록 목표한 날 기억률이 올라간다', () => {
    fc.assert(
      fc.property(
        arbGrades,
        fc.integer({ min: 10, max: 300 }),
        fc.integer({ min: 0, max: 30 }),
        (grades, daysToGoal, anchorBack) => {
          const input = {
            state: stateAfter(grades),
            anchor: addDays(TODAY, -anchorBack),
            readyAt: addDays(TODAY, daysToGoal),
          }
          const start = toEpochDay(TODAY)
          const end = toEpochDay(input.readyAt)
          let previous = -Infinity
          for (let d = start; d <= end; d += 1) {
            const value = retentionAtGoal(input, d)
            expect(value).toBeGreaterThanOrEqual(previous - 1e-12)
            previous = value
          }
        }
      ),
      { numRuns: 400 }
    )
  })

  it('목표한 날 당일에 보면 기억률이 가장 높다', () => {
    fc.assert(
      fc.property(arbGrades, fc.integer({ min: 5, max: 200 }), (grades, days) => {
        const input = {
          state: stateAfter(grades),
          anchor: TODAY,
          readyAt: addDays(TODAY, days),
        }
        const goalDay = toEpochDay(input.readyAt)
        expect(retentionAtGoal(input, goalDay)).toBeGreaterThanOrEqual(
          retentionAtGoal(input, goalDay - 1) - 1e-12
        )
      }),
      { numRuns: 400 }
    )
  })
})

describe('옮길 수 있는 날짜 범위', () => {
  function makeInput(over: Partial<FeasibleInput> = {}): FeasibleInput {
    return {
      itemId: 'i1',
      state: stateAfter([3, 3, 3]),
      anchor: TODAY,
      readyAt: addDays(TODAY, 40),
      notBefore: TODAY,
      bufferDays: 1,
      targetRetention: 0.9,
      ...over,
    }
  }

  it('가장 늦은 날은 마감선에서 버퍼를 뺀 날이다', () => {
    const interval = feasibleInterval(makeInput())
    expect(interval.latest).toBe(toEpochDay(addDays(TODAY, 39)))
  })

  it('이른 쪽 끝의 바로 앞날은 목표치에 못 미친다', () => {
    fc.assert(
      fc.property(
        arbGrades,
        fc.integer({ min: 5, max: 300 }),
        fc.double({ min: 0.8, max: 0.95, noNaN: true }),
        (grades, daysToGoal, target) => {
          const input = makeInput({
            state: stateAfter(grades),
            readyAt: addDays(TODAY, daysToGoal),
            targetRetention: target,
          })
          const interval = feasibleInterval(input)
          if (interval.atRisk) return
          expect(retentionAtGoal(input, interval.earliest)).toBeGreaterThanOrEqual(
            target - 1e-12
          )
          if (interval.earliest > toEpochDay(TODAY)) {
            expect(retentionAtGoal(input, interval.earliest - 1)).toBeLessThan(
              target
            )
          }
        }
      ),
      { numRuns: 1_500 }
    )
  })

  it('이분 탐색 결과가 하나씩 훑은 결과와 같다', () => {
    fc.assert(
      fc.property(
        arbGrades,
        fc.integer({ min: 5, max: 200 }),
        fc.double({ min: 0.75, max: 0.96, noNaN: true }),
        (grades, daysToGoal, target) => {
          const input = makeInput({
            state: stateAfter(grades),
            readyAt: addDays(TODAY, daysToGoal),
            targetRetention: target,
          })
          const interval = feasibleInterval(input)
          if (interval.atRisk) return

          let bruteForce = interval.latest
          for (let d = toEpochDay(TODAY); d <= interval.latest; d += 1) {
            if (retentionAtGoal(input, d) >= target) {
              bruteForce = d
              break
            }
          }
          expect(interval.earliest).toBe(bruteForce)
        }
      ),
      { numRuns: 1_000 }
    )
  })

  it('가장 늦게 봐도 목표치에 못 미치면 부족으로 표시된다', () => {
    // 막 '다시' 를 누른 항목은 기억 지속력이 0.212일뿐이라, 마감선 사흘 전에
    // 한 번 더 봐도 목표한 날 기억률이 90% 에 못 미친다.
    const interval = feasibleInterval(
      makeInput({
        state: stateAfter([1]),
        readyAt: addDays(TODAY, 3),
        bufferDays: 2,
        targetRetention: 0.9,
      })
    )
    expect(interval.atRisk).toBe(true)
    expect(interval.bestRetentionAtGoal).toBeLessThan(0.9)
  })

  it('부족 표시와 목표한 날 예상 기억률이 서로 어긋나지 않는다', () => {
    fc.assert(
      fc.property(
        arbGrades,
        fc.integer({ min: 2, max: 200 }),
        fc.integer({ min: 1, max: 3 }),
        fc.double({ min: 0.8, max: 0.97, noNaN: true }),
        (grades, daysToGoal, buffer, target) => {
          const input = makeInput({
            state: stateAfter(grades, 1),
            readyAt: addDays(TODAY, daysToGoal),
            bufferDays: buffer,
            targetRetention: target,
          })
          const interval = feasibleInterval(input)
          if (interval.hasRoomBeforeGoal) {
            expect(interval.atRisk).toBe(interval.bestRetentionAtGoal < target)
          } else {
            expect(interval.atRisk).toBe(true)
          }
        }
      ),
      { numRuns: 2_000 }
    )
  })

  it('마감선이 이미 지났으면 부족으로 표시된다', () => {
    const interval = feasibleInterval(
      makeInput({ readyAt: TODAY, bufferDays: 1 })
    )
    expect(interval.atRisk).toBe(true)
    expect(interval.hasRoomBeforeGoal).toBe(false)
    expect(interval.earliest).toBe(interval.latest)
  })

  it('구간은 언제나 이른 쪽이 늦은 쪽보다 앞서거나 같다', () => {
    fc.assert(
      fc.property(
        arbGrades,
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 3 }),
        (grades, daysToGoal, buffer) => {
          const interval = feasibleInterval(
            makeInput({
              state: stateAfter(grades),
              readyAt: addDays(TODAY, daysToGoal),
              bufferDays: buffer,
            })
          )
          expect(interval.earliest).toBeLessThanOrEqual(interval.latest)
        }
      ),
      { numRuns: 1_500 }
    )
  })

  it('목표 기억률을 높이면 이른 쪽 끝이 늦어진다', () => {
    const base = makeInput({ readyAt: addDays(TODAY, 120) })
    const low = feasibleInterval({ ...base, targetRetention: 0.85 })
    const high = feasibleInterval({ ...base, targetRetention: 0.95 })
    expect(high.earliest).toBeGreaterThanOrEqual(low.earliest)
  })
})
