import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS, SCHEMA_VERSION_KEY } from '../../src/db/migrations'
import type {
  GoalRow,
  ItemRow,
  Repository,
  ReviewRow,
} from '../../src/db/types'

/**
 * Tauri 의 SQL 플러그인 자리에 Node 가 가진 SQLite 를 물린다.
 *
 * 앱의 SQLite 구현은 셸 안에서만 도는 플러그인을 거쳐서, 그대로는 시험에서 돌릴 수
 * 없다. 저장 구조를 바꾸는 일은 실제 SQLite 에서 확인해야 한다. 열을 더하는
 * 마이그레이션이 두 번 돌면 앱이 켜지지 않는 식의 실패는 흉내 낸 저장소로는 안 보인다.
 *
 * 플러그인은 연결 하나가 아니라 sqlx 풀을 쓴다. execute 와 select 는 부를 때마다 쉬는
 * 연결을 앞에서 빌려 쓰고 뒤로 돌려놓는다. 앱은 켤 때 읽기 넷을 한꺼번에 하므로 풀에는
 * 이미 연결이 여럿 있다. 그래서 여기서도 파일 하나에 연결을 둘 열어 번갈아 빌려 준다.
 * 연결이 하나뿐이면 BEGIN 과 COMMIT 을 따로 불러도 멀쩡해 보인다.
 */
const dir = mkdtempSync(join(tmpdir(), 'retention-planner-'))

/** 열려 있는 연결. 다 끝나면 닫고 파일을 지운다. */
const connections = new Set<DatabaseSync>()

afterAll(() => {
  for (const db of connections) db.close()
  rmSync(dir, { recursive: true, force: true })
})

function connect(url: string): DatabaseSync {
  const db = new DatabaseSync(join(dir, url.replace(/^sqlite:/, '')))
  connections.add(db)
  return db
}

/** 시험이 저장소를 거치지 않고 파일을 직접 들여다볼 때 쓰는 연결. */
const files = new Map<string, DatabaseSync>()

function file(url: string): DatabaseSync {
  let db = files.get(url)
  if (!db) {
    db = connect(url)
    files.set(url, db)
  }
  return db
}

/** 플러그인은 $1, $2 자리표시와 값 배열을 받는다. Node 쪽은 이름 붙은 값을 받는다. */
function named(params: unknown[] = []): Record<string, unknown> {
  return Object.fromEntries(params.map((value, i) => [`$${i + 1}`, value]))
}

/**
 * sqlx 처럼 문자열에 든 문장을 차례로 다 돌린다. $n 은 어느 문장에 있든 값 배열의
 * n 번째를 가리키고, 한 문장이 깨지면 거기서 멈춘다.
 */
function run(db: DatabaseSync, sql: string, params?: unknown[]): void {
  const values = named(params)
  let rest = sql
  while (rest.trim() !== '') {
    // prepare 는 첫 문장만 읽고, 읽은 만큼을 sourceSQL 로 돌려준다.
    const statement = db.prepare(rest)
    statement.setAllowUnknownNamedParameters(true)
    statement.run(values as never)
    rest = rest.slice(statement.sourceSQL.length)
  }
}

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: async (url: string) => {
      const pool = [connect(url), connect(url)]
      // sqlx 는 연결마다 외래 키 검사를 켠다.
      for (const db of pool) db.exec('PRAGMA foreign_keys = ON')
      // 쉬는 연결을 앞에서 꺼내 쓰고, 깨졌어도 뒤로 돌려놓는다.
      function borrow<T>(work: (db: DatabaseSync) => T): T {
        const db = pool.shift()!
        try {
          return work(db)
        } finally {
          pool.push(db)
        }
      }
      return {
        execute: async (sql: string, params?: unknown[]) => {
          borrow((db) => run(db, sql, params))
        },
        select: async (sql: string, params?: unknown[]) =>
          borrow((db) => db.prepare(sql).all(named(params) as never)),
        // 연결이 닫히면 SQLite 가 열린 트랜잭션을 되돌린다. 파일은 남는다.
        close: async () => {
          for (const db of pool.splice(0)) {
            db.close()
            connections.delete(db)
          }
        },
      }
    },
  },
}))

const { SqliteRepository } = await import('../../src/db/sqlite')

const LATEST = String(Math.max(...MIGRATIONS.map((m) => m.version)))

function goal(id: string, over: Partial<GoalRow> = {}): GoalRow {
  return {
    id,
    name: `목표 ${id}`,
    horizon_kind: 'date',
    ready_at: '2026-11-20',
    hold_until: '2026-11-20',
    target_retention: 0.9,
    intensity: 'standard',
    min_reviews: 3,
    max_interval_days: null,
    post_goal_mode: 'archive',
    color: null,
    created_at: '2026-10-01T00:00:00.000Z',
    archived_at: null,
    ...over,
  }
}

