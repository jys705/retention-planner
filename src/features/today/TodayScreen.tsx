import { useRef, useState } from 'react'
import type { Grade } from '../../core/fsrs/types'
import { Hint } from '../../components/Chip'
import { RailPanel } from '../../components/Rail'
import { cn } from '../../lib/cn'
import { addDays, type DateOnly } from '../../lib/date'
import { fullDate, monthDay, percent, shortDate } from '../../lib/format'
import { GRADE_HELP_THRESHOLD } from '../../lib/settings'
import {
  canUndo,
  selectOverallRetention,
  selectTodayItems,
  selectUpcoming,
  splitTodayItems,
  usePlanner,
} from '../../store/planner'
import { QuickAdd, QuickAddHint } from '../newitem/QuickAdd'
import { GoalDayNote } from './GoalDayNote'
import { JustDone } from './JustDone'
import { TodayRow } from './TodayRow'

export function TodayScreen({
  onOpenItem,
}: {
  onOpenItem: (itemId: string) => void
}) {
  const state = usePlanner()
  const { items, goals, reviews, settings, today } = state
  const rateItem = usePlanner((s) => s.rateItem)
  const addItem = usePlanner((s) => s.addItem)
  const undoLastRating = usePlanner((s) => s.undoLastRating)
  const undoable = canUndo(state) ? state.lastRating : null
  // 오늘이 목표한 날인 목표들. 준비는 어제까지 끝나 있다.
  const goalsToday = goals.filter(
    (g) => g.archived_at === null && g.ready_at === today
  )

  const [expandedId, setExpandedId] = useState<string | null>(null)
  // 적어두기 줄은 카드 안에 있고 안내문은 카드 밖에 있다. 둘이 같은 상태를 봐야 한다.
  const [detailOpen, setDetailOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const { overdue, dueToday } = splitTodayItems({ items, today })
  const todayItems = selectTodayItems({ items, today })
  const upcoming = selectUpcoming(items, today)
  const overall = selectOverallRetention(items, today)
  const showFullGradeHelp = settings.ratingCount < GRADE_HELP_THRESHOLD

  // 평가가 끝나기 전에 또 누르면 되돌릴 사진이 낡는다. 저장소가 표로 걸러
  // 내지만, 그러면 되돌리기 자리가 조용히 사라져 사람이 영문을 모른다.
  const [rating, setRating] = useState(false)

  async function handleRate(itemId: string, grade: Grade) {
    if (rating) return
    setRating(true)
    setExpandedId(null)
    try {
      // 여기는 '오늘' 화면이다. 오늘 본 것으로만 기록한다.
      await rateItem(itemId, grade, { reviewedAt: today })
    } finally {
      setRating(false)
    }
  }

  async function handleUndo() {
    const itemId = undoable?.itemId ?? null
    await undoLastRating()
    // 되돌린 사람은 대개 다른 등급을 고르려던 참이다. 그 줄을 다시 펴 준다.
    if (itemId !== null) setExpandedId(itemId)
  }

  return (
    <div ref={listRef} className="mx-auto w-full max-w-[940px] px-6 pb-7 pt-10">
      <header className="flex items-end justify-between pb-5">
        <div className="flex flex-col gap-1">
          <span className="text-[12.5px] text-text-3">{fullDate(today)}</span>
          <div className="flex items-baseline gap-2">
            {/*
              목록에 선 줄 수를 그대로 센다. 따로 세면 밀린 줄이 넷 보이는데
              머리는 '0 개' 라고 적는 일이 생긴다. 옆줄 배지와 알림도 이 수다.
            */}
            <span className="font-display text-[52px] font-semibold leading-none tracking-[-0.03em] num">
              {todayItems.length}
            </span>
            <span className="text-[20px] font-semibold tracking-[-0.01em]">
              개
            </span>
            <span className="pb-[3px] text-[15px] text-text-2">
              오늘 볼 항목
            </span>
          </div>
          {overdue.length > 0 ? (
            <OverdueNote
              overdue={overdue.length}
              mixed={dueToday.length > 0}
            />
          ) : null}
        </div>
        <RailPanel>
          <div className="flex flex-col items-end gap-[3px]">
            <div className="flex items-center gap-[5px]">
              <span className="text-[11.5px] text-text-3">전체 기억률</span>
              <Hint text="오늘 기준으로 적어둔 항목 전체를 얼마나 기억하고 있는지예요. 오늘 것을 체크하면 올라갑니다." />
            </div>
            <span className="font-display num text-[27px] font-semibold text-text-2">
              {percent(overall)}
            </span>
          </div>
        </RailPanel>
      </header>

      <div className="flex flex-col">
        {goalsToday.length > 0 ? (
          <GoalDayNote goals={goalsToday} dueCount={todayItems.length} />
        ) : null}
        {undoable ? (
          <JustDone
            last={undoable}
            today={today}
            onUndo={() => void handleUndo()}
          />
        ) : null}
        {/*
          목록과 적어두기 줄이 카드 한 장 안에 있고, 그 안 오른쪽 268px 에 레일 띠가 깔린다.
          왼쪽은 사람이 쓴 말, 오른쪽은 앱이 계산한 숫자다. 그 경계를 정렬로만 두면
          줄이 늘어났을 때 눈이 열을 놓친다.
        */}
        <div className="relative overflow-hidden rounded-panel border border-line bg-surface shadow-[var(--shadow-sm)]">
          <div
            aria-hidden
            className="absolute bottom-0 right-0 top-0 w-[268px] bg-rail"
          />

          {todayItems.length > 0 ? (
            <div
              role="list"
              aria-label="오늘 볼 항목"
              className="relative flex flex-col p-[8px]"
            >
              {todayItems.map((item) => {
                const goalIndex = goals.findIndex((g) => g.id === item.goal_id)
                return (
                  <TodayRow
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
                    onOpen={() => onOpenItem(item.id)}
                  />
                )
              })}
            </div>
          ) : (
            <div role="list" aria-label="오늘 볼 항목" className="hidden" />
          )}

          <div
            className={cn(
              'relative',
              todayItems.length > 0 && 'border-t border-line'
            )}
          >
            <QuickAdd
              today={today}
              goals={goals}
              settings={settings}
              detailOpen={detailOpen}
              onDetailOpenChange={setDetailOpen}
              onAdd={(draft) => void addItem(draft)}
            />
          </div>
        </div>

        {todayItems.length === 0 && items.length > 0 ? (
          <EmptyToday upcoming={upcoming} today={today} />
        ) : null}

        {items.length === 0 ? <EmptyLibrary /> : null}

        <QuickAddHint detailOpen={detailOpen} />
      </div>

    </div>
  )
}

/**
 * 큰 숫자 가운데 몇이 밀린 것인지 알리는 줄.
 *
 * 큰 숫자가 이제 밀린 것까지 세므로 여기 수는 그 안쪽 몫이다. '이 가운데' 를
 * 앞에 두어 따로 더할 수가 아니라는 걸 밝힌다. 다 밀린 날에는 같이 볼 오늘 것이
 * 없으니 '같이' 라는 말을 빼고, 그때도 수는 같은 색으로 세워 둔다.
 *
 * '밀린 것' 이라는 말은 예보와 항목 상세도 쓴다. 화면마다 다른 이름으로 부르면
 * 같은 것을 가리키는 줄 모른다.
 */
function OverdueNote({ overdue, mixed }: { overdue: number; mixed: boolean }) {
  return (
    <div className="flex items-baseline gap-[6px] pt-[2px]">
      <span className="text-[13px] text-text-2">
        {mixed ? '이 가운데 밀린 것' : '밀린 것'}
      </span>
      <span className="num text-[13px] font-semibold text-imp-fg">
        {overdue}개
      </span>
      <span className="text-[12px] text-text-3">
        {mixed
          ? '볼 날이 지났어요. 오늘 같이 보면 됩니다.'
          : '모두 볼 날이 지났어요.'}
      </span>
    </div>
  )
}

function EmptyToday({
  upcoming,
  today,
}: {
  upcoming: { date: DateOnly; count: number }[]
  today: DateOnly
}) {
  const next = upcoming[0]
  return (
    <div className="rounded-card border border-line bg-surface px-[18px] py-[22px]">
      <p className="text-[15px] font-medium">오늘 볼 건 다 봤어요.</p>
      <p className="pt-1 text-[13px] text-text-2">
        {next
          ? `다음은 ${monthDay(next.date)}에 ${next.count}개예요. 그때 알려드릴게요.`
          : '앞으로 잡힌 복습이 없어요. 아래에 한 줄 적어보세요.'}
      </p>
      {upcoming.length > 0 ? (
        <div className="num flex gap-3 pt-3 text-[12px] text-text-3">
          {upcoming.map((entry) => (
            <span key={entry.date}>
              {shortDate(entry.date)} {entry.count}개
            </span>
          ))}
        </div>
      ) : null}
      <p className="pt-2 text-[11.5px] text-text-3">
        {monthDay(addDays(today, 1))}부터 다시 채워집니다.
      </p>
    </div>
  )
}

function EmptyLibrary() {
  return (
    <div className="rounded-card border border-line bg-surface px-[18px] py-[22px]">
      <p className="text-[15px] font-medium">아직 적어둔 게 없어요.</p>
      <p className="pt-1 text-[13px] leading-relaxed text-text-2">
        방금 공부한 걸 아래에 한 줄로 적어보세요. 다시 볼 날은 앱이 계산해서 오늘
        목록에 올려둘게요.
      </p>
    </div>
  )
}
