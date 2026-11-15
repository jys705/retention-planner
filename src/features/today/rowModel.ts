import { defaultFsrs } from '../../core/fsrs/fsrs6'
import type { GoalRow, ItemRow, ReviewRow } from '../../db/types'
import { statusBadgeOf } from '../../lib/badge'
import { diffDays, type DateOnly } from '../../lib/date'
import {
  effectiveConfig,
  memoryStateOf,
  splitTitle,
  stateForRating,
} from '../../lib/domain'
import type { Settings } from '../../lib/settings'
import { gradeOptions } from './gradeOptions'

/**
 * 오늘 목록 한 줄이 보여줄 값.
 *
 * 앱의 오늘 화면과 옵시디언 카드가 같은 값을 그린다. 줄 모양은 달라도 등급 단추가
 * 약속하는 날짜와 기억률은 같아야 한다.
 */
export function todayRowModel({
  item,
  goal,
  reviews,
  settings,
  today,
}: {
  item: ItemRow
  goal: GoalRow | null
  /** 같은 날 다시 누를 때 그날 첫 평가 직전으로 되짚기 위해 필요하다. */
  reviews: readonly ReviewRow[]
  settings: Settings
  today: DateOnly
}) {
  const config = effectiveConfig(item, goal, settings)
  const state = memoryStateOf(item)
  // 저장할 때와 같은 계산을 봐야 버튼이 약속한 날짜가 실제로 잡힌다.
  const rating = stateForRating(item, reviews, today)
  const retention = state && item.last_review
    ? defaultFsrs.retrievability(
        Math.max(0, diffDays(item.last_review, today)),
        state.stability
      )
    : 1

  const options = gradeOptions({
    reviewedAt: today,
    lastReview: rating.lastReview,
    state: rating.state,
    horizon: config.horizon,
    intensity: config.intensity,
    targetRetention: config.targetRetention,
    minReviews: config.minReviews,
    // 저장할 때와 같이 지금 볼 이 한 번도 센다.
    repsSinceGoal: item.reps_since_goal + 1,
    bufferDays: settings.bufferDays,
    maxIntervalDays: config.maxIntervalDays,
    postGoalMode: config.postGoalMode,
  })

  const badge = statusBadgeOf(item.due_kind, item.goal_risk)
  const parts = splitTitle(item.title)


  return { retention, options, badge, parts }
}
