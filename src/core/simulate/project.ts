import { addDays, diffDays, toEpochDay, type DateOnly } from '../../lib/date'
import { defaultFsrs, Fsrs6 } from '../fsrs/fsrs6'
import type { Grade, MemoryState } from '../fsrs/types'
import { resolveHorizon, type Horizon } from '../horizon/horizon'
import {
  schedule,
  type DueKind,
  type Intensity,
} from '../policy/constraints'

export interface ProjectionSettings {
  horizon: Horizon
  intensity: Intensity | number
  targetRetention?: number
  minReviews?: number
  repsSinceGoal?: number
  bufferDays?: number
  maxIntervalDays?: number | null
}

export interface ProjectItemInput extends ProjectionSettings {
  itemId: string
  /** 지금의 기억 상태. 아직 평가가 없으면 null. */
  state: MemoryState | null
  /** 그 상태가 세워진 날. */
  anchor: DateOnly
  /** 이미 잡혀 있는 다음 복습일. */
  due: DateOnly
  /**
   * 이미 잡아둔 복습 날짜들. 있으면 이쪽을 먼저 쓰고 그 뒤부터 내다본다.
   *
   * 한 번으로 부족한 항목에는 복습이 둘 잡혀 있다. 그걸 빼고 세면
   * 예보가 실제보다 적게 나온다.
   */
  plannedDates?: readonly DateOnly[]
  /** 언제부터 볼지. 보통 오늘이다. */
  from: DateOnly
  /** 며칠 앞까지 내다볼지. */
  days: number
  /** 앞으로의 평가를 몇 점으로 가정할지. 기본은 '알맞음'. */
  assumedGrade?: Grade
  engine?: Fsrs6
}

export interface ProjectedReview {
  date: DateOnly
  dueKind: DueKind
  /** 그날 복습 직전의 기억률. */
  retrievabilityAtReview: number
  /** 그날 복습 직후의 기억 상태. */
  state: MemoryState
}

/**
 * 앞으로의 복습 일정을 내다본다.
 *
 * 앞으로 계속 '알맞음' 을 누른다고 가정하고 스케줄러를 그대로 돌린다.
 * 그래프와 새 항목 미리보기가 이 결과를 쓴다.
 */
export function projectItem(input: ProjectItemInput): ProjectedReview[] {
  const engine = input.engine ?? defaultFsrs
  const grade = input.assumedGrade ?? 3
  const until = toEpochDay(input.from) + input.days

  const out: ProjectedReview[] = []
  let state = input.state
  let anchor = input.anchor
  let repsSinceGoal = input.repsSinceGoal ?? 0

  // 잡아둔 날짜가 있으면 그것부터 쓴다. 없으면 다음 복습일 하나로 시작한다.
  const queue = [...(input.plannedDates ?? [])]
    .filter((d) => toEpochDay(d) >= toEpochDay(input.from))
    .sort()
  let cursor = queue.length > 0 ? (queue.shift() as DateOnly) : input.due

  // 연체된 항목은 오늘 보는 것으로 친다. 지나간 날에 복습이 일어날 수는 없다.
  if (toEpochDay(cursor) < toEpochDay(input.from)) cursor = input.from

  // 60일을 하루 간격으로 채워도 이 수를 넘지 않는다. 무한 루프를 막는 안전장치다.
  const maxReviews = input.days + 2

  for (let i = 0; i < maxReviews; i += 1) {
    if (toEpochDay(cursor) > until) break

    const elapsed = state ? Math.max(0, diffDays(anchor, cursor)) : 0
    const retrievabilityAtReview = state
      ? engine.retrievability(elapsed, state.stability)
      : 1

    const nextState = engine.nextState(state, elapsed, grade)
    repsSinceGoal += 1

    const result = schedule({
      from: cursor,
      state: nextState,
      horizon: input.horizon,
      intensity: input.intensity,
      repsSinceGoal,
      ...(input.targetRetention !== undefined && {
        targetRetention: input.targetRetention,
      }),
      ...(input.minReviews !== undefined && { minReviews: input.minReviews }),
      ...(input.bufferDays !== undefined && { bufferDays: input.bufferDays }),
      ...(input.maxIntervalDays !== undefined && {
        maxIntervalDays: input.maxIntervalDays,
      }),
      engine,
    })

    out.push({
      date: cursor,
      dueKind: result.dueKind,
      retrievabilityAtReview,
      state: nextState,
    })

    state = nextState
    anchor = cursor
    // 잡아둔 날짜가 남아 있으면 그쪽을 먼저 따른다.
    const upcoming = queue.shift()
    cursor =
      upcoming !== undefined && toEpochDay(upcoming) > toEpochDay(anchor)
        ? upcoming
        : result.due
  }

  return out
}

export interface CurvePoint {
  date: DateOnly
  retention: number
  /** 그날 복습이 있는지. 곡선의 톱니가 여기서 100% 로 튄다. */
  reviewed: boolean
  /** 아직 오지 않은 구간인지. 화면에서 점선으로 그린다. */
  projected: boolean
}

