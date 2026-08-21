import { beforeEach, describe, expect, it } from 'vitest'
import { LocalRepository } from '../../src/db/local'
import { MemoryRepository } from '../../src/db/memory'
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

  it('저장된 내용이 깨져 있으면 빈 상태로 시작한다', async () => {
    installFakeLocalStorage()
    globalThis.localStorage.setItem('retention-planner:v1', '{{ 깨짐')
    const repo = new LocalRepository()
    await expect(repo.init()).resolves.toBeUndefined()
    expect(await repo.listItems()).toEqual([])
  })
})
