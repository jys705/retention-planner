import { describe, expect, it } from 'vitest'
import { replayByDay } from '../../src/core/simulate/replay'
import type { ReviewRow, TombstoneRow } from '../../src/db/types'
import { mergeSnapshots, type MergeSnapshot } from '../../src/lib/merge'
import { aGoal, anItem } from '../scenarios/harness'

function review(
  id: string,
  itemId: string,
  day: string,
  rating: 1 | 2 | 3 | 4,
  recordedAt = `${day}T09:00:00.000Z`
): ReviewRow {
  return {
    id,
    item_id: itemId,
    reviewed_at: day,
    recorded_at: recordedAt,
    rating,
    state_before: 'review',
    s_before: 3,
    d_before: 5,
    s_after: 5,
    d_after: 5,
    elapsed_days: 2,
    scheduled_days: 2,
    r_at_review: 0.9,
    next_interval: 4,
    memo_snapshot: null,
  }
}

function snapshot(over: Partial<MergeSnapshot> = {}): MergeSnapshot {
  return { goals: [], items: [], reviews: [], tombstones: [], ...over }
}

const base = anItem({ id: 'i1', title: '1장', created_at: '2026-03-01T00:00:00.000Z' })
const r0 = review('r0', 'i1', '2026-03-01', 3)

