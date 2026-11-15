import { replayByDay, replayRowsByDay } from '../core/simulate/replay'
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
  /**
   * 소속 목표가 지워져서 목표 없이 남긴 항목과 그 목표.
   *
   * 한쪽 컴퓨터에 그 목표가 남아 있으면 그 행을 같이 준다. 끝난 목표만 지운 것이면
   * 목표 시점을 항목에 옮겨 담아야 하는데, 그건 오늘을 아는 쪽이 정한다.
   */
  detached: Map<string, GoalRow | null>
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
 * 서로의 파일을 합친 뒤 같은 기록에 닿는다. 내용은 칸 이름 차례로 견준다. 칸이 적힌
 * 차례는 저장한 곳마다 달라서, 그대로 견주면 같은 두 행이 컴퓨터마다 다르게 갈린다.
 */
export function pick<T extends { created_at: string; updated_at?: string | null }>(
  local: T | undefined,
  incoming: T | undefined
): T | undefined {
  if (!local) return incoming
  if (!incoming) return local
  const a = editedAt(local)
  const b = editedAt(incoming)
  if (a !== b) return a > b ? local : incoming
  // 칸이 더 많은 쪽은 새 판이 쓴 것이다. 옛 판 파일에 없던 칸 때문에 그 칸의 값이 지워지지 않는다.
  const ka = definedKeys(local)
  const kb = definedKeys(incoming)
  if (ka !== kb) return ka > kb ? local : incoming
  return canonical(local) >= canonical(incoming) ? local : incoming
}

function definedKeys(row: object): number {
  return Object.values(row).filter((value) => value !== undefined).length
}

/** 칸 이름 차례로 늘어놓은 글. 어디에 담겼던 행이든 내용이 같으면 같은 글이 된다. */
function canonical(row: object): string {
  return JSON.stringify(
    Object.entries(row)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  )
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
  const detached = new Map<string, GoalRow | null>()
  for (const id of new Set([...localItems.keys(), ...incomingItems.keys()])) {
    const l = localItems.get(id)
    const i = incomingItems.get(id)
    const item = pick(l, i)
    if (!item || gone(item)) continue
    // 소속 목표가 지워졌으면 목표 없이 남긴다. 없는 목표를 가리키면 화면이 그 목표를 못 찾는다.
    let fixed = item
    if (item.goal_id !== null && !goalIds.has(item.goal_id)) {
      fixed = { ...item, goal_id: null }
      detached.set(
        id,
        pick(localGoals.get(item.goal_id), incomingGoals.get(item.goal_id)) ?? null
      )
    }
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
  const rewritten = new Map<string, ReviewRow>()
  for (const [id, { item, from }] of chosen) {
    const mine = reviewsByItem.get(id) ?? []
    const before = from.reviews.filter((r) => r.item_id === id)
    const same =
      mine.length === before.length &&
      before.every((r) => mine.some((m) => m.id === r.id))
    const history = same || mine.length === 0 ? null : withHistory(item, mine, before.length)
    if (!history) {
      items.push(item)
      continue
    }
    items.push(history.item)
    for (const review of history.reviews) rewritten.set(review.id, review)
    refreshed.add(id)
  }
  const finalReviews = reviews.map((r) => rewritten.get(r.id) ?? r)

  const localItemIds = new Set(local.items.map((i) => i.id))
  const localReviewIds = new Set(local.reviews.map((r) => r.id))
  return {
    goals: goals.sort(byCreated),
    items: items.sort(byCreated),
    reviews: finalReviews.sort(byReviewed),
    tombstones: [...tombstones.values()].sort((a, b) =>
      a.deleted_at !== b.deleted_at ? (a.deleted_at < b.deleted_at ? -1 : 1) : a.id < b.id ? -1 : 1
    ),
    refreshed,
    detached,
    addedItems: items.filter((i) => !localItemIds.has(i.id)).length,
    addedReviews: finalReviews.filter((r) => !localReviewIds.has(r.id)).length,
  }
}

/**
 * 합친 평가 기록으로 기억 상태와 횟수를 다시 셈한다. 평가 하나하나가 그때 본 값도 다시 적는다.
 *
 * 평가 기록에는 그때의 기억 지속력과 회상률이 같이 남는다. 한쪽 컴퓨터가 다른 쪽 평가를
 * 모른 채 적은 값이라, 그대로 두면 목표한 날 기억률과 이력 표가 다시 셈한 상태와 어긋난다.
 * 같은 날 다시 누를 때도 그날 첫 평가의 값으로 되감으므로 이 값이 맞아야 한다.
 *
 * 처음 공부한 기록이 없는 이력은 다시 셈하지 않는다. 그런 항목은 아주 옛 판이 남긴 것이라,
 * 남은 평가만으로 돌리면 그 앞에 쌓인 기억을 잃는다. 이때는 고른 쪽을 그대로 둔다.
 *
 * 다음 날짜는 여기서 잡지 않는다. 목표와 설정을 봐야 하므로 스토어가 잡는다.
 */
function withHistory(
  item: ItemRow,
  reviews: readonly ReviewRow[],
  countBefore: number
): { item: ItemRow; reviews: ReviewRow[] } | null {
  const entries = reviews.map((r) => ({
    reviewedAt: r.reviewed_at,
    recordedAt: r.recorded_at,
    rating: r.rating,
  }))
  const rows = replayRowsByDay(entries)
  const byEntry = new Map(entries.map((entry, index) => [entry, reviews[index]]))
  const ordered = rows.map(({ entry }) => byEntry.get(entry)!)
  if (ordered.length === 0 || ordered[0].s_before !== null) return null
  const replay = replayByDay(entries)
  if (!replay) return null

  const rewritten = rows.map(({ entry, row }) => {
    const review = byEntry.get(entry)!
    return {
      ...review,
      s_before: row.before?.stability ?? null,
      d_before: row.before?.difficulty ?? null,
      s_after: row.after.stability,
      d_after: row.after.difficulty,
      elapsed_days: row.elapsedDays,
      r_at_review: row.retrievabilityAtReview,
    }
  })

  return {
    item: {
      ...item,
      stability: replay.state.stability,
      difficulty: replay.state.difficulty,
      last_review: replay.lastReview,
      reps: reviews.length,
      // 처음 공부한 날의 평가는 잊은 것으로 세지 않는다. 앱이 처음 적을 때 그렇게 센다.
      lapses: ordered.slice(1).filter((r) => r.rating === 1).length,
      // 목표에 들어온 뒤 본 횟수는 이 칸만으로는 처음부터 셀 수 없다. 고른 쪽 값에
      // 다른 쪽에서 더 들어온 만큼만 더한다.
      reps_since_goal: Math.max(0, item.reps_since_goal + reviews.length - countBefore),
      state: nextState(item.state, replay.lastRating),
    },
    reviews: rewritten,
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
