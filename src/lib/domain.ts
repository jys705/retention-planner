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
  /** 항목이 목표와 다른 설정을 쓰고 있는지. 화면에 그렇다고 알려준다. */
  overridden: boolean
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
  const own = horizonFrom(item.horizon_kind, item.ready_at, item.hold_until)
  const horizon = own ?? (goal ? goalHorizon(goal) : { kind: 'open' as const })

  return {
    horizon,
    intensity: item.intensity ?? goal?.intensity ?? settings.defaultIntensity,
    targetRetention:
      item.target_retention ?? goal?.target_retention ?? settings.targetRetention,
    minReviews: item.min_reviews ?? goal?.min_reviews ?? settings.minReviews,
    maxIntervalDays: goal?.max_interval_days ?? settings.maxIntervalDays,
    // 목표마다 다르게 정할 수 있다. 목표가 정한 것이 전역 기본값보다 앞선다.
    postGoalMode: goal?.post_goal_mode ?? settings.postGoalMode,
    overridden:
      own !== null ||
      item.intensity !== null ||
      item.target_retention !== null ||
      item.min_reviews !== null,
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

/**
 * 제목을 공백으로 자른 토큰들.
 */
export function titleTokens(title: string): string[] {
  return title.split(/\s+/).filter((t) => t.length > 0)
}

/**
 * 제목 여러 개가 앞에서부터 공유하는 부분.
 *
 * 한 제목만 보고 짐작하지 않고 실제로 여러 제목을 견줘서 찾는다.
 * 그래야 "모의고사 1회 오답" 처럼 미리 정해두지 않은 번호 표기가 나와도
 * 공통 부분을 놓치지 않는다.
 *
 * 뒤쪽 공통 부분은 접두사가 아니다. "1~10번 문제 풀이" 와 "11~20번 문제 풀이" 는
 * "문제 풀이" 를 공유하지만 그건 이름의 앞이 아니라 꼬리다.
 */
export function commonTitlePrefix(titles: readonly string[]): string {
  if (titles.length === 0) return ''
  const tokenized = titles.map(titleTokens)
  const shortest = Math.min(...tokenized.map((t) => t.length))

  const shared: string[] = []
  for (let i = 0; i < shortest; i += 1) {
    const token = tokenized[0][i]
    if (tokenized.every((t) => t[i] === token)) shared.push(token)
    else break
  }

  const prefix = shared.join(' ')
  // 비었거나 한 글자면 묶을 근거가 못 된다.
  return prefix.length <= 1 ? '' : prefix
}

/**
 * 제목들을 앞부분이 같은 것끼리 모은다.
 *
 * 첫 토큰이 같은 것을 한 통에 넣고, 그 통 안에서 실제 공통 앞부분을 구한다.
 */
export function groupByCommonPrefix<T>(
  entries: readonly T[],
  titleOf: (entry: T) => string
): Map<string, T[]> {
  const byFirstToken = new Map<string, T[]>()
  for (const entry of entries) {
    const first = titleTokens(titleOf(entry))[0]
    if (first === undefined) continue
    byFirstToken.set(first, [...(byFirstToken.get(first) ?? []), entry])
  }

  const out = new Map<string, T[]>()
  for (const bucket of byFirstToken.values()) {
    const prefix = commonTitlePrefix(bucket.map(titleOf))
    if (prefix === '') continue
    out.set(prefix, bucket)
  }
  return out
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
