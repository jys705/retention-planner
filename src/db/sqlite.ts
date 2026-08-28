import Database from '@tauri-apps/plugin-sql'
import { MIGRATIONS, SCHEMA_VERSION_KEY } from './migrations'
import type {
  GoalRow,
  ItemRow,
  PlannedReviewRow,
  Repository,
  ReviewRow,
} from './types'

const GOAL_COLUMNS = [
  'id', 'name', 'horizon_kind', 'ready_at', 'hold_until', 'target_retention',
  'intensity', 'min_reviews', 'max_interval_days', 'post_goal_mode', 'color',
  'created_at', 'archived_at',
] as const

const ITEM_COLUMNS = [
  'id', 'goal_id', 'title', 'memo', 'tags', 'created_at', 'first_studied_at',
  'horizon_kind', 'ready_at', 'hold_until', 'target_retention', 'intensity',
  'min_reviews', 'state', 'stability', 'difficulty', 'due', 'due_kind',
  'due_source', 'last_review', 'reps', 'lapses', 'reps_since_goal',
  'goal_risk', 'archived_at',
] as const

const PLANNED_COLUMNS = [
  'id', 'item_id', 'date', 'ordinal', 'kind', 'source',
] as const

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
    this.db = await Database.load(this.url)
    await this.handle.execute('PRAGMA foreign_keys = ON')
    const applied = Number(
      (await this.getSettingRaw(SCHEMA_VERSION_KEY)) ?? '0'
    )
    for (const migration of MIGRATIONS) {
      if (migration.version <= applied) continue
      for (const statement of migration.statements) {
        await this.handle.execute(statement)
      }
      await this.setSetting(SCHEMA_VERSION_KEY, String(migration.version))
    }
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

  async getSetting(key: string): Promise<string | null> {
    const rows = await this.handle.select<{ value: string }[]>(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    )
    return rows[0]?.value ?? null
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.handle.execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    )
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
  }): Promise<void> {
    await this.handle.execute('DELETE FROM planned_reviews')
    await this.handle.execute('DELETE FROM reviews')
    await this.handle.execute('DELETE FROM items')
    await this.handle.execute('DELETE FROM goals')
    await this.handle.execute('DELETE FROM settings')
    for (const g of data.goals) await this.insertGoal(g)
    for (const i of data.items) await this.insertItem(i)
    for (const r of data.reviews) await this.insertReview(r)
    for (const [k, v] of Object.entries(data.settings)) {
      await this.setSetting(k, v)
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
