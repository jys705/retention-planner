import { Note, NoteButton } from '../../components/Note'
import { josa, monthDay, percent } from '../../lib/format'
import type { EndedGoalNotice, EndedNotice } from '../../lib/lifecycle'

/**
 * 목표를 마쳐서 항목을 내렸다고 알리는 줄.
 *
 * 목표가 끝나면 그 항목은 오늘 목록에서 말없이 빠진다. 아무 말이 없으면 지워진 줄
 * 안다. 며칠 지났는지는 말하지 않는다. 마친 목표에서 궁금한 것은 그게 아니다.
 * 확인을 누르거나 그 목표를 열어 보면 다시 뜨지 않는다.
 */
export function GoalEndedNote({
  notice,
  onOpenGoal,
  onDismiss,
}: {
  notice: EndedNotice
  onOpenGoal?: ((goalId: string) => void) | undefined
  onDismiss: () => void
}) {
  const only = notice.goals.length === 1 ? notice.goals[0] : null
  const names = notice.goals.map((g) => g.goal.name).join(', ')
  const count = notice.goals.reduce((sum, g) => sum + g.count, 0)

  return (
    <Note
      label={notice.goals.length > 0 ? '마친 목표' : '마친 항목'}
      actions={
        <>
          {only && onOpenGoal ? (
            <NoteButton onClick={() => onOpenGoal(only.goal.id)}>
              기록 보기
            </NoteButton>
          ) : null}
          <NoteButton onClick={onDismiss}>확인</NoteButton>
        </>
      }
    >
      <span className="text-[12.5px] leading-relaxed text-text-2">
        {notice.goals.length > 0 ? (
          <>
            <span className="font-medium text-text">{names}</span>
            {josa(names, '을', '를')}
            {only ? ` ${monthDay(only.end)}에` : ''} 마쳤어요.
          </>
        ) : (
          `목표한 날이 지난 낱개 ${notice.loose}개를 마쳤어요.`
        )}
      </span>
      <span className="text-[11.5px] leading-relaxed text-text-3">
        {notice.goals.length > 0
          ? `${
              only && only.known > 0
                ? `${resultLine(only)} 더 올라오지 않고 기록으로 남겨 뒀어요.`
                : `묶여 있던 ${count}개는 더 올라오지 않고 기록으로 남겨 뒀어요.`
            }${
              notice.loose > 0
                ? ` 날짜를 정해둔 낱개 ${notice.loose}개도 같이 마쳤어요.`
                : ''
            }`
          : '더 올라오지 않아요. 서재의 마친 것에 기록으로 남아 있어요.'}
      </span>
    </Note>
  )
}

/**
 * 결과 한 마디. 돌아온 사람이 가장 먼저 궁금한 것은 며칠 지났는지가 아니라
 * 목표한 날 기억이 충분했는지다.
 */
function resultLine(ended: EndedGoalNotice): string {
  const day = ended.goal.horizon_kind === 'window' ? '마지막 날' : '목표한 날'
  const goal = `목표 기억률 ${percent(ended.target)}를`
  if (ended.reached === ended.known) {
    return `${day} ${ended.known}개 모두 ${goal} 넘겼어요.`
  }
  if (ended.reached === 0) return `${day} ${goal} 넘긴 것은 없었어요.`
  return `${day} ${ended.known}개 가운데 ${ended.reached}개가 ${goal} 넘겼어요.`
}
