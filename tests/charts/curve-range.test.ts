import { describe, expect, it } from 'vitest'
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
