import { defaultFsrs } from '../core/fsrs/fsrs6'
import { resolveHorizon } from '../core/horizon/horizon'
import type { GoalRow, ItemRow, ReviewRow } from '../db/types'
import { diffDays, fromEpochDay, type DateOnly } from './date'
import { effectiveConfig, goalHorizon, isActive } from './domain'
import { daysLeftLabel, monthDay } from './format'
import type { Settings } from './settings'

/**
 * 목표가 끝나는 날.
 *
 * 목표 시점의 늦은 쪽 끝이다. 정확한 날짜는 그 날, 대략은 유지 구간의 끝이다.
 * 정해두지 않은 목표는 끝나는 날이 없다.
 */
export function goalEndDay(goal: GoalRow): DateOnly | null {
  const { holdUntil } = resolveHorizon(goalHorizon(goal))
  return Number.isFinite(holdUntil) ? fromEpochDay(holdUntil) : null
}

/**
 * 목표가 끝났는가.
 *
 * 끝나는 날이 지났으면 끝난 것이다. 목표한 날 당일은 아직 안 끝났다. 그날 남은 것은
 * 해도 되고 안 해도 되는 것으로 권한다.
 */
export function goalEnded(goal: GoalRow, today: DateOnly): boolean {
  const end = goalEndDay(goal)
  return end !== null && today > end
}

/**
 * 목표가 지금 어디쯤인지 한마디로.
 *
 * 끝난 목표에 '54일 지남' 이라고 적지 않는다. 마친 목표에서 궁금한 것은 며칠이
 * 지났는지가 아니다. 대략 목표의 유지 기간도 '지남' 이 아니라 아직 지키는 중이다.
 */
export function goalTimeLabel(goal: GoalRow, today: DateOnly): string {
  const end = goalEndDay(goal)
  if (end !== null && today > end) return `${monthDay(end)}에 마침`
  if (!goal.ready_at) return '기한 없음'
  if (goal.horizon_kind === 'window' && end !== null && today >= goal.ready_at) {
    return `${monthDay(end)}까지 유지`
  }
  return daysLeftLabel(today, goal.ready_at)
}

/** 이 항목이 따르는 목표 시점의 끝나는 날. 목표에 넣은 항목은 목표의 것을 따른다. */
export function itemEndDay(
  item: ItemRow,
  goal: GoalRow | null,
  settings: Settings
): DateOnly | null {
  const { holdUntil } = resolveHorizon(effectiveConfig(item, goal, settings).horizon)
  return Number.isFinite(holdUntil) ? fromEpochDay(holdUntil) : null
}

/** 이 항목이 따르는 목표 시점이 끝났는가. */
export function itemHorizonEnded(
  item: ItemRow,
  goal: GoalRow | null,
  settings: Settings,
  today: DateOnly
): boolean {
  const end = itemEndDay(item, goal, settings)
  return end !== null && today > end
}

/**
 * 잡힌 다음 날짜가 목표가 끝난 뒤라서 오지 않을 날인가.
 *
 * 목표한 날까지 기억이 충분하면 다음 날짜가 목표 뒤로 잡힌다. 목표를 마치면
 * 보관하는 쪽에서는 그 날이 오기 전에 항목이 내려가므로, 그 날짜를 다음에 볼 날로
 * 적으면 오지 않을 날을 약속하는 것이 된다. 계속 보기로 한 쪽은 그 날이 그대로 온다.
 */
export function dueBeyondEnd(
  item: ItemRow,
  goal: GoalRow | null,
  settings: Settings
): boolean {
  if (item.due === null) return false
  if (effectiveConfig(item, goal, settings).postGoalMode !== 'archive') return false
  const end = itemEndDay(item, goal, settings)
  return end !== null && item.due > end
}

/**
 * 앞으로 볼 복습으로 셀 항목인가.
 *
 * 살아 있고, 다음 날짜가 목표 밖으로 나가지 않은 것이다. 다가오는 날짜, 하루 분량,
 * 잡아둔 복습이 모두 이 기준으로 센다. 한 곳이라도 따로 세면 오늘 화면은 '다음은
 * 9월 4일에 9개' 라고 하는데 그날이 되면 아무것도 없는 일이 생긴다.
 */
