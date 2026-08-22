import type { Grade } from '../../core/fsrs/types'
import { AdjustedBadge, Badge } from '../../components/Badge'
import { DateField } from '../../components/DateField'
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
import { dueLabel, monthDay, percent, yesterdayOf } from '../../lib/format'
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
  focused: boolean
  showFullGradeHelp: boolean
  reviewDate: DateOnly
  onToggle: () => void
  onRate: (grade: Grade) => void
  onPickDate: (date: DateOnly) => void
  onOpen: () => void
}

export function TodayRow({
  item,
  goal,
  goalIndex,
  settings,
  today,
  expanded,
  focused,
  showFullGradeHelp,
  reviewDate,
  onToggle,
  onRate,
  onPickDate,
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
    reviewedAt: reviewDate,
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
  const yesterday = yesterdayOf(today)
  // 같은 날을 두 번 기록하지는 않으므로 마지막으로 본 날이 곧 고를 수 있는 가장 이른 날이다.
  const earliest = item.last_review
  const pickedOther = reviewDate !== today && reviewDate !== yesterday

  return (
    <div
      role="listitem"
      className={cn(
        'rounded-card transition-colors',
        focused && 'bg-hover ring-2 ring-accent',
        !focused && 'hover:bg-hover'
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
            <span className="num text-[11px] text-text-3">
              1~4 키로 바로 평가
            </span>
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

          <div className="flex flex-wrap items-center gap-2 pt-[10px]">
            <span className="text-[12px] text-text-3">언제 봤나요?</span>
            {[
              { label: '오늘', value: today },
              { label: '어제', value: yesterday },
            ].map((choice) => {
              // 마지막으로 본 날보다 앞선 날은 고를 수 없다. 눌러도 되돌려지는 단추를
              // 열어 두면 화면이 기록하지 않을 날짜를 기록한다고 말하게 된다.
              const tooEarly = earliest !== null && choice.value < earliest
              return (
                <button
                  key={choice.label}
                  type="button"
                  disabled={tooEarly}
                  title={
                    tooEarly
                      ? `${monthDay(earliest!)}에 본 뒤로는 그보다 이른 날로 기록할 수 없어요.`
                      : undefined
                  }
                  onClick={() => onPickDate(choice.value)}
                  className={cn(
                    'rounded-ctl border px-[10px] py-[5px] text-[12px]',
                    tooEarly && 'cursor-not-allowed border-line-2 bg-surface text-text-3 opacity-40',
                    !tooEarly && reviewDate === choice.value
                      ? 'border-accent bg-accent-soft font-semibold text-accent'
                      : !tooEarly &&
                        'border-line-2 bg-surface text-text-2 hover:bg-hover'
                  )}
                >
                  {choice.label}
                </button>
              )
            })}
            <DateField
              value={reviewDate}
              today={today}
              min={earliest}
              max={today}
              onChange={onPickDate}
              label="다른 날짜로 기록"
              active={pickedOther}
              text={pickedOther ? monthDay(reviewDate) : '다른 날'}
            />
            {reviewDate !== today ? (
              <span className="text-[12px] text-accent">
                {monthDay(reviewDate)}에 본 것으로 기록해요
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
