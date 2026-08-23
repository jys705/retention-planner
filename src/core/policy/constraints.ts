import { addDays, diffDays, toEpochDay, type DateOnly } from '../../lib/date'
import { defaultFsrs, Fsrs6 } from '../fsrs/fsrs6'
import type { Grade, MemoryState } from '../fsrs/types'
import {
  isOpen,
  NEVER,
  resolveHorizon,
  type Horizon,
  type ResolvedHorizon,
} from '../horizon/horizon'

export type Intensity = 'easy' | 'standard' | 'focus' | 'max'

export type DueKind =
  | 'normal'
  | 'session_fill'
  | 'deadline_pull'
  | 'final_check'
  | 'hold'

/** 복습 강도 프리셋과 그에 대응하는 목표 회상률. */
export const INTENSITY_RETENTION: Record<Intensity, number> = {
  easy: 0.85,
  standard: 0.9,
  focus: 0.94,
  max: 0.97,
}

export const INTENSITY_MIN = 0.7
export const INTENSITY_MAX = 0.97

export const DEFAULT_BUFFER_DAYS = 1
export const DEFAULT_TARGET_RETENTION = 0.9
export const DEFAULT_MIN_REVIEWS = 3
export const DEFAULT_INITIAL_GRADE: Grade = 3
export const MAX_INTERVAL_DAYS = 36500

/** 프리셋이든 슬라이더로 고른 숫자든 하나의 회상률로 만든다. */
export function resolveIntensity(intensity: Intensity | number): number {
  if (typeof intensity === 'number') {
    return Math.min(Math.max(intensity, INTENSITY_MIN), INTENSITY_MAX)
  }
  return INTENSITY_RETENTION[intensity]
}

export interface ConstraintSet {
  /** FSRS 가 원하는 간격. */
  base: number
  /** 준비 완료 마감선을 넘지 않기 위한 상한. */
  ready: number
  /** 목표 전에 최소 횟수를 채우기 위한 상한. */
  sessions: number
  /** 아무리 잘 외워도 이만큼은 넘기지 않는다는 안전장치. */
  maxcap: number
}

export interface ScheduleInput {
  /** 이 복습이 실제로 일어난 날. 지난 날짜로 기록하면 그날이 들어온다. */
  from: DateOnly
  /** 복습 직후의 기억 상태. */
  state: MemoryState
  horizon: Horizon
  intensity: Intensity | number
  /** 목표한 날 지켜야 할 기억률 하한. 전역 설정 하나로 쓴다. */
  targetRetention?: number
  minReviews?: number
  repsSinceGoal?: number
  bufferDays?: number
  maxIntervalDays?: number | null
  engine?: Fsrs6
}

export interface ScheduleResult {
  /** 실제로 잡은 간격. */
  intervalDays: number
  due: DateOnly
  dueKind: DueKind
  constraints: ConstraintSet
  /** 고원 구간에서 조여진 뒤의 최종 목표 회상률. */
  desiredRetention: number
  /** 준비 완료 마감선을 이미 지났는지. 지났으면 목표 후 처리로 넘어간다. */
  postGoalReached: boolean
  /** 두 마감선 사이에 들어와 기억률을 붙잡아 두는 구간인지. */
  inPlateau: boolean
}

/**
 * 준비 완료 마감선 제약.
 *
 * 마감선 전이면 그 날짜에서 버퍼를 뺀 날을 넘지 않게 하고,
 * 두 마감선 사이에 있으면 유지 마감선을 기준으로 같은 일을 한다.
 * 무기한이면 두 값이 무한이라 제약이 저절로 사라진다.
 *
 * 안 봐도 목표한 날 목표 기억률을 지키는 항목에는 이 제약이 살 게 없다.
 * 그때도 값을 돌려주면 `readyAt - buffer - fromDay` 라서 fromDay 가 상쇄되고,
 * 마지막으로 본 날이 언제든 stability 가 얼마든 모두 같은 하루로 빨려든다.
 * 목표는 기억률을 '넘기는' 것이지 그날 기억률을 '가장 높이는' 것이 아니다.
 */
