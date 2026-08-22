import { useState } from 'react'
import { addDays, type DateOnly } from '../../lib/date'
import { dueReason } from '../../lib/badge'
import { fullDate, monthDay, percent, shortDate } from '../../lib/format'
import { usePlanner } from '../../store/planner'
import { CalendarHeatmap } from '../charts/CalendarHeatmap'
import { monthKey, monthLabel } from '../charts/calendar'
import { LoadBars, type LoadBar } from '../charts/LoadBars'
import { dailyCountOf, rollout, type PlannedItem } from './rollout'

const HORIZON_DAYS = 60

export function ForecastScreen() {
  const { items, goals, settings, today } = usePlanner()
  const [selected, setSelected] = useState<DateOnly | null>(null)
  const [hovered, setHovered] = useState<DateOnly | null>(null)

  // 항목마다 따로 굴려서 더하면 날짜 조정 층이 빠진다. 하루씩 실제로 살아 보면
  // 앱이 그날 잡을 날짜가 그대로 나온다.
  const plan = rollout({
    items,
    goals,
    settings,
    from: today,
    days: HORIZON_DAYS,
  })
  const dailyCount = dailyCountOf(plan)
  const byDate = new Map(plan.map((day) => [day.date, day.items]))

  // 달력 칸에 마우스를 올린 날이 우선이고, 없으면 눌러서 고정해 둔 날을 보여준다.
  // 막대는 그 자리에 뜨는 상자로 말하므로 이 카드를 건드리지 않는다.
  const shown = hovered ?? selected

  const bars: LoadBar[] = plan.map((day) => ({
    date: day.date,
    count: day.items.length,
  }))

  const total = plan.reduce((sum, day) => sum + day.items.length, 0)
  const average = Math.round((total / (HORIZON_DAYS + 1)) * 10) / 10
  const busiest = bars.reduce(
    (best, bar) => (bar.count > best.count ? bar : best),
    bars[0] ?? { date: today, count: 0 }
  )
  const overCap = bars.filter((b) => b.count > settings.dailyCap)

  const months = [monthKey(today), monthKey(addDays(today, 32))]

  return (
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-5 px-6 py-7">
      <header>
        <h1 className="text-[22px] font-semibold">예보</h1>
        <p className="pt-1 text-[13px] text-text-2">
          {total === 0
            ? '앞으로 잡힌 복습이 없어요. 오늘 화면에서 한 줄 적어보세요.'
            : `앞으로 ${HORIZON_DAYS}일 동안 ${total}번 보게 돼요. 하루 평균 ${average}개이고, ${monthDay(
                busiest.date
              )}이 ${busiest.count}개로 가장 많아요.`}
        </p>
        {overCap.length > 0 ? (
          <p className="pt-1 text-[13px] text-imp-fg">
            {`${monthDay(overCap[0].date)}${
              overCap.length > 1 ? ` 외 ${overCap.length - 1}일` : ''
            }은 하루 상한 ${settings.dailyCap}개를 넘어요. 그때가 되면 앞쪽으로 펴서 잡아드릴게요.`}
          </p>
        ) : null}
      </header>

      <div className="rail-panel grid grid-cols-3 gap-3 rounded-card bg-rail px-[16px] py-[13px]">
        <Stat label={`앞으로 ${HORIZON_DAYS}일`} value={`${total}개`} />
        <Stat label="하루 평균" value={`${average}개`} />
        <Stat label="하루 상한" value={`${settings.dailyCap}개`} />
      </div>

      <section className="rounded-card border border-line bg-surface px-[16px] py-[14px]">
        <h2 className="pb-3 text-[13px] font-semibold">앞으로 60일</h2>
        <LoadBars
          bars={bars}
          cap={settings.dailyCap}
          onSelect={(date) => setSelected(date === selected ? null : date)}
          renderTooltip={(date) => (
            <DayCard date={date} items={byDate.get(date) ?? []} floating />
          )}
          selected={selected}
        />
        <p className="pt-3 text-[12px] text-text-2">
          막대에 마우스를 올리면 그날 무엇을 보는지 뜹니다. 누르면 아래에 고정돼요.
        </p>
      </section>

      {shown ? (
        <section
          aria-label="그날 무엇을 보나"
          className="rounded-card border border-line bg-surface px-[16px] py-[14px]"
        >
          <div className="flex items-start justify-between gap-3 pb-1">
            <h2 className="text-[13px] font-semibold">그날 무엇을 보나</h2>
            {selected ? (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[12px] text-text-3 hover:text-text-2"
              >
                고정 해제
              </button>
            ) : null}
          </div>
          <DayCard date={shown} items={byDate.get(shown) ?? []} />
        </section>
      ) : null}

      <section className="rounded-card border border-line bg-surface px-[16px] py-[14px]">
        <h2 className="pb-3 text-[13px] font-semibold">달력으로 보기</h2>
        <div className="grid grid-cols-2 gap-6">
          {months.map((month) => (
            <div key={month} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[12.5px] font-medium">
                  {monthLabel(month)}
                </span>
                <span className="num text-[11.5px] text-text-3">
                  {countInMonth(dailyCount, month)}개
                </span>
              </div>
              <CalendarHeatmap
                month={month}
                counts={dailyCount}
                cap={settings.dailyCap}
                selected={selected}
                onSelect={(date) =>
                  setSelected(date === selected ? null : date)
                }
                onHover={setHovered}
              />
            </div>
          ))}
        </div>
        <p className="pt-3 text-[12px] text-text-2">
          {monthSentence(dailyCount, settings.dailyCap)}
        </p>
      </section>

      {bars.some((b) => b.count > 0) ? (
        <p className="num text-[11.5px] text-text-3">
          가장 붐비는 날 세 개: {topDays(bars).map(shortDate).join(', ')}
        </p>
      ) : null}
    </div>
  )
}