function item(id: string, goalId: string): ItemRow {
  return {
    id,
    goal_id: goalId,
    title: `항목 ${id}`,
    memo: '',
    tags: '[]',
    created_at: '2026-10-01T00:00:00.000Z',
    first_studied_at: '2026-10-01',
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
  }
}

function review(id: string, itemId: string): ReviewRow {
  return {
    id,
    item_id: itemId,
    reviewed_at: '2026-10-01',
    recorded_at: '2026-10-01T09:00:00.000Z',
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
  }
}

/** 저장소가 가진 것을 통째로 읽는다. 읽을 때마다 풀의 다른 연결로 간다. */
async function snapshot(repo: Repository) {
  return {
    goals: await repo.listGoals(),
    items: await repo.listItems(),
    reviews: await repo.listReviews(),
    planned: await repo.listPlannedReviews(),
    settings: await repo.listSettings(),
  }
}

function columnsOf(url: string, table: string): string[] {
  return file(url)
    .prepare(`SELECT name FROM pragma_table_info('${table}')`)
    .all()
    .map((row) => String((row as { name: string }).name))
}

let url = ''
let n = 0
beforeEach(() => {
  n += 1
  url = `sqlite:test-${n}.db`
})

describe('SQLite 저장소의 마이그레이션', () => {
  it('새 파일에서 끝까지 돌고 목표에 목표한 날 칸이 생긴다', async () => {
    const repo = new SqliteRepository(url)
    await repo.init()
    expect(columnsOf(url, 'goals')).toContain('goal_day')
    expect((await repo.listSettings())[SCHEMA_VERSION_KEY]).toBe(LATEST)
  })

  it('예전 판에서 올라온 파일에 칸을 더하고 데이터를 지킨다', async () => {
    // 2번까지 돈 예전 판의 파일을 그대로 만든다.
    const db = file(url)
    for (const migration of MIGRATIONS.filter((m) => m.version <= 2)) {
      for (const statement of migration.statements) db.exec(statement)
    }
    db.prepare('INSERT INTO settings (key, value) VALUES ($1, $2)').run(
      named([SCHEMA_VERSION_KEY, '2']) as never
    )
    db.prepare(
      `INSERT INTO goals (id, name, horizon_kind, ready_at, hold_until, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`
    ).run(
      named(['g1', '시험', 'date', '2026-11-20', '2026-11-20', '2026-10-01T00:00:00.000Z']) as never
    )

    const repo = new SqliteRepository(url)
    await repo.init()
    const [row] = await repo.listGoals()
    expect(row.name).toBe('시험')
    expect(row.ready_at).toBe('2026-11-20')
    expect(row.goal_day).toBeNull()
    expect((await repo.listSettings())[SCHEMA_VERSION_KEY]).toBe(LATEST)
  })

  it('가져온 뒤에도 스키마 번호가 남고 다시 켜도 깨지지 않는다', async () => {
    // 가져오기가 설정을 통째로 지우면 다음 실행에 마이그레이션이 처음부터 다시 돌고,
    // 열을 두 번 더하다 깨져 앱이 '불러오는 중' 에서 멈춘다.
    const first = new SqliteRepository(url)
    await first.init()
    await first.replaceAll({
      goals: [goal('g1')],
      items: [],
      reviews: [],
      settings: { onboardingDone: 'true' },
    })
    expect((await first.listSettings())[SCHEMA_VERSION_KEY]).toBe(LATEST)

    const again = new SqliteRepository(url)
    await expect(again.init()).resolves.toBeUndefined()
    expect(await again.listGoals()).toHaveLength(1)
  })

  it('스키마 번호를 잃은 파일도 다시 켜면 칸을 두 번 더하지 않는다', async () => {
    // 이 판이 나오기 전에 가져오기를 한 파일은 이미 번호가 없다.
    const first = new SqliteRepository(url)
    await first.init()
    file(url).prepare('DELETE FROM settings').run()

    const again = new SqliteRepository(url)
    await expect(again.init()).resolves.toBeUndefined()
    expect(columnsOf(url, 'goals').filter((c) => c === 'goal_day')).toHaveLength(1)
  })

  it('목표한 날 칸이 없던 옛 백업을 가져와도 된다', async () => {
    const repo = new SqliteRepository(url)
    await repo.init()
    const old = goal('g1') as Partial<GoalRow>
    delete old.goal_day
    await repo.replaceAll({
      goals: [old as GoalRow],
      items: [],
      reviews: [],
      settings: {},
    })
    const [row] = await repo.listGoals()
    expect(row.goal_day).toBeNull()
  })

  it('새 파일에 합치기에 쓰는 칸과 지운 흔적 표가 생긴다', async () => {
    const repo = new SqliteRepository(url)
    await repo.init()
    expect(columnsOf(url, 'goals')).toContain('updated_at')
    expect(columnsOf(url, 'items')).toContain('updated_at')
    await repo.addTombstones([{ id: 'i1', kind: 'item', deleted_at: '2026-10-02T00:00:00.000Z' }])
    await repo.addTombstones([{ id: 'i1', kind: 'item', deleted_at: '2026-10-01T00:00:00.000Z' }])
    expect(await repo.listTombstones()).toEqual([
      { id: 'i1', kind: 'item', deleted_at: '2026-10-02T00:00:00.000Z' },
    ])
  })

  it('3번까지 돈 파일에도 칸과 표를 더하고 데이터를 지킨다', async () => {
    const db = file(url)
    for (const migration of MIGRATIONS.filter((m) => m.version <= 3)) {
      for (const statement of migration.statements) db.exec(statement)
      for (const c of migration.columns ?? []) db.exec(`ALTER TABLE ${c.table} ADD COLUMN ${c.column} ${c.type}`)
    }
    db.prepare('INSERT INTO settings (key, value) VALUES ($1, $2)').run(named([SCHEMA_VERSION_KEY, '3']) as never)
    db.prepare(
      `INSERT INTO goals (id, name, horizon_kind, ready_at, hold_until, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`
    ).run(named(['g1', '시험', 'date', '2026-11-20', '2026-11-20', '2026-10-01T00:00:00.000Z']) as never)

    const repo = new SqliteRepository(url)
    await repo.init()
    const [row] = await repo.listGoals()
    expect(row.name).toBe('시험')
    expect(row.updated_at).toBeNull()
    expect(await repo.listTombstones()).toEqual([])
    expect((await repo.listSettings())[SCHEMA_VERSION_KEY]).toBe(LATEST)
  })

  it('가져오기가 지운 흔적까지 갈아끼운다', async () => {
    const repo = new SqliteRepository(url)
    await repo.init()
    await repo.addTombstones([{ id: 'old', kind: 'goal', deleted_at: '2026-10-01T00:00:00.000Z' }])
    const fresh = { id: 'g9', kind: 'goal' as const, deleted_at: '2026-10-05T00:00:00.000Z' }
    await repo.replaceAll({
      goals: [goal('g1', { updated_at: '2026-10-03T00:00:00.000Z' })],
      items: [],
      reviews: [],
      settings: {},
      tombstones: [fresh],
    })
    expect(await repo.listTombstones()).toEqual([fresh])
    expect((await repo.getGoal('g1'))?.updated_at).toBe('2026-10-03T00:00:00.000Z')
  })

  it('비워 두기를 저장하고 그대로 읽는다', async () => {
    const repo = new SqliteRepository(url)
    await repo.init()
    await repo.insertGoal(goal('g1'))
    await repo.updateGoal('g1', { goal_day: 'rest' })
    expect((await repo.getGoal('g1'))?.goal_day).toBe('rest')
    await repo.updateGoal('g1', { goal_day: null })
    expect((await repo.getGoal('g1'))?.goal_day).toBeNull()
  })
})

