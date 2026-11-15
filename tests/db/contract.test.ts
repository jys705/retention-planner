import { beforeEach, describe, expect, it } from 'vitest'
import { LocalRepository } from '../../src/db/local'
import { MemoryRepository } from '../../src/db/memory'
import {
  SnapshotFormatError,
  SnapshotRepository,
  type Snapshot,
  type SnapshotStore,
} from '../../src/db/snapshot'
import type {
  GoalRow,
  ItemRow,
  PlannedReviewRow,
  Repository,
  ReviewRow,
} from '../../src/db/types'

function makeGoal(id: string, overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id,
    name: `목표 ${id}`,
    horizon_kind: 'date',
    ready_at: '2026-10-18',
    hold_until: '2026-10-18',
    target_retention: 0.9,
    intensity: 'standard',
    min_reviews: 3,
    max_interval_days: null,
    post_goal_mode: 'archive',
    color: null,
    created_at: `2026-08-0${id.length}T00:00:00.000Z`,
    archived_at: null,
    ...overrides,
  }
}

function makeItem(id: string, overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id,
    goal_id: null,
    title: `항목 ${id}`,
    memo: '',
    tags: '[]',
    created_at: '2026-08-01T00:00:00.000Z',
    first_studied_at: '2026-08-01',
    horizon_kind: null,
    ready_at: null,
    hold_until: null,
    target_retention: null,
    intensity: null,
    min_reviews: null,
    state: 'new',
    stability: null,
    difficulty: null,
    due: null,
    due_kind: null,
    due_source: null,
    last_review: null,
    reps: 0,
    lapses: 0,
    reps_since_goal: 0,
    goal_risk: null,
    archived_at: null,
    ...overrides,
  }
}

function makeReview(
  id: string,
  itemId: string,
  overrides: Partial<ReviewRow> = {}
): ReviewRow {
  return {
    id,
    item_id: itemId,
    reviewed_at: '2026-08-05',
    recorded_at: '2026-08-05T09:00:00.000Z',
    rating: 3,
    state_before: 'new',
    s_before: null,
    d_before: null,
    s_after: 2.3065,
    d_after: 5.1,
    elapsed_days: 0,
    scheduled_days: 0,
    r_at_review: 1,
    next_interval: 2,
    memo_snapshot: null,
    ...overrides,
  }
}

function makePlanned(
  id: string,
  itemId: string,
  overrides: Partial<PlannedReviewRow> = {}
): PlannedReviewRow {
  return {
    id,
    item_id: itemId,
    date: '2026-08-13',
    ordinal: 0,
    kind: 'normal',
    source: 'fsrs',
    ...overrides,
  }
}

/**
 * 두 구현이 같은 계약을 만족하는지 확인한다.
 * SQLite 구현은 Tauri 안에서만 살아나므로 여기서는 인메모리만 돌고,
 * Tauri 환경이 생기면 같은 묶음을 그쪽에도 걸어준다.
 */