export function isScheduled(
  item: ItemRow,
  goal: GoalRow | null,
  settings: Settings
): boolean {
  return isActive(item) && !dueBeyondEnd(item, goal, settings)
}

/** 항목 목록에서 앞으로 볼 복습으로 셀 것만 남긴다. */
export function scheduledItems(
  items: readonly ItemRow[],
  goals: readonly GoalRow[],
  settings: Settings
): ItemRow[] {
  const goalById = new Map(goals.map((g) => [g.id, g]))
  return items.filter((item) =>
    isScheduled(
      item,
      item.goal_id ? (goalById.get(item.goal_id) ?? null) : null,
      settings
    )
  )
}

/**
 * 그날의 기억률.
 *
 * 그날까지의 평가만 되짚는다. 저장된 마지막 평가로 세면 목표 뒤에 한 번이라도 본
 * 항목은 목표한 날 기억률이 100% 로 튄다. 그날의 상태를 알 수 없으면 없음이다.
 */
export function retentionOn(
  item: ItemRow,
  reviews: readonly ReviewRow[],
  day: DateOnly
): number | null {
  const own = reviews
    .filter((r) => r.item_id === item.id)
    .sort((a, b) =>
      a.reviewed_at === b.reviewed_at
        ? a.recorded_at < b.recorded_at
          ? -1
          : 1
        : a.reviewed_at < b.reviewed_at
          ? -1
          : 1
    )
  const before = own.filter((r) => r.reviewed_at <= day)
  const last = before[before.length - 1]
  if (last) {
    return defaultFsrs.retrievability(
      Math.max(0, diffDays(last.reviewed_at, day)),
      last.s_after
    )
  }
  // 그날 전에 평가가 없으면 처음 공부한 상태 그대로다. 그 뒤에 평가가 있으면
  // 지금 저장된 값은 그날의 것이 아니다.
  if (own.length > 0) return null
  if (item.stability === null || item.last_review === null) return null
  if (item.last_review > day) return null
  return defaultFsrs.retrievability(
    Math.max(0, diffDays(item.last_review, day)),
    item.stability
  )
}

