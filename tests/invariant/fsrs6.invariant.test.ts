import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { Fsrs6 } from '../../src/core/fsrs/fsrs6'
import { D_MAX, D_MIN, roundTo, S_MAX, S_MIN } from '../../src/core/fsrs/params'
import { GRADES, type Grade, type MemoryState } from '../../src/core/fsrs/types'

const TOLERANCE = 1e-9
const RUNS = 2_000
const engine = new Fsrs6()

const arbStability = fc
  .double({ min: S_MIN, max: 3_000, noNaN: true, noDefaultInfinity: true })
  .filter((s) => s >= S_MIN)
const arbDifficulty = fc.double({
  min: D_MIN,
  max: D_MAX,
  noNaN: true,
  noDefaultInfinity: true,
})
const arbGrade = fc.constantFrom(...GRADES)
const arbElapsed = fc.integer({ min: 0, max: 3_000 })
const arbState: fc.Arbitrary<MemoryState> = fc.record({
  stability: arbStability,
  difficulty: arbDifficulty,
})

/**
 * 엔진이 내놓는 기억 지속력은 전부 소수점 8자리에서 끊긴 값이다.
 * 그 자리보다 잘게 쪼갠 값은 실제로는 상태로 들어올 수 없으므로,
 * 단조성을 볼 때는 엔진이 실제로 만들어낼 수 있는 값만 넣는다.
 */
const QUANTUM = 1e-8
const arbReachableState: fc.Arbitrary<MemoryState> = fc.record({
  // 엔진과 똑같은 방식으로 끊어야 마지막 비트까지 같은 값이 된다.
  stability: arbStability.map((s) => Math.max(S_MIN, roundTo(s, 8))),
  difficulty: arbDifficulty,
})

describe('망각 곡선', () => {
  it('막 본 직후에는 기억률이 1 이다', () => {
    fc.assert(
      fc.property(arbStability, (s) => {
        expect(engine.retrievability(0, s)).toBe(1)
      }),
      { numRuns: RUNS }
    )
  })

  it('기억 지속력만큼 지나면 기억률이 0.9 다', () => {
    fc.assert(
      fc.property(arbStability, (s) => {
        expect(Math.abs(engine.retrievability(s, s) - 0.9)).toBeLessThan(
          TOLERANCE
        )
      }),
      { numRuns: RUNS }
    )
  })

  it('시간이 지날수록 기억률이 떨어진다', () => {
    fc.assert(
      fc.property(
        arbStability,
        arbElapsed,
        fc.integer({ min: 1, max: 3_000 }),
        (s, t, step) => {
          const before = engine.retrievability(t, s)
          const after = engine.retrievability(t + step, s)
          expect(after).toBeLessThanOrEqual(before)
        }
      ),
      { numRuns: RUNS }
    )
  })

  it('기억률은 항상 0 초과 1 이하다', () => {
    fc.assert(
      fc.property(arbStability, arbElapsed, (s, t) => {
        const r = engine.retrievability(t, s)
        expect(r).toBeGreaterThan(0)
        expect(r).toBeLessThanOrEqual(1)
      }),
      { numRuns: RUNS }
    )
  })
})

describe('간격 역함수', () => {
  it('목표 기억률 0.9 의 간격은 기억 지속력과 같다', () => {
    fc.assert(
      fc.property(arbStability, (s) => {
        const interval = engine.intervalExact(0.9, s)
        expect(Math.abs(interval - s)).toBeLessThanOrEqual(
          Math.max(TOLERANCE, Math.abs(s) * TOLERANCE)
        )
      }),
      { numRuns: RUNS }
    )
  })

  it('간격을 태우면 기억률이 목표치로 돌아온다', () => {
    fc.assert(
      fc.property(
        arbStability,
        fc.double({ min: 0.5, max: 0.99, noNaN: true }),
        (s, dr) => {
          const interval = engine.intervalExact(dr, s)
          expect(
            Math.abs(engine.retrievability(interval, s) - dr)
          ).toBeLessThan(1e-7)
        }
      ),
      { numRuns: RUNS }
    )
  })

  it('목표 기억률을 높이면 간격이 짧아진다', () => {
    fc.assert(
      fc.property(arbStability, (s) => {
        const relaxed = engine.intervalExact(0.85, s)
        const standard = engine.intervalExact(0.9, s)
        const focused = engine.intervalExact(0.94, s)
        expect(relaxed).toBeGreaterThanOrEqual(standard)
        expect(standard).toBeGreaterThanOrEqual(focused)
      }),
      { numRuns: RUNS }
    )
  })
})