export function runRepositoryContract(
  label: string,
  create: () => Promise<Repository>
): void {
  describe(`저장소 계약: ${label}`, () => {
    let repo: Repository

    beforeEach(async () => {
      repo = await create()
    })

    it('목표를 넣고 다시 읽는다', async () => {
      const g = makeGoal('g1')
      await repo.insertGoal(g)
      expect(await repo.getGoal('g1')).toEqual(g)
      expect(await repo.listGoals()).toEqual([g])
    })

    it('없는 목표는 null 이다', async () => {
      expect(await repo.getGoal('없음')).toBeNull()
    })

    it('목표를 부분 수정한다', async () => {
      await repo.insertGoal(makeGoal('g1'))
      await repo.updateGoal('g1', { name: '바뀐 이름', min_reviews: 5 })
      const g = await repo.getGoal('g1')
      expect(g?.name).toBe('바뀐 이름')
      expect(g?.min_reviews).toBe(5)
      expect(g?.intensity).toBe('standard')
    })

    it('목표를 지우면 항목의 소속만 풀린다', async () => {
      await repo.insertGoal(makeGoal('g1'))
      await repo.insertItem(makeItem('i1', { goal_id: 'g1' }))
      await repo.deleteGoal('g1')
      expect(await repo.getGoal('g1')).toBeNull()
      const item = await repo.getItem('i1')
      expect(item).not.toBeNull()
      expect(item?.goal_id).toBeNull()
    })

    it('항목을 넣고 다시 읽는다', async () => {
      const i = makeItem('i1')
      await repo.insertItem(i)
      expect(await repo.getItem('i1')).toEqual(i)
      expect(await repo.listItems()).toEqual([i])
    })

    it('항목을 부분 수정한다', async () => {
      await repo.insertItem(makeItem('i1'))
      await repo.updateItem('i1', {
        state: 'review',
        stability: 3.5,
        difficulty: 5.2,
        due: '2026-08-09',
        due_kind: 'normal',
        due_source: 'fsrs',
      })
      const item = await repo.getItem('i1')
      expect(item?.state).toBe('review')
      expect(item?.stability).toBeCloseTo(3.5, 12)
      expect(item?.due).toBe('2026-08-09')
      expect(item?.title).toBe('항목 i1')
    })

    it('null 로 되돌리는 수정도 반영된다', async () => {
      await repo.insertItem(makeItem('i1', { due: '2026-08-09' }))
      await repo.updateItem('i1', { due: null })
      expect((await repo.getItem('i1'))?.due).toBeNull()
    })

    it('항목을 지우면 그 평가 이력도 함께 사라진다', async () => {
      await repo.insertItem(makeItem('i1'))
      await repo.insertItem(makeItem('i2'))
      await repo.insertReview(makeReview('r1', 'i1'))
      await repo.insertReview(makeReview('r2', 'i2'))
      await repo.deleteItem('i1')
      expect(await repo.getItem('i1')).toBeNull()
      expect((await repo.listReviews()).map((r) => r.id)).toEqual(['r2'])
    })

    it('평가 이력을 항목별로 읽고 시간순으로 돌려준다', async () => {
      await repo.insertItem(makeItem('i1'))
      await repo.insertReview(
        makeReview('r2', 'i1', { reviewed_at: '2026-08-10' })
      )
      await repo.insertReview(
        makeReview('r1', 'i1', { reviewed_at: '2026-08-05' })
      )
      const rows = await repo.listReviewsByItem('i1')
      expect(rows.map((r) => r.id)).toEqual(['r1', 'r2'])
    })

    it('설정을 넣고 덮어쓴다', async () => {
      expect(await repo.getSetting('theme')).toBeNull()
      await repo.setSetting('theme', 'system')
      expect(await repo.getSetting('theme')).toBe('system')
      await repo.setSetting('theme', 'dark')
      expect(await repo.getSetting('theme')).toBe('dark')
      await repo.setSetting('daily_cap', '20')
      expect(await repo.listSettings()).toEqual({
        theme: 'dark',
        daily_cap: '20',
      })
    })

    it('통째로 갈아끼운다', async () => {
      await repo.insertGoal(makeGoal('old'))
      await repo.insertItem(makeItem('old-i'))
      await repo.setSetting('theme', 'light')

      const goals = [makeGoal('g9')]
      const items = [makeItem('i9', { goal_id: 'g9' })]
      const reviews = [makeReview('r9', 'i9')]
      await repo.replaceAll({
        goals,
        items,
        reviews,
        settings: { theme: 'dark' },
      })

      expect((await repo.listGoals()).map((g) => g.id)).toEqual(['g9'])
      expect((await repo.listItems()).map((i) => i.id)).toEqual(['i9'])
      expect((await repo.listReviews()).map((r) => r.id)).toEqual(['r9'])
      expect(await repo.listSettings()).toEqual({ theme: 'dark' })
    })

    it('돌려준 값을 바깥에서 고쳐도 저장된 내용이 바뀌지 않는다', async () => {
      await repo.insertItem(makeItem('i1'))
      const first = await repo.getItem('i1')
      if (first) first.title = '바꿔치기'
      expect((await repo.getItem('i1'))?.title).toBe('항목 i1')
    })

    it('잡아둔 복습을 통째로 갈아끼운다', async () => {
      await repo.insertItem(makeItem('i1'))
      expect(await repo.listPlannedReviews()).toEqual([])

      const rows = [
        makePlanned('i1#0', 'i1', { date: '2026-08-13', ordinal: 0 }),
        makePlanned('i1#1', 'i1', { date: '2026-08-16', ordinal: 1 }),
      ]
      await repo.replacePlannedReviews(rows)
      expect(await repo.listPlannedReviews()).toEqual(rows)

      await repo.replacePlannedReviews([
        makePlanned('i1#0', 'i1', { date: '2026-08-20' }),
      ])
      const after = await repo.listPlannedReviews()
      expect(after).toHaveLength(1)
      expect(after[0].date).toBe('2026-08-20')
    })

    it('잡아둔 복습을 날짜순으로 돌려준다', async () => {
      await repo.insertItem(makeItem('i1'))
      await repo.insertItem(makeItem('i2'))
      await repo.replacePlannedReviews([
        makePlanned('i2#0', 'i2', { date: '2026-08-20' }),
        makePlanned('i1#1', 'i1', { date: '2026-08-16', ordinal: 1 }),
        makePlanned('i1#0', 'i1', { date: '2026-08-13' }),
      ])
      expect((await repo.listPlannedReviews()).map((r) => r.id)).toEqual([
        'i1#0',
        'i1#1',
        'i2#0',
      ])
    })

    it('항목을 지우면 잡아둔 복습도 함께 사라진다', async () => {
      await repo.insertItem(makeItem('i1'))
      await repo.insertItem(makeItem('i2'))
      await repo.replacePlannedReviews([
        makePlanned('i1#0', 'i1'),
        makePlanned('i2#0', 'i2'),
      ])
      await repo.deleteItem('i1')
      expect((await repo.listPlannedReviews()).map((r) => r.id)).toEqual([
        'i2#0',
      ])
    })

    it('통째로 갈아끼우면 잡아둔 복습은 비워진다', async () => {
      await repo.insertItem(makeItem('i1'))
      await repo.replacePlannedReviews([makePlanned('i1#0', 'i1')])
      await repo.replaceAll({
        goals: [],
        items: [makeItem('i9')],
        reviews: [],
        settings: {},
      })
      expect(await repo.listPlannedReviews()).toEqual([])
    })

    it('같은 id 를 두 번 넣으면 막는다', async () => {
      await repo.insertItem(makeItem('i1'))
      await expect(repo.insertItem(makeItem('i1'))).rejects.toThrow()
    })

    it('지운 흔적을 남기고 같은 것은 더 나중에 지운 때로 남긴다', async () => {
      await repo.addTombstones([
        { id: 'i1', kind: 'item', deleted_at: '2026-08-02T00:00:00.000Z' },
        { id: 'r1', kind: 'review', deleted_at: '2026-08-01T00:00:00.000Z' },
      ])
      await repo.addTombstones([
        { id: 'i1', kind: 'item', deleted_at: '2026-08-01T00:00:00.000Z' },
        { id: 'r1', kind: 'review', deleted_at: '2026-08-03T00:00:00.000Z' },
      ])
      expect(await repo.listTombstones()).toEqual([
        { id: 'i1', kind: 'item', deleted_at: '2026-08-02T00:00:00.000Z' },
        { id: 'r1', kind: 'review', deleted_at: '2026-08-03T00:00:00.000Z' },
      ])
    })

    it('통째로 갈아끼우면 지운 흔적도 갈아끼운다', async () => {
      await repo.addTombstones([{ id: 'old', kind: 'goal', deleted_at: '2026-08-01T00:00:00.000Z' }])
      const fresh = { id: 'new', kind: 'item' as const, deleted_at: '2026-08-05T00:00:00.000Z' }
      await repo.replaceAll({ goals: [], items: [], reviews: [], settings: {}, tombstones: [fresh] })
      expect(await repo.listTombstones()).toEqual([fresh])
    })

    it('사람이 고친 때를 저장하고 그대로 읽는다', async () => {
      await repo.insertItem(makeItem('i1', { updated_at: '2026-08-01T00:00:00.000Z' }))
      await repo.updateItem('i1', { title: '고침', updated_at: '2026-08-02T00:00:00.000Z' })
      expect((await repo.getItem('i1'))?.updated_at).toBe('2026-08-02T00:00:00.000Z')
      await repo.insertGoal(makeGoal('g1', { updated_at: '2026-08-03T00:00:00.000Z' }))
      expect((await repo.getGoal('g1'))?.updated_at).toBe('2026-08-03T00:00:00.000Z')
    })
  })
}