function readyConstraint(
  horizon: ResolvedHorizon,
  fromDay: number,
  bufferDays: number,
  skipSafe: boolean
): number {
  if (skipSafe) return NEVER
  const beforeReady = horizon.readyAt - bufferDays - fromDay
  if (beforeReady >= 1) return beforeReady
  // 준비 마감선까지 남은 날이 없으면 유지 마감선을 기준으로 다시 본다.
  const beforeHold = horizon.holdUntil - bufferDays - fromDay
  if (beforeHold >= 1) return beforeHold
  // 마감선 안에 잡을 수 있는 날이 더는 없다. 여기서는 제약이 할 일이 없다.
  return NEVER
}

/**
 * 최소 복습 횟수 제약.
 *
 * 목표까지 남은 날을 남은 횟수로 나눠서, 남은 복습이 마감선 안에 다 들어가게 만든다.
 */
function sessionsConstraint(
  horizon: ResolvedHorizon,
  fromDay: number,
  minReviews: number,
  repsSinceGoal: number,
  bufferDays: number
): number {
  const remaining = Math.max(0, minReviews - repsSinceGoal)
  if (remaining === 0 || !Number.isFinite(horizon.readyAt)) return NEVER
  // 목표한 날 당일에 잡으면 그날은 이미 준비돼 있어야 하는 날인데 늦는다.
  const last = horizon.readyAt - bufferDays
  if (fromDay >= last) return NEVER
  return Math.floor((last - fromDay) / remaining)
}

/**
 * 다음 복습일을 정한다.
 *
 * FSRS 가 낸 간격 위에 명시적 제약 셋을 겹치고, 가장 짧은 것을 고른다.
 * 어느 제약이 이겼는지는 함께 돌려준다. "왜 이 날짜인가"에 화면에서 답해야 하기 때문이다.
 */
export function schedule(input: ScheduleInput): ScheduleResult {
  const engine = input.engine ?? defaultFsrs
  const buffer = input.bufferDays ?? DEFAULT_BUFFER_DAYS
  const targetRetention = input.targetRetention ?? DEFAULT_TARGET_RETENTION
  const minReviews = input.minReviews ?? DEFAULT_MIN_REVIEWS
  const repsSinceGoal = input.repsSinceGoal ?? 0

  const horizon = resolveHorizon(input.horizon)
  const fromDay = toEpochDay(input.from)

  const inPlateau =
    fromDay >= horizon.readyAt && fromDay <= horizon.holdUntil
  const postGoalReached = fromDay > horizon.holdUntil

  // 고원 구간에서는 강도가 여유쪽이어도 목표 기억률까지 조여준다.
  const desiredRetention = inPlateau
    ? Math.max(resolveIntensity(input.intensity), targetRetention)
    : resolveIntensity(input.intensity)

  // 이번 복습을 건너뛰어도 목표한 날 목표 기억률을 지키는가.
  // classify 가 final_check 를 가르는 바로 그 셈이다.
  const skipSafe =
    Number.isFinite(horizon.readyAt) &&
    horizon.readyAt > fromDay &&
    engine.retrievability(horizon.readyAt - fromDay, input.state.stability) >=
      targetRetention

  const constraints: ConstraintSet = {
    base: engine.nextInterval(desiredRetention, input.state.stability),
    ready: readyConstraint(horizon, fromDay, buffer, skipSafe),
    sessions: sessionsConstraint(
      horizon,
      fromDay,
      minReviews,
      repsSinceGoal,
      buffer
    ),
    maxcap: input.maxIntervalDays ?? NEVER,
  }

  const smallest = Math.min(
    constraints.base,
    constraints.ready,
    constraints.sessions,
    constraints.maxcap
  )
  const intervalDays = Math.min(Math.max(Math.round(smallest), 1), MAX_INTERVAL_DAYS)

  return {
    intervalDays,
    due: addDays(input.from, intervalDays),
    dueKind: classify({
      constraints,
      chosen: smallest,
      inPlateau,
      horizon,
      fromDay,
      state: input.state,
      targetRetention,
      engine,
    }),
    constraints,
    desiredRetention,
    postGoalReached,
    inPlateau,
  }
}

