import { describe, expect, it } from 'vitest'
import { defaultFsrs } from '../../src/core/fsrs/fsrs6'
import { schedule } from '../../src/core/policy/constraints'
import { feasibleInterval } from '../../src/core/spread/feasible'
import { resetRepositoryForTest } from '../../src/db'
import type { GoalRow, ItemRow } from '../../src/db/types'
import { addDays, fromEpochDay, toEpochDay } from '../../src/lib/date'
import { resetPlannerForTest, usePlanner } from '../../src/store/planner'

const TODAY = '2026-08-22'
const GOAL_IN = 5
const EXAM = addDays(TODAY, GOAL_IN)
const STABILITY = 3
const DIFFICULTY = 5.5
const ITEM_COUNT = 20
const CAP = 2

/**
 * 마감선에 끌려가면서 동시에 실행 가능 구간이 오늘보다 늦게 시작하는 상태.
 * 강도가 목표 기억률보다 느슨할 때(여유 0.85 대 0.90) 이 두 조건이 함께 성립한다.
 */
function makeGoal(): GoalRow {
  return {
    id: 'g1',
    name: '시험',
    horizon_kind: 'date',
    ready_at: EXAM,
    hold_until: EXAM,
    target_retention: 0.9,
    intensity: 'easy',
    min_reviews: 1,
    max_interval_days: null,
    post_goal_mode: 'archive',
    color: null,
    created_at: '2026-08-01T00:00:00.000Z',
    archived_at: null,
  }
}

function makeItem(i: number): ItemRow {
  return {
    id: `itm${String(i).padStart(3, '0')}`,
    goal_id: 'g1',
    title: `문제 ${i + 1}`,
    memo: '',
    tags: '[]',
    created_at: '2026-08-01T00:00:00.000Z',
    first_studied_at: TODAY,
    horizon_kind: null,
    ready_at: null,
    hold_until: null,
    target_retention: null,
    intensity: null,
    min_reviews: null,
    state: 'review',
    stability: STABILITY,
    difficulty: DIFFICULTY,
    due: addDays(TODAY, GOAL_IN - 1),
    due_kind: 'deadline_pull',
    due_source: 'fsrs',
    last_review: TODAY,
    reps: 2,
    lapses: 0,
    reps_since_goal: 5,
    goal_risk: null,
    archived_at: null,
  }
}

async function setup(): Promise<void> {
  resetRepositoryForTest()
  resetPlannerForTest()
  usePlanner.setState({
    ready: false,
    goals: [],
    items: [],
    reviews: [],
    today: TODAY,
  })
  await usePlanner.getState().load()
  await usePlanner.getState().importAll({
    version: 1,
    exportedAt: '',
    goals: [makeGoal()],
    items: Array.from({ length: ITEM_COUNT }, (_, i) => makeItem(i)),
    reviews: [],
    settings: {
      dailyCap: String(CAP),
      targetRetention: '0.9',
      bufferDays: '1',
      minReviews: '1',
    },
  })
  usePlanner.getState().setToday(TODAY)
  await usePlanner.getState().recomputeAll()
}

function windowOf() {
  const { settings } = usePlanner.getState()
  return feasibleInterval({
    itemId: 'itm000',
    state: { stability: STABILITY, difficulty: DIFFICULTY },
    anchor: TODAY,
    readyAt: EXAM,
    notBefore: TODAY,
    bufferDays: settings.bufferDays,
    targetRetention: settings.targetRetention,
  })
}

describe('하루 상한이 목표 보장을 깨지 않는다', () => {
  it('전제 확인: 마감선에 끌려가고 구간이 오늘보다 늦게 시작한다', async () => {
    await setup()
    const state = { stability: STABILITY, difficulty: DIFFICULTY }
    const natural = schedule({
      from: TODAY,
      state,
      horizon: { kind: 'date', at: EXAM },
      intensity: 'easy',
      targetRetention: 0.9,
      minReviews: 1,
      repsSinceGoal: 5,
      bufferDays: 1,
    })
    expect(natural.dueKind).toBe('deadline_pull')

    const iv = windowOf()
    expect(iv.atRisk).toBe(false)
    // 구간이 오늘 이후에 시작해야 이 시험이 뜻을 가진다.
    expect(iv.earliest).toBeGreaterThan(toEpochDay(TODAY))
    // 항목이 창보다 많아야 상한이 창 밖으로 나가려 든다.
    const width = iv.latest - iv.earliest + 1
    expect(ITEM_COUNT / width).toBeGreaterThan(CAP)
  })

  it('상한 처리 뒤에도 모든 항목이 자기 구간 안에 있다', async () => {
    await setup()
    const iv = windowOf()

    const escaped = usePlanner
      .getState()
      .items.filter(
        (item) =>
          item.due !== null &&
          (toEpochDay(item.due) < iv.earliest ||
            toEpochDay(item.due) > iv.latest)
      )
      .map((item) => `${item.title}: ${item.due}`)

    expect({
      구간: `[${fromEpochDay(iv.earliest)}, ${fromEpochDay(iv.latest)}]`,
      벗어난항목: escaped,
    }).toEqual({
      구간: `[${fromEpochDay(iv.earliest)}, ${fromEpochDay(iv.latest)}]`,
      벗어난항목: [],
    })
  })

  it('상한 처리 뒤에도 목표한 날 기억률이 목표치 이상이다', async () => {
    await setup()
    const { settings } = usePlanner.getState()

    const below = usePlanner
      .getState()
      .items.flatMap((item) => {
        if (!item.due || item.stability === null || item.difficulty === null) {
          return []
        }
        const dueDay = toEpochDay(item.due)
        const elapsed = Math.max(
          0,
          dueDay - toEpochDay(item.last_review ?? item.first_studied_at)
        )
        const r = defaultFsrs.retrievability(elapsed, item.stability)
        const after = defaultFsrs.nextRecallStability(
          item.difficulty,
          item.stability,
          r,
          3
        )
        const atGoal = defaultFsrs.retrievability(
          Math.max(0, toEpochDay(EXAM) - dueDay),
          after
        )
        return atGoal < settings.targetRetention - 1e-9
          ? [`${item.title}: ${atGoal.toFixed(4)}`]
          : []
      })

    expect(below).toEqual([])
  })

  it('구간을 지키느라 상한을 넘기는 날은 넘긴다고 알려준다', async () => {
    await setup()
    // 창이 좁고 항목이 많으면 상한과 구간을 동시에 만족할 수 없다.
    // 그럴 때는 구간을 지키는 쪽이 맞다. 목표한 날 기억률이 걸려 있기 때문이다.
    const counts = new Map<string, number>()
    for (const item of usePlanner.getState().items) {
      if (item.due) counts.set(item.due, (counts.get(item.due) ?? 0) + 1)
    }
    const iv = windowOf()
    for (const date of counts.keys()) {
      expect(toEpochDay(date)).toBeGreaterThanOrEqual(iv.earliest)
      expect(toEpochDay(date)).toBeLessThanOrEqual(iv.latest)
    }
  })
})
