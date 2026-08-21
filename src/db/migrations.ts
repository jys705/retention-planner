/**
 * 스키마는 마이그레이션 배열 하나로 관리한다. 적용된 번호를 settings 에 적어두고
 * 다음 실행에서 그 뒤부터 이어 돌린다.
 */
export interface Migration {
  version: number
  name: string
  statements: string[]
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS goals (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        horizon_kind      TEXT NOT NULL,
        ready_at          TEXT,
        hold_until        TEXT,
        target_retention  REAL NOT NULL DEFAULT 0.90,
        intensity         TEXT NOT NULL DEFAULT 'standard',
        min_reviews       INTEGER NOT NULL DEFAULT 3,
        max_interval_days INTEGER,
        post_goal_mode    TEXT NOT NULL DEFAULT 'archive',
        color             TEXT,
        created_at        TEXT NOT NULL,
        archived_at       TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS items (
        id                 TEXT PRIMARY KEY,
        goal_id            TEXT REFERENCES goals(id) ON DELETE SET NULL,
        title              TEXT NOT NULL,
        memo               TEXT NOT NULL DEFAULT '',
        tags               TEXT NOT NULL DEFAULT '[]',
        created_at         TEXT NOT NULL,
        first_studied_at   TEXT NOT NULL,
        horizon_kind       TEXT,
        ready_at           TEXT,
        hold_until         TEXT,
        target_retention   REAL,
        intensity          TEXT,
        min_reviews        INTEGER,
        state              TEXT NOT NULL,
        stability          REAL,
        difficulty         REAL,
        due                TEXT,
        due_kind           TEXT,
        due_source         TEXT,
        last_review        TEXT,
        reps               INTEGER NOT NULL DEFAULT 0,
        lapses             INTEGER NOT NULL DEFAULT 0,
        reps_since_goal    INTEGER NOT NULL DEFAULT 0,
        goal_risk          TEXT,
        archived_at        TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS reviews (
        id             TEXT PRIMARY KEY,
        item_id        TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        reviewed_at    TEXT NOT NULL,
        recorded_at    TEXT NOT NULL,
        rating         INTEGER NOT NULL,
        state_before   TEXT NOT NULL,
        s_before       REAL,
        d_before       REAL,
        s_after        REAL NOT NULL,
        d_after        REAL NOT NULL,
        elapsed_days   INTEGER NOT NULL,
        scheduled_days INTEGER NOT NULL,
        r_at_review    REAL NOT NULL,
        next_interval  INTEGER NOT NULL,
        memo_snapshot  TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_items_due ON items(due)`,
      `CREATE INDEX IF NOT EXISTS idx_items_goal ON items(goal_id)`,
      `CREATE INDEX IF NOT EXISTS idx_items_ready_at ON items(ready_at)`,
      `CREATE INDEX IF NOT EXISTS idx_reviews_item ON reviews(item_id, reviewed_at)`,
    ],
  },
]

export const SCHEMA_VERSION_KEY = 'schema_version'
