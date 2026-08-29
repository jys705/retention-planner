import { defaultFsrs } from '../../core/fsrs/fsrs6'
import type { MemoryState } from '../../core/fsrs/types'
import { resolveHorizon } from '../../core/horizon/horizon'
import {
  memoryCurve,
  projectItem,
  type CurvePoint,
} from '../../core/simulate/project'
import { replayReviews } from '../../core/simulate/replay'
import {
  feasibleInterval,
  type FeasibleInterval,
} from '../../core/spread/feasible'
import type { GoalRow, ItemRow, ReviewRow } from '../../db/types'
import {
  addDays,
  diffDays,
  fromEpochDay,
  maxDate,
  minDate,
  toEpochDay,
  type DateOnly,
} from '../../lib/date'
import { effectiveConfig, memoryStateOf, type EffectiveConfig } from '../../lib/domain'
import type { Settings } from '../../lib/settings'

export interface ItemView {
  config: EffectiveConfig
  state: MemoryState | null
  /** 지금 이 순간의 기억률. */
  retention: number
  curve: CurvePoint[]
  /** 앞으로 잡힌 복습들. */
  future: { date: DateOnly; state: MemoryState }[]
  history: { date: DateOnly; state: MemoryState }[]
  reviews: ReviewRow[]
  /** 옮길 수 있는 날짜 범위. 목표 시점이 있을 때만 나온다. */
  feasible: FeasibleInterval | null
  readyAt: DateOnly | null
  holdUntil: DateOnly | null
}

/**
 * 항목 하나를 그리는 데 필요한 값을 한 번에 만든다.
 *
 * 지난 평가는 이력을 재생해서 얻고, 앞으로는 계속 '무난함' 을 누른다고 가정해 내다본다.
 */
export function buildItemView(
  item: ItemRow,
  goal: GoalRow | null,
  reviews: ReviewRow[],
  settings: Settings,
  today: DateOnly,
  lookaheadDays = 90
): ItemView {
  const config = effectiveConfig(item, goal, settings)
  const state = memoryStateOf(item)
  const own = reviews
    .filter((r) => r.item_id === item.id)
    .sort((a, b) => (a.reviewed_at < b.reviewed_at ? -1 : 1))

  const points = replayReviews(
    own.map((r) => ({ reviewedAt: r.reviewed_at, rating: r.rating }))
  )
  const history: { date: DateOnly; state: MemoryState }[] = [
    // 항목을 만들 때의 첫 평가는 이력에 없지만 곡선에는 있어야 한다.
    ...(item.stability !== null && item.difficulty !== null
      ? [
          {
            date: item.first_studied_at,
            state: initialState(),
          },
        ]
      : []),
    ...points.map((p) => ({ date: p.reviewedAt, state: p.state })),
  ]

  const future = state
    ? projectItem({
        itemId: item.id,
        state,
        anchor: item.last_review ?? item.first_studied_at,
        due: item.due ?? today,
        from: today,
        days: lookaheadDays,
        horizon: config.horizon,
        intensity: config.intensity,
        targetRetention: config.targetRetention,
        minReviews: config.minReviews,
        repsSinceGoal: item.reps_since_goal,
        bufferDays: settings.bufferDays,
        maxIntervalDays: config.maxIntervalDays,
      }).map((r) => ({ date: r.date, state: r.state }))
    : []

  const resolved = resolveHorizon(config.horizon)
  const readyAt = Number.isFinite(resolved.readyAt)
    ? fromEpochDay(resolved.readyAt)
    : null
  const holdUntil = Number.isFinite(resolved.holdUntil)
    ? fromEpochDay(resolved.holdUntil)
    : null

  const from = minDate(item.first_studied_at, today)
  const lastFuture = future[future.length - 1]?.date
  // 목표한 날을 정해 둔 항목은 그 날에서 곡선을 끊는다. 그 뒤는 물어본 적이
  // 없는 구간이고, 길게 그리면 목표까지의 모양이 그만큼 납작해져 안 보인다.
  // 목표를 고치면 이 값도 따라 움직인다.
  const goalEnd = holdUntil ?? readyAt
  const to = goalEnd
    ? maxDate(goalEnd, addDays(today, 1))
    : maxOf([addDays(today, 30), lastFuture ?? addDays(today, 30)])

  const curve = memoryCurve({ history, future, from, to, today })

  const retention =
    state && item.last_review
      ? defaultFsrs.retrievability(
          Math.max(0, diffDays(item.last_review, today)),
          state.stability
        )
      : 1

  const feasible =
    state && readyAt
      ? feasibleInterval({
          itemId: item.id,
          state,
          anchor: item.last_review ?? item.first_studied_at,
          readyAt,
          notBefore: today,
          bufferDays: settings.bufferDays,
          targetRetention: config.targetRetention,
        })
      : null

  return {
    config,
    state,
    retention,
    curve,
    future,
    history,
    reviews: own,
    feasible,
    readyAt,
    holdUntil,
  }
}

/** 항목을 만들 때의 첫 평가. '무난함' 으로 한 번 본 것으로 친다. */
function initialState(): MemoryState {
  return defaultFsrs.nextState(null, 0, 3)
}

function maxOf(dates: DateOnly[]): DateOnly {
  return dates.reduce((a, b) => (toEpochDay(a) >= toEpochDay(b) ? a : b))
}
