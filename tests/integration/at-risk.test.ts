import { describe, expect, it } from 'vitest'
import { defaultFsrs } from '../../src/core/fsrs/fsrs6'
import { projectItem } from '../../src/core/simulate/project'
import { feasibleInterval } from '../../src/core/spread/feasible'
import { resetRepositoryForTest } from '../../src/db'
import type { GoalRow, ItemRow } from '../../src/db/types'
import { addDays, toEpochDay } from '../../src/lib/date'
import { resetPlannerForTest, usePlanner } from '../../src/store/planner'

const TODAY = '2026-08-22'
const EXAM = addDays(TODAY, 3)

/** 막 '다시' 를 누른 항목. 기억 지속력이 0.212일뿐이라 한 번으로는 목표한 날을 못 맞춘다. */
const WEAK = defaultFsrs.nextState(null, 0, 1)

function makeGoal(): GoalRow {
  return {
    id: 'g1',
    name: '시험',
    horizon_kind: 'date',
    ready_at: EXAM,
    hold_until: EXAM,
    target_retention: 0.9,
    intensity: 'standard',
    min_reviews: 1,
    max_interval_days: null,
    post_goal_mode: 'archive',
    color: null,
    created_at: '2026-08-01T00:00:00.000Z',
    archived_at: null,
  }
}

function makeItem(): ItemRow {
  return {
    id: 'itm001',
    goal_id: 'g1',
    title: '한 번으로 부족한 항목',
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
    state: 'relearning',
    stability: WEAK.stability,
    difficulty: WEAK.difficulty,
    due: addDays(TODAY, 1),
    due_kind: 'deadline_pull',
    due_source: 'fsrs',
    last_review: TODAY,
    reps: 1,
    lapses: 1,
    reps_since_goal: 1,
    goal_risk: null,
    archived_at: null,
  }
}

async function setup(bufferDays = 2): Promise<void> {
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
    items: [makeItem()],
    reviews: [],
    settings: {
      targetRetention: '0.9',
      bufferDays: String(bufferDays),
      minReviews: '1',
      dailyCap: '20',
    },
  })
  usePlanner.getState().setToday(TODAY)
  await usePlanner.getState().recomputeAll()
}

describe('한 번으로 부족한 항목', () => {
  it('전제 확인: 실제로 부족으로 판정된다', async () => {
    await setup()
    const { settings } = usePlanner.getState()
    const iv = feasibleInterval({
      itemId: 'itm001',
      state: WEAK,
      anchor: TODAY,
      readyAt: EXAM,
      notBefore: TODAY,
      bufferDays: settings.bufferDays,
      targetRetention: settings.targetRetention,
    })
    expect(iv.atRisk).toBe(true)
    expect(iv.hasRoomBeforeGoal).toBe(true)
    expect(usePlanner.getState().items[0].goal_risk).toBe('at_risk')
  })

  it('첫 복습을 마치고 다시 계산하면 두 번째가 새로 잡힌다', async () => {
    await setup()
    const first = usePlanner.getState().items[0].due!
    expect(toEpochDay(first)).toBeLessThan(toEpochDay(EXAM))

    usePlanner.getState().setToday(first)
    await usePlanner.getState().rateItem('itm001', 3, { reviewedAt: first })
    await usePlanner.getState().recomputeAll()

    const after = usePlanner.getState().items[0]
    expect(after.due).not.toBeNull()
    // 두 번째 복습이 목표한 날 전에 잡혀 있어야 한다.
    expect(toEpochDay(after.due!)).toBeGreaterThan(toEpochDay(first))
    expect(toEpochDay(after.due!)).toBeLessThanOrEqual(toEpochDay(EXAM))
  })

  it('두 번째까지 마치면 목표한 날 기억률이 목표치 이상이 된다', async () => {
    await setup()
    const { settings } = usePlanner.getState()

    let cursor = usePlanner.getState().items[0].due!
    for (let i = 0; i < 6; i += 1) {
      if (toEpochDay(cursor) > toEpochDay(EXAM)) break
      usePlanner.getState().setToday(cursor)
      await usePlanner.getState().rateItem('itm001', 3, { reviewedAt: cursor })
      await usePlanner.getState().recomputeAll()
      const next = usePlanner.getState().items[0].due
      if (!next || toEpochDay(next) > toEpochDay(EXAM)) break
      cursor = next
    }

    const item = usePlanner.getState().items[0]
    const atGoal = defaultFsrs.retrievability(
      Math.max(0, toEpochDay(EXAM) - toEpochDay(item.last_review!)),
      item.stability!
    )
    expect(atGoal).toBeGreaterThanOrEqual(settings.targetRetention - 1e-9)
  })
})

