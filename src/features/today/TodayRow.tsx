import type { Grade } from '../../core/fsrs/types'
import { AdjustedBadge, Badge } from '../../components/Badge'
import { RailRow } from '../../components/Rail'
import type { GoalRow, ItemRow } from '../../db/types'
import { statusBadgeOf, dueReason } from '../../lib/badge'
import { cn } from '../../lib/cn'
import type { DateOnly } from '../../lib/date'
import {
  effectiveConfig,
  goalColor,
  memoryStateOf,
  splitTitle,
} from '../../lib/domain'
import { dueLabel, percent } from '../../lib/format'
import type { Settings } from '../../lib/settings'
import { defaultFsrs } from '../../core/fsrs/fsrs6'
import { diffDays } from '../../lib/date'
import { GRADE_HINT_SHORT } from '../../lib/grade'
import { gradeOptions } from './gradeOptions'

export interface TodayRowProps {
  item: ItemRow
  goal: GoalRow | null
  goalIndex: number
  settings: Settings
  today: DateOnly
  expanded: boolean
  showFullGradeHelp: boolean
  onToggle: () => void
  onRate: (grade: Grade) => void
  onOpen: () => void
}

export function TodayRow({
  item,
  goal,
  goalIndex,
  settings,
  today,
  expanded,
  showFullGradeHelp,
  onToggle,
  onRate,
  onOpen,
}: TodayRowProps) {
  const config = effectiveConfig(item, goal, settings)
  const state = memoryStateOf(item)
  const retention = state && item.last_review
    ? defaultFsrs.retrievability(
        Math.max(0, diffDays(item.last_review, today)),
        state.stability
      )
    : 1

  const options = gradeOptions({
    reviewedAt: today,
    lastReview: item.last_review,
    state,
    horizon: config.horizon,
    intensity: config.intensity,
    targetRetention: config.targetRetention,
    minReviews: config.minReviews,
    repsSinceGoal: item.reps_since_goal,
    bufferDays: settings.bufferDays,
    maxIntervalDays: config.maxIntervalDays,
  })

  const badge = statusBadgeOf(item.due_kind, item.goal_risk)
  const parts = splitTitle(item.title)
  // '다시' 를 누른 것은 다음 날짜가 내일이어도 오늘 목록에 남는다. 그 까닭을
  // 안 적으면 눌렀는데 그대로 있는 걸 보고 안 눌린 줄 안다.
  const relearning = item.state === 'relearning' && item.last_review === today

  return (
    <div
      role="listitem"
      className={cn(
        // 카드 안에 놓이므로 평소에는 바탕이 없다. 테를 안쪽으로 넣어야 마우스를
        // 올렸을 때 줄 높이가 안 흔들린다.
        'rounded-[9px] transition-colors',
        expanded
          ? 'bg-raise shadow-[inset_0_0_0_1.5px_var(--accent)]'
          : 'hover:bg-raise hover:shadow-[inset_0_0_0_1.5px_var(--accent)]'
      )}
    >
      <div className="flex h-[52px] items-center gap-3 pl-[14px]">
        <button
          type="button"
          role="checkbox"
          aria-checked={expanded}
          aria-label={`${item.title} 평가하기`}
          onClick={onToggle}
          className={cn(
            'h-[17px] w-[17px] flex-none rounded-[5px] border transition-colors',
            expanded ? 'border-accent bg-accent' : 'border-line-2 bg-surface'
          )}
        />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            title={`${item.title} 자세히 보기`}
            aria-label={`${item.title} 자세히 보기`}
            className="min-w-0 truncate text-left text-[15px] font-medium tracking-[-0.005em] hover:text-accent"
          >
            <span className="text-text-2">{parts.pre}</span>
            <span className="num text-[14px] font-medium">{parts.num}</span>
            <span className="text-text-2">{parts.post}</span>
          </button>
          {relearning ? (
            <span
              title="하나도 기억 안 났다고 하셨어요. 오늘 안에 한 번 더 보면 훨씬 오래 갑니다."
              className="flex-none rounded-[5px] bg-imp-bg px-[7px] py-[2px] text-[11px] font-medium text-imp-fg"
            >
              오늘 한 번 더
            </span>
          ) : null}
          {badge ? <Badge kind={badge} /> : null}
          {item.due_source === 'spread' ? (
            <AdjustedBadge hint="하루에 볼 게 많아서 날짜를 옮겼어요." />
          ) : null}
        </div>
        <RailRow
          retention={percent(retention)}
          due={dueLabel(today, item.due ?? today)}
          goalName={goal?.name ?? null}
          goalColor={goalColor(goal, goalIndex)}
        />
      </div>

      {expanded ? (
        <div className="px-[18px] pb-4 pl-[40px] pt-[2px]">
          <div className="flex items-baseline gap-[10px] pb-[9px]">
            <span className="text-[13px] text-text-2">얼마나 기억났나요?</span>
            {relearning ? (
              <span className="text-[12px] text-imp-fg">
                아까 하나도 기억 안 났다고 하셨어요. 오늘 안에 한 번 더 보시고
                그때 다시 골라주세요.
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-[repeat(4,minmax(0,168px))] gap-2">
            {options.map((option) => (
              <button
                key={option.grade}
                type="button"
                onClick={() => onRate(option.grade)}
                className="flex flex-col gap-[3px] rounded-[9px] border border-line-2 bg-surface px-[11px] pb-[10px] pt-[9px] text-left transition-colors hover:bg-raise"
                style={{ borderTopColor: option.color, borderTopWidth: 2 }}
              >
                <span className="flex w-full items-baseline gap-[6px]">
                  <span className="text-[13.5px] font-semibold text-text">
                    {option.name}
                  </span>
                  <span className="flex-1" />
                  <span className="num text-[10.5px] text-text-3">
                    {option.grade}
                  </span>
                </span>
                {showFullGradeHelp ? (
                  <span className="text-[11.5px] leading-snug text-text-3">
                    {option.hint}
                  </span>
                ) : null}
                <span className="num text-[12px] text-accent">{option.next}</span>
              </button>
            ))}
          </div>

          {!showFullGradeHelp ? (
            <p className="pt-[9px] text-[11.5px] text-text-3">
              {GRADE_HINT_SHORT}
            </p>
          ) : null}

          <p className="pt-[9px] text-[11.5px] text-text-3">
            {dueReason(item.due_kind)}
          </p>

        </div>
      ) : null}
    </div>
  )
}
