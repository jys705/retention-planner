import { josa } from '../../lib/format'
import type { GoalRow } from '../../db/types'

/**
 * 오늘이 목표한 날일 때 뜨는 줄.
 *
 * 목표한 날은 시험을 보거나 발표를 하는 날이다. 그날 아침에 앱이 해야 할 일을
 * 들이밀면 계획이 아니라 짐이다. 준비는 전날까지 끝나 있으니 그 사실을 먼저
 * 말하고, 남은 것이 있으면 해도 되고 안 해도 되는 일로 권한다.
 */
export function GoalDayNote({
  goals,
  dueCount,
}: {
  goals: GoalRow[]
  dueCount: number
}) {
  if (goals.length === 0) return null
  const names = goals.map((g) => g.name).join(', ')
  return (
    <div className="mb-[10px] flex flex-col gap-[3px] rounded-card border border-line bg-surface px-[16px] py-[11px]">
      <span className="text-[12.5px] text-text-2">
        오늘이 <span className="font-medium text-text-1">{names}</span>
        {josa(names, '을', '를')} 목표한 날이에요.
      </span>
      <span className="text-[11.5px] leading-relaxed text-text-3">
        {dueCount > 0
          ? '준비는 어제까지 끝냈어요. 아래 목록은 시간이 되면 한 번 훑어보시라고 올려둔 거예요. 안 봐도 괜찮습니다.'
          : '준비는 어제까지 끝냈어요. 오늘은 보실 게 없습니다.'}
      </span>
    </div>
  )
}
