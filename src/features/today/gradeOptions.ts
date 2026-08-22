import { defaultFsrs } from '../../core/fsrs/fsrs6'
import type { Grade, MemoryState } from '../../core/fsrs/types'
import type { Horizon } from '../../core/horizon/horizon'
import { applyReview, type Intensity } from '../../core/policy/constraints'
import type { DateOnly } from '../../lib/date'
import { intervalLabel } from '../../lib/format'
import { GRADE_META } from '../../lib/grade'

export interface GradeOption {
  grade: Grade
  name: string
  /** 기준이 없으면 다들 '쉬움' 을 누른다. 그래서 뜻을 늘 붙여 둔다. */
  hint: string
  /** 이걸 누르면 언제 다시 보게 되는지. */
  next: string
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
}

/**
 * 버튼 넷에 각각 다음 복습일을 붙인다.
 *
 * 결과를 안 보여주면 무엇을 고르는 건지 알 수 없다. 등급의 뜻과 결과를 같이 둔다.
 */
export function gradeOptions(input: GradePreviewInput): GradeOption[] {
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
    return {
      grade: meta.grade,
      name: meta.name,
      hint: meta.hint,
      color: meta.color,
      next: intervalLabel(applied.intervalDays),
    }
  })
}