describe('SQLite 저장소의 가져오기', () => {
  it('넣다가 한 줄이 깨지면 전에 있던 데이터가 그대로 남는다', async () => {
    const repo = new SqliteRepository(url)
    await repo.init()
    await repo.replaceAll({
      goals: [goal('g1')],
      items: [item('i1', 'g1')],
      reviews: [review('r1', 'i1')],
      settings: { onboardingDone: 'true' },
    })
    await repo.replacePlannedReviews([
      {
        id: 'p1',
        item_id: 'i1',
        date: '2026-10-05',
        ordinal: 0,
        kind: 'normal',
        source: 'fsrs',
      },
    ])
    const before = await snapshot(repo)
    expect(before.goals.map((g) => g.id)).toEqual(['g1'])

    // 같은 평가가 두 번 든 백업이다. 지우기와 목표, 항목 넣기가 다 돈 뒤
    // 두 번째 평가에서 깨진다.
    await expect(
      repo.replaceAll({
        goals: [goal('g2')],
        items: [item('i2', 'g2')],
        reviews: [review('r2', 'i2'), review('r2', 'i2')],
        settings: { onboardingDone: 'false' },
      })
    ).rejects.toThrow(/UNIQUE constraint failed: reviews\.id/)

    expect(await snapshot(repo)).toEqual(before)
  })

  it('깨진 가져오기 뒤에도 같은 저장소로 쓰고 다시 가져올 수 있다', async () => {
    // 트랜잭션이 열린 채 연결이 풀로 돌아가면, 다른 연결의 쓰기는 잠겨서 깨진다.
    const repo = new SqliteRepository(url)
    await repo.init()
    await expect(
      repo.replaceAll({
        goals: [goal('g1'), goal('g1')],
        items: [],
        reviews: [],
        settings: {},
      })
    ).rejects.toThrow(/UNIQUE constraint failed: goals\.id/)

    await repo.insertGoal(goal('g2'))
    await repo.replaceAll({
      goals: [goal('g3')],
      items: [],
      reviews: [],
      settings: {},
    })
    expect((await repo.listGoals()).map((g) => g.id)).toEqual(['g3'])
  })
})
