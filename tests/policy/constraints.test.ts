import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { defaultFsrs } from '../../src/core/fsrs/fsrs6'
import { GRADES, type Grade, type MemoryState } from '../../src/core/fsrs/types'
import { resolveHorizon, type Horizon } from '../../src/core/horizon/horizon'
import {
  applyReview,
  DEFAULT_BUFFER_DAYS,
  initialSchedule,
  INTENSITY_RETENTION,
  resolveIntensity,
  schedule,
} from '../../src/core/policy/constraints'
import { addDays, diffDays, toEpochDay } from '../../src/lib/date'

const TODAY = '2026-10-01'

function stateAfter(grades: Grade[], gap = 5): MemoryState {
  let state = defaultFsrs.nextState(null, 0, grades[0])
  for (let i = 1; i < grades.length; i += 1) {
    state = defaultFsrs.nextState(state, gap, grades[i])
  }
  return state
}

describe('복습 강도', () => {
  it('프리셋이 회상률로 바뀐다', () => {
    expect(resolveIntensity('easy')).toBe(0.85)
    expect(resolveIntensity('standard')).toBe(0.9)
    expect(resolveIntensity('focus')).toBe(0.94)
    expect(resolveIntensity('max')).toBe(0.97)
  })

  it('슬라이더 값은 0.70 에서 0.97 사이로 잘린다', () => {
    expect(resolveIntensity(0.5)).toBe(0.7)
    expect(resolveIntensity(0.99)).toBe(0.97)
    expect(resolveIntensity(0.88)).toBe(0.88)
  })

  it('강도가 셀수록 간격이 짧아진다', () => {
    const state = stateAfter([3, 3, 3])
    const intervals = (['easy', 'standard', 'focus', 'max'] as const).map(
      (i) =>
        schedule({
          from: TODAY,
          state,
          horizon: { kind: 'open' },
          intensity: i,
        }).intervalDays
    )
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]).toBeLessThanOrEqual(intervals[i - 1])
    }
  })
})

describe('무기한 모드', () => {
  it('제약이 전부 사라지고 FSRS 간격이 그대로 나온다', () => {
    const state = stateAfter([3, 3, 3])
    const result = schedule({
      from: TODAY,
      state,
      horizon: { kind: 'open' },
      intensity: 'standard',
    })
    expect(result.constraints.ready).toBe(Number.POSITIVE_INFINITY)
    expect(result.constraints.sessions).toBe(Number.POSITIVE_INFINITY)
    expect(result.constraints.maxcap).toBe(Number.POSITIVE_INFINITY)
    expect(result.intervalDays).toBe(result.constraints.base)
    expect(result.dueKind).toBe('normal')
  })
})

