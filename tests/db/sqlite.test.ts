import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS, SCHEMA_VERSION_KEY } from '../../src/db/migrations'
import type { GoalRow } from '../../src/db/types'

/**
 * Tauri 의 SQL 플러그인 자리에 Node 가 가진 SQLite 를 물린다.
 *
 * 앱의 SQLite 구현은 셸 안에서만 도는 플러그인을 거쳐서, 그대로는 시험에서 돌릴 수
 * 없다. 저장 구조를 바꾸는 일은 실제 SQLite 에서 확인해야 한다. 열을 더하는
 * 마이그레이션이 두 번 돌면 앱이 켜지지 않는 식의 실패는 흉내 낸 저장소로는 안 보인다.
 */
const files = new Map<string, DatabaseSync>()

/** 플러그인은 $1, $2 자리표시와 값 배열을 받는다. Node 쪽은 이름 붙은 값을 받는다. */
function named(params: unknown[] = []): Record<string, unknown> {
  return Object.fromEntries(params.map((value, i) => [`$${i + 1}`, value]))
}

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: async (url: string) => {
      const db = files.get(url) ?? new DatabaseSync(':memory:')
      files.set(url, db)
      return {
        execute: async (sql: string, params?: unknown[]) => {
          db.prepare(sql).run(named(params) as never)
        },
        select: async (sql: string, params?: unknown[]) =>
          db.prepare(sql).all(named(params) as never),
        close: async () => {},
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

function columnsOf(url: string, table: string): string[] {
  return files
    .get(url)!
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
    const db = new DatabaseSync(':memory:')
    files.set(url, db)
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
    files.get(url)!.prepare('DELETE FROM settings').run()

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
