import { replayByDay } from '../core/simulate/replay'
import type {
  GoalRow,
  ItemRow,
  ItemState,
  ReviewRow,
  TombstoneRow,
} from '../db/types'

/**
 * 합칠 때 다루는 기록.
 *
 * 설정과 잡아둔 복습은 넣지 않는다. 알림 시각이나 테마는 컴퓨터마다 다를 수 있고,
 * 잡아둔 복습은 합친 뒤에 다시 셈한다.
 */
export interface MergeSnapshot {
  goals: GoalRow[]
  items: ItemRow[]
  reviews: ReviewRow[]
  tombstones: TombstoneRow[]
}

export interface MergeResult extends MergeSnapshot {
  /** 평가 기록이 바뀌어 기억 상태를 다시 셈한 항목. 다음 날짜도 다시 잡아야 한다. */
  refreshed: Set<string>
  /** 이쪽에 없던 항목과 평가의 수. 안내에 쓴다. */
  addedItems: number
  addedReviews: number
}

/** 사람이 마지막으로 고친 때. 이 칸이 없던 때의 기록은 만든 때로 친다. */
function editedAt(row: { created_at: string; updated_at?: string | null }): string {
  return row.updated_at ?? row.created_at
}

/**
 * 같은 것이 양쪽에 있으면 나중에 고친 쪽을 고른다.
 *
 * 고친 때가 같으면 내용으로 정한다. 어느 쪽에서 합치든 같은 것을 골라야 두 컴퓨터가
 * 서로의 파일을 합친 뒤 같은 기록에 닿는다.
 */
function pick<T extends { created_at: string; updated_at?: string | null }>(
  local: T | undefined,
  incoming: T | undefined
): T | undefined {
  if (!local) return incoming
  if (!incoming) return local
  const a = editedAt(local)
  const b = editedAt(incoming)
  if (a !== b) return a > b ? local : incoming
  const ja = JSON.stringify(local)
  const jb = JSON.stringify(incoming)
  return ja >= jb ? local : incoming
}

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

/**
 * 두 컴퓨터의 기록을 합친다.
 *
 * 평가는 쌓이기만 하는 기록이라 양쪽 것을 다 남긴다. 목표와 항목을 양쪽에서 고쳤으면
 * 나중에 고친 쪽을 남긴다. 한쪽에서 지운 것은, 지운 뒤에 다른 쪽에서 손으로 고친 게
 * 아니면 되살리지 않는다. 평가는 고친 것으로 치지 않는다. 지운 것을 다른 컴퓨터에서
 * 한 번 더 본 것만으로 되살아나면 지운 뜻이 사라진다.
 */
