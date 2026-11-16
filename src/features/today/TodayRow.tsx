import type { Grade } from '../../core/fsrs/types'
import { AdjustedBadge, Badge } from '../../components/Badge'
import { RailRow } from '../../components/Rail'
import type { GoalRow, ItemRow, ReviewRow } from '../../db/types'
import { dueReason } from '../../lib/badge'
import { cn } from '../../lib/cn'
import type { DateOnly } from '../../lib/date'
import { goalColor } from '../../lib/domain'
import { dueLabel, percent } from '../../lib/format'
import type { Settings } from '../../lib/settings'
import { GRADE_HINT_SHORT } from '../../lib/grade'
import { useReveal } from '../../lib/reveal'
import { todayRowModel } from './rowModel'

export interface TodayRowProps {
  item: ItemRow
  /** 같은 날 다시 누를 때 그날 첫 평가 직전으로 되짚기 위해 필요하다. */
  reviews: readonly ReviewRow[]
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
  reviews,
}: TodayRowProps) {
  const { retention, options, badge, parts } = todayRowModel({
    item,
    goal,
    reviews,
    settings,
    today,
  })
  const panel = useReveal<HTMLDivElement>(expanded)

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
            className="group min-w-0 truncate text-left text-[15px] font-medium tracking-[-0.005em] hover:text-accent"
          >
            <span className="text-text-2 group-hover:text-accent">{parts.pre}</span>
            <span className="num text-[14px] font-medium">{parts.num}</span>
            <span className="text-text-2 group-hover:text-accent">{parts.post}</span>
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
        <div ref={panel} className="px-[18px] pb-4 pl-[40px] pt-[2px]">
          <div className="flex items-baseline gap-[10px] pb-[9px]">
            <span className="text-[13px] text-text-2">얼마나 기억났나요?</span>
          </div>

          <div className="grid grid-cols-[repeat(4,minmax(0,168px))] gap-2">
            {options.map((option) => (
              <button
                key={option.grade}
                type="button"
                title={option.ends ?? undefined}
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
                  <span className="text-pretty break-keep text-[11.5px] leading-snug text-text-3">
                    {option.hint}
                  </span>
                ) : null}
                {/* 설명 줄 수가 달라도 다음 날짜는 네 칸 모두 바닥에 맞춘다. */}
                <span className="num mt-auto text-[12px] text-accent">{option.next}</span>
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
