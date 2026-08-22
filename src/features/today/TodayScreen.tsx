import { useEffect, useRef, useState } from 'react'
import type { Grade } from '../../core/fsrs/types'
import { Hint } from '../../components/Chip'
import { RailPanel } from '../../components/Rail'
import { addDays, type DateOnly } from '../../lib/date'
import { fullDate, monthDay, percent, shortDate } from '../../lib/format'
import { GRADE_HELP_THRESHOLD } from '../../lib/settings'
import {
  selectOverallRetention,
  selectUpcoming,
  splitTodayItems,
  usePlanner,
} from '../../store/planner'
import { QuickAdd } from '../newitem/QuickAdd'
import { GroupSuggestionRow } from './GroupSuggestionRow'
import { TodayRow } from './TodayRow'

export function TodayScreen({
  onOpenItem,
}: {
  onOpenItem: (itemId: string) => void
}) {
  const { items, goals, settings, today } = usePlanner()
  const rateItem = usePlanner((s) => s.rateItem)
  const addItem = usePlanner((s) => s.addItem)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [focusIndex, setFocusIndex] = useState(0)
  // 키보드 단축키는 첫 줄부터 듣지만, 표시는 사람이 실제로 옮겨 다니거나
  // 줄을 누른 뒤에만 켠다. 켜자마자 첫 줄만 유난히 달라 보이면 안 된다.
  const [focusShown, setFocusShown] = useState(false)
  const [reviewDates, setReviewDates] = useState<Record<string, DateOnly>>({})
  const listRef = useRef<HTMLDivElement>(null)

  const { overdue, dueToday } = splitTodayItems({ items, today })
  const todayItems = [...overdue, ...dueToday]
  const upcoming = selectUpcoming(items, today)
  const overall = selectOverallRetention(items, today)
  const showFullGradeHelp = settings.ratingCount < GRADE_HELP_THRESHOLD
  const lastTitle = items.length > 0 ? items[items.length - 1].title : null

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      if (typing) return

      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault()
        setFocusShown(true)
        setFocusIndex((i) => Math.min(i + 1, Math.max(0, todayItems.length - 1)))
        return
      }
      if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault()
        setFocusShown(true)
        setFocusIndex((i) => Math.max(0, i - 1))
        return
      }
      if (event.key === 'Enter') {
        const item = todayItems[focusIndex]
        if (!item) return
        event.preventDefault()
        setFocusShown(true)
        setExpandedId((current) => (current === item.id ? null : item.id))
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setExpandedId(null)
        return
      }
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        listRef.current
          ?.querySelector<HTMLInputElement>('input[aria-label="새 항목 제목"]')
          ?.focus()
        return
      }
      if (['1', '2', '3', '4'].includes(event.key)) {
        const item = todayItems[focusIndex]
        if (!item || expandedId !== item.id) return
        event.preventDefault()
        void handleRate(item.id, Number(event.key) as Grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function handleRate(itemId: string, grade: Grade) {
    const reviewedAt = reviewDates[itemId] ?? today
    setExpandedId(null)
    // 고른 날짜는 그 한 번의 평가에 붙는 것이다. 남겨 두면 같은 항목이 다시 올라왔을 때
    // 아무도 고른 적 없는 지난 날짜로 조용히 또 기록된다.
    setReviewDates((current) => {
      const next = { ...current }
      delete next[itemId]
      return next
    })
    await rateItem(itemId, grade, { reviewedAt })
    setFocusIndex((i) => Math.max(0, Math.min(i, todayItems.length - 2)))
  }

  return (
    <div ref={listRef} className="mx-auto w-full max-w-[940px] px-6 py-7">
      <header className="flex items-end justify-between pb-5">
        <div className="flex flex-col gap-1">
          <span className="text-[12.5px] text-text-3">{fullDate(today)}</span>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[52px] font-semibold leading-none tracking-[-0.03em] num">
              {dueToday.length}
            </span>
            <span className="text-[20px] font-semibold tracking-[-0.01em]">
              개
            </span>
            <span className="pb-[3px] text-[15px] text-text-2">
              오늘 볼 항목
            </span>
          </div>
          {overdue.length > 0 ? (
            <div className="flex items-baseline gap-[6px] pt-[2px]">
              <span className="text-[13px] text-text-2">밀린 것</span>
              <span className="num text-[13px] font-semibold text-imp-fg">
                {overdue.length}개
              </span>
              <span className="text-[12px] text-text-3">
                지난 날짜에 잡혀 있던 것들이에요. 오늘 같이 보면 됩니다.
              </span>
            </div>
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
        <div role="list" aria-label="오늘 볼 항목" className="flex flex-col">
        {todayItems.map((item, index) => {
          const goalIndex = goals.findIndex((g) => g.id === item.goal_id)
          return (
            <TodayRow
              key={item.id}
              item={item}
              goal={goals.find((g) => g.id === item.goal_id) ?? null}
              goalIndex={goalIndex < 0 ? 0 : goalIndex}
              settings={settings}
              today={today}
              expanded={expandedId === item.id}
              focused={focusShown && focusIndex === index}
              showFullGradeHelp={showFullGradeHelp}
              reviewDate={reviewDates[item.id] ?? today}
              onToggle={() => {
                setFocusShown(true)
                setFocusIndex(index)
                setExpandedId((current) =>
                  current === item.id ? null : item.id
                )
              }}
              onRate={(grade) => void handleRate(item.id, grade)}
              onOpen={() => onOpenItem(item.id)}
              onPickDate={(date) =>
                setReviewDates((current) => ({ ...current, [item.id]: date }))
              }
            />
          )
        })}
        </div>

        {todayItems.length === 0 && items.length > 0 ? (
          <EmptyToday upcoming={upcoming} today={today} />
        ) : null}

        {items.length === 0 ? <EmptyLibrary /> : null}

        <div className="pt-2">
          <QuickAdd
            today={today}
            goals={goals}
            settings={settings}
            lastTitle={lastTitle}
            onAdd={(draft) => void addItem(draft)}
          />
        </div>

        <GroupSuggestionRow />
      </div>

      <footer className="num flex flex-wrap gap-4 pt-6 text-[11px] text-text-3">
        <span>↑↓ 이동</span>
        <span>Enter 펼치기</span>
        <span>1~4 평가</span>
        <span>N 새 항목</span>
        <span>Esc 닫기</span>
      </footer>
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
