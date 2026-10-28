import { defaultFsrs } from '../../core/fsrs/fsrs6'
import { Note } from '../../components/Note'
import type { GoalRow, ItemRow } from '../../db/types'
import { diffDays, type DateOnly } from '../../lib/date'
import { goalRestsOnDay, isActive } from '../../lib/domain'
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
 * 말하지 않는다. 오늘 선 것이라도 기억이 목표 아래로 내려와 있으면 안 봐도
 * 된다고 하지 않는다.
 *
 * 그날을 비워 두기로 한 목표는 오늘 목록에 하나도 올리지 않는다. 그래서 무엇을
 * 왜 안 올렸는지를 여기서 말한다.
 */
export function GoalDayNote({
  goals,
  items,
  listed,
  today,
}: {
  goals: GoalRow[]
  items: readonly ItemRow[]
  /** 오늘 목록에 선 줄 수. 비워 둔 목표 말고도 선 것이 있으면 '아무것도' 라고 하지 않는다. */
  listed: number
  today: DateOnly
}) {
  if (goals.length === 0) return null
  const resting = goals.filter(goalRestsOnDay)
  const showing = goals.filter((g) => !goalRestsOnDay(g))
  const names = goals.map((g) => g.name).join(', ')

  return (
    <Note ariaLabel="목표한 날">
      <span className="text-[12.5px] text-text-2">
        오늘이 <span className="font-medium text-text">{names}</span>
        {josa(names, '을', '를')} 목표한 날이에요.
      </span>
      {showing.length > 0 ? (
        <span className="text-[11.5px] leading-relaxed text-text-3">
          {showingLine(showing, resting, items, today)}
        </span>
      ) : null}
      {resting.length > 0 ? (
        <span className="text-[11.5px] leading-relaxed text-text-3">
          {restingLine(resting, showing.length > 0, listed > 0, items, today)}
        </span>
      ) : null}
    </Note>
  )
}

/** 그날도 훑어볼 것을 올리는 목표들. */
function showingLine(
  showing: GoalRow[],
  resting: GoalRow[],
  items: readonly ItemRow[],
  today: DateOnly
): string {
  const byId = new Map(showing.map((g) => [g.id, g]))
  const restIds = new Set(resting.map((g) => g.id))
  const mine = items.filter(
    (i) => i.goal_id !== null && byId.has(i.goal_id) && isActive(i) && i.due !== null
  )
  const missed = mine.filter((i) => i.due! < today).length
  const offered = mine.filter((i) => i.due === today)
  // 건너뛰어도 되는지는 지금 기억률로 본다. 전날 '다시' 를 누른 것처럼 오늘 아침
  // 목표 아래에 있는 것을 '안 봐도 된다' 고 하면 거짓말이 된다.
  const short = offered.filter(
    (i) => retentionToday(i, today) < byId.get(i.goal_id!)!.target_retention
  ).length
  const optional = offered.length - short
  // 목록에 다른 것도 섰으면 어느 것을 안 봐도 되는지 이름으로 짚는다.
  // 비워 둔 목표의 것은 목록에 없으니 세지 않는다.
  const others = items.some(
    (i) =>
      isActive(i) &&
      i.due !== null &&
      i.due <= today &&
      (i.goal_id === null || (!byId.has(i.goal_id) && !restIds.has(i.goal_id)))
  )
  const names = showing.map((g) => g.name).join(', ')
  const prefix = resting.length > 0 ? `${names}${josa(names, '은', '는')} ` : ''

  if (missed > 0 || short > 0) {
    const parts = [
      missed > 0 ? `준비하면서 못 본 ${missed}개가 남아 있어요.` : '',
      short > 0
        ? `아직 기억이 모자란 ${short}개${missed > 0 ? '도' : '가'} 있어요.`
        : '',
      '시간이 되면 그것부터 보세요.',
      optional > 0
        ? others
          ? `나머지 ${names} 것은 안 봐도 괜찮습니다.`
          : '나머지는 안 봐도 괜찮습니다.'
        : '',
    ]
    return prefix + parts.filter(Boolean).join(' ')
  }
  if (optional > 0) {
    return `${prefix}준비는 어제까지 끝냈어요. ${
      others ? `목록의 ${names} 것은` : '아래 목록은'
    } 시간이 되면 한 번 훑어보시라고 올려둔 거예요. 안 봐도 괜찮습니다.`
  }
  return `${prefix}준비는 어제까지 끝냈어요. 오늘은 보실 게 없습니다.`
}

/** 그날을 비워 두기로 한 목표들. */
function restingLine(
  resting: GoalRow[],
  mixed: boolean,
  othersListed: boolean,
  items: readonly ItemRow[],
  today: DateOnly
): string {
  const byId = new Map(resting.map((g) => [g.id, g]))
  const mine = items.filter(
    (i) =>
      i.goal_id !== null && byId.has(i.goal_id) && isActive(i) && i.due !== null
  )
  const missed = mine.filter((i) => i.due! < today).length
  // 밀린 것 말고 지금 기억이 목표 아래인 것. 전날 '다시' 를 눌러 다음 날짜가 목표한
  // 날이나 그 뒤로 떨어진 것이 그렇다. 날짜가 어디에 잡혔든 오늘 아침 기억이 모자라면
  // 준비가 끝났다고 하지 않는다.
  const short = mine.filter(
    (i) =>
      i.due! >= today &&
      retentionToday(i, today) < byId.get(i.goal_id!)!.target_retention
  ).length
  const names = resting.map((g) => g.name).join(', ')
  // 목록에 다른 것이 서 있으면 '아무것도' 가 거짓이 된다. 어느 목표 것을 뺐는지 짚는다.
  const what = mixed
    ? `${names}${josa(names, '은', '는')} `
    : othersListed
      ? `${names} 것은 `
      : ''
  const prepared = missed === 0 && short === 0
  if (prepared && !mixed) {
    return othersListed
      ? `준비는 어제까지 끝냈어요. 비워 두기로 해서 ${what}오늘 목록에 올리지 않았어요.`
      : '준비는 어제까지 끝냈어요. 비워 두기로 해서 오늘은 아무것도 올리지 않았어요.'
  }
  const head = mixed
    ? `${what}비워 두기로 해서 오늘 목록에 올리지 않았어요.`
    : `비워 두기로 해서 ${what}오늘 목록에 올리지 않았어요.`
  if (prepared) return head
  return [
    head,
    missed > 0 ? `준비하면서 못 본 ${missed}개도 올리지 않았어요.` : '',
    short > 0 ? `아직 기억이 모자란 ${short}개도 올리지 않았어요.` : '',
    "보시려면 목표 화면에서 '훑어볼 것 올리기'로 바꾸세요.",
  ]
    .filter(Boolean)
    .join(' ')
}

function retentionToday(item: ItemRow, today: DateOnly): number {
  if (item.stability === null || item.last_review === null) return 1
  return defaultFsrs.retrievability(
    Math.max(0, diffDays(item.last_review, today)),
    item.stability
  )
}
