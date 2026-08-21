import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { defaultFsrs } from '../../src/core/fsrs/fsrs6'
import { GRADES, type Grade, type MemoryState } from '../../src/core/fsrs/types'
import { applyReview } from '../../src/core/policy/constraints'
import {
  diagnose,
  memoryCurve,
  projectGroup,
  projectItem,
  type ProjectItemInput,
} from '../../src/core/simulate/project'
import { replayReviews, replayState } from '../../src/core/simulate/replay'
import { addDays, toEpochDay } from '../../src/lib/date'
import { makeRng, randInt } from '../golden/rng'

const TODAY = '2026-10-01'

describe('평가 이력 재생', () => {
  it('재생 결과가 그때그때 계산한 상태와 같다', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            grade: fc.constantFrom(...GRADES),
            gap: fc.integer({ min: 0, max: 120 }),
          }),
          { minLength: 1, maxLength: 25 }
        ),
        (steps) => {
          // 앱이 평가할 때마다 갱신하는 경로
          let live: MemoryState | null = null
          let lastReview: string | null = null
          let cursor = TODAY
          const entries: { reviewedAt: string; rating: Grade }[] = []

          for (const step of steps) {
            cursor = addDays(cursor, step.gap)
            const applied = applyReview({
              reviewedAt: cursor,
              lastReview,
              state: live,
              grade: step.grade,
              horizon: { kind: 'open' },
              intensity: 'standard',
            })
            live = applied.state
            lastReview = cursor
            entries.push({ reviewedAt: cursor, rating: step.grade })
          }

          // 이력만 가지고 되살리는 경로
          expect(replayState(entries)).toEqual(live)
        }
      ),
      { numRuns: 1_000 }
    )
  })

  it('순서가 뒤섞여 들어와도 날짜순으로 재생한다', () => {
    const entries: { reviewedAt: string; rating: Grade }[] = [
      { reviewedAt: '2026-10-20', rating: 4 },
      { reviewedAt: '2026-10-01', rating: 3 },
      { reviewedAt: '2026-10-10', rating: 2 },
    ]
    const points = replayReviews(entries)
    expect(points.map((p) => p.reviewedAt)).toEqual([
      '2026-10-01',
      '2026-10-10',
      '2026-10-20',
    ])
    expect(points[1].elapsedDays).toBe(9)
    expect(points[2].elapsedDays).toBe(10)
  })

  it('이력이 없으면 상태도 없다', () => {
    expect(replayState([])).toBeNull()
    expect(replayReviews([])).toEqual([])
  })

  it('같은 날 두 번 기록한 이력도 재생된다', () => {
    const points = replayReviews([
      { reviewedAt: '2026-10-01', rating: 1 },
      { reviewedAt: '2026-10-01', rating: 3 },
    ])
    expect(points).toHaveLength(2)
    expect(points[1].elapsedDays).toBe(0)
  })
})

function baseInput(over: Partial<ProjectItemInput> = {}): ProjectItemInput {
  return {
    itemId: 'i1',
    state: defaultFsrs.nextState(null, 0, 3),
    anchor: TODAY,
    due: TODAY,
    from: TODAY,
    days: 60,
    horizon: { kind: 'open' },
    intensity: 'standard',
    ...over,
  }
}

describe('앞으로의 일정 투영', () => {
  it('투영된 복습들이 날짜순이고 기간 안에 있다', () => {
    const reviews = projectItem(baseInput())
    expect(reviews.length).toBeGreaterThan(0)
    const limit = toEpochDay(addDays(TODAY, 60))
    for (let i = 0; i < reviews.length; i += 1) {
      expect(toEpochDay(reviews[i].date)).toBeLessThanOrEqual(limit)
      if (i > 0) {
        expect(reviews[i].date > reviews[i - 1].date).toBe(true)
      }
    }
  })

  it('간격이 볼수록 길어진다', () => {
    const reviews = projectItem(baseInput({ days: 365 }))
    const gaps = reviews
      .slice(1)
      .map((r, i) => toEpochDay(r.date) - toEpochDay(reviews[i].date))
    expect(gaps.length).toBeGreaterThan(3)
    expect(gaps[gaps.length - 1]).toBeGreaterThan(gaps[0])
  })

  it('목표 시점이 있으면 복습이 더 자주 잡힌다', () => {
    const open = projectItem(baseInput({ days: 40 }))
    const dated = projectItem(
      baseInput({ days: 40, horizon: { kind: 'date', at: addDays(TODAY, 40) } })
    )
    expect(dated.length).toBeGreaterThanOrEqual(open.length)
  })

  it('연체된 항목은 오늘 보는 것으로 친다', () => {
    const reviews = projectItem(baseInput({ due: addDays(TODAY, -20) }))
    expect(reviews[0].date).toBe(TODAY)
  })

  it('아직 평가가 없어도 투영된다', () => {
    const reviews = projectItem(baseInput({ state: null }))
    expect(reviews.length).toBeGreaterThan(0)
    expect(reviews[0].retrievabilityAtReview).toBe(1)
  })

  it('같은 입력이면 같은 결과가 나온다', () => {
    expect(projectItem(baseInput())).toEqual(projectItem(baseInput()))
  })
})

