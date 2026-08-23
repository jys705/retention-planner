import type { MemoryState } from '../core/fsrs/types'
import type { Horizon } from '../core/horizon/horizon'
import type { Intensity } from '../core/policy/constraints'
import type { DateOnly } from './date'
import type { GoalRow, HorizonKind, ItemRow, PostGoalMode } from '../db/types'
import type { Settings } from './settings'

/**
 * 항목에 실제로 적용되는 설정.
 *
 * 항목이 스스로 정한 값이 있으면 그걸 쓰고, 없으면 소속 목표를 따르고,
 * 그것도 없으면 전역 기본값으로 내려간다.
 */
export interface EffectiveConfig {
  horizon: Horizon
  intensity: Intensity | number
  targetRetention: number
  minReviews: number
  maxIntervalDays: number | null
  /** 목표 시점을 지난 뒤에 보관할지 계속 볼지. */
  postGoalMode: PostGoalMode
}

function horizonFrom(
  kind: string | null,
  readyAt: string | null,
  holdUntil: string | null
): Horizon | null {
  if (kind === 'open') return { kind: 'open' }
  if (kind === 'date' && readyAt) return { kind: 'date', at: readyAt }
  if (kind === 'window' && readyAt && holdUntil) {
    return { kind: 'window', readyAt, holdUntil }
  }
  return null
}

/**
 * 목표 시점을 저장 칸 셋으로 편다.
 *
 * 목표와 항목이 같은 세 칸(`horizon_kind`, `ready_at`, `hold_until`)을 쓴다.
 * 펴는 자리가 여러 군데면 한 곳만 고쳐지고 나머지가 남는다.
 */
export function horizonFields(horizon: Horizon): {
  horizon_kind: HorizonKind
  ready_at: DateOnly | null
  hold_until: DateOnly | null
} {
  if (horizon.kind === 'date') {
    return { horizon_kind: 'date', ready_at: horizon.at, hold_until: horizon.at }
  }
  if (horizon.kind === 'window') {
    return {
      horizon_kind: 'window',
      ready_at: horizon.readyAt,
      hold_until: horizon.holdUntil,
    }
  }
  return { horizon_kind: 'open', ready_at: null, hold_until: null }
}

export function goalHorizon(goal: GoalRow): Horizon {
  return (
    horizonFrom(goal.horizon_kind, goal.ready_at, goal.hold_until) ?? {
      kind: 'open',
    }
  )
}

export function effectiveConfig(
  item: ItemRow,
  goal: GoalRow | null,
  settings: Settings
): EffectiveConfig {
  // 목표에 넣었다는 것은 그 목표의 값을 따르겠다는 뜻이다. 항목이 옛 값을 들고
  // 있어도 목표가 이긴다. 안 그러면 목표에서 날짜를 바꿔도 안 따라오는 항목이 생기고,
  // 화면은 그걸 '개별 설정을 쓰는 중' 이라고 해명해야 한다.
  const own = horizonFrom(item.horizon_kind, item.ready_at, item.hold_until)
  const horizon = goal ? goalHorizon(goal) : (own ?? { kind: 'open' as const })

  return {
    horizon,
    intensity: goal?.intensity ?? item.intensity ?? settings.defaultIntensity,
    targetRetention:
      goal?.target_retention ??
      item.target_retention ??
      settings.targetRetention,
    minReviews: goal?.min_reviews ?? item.min_reviews ?? settings.minReviews,
    maxIntervalDays: goal?.max_interval_days ?? settings.maxIntervalDays,
    // 목표마다 다르게 정할 수 있다. 목표가 정한 것이 전역 기본값보다 앞선다.
    postGoalMode: goal?.post_goal_mode ?? settings.postGoalMode,
  }
}

export function memoryStateOf(item: ItemRow): MemoryState | null {
  if (item.stability === null || item.difficulty === null) return null
  return { stability: item.stability, difficulty: item.difficulty }
}

/**
 * 분산 그룹의 키.
 *
 * 목표가 아니라 준비 완료일이 기준이다. 목표에 안 묶어도 같은 날을 향하면 함께 펴진다.
 */
export function spreadGroupKey(config: EffectiveConfig): string | null {
  if (config.horizon.kind === 'open') return null
  if (config.horizon.kind === 'date') return config.horizon.at
  return config.horizon.readyAt
}

/** 항목이 아직 살아 있는지. 보관했거나 목표가 끝난 것은 목록에 올리지 않는다. */
export function isActive(item: ItemRow): boolean {
  return item.archived_at === null && item.state !== 'archived'
}

const NUMBER_TOKEN =
  /\d+\s*[~\-\u2013]\s*\d+\s*(번|쪽|페이지|문제)?|\d+\s*(번|회차|회|장|절|단원|챕터|쪽|페이지|일차|주차)/

/** 제목을 앞부분, 숫자 부분, 뒷부분으로 가른다. 숫자만 등폭으로 뽑아 쓰기 위해서다. */
export function splitTitle(title: string): {
  pre: string
  num: string
  post: string
} {
  const match = NUMBER_TOKEN.exec(title)
  if (!match) return { pre: title, num: '', post: '' }
  return {
    pre: title.slice(0, match.index),
    num: match[0],
    post: title.slice(match.index + match[0].length),
  }
}

/** 목표 색 4종을 순서대로 물린다. */
export const GOAL_COLORS = [
  'var(--goal-1)',
  'var(--goal-2)',
  'var(--goal-3)',
  'var(--goal-4)',
] as const

export function goalColor(goal: GoalRow | null, index: number): string {
  if (goal?.color) return goal.color
  return GOAL_COLORS[index % GOAL_COLORS.length]
}