describe('준비 마감선 제약', () => {
  it('어떤 등급 시퀀스에서도 버퍼 앞을 넘지 않는다', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...GRADES), { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 3 }),
        fc.constantFrom('easy', 'standard', 'focus', 'max' as const),
        (grades, daysToGoal, buffer, intensity) => {
          const readyAt = addDays(TODAY, daysToGoal)
          const horizon: Horizon = { kind: 'date', at: readyAt }
          const state = stateAfter(grades as Grade[])
          const result = schedule({
            from: TODAY,
            state,
            horizon,
            intensity,
            bufferDays: buffer,
          })
          const readyDay = toEpochDay(readyAt)
          const lastSchedulable = readyDay - buffer
          // 마감선 안에 잡을 수 있는 날이 남아 있을 때만 지킬 수 있는 약속이다.
          if (lastSchedulable - toEpochDay(TODAY) >= 1) {
            expect(toEpochDay(result.due)).toBeLessThanOrEqual(lastSchedulable)
          }
        }
      ),
      { numRuns: 3_000 }
    )
  })

  it('고원 구간에서는 유지 마감선을 기준으로 잡는다', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...GRADES), { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 0, max: 3 }),
        (grades, sinceReady, windowWidth, buffer) => {
          const readyAt = addDays(TODAY, -sinceReady)
          const holdUntil = addDays(readyAt, windowWidth)
          const horizon: Horizon = { kind: 'window', readyAt, holdUntil }
          const state = stateAfter(grades as Grade[])
          const result = schedule({
            from: TODAY,
            state,
            horizon,
            intensity: 'easy',
            bufferDays: buffer,
          })
          const lastSchedulable = toEpochDay(holdUntil) - buffer
          if (lastSchedulable - toEpochDay(TODAY) >= 1) {
            expect(toEpochDay(result.due)).toBeLessThanOrEqual(lastSchedulable)
            expect(result.inPlateau).toBe(true)
            expect(result.dueKind).toBe('hold')
          }
        }
      ),
      { numRuns: 2_000 }
    )
  })

  it('고원 구간에서는 강도가 여유여도 목표 기억률까지 조여진다', () => {
    const state = stateAfter([3, 3, 3])
    const result = schedule({
      from: TODAY,
      state,
      horizon: {
        kind: 'window',
        readyAt: addDays(TODAY, -3),
        holdUntil: addDays(TODAY, 20),
      },
      intensity: 'easy',
      targetRetention: 0.9,
    })
    expect(result.desiredRetention).toBe(0.9)
    expect(result.inPlateau).toBe(true)
  })

  it('유지 마감선을 지나면 제약이 풀린다', () => {
    const state = stateAfter([3, 3, 3])
    const result = schedule({
      from: TODAY,
      state,
      horizon: { kind: 'date', at: addDays(TODAY, -10) },
      intensity: 'standard',
    })
    expect(result.postGoalReached).toBe(true)
    expect(result.constraints.ready).toBe(Number.POSITIVE_INFINITY)
    expect(result.intervalDays).toBe(result.constraints.base)
  })
})

describe('최소 복습 횟수 제약', () => {
  it('목표 30일 전에 4번이 남았으면 7일로 좁혀진다', () => {
    const state = stateAfter([3, 3, 3, 4, 4])
    const result = schedule({
      from: TODAY,
      state,
      horizon: { kind: 'date', at: addDays(TODAY, 30) },
      intensity: 'standard',
      minReviews: 4,
      repsSinceGoal: 0,
    })
    expect(result.constraints.sessions).toBe(7)
    expect(result.intervalDays).toBeLessThanOrEqual(7)
  })

  it('남은 횟수를 다 채우면 제약이 사라진다', () => {
    const state = stateAfter([3, 3])
    const result = schedule({
      from: TODAY,
      state,
      horizon: { kind: 'date', at: addDays(TODAY, 60) },
      intensity: 'standard',
      minReviews: 3,
      repsSinceGoal: 3,
    })
    expect(result.constraints.sessions).toBe(Number.POSITIVE_INFINITY)
  })

  it('마감선까지 최소 횟수만큼 복습이 실제로 잡힌다', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 180 }),
        fc.integer({ min: 1, max: 6 }),
        (daysToGoal, minReviews) => {
          const readyAt = addDays(TODAY, daysToGoal)
          const horizon: Horizon = { kind: 'date', at: readyAt }
          let cursor = TODAY
          let state: MemoryState | null = null
          let reps = 0
          let guard = 0
          while (
            toEpochDay(cursor) < toEpochDay(readyAt) - DEFAULT_BUFFER_DAYS &&
            guard < 200
          ) {
            guard += 1
            const applied = applyReview({
              reviewedAt: cursor,
              lastReview: reps === 0 ? null : cursor,
              state,
              grade: 4,
              horizon,
              intensity: 'easy',
              minReviews,
              repsSinceGoal: reps,
            })
            state = applied.state
            reps += 1
            if (toEpochDay(applied.due) > toEpochDay(readyAt)) break
            cursor = applied.due
          }
          // 마감선 안에서 최소 횟수를 채웠거나, 채우고도 남을 만큼 복습했다.
          expect(reps).toBeGreaterThanOrEqual(Math.min(minReviews, guard))
        }
      ),
      { numRuns: 300 }
    )
  })
})

describe('최대 간격 상한', () => {
  it('상한을 넘지 않는다', () => {
    const state = stateAfter([4, 4, 4, 4, 4], 60)
    const result = schedule({
      from: TODAY,
      state,
      horizon: { kind: 'open' },
      intensity: 'easy',
      maxIntervalDays: 30,
    })
    expect(result.intervalDays).toBeLessThanOrEqual(30)
  })
})

