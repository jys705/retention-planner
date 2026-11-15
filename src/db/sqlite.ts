import Database from '@tauri-apps/plugin-sql'
import { MIGRATIONS, SCHEMA_VERSION_KEY } from './migrations'
import type {
  GoalRow,
  ItemRow,
  PlannedReviewRow,
  Repository,
  ReviewRow,
  TombstoneRow,
} from './types'

const GOAL_COLUMNS = [
  'id', 'name', 'horizon_kind', 'ready_at', 'hold_until', 'target_retention',
  'intensity', 'min_reviews', 'max_interval_days', 'post_goal_mode', 'color',
  'created_at', 'archived_at', 'goal_day', 'updated_at',
] as const

const ITEM_COLUMNS = [
  'id', 'goal_id', 'title', 'memo', 'tags', 'created_at', 'first_studied_at',
  'horizon_kind', 'ready_at', 'hold_until', 'target_retention', 'intensity',
  'min_reviews', 'state', 'stability', 'difficulty', 'due', 'due_kind',
  'due_source', 'last_review', 'reps', 'lapses', 'reps_since_goal',
  'goal_risk', 'archived_at', 'updated_at',
] as const

const PLANNED_COLUMNS = [
  'id', 'item_id', 'date', 'ordinal', 'kind', 'source',
] as const

const TOMBSTONE_COLUMNS = ['id', 'kind', 'deleted_at'] as const

/** 같은 것을 또 지우면 더 나중에 지운 때를 남긴다. */
const UPSERT_TOMBSTONE = `INSERT INTO tombstones (id, kind, deleted_at) VALUES ($1, $2, $3)
  ON CONFLICT(id) DO UPDATE SET deleted_at = max(deleted_at, excluded.deleted_at)`

const REVIEW_COLUMNS = [
  'id', 'item_id', 'reviewed_at', 'recorded_at', 'rating', 'state_before',
  's_before', 'd_before', 's_after', 'd_after', 'elapsed_days',
  'scheduled_days', 'r_at_review', 'next_interval', 'memo_snapshot',
] as const

function placeholders(n: number): string {
  return Array.from({ length: n }, (_, i) => `$${i + 1}`).join(', ')
}