describe('기억 상태 갱신', () => {
  it('떠올리는 데 성공하면 기억 지속력이 줄지 않는다', () => {
    fc.assert(
      fc.property(
        arbReachableState,
        arbElapsed,
        fc.constantFrom<Grade>(2, 3, 4),
        (state, t, grade) => {
          const next = engine.nextState(state, t, grade)
          expect(next.stability).toBeGreaterThanOrEqual(state.stability)
        }
      ),
      { numRuns: RUNS }
    )
  })

  it('끊기지 않은 값을 넣어도 줄어드는 폭이 끊는 자리를 넘지 않는다', () => {
    fc.assert(
      fc.property(
        arbState,
        arbElapsed,
        fc.constantFrom<Grade>(2, 3, 4),
        (state, t, grade) => {
          const next = engine.nextState(state, t, grade)
          expect(next.stability).toBeGreaterThanOrEqual(
            state.stability - QUANTUM / 2
          )
        }
      ),
      { numRuns: RUNS }
    )
  })

  it("'다시' 를 누르면 기억 지속력이 늘지 않는다", () => {
    fc.assert(
      fc.property(arbReachableState, arbElapsed, (state, t) => {
        const next = engine.nextState(state, t, 1)
        expect(next.stability).toBeLessThanOrEqual(state.stability)
      }),
      { numRuns: RUNS }
    )
  })

  it('체감 난이도는 항상 1 에서 10 사이다', () => {
    fc.assert(
      fc.property(arbState, arbElapsed, arbGrade, (state, t, grade) => {
        const next = engine.nextState(state, t, grade)
        expect(next.difficulty).toBeGreaterThanOrEqual(D_MIN)
        expect(next.difficulty).toBeLessThanOrEqual(D_MAX)
      }),
      { numRuns: RUNS }
    )
  })

  it('기억 지속력은 항상 0.001 에서 36500 사이다', () => {
    fc.assert(
      fc.property(arbState, arbElapsed, arbGrade, (state, t, grade) => {
        const next = engine.nextState(state, t, grade)
        expect(next.stability).toBeGreaterThanOrEqual(S_MIN)
        expect(next.stability).toBeLessThanOrEqual(S_MAX)
      }),
      { numRuns: RUNS }
    )
  })

  it('첫 평가의 상태도 범위 안이다', () => {
    fc.assert(
      fc.property(arbGrade, arbElapsed, (grade, t) => {
        const next = engine.nextState(null, t, grade)
        expect(next.stability).toBeGreaterThanOrEqual(S_MIN)
        expect(next.stability).toBeLessThanOrEqual(S_MAX)
        expect(next.difficulty).toBeGreaterThanOrEqual(D_MIN)
        expect(next.difficulty).toBeLessThanOrEqual(D_MAX)
      }),
      { numRuns: RUNS }
    )
  })

  it('좋은 등급일수록 기억 지속력이 더 오른다', () => {
    fc.assert(
      fc.property(arbState, fc.integer({ min: 1, max: 3_000 }), (state, t) => {
        const hard = engine.nextState(state, t, 2).stability
        const good = engine.nextState(state, t, 3).stability
        const easy = engine.nextState(state, t, 4).stability
        expect(good).toBeGreaterThanOrEqual(hard)
        expect(easy).toBeGreaterThanOrEqual(good)
      }),
      { numRuns: RUNS }
    )
  })

  it('좋은 등급일수록 체감 난이도가 낮아진다', () => {
    fc.assert(
      fc.property(arbState, arbElapsed, (state, t) => {
        const again = engine.nextState(state, t, 1).difficulty
        const hard = engine.nextState(state, t, 2).difficulty
        const good = engine.nextState(state, t, 3).difficulty
        const easy = engine.nextState(state, t, 4).difficulty
        expect(hard).toBeLessThanOrEqual(again)
        expect(good).toBeLessThanOrEqual(hard)
        expect(easy).toBeLessThanOrEqual(good)
      }),
      { numRuns: RUNS }
    )
  })

  it('오래 두었다 성공하면 더 크게 오른다', () => {
    fc.assert(
      fc.property(
        arbState,
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 500 }),
        (state, t, extra) => {
          const soon = engine.nextState(state, t, 3).stability
          const later = engine.nextState(state, t + extra, 3).stability
          expect(later).toBeGreaterThanOrEqual(soon)
        }
      ),
      { numRuns: RUNS }
    )
  })

  it('지난 일수가 음수면 막는다', () => {
    expect(() => engine.nextState(null, -1, 3)).toThrow()
  })

  it('범위 밖 기억 상태를 넣으면 막는다', () => {
    expect(() =>
      engine.nextState({ stability: 0, difficulty: 5 }, 1, 3)
    ).toThrow()
    expect(() =>
      engine.nextState({ stability: 1, difficulty: 0.5 }, 1, 3)
    ).toThrow()
  })
})
