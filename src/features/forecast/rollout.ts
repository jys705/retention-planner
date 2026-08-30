import { defaultFsrs } from '../../core/fsrs/fsrs6'
import { applyReview } from '../../core/policy/constraints'
import type { Grade } from '../../core/fsrs/types'
import type { DueKind, GoalRow, ItemRow } from '../../db/types'
import { addDays, diffDays, type DateOnly } from '../../lib/date'
import { effectiveConfig, isActive, memoryStateOf } from '../../lib/domain'
import type { Settings } from '../../lib/settings'
import { computeSpread } from '../../store/planner'
import { resolveHorizon } from '../../core/horizon/horizon'
import { fromEpochDay } from '../../lib/date'

/** 앞으로의 평가를 몇 점으로 가정할지. */
const ASSUMED_GRADE: Grade = 3

export interface PlannedItem {
  itemId: string
  title: string
  goalName: string | null
  goalId: string | null
  kind: DueKind
  /** 그날 보기 직전의 기억률. */
  retention: number
  /** 밀린 것인지. 예정일이 지난 채로 그날까지 온 항목이다. */
  overdue: boolean
}

export interface DayPlan {
  date: DateOnly
  items: PlannedItem[]
}

export interface RolloutInput {
  items: readonly ItemRow[]
  goals: readonly GoalRow[]
  settings: Settings
  from: DateOnly
  days: number
}

/**
 * 앞으로 며칠을 하루씩 실제로 살아 본다.
 *
 * 항목마다 따로 굴려서 더하면 날짜 조정 층이 빠진다. 그러면 마감 근처에 실제로는
 * 오지 않을 봉우리가 서고, 화면은 그 봉우리를 두고 "상한을 넘어요" 라고 경고까지 한다.
 * 그래서 여기서는 하루하루 앱이 켜졌을 때와 똑같이 다시 계산한다.
 * 그날 올라온 것은 '무난함' 으로 봤다고 치고 다음 날로 넘어간다.
 */
export function rollout({
  items,
  goals,
  settings,
  from,
  days,
}: RolloutInput): DayPlan[] {
  const goalById = new Map(goals.map((g) => [g.id, g]))
  let current = items.filter(isActive).map((item) => ({ ...item }))
  const out: DayPlan[] = []

  for (let offset = 0; offset <= days; offset += 1) {
    const date = addDays(from, offset)

    // 앱이 그날 켜졌을 때 도는 것과 같은 계산이다.
    const { patches } = computeSpread(current, [...goals], settings, date)
    current = current.map((item) => {
      const patch = patches.get(item.id)
      return patch ? { ...item, ...patch } : item
    })

    const due = current.filter(
      (item) =>
        isActive(item) &&
        item.due !== null &&
        item.due <= date &&
        // 목표 시점을 정해 둔 항목은 그 날이 지나면 예보에서 뺀다. 목표를
        // 지나서까지 이어 보는 것은 물어본 적이 없는 구간이다.
        !pastGoal(item, goalById, settings, date)
    )

    out.push({
      date,
      items: due.map((item) => ({
        itemId: item.id,
        title: item.title,
        goalId: item.goal_id,
        goalName: item.goal_id
          ? (goalById.get(item.goal_id)?.name ?? null)
          : null,
        kind: item.due_kind ?? 'normal',
        retention: retentionAt(item, date),
        overdue: item.due !== null && item.due < date,
      })),
    })

    if (due.length === 0) continue
    const seen = new Set(due.map((item) => item.id))
    current = current.map((item) =>
      seen.has(item.id) ? review(item, date, goalById, settings) : item
    )
  }

  return out
}

/**
 * 그 날이 이 항목의 목표 시점을 지났는가.
 *
 * 항목이 제 시점을 따로 갖고 있으면 그것이 목표의 것을 이긴다.
 * 아무것도 안 정해 뒀으면 지날 시점이 없으므로 늘 거짓이다.
 */
function pastGoal(
  item: ItemRow,
  goalById: ReadonlyMap<string, GoalRow>,
  settings: Settings,
  date: DateOnly
): boolean {
  const goal = item.goal_id ? (goalById.get(item.goal_id) ?? null) : null
  const resolved = resolveHorizon(effectiveConfig(item, goal, settings).horizon)
  const end = Number.isFinite(resolved.holdUntil)
    ? resolved.holdUntil
    : resolved.readyAt
  if (!Number.isFinite(end)) return false
  return date > fromEpochDay(end)
}

/** 그날 그 항목을 떠올릴 확률. */
function retentionAt(item: ItemRow, date: DateOnly): number {
  const state = memoryStateOf(item)
  if (!state || !item.last_review) return 1
  return defaultFsrs.retrievability(
    Math.max(0, diffDays(item.last_review, date)),
    state.stability
  )
}

/** 그날 한 번 본 것으로 치고 다음 날짜를 다시 잡는다. */
function review(
  item: ItemRow,
  date: DateOnly,
  goalById: ReadonlyMap<string, GoalRow>,
  settings: Settings
): ItemRow {
  const goal = item.goal_id ? (goalById.get(item.goal_id) ?? null) : null
  const config = effectiveConfig(item, goal, settings)
  const applied = applyReview({
    reviewedAt: date,
    lastReview: item.last_review,
    state: memoryStateOf(item),
    grade: ASSUMED_GRADE,
    horizon: config.horizon,
    intensity: config.intensity,
    targetRetention: config.targetRetention,
    minReviews: config.minReviews,
    repsSinceGoal: item.reps_since_goal,
    bufferDays: settings.bufferDays,
    maxIntervalDays: config.maxIntervalDays,
  })

  const archived =
    applied.postGoalReached && config.postGoalMode === 'archive'

  return {
    ...item,
    stability: applied.state.stability,
    difficulty: applied.state.difficulty,
    due: applied.due,
    due_kind: applied.dueKind,
    due_source: 'fsrs',
    last_review: date,
    reps: item.reps + 1,
    reps_since_goal: item.reps_since_goal + 1,
    state: applied.postGoalReached
      ? archived
        ? 'archived'
        : 'maintaining'
      : applied.inPlateau
        ? 'holding'
        : 'review',
    // 내다보기라서 시계를 읽지 않는다. 그날을 그대로 적어 둔다.
    archived_at: archived ? `${date}T00:00:00.000Z` : item.archived_at,
  }
}

/** 날짜별 개수. 막대와 히트맵이 이 값을 쓴다. */
export function dailyCountOf(plan: readonly DayPlan[]): Record<DateOnly, number> {
  const counts: Record<DateOnly, number> = {}
  for (const day of plan) counts[day.date] = day.items.length
  return counts
}