export interface MemoryCurveInput {
  /** 지난 평가들. 날짜와 그 직후의 기억 상태. */
  history: { date: DateOnly; state: MemoryState }[]
  /** 앞으로의 예상 복습들. */
  future: { date: DateOnly; state: MemoryState }[]
  from: DateOnly
  to: DateOnly
  today: DateOnly
  engine?: Fsrs6
}

/**
 * 날짜별 기억률을 뽑는다.
 *
 * 복습할 때마다 1 로 튀었다가 망각 곡선을 따라 내려온다. 그 톱니가 그래프의 본체다.
 */
export function memoryCurve(input: MemoryCurveInput): CurvePoint[] {
  const engine = input.engine ?? defaultFsrs
  const marks = [...input.history, ...input.future].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  )
  const reviewDays = new Set(marks.map((m) => m.date))
  const todayDay = toEpochDay(input.today)

  const out: CurvePoint[] = []
  const start = toEpochDay(input.from)
  const end = toEpochDay(input.to)
  let index = -1

  for (let day = start; day <= end; day += 1) {
    const date = addDays(input.from, day - start)
    while (index + 1 < marks.length && marks[index + 1].date <= date) {
      index += 1
    }
    const active = index >= 0 ? marks[index] : null
    const retention = active
      ? engine.retrievability(diffDays(active.date, date), active.state.stability)
      : 0
    out.push({
      date,
      retention,
      reviewed: reviewDays.has(date),
      projected: day > todayDay,
    })
  }

  return out
}

export interface GroupProjectionInput {
  items: ProjectItemInput[]
  from: DateOnly
  days: number
}

/** 날짜별 복습 개수. 예보 화면의 막대와 달력 히트맵이 이 값을 쓴다. */
export function projectGroup(input: GroupProjectionInput): {
  dailyCount: Record<DateOnly, number>
  byKind: Record<DateOnly, Partial<Record<DueKind, number>>>
  total: number
} {
  const dailyCount: Record<DateOnly, number> = {}
  const byKind: Record<DateOnly, Partial<Record<DueKind, number>>> = {}
  let total = 0

  for (const item of input.items) {
    for (const review of projectItem({
      ...item,
      from: input.from,
      days: input.days,
    })) {
      dailyCount[review.date] = (dailyCount[review.date] ?? 0) + 1
      const bucket = (byKind[review.date] ??= {})
      bucket[review.dueKind] = (bucket[review.dueKind] ?? 0) + 1
      total += 1
    }
  }

  return { dailyCount, byKind, total }
}

export type Feasibility = 'relaxed' | 'fitting' | 'tight'

export const FEASIBILITY_LABEL: Record<Feasibility, string> = {
  relaxed: '여유',
  fitting: '적정',
  tight: '빠듯',
}

export interface DiagnoseResult {
  feasibility: Feasibility
  /** 목표한 날까지 잡히는 복습 수. */
  plannedReviews: number
  /** 목표 시점이 없었다면 같은 기간에 잡혔을 복습 수. */
  naturalReviews: number
  /** 목표한 날의 예상 기억률. */
  retentionAtGoal: number
}

/**
 * 이 목표 시점이 지킬 만한지 가늠한다.
 *
 * 목표 시점을 뺐을 때와 견줘서, 마감선 때문에 복습이 얼마나 늘어나는지를 본다.
 * 늘어나는 폭이 작으면 여유고, 배 넘게 늘어나면 빠듯하다.
 */
export function diagnose(
  input: Omit<ProjectItemInput, 'days'> & { days?: number }
): DiagnoseResult {
  const engine = input.engine ?? defaultFsrs
  const resolved = resolveHorizon(input.horizon)
  const fromDay = toEpochDay(input.from)
  const daysToGoal = Number.isFinite(resolved.readyAt)
    ? Math.max(1, resolved.readyAt - fromDay)
    : (input.days ?? 60)

  const planned = projectItem({ ...input, days: daysToGoal })
  const natural = projectItem({
    ...input,
    days: daysToGoal,
    horizon: { kind: 'open' },
  })

  const last = planned[planned.length - 1]
  const retentionAtGoal = last
    ? engine.retrievability(
        Math.max(0, daysToGoal - (toEpochDay(last.date) - fromDay)),
        last.state.stability
      )
    : 0

  const minReviews = input.minReviews ?? 3
  const ratio = planned.length / Math.max(1, natural.length)

  let feasibility: Feasibility
  if (
    Number.isFinite(resolved.readyAt) &&
    (planned.length < minReviews || ratio > 2)
  ) {
    feasibility = 'tight'
  } else if (ratio > 1.25) {
    feasibility = 'fitting'
  } else {
    feasibility = 'relaxed'
  }

  return {
    feasibility,
    plannedReviews: planned.length,
    naturalReviews: natural.length,
    retentionAtGoal,
  }
}
