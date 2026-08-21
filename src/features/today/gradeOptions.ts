import { defaultFsrs } from '../../core/fsrs/fsrs6'
import type { Grade, MemoryState } from '../../core/fsrs/types'
import type { Horizon } from '../../core/horizon/horizon'
import { applyReview, type Intensity } from '../../core/policy/constraints'
import type { DateOnly } from '../../lib/date'
import { intervalLabel } from '../../lib/format'

export interface GradeOption {
  grade: Grade
  name: string
  /** 기준이 없으면 다들 '쉬움' 을 누른다. 그래서 뜻을 늘 붙여 둔다. */
  hint: string
  /** 이걸 누르면 언제 다시 보게 되는지. */
  next: string
  color: string
}

const GRADE_META: {
  grade: Grade
  name: string
  hint: string
  color: string
}[] = [
  {
    grade: 1,
    name: '다시',
    hint: '거의 기억나지 않아 처음부터 다시 봤어요',
    color: 'var(--g1)',
  },
  {
    grade: 2,
    name: '어려움',
    hint: '떠올리는 데 오래 걸렸고 여러 번 막혔어요',
    color: 'var(--g2)',
  },
  {
    grade: 3,
    name: '알맞음',
    hint: '무난하게 기억났어요',
    color: 'var(--g3)',
  },
  {
    grade: 4,
    name: '쉬움',
    hint: '볼 필요도 없이 바로 나왔어요',
    color: 'var(--g4)',
  },
]

/** 짧게 줄인 기준. 평가에 익숙해진 뒤에 이걸로 바꾼다. */
export const GRADE_HINT_SHORT =
  '다시: 거의 기억 안 남 | 어려움: 여러 번 막힘 | 알맞음: 무난 | 쉬움: 바로 나옴'

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
