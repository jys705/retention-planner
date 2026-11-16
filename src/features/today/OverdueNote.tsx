import { cn } from '../../lib/cn'

/**
 * 큰 숫자 가운데 몇이 밀린 것인지 알리는 줄.
 *
 * 큰 숫자가 이제 밀린 것까지 세므로 여기 수는 그 안쪽 몫이다. '이 가운데' 를
 * 앞에 두어 따로 더할 수가 아니라는 걸 밝힌다. 다 밀린 날에는 같이 볼 오늘 것이
 * 없으니 '같이' 라는 말을 빼고, 그때도 수는 같은 색으로 세워 둔다.
 *
 * '밀린 것' 이라는 말은 예보와 항목 상세도 쓴다. 화면마다 다른 이름으로 부르면
 * 같은 것을 가리키는 줄 모른다.
 */
export function OverdueNote({
  overdue,
  mixed,
  compact = false,
}: {
  overdue: number
  mixed: boolean
  /** 좁은 카드에서는 말이 다음 줄로 넘어가도 되게 한다. */
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-baseline pt-[2px]',
        compact ? 'flex-wrap gap-x-[6px] gap-y-[1px]' : 'gap-[6px]'
      )}
    >
      <span className="break-keep text-[13px] text-text-2">
        {mixed ? '이 가운데 밀린 것' : '밀린 것'}
      </span>
      <span className="num text-[13px] font-semibold text-imp-fg">
        {overdue}개
      </span>
      <span className="break-keep text-[12px] text-text-3">
        {mixed
          ? '볼 날이 지났어요. 오늘 같이 보면 됩니다.'
          : '모두 볼 날이 지났어요.'}
      </span>
    </div>
  )
}
