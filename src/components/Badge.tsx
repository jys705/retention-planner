import { BADGE_HINT, BADGE_LABEL, BADGE_TONE, type StatusBadge } from '../lib/badge'
import { cn } from '../lib/cn'

export function Badge({ kind }: { kind: Exclude<StatusBadge, null> }) {
  return (
    <span
      title={BADGE_HINT[kind]}
      className={cn(
        'flex-none rounded-[5px] px-2 py-[3px] text-[11px] font-semibold',
        BADGE_TONE[kind]
      )}
    >
      {BADGE_LABEL[kind]}
    </span>
  )
}

/** 날짜가 옮겨졌다는 정보 배지. 무채색으로 한 단 낮춘다. 상태 배지와 함께 붙을 수 있다. */
export function AdjustedBadge({ hint }: { hint?: string }) {
  return (
    <span
      title={hint ?? '하루에 몰리지 않게 날짜를 옮겼어요.'}
      className="flex-none rounded-[5px] bg-adj-bg px-2 py-[3px] text-[11px] font-medium text-adj-fg"
    >
      날짜 조정됨
    </span>
  )
}