/**
 * 어느 제약이 날짜를 정했는지 가려낸다. 화면의 배지와 툴팁이 이 값을 쓴다.
 *
 * FSRS 가 원하는 것보다 앞당겨졌더라도, 이 복습을 건너뛰어도 목표한 날 기억률을
 * 지킬 수 있으면 급한 일이 아니다. 그건 따로 구분한다.
 */
function classify(args: {
  constraints: ConstraintSet
  chosen: number
  inPlateau: boolean
  horizon: ResolvedHorizon
  fromDay: number
  state: MemoryState
  targetRetention: number
  engine: Fsrs6
}): DueKind {
  const { constraints, chosen, inPlateau, horizon, fromDay, state } = args
  if (inPlateau) return 'hold'
  // FSRS 가 원한 간격이 그대로 살아남았으면 평범한 복습이다.
  if (chosen >= constraints.base) return 'normal'
  if (chosen >= constraints.maxcap && constraints.maxcap < constraints.ready) {
    return 'normal'
  }

  if (!isOpen(horizon)) {
    const daysToGoal = horizon.readyAt - fromDay
    const retentionIfSkipped = args.engine.retrievability(
      daysToGoal,
      state.stability
    )
    if (retentionIfSkipped >= args.targetRetention) return 'final_check'
  }

  return chosen >= constraints.sessions ? 'session_fill' : 'deadline_pull'
}

/**
 * 처음 공부한 날이 과거일 때의 초기 상태.
 *
 * 그날 '무난함' 으로 한 번 평가했다고 보고 거기서부터 센다.
 * 계산한 날짜가 이미 지났으면 그대로 둔다. 억지로 오늘로 당기지 않는다.
 * 그래야 오래 묵은 만큼 기억률이 낮게 잡히고, 다음에 성공했을 때 크게 오른다.
 */
export function initialSchedule(
  input: Omit<ScheduleInput, 'state' | 'from'> & {
    firstStudiedAt: DateOnly
    initialGrade?: Grade
  }
): ScheduleResult & { state: MemoryState } {
  const engine = input.engine ?? defaultFsrs
  const grade = input.initialGrade ?? DEFAULT_INITIAL_GRADE
  const state = engine.nextState(null, 0, grade)
  const result = schedule({
    ...input,
    from: input.firstStudiedAt,
    state,
    repsSinceGoal: input.repsSinceGoal ?? 1,
  })
  return { ...result, state }
}

/**
 * 평가 한 번을 반영한다.
 *
 * 지난 날짜로 기록할 수 있으므로 경과 일수와 다음 날짜 모두 실제 복습한 날에서 센다.
 * 어제 공부하고 오늘 적어도 간격이 하루 어긋나지 않는다.
 */
export function applyReview(input: {
  reviewedAt: DateOnly
  lastReview: DateOnly | null
  state: MemoryState | null
  grade: Grade
  horizon: Horizon
  intensity: Intensity | number
  targetRetention?: number
  minReviews?: number
  repsSinceGoal?: number
  bufferDays?: number
  maxIntervalDays?: number | null
  engine?: Fsrs6
}): ScheduleResult & {
  state: MemoryState
  elapsedDays: number
  retrievabilityAtReview: number
} {
  const engine = input.engine ?? defaultFsrs
  const elapsedDays = input.lastReview
    ? Math.max(0, diffDays(input.lastReview, input.reviewedAt))
    : 0

  const retrievabilityAtReview =
    input.state && input.lastReview
      ? engine.retrievability(elapsedDays, input.state.stability)
      : 1

  const state = engine.nextState(input.state, elapsedDays, input.grade)

  const result = schedule({
    from: input.reviewedAt,
    state,
    horizon: input.horizon,
    intensity: input.intensity,
    ...(input.targetRetention !== undefined && {
      targetRetention: input.targetRetention,
    }),
    ...(input.minReviews !== undefined && { minReviews: input.minReviews }),
    ...(input.repsSinceGoal !== undefined && {
      repsSinceGoal: input.repsSinceGoal,
    }),
    ...(input.bufferDays !== undefined && { bufferDays: input.bufferDays }),
    ...(input.maxIntervalDays !== undefined && {
      maxIntervalDays: input.maxIntervalDays,
    }),
    ...(input.engine !== undefined && { engine: input.engine }),
  })

  return { ...result, state, elapsedDays, retrievabilityAtReview }
}
