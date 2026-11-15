import { useState } from 'react'
import type { Grade } from '../../core/fsrs/types'
import { DEFAULT_INITIAL_GRADE } from '../../core/policy/constraints'
import { AdjustedBadge, Badge } from '../../components/Badge'
import type { GoalRow, ItemRow, ReviewRow } from '../../db/types'
import { dueReason } from '../../lib/badge'
import { cn } from '../../lib/cn'
import type { DateOnly } from '../../lib/date'
import { goalColor } from '../../lib/domain'
import { dueLabel, fullDate, josa, percent } from '../../lib/format'
import { GRADE_HINT_SHORT } from '../../lib/grade'
import type { Settings } from '../../lib/settings'
import { usePlanner, type NewItemDraft } from '../../store/planner'
import { submitAfterComposition } from '../../lib/ime'
import { JustDone } from './JustDone'
import { OverdueNote } from './OverdueNote'
import { todayRowModel } from './rowModel'
import { TodayEmpty } from './TodayEmpty'
import { useToday } from './useToday'

/** 카드에서 앱 화면으로 넘어갈 때 열 자리. null 이면 오늘 화면. */
export type OpenTarget = { itemId: string } | null

/**
 * 노트와 캔버스 카드 속에 서는 오늘 목록.
 *
 * 앱의 오늘 화면을 줄인 것이다. 매일 하는 일 셋만 남긴다. 오늘 볼 것 평가하기,
 * 방금 한 평가 되돌리기, 방금 공부한 것 한 줄 적기. 목표와 날짜를 고르는 일은
 * 자리가 넓은 앱 화면으로 넘긴다.
 *
 * 카드 폭은 사람이 정한다. 좁으면 등급 단추를 두 줄로 놓고 숫자만 남긴다.
 */
export function TodayCard({
  onOpenApp,
}: {
  onOpenApp: (target: OpenTarget) => void
}) {
  const ready = usePlanner((s) => s.ready)
  const onboardingDone = usePlanner((s) => s.settings.onboardingDone)
  const model = useToday()

  if (!ready) {
    return (
      <CardFrame>
        <p className="px-[14px] py-[16px] text-[13px] text-text-3">불러오는 중</p>
      </CardFrame>
    )
  }

  // 앱은 처음 켜면 쓰는 법부터 보여준다. 카드에서 바로 시작하면 그걸 건너뛴다.
  if (!onboardingDone) {
    return (
      <CardFrame>
        <div className="flex flex-col gap-[8px] px-[16px] pb-[16px] pt-[14px]">
          <p className="text-[15px] font-semibold tracking-[-0.01em]">
            처음 쓰시나요?
          </p>
          <p className="text-pretty break-keep text-[13px] leading-relaxed text-text-2">
            공부한 것을 한 줄로 적어 두면 다시 볼 날을 계산해 이 카드에 올려 드려요.
            쓰는 법을 한 번 보고 시작하세요.
          </p>
          <div>
            <button
              type="button"
              onClick={() => onOpenApp(null)}
              className="rounded-ctl bg-accent px-[12px] py-[6px] text-[12.5px] font-semibold text-white"
            >
              시작하기
            </button>
          </div>
        </div>
      </CardFrame>
    )
  }

  const {
    items,
    goals,
    reviews,
    settings,
    today,
    addItem,
    undoable,
    ending,
    shortOnGoalDay,
    goalsToday,
    expandedId,
    setExpandedId,
    overdue,
    dueToday,
    todayItems,
    listedToday,
    upcoming,
    activeCount,
    showFullGradeHelp,
    handleRate,
    handleUndo,
  } = model

  return (
    <CardFrame>
      <header className="flex items-center gap-[10px] px-[14px] pb-[10px] pt-[12px]">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="truncate text-[11.5px] text-text-3">
            {fullDate(today)}
          </span>
          {/* 앱 머리와 같은 수를 센다. 밀린 것도 오늘 목록에 서므로 같이 센다. */}
          <div className="flex items-baseline gap-[5px]">
            <span className="font-display num text-[28px] font-semibold leading-none tracking-[-0.03em]">
              {todayItems.length}
            </span>
            <span className="text-[14px] font-semibold">개</span>
            <span className="truncate text-[13px] text-text-2">오늘 볼 항목</span>
          </div>
        </div>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onOpenApp(null)}
          className="flex-none rounded-ctl border border-line-2 px-[10px] py-[5px] text-[12px] text-text-2 transition-colors hover:bg-hover"
        >
          앱에서 보기
        </button>
      </header>

      {overdue.length > 0 ? (
        <div className="px-[14px] pb-[10px]">
          <OverdueNote
            overdue={overdue.length}
            mixed={dueToday.length > 0}
            compact
          />
        </div>
      ) : null}

      {undoable ? (
        <div className="px-[10px]">
          <JustDone
            last={undoable}
            today={today}
            ending={ending}
            shortOnGoalDay={shortOnGoalDay}
            onUndo={() => void handleUndo()}
          />
        </div>
      ) : null}

      <div className="border-t border-line">
        {todayItems.length > 0 ? (
          <div
            role="list"
            aria-label="오늘 볼 항목"
            className="flex flex-col p-[6px]"
          >
            {todayItems.map((item) => {
              const goalIndex = goals.findIndex((g) => g.id === item.goal_id)
              return (
                <CardRow
                  key={item.id}
                  item={item}
                  reviews={reviews}
                  goal={goals.find((g) => g.id === item.goal_id) ?? null}
                  goalIndex={goalIndex < 0 ? 0 : goalIndex}
                  settings={settings}
                  today={today}
                  expanded={expandedId === item.id}
                  showFullGradeHelp={showFullGradeHelp}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === item.id ? null : item.id
                    )
                  }
                  onRate={(grade) => void handleRate(item.id, grade)}
                  onOpen={() => onOpenApp({ itemId: item.id })}
                />
              )
            })}
          </div>
        ) : (
          <div className="p-[6px]">
            <TodayEmpty
              items={items}
              goals={goals}
              settings={settings}
              activeCount={activeCount}
              goalsToday={goalsToday}
              listedToday={listedToday}
              upcoming={upcoming}
              compact
            />
          </div>
        )}
      </div>

      <div className="border-t border-line">
        <CardAdd today={today} onAdd={addItem} />
      </div>
    </CardFrame>
  )
}

