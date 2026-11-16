import { describe, expect, it } from 'vitest'
import { defaultFsrs } from '../../src/core/fsrs/fsrs6'
import { buildItemView } from '../../src/features/item/itemView'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'
import type { GoalRow, ItemRow } from '../../src/db/types'

const TODAY = '2026-10-01'

const item = (over: Partial<ItemRow> = {}): ItemRow => ({
  id: 'i1', goal_id: 'g1', title: '항목', memo: '', tags: '[]',
  created_at: '2026-01-01T00:00:00.000Z', first_studied_at: '2026-09-01',
  horizon_kind: null, ready_at: null, hold_until: null, target_retention: null,
  intensity: null, min_reviews: null, state: 'review', stability: 12,
  difficulty: 5.2, due: '2026-10-05', due_kind: 'normal', due_source: 'fsrs',
  last_review: '2026-09-24', reps: 3, lapses: 0, reps_since_goal: 3,
  goal_risk: null, archived_at: null, ...over,
})

const goal = (over: Partial<GoalRow> = {}): GoalRow => ({
  id: 'g1', name: '목표', horizon_kind: 'open', ready_at: null, hold_until: null,
  target_retention: 0.9, intensity: 'standard', min_reviews: 3,
  max_interval_days: null, post_goal_mode: 'archive', color: null,
  created_at: '2026-01-01T00:00:00.000Z', archived_at: null, ...over,
})

const lastDay = (g: GoalRow | null) =>
  buildItemView(item(), g, [], DEFAULT_SETTINGS, TODAY).curve.at(-1)!.date

describe('기억 곡선이 그리는 기간', () => {
  it('S-197 목표한 날을 정했으면 그 날에서 끊는다', () => {
    // 그 뒤는 물어본 적이 없는 구간이다.
    expect(
      lastDay(goal({ horizon_kind: 'date', ready_at: '2026-10-20', hold_until: '2026-10-20' }))
    ).toBe('2026-10-20')
  })

  it('S-198 대략으로 잡았으면 늦은 쪽 끝에서 끊는다', () => {
    expect(
      lastDay(goal({ horizon_kind: 'window', ready_at: '2026-10-15', hold_until: '2026-11-02' }))
    ).toBe('2026-11-02')
  })

  it('S-199 목표를 고치면 끝나는 날도 따라 움직인다', () => {
    const a = lastDay(goal({ horizon_kind: 'date', ready_at: '2026-10-20', hold_until: '2026-10-20' }))
    const b = lastDay(goal({ horizon_kind: 'date', ready_at: '2026-12-01', hold_until: '2026-12-01' }))
    expect(a).toBe('2026-10-20')
    expect(b).toBe('2026-12-01')
  })

  it('S-200 목표 시점을 안 정했으면 예전처럼 앞을 넉넉히 본다', () => {
    expect(lastDay(goal()) >= '2026-10-31').toBe(true)
    expect(lastDay(null) >= '2026-10-31').toBe(true)
  })
})

describe('오늘 볼 차례인 항목의 기억 곡선', () => {
  // 처음 공부하고 한 번도 안 본 채 이틀 밀린 항목이다. 지금 기억률은 목표 아래이고
  // 오늘 보라고 잡혀 있다. 기억 상태는 처음 공부한 날 '무난함' 을 누른 그대로다.
  const first = defaultFsrs.nextState(null, 0, 3)
  const overdue = item({
    first_studied_at: '2026-09-27',
    last_review: '2026-09-27',
    due: '2026-09-29',
    stability: first.stability,
    difficulty: first.difficulty,
    reps: 1,
    reps_since_goal: 1,
  })
  const view = buildItemView(overdue, goal(), [], DEFAULT_SETTINGS, TODAY)
  const at = (date: string) => view.curve.find((p) => p.date === date)!

  it('S-312 오늘은 아직 안 본 지금 값이고, 오늘 보면 오를 값을 따로 둔다', () => {
    expect(at(TODAY).retention).toBeCloseTo(view.retention, 8)
    expect(at(TODAY).retention).toBeLessThan(0.9)
    expect(at(TODAY).reviewed).toBe(false)
    expect(at(TODAY).planned).toBeCloseTo(1, 8)
    // 오늘이 아닌 날에는 그런 값이 없다.
    expect(view.curve.filter((p) => p.planned !== null).map((p) => p.date)).toEqual([TODAY])
  })

  it('S-313 앞날의 점선은 오늘 본 것으로 이어 그려서 계획대로면 목표 아래로 내려가지 않는다', () => {
    // 오늘 할 복습을 빼먹고 그리면 다음 복습 전까지 목표보다 한참 아래로 떨어진다.
    const ahead = view.curve.filter((p) => p.projected)
    expect(ahead.length).toBeGreaterThan(20)
    const lowest = Math.min(...ahead.map((p) => Math.min(p.retention, p.before)))
    expect(lowest).toBeGreaterThan(0.88)
    // 내일은 오늘 본 직후에서 하루 내려온 값이다.
    expect(at('2026-10-02').retention).toBeGreaterThan(0.97)
  })

  it('S-314 복습한 날은 복습 바로 전 값과 직후 값을 같이 둔다', () => {
    const reviewDays = view.curve.filter((p) => p.reviewed && p.projected)
    expect(reviewDays.length).toBeGreaterThan(0)
    for (const day of reviewDays) {
      expect(day.retention).toBeCloseTo(1, 8)
      expect(day.before).toBeLessThan(day.retention)
    }
    // 복습이 없는 날은 전과 후가 같다.
    for (const day of view.curve.filter((p) => !p.reviewed)) {
      expect(day.before).toBe(day.retention)
    }
  })
})
