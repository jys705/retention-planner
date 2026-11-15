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

export interface DayReplayEntry {
  reviewedAt: DateOnly
  /** 같은 날 여러 번 누른 것의 앞뒤를 가른다. */
  recordedAt: string
  rating: Grade
}

/**
 * 하루에 마지막 평가 하나만 상태를 바꾼 것으로 보고 이력을 다시 돈다.
 *
 * 앱은 같은 날 다시 누르면 그날 첫 평가 전으로 되감고 새 등급만 반영한다. 그래서 한
 * 컴퓨터에서 쌓인 이력을 이렇게 돌면 저장된 상태와 같은 값이 나온다. 두 컴퓨터의 이력을
 * 합친 뒤에도 이 방식으로 돌면, 서로 다른 날 본 것은 둘 다 반영되고 같은 날 본 것은
 * 나중에 누른 것이 남는다.
 */
export function replayByDay(
  entries: readonly DayReplayEntry[],
  engine: Fsrs6 = defaultFsrs
): { state: MemoryState; lastReview: DateOnly; lastRating: Grade } | null {
  const ordered = [...entries].sort((a, b) =>
    a.reviewedAt !== b.reviewedAt
      ? a.reviewedAt < b.reviewedAt
        ? -1
        : 1
      : a.recordedAt < b.recordedAt
        ? -1
        : a.recordedAt > b.recordedAt
          ? 1
          : 0
  )
  // 날마다 마지막에 누른 것만 남긴다. 정렬했으니 같은 날의 뒤가 덮어쓴다.
  const lastOfDay = new Map<DateOnly, DayReplayEntry>()
  for (const entry of ordered) lastOfDay.set(entry.reviewedAt, entry)

  let state: MemoryState | null = null
  let previous: DateOnly | null = null
  let last: DayReplayEntry | null = null
  for (const entry of lastOfDay.values()) {
    const elapsedDays = previous
      ? Math.max(0, diffDays(previous, entry.reviewedAt))
      : 0
    state = engine.nextState(state, elapsedDays, entry.rating)
    previous = entry.reviewedAt
    last = entry
  }
  return state === null || last === null
    ? null
    : { state, lastReview: last.reviewedAt, lastRating: last.rating }
}

export interface DayReplayRow {
  /** 평가 직전의 기억 상태. 처음 공부한 날이면 null. */
  before: MemoryState | null
  after: MemoryState
  elapsedDays: number
  retrievabilityAtReview: number
}

/**
 * 평가 하나하나가 그때 본 값을 다시 셈한다. 차례는 정렬한 순서다.
 *
 * 앱이 평가를 적을 때와 같은 셈이다. 같은 날 다시 누른 것은 그날 첫 평가 직전으로
 * 되감아 셈하고, 그날의 상태는 마지막에 누른 것이 정한다. 한 컴퓨터의 이력을 돌리면
 * 저장된 값이 그대로 나온다. 두 컴퓨터의 이력을 합친 뒤 돌리면 한쪽만 보고 적었던
 * 값이 양쪽을 다 본 값으로 바뀐다.
 */
export function replayRowsByDay(
  entries: readonly DayReplayEntry[],
  engine: Fsrs6 = defaultFsrs
): { entry: DayReplayEntry; row: DayReplayRow }[] {
  const ordered = [...entries].sort((a, b) =>
    a.reviewedAt !== b.reviewedAt
      ? a.reviewedAt < b.reviewedAt
        ? -1
        : 1
      : a.recordedAt < b.recordedAt
        ? -1
        : a.recordedAt > b.recordedAt
          ? 1
          : 0
  )
  const rows: { entry: DayReplayEntry; row: DayReplayRow }[] = []
  // 앞선 날의 마지막 상태. 같은 날의 평가는 모두 이것에서 출발한다.
  let settled: MemoryState | null = null
  let settledDay: DateOnly | null = null
  let day: DateOnly | null = null
  let dayState: MemoryState | null = null
  for (const entry of ordered) {
    if (entry.reviewedAt !== day) {
      if (day !== null) {
        settled = dayState
        settledDay = day
      }
      day = entry.reviewedAt
    }
    const elapsedDays = settledDay
      ? Math.max(0, diffDays(settledDay, entry.reviewedAt))
      : 0
    const retrievabilityAtReview =
      settled && settledDay ? engine.retrievability(elapsedDays, settled.stability) : 1
    const after = engine.nextState(settled, elapsedDays, entry.rating)
    rows.push({
      entry,
      row: { before: settled, after, elapsedDays, retrievabilityAtReview },
    })
    dayState = after
  }
  return rows
}