function CardFrame({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="오늘 복습"
      className="@container flex flex-col overflow-hidden rounded-panel border border-line bg-surface text-text shadow-[var(--shadow-sm)]"
    >
      {children}
    </section>
  )
}

/**
 * 카드의 한 줄.
 *
 * 앱의 줄은 오른쪽에 기억률, 다음 날, 목표 이름을 열로 세운다. 카드에는 그 열을 둘 폭이
 * 없어서 기억률만 남기고 목표는 색 점으로 줄인다. 폭이 넉넉하면 날짜와 목표 이름을 더 보인다.
 */
function CardRow({
  item,
  goal,
  goalIndex,
  reviews,
  settings,
  today,
  expanded,
  showFullGradeHelp,
  onToggle,
  onRate,
  onOpen,
}: {
  item: ItemRow
  goal: GoalRow | null
  goalIndex: number
  reviews: readonly ReviewRow[]
  settings: Settings
  today: DateOnly
  expanded: boolean
  showFullGradeHelp: boolean
  onToggle: () => void
  onRate: (grade: Grade) => void
  onOpen: () => void
}) {
  const { retention, options, badge, parts } = todayRowModel({
    item,
    goal,
    reviews,
    settings,
    today,
  })
  const dot = goal ? goalColor(goal, goalIndex) : 'var(--dot)'

  return (
    <div
      role="listitem"
      className={cn(
        'rounded-[9px] transition-colors',
        expanded
          ? 'bg-raise shadow-[inset_0_0_0_1.5px_var(--accent)]'
          : 'hover:bg-raise hover:shadow-[inset_0_0_0_1.5px_var(--accent)]'
      )}
    >
      <div className="flex h-[44px] items-center gap-[10px] px-[10px]">
        <button
          type="button"
          role="checkbox"
          aria-checked={expanded}
          aria-label={`${item.title} 평가하기`}
          onClick={onToggle}
          className={cn(
            'h-[16px] w-[16px] flex-none rounded-[5px] border transition-colors',
            expanded ? 'border-accent bg-accent' : 'border-line-2 bg-surface'
          )}
        />
        <button
          type="button"
          onClick={onOpen}
          title={`${item.title} 자세히 보기`}
          aria-label={`${item.title} 자세히 보기`}
          className="min-w-0 flex-1 truncate text-left text-[14px] font-medium tracking-[-0.005em] hover:text-accent"
        >
          <span className="text-text-2">{parts.pre}</span>
          <span className="num text-[13px] font-medium">{parts.num}</span>
          <span className="text-text-2">{parts.post}</span>
        </button>
        {badge ? (
          <span className="hidden flex-none @sm:inline-flex">
            <Badge kind={badge} />
          </span>
        ) : null}
        {item.due_source === 'spread' ? (
          <span className="hidden flex-none @lg:inline-flex">
            <AdjustedBadge hint="하루에 볼 게 많아서 날짜를 옮겼어요." />
          </span>
        ) : null}
        <span className="num hidden w-[54px] flex-none text-right text-[12px] text-text-2 @md:inline">
          {dueLabel(today, item.due ?? today)}
        </span>
        <span className="num w-[38px] flex-none text-right text-[12.5px] text-text">
          {percent(retention)}
        </span>
        <span
          title={goal?.name ?? '목표 없음'}
          className="flex min-w-0 flex-none items-center gap-[5px]"
        >
          <span
            aria-hidden
            className="h-[6px] w-[6px] flex-none rounded-full"
            style={{ background: dot }}
          />
          <span className="hidden max-w-[96px] truncate text-[12px] text-text-3 @md:inline">
            {goal?.name ?? '없음'}
          </span>
        </span>
      </div>

      {expanded ? (
        <div className="px-[10px] pb-[12px] pt-[2px] @sm:pl-[36px]">
          <p className="pb-[8px] text-[12.5px] text-text-2">얼마나 기억났나요?</p>
          <div className="grid grid-cols-2 gap-[6px] @md:grid-cols-4">
            {options.map((option) => (
              <button
                key={option.grade}
                type="button"
                title={option.ends ?? undefined}
                onClick={() => onRate(option.grade)}
                className="flex min-w-0 flex-col gap-[2px] rounded-[9px] border border-line-2 bg-surface px-[10px] pb-[8px] pt-[7px] text-left transition-colors hover:bg-raise"
                style={{ borderTopColor: option.color, borderTopWidth: 2 }}
              >
                <span className="flex w-full items-baseline gap-[6px]">
                  <span className="text-[13px] font-semibold text-text">
                    {option.name}
                  </span>
                  <span className="flex-1" />
                  <span className="num text-[10.5px] text-text-3">
                    {option.grade}
                  </span>
                </span>
                {showFullGradeHelp ? (
                  <span className="text-pretty break-keep text-[11px] leading-snug text-text-3">
                    {option.hint}
                  </span>
                ) : null}
                <span className="num text-[12px] text-accent">{option.next}</span>
              </button>
            ))}
          </div>
          {!showFullGradeHelp ? (
            <p className="text-pretty break-keep pt-[8px] text-[11px] leading-snug text-text-3">
              {GRADE_HINT_SHORT}
            </p>
          ) : null}
          <p className="text-pretty break-keep pt-[6px] text-[11px] leading-snug text-text-3">
            {dueReason(item.due_kind)}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/**
 * 카드의 한 줄 적기. 제목만 받는다.
 *
 * 목표에 넣거나 날짜를 고르는 상세 설정은 앱 화면에 있다. 여기 둘 폭이 없고,
 * 매일 하는 일은 제목 한 줄이면 끝난다.
 */
function CardAdd({
  today,
  onAdd,
}: {
  today: DateOnly
  onAdd: (draft: NewItemDraft) => Promise<ItemRow>
}) {
  const [title, setTitle] = useState('')
  const [saved, setSaved] = useState<string | null>(null)

  async function submit(value: string = title) {
    const trimmed = value.trim()
    if (!trimmed) return
    setTitle('')
    const row = await onAdd({
      title: trimmed,
      memo: '',
      goalId: null,
      firstStudiedAt: today,
      horizon: null,
      intensity: null,
      initialGrade: DEFAULT_INITIAL_GRADE,
    })
    // 적고 나면 목록은 그대로다. 오늘 적은 것은 오늘 다시 보지 않는다. 언제 올라오는지 말해 둔다.
    // 하루 상한이 날짜를 옮길 수 있으니 다시 셈한 뒤의 날짜를 읽는다.
    const due =
      usePlanner.getState().items.find((item) => item.id === row.id)?.due ??
      row.due
    setSaved(addedMessage(row.title, due, today))
  }

  return (
    <div>
      <div className="flex h-[48px] items-center gap-[10px] pl-[16px] pr-[10px]">
        <span
          aria-hidden
          className="flex h-[16px] w-[16px] flex-none items-center justify-center text-[15px] text-text-3"
        >
          +
        </span>
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setSaved(null)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (event.nativeEvent.isComposing) {
              submitAfterComposition(event.currentTarget, (value) => void submit(value))
              return
            }
            void submit()
          }}
          placeholder="방금 공부한 것을 한 줄로"
          aria-label="새 항목 제목"
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-text-3"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={title.trim() === ''}
          className="flex-none rounded-ctl bg-accent px-[11px] py-[5px] text-[12.5px] font-semibold text-white disabled:opacity-35"
        >
          적어두기
        </button>
      </div>
      {saved ? (
        <p role="status" className="text-pretty break-keep px-[16px] pb-[11px] text-[12px] text-text-2">
          {saved}
        </p>
      ) : null}
    </div>
  )
}

function addedMessage(title: string, due: DateOnly | null, today: DateOnly): string {
  const head = `"${title}"${josa(title, '을', '를')} 적어뒀어요.`
  if (due === null) return head
  if (due <= today) return `${head} 오늘 목록에 올렸어요.`
  const when = dueLabel(today, due)
  // '내일에' 와 '모레에' 는 어색하다. 날짜나 'N일 뒤' 에만 '에' 를 붙인다.
  const at = when === '내일' || when === '모레' ? when : `${when}에`
  return `${head} 다음은 ${at} 올라옵니다.`
}
