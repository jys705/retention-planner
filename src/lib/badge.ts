import type { DueKind, GoalRisk } from '../db/types'

/**
 * 상태 배지 세 종류. 없는 게 기본이다.
 *
 * 대부분의 행에는 배지가 없어야 한다. 그래야 붙어 있는 행이 눈에 띈다.
 * 모든 행에 뭔가 달려 있으면 배지가 아무 말도 못 하게 된다.
 */
export type StatusBadge = 'short' | 'important' | 'easy' | null

/** 우선순위: 부족 > 중요 > 여유 > 없음. 상태 배지는 하나만 붙는다. */
export function statusBadgeOf(
  dueKind: DueKind | null,
  goalRisk: GoalRisk | null
): StatusBadge {
  if (goalRisk === 'at_risk') return 'short'
  if (dueKind === 'deadline_pull') return 'important'
  if (dueKind === 'final_check') return 'easy'
  return null
}

export const BADGE_LABEL: Record<Exclude<StatusBadge, null>, string> = {
  short: '부족',
  important: '중요',
  easy: '여유',
}

export const BADGE_TONE: Record<Exclude<StatusBadge, null>, string> = {
  short: 'bg-imp-bg text-imp-fg',
  important: 'bg-imp-bg text-imp-fg',
  easy: 'bg-easy-bg text-easy-fg',
}

export const BADGE_HINT: Record<Exclude<StatusBadge, null>, string> = {
  short: '한 번 봐서는 목표한 날 기억이 모자라요. 목표한 날 전에 한 번 더 잡아둡니다.',
  important: '건너뛰면 목표한 날 기억이 목표치 아래로 떨어져요.',
  easy: '이미 충분히 기억하고 있어요. 건너뛰어도 괜찮아요.',
}

/** 오늘 볼 항목을 왜 오늘 보는지 한 문장으로. */
export function dueReason(dueKind: DueKind | null): string {
  switch (dueKind) {
    case 'deadline_pull':
      return '목표한 날에 기억을 지키려면 오늘 보는 게 좋아요.'
    case 'session_fill':
      return '목표한 날 전에 정해둔 횟수만큼 보려고 잡았어요.'
    case 'final_check':
      return '이미 충분히 기억하고 있어요. 마지막으로 한 번 훑는 자리예요.'
    case 'hold':
      return '목표한 기간 동안 기억을 붙잡아 두려고 잡았어요.'
    default:
      return '잊을 때가 돼서 올라왔어요.'
  }
}