/** 여러 항목의 그날 기억률 평균. 셀 수 있는 것이 없으면 없음이다. */
export function averageRetentionOn(
  items: readonly ItemRow[],
  reviews: readonly ReviewRow[],
  day: DateOnly
): number | null {
  const values = items
    .map((item) => retentionOn(item, reviews, day))
    .filter((v): v is number => v !== null)
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * 끝난 목표를 확인했다는 표시의 열쇠.
 *
 * 끝나는 날을 같이 적는다. 날짜를 미뤘다가 그 날이 또 지나면 새로 알려야 한다.
 */
export function endedKey(goal: GoalRow): string | null {
  const end = goalEndDay(goal)
  return end === null ? null : `${goal.id}@${end}`
}

/** 목표 없이 제 날짜가 지나 마친 항목의 열쇠. */
export function itemEndedKey(item: ItemRow, settings: Settings): string | null {
  const end = itemEndDay(item, null, settings)
  return end === null ? null : `${item.id}@${end}`
}

export interface EndedGoalNotice {
  goal: GoalRow
  end: DateOnly
  /** 보관한 항목 수. */
  count: number
  /** 끝나는 날 기억률을 셀 수 있었던 항목 수와, 그 가운데 목표 기억률에 닿은 수. */
  known: number
  reached: number
  target: number
}

export interface EndedNotice {
  goals: EndedGoalNotice[]
  /** 목표 없이 제 날짜가 지나 보관한 항목 수. */
  loose: number
  /** 확인했다고 적을 열쇠들. */
  keys: string[]
}

/**
 * 아직 알리지 않은 끝.
 *
 * 항목이 조용히 사라지면 지워진 줄 안다. 끝난 것을 보관했으면 한 번은 말해야 한다.
 * 확인하거나 그 목표를 열어 보면 다시 말하지 않는다. 보관한 항목이 없는 목표는
 * 알릴 것이 없다.
 */
export function endedNotice(
  items: readonly ItemRow[],
  goals: readonly GoalRow[],
  reviews: readonly ReviewRow[],
  settings: Settings,
  today: DateOnly
): EndedNotice | null {
  const seen = new Set(settings.seenEnded)
  const keys: string[] = []
  const ended: EndedGoalNotice[] = []
  for (const goal of goals) {
    const key = endedKey(goal)
    const end = goalEndDay(goal)
    if (key === null || end === null || seen.has(key)) continue
    if (!goalEnded(goal, today)) continue
    const kept = items.filter((i) => i.goal_id === goal.id && !isActive(i))
    if (kept.length === 0) continue
    const target = goal.target_retention ?? settings.targetRetention
    const results = kept
      .map((item) => retentionOn(item, reviews, end))
      .filter((r): r is number => r !== null)
    ended.push({
      goal,
      end,
      count: kept.length,
      known: results.length,
      reached: results.filter((r) => r >= target).length,
      target,
    })
    keys.push(key)
  }
  let loose = 0
  for (const item of items) {
    if (item.goal_id !== null || isActive(item)) continue
    if (!itemHorizonEnded(item, null, settings, today)) continue
    const key = itemEndedKey(item, settings)
    if (key === null || seen.has(key)) continue
    loose += 1
    keys.push(key)
  }
  if (ended.length === 0 && loose === 0) return null
  return { goals: ended, loose, keys }
}

/**
 * 날이 지나는 것만으로 일어나는 상태 변화.
 *
 * 목표 시점이 지나면 항목은 목표 뒤 처리에 따라 보관된다. 예전에는 이 넘어감이
 * '목표가 지난 뒤에 평가할 때' 만 일어났다. 그래서 목표를 마치고 앱을 안 켜면
 * 평가할 일이 없으니 넘어가지도 못하고, 항목이 밀린 채로 오늘 목록에 영영 남았다.
 * 목표를 마쳤으면 지킬 기억률이 없다. 앱이 물러설 차례다.
 *
 * '부족' 표시도 같이 내린다. 끝난 목표에는 모자랄 날이 없다.
 *
 * 되살리는 쪽은 여기서 하지 않는다. 시간은 앞으로만 가고, 끝난 것을 다시 여는 것은
 * 사람이 목표 날짜를 고치거나 계속 기억하기로 정했을 때뿐이다.
 */
export function endedPatches(
  items: readonly ItemRow[],
  goals: readonly GoalRow[],
  settings: Settings,
  today: DateOnly,
  now: string
): Map<string, Partial<ItemRow>> {
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const patches = new Map<string, Partial<ItemRow>>()
  for (const item of items) {
    if (!isActive(item)) continue
    const goal = item.goal_id ? (goalById.get(item.goal_id) ?? null) : null
    if (!itemHorizonEnded(item, goal, settings, today)) continue
    // 목표 뒤에도 계속 보기로 한 것은 그대로 이어 간다.
    if (effectiveConfig(item, goal, settings).postGoalMode !== 'archive') continue
    patches.set(item.id, { state: 'archived', archived_at: now, goal_risk: null })
  }
  return patches
}

/**
 * 보관했던 항목 가운데 다시 살아날 것.
 *
 * 목표 날짜를 뒤로 미뤘거나 계속 기억하기로 정해서, 이 항목이 따르는 목표 시점이
 * 더는 끝나지 않은 경우다. 고른 범위 안에서만 본다. 목표 없이 보관된 항목까지
 * 함께 되살리면, 끝난 목표를 지우고 남긴 항목이 오늘 목록에 쏟아진다.
 */
export function restoredPatches(
  items: readonly ItemRow[],
  goals: readonly GoalRow[],
  settings: Settings,
  today: DateOnly,
  inScope: (item: ItemRow) => boolean
): Map<string, Partial<ItemRow>> {
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const patches = new Map<string, Partial<ItemRow>>()
  for (const item of items) {
    if (isActive(item) || !inScope(item)) continue
    const goal = item.goal_id ? (goalById.get(item.goal_id) ?? null) : null
    if (itemHorizonEnded(item, goal, settings, today)) continue
    patches.set(item.id, { state: 'review', archived_at: null })
  }
  return patches
}