function countInMonth(
  counts: Readonly<Record<DateOnly, number>>,
  month: DateOnly
): number {
  const prefix = month.slice(0, 7)
  return Object.entries(counts)
    .filter(([date]) => date.startsWith(prefix))
    .reduce((sum, [, count]) => sum + count, 0)
}

function monthSentence(
  counts: Readonly<Record<DateOnly, number>>,
  cap: number
): string {
  const over = Object.entries(counts).filter(([, count]) => count > cap)
  if (over.length === 0) {
    return '두 달 모두 하루 상한 안에서 고르게 퍼져 있어요.'
  }
  return `색이 진한 칸이 그날 볼 게 많은 날이에요. 상한을 넘는 ${over.length}일은 앞으로 펴서 잡습니다.`
}

function topDays(bars: LoadBar[]): DateOnly[] {
  return [...bars]
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((b) => b.date)
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[11px] text-text-3">{label}</span>
      <span className="num text-[16px] font-semibold">{value}</span>
    </div>
  )
}

/**
 * 하루에 무엇을 보는지.
 *
 * 개수만 보여주면 "그날 뭐가 있지" 라는 물음이 그대로 남는다.
 * 목표별로 묶어서 제목을 직접 보여주고, 길면 뒤를 접는다.
 */
function DayCard({
  date,
  items,
  floating,
}: {
  date: DateOnly
  items: readonly PlannedItem[]
  /** 막대 위에 떠 있는 상자인지. 그때는 더 짧게 줄인다. */
  floating?: boolean
}) {
  const limit = floating ? 6 : 12
  const overdue = items.filter((i) => i.overdue).length
  const byGoal = new Map<string, PlannedItem[]>()
  for (const item of items) {
    const key = item.goalName ?? '목표 없음'
    byGoal.set(key, [...(byGoal.get(key) ?? []), item])
  }

  let shownSoFar = 0

  return (
    <div
      className={
        floating
          ? 'w-[268px] rounded-card border border-line-2 bg-surface px-[13px] py-[11px] shadow-[var(--shadow-md)]'
          : ''
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[12.5px] font-medium">{fullDate(date)}</span>
        <span className="num text-[12px] text-text-2">{items.length}개</span>
        {overdue > 0 ? (
          <span className="num text-[11.5px] text-imp-fg">밀린 것 {overdue}개</span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="pt-[6px] text-[12px] text-text-3">이날은 볼 게 없어요.</p>
      ) : (
        <div className="flex flex-col gap-[8px] pt-[8px]">
          {[...byGoal.entries()].map(([goalName, rows]) => (
            <div key={goalName} className="flex flex-col gap-[3px]">
              <div className="flex items-baseline gap-[6px]">
                <span className="text-[11.5px] font-medium text-text-2">
                  {goalName}
                </span>
                <span className="num text-[11px] text-text-3">
                  {rows.length}개
                </span>
              </div>
              {rows.map((row) => {
                if (shownSoFar >= limit) return null
                shownSoFar += 1
                return (
                  <div
                    key={row.itemId}
                    className="flex items-baseline gap-2 pl-[6px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] text-text-2">
                      {row.title}
                    </span>
                    <span
                      className="num flex-none text-[11px] text-text-3"
                      title="그날 보기 직전에 떠올릴 확률이에요."
                    >
                      {percent(row.retention)}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
          {items.length > limit ? (
            <p className="num pl-[6px] text-[11px] text-text-3">
              외 {items.length - limit}개
            </p>
          ) : null}
          <p className="pt-[2px] text-[11px] leading-relaxed text-text-3">
            {dueReason(items[0].kind)}
          </p>
        </div>
      )}
    </div>
  )
}