describe('두 컴퓨터의 기록 합치기', () => {
  it('양쪽에서 본 평가가 다 남고 기억 상태는 둘을 다 반영한다', () => {
    const local = snapshot({ items: [base], reviews: [r0, review('r1', 'i1', '2026-03-05', 3)] })
    const incoming = snapshot({ items: [base], reviews: [r0, review('r2', 'i1', '2026-03-08', 2)] })
    const merged = mergeSnapshots(local, incoming)

    expect(merged.reviews.map((r) => r.id)).toEqual(['r0', 'r1', 'r2'])
    const item = merged.items[0]
    const expected = replayByDay(
      merged.reviews.map((r) => ({ reviewedAt: r.reviewed_at, recordedAt: r.recorded_at, rating: r.rating }))
    )!
    expect(item.stability).toBe(expected.state.stability)
    expect(item.difficulty).toBe(expected.state.difficulty)
    expect(item.last_review).toBe('2026-03-08')
    expect(item.reps).toBe(3)
    expect(merged.refreshed.has('i1')).toBe(true)
    expect(merged.addedReviews).toBe(1)
  })

  it('양쪽에서 고쳤으면 나중에 고친 쪽이 남는다', () => {
    const early = { ...base, title: '집에서 고친 제목', updated_at: '2026-03-02T10:00:00.000Z' }
    const late = { ...base, title: '회사에서 고친 제목', updated_at: '2026-03-03T10:00:00.000Z' }
    expect(mergeSnapshots(snapshot({ items: [early] }), snapshot({ items: [late] })).items[0].title).toBe(
      '회사에서 고친 제목'
    )
    expect(mergeSnapshots(snapshot({ items: [late] }), snapshot({ items: [early] })).items[0].title).toBe(
      '회사에서 고친 제목'
    )
  })

  it('한쪽에서 지운 항목은 다른 쪽 기록이 있어도 되살아나지 않는다', () => {
    const gone: TombstoneRow = { id: 'i1', kind: 'item', deleted_at: '2026-03-04T00:00:00.000Z' }
    const local = snapshot({ tombstones: [gone] })
    // 다른 컴퓨터에서는 지우기 전에 한 번 더 봤다. 평가는 손으로 고친 것으로 치지 않는다.
    const incoming = snapshot({ items: [base], reviews: [r0, review('r2', 'i1', '2026-03-08', 3)] })
    const merged = mergeSnapshots(local, incoming)
    expect(merged.items).toEqual([])
    expect(merged.reviews).toEqual([])
    expect(merged.tombstones).toEqual([gone])
  })

  it('지운 뒤에 다른 쪽에서 손으로 고친 것은 남긴다', () => {
    const gone: TombstoneRow = { id: 'i1', kind: 'item', deleted_at: '2026-03-04T00:00:00.000Z' }
    const edited = { ...base, title: '살린 것', updated_at: '2026-03-06T00:00:00.000Z' }
    const merged = mergeSnapshots(snapshot({ tombstones: [gone] }), snapshot({ items: [edited], reviews: [r0] }))
    expect(merged.items.map((i) => i.title)).toEqual(['살린 것'])
  })

  it('물린 평가는 다른 쪽에 있어도 되살아나지 않는다', () => {
    const undone: TombstoneRow = { id: 'r1', kind: 'review', deleted_at: '2026-03-05T09:01:00.000Z' }
    const local = snapshot({ items: [base], reviews: [r0], tombstones: [undone] })
    const incoming = snapshot({ items: [base], reviews: [r0, review('r1', 'i1', '2026-03-05', 1)] })
    const merged = mergeSnapshots(local, incoming)
    expect(merged.reviews.map((r) => r.id)).toEqual(['r0'])
    expect(merged.items[0].lapses).toBe(base.lapses)
  })

  it('지운 목표를 가리키는 항목은 목표 없이 남는다', () => {
    const goal = aGoal({ id: 'g1', created_at: '2026-03-01T00:00:00.000Z' })
    const gone: TombstoneRow = { id: 'g1', kind: 'goal', deleted_at: '2026-03-04T00:00:00.000Z' }
    const member = { ...base, goal_id: 'g1' }
    const merged = mergeSnapshots(snapshot({ tombstones: [gone] }), snapshot({ goals: [goal], items: [member] }))
    expect(merged.goals).toEqual([])
    expect(merged.items[0].goal_id).toBeNull()
  })

  it('어느 쪽에서 합쳐도 같은 기록에 닿는다', () => {
    const goal = aGoal({ id: 'g1', created_at: '2026-03-01T00:00:00.000Z' })
    const a = snapshot({
      goals: [{ ...goal, name: '집 이름', updated_at: '2026-03-02T00:00:00.000Z' }],
      items: [base, anItem({ id: 'i2', title: '집에서 적은 것', created_at: '2026-03-02T00:00:00.000Z' })],
      reviews: [r0, review('r1', 'i1', '2026-03-05', 4)],
      tombstones: [{ id: 'i9', kind: 'item', deleted_at: '2026-03-03T00:00:00.000Z' }],
    })
    const b = snapshot({
      goals: [{ ...goal, name: '회사 이름', updated_at: '2026-03-02T00:00:00.000Z' }],
      items: [{ ...base, memo: '회사 메모', updated_at: '2026-03-06T00:00:00.000Z' }, anItem({ id: 'i9', created_at: '2026-03-01T00:00:00.000Z' })],
      reviews: [r0, review('r2', 'i1', '2026-03-07', 2), review('r9', 'i9', '2026-03-02', 3)],
    })
    const ab = mergeSnapshots(a, b)
    const ba = mergeSnapshots(b, a)
    for (const key of ['goals', 'items', 'reviews', 'tombstones'] as const) {
      expect(ab[key]).toEqual(ba[key])
    }
    // 고친 때가 같아도 한쪽으로 정해진다.
    expect(ab.goals).toHaveLength(1)
    expect(ab.items.map((i) => i.id)).toEqual(['i1', 'i2'])
  })

  it('같은 파일을 두 번 합쳐도 늘지 않는다', () => {
    const local = snapshot({ items: [base], reviews: [r0, review('r1', 'i1', '2026-03-05', 3)] })
    const incoming = snapshot({
      items: [base, anItem({ id: 'i2', created_at: '2026-03-02T00:00:00.000Z' })],
      reviews: [r0, review('r2', 'i1', '2026-03-08', 2)],
    })
    const once = mergeSnapshots(local, incoming)
    const twice = mergeSnapshots(once, incoming)
    expect(twice.items).toEqual(once.items)
    expect(twice.reviews).toEqual(once.reviews)
    expect(twice.addedItems).toBe(0)
    expect(twice.addedReviews).toBe(0)
  })

  it('고친 때 칸이 없는 옛 기록도 합친다', () => {
    const old = { ...base }
    delete (old as { updated_at?: unknown }).updated_at
    const merged = mergeSnapshots(snapshot({ items: [old], reviews: [r0] }), snapshot({ items: [old], reviews: [r0] }))
    expect(merged.items).toHaveLength(1)
    expect(merged.refreshed.size).toBe(0)
  })
})
