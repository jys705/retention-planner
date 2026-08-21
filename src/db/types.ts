import type { DateOnly } from '../lib/date'

export type HorizonKind = 'open' | 'date' | 'window'
export type Intensity = 'easy' | 'standard' | 'focus' | 'max'
export type PostGoalMode = 'archive' | 'maintain'
export type ItemState =
  | 'new'
  | 'review'
  | 'relearning'
  | 'holding'
  | 'maintaining'
  | 'archived'
export type DueKind =
  | 'normal'
  | 'session_fill'
  | 'deadline_pull'
  | 'final_check'
  | 'hold'
export type DueSource = 'fsrs' | 'spread'
export type GoalRisk = 'safe' | 'tight' | 'at_risk'

export interface GoalRow {
  id: string
  name: string
  horizon_kind: HorizonKind
  ready_at: DateOnly | null
  hold_until: DateOnly | null
  target_retention: number
  intensity: Intensity
  min_reviews: number
  max_interval_days: number | null
  post_goal_mode: PostGoalMode
  color: string | null
  created_at: string
  archived_at: string | null
}

export interface ItemRow {
  id: string
  goal_id: string | null
  title: string
  memo: string
  tags: string
  created_at: string
  first_studied_at: DateOnly
  horizon_kind: HorizonKind | null
  ready_at: DateOnly | null
  hold_until: DateOnly | null
  target_retention: number | null
  intensity: Intensity | null
  min_reviews: number | null
  state: ItemState
  stability: number | null
  difficulty: number | null
  due: DateOnly | null
  due_kind: DueKind | null
  due_source: DueSource | null
  last_review: DateOnly | null
  reps: number
  lapses: number
  reps_since_goal: number
  goal_risk: GoalRisk | null
  archived_at: string | null
}

/**
 * 앞으로 잡아둔 복습. 항목 하나에 여러 개가 붙을 수 있다.
 *
 * `items.due` 로는 날짜를 하나밖에 못 담는데, 한 번 봐서는 목표한 날을 못 맞추는
 * 항목에는 복습을 두 번 잡아야 한다. 그 두 번째가 갈 곳이 여기다.
 *
 * 평가 이력(`reviews`)과 달리 이건 계산으로 다시 만들 수 있는 값이다.
 * 날짜를 다시 계산할 때마다 통째로 새로 쓴다.
 */
export interface PlannedReviewRow {
  id: string
  item_id: string
  date: DateOnly
  /** 0 이 먼저 보는 쪽. */
  ordinal: number
  kind: DueKind
  source: DueSource
}

export interface ReviewRow {
  id: string
  item_id: string
  reviewed_at: DateOnly
  recorded_at: string
  rating: 1 | 2 | 3 | 4
  state_before: ItemState
  s_before: number | null
  d_before: number | null
  s_after: number
  d_after: number
  elapsed_days: number
  scheduled_days: number
  r_at_review: number
  next_interval: number
  memo_snapshot: string | null
}

/**
 * 저장소 하나에 대한 계약. 인메모리 구현과 SQLite 구현이 이걸 똑같이 만족해야 한다.
 * 같은 계약 테스트를 두 구현에 각각 돌려서 확인한다.
 */
export interface Repository {
  init(): Promise<void>
  close(): Promise<void>

  listGoals(): Promise<GoalRow[]>
  getGoal(id: string): Promise<GoalRow | null>
  insertGoal(goal: GoalRow): Promise<void>
  updateGoal(id: string, patch: Partial<GoalRow>): Promise<void>
  deleteGoal(id: string): Promise<void>

  listItems(): Promise<ItemRow[]>
  getItem(id: string): Promise<ItemRow | null>
  insertItem(item: ItemRow): Promise<void>
  updateItem(id: string, patch: Partial<ItemRow>): Promise<void>
  deleteItem(id: string): Promise<void>

  listPlannedReviews(): Promise<PlannedReviewRow[]>
  /** 잡아둔 복습을 통째로 갈아끼운다. 계산으로 다시 만드는 값이라 부분 수정을 두지 않는다. */
  replacePlannedReviews(rows: PlannedReviewRow[]): Promise<void>

  listReviews(): Promise<ReviewRow[]>
  listReviewsByItem(itemId: string): Promise<ReviewRow[]>
  insertReview(review: ReviewRow): Promise<void>

  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  listSettings(): Promise<Record<string, string>>

  /** 내보내기와 가져오기에서 통째로 갈아끼울 때 쓴다. */
  replaceAll(data: {
    goals: GoalRow[]
    items: ItemRow[]
    reviews: ReviewRow[]
    settings: Record<string, string>
  }): Promise<void>
}
