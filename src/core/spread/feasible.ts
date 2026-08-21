import { fromEpochDay, toEpochDay, type DateOnly } from '../../lib/date'
import { defaultFsrs, Fsrs6 } from '../fsrs/fsrs6'
import { Rating, type MemoryState } from '../fsrs/types'

export interface FeasibleInput {
  itemId: string
  /** 지금의 기억 상태. */
  state: MemoryState
  /** 그 상태가 세워진 날. 마지막 복습일, 없으면 처음 공부한 날. */
  anchor: DateOnly
  /** 준비 완료 마감선. 이 그룹이 공유하는 날짜다. */
  readyAt: DateOnly
  /** 이 날보다 이르게는 잡지 않는다. 보통 오늘이다. */
  notBefore: DateOnly
  bufferDays: number
  targetRetention: number
  engine?: Fsrs6
}

/**
 * 마무리 복습을 하루가 아니라 옮겨도 되는 구간으로 본다.
 *
 * 이 구간이 있어야 같은 날을 향하는 항목들을 서로 다른 날로 펼 수 있다.
 */
export interface FeasibleInterval {
  itemId: string
  /** 가장 이른 날. 이보다 일찍 보면 목표한 날 기억률이 목표치에 못 미친다. */
  earliest: number
  /** 가장 늦은 날. 마감선에서 버퍼를 뺀 날이다. */
  latest: number
  /** 한 번 봐서는 목표한 날 기억률을 못 맞추는 항목. */
  atRisk: boolean
  /** 목표한 날의 예상 기억률. 배치할 수 있는 가장 늦은 날에 봤다고 쳤을 때의 값이다. */
  bestRetentionAtGoal: number
  /** 마감선 안에 아직 잡을 수 있는 날이 남아 있는지. */
  hasRoomBeforeGoal: boolean
}

/**
 * 날짜 d 에 '알맞음' 으로 평가했다고 칠 때, 목표한 날의 기억률.
 *
 * d 가 늦어지면 두 가지가 동시에 일어난다. 복습 시점의 기억률이 낮아져서 그만큼
 * 기억 지속력이 크게 오르고, 목표까지 남은 기간이 짧아진다. 둘 다 목표한 날의
 * 기억률을 올리는 쪽이라 이 함수는 d 에 대해 단조 증가한다. 이분 탐색의 전제다.
 */
export function retentionAtGoal(
  input: Pick<FeasibleInput, 'state' | 'anchor' | 'readyAt'> & {
    engine?: Fsrs6
  },
  day: number
): number {
  const engine = input.engine ?? defaultFsrs
  const anchorDay = toEpochDay(input.anchor)
  const goalDay = toEpochDay(input.readyAt)

  const elapsed = Math.max(0, day - anchorDay)
  const r = engine.retrievability(elapsed, input.state.stability)
  const stabilityAfter = engine.nextRecallStability(
    input.state.difficulty,
    input.state.stability,
    r,
    Rating.Good
  )
  return engine.retrievability(Math.max(0, goalDay - day), stabilityAfter)
}

/**
 * 항목 하나의 옮길 수 있는 날짜 범위를 구한다.
 *
 * 늦은 쪽 끝은 마감선에서 버퍼를 뺀 날로 바로 나오고,
 * 이른 쪽 끝은 목표 기억률을 넘기는 첫 날을 이분 탐색으로 찾는다.
 */
export function feasibleInterval(input: FeasibleInput): FeasibleInterval {
  const notBeforeDay = toEpochDay(input.notBefore)
  const latest = toEpochDay(input.readyAt) - input.bufferDays

  // 마감선 안에 잡을 수 있는 날이 아예 없는 경우.
  // 배치는 해야 하므로 창을 오늘 하루로 좁히고 부족으로 표시한다.
  if (latest < notBeforeDay) {
    return {
      itemId: input.itemId,
      earliest: notBeforeDay,
      latest: notBeforeDay,
      atRisk: true,
      bestRetentionAtGoal: retentionAtGoal(input, notBeforeDay),
      hasRoomBeforeGoal: false,
    }
  }

  const bestRetentionAtGoal = retentionAtGoal(input, latest)
  if (bestRetentionAtGoal < input.targetRetention) {
    // 가장 늦게 봐도 목표치에 못 미친다. 한 번으로는 부족한 항목이다.
    return {
      itemId: input.itemId,
      earliest: notBeforeDay,
      latest,
      atRisk: true,
      bestRetentionAtGoal,
      hasRoomBeforeGoal: true,
    }
  }

  if (retentionAtGoal(input, notBeforeDay) >= input.targetRetention) {
    return {
      itemId: input.itemId,
      earliest: notBeforeDay,
      latest,
      atRisk: false,
      bestRetentionAtGoal,
      hasRoomBeforeGoal: true,
    }
  }

  // 목표치를 넘기는 첫 날을 찾는다. lo 는 항상 미달, hi 는 항상 충족이다.
  let lo = notBeforeDay
  let hi = latest
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (retentionAtGoal(input, mid) >= input.targetRetention) {
      hi = mid
    } else {
      lo = mid
    }
  }

  return {
    itemId: input.itemId,
    earliest: hi,
    latest,
    atRisk: false,
    bestRetentionAtGoal,
    hasRoomBeforeGoal: true,
  }
}

export function intervalWidth(interval: FeasibleInterval): number {
  return Math.max(0, interval.latest - interval.earliest) + 1
}

export function intervalDates(interval: FeasibleInterval): DateOnly[] {
  const out: DateOnly[] = []
  for (let d = interval.earliest; d <= interval.latest; d += 1) {
    out.push(fromEpochDay(d))
  }
  return out
}