describe('기억 곡선', () => {
  it('복습한 날에 100% 로 튀고 그 뒤로 내려온다', () => {
    const history = [
      { date: '2026-09-01', state: defaultFsrs.nextState(null, 0, 3) },
    ]
    const curve = memoryCurve({
      history,
      future: [],
      from: '2026-09-01',
      to: '2026-09-20',
      today: '2026-09-20',
    })
    expect(curve[0].retention).toBe(1)
    expect(curve[0].reviewed).toBe(true)
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i].retention).toBeLessThanOrEqual(curve[i - 1].retention)
    }
  })

  it('기억률이 0.6 아래로도 실제로 내려간다', () => {
    const curve = memoryCurve({
      history: [{ date: '2026-01-01', state: defaultFsrs.nextState(null, 0, 3) }],
      future: [],
      from: '2026-01-01',
      to: '2026-06-01',
      today: '2026-06-01',
    })
    const lowest = Math.min(...curve.map((p) => p.retention))
    expect(lowest).toBeLessThan(0.6)
  })

  it('오늘 이후는 예상 구간으로 표시된다', () => {
    const curve = memoryCurve({
      history: [{ date: TODAY, state: defaultFsrs.nextState(null, 0, 3) }],
      future: [
        { date: addDays(TODAY, 10), state: defaultFsrs.nextState(null, 0, 4) },
      ],
      from: TODAY,
      to: addDays(TODAY, 20),
      today: addDays(TODAY, 5),
    })
    expect(curve.filter((p) => !p.projected)).toHaveLength(6)
    expect(curve.find((p) => p.date === addDays(TODAY, 10))?.reviewed).toBe(true)
  })

  it('대략 목표에서는 두 마감선 사이가 평평하게 유지된다', () => {
    const readyAt = addDays(TODAY, 40)
    const holdUntil = addDays(TODAY, 70)
    const input = baseInput({
      days: 75,
      horizon: { kind: 'window', readyAt, holdUntil },
      targetRetention: 0.9,
    })
    const future = projectItem(input).map((r) => ({
      date: r.date,
      state: r.state,
    }))
    const curve = memoryCurve({
      history: [{ date: TODAY, state: input.state! }],
      future,
      from: readyAt,
      to: holdUntil,
      today: TODAY,
    })
    const lowest = Math.min(...curve.map((p) => p.retention))
    expect(lowest).toBeGreaterThanOrEqual(0.85)
  })
})

describe('실현 가능성 진단', () => {
  it('무기한이면 여유다', () => {
    expect(diagnose(baseInput()).feasibility).toBe('relaxed')
  })

  it('시간이 촉박하면 빠듯이다', () => {
    const result = diagnose(
      baseInput({
        horizon: { kind: 'date', at: addDays(TODAY, 4) },
        minReviews: 5,
      })
    )
    expect(result.feasibility).toBe('tight')
  })

  it('넉넉한 목표는 빠듯하지 않다', () => {
    const result = diagnose(
      baseInput({ horizon: { kind: 'date', at: addDays(TODAY, 300) } })
    )
    expect(result.feasibility).not.toBe('tight')
    expect(result.plannedReviews).toBeGreaterThanOrEqual(3)
  })

  it('목표한 날 예상 기억률을 함께 돌려준다', () => {
    const result = diagnose(
      baseInput({ horizon: { kind: 'date', at: addDays(TODAY, 60) } })
    )
    expect(result.retentionAtGoal).toBeGreaterThan(0)
    expect(result.retentionAtGoal).toBeLessThanOrEqual(1)
  })
})

describe('성능', () => {
  it('항목 200개를 60일 투영하는 데 100ms 미만이 걸린다', () => {
    const rng = makeRng(4242)
    const items: ProjectItemInput[] = Array.from({ length: 200 }, (_, i) => {
      let state = defaultFsrs.nextState(null, 0, randInt(rng, 1, 4) as Grade)
      const reps = randInt(rng, 0, 5)
      for (let r = 0; r < reps; r += 1) {
        state = defaultFsrs.nextState(
          state,
          randInt(rng, 1, 40),
          randInt(rng, 1, 4) as Grade
        )
      }
      return baseInput({
        itemId: `i${i}`,
        state,
        anchor: addDays(TODAY, -randInt(rng, 0, 40)),
        due: addDays(TODAY, randInt(rng, 0, 20)),
        horizon:
          i % 3 === 0
            ? { kind: 'open' }
            : { kind: 'date', at: addDays(TODAY, 30 + (i % 40)) },
      })
    })

    // 처음 한 번은 예열이다. 최적화가 도는 뒤로 재본다.
    projectGroup({ items, from: TODAY, days: 60 })

    const start = performance.now()
    const result = projectGroup({ items, from: TODAY, days: 60 })
    const elapsed = performance.now() - start

    expect(result.total).toBeGreaterThan(0)
    expect(Object.keys(result.dailyCount).length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(100)
  })
})