export function mergeSnapshots(
  local: MergeSnapshot,
  incoming: MergeSnapshot
): MergeResult {
  const tombstones = byId(local.tombstones)
  for (const row of incoming.tombstones) {
    const cur = tombstones.get(row.id)
    if (!cur || row.deleted_at > cur.deleted_at) tombstones.set(row.id, row)
  }
  const gone = (row: { id: string; created_at: string; updated_at?: string | null }) => {
    const t = tombstones.get(row.id)
    return t !== undefined && t.deleted_at >= editedAt(row)
  }

  const localGoals = byId(local.goals)
  const incomingGoals = byId(incoming.goals)
  const goals: GoalRow[] = []
  for (const id of new Set([...localGoals.keys(), ...incomingGoals.keys()])) {
    const goal = pick(localGoals.get(id), incomingGoals.get(id))
    if (goal && !gone(goal)) goals.push(goal)
  }
  const goalIds = new Set(goals.map((g) => g.id))

  const localItems = byId(local.items)
  const incomingItems = byId(incoming.items)
  const chosen = new Map<string, { item: ItemRow; from: MergeSnapshot }>()
  for (const id of new Set([...localItems.keys(), ...incomingItems.keys()])) {
    const l = localItems.get(id)
    const i = incomingItems.get(id)
    const item = pick(l, i)
    if (!item || gone(item)) continue
    // 소속 목표가 지워졌으면 목표 없이 남긴다. 없는 목표를 가리키면 화면이 그 목표를 못 찾는다.
    const fixed =
      item.goal_id !== null && !goalIds.has(item.goal_id)
        ? { ...item, goal_id: null }
        : item
    chosen.set(id, { item: fixed, from: item === l ? local : incoming })
  }

  const reviewMap = byId(local.reviews)
  for (const review of incoming.reviews) {
    if (!reviewMap.has(review.id)) reviewMap.set(review.id, review)
  }
  const reviews = [...reviewMap.values()].filter(
    (r) => !tombstones.has(r.id) && chosen.has(r.item_id)
  )
  const reviewsByItem = new Map<string, ReviewRow[]>()
  for (const review of reviews) {
    const list = reviewsByItem.get(review.item_id) ?? []
    list.push(review)
    reviewsByItem.set(review.item_id, list)
  }

  const refreshed = new Set<string>()
  const items: ItemRow[] = []
  for (const [id, { item, from }] of chosen) {
    const mine = reviewsByItem.get(id) ?? []
    const before = from.reviews.filter((r) => r.item_id === id)
    const same =
      mine.length === before.length &&
      before.every((r) => mine.some((m) => m.id === r.id))
    if (same || mine.length === 0) {
      items.push(item)
      continue
    }
    items.push(withHistory(item, mine, before.length))
    refreshed.add(id)
  }

  const localItemIds = new Set(local.items.map((i) => i.id))
  const localReviewIds = new Set(local.reviews.map((r) => r.id))
  return {
    goals: goals.sort(byCreated),
    items: items.sort(byCreated),
    reviews: reviews.sort(byReviewed),
    tombstones: [...tombstones.values()].sort((a, b) =>
      a.deleted_at !== b.deleted_at ? (a.deleted_at < b.deleted_at ? -1 : 1) : a.id < b.id ? -1 : 1
    ),
    refreshed,
    addedItems: items.filter((i) => !localItemIds.has(i.id)).length,
    addedReviews: reviews.filter((r) => !localReviewIds.has(r.id)).length,
  }
}

/**
 * 합친 평가 기록으로 기억 상태와 횟수를 다시 셈한다.
 *
 * 다음 날짜는 여기서 잡지 않는다. 목표와 설정을 봐야 하므로 스토어가 잡는다.
 */
function withHistory(
  item: ItemRow,
  reviews: readonly ReviewRow[],
  countBefore: number
): ItemRow {
  const replay = replayByDay(
    reviews.map((r) => ({
      reviewedAt: r.reviewed_at,
      recordedAt: r.recorded_at,
      rating: r.rating,
    }))
  )
  if (!replay) return item
  return {
    ...item,
    stability: replay.state.stability,
    difficulty: replay.state.difficulty,
    last_review: replay.lastReview,
    reps: reviews.length,
    lapses: reviews.filter((r) => r.rating === 1).length,
    // 목표에 들어온 뒤 본 횟수는 이 칸만으로는 처음부터 셀 수 없다. 고른 쪽 값에
    // 다른 쪽에서 더 들어온 만큼만 더한다.
    reps_since_goal: Math.max(0, item.reps_since_goal + reviews.length - countBefore),
    state: nextState(item.state, replay.lastRating),
  }
}

function nextState(current: ItemState, lastRating: number): ItemState {
  // 목표가 끝나 보관한 것은 날짜가 정한 것이다. 평가가 늘었다고 되살리지 않는다.
  if (current === 'archived') return current
  if (lastRating === 1) return 'relearning'
  return current === 'relearning' || current === 'new' ? 'review' : current
}

function byCreated(a: { created_at: string; id: string }, b: { created_at: string; id: string }): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function byReviewed(a: ReviewRow, b: ReviewRow): number {
  if (a.reviewed_at !== b.reviewed_at) return a.reviewed_at < b.reviewed_at ? -1 : 1
  if (a.recorded_at !== b.recorded_at) return a.recorded_at < b.recorded_at ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
