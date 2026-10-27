import { defaultFsrs } from '../../core/fsrs/fsrs6'
import type { Grade, MemoryState } from '../../core/fsrs/types'
import { resolveHorizon, type Horizon } from '../../core/horizon/horizon'
import { applyReview, type Intensity } from '../../core/policy/constraints'
import type { PostGoalMode } from '../../db/types'
import { toEpochDay, type DateOnly } from '../../lib/date'
import { intervalLabel } from '../../lib/format'
import { GRADE_META } from '../../lib/grade'

export interface GradeOption {
  grade: Grade
  name: string
  /** 기준이 없으면 다들 '쉬움' 을 누른다. 그래서 뜻을 늘 붙여 둔다. */
  hint: string
  /** 이걸 누르면 언제 다시 보게 되는지. */
  next: string
  /** 다음 날짜가 목표 밖이라 이것으로 마칠 때의 설명. */
  ends: string | null
  color: string
}

export interface GradePreviewInput {
  reviewedAt: DateOnly
  lastReview: DateOnly | null
  state: MemoryState | null
  horizon: Horizon
  intensity: Intensity | number
  targetRetention: number
  minReviews: number
  repsSinceGoal: number
  bufferDays: number
  maxIntervalDays: number | null
  postGoalMode: PostGoalMode
}

/**
 * 버튼 넷에 각각 다음 복습일을 붙인다.
 *
 * 결과를 안 보여주면 무엇을 고르는 건지 알 수 없다. 등급의 뜻과 결과를 같이 둔다.
 */
export function gradeOptions(input: GradePreviewInput): GradeOption[] {
  const { holdUntil } = resolveHorizon(input.horizon)
  const lastDay =
    Number.isFinite(holdUntil) && toEpochDay(input.reviewedAt) === holdUntil
  return GRADE_META.map((meta) => {
    const applied = applyReview({
      reviewedAt: input.reviewedAt,
      lastReview: input.lastReview,
      state: input.state,
      grade: meta.grade,
      horizon: input.horizon,
      intensity: input.intensity,
      targetRetention: input.targetRetention,
      minReviews: input.minReviews,
      repsSinceGoal: input.repsSinceGoal,
      bufferDays: input.bufferDays,
      maxIntervalDays: input.maxIntervalDays,
      engine: defaultFsrs,
    })
    // 다음 날짜가 목표 밖이면 그 날은 오지 않는다. 목표가 끝나면 보관하는 쪽에서는
    // 그 전에 내려가기 때문이다. 날짜를 적으면 오지 않을 날을 약속하는 것이 된다.
    const ends =
      input.postGoalMode === 'archive' &&
      Number.isFinite(holdUntil) &&
      toEpochDay(applied.due) > holdUntil
    return {
      grade: meta.grade,
      name: meta.name,
      hint: meta.hint,
      color: meta.color,
      next: ends ? '마침' : intervalLabel(applied.intervalDays),
      ends: ends
        ? lastDay
          ? '목표의 마지막 날이라 다음 날짜는 잡지 않아요.'
          : '목표한 날까지는 이것으로 마쳐요. 다음 날짜가 목표 뒤라서요.'
        : null,
    }
  })
}
