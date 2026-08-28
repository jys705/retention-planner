import { dueLabel, josa } from '../../lib/format'
import { gradeName } from '../../lib/grade'
import type { LastRating } from '../../store/planner'
import type { DateOnly } from '../../lib/date'

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
  onUndo,
}: {
  last: LastRating
  today: DateOnly
  onUndo: () => void
}) {
  return (
    <section
      aria-label="방금 한 일"
      className="mb-[10px] flex items-center gap-3 rounded-card border border-line bg-surface px-[16px] py-[11px]"
    >
      <div className="flex min-w-0 flex-col gap-[2px]">
        <span className="text-[11.5px] text-text-3">방금 한 일</span>
        <span className="text-[12.5px] leading-relaxed text-text-2">
          {/* 제목이 길거나 숫자로 끝나도 문장과 안 엉키게 따옴표로 떼어 놓는다. */}
          <span className="text-text-1">{`"${last.title}"`}</span>
          {josa(last.title, '을', '를')}{' '}
          {gradeName(last.grade)}
          {josa(gradeName(last.grade), '으로', '로')} 적었어요. {tail(last, today)}
        </span>
      </div>
      <button
        type="button"
        onClick={onUndo}
        className="ml-auto flex-none rounded-ctl border border-line-2 px-[12px] py-[7px] text-[13px] text-text-2 transition-colors hover:bg-hover"
      >
        되돌리기
      </button>
    </section>
  )
}

/**
 * 뒷말.
 *
 * 등급 단추에 적혀 있던 날짜를 그대로 옮겨 적으면 안 된다. 하루에 볼 게 많으면
 * 그 뒤 다시 계산이 날짜를 옮기기 때문에 단추의 약속과 실제 날짜가 갈린다.
 * 여기서는 저장된 날짜를 말한다.
 */
function tail(last: LastRating, today: DateOnly): string {
  if (last.archived) return '목표를 다 채워서 서재에서도 내렸어요.'
  if (last.due === null) return '다음 날짜는 아직 없어요.'
  // 하루 상한이 밀어내면 방금 본 것이 오늘로 도로 잡히기도 한다. 그때
  // '다음은 오늘' 이라고 하면 줄이 그대로 있는 것과 어긋난다.
  if (last.due <= today) return '오늘 목록에 그대로 뒀어요.'
  return `다음은 ${dueLabel(today, last.due)}에 올라옵니다.`
}