describe('어느 제약이 걸렸는지 알려준다', () => {
  it('FSRS 가 이기면 평범한 복습이다', () => {
    const result = schedule({
      from: TODAY,
      state: stateAfter([3]),
      horizon: { kind: 'open' },
      intensity: 'standard',
    })
    expect(result.dueKind).toBe('normal')
  })

  it('마감선이 당기면 중요로 표시된다', () => {
    const result = schedule({
      from: TODAY,
      state: stateAfter([1, 3]),
      horizon: { kind: 'date', at: addDays(TODAY, 4) },
      intensity: 'easy',
      minReviews: 1,
      repsSinceGoal: 5,
    })
    expect(result.constraints.ready).toBeLessThan(result.constraints.base)
    expect(result.dueKind).toBe('deadline_pull')
  })

  it('이미 충분히 기억하고 있으면 마감선이 당기지 않는다', () => {
    // 오래 잘 외운 항목을 목표 며칠 앞에 두면 건너뛰어도 목표한 날 기억률을 지킨다.
    // 그런 항목까지 목표 직전으로 당기면, 안 봐도 되는 복습이 마감선 하루에 쌓인다.
    const state = stateAfter([4, 4, 4, 4, 4, 4], 120)
    const daysToGoal = 5
    const result = schedule({
      from: TODAY,
      state,
      horizon: { kind: 'date', at: addDays(TODAY, daysToGoal) },
      intensity: 'max',
      minReviews: 1,
      repsSinceGoal: 5,
    })

    // 안 봐도 목표한 날 목표 기억률을 지킨다는 것이 전제다.
    expect(
      defaultFsrs.retrievability(daysToGoal, state.stability)
    ).toBeGreaterThanOrEqual(0.9)
    // 그래서 마감선 제약이 아예 서지 않고, 날짜는 FSRS 가 정한 대로 간다.
    expect(Number.isFinite(result.constraints.ready)).toBe(false)
    expect(toEpochDay(result.due)).toBeGreaterThan(
      toEpochDay(addDays(TODAY, daysToGoal))
    )
  })
})

describe('처음 공부한 날이 과거인 경우', () => {
  it('그 시점에서 세고 지났으면 연체 그대로 둔다', () => {
    const firstStudiedAt = addDays(TODAY, -30)
    const result = initialSchedule({
      firstStudiedAt,
      horizon: { kind: 'open' },
      intensity: 'standard',
    })
    expect(result.due).toBe(
      addDays(firstStudiedAt, result.intervalDays)
    )
    expect(toEpochDay(result.due)).toBeLessThan(toEpochDay(TODAY))
    expect(result.state).toEqual(defaultFsrs.nextState(null, 0, 3))
  })

  it('오늘 적으면 오늘에서 센다', () => {
    const result = initialSchedule({
      firstStudiedAt: TODAY,
      horizon: { kind: 'open' },
      intensity: 'standard',
    })
    expect(result.due).toBe(addDays(TODAY, result.intervalDays))
  })
})