runRepositoryContract('memory', async () => {
  const repo = new MemoryRepository()
  await repo.init()
  return repo
})

// 브라우저용 구현도 같은 계약을 만족해야 한다.
runRepositoryContract('local', async () => {
  installFakeLocalStorage()
  const repo = new LocalRepository()
  await repo.init()
  return repo
})

/** 노드에는 localStorage 가 없으므로 같은 모양의 가짜를 끼운다. */
function installFakeLocalStorage(): void {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  })
}

describe('브라우저 저장소는 새로고침을 견딘다', () => {
  it('다시 열어도 적어둔 게 남아 있다', async () => {
    installFakeLocalStorage()

    const first = new LocalRepository()
    await first.init()
    await first.insertGoal(makeGoal('g1'))
    await first.insertItem(makeItem('i1', { goal_id: 'g1' }))
    await first.insertReview(makeReview('r1', 'i1'))
    await first.setSetting('theme', 'dark')

    // 새로고침에 해당한다. 같은 저장 공간에 새 인스턴스를 붙인다.
    const second = new LocalRepository()
    await second.init()

    expect((await second.listGoals()).map((g) => g.id)).toEqual(['g1'])
    expect((await second.listItems()).map((i) => i.id)).toEqual(['i1'])
    expect((await second.listReviews()).map((r) => r.id)).toEqual(['r1'])
    expect(await second.getSetting('theme')).toBe('dark')
  })

  it('지운 흔적도 새로고침을 견딘다', async () => {
    installFakeLocalStorage()
    const first = new LocalRepository()
    await first.init()
    await first.addTombstones([{ id: 'i1', kind: 'item', deleted_at: '2026-08-02T00:00:00.000Z' }])
    const second = new LocalRepository()
    await second.init()
    expect((await second.listTombstones()).map((t) => t.id)).toEqual(['i1'])
  })

  it('저장된 내용이 깨져 있으면 빈 상태로 시작한다', async () => {
    installFakeLocalStorage()
    globalThis.localStorage.setItem('retention-planner:v1', '{{ 깨짐')
    const repo = new LocalRepository()
    await expect(repo.init()).resolves.toBeUndefined()
    expect(await repo.listItems()).toEqual([])
  })
})

