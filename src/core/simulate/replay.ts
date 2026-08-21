import { diffDays, type DateOnly } from '../../lib/date'
import { defaultFsrs, Fsrs6 } from '../fsrs/fsrs6'
import type { Grade, MemoryState } from '../fsrs/types'

export interface ReplayEntry {
  reviewedAt: DateOnly
  rating: Grade
}

export interface ReplayPoint {
  reviewedAt: DateOnly
  elapsedDays: number
  retrievabilityAtReview: number
  state: MemoryState
}

/**
 * 평가 이력을 처음부터 다시 돌려 기억 상태를 복원한다.
 *
 * 저장된 상태가 아니라 이력이 원본이다. 나중에 파라미터를 바꿔 다시 계산하거나,
 * 잘못 기록한 평가를 지웠을 때 이력만 있으면 상태를 되살릴 수 있다.
 */
export function replayReviews(
  entries: readonly ReplayEntry[],
  engine: Fsrs6 = defaultFsrs
): ReplayPoint[] {
  const ordered = [...entries].sort((a, b) =>
    a.reviewedAt < b.reviewedAt ? -1 : a.reviewedAt > b.reviewedAt ? 1 : 0
  )

  const points: ReplayPoint[] = []
  let state: MemoryState | null = null
  let previous: DateOnly | null = null

  for (const entry of ordered) {
    const elapsedDays = previous
      ? Math.max(0, diffDays(previous, entry.reviewedAt))
      : 0
    const retrievabilityAtReview =
      state === null ? 1 : engine.retrievability(elapsedDays, state.stability)
    state = engine.nextState(state, elapsedDays, entry.rating)
    points.push({
      reviewedAt: entry.reviewedAt,
      elapsedDays,
      retrievabilityAtReview,
      state,
    })
    previous = entry.reviewedAt
  }

  return points
}

export function replayState(
  entries: readonly ReplayEntry[],
  engine: Fsrs6 = defaultFsrs
): MemoryState | null {
  const points = replayReviews(entries, engine)
  return points.length === 0 ? null : points[points.length - 1].state
}
