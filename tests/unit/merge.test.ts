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
// 처음 공부한 날의 평가. 앱이 항목을 적을 때 남기는 꼴 그대로다. 앞선 기억이 없다.
const r0: ReviewRow = {
  ...review('r0', 'i1', '2026-03-01', 3),
  state_before: 'new',
  s_before: null,
  d_before: null,
  elapsed_days: 0,
  scheduled_days: 0,
  r_at_review: 1,
}

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

  it('같은 행은 칸이 적힌 차례와 상관없이 같은 쪽을 고른다', () => {
    // SQLite 는 표의 칸 차례로, 브라우저 저장소는 처음 적은 차례로 행을 돌려준다.
    // 고친 때가 같을 때 그 차례로 견주면 같은 두 행이 저장한 곳마다 다르게 갈린다.
    // 두 행은 다음 날짜와 보관한 때가 서로 엇갈리게 다르다. 어느 칸부터 보느냐에 따라 답이 갈린다.
    const x = { ...base, state: 'archived' as const, due: '2026-03-20', archived_at: '2026-03-01T08:00:00.000Z' }
    const y = { ...base, state: 'archived' as const, due: '2026-03-10', archived_at: '2026-03-09T08:00:00.000Z' }
    const reversed = <T extends object>(row: T): T =>
      Object.fromEntries(Object.entries(row).reverse()) as T
    const picks = [
      mergeSnapshots(snapshot({ items: [x] }), snapshot({ items: [y] })),
      mergeSnapshots(snapshot({ items: [reversed(x)] }), snapshot({ items: [y] })),
      mergeSnapshots(snapshot({ items: [y] }), snapshot({ items: [reversed(x)] })),
      mergeSnapshots(snapshot({ items: [reversed(y)] }), snapshot({ items: [x] })),
    ].map((m) => m.items[0].due)
    expect(new Set(picks).size).toBe(1)
  })

  it('옛 판 파일에 없던 칸 때문에 이쪽 값이 지워지지 않는다', () => {
    const at = '2026-03-01T00:00:00.000Z'
    const mine = aGoal({ id: 'g1', created_at: at, updated_at: at, goal_day: 'rest' })
    const old = { ...aGoal({ id: 'g1', created_at: at }) } as Record<string, unknown>
    delete old.updated_at
    delete old.goal_day
    const merged = mergeSnapshots(
      snapshot({ goals: [mine] }),
      snapshot({ goals: [old as unknown as typeof mine] })
    )
    expect(merged.goals[0].goal_day).toBe('rest')
    const reverse = mergeSnapshots(
      snapshot({ goals: [old as unknown as typeof mine] }),
      snapshot({ goals: [mine] })
    )
    expect(reverse.goals[0].goal_day).toBe('rest')
  })

  it('지워진 목표를 가리키던 항목은 그 목표와 함께 알린다', () => {
    const goal = aGoal({ id: 'g1' })
    const member = { ...base, goal_id: 'g1' }
    const gone: TombstoneRow = { id: 'g1', kind: 'goal', deleted_at: '2026-03-02T00:00:00.000Z' }
    const merged = mergeSnapshots(
      snapshot({ items: [{ ...member, goal_id: null }], tombstones: [gone] }),
      snapshot({ goals: [goal], items: [member] })
    )
    expect(merged.goals).toEqual([])
    expect(merged.items[0].goal_id).toBeNull()
    // 어느 쪽 행이 골라졌든 지운 목표를 알 수 있어야 끝난 목표의 시점을 옮겨 담는다.
    const fromOther = mergeSnapshots(
      snapshot({ items: [member], tombstones: [gone] }),
      snapshot({ goals: [goal], items: [member] })
    )
    expect(fromOther.detached.get('i1')).toEqual(goal)
  })

  it('처음 공부한 기록이 없는 아주 옛 이력은 다시 셈하지 않는다', () => {
    // 첫 평가 기록 없이 상태만 남은 행. 남은 평가만으로 돌리면 그 앞의 기억을 잃는다.
    const legacy = { ...base, reps: 2, stability: 18.4, difficulty: 5.1, last_review: '2026-03-04' }
    const merged = mergeSnapshots(
      snapshot({ items: [legacy] }),
      snapshot({ items: [legacy], reviews: [review('r1', 'i1', '2026-03-04', 3)] })
    )
    expect(merged.items[0].stability).toBe(18.4)
    expect(merged.items[0].reps).toBe(2)
    expect(merged.refreshed.has('i1')).toBe(false)
  })

  it('합친 뒤 평가 하나하나의 그때 값을 다시 적는다', () => {
    const local = snapshot({ items: [base], reviews: [r0, review('r1', 'i1', '2026-03-05', 3)] })
    const incoming = snapshot({ items: [base], reviews: [r0, review('r2', 'i1', '2026-03-08', 2)] })
    const merged = mergeSnapshots(local, incoming)
    const byId = new Map(merged.reviews.map((r) => [r.id, r]))
    const r1 = byId.get('r1')!
    const r2 = byId.get('r2')!
    // r2 는 r1 을 모른 채 3월 1일에서 7일 지난 것으로 적혀 왔다. 합친 뒤에는 r1 에서 3일이다.
    expect(r2.elapsed_days).toBe(3)
    expect(r2.s_before).toBe(r1.s_after)
    expect(r1.s_before).toBe(byId.get('r0')!.s_after)
    expect(merged.items[0].stability).toBe(r2.s_after)
  })
})
