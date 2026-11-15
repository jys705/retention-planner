import { useRef } from 'react'
import { Hint } from '../../components/Chip'
import { RailPanel } from '../../components/Rail'
import { fullDate, percent } from '../../lib/format'
import { usePlanner } from '../../store/planner'
import { QuickAdd, QuickAddHint } from '../newitem/QuickAdd'
import { GoalDayNote } from './GoalDayNote'
import { GoalEndedNote } from './GoalEndedNote'
import { JustDone } from './JustDone'
import { OverdueNote } from './OverdueNote'
import { TodayEmpty } from './TodayEmpty'
import { TodayRow } from './TodayRow'
import { useToday } from './useToday'

export function TodayScreen({
  onOpenItem,
  onOpenGoal,
}: {
  onOpenItem: (itemId: string) => void
  onOpenGoal?: (goalId: string) => void
}) {
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
    ended,
    acknowledgeEnded,
    expandedId,
    setExpandedId,
    overdue,
    dueToday,
    todayItems,
    listedToday,
    upcoming,
    overall,
    activeCount,
    showFullGradeHelp,
    handleRate,
    handleUndo,
  } = useToday()
  // 적어두기 줄은 카드 안에 있고 안내문은 카드 밖에 있다. 둘이 같은 상태를 봐야 한다.
  // 펼친 상태도 저장소에 둔다. 상세 설정을 펴 놓고 다른 탭에 갔다 오면
  // 접혀 있는 것도 쓰던 것을 잃는 것과 같다.
  const detailOpen = usePlanner((s) => s.draft.detailOpen)
  const setDetailOpen = (open: boolean) =>
    usePlanner.getState().setDraft({ detailOpen: open })
  const listRef = useRef<HTMLDivElement>(null)

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
        {/* 지금 지키고 있는 항목이 없으면 셀 것이 없다. '0%' 로 적으면 다 잊은 것처럼 읽힌다. */}
        {overall !== null ? (
          <RailPanel>
            <div className="flex flex-col items-end gap-[3px]">
              <div className="flex items-center gap-[5px]">
                <span className="text-[11.5px] text-text-3">전체 기억률</span>
                <Hint text="오늘 기준으로 지금 보고 있는 항목 전체를 얼마나 기억하고 있는지예요. 마친 목표의 항목은 세지 않습니다. 오늘 것을 체크하면 올라갑니다." />
              </div>
              <span className="font-display num text-[27px] font-semibold text-text-2">
                {percent(overall)}
              </span>
            </div>
          </RailPanel>
        ) : null}
      </header>

      <div className="flex flex-col">
        {ended ? (
          <GoalEndedNote
            notice={ended}
            onOpenGoal={
              onOpenGoal
                ? (goalId) => {
                    void acknowledgeEnded(ended.keys)
                    onOpenGoal(goalId)
                  }
                : undefined
            }
            onDismiss={() => void acknowledgeEnded(ended.keys)}
          />
        ) : null}
        {goalsToday.length > 0 ? (
          <GoalDayNote
            goals={goalsToday}
            items={items}
            listed={listedToday}
            today={today}
          />
        ) : null}
        {undoable ? (
          <JustDone
            last={undoable}
            today={today}
            ending={ending}
            shortOnGoalDay={shortOnGoalDay}
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

          {/* 빈 화면은 목록이 설 자리에 선다. 적어두기 줄은 늘 그 아래다. */}
          {todayItems.length === 0 ? (
            <div className="relative p-[8px]">
              <TodayEmpty
                items={items}
                goals={goals}
                settings={settings}
                activeCount={activeCount}
                goalsToday={goalsToday}
                listedToday={listedToday}
                upcoming={upcoming}
              />
            </div>
          ) : null}

          <div className="relative border-t border-line">
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

        <QuickAddHint detailOpen={detailOpen} />
      </div>

    </div>
  )
}
