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