function insertSql(table: string, columns: readonly string[]): string {
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders(columns.length)})`
}

function valuesOf<T extends object>(
  row: T,
  columns: readonly string[]
): unknown[] {
  return columns.map((c) => (row as Record<string, unknown>)[c] ?? null)
}

const UPSERT_SETTING = `INSERT INTO settings (key, value) VALUES ($1, $2)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value`

/**
 * 여러 문장을 execute 한 번에 보내려고 하나로 잇는다.
 *
 * 플러그인은 $n 을 문장마다 새로 세지 않고, 어느 문장에 있든 값 배열 전체의 n 번째로
 * 읽는다. 그래서 뒤에 붙는 문장의 자리표시는 앞에 쌓인 값 수만큼 밀어 둔다.
 */
class Batch {
  private readonly statements: string[] = []
  readonly values: unknown[] = []

  add(sql: string, values: unknown[] = []): void {
    const offset = this.values.length
    this.statements.push(
      sql.replace(/\$(\d+)/g, (_, n: string) => `$${offset + Number(n)}`)
    )
    this.values.push(...values)
  }

  get sql(): string {
    return this.statements.join(';\n')
  }
}

/**
 * Tauri SQL 플러그인 구현. 브라우저에서는 플러그인이 없으므로 이 구현을 고르지 않는다.
 * 고르는 건 index.ts 가 한다.
 */
export class SqliteRepository implements Repository {
  private db: Database | null = null

  constructor(private readonly url: string = 'sqlite:retention-planner.db') {}

  private get handle(): Database {
    if (!this.db) throw new Error('init() 을 먼저 불러야 한다')
    return this.db
  }

  async init(): Promise<void> {
    await this.open()
    const applied = Number(
      (await this.getSettingRaw(SCHEMA_VERSION_KEY)) ?? '0'
    )
    for (const migration of MIGRATIONS) {
      if (migration.version <= applied) continue
      for (const statement of migration.statements) {
        await this.handle.execute(statement)
      }
      for (const { table, column, type } of migration.columns ?? []) {
        if (await this.hasColumn(table, column)) continue
        await this.handle.execute(
          `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`
        )
      }
      await this.setSetting(SCHEMA_VERSION_KEY, String(migration.version))
    }
  }

  private async open(): Promise<void> {
    this.db = await Database.load(this.url)
    await this.handle.execute('PRAGMA foreign_keys = ON')
  }

  private async hasColumn(table: string, column: string): Promise<boolean> {
    const rows = await this.handle.select<{ name: string }[]>(
      `SELECT name FROM pragma_table_info('${table}')`
    )
    return rows.some((row) => row.name === column)
  }

  private async getSettingRaw(key: string): Promise<string | null> {
    try {
      const rows = await this.handle.select<{ value: string }[]>(
        'SELECT value FROM settings WHERE key = $1',
        [key]
      )
      return rows[0]?.value ?? null
    } catch {
      // settings 테이블이 아직 없는 첫 실행
      return null
    }
  }

  async close(): Promise<void> {
    await this.db?.close()
    this.db = null
  }

  async listGoals(): Promise<GoalRow[]> {
    return this.handle.select<GoalRow[]>(
      'SELECT * FROM goals ORDER BY created_at, id'
    )
  }

  async getGoal(id: string): Promise<GoalRow | null> {
    const rows = await this.handle.select<GoalRow[]>(
      'SELECT * FROM goals WHERE id = $1',
      [id]
    )
    return rows[0] ?? null
  }

  async insertGoal(goal: GoalRow): Promise<void> {
    await this.handle.execute(
      insertSql('goals', GOAL_COLUMNS),
      valuesOf(goal, GOAL_COLUMNS)
    )
  }

  async updateGoal(id: string, patch: Partial<GoalRow>): Promise<void> {
    await this.patch('goals', GOAL_COLUMNS, id, patch)
  }

  async deleteGoal(id: string): Promise<void> {
    await this.handle.execute('DELETE FROM goals WHERE id = $1', [id])
  }

  async listItems(): Promise<ItemRow[]> {
    return this.handle.select<ItemRow[]>(
      'SELECT * FROM items ORDER BY created_at, id'
    )
  }

  async getItem(id: string): Promise<ItemRow | null> {
    const rows = await this.handle.select<ItemRow[]>(
      'SELECT * FROM items WHERE id = $1',
      [id]
    )
    return rows[0] ?? null
  }

  async insertItem(item: ItemRow): Promise<void> {
    await this.handle.execute(
      insertSql('items', ITEM_COLUMNS),
      valuesOf(item, ITEM_COLUMNS)
    )
  }

  async updateItem(id: string, patch: Partial<ItemRow>): Promise<void> {
    await this.patch('items', ITEM_COLUMNS, id, patch)
  }

  async deleteItem(id: string): Promise<void> {
    await this.handle.execute('DELETE FROM items WHERE id = $1', [id])
  }

  async listPlannedReviews(): Promise<PlannedReviewRow[]> {
    return this.handle.select<PlannedReviewRow[]>(
      'SELECT * FROM planned_reviews ORDER BY date, item_id, ordinal'
    )
  }

  async replacePlannedReviews(rows: PlannedReviewRow[]): Promise<void> {
    await this.handle.execute('DELETE FROM planned_reviews')
    for (const row of rows) {
      await this.handle.execute(
        insertSql('planned_reviews', PLANNED_COLUMNS),
        valuesOf(row, PLANNED_COLUMNS)
      )
    }
  }

  async listReviews(): Promise<ReviewRow[]> {
    return this.handle.select<ReviewRow[]>(
      'SELECT * FROM reviews ORDER BY reviewed_at, recorded_at, id'
    )
  }

  async listReviewsByItem(itemId: string): Promise<ReviewRow[]> {
    return this.handle.select<ReviewRow[]>(
      'SELECT * FROM reviews WHERE item_id = $1 ORDER BY reviewed_at, recorded_at, id',
      [itemId]
    )
  }

  async insertReview(review: ReviewRow): Promise<void> {
    await this.handle.execute(
      insertSql('reviews', REVIEW_COLUMNS),
      valuesOf(review, REVIEW_COLUMNS)
    )
  }

  async deleteReview(id: string): Promise<void> {
    await this.handle.execute('DELETE FROM reviews WHERE id = $1', [id])
  }

  async listTombstones(): Promise<TombstoneRow[]> {
    return this.handle.select<TombstoneRow[]>(
      'SELECT * FROM tombstones ORDER BY deleted_at, id'
    )
  }

  async addTombstones(rows: TombstoneRow[]): Promise<void> {
    for (const row of rows) {
      await this.handle.execute(UPSERT_TOMBSTONE, valuesOf(row, TOMBSTONE_COLUMNS))
    }
  }

  async getSetting(key: string): Promise<string | null> {
    const rows = await this.handle.select<{ value: string }[]>(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    )
    return rows[0]?.value ?? null
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.handle.execute(UPSERT_SETTING, [key, value])
  }

  async listSettings(): Promise<Record<string, string>> {
    const rows = await this.handle.select<{ key: string; value: string }[]>(
      'SELECT key, value FROM settings'
    )
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  }

  async replaceAll(data: {
    goals: GoalRow[]
    items: ItemRow[]
    reviews: ReviewRow[]
    settings: Record<string, string>
    tombstones?: TombstoneRow[]
  }): Promise<void> {
    // 지우고 넣는 일을 트랜잭션 하나로 묶어, 중간에 깨지면 아무것도 바뀌지 않게 한다.
    // 플러그인은 연결 하나가 아니라 sqlx 풀을 쓰고, execute 마다 쉬는 연결을 빌려 간다.
    // BEGIN 과 COMMIT 을 따로 부르면 다른 연결로 갈 수 있어서 전부 한 번에 보낸다.
    const batch = new Batch()
    batch.add('BEGIN')
    batch.add('DELETE FROM planned_reviews')
    batch.add('DELETE FROM reviews')
    batch.add('DELETE FROM items')
    batch.add('DELETE FROM goals')
    batch.add('DELETE FROM tombstones')
    // 스키마가 어디까지 왔는지는 데이터가 아니라 이 파일의 사실이다. 가져온 설정에는
    // 이 값이 없으므로 같이 지우면 다음 실행에 마이그레이션이 처음부터 다시 돈다.
    batch.add('DELETE FROM settings WHERE key <> $1', [SCHEMA_VERSION_KEY])
    for (const g of data.goals) {
      batch.add(insertSql('goals', GOAL_COLUMNS), valuesOf(g, GOAL_COLUMNS))
    }
    for (const i of data.items) {
      batch.add(insertSql('items', ITEM_COLUMNS), valuesOf(i, ITEM_COLUMNS))
    }
    for (const r of data.reviews) {
      batch.add(
        insertSql('reviews', REVIEW_COLUMNS),
        valuesOf(r, REVIEW_COLUMNS)
      )
    }
    for (const t of data.tombstones ?? []) {
      batch.add(UPSERT_TOMBSTONE, valuesOf(t, TOMBSTONE_COLUMNS))
    }
    for (const [k, v] of Object.entries(data.settings)) {
      if (k === SCHEMA_VERSION_KEY) continue
      batch.add(UPSERT_SETTING, [k, v])
    }
    batch.add('COMMIT')
    try {
      await this.handle.execute(batch.sql, batch.values)
    } catch (error) {
      // 한 문장이 깨지면 COMMIT 까지 가지 못하고, 그 연결은 트랜잭션을 연 채 풀로
      // 돌아간다. ROLLBACK 을 따로 보내도 그 연결로 간다는 보장이 없다. 연결이 닫히면
      // SQLite 가 열린 트랜잭션을 되돌리므로 풀을 닫았다가 다시 연다.
      await this.close()
      await this.open()
      throw error
    }
  }

  private async patch(
    table: string,
    columns: readonly string[],
    id: string,
    patchRow: Record<string, unknown>
  ): Promise<void> {
    const keys = columns.filter((c) => c !== 'id' && c in patchRow)
    if (keys.length === 0) return
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
    const values = keys.map((k) => patchRow[k] ?? null)
    await this.handle.execute(
      `UPDATE ${table} SET ${sets} WHERE id = $${keys.length + 1}`,
      [...values, id]
    )
  }
}