/**
 * 비동기로 쓰는 곳. 옵시디언의 saveData 가 이렇다.
 *
 * 쓰기마다 걸리는 시간을 따로 줄 수 있다. 늦게 시작한 쓰기가 먼저 끝나는 경우를 만든다.
 */
function asyncStore(initial: unknown = null, delays: number[] = []) {
  const state = { saved: initial as unknown, writes: 0 }
  const store: SnapshotStore = {
    read: async () => (state.saved === null ? null : structuredClone(state.saved)),
    write: (snapshot: Snapshot) => {
      const copy = structuredClone(snapshot)
      const delay = delays.shift() ?? 0
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          state.saved = copy
          state.writes += 1
          resolve()
        }, delay)
      )
    },
  }
  return { store, state }
}

runRepositoryContract('snapshot', async () => {
  const repo = new SnapshotRepository(asyncStore().store)
  await repo.init()
  return repo
})

describe('통째로 남기는 저장소', () => {
  it('늦게 시작한 쓰기가 먼저 끝나도 마지막 상태가 남는다', async () => {
    // 첫 쓰기는 오래 걸리고 두 번째는 바로 끝난다. 차례를 안 지키면 첫 쓰기가 나중에
    // 끝나면서 그 전 상태로 덮는다.
    const { store, state } = asyncStore(null, [40, 0])
    const repo = new SnapshotRepository(store)
    await repo.init()
    const first = repo.insertGoal(makeGoal('g1'))
    // 첫 쓰기가 제 몫을 찍어 들고 쓰는 동안 두 번째 쓰기가 끼어든다.
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = repo.insertItem(makeItem('i1'))
    await Promise.all([first, second])
    await repo.flush()
    const saved = state.saved as Snapshot
    expect(saved.goals.map((g) => g.id)).toEqual(['g1'])
    expect(saved.items.map((i) => i.id)).toEqual(['i1'])
  })

  it('다시 열면 남긴 기록과 지운 흔적을 그대로 읽는다', async () => {
    const { store } = asyncStore()
    const first = new SnapshotRepository(store)
    await first.init()
    await first.insertGoal(makeGoal('g1'))
    await first.insertItem(makeItem('i1', { goal_id: 'g1' }))
    await first.insertReview(makeReview('r1', 'i1'))
    await first.addTombstones([{ id: 'i9', kind: 'item', deleted_at: '2026-08-02T00:00:00.000Z' }])
    await first.setSetting('theme', 'dark')
    await first.flush()

    const second = new SnapshotRepository(store)
    await second.init()
    expect((await second.listItems()).map((i) => i.id)).toEqual(['i1'])
    expect((await second.listReviews()).map((r) => r.id)).toEqual(['r1'])
    expect((await second.listTombstones()).map((t) => t.id)).toEqual(['i9'])
    expect(await second.getSetting('theme')).toBe('dark')
  })

  it('남은 것을 못 읽으면 멈추고 아무것도 쓰지 않는다', async () => {
    const { store, state } = asyncStore({ items: '항목이 아님' })
    const repo = new SnapshotRepository(store)
    await expect(repo.init()).rejects.toBeInstanceOf(SnapshotFormatError)
    expect(state.writes).toBe(0)
    expect(state.saved).toEqual({ items: '항목이 아님' })
  })

  it('읽다가 던지면 그 오류를 그대로 넘긴다', async () => {
    const repo = new SnapshotRepository({
      read: async () => {
        throw new SyntaxError('깨진 JSON')
      },
      write: async () => {
        throw new Error('쓰면 안 된다')
      },
    })
    await expect(repo.init()).rejects.toThrow('깨진 JSON')
  })

  it('빈 상태로 시작하라고 했으면 못 읽어도 빈 상태로 연다', async () => {
    const { store } = asyncStore([1, 2, 3])
    const repo = new SnapshotRepository(store, { startEmptyWhenUnreadable: true })
    await repo.init()
    expect(await repo.listItems()).toEqual([])
  })

  it('다른 곳에서 고친 것을 다시 읽는다', async () => {
    const { store, state } = asyncStore()
    const repo = new SnapshotRepository(store)
    await repo.init()
    await repo.insertItem(makeItem('i1'))
    await repo.flush()
    const outside = structuredClone(state.saved) as Snapshot
    outside.items.push(makeItem('i2', { created_at: '2026-08-02T00:00:00.000Z' }))
    state.saved = outside
    await repo.reload()
    expect((await repo.listItems()).map((i) => i.id)).toEqual(['i1', 'i2'])
  })

  it('잡아둔 복습도 같이 남겨 켜자마자 보여 준다', async () => {
    const { store } = asyncStore()
    const repo = new SnapshotRepository(store)
    await repo.init()
    await repo.insertItem(makeItem('i1'))
    const planned: PlannedReviewRow = {
      id: 'p1',
      item_id: 'i1',
      date: '2026-08-05',
      ordinal: 0,
      kind: 'normal',
      source: 'fsrs',
    }
    await repo.replacePlannedReviews([planned])
    await repo.flush()
    const again = new SnapshotRepository(store)
    await again.init()
    expect((await again.listPlannedReviews()).map((p) => p.id)).toEqual(['p1'])
  })
})
