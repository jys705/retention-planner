import { Note, NoteButton } from '../../components/Note'
import { dueLabel, josa, percent } from '../../lib/format'
import { gradeName } from '../../lib/grade'
import type { LastRating } from '../../store/planner'
import type { DateOnly } from '../../lib/date'

/**
 * 방금 본 것의 다음 날짜가 목표 밖일 때. 목표의 마지막 날인지, 목표한 날을 비워
 * 둬서 오늘이 마지막 복습일인지, 그보다 앞인지.
 */
export type Ending = 'lastDay' | 'restEve' | 'early' | null

/**
 * 방금 한 평가를 물릴 자리.
 *
 * 잘못 눌렀다는 걸 깨닫는 것은 등급을 누르고 몇 초 뒤 줄이 사라지는 그 자리다.
 * 그래서 판을 오늘 목록 바로 위에 둔다. 되돌리기는 방금 만든 것을 없던 일로
 * 하는 것이라 잃는 게 없으므로 확인을 묻지 않는다.
 */
export function JustDone({
  last,
  today,
  ending = null,
  shortOnGoalDay = null,
  onUndo,
}: {
  last: LastRating
  today: DateOnly
  ending?: Ending
  /** 비워 둔 목표한 날 아침의 기억률이 목표 아래로 예상되면 그 값. */
  shortOnGoalDay?: number | null
  onUndo: () => void
}) {
  return (
    <Note
      label="방금 한 일"
      actions={<NoteButton onClick={onUndo}>되돌리기</NoteButton>}
    >
      <span className="text-[12.5px] leading-relaxed text-text-2">
        {/* 제목이 길거나 숫자로 끝나도 문장과 안 엉키게 따옴표로 떼어 놓는다. */}
        <span className="text-text">{`"${last.title}"`}</span>
        {josa(last.title, '을', '를')}{' '}
        {gradeName(last.grade)}
        {josa(gradeName(last.grade), '으로', '로')} 적었어요. {tail(last, today, ending)}
        {ending === 'restEve' && shortOnGoalDay !== null
          ? ` 그날 아침에는 기억이 ${percent(shortOnGoalDay)}로 목표에 모자라요. 그날도 보시려면 목표 화면에서 '훑어볼 것 올리기'로 바꾸세요.`
          : ''}
      </span>
    </Note>
  )
}

/**
 * 뒷말.
 *
 * 등급 단추에 적혀 있던 날짜를 그대로 옮겨 적으면 안 된다. 하루에 볼 게 많으면
 * 그 뒤 다시 계산이 날짜를 옮기기 때문에 단추의 약속과 실제 날짜가 갈린다.
 * 여기서는 저장된 날짜를 말한다.
 */
function tail(last: LastRating, today: DateOnly, ending: Ending): string {
  if (last.archived) return '목표를 마쳐서 서재의 마친 것으로 옮겼어요.'
  // 다음 날짜가 목표 밖이면 그 날은 오지 않는다. 날짜를 말하면 거짓 약속이 된다.
  if (ending === 'lastDay') return '목표의 마지막 날이라 다음 날짜는 잡지 않아요.'
  if (ending === 'restEve') {
    return '목표한 날은 비워 두기로 해서 이것이 마지막 복습이에요.'
  }
  if (ending === 'early') return '목표한 날까지는 이것으로 마쳐요.'
  if (last.due === null) return '다음 날짜는 아직 없어요.'
  // 하루 상한이 밀어내면 방금 본 것이 오늘로 도로 잡히기도 한다. 그때
  // '다음은 오늘' 이라고 하면 줄이 그대로 있는 것과 어긋난다.
  if (last.due <= today) return '오늘 목록에 그대로 뒀어요.'
  const when = dueLabel(today, last.due)
  // '내일에' 와 '모레에' 는 어색하다. 날짜나 'N일 뒤' 에만 '에' 를 붙인다.
  const at = when === '내일' || when === '모레' ? when : `${when}에`
  return `다음은 ${at} 올라옵니다.`
}
