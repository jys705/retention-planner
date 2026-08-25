import type { MemoryState } from '../core/fsrs/types'
import type { Horizon } from '../core/horizon/horizon'
import type { Intensity } from '../core/policy/constraints'
import { addDays, type DateOnly } from './date'
import type {
  GoalRow,
  HorizonKind,
  ItemRow,
  PostGoalMode,
  ReviewRow,
} from '../db/types'
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

/**
 * 오늘 평가할 때 기준으로 삼을 기억 상태와 '마지막으로 본 날'.
 *
 * 같은 날 두 번째부터는 그날 첫 평가 직전으로 되짚는다. 지난 시간이 0 인 평가가
 * 겹쳐 쌓이면 기억 지속력이 무너지는데 화면의 날짜는 그대로라 안 보인다.
 * 하루에 몇 번을 누르든 그날의 마지막 답 하나만 반영한다.
 *
 * 저장할 때와 버튼에 미리 적을 때가 같은 값을 봐야 한다. 갈라지면 버튼이
 * 약속한 날짜와 실제로 잡히는 날짜가 달라진다.
 */
export function stateForRating(
  item: ItemRow,
  reviews: readonly ReviewRow[],
  reviewedAt: DateOnly
): { state: MemoryState | null; lastReview: DateOnly | null } {
  if (item.last_review !== reviewedAt) {
    return { state: memoryStateOf(item), lastReview: item.last_review }
  }

  const today = reviews
    .filter((r) => r.item_id === item.id && r.reviewed_at === reviewedAt)
    .sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1))
  const first = today[0]
  if (!first) return { state: memoryStateOf(item), lastReview: item.last_review }

  // 그날 첫 평가가 며칠 만이었는지는 그 기록이 들고 있다. 평가 목록을 거슬러
  // 훑으면 그 앞의 기록이 빠져 있을 때 하루도 안 지난 것처럼 되고, 같은 날
  // 고쳐 누를 때마다 답이 달라진다.
  const lastReview =
    first.s_before === null
      ? null
      : addDays(reviewedAt, -Math.max(0, Math.round(first.elapsed_days)))

  // 그날의 첫 평가 앞이 비어 있으면 그때 이 항목은 아직 처음이었다는 뜻이다.
  // 여기서 지금 값을 그대로 돌려주면 되감기가 안 되고, 같은 날 고쳐 누를 때마다
  // 기억 지속력이 겹쳐 깎인다.
  if (first.s_before === null || first.d_before === null) {
    return { state: null, lastReview }
  }

  return {
    state: { stability: first.s_before, difficulty: first.d_before },
    lastReview,
  }
}
