import { fromEpochDay, toEpochDay, type DateOnly } from '../../lib/date'

export interface CapCandidate {
  itemId: string
  /** 지금 잡혀 있는 날. */
  date: DateOnly
  /**
   * 이 날보다 이르게는 못 옮긴다.
   *
   * 날짜 조정이 자리를 잡아준 항목이면 그 구간의 이른 쪽 끝이다. 오늘이 아니다.
   * 이보다 일찍 옮기면 목표한 날 기억률이 목표치에 못 미친다.
   * 목표 시점이 없는 항목에만 오늘을 넘긴다.
   */
  notBefore: DateOnly
  /** 이 날보다 늦게는 못 옮긴다. 구간이 있으면 그 늦은 쪽 끝이다. */
  notAfter: DateOnly | null
  /** 밀어낼 때 뒤로 갈수록 먼저 밀린다. 큰 값이 더 잘 밀린다. */
  pushPriority: number
}

export interface CapResult {
  /** 옮겨진 항목만 담는다. */
  moved: Record<string, DateOnly>
  /** 상한을 여전히 넘는 날. 옮길 자리가 없어서 남은 것들이다. */
  stillOver: DateOnly[]
}

/**
 * 모든 목표를 합친 하루 총량이 상한을 넘으면 덜어낸다.
 *
 * 그룹별 조정이 끝난 뒤에 한 번 더 도는 층이다. 목표가 셋 겹치면 각각은
 * 잘 펴져 있어도 합쳐서 하루에 서른 개가 될 수 있다.
 *
 * 덜어낼 때는 미뤄도 덜 아쉬운 것부터 고른다. 이미 충분히 기억하고 있는 항목이
 * 먼저고, 목표한 날이 코앞인 항목은 마지막까지 남긴다.
 * 옮길 자리는 이른 쪽을 먼저 본다. 뒤로 밀면 마감선을 넘을 수 있기 때문이다.
 */
export function applyDailyCap(
  candidates: readonly CapCandidate[],
  cap: number
): CapResult {
  if (cap <= 0 || candidates.length === 0) {
    return { moved: {}, stillOver: [] }
  }

  const load = new Map<number, number>()
  const placed = new Map<string, number>()
  for (const candidate of candidates) {
    const day = toEpochDay(candidate.date)
    placed.set(candidate.itemId, day)
    load.set(day, (load.get(day) ?? 0) + 1)
  }

  const moved: Record<string, DateOnly> = {}

  // 이른 날부터 훑는다. 앞에서 덜어낸 결과가 뒤쪽 계산에 그대로 반영돼야 한다.
  const days = [...load.keys()].sort((a, b) => a - b)

  for (const day of days) {
    while ((load.get(day) ?? 0) > cap) {
      const onDay = candidates
        .filter((c) => placed.get(c.itemId) === day)
        .sort(
          (a, b) =>
            b.pushPriority - a.pushPriority ||
            (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0)
        )

      let movedOne = false
      for (const candidate of onDay) {
        const target = findRoom(candidate, day, load, cap)
        if (target === null) continue
        load.set(day, (load.get(day) ?? 1) - 1)
        load.set(target, (load.get(target) ?? 0) + 1)
        placed.set(candidate.itemId, target)
        moved[candidate.itemId] = fromEpochDay(target)
        movedOne = true
        break
      }
      // 아무것도 못 옮기면 이 날은 여기까지다. 무한 루프를 막는다.
      if (!movedOne) break
    }
  }

  const stillOver = days
    .filter((day) => (load.get(day) ?? 0) > cap)
    .map(fromEpochDay)

  return { moved, stillOver }
}

/**
 * 옮길 자리를 찾는다.
 *
 * 하루씩 벌려 가며 이른 쪽을 먼저 보고, 없으면 늦은 쪽을 본다.
 * 자기 구간을 벗어나거나 이미 꽉 찬 날에는 넣지 않는다.
 */
function findRoom(
  candidate: CapCandidate,
  from: number,
  load: Map<number, number>,
  cap: number
): number | null {
  const lower = toEpochDay(candidate.notBefore)
  const upper =
    candidate.notAfter === null
      ? Number.POSITIVE_INFINITY
      : toEpochDay(candidate.notAfter)

  for (let step = 1; step <= 60; step += 1) {
    const earlier = from - step
    if (earlier >= lower && (load.get(earlier) ?? 0) < cap) return earlier
    const later = from + step
    if (later <= upper && (load.get(later) ?? 0) < cap) return later
  }
  return null
}
