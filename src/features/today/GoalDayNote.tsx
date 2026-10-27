import { Note } from '../../components/Note'
import type { GoalRow, ItemRow } from '../../db/types'
import type { DateOnly } from '../../lib/date'
import { isActive } from '../../lib/domain'
import { josa } from '../../lib/format'

/**
 * 오늘이 목표한 날일 때 뜨는 줄.
 *
 * 목표한 날은 시험을 보거나 발표를 하는 날이다. 그날 아침에 앱이 해야 할 일을
 * 들이밀면 계획이 아니라 짐이다. 준비는 전날까지 끝나 있으니 그 사실을 먼저
 * 말하고, 남은 것이 있으면 해도 되고 안 해도 되는 일로 권한다.
 *
 * 수는 그 목표의 것만 센다. 목록 전체를 세면 다른 목표의 해야 할 복습까지
 * '안 봐도 괜찮습니다' 로 덮는다. 준비하다 못 본 것이 있으면 준비가 끝났다고
 * 말하지 않는다.
 */
export function GoalDayNote({
  goals,
  items,
  today,
}: {
  goals: GoalRow[]
  items: readonly ItemRow[]
  today: DateOnly
}) {
  if (goals.length === 0) return null
  const ids = new Set(goals.map((g) => g.id))
  const mine = items.filter(
    (i) => i.goal_id !== null && ids.has(i.goal_id) && isActive(i) && i.due !== null
  )
  const missed = mine.filter((i) => i.due! < today).length
  const offered = mine.filter((i) => i.due === today).length
  // 목록에 다른 목표 것도 섰으면 어느 것을 안 봐도 되는지 이름으로 짚는다.
  const others = items.some(
    (i) =>
      isActive(i) &&
      i.due !== null &&
      i.due <= today &&
      (i.goal_id === null || !ids.has(i.goal_id))
  )
  const names = goals.map((g) => g.name).join(', ')

  return (
    <Note ariaLabel="목표한 날">
      <span className="text-[12.5px] text-text-2">
        오늘이 <span className="font-medium text-text">{names}</span>
        {josa(names, '을', '를')} 목표한 날이에요.
      </span>
      <span className="text-[11.5px] leading-relaxed text-text-3">
        {missed > 0
          ? `준비하면서 못 본 ${missed}개가 남아 있어요. 시간이 되면 그것부터 보세요.${
              offered > 0
                ? others
                  ? ` 나머지 ${names} 것은 안 봐도 괜찮습니다.`
                  : ' 나머지는 안 봐도 괜찮습니다.'
                : ''
            }`
          : offered > 0
            ? `준비는 어제까지 끝냈어요. ${
                others ? `목록의 ${names} 것은` : '아래 목록은'
              } 시간이 되면 한 번 훑어보시라고 올려둔 거예요. 안 봐도 괜찮습니다.`
            : '준비는 어제까지 끝냈어요. 오늘은 보실 게 없습니다.'}
      </span>
    </Note>
  )
}