describe('잡아둔 복습 목록', () => {
  it('부족한 항목에는 서로 다른 두 날짜가 실제로 잡힌다', async () => {
    await setup()
    const planned = usePlanner
      .getState()
      .planned.filter((p) => p.item_id === 'itm001')

    expect(planned).toHaveLength(2)
    expect(planned[0].ordinal).toBe(0)
    expect(planned[1].ordinal).toBe(1)
    expect(planned[0].date).not.toBe(planned[1].date)
    expect(planned[0].date < planned[1].date).toBe(true)
    // 둘 다 목표한 날 전이어야 한다.
    for (const row of planned) {
      expect(toEpochDay(row.date)).toBeLessThan(toEpochDay(EXAM))
    }
  })

  it('items.due 는 가장 이른 배정일과 같다', async () => {
    await setup()
    const state = usePlanner.getState()
    for (const item of state.items) {
      const mine = state.planned
        .filter((p) => p.item_id === item.id)
        .map((p) => p.date)
        .sort()
      if (mine.length === 0) continue
      expect(item.due).toBe(mine[0])
    }
  })

  it('보통 항목에는 하나만 잡힌다', async () => {
    resetRepositoryForTest()
    resetPlannerForTest()
    usePlanner.setState({
      ready: false,
      goals: [],
      items: [],
      reviews: [],
      planned: [],
      today: TODAY,
    })
    await usePlanner.getState().load()
    usePlanner.getState().setToday(TODAY)
    await usePlanner.getState().addItem({ title: '평범한 항목' })

    const planned = usePlanner.getState().planned
    expect(planned).toHaveLength(1)
    expect(planned[0].ordinal).toBe(0)
  })

  it('저장소에도 남고 다시 읽어도 그대로다', async () => {
    await setup()
    const before = usePlanner.getState().planned
    expect(before.length).toBeGreaterThan(0)

    usePlanner.setState({ ready: false, goals: [], items: [], reviews: [], planned: [] })
    await usePlanner.getState().load()
    usePlanner.getState().setToday(TODAY)

    expect(usePlanner.getState().planned).toEqual(before)
  })

  it('다시 계산해도 같은 목록이 나온다', async () => {
    await setup()
    const first = usePlanner.getState().planned
    for (let i = 0; i < 3; i += 1) {
      await usePlanner.getState().recomputeAll()
    }
    expect(usePlanner.getState().planned).toEqual(first)
  })

  it('항목을 지우면 잡아둔 복습도 사라진다', async () => {
    await setup()
    await usePlanner.getState().deleteItem('itm001')
    expect(usePlanner.getState().planned).toEqual([])
  })
})

describe('예보가 두 번을 다 센다', () => {
  it('부족한 항목이 잡힌 날마다 한 번씩 세어진다', async () => {
    await setup()
    const { items, planned, settings } = usePlanner.getState()
    const item = items[0]
    const dates = planned
      .filter((p) => p.item_id === item.id)
      .map((p) => p.date)
      .sort()
    expect(dates).toHaveLength(2)

    const projected = projectItem({
      itemId: item.id,
      state: { stability: item.stability!, difficulty: item.difficulty! },
      anchor: item.last_review ?? item.first_studied_at,
      due: item.due!,
      from: TODAY,
      days: 3,
      horizon: { kind: 'date', at: EXAM },
      intensity: 'standard',
      targetRetention: settings.targetRetention,
      minReviews: 1,
      repsSinceGoal: item.reps_since_goal,
      bufferDays: settings.bufferDays,
      maxIntervalDays: null,
      plannedDates: dates,
    })

    // 잡아둔 두 날짜가 모두 예보에 들어간다.
    for (const date of dates) {
      expect(projected.map((p) => p.date)).toContain(date)
    }
  })

  it('잡아둔 날짜를 안 주면 하나만 센다', async () => {
    await setup()
    const { items, settings } = usePlanner.getState()
    const item = items[0]
    const projected = projectItem({
      itemId: item.id,
      state: { stability: item.stability!, difficulty: item.difficulty! },
      anchor: item.last_review ?? item.first_studied_at,
      due: item.due!,
      from: TODAY,
      days: 1,
      horizon: { kind: 'date', at: EXAM },
      intensity: 'standard',
      targetRetention: settings.targetRetention,
      minReviews: 1,
      repsSinceGoal: item.reps_since_goal,
      bufferDays: settings.bufferDays,
      maxIntervalDays: null,
    })
    expect(projected.length).toBeLessThanOrEqual(2)
  })
})