describe('지난 날짜로 기록', () => {
  it('경과 일수와 다음 날짜를 모두 복습한 날 기준으로 센다', () => {
    const lastReview = addDays(TODAY, -20)
    const reviewedAt = addDays(TODAY, -3)
    const state = stateAfter([3, 3])

    const applied = applyReview({
      reviewedAt,
      lastReview,
      state,
      grade: 3,
      horizon: { kind: 'open' },
      intensity: 'standard',
    })

    expect(applied.elapsedDays).toBe(17)
    expect(applied.due).toBe(addDays(reviewedAt, applied.intervalDays))
    expect(applied.retrievabilityAtReview).toBeCloseTo(
      defaultFsrs.retrievability(17, state.stability),
      12
    )
  })

  it('오늘 적는 것과 결과가 어긋나지 않는다', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 1, max: 30 }),
        fc.constantFrom(...GRADES),
        (gap, lateBy, grade) => {
          const state = stateAfter([3, 3])
          const reviewedAt = addDays(TODAY, -lateBy)
          const lastReview = addDays(reviewedAt, -gap)

          const recordedLate = applyReview({
            reviewedAt,
            lastReview,
            state,
            grade,
            horizon: { kind: 'open' },
            intensity: 'standard',
          })
          const recordedSameDay = applyReview({
            reviewedAt,
            lastReview,
            state,
            grade,
            horizon: { kind: 'open' },
            intensity: 'standard',
          })
          expect(recordedLate.state).toEqual(recordedSameDay.state)
          expect(recordedLate.elapsedDays).toBe(gap)
          expect(diffDays(reviewedAt, recordedLate.due)).toBe(
            recordedLate.intervalDays
          )
        }
      ),
      { numRuns: 500 }
    )
  })

  it('지난 날짜로 기록해도 마감선 약속이 유지된다', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 5, max: 120 }),
        fc.constantFrom(...GRADES),
        (lateBy, daysToGoal, grade) => {
          const reviewedAt = addDays(TODAY, -lateBy)
          const readyAt = addDays(TODAY, daysToGoal)
          const applied = applyReview({
            reviewedAt,
            lastReview: addDays(reviewedAt, -10),
            state: stateAfter([3, 3]),
            grade,
            horizon: { kind: 'date', at: readyAt },
            intensity: 'easy',
          })
          const lastSchedulable =
            toEpochDay(readyAt) - DEFAULT_BUFFER_DAYS
          if (lastSchedulable - toEpochDay(reviewedAt) >= 1) {
            expect(toEpochDay(applied.due)).toBeLessThanOrEqual(lastSchedulable)
          }
        }
      ),
      { numRuns: 1_000 }
    )
  })
})

describe('경계값', () => {
  it('목표까지 0일', () => {
    const result = schedule({
      from: TODAY,
      state: stateAfter([3, 3]),
      horizon: { kind: 'date', at: TODAY },
      intensity: 'standard',
    })
    expect(result.inPlateau).toBe(true)
    expect(result.intervalDays).toBeGreaterThanOrEqual(1)
  })

  it('목표까지 1일', () => {
    const result = schedule({
      from: TODAY,
      state: stateAfter([3, 3]),
      horizon: { kind: 'date', at: addDays(TODAY, 1) },
      intensity: 'standard',
      bufferDays: 1,
    })
    expect(result.intervalDays).toBeGreaterThanOrEqual(1)
    expect(result.constraints.ready).toBe(Number.POSITIVE_INFINITY)
  })

  it('목표 시점을 이미 지난 항목', () => {
    const result = schedule({
      from: TODAY,
      state: stateAfter([3, 3]),
      horizon: { kind: 'date', at: addDays(TODAY, -40) },
      intensity: 'standard',
    })
    expect(result.postGoalReached).toBe(true)
    expect(result.intervalDays).toBe(result.constraints.base)
  })

  it('간격은 언제나 1일 이상이다', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...GRADES), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: -50, max: 300 }),
        fc.integer({ min: 0, max: 8 }),
        (grades, offset, minReviews) => {
          const result = schedule({
            from: TODAY,
            state: stateAfter(grades as Grade[]),
            horizon: { kind: 'date', at: addDays(TODAY, offset) },
            intensity: 'max',
            minReviews,
          })
          expect(result.intervalDays).toBeGreaterThanOrEqual(1)
          expect(Number.isInteger(result.intervalDays)).toBe(true)
        }
      ),
      { numRuns: 2_000 }
    )
  })

  it('모든 강도 프리셋의 회상률이 유효 범위 안이다', () => {
    for (const dr of Object.values(INTENSITY_RETENTION)) {
      expect(dr).toBeGreaterThan(0)
      expect(dr).toBeLessThanOrEqual(1)
    }
  })

  it('무기한 구간의 두 끝은 무한이다', () => {
    const resolved = resolveHorizon({ kind: 'open' })
    expect(resolved.readyAt).toBe(Number.POSITIVE_INFINITY)
    expect(resolved.holdUntil).toBe(Number.POSITIVE_INFINITY)
  })
})
