import { useState } from 'react'
import { addDays, maxDate, minDate, type DateOnly } from '../../lib/date'
import { dueReason, statusBadgeOf } from '../../lib/badge'
import { fullDate, monthDay, percent } from '../../lib/format'
import { cn } from '../../lib/cn'
import { goalColor } from '../../lib/domain'
import { usePlanner } from '../../store/planner'
import {
  CalendarHeatmap,
  CalendarLegend,
} from '../charts/CalendarHeatmap'
import { monthKey, monthLabel } from '../charts/calendar'
import { LoadBars, type LoadBar } from '../charts/LoadBars'
import { LOAD_SERIES } from '../charts/loadSeries'
import { dailyCountOf, rollout, type PlannedItem } from './rollout'

const HORIZON_DAYS = 60
/** 머리 문장이 보는 기간. 예보의 물음은 '곧 얼마나 바쁜가' 다. */
const SOON_DAYS = 14

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

  // 배지별로 나눠 쌓는다. 봉우리가 무엇 때문인지 색으로 읽힌다.
  const bars: LoadBar[] = plan.map((day) => {
    const badges = day.items.map((i) => statusBadgeOf(i.kind, null))
    return {
      date: day.date,
      count: day.items.length,
      imp: badges.filter((b) => b === 'important').length,
      easy: badges.filter((b) => b === 'easy').length,
      plain: badges.filter((b) => b !== 'important' && b !== 'easy').length,
    }
  })

  const total = plan.reduce((sum, day) => sum + day.items.length, 0)
  // 예보를 보는 까닭은 '곧 얼마나 바쁜가' 다. 예순 날로 나누면 먼 빈 날까지 섞여
  // 실제로 앞이 빽빽한데도 하루 한 개꼴로 보인다. 앞 두 주만 센다.
  const soon = bars.slice(0, SOON_DAYS)
  const soonTotal = soon.reduce((sum, b) => sum + b.count, 0)
  const average = Math.round((soonTotal / SOON_DAYS) * 10) / 10
  const busiest = soon.reduce(
    (best, bar) => (bar.count > best.count ? bar : best),
    soon[0] ?? { date: today, count: 0 }
  )
  const overCap = bars.filter((b) => b.count > settings.dailyCap)

  const months = [monthKey(today), monthKey(addDays(today, 32))]
  const monthCounts = months.map((m) => ({
    month: m,
    count: countInMonth(dailyCount, m),
  }))
  const peak = bars.reduce(
    (best, bar) => (bar.count > best.count ? bar : best),
    bars[0] ?? { date: today, count: 0 }
  )

  const horizonEnd = addDays(today, HORIZON_DAYS)
  const live = goals.filter((g) => g.archived_at === null)
  const marks = live
    .filter((g) => g.ready_at !== null && g.ready_at >= today && g.ready_at <= horizonEnd)
    .map((g, i) => ({
      date: g.ready_at as DateOnly,
      label: g.name,
      color: goalColor(g, goals.indexOf(g) < 0 ? i : goals.indexOf(g)),
    }))
  const bands = live
    .filter(
      (g) =>
        g.horizon_kind === 'window' &&
        g.ready_at !== null &&
        g.hold_until !== null &&
        g.hold_until >= today &&
        g.ready_at <= horizonEnd
    )
    .map((g) => ({
      from: maxDate(g.ready_at as DateOnly, today),
      to: minDate(g.hold_until as DateOnly, horizonEnd),
      color: goalColor(g, goals.indexOf(g)),
    }))

  return (
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-4 px-6 py-7">
      <header className="grid grid-cols-[1fr_268px] items-start gap-6">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em]">예보</h1>
          <p className="pt-[6px] text-[15px] font-medium leading-relaxed">
            {total === 0
              ? '앞으로 잡힌 복습이 없어요. 오늘 화면에서 한 줄 적어보세요.'
              : `다음 ${SOON_DAYS}일 동안 하루 평균 ${average}개예요. ${monthDay(
                  busiest.date
                )}이 ${busiest.count}개로 가장 많아요.`}
          </p>
          {overCap.length > 0 ? (
            <p className="pt-[6px] text-[13px] text-imp-fg">
              {`${monthDay(overCap[0].date)}${
                overCap.length > 1 ? ` 외 ${overCap.length - 1}일` : ''
              }은 하루 상한 ${settings.dailyCap}개를 넘어요. 그때가 되면 앞쪽으로 펴서 잡아드릴게요.`}
            </p>
          ) : null}
        </div>

        <div className="rail-panel num flex flex-col gap-[6px] pr-[18px] text-[12.5px]">
          <RailRow label={`앞으로 ${HORIZON_DAYS}일`} value={`${total}개`} />
          <RailRow label={`다음 ${SOON_DAYS}일 하루 평균`} value={`${average}개`} />
          <RailRow
            label="하루 상한"
            value={`${settings.dailyCap}개`}
            muted
          />
        </div>
      </header>

      <section
        aria-label={`앞으로 ${HORIZON_DAYS}일`}
        className="relative overflow-hidden rounded-panel border border-line bg-surface"
      >
        <div
          aria-hidden
          className="absolute bottom-0 right-0 top-0 w-[268px] bg-rail"
        />
        <div className="relative grid grid-cols-[1fr_268px]">
          <div className="min-w-0 px-[20px] py-[16px]">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
              <h2 className="text-[13px] font-semibold">
                앞으로 {HORIZON_DAYS}일
              </h2>
              <div className="flex flex-wrap items-center gap-[12px] text-[11px] text-text-3">
                {[...LOAD_SERIES].reverse().map((series) => (
                  <span key={series.key} className="flex items-center gap-[5px]">
                    <span
                      aria-hidden
                      className="h-[8px] w-[8px] rounded-[2px]"
                      style={{ background: series.color }}
                    />
                    {series.name}
                  </span>
                ))}
              </div>
            </div>
            <LoadBars
              bars={bars}
              cap={settings.dailyCap}
              stacked
              marks={marks}
              bands={bands}
              onSelect={(date) => setSelected(date === selected ? null : date)}
              renderTooltip={(date) => (
                <DayCard date={date} items={byDate.get(date) ?? []} floating />
              )}
              selected={selected}
            />
            <p className="pt-3 text-[12px] text-text-2">
              막대에 마우스를 올리면 그날 무엇을 보는지 그 자리에 뜹니다.
            </p>
          </div>

          <div className="rail-panel flex flex-col gap-[8px] px-[18px] py-[16px]">
            <span className="text-[11.5px] text-text-3">이번 달과 다음 달</span>
            {monthCounts.map((m) => (
              <RailRow
                key={m.month}
                label={monthLabel(m.month)}
                value={`${m.count}개`}
              />
            ))}
            <div className="h-px bg-line" />
            <RailRow
              label="가장 많은 날"
              value={peak.count > 0 ? `${monthDay(peak.date)} ${peak.count}개` : '없음'}
              warn={peak.count > settings.dailyCap}
            />
            {marks.length > 0 ? (
              <p className="pt-[4px] text-[11.5px] leading-relaxed text-text-3">
                세로선은 목표한 날이에요. 옅은 띠는 대략 목표의 구간입니다.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section
        aria-label="달력으로 보기"
        className="relative overflow-hidden rounded-panel border border-line bg-surface"
      >
        <div
          aria-hidden
          className="absolute bottom-0 right-0 top-0 w-[268px] bg-rail"
        />
        <div className="relative grid grid-cols-[1fr_268px]">
          <div className="min-w-0 px-[20px] py-[16px]">
            <h2 className="pb-3 text-[13px] font-semibold">달력으로 보기</h2>
            <div className="grid grid-cols-2 gap-5">
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
            {/* 범례는 두 달을 통틀어 한 번만 선다. */}
            <div className="pt-3">
              <CalendarLegend cap={settings.dailyCap} />
            </div>
          </div>

          {/*
            고른 날의 내용을 레일에 담는다. 예전에는 달력 밑 상자였는데, 담긴 수에
            따라 상자가 늘었다 줄면서 문서 높이가 바뀌고 커서 밑 칸이 달아났다.
            레일은 카드 높이를 따라가므로 그 일이 안 생긴다.
          */}
          <div className="rail-panel flex min-h-0 flex-col gap-[8px] overflow-y-auto px-[18px] py-[16px]">
            {shown ? (
              <section
                aria-label="그날 무엇을 보나"
                className="flex flex-col gap-[8px]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[11.5px] text-text-3">
                    그날 무엇을 보나
                  </span>
                  {selected ? (
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="flex-none text-[11.5px] text-text-3 hover:text-text-2"
                    >
                      고정 해제
                    </button>
                  ) : null}
                </div>
                <DayCard date={shown} items={byDate.get(shown) ?? []} />
              </section>
            ) : (
              <>
                <span className="text-[11.5px] text-text-3">
                  한 달 단위로 보면
                </span>
                <p className="text-[12.5px] leading-relaxed text-text-2">
                  {monthSentence(dailyCount, settings.dailyCap)}
                </p>
                <p className="text-[11.5px] leading-relaxed text-text-3">
                  칸에 마우스를 올리면 그날 무엇을 보는지 여기 나옵니다. 누르면
                  고정돼요.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

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

/** 레일에 한 줄로 서는 이름과 값. */
function RailRow({
  label,
  value,
  muted,
  warn,
}: {
  label: string
  value: string
  muted?: boolean
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-sans text-[12px] text-text-3">{label}</span>
      <span
        className={cn(
          'num flex-none',
          warn ? 'text-imp-fg' : muted ? 'text-text-3' : 'text-text'
        )}
      >
        {value}
      </span>
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
