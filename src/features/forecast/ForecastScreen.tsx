import { useState } from 'react'
import { projectGroup, type ProjectItemInput } from '../../core/simulate/project'
import { addDays, type DateOnly } from '../../lib/date'
import { effectiveConfig, isActive, memoryStateOf } from '../../lib/domain'
import { fullDate, monthDay, shortDate } from '../../lib/format'
import { usePlanner } from '../../store/planner'
import { CalendarHeatmap } from '../charts/CalendarHeatmap'
import { monthKey, monthLabel } from '../charts/calendar'
import { LoadBars, type LoadBar } from '../charts/LoadBars'

const HORIZON_DAYS = 60

export function ForecastScreen() {
  const { items, goals, settings, today } = usePlanner()
  const [selected, setSelected] = useState<DateOnly | null>(null)

  const inputs: ProjectItemInput[] = items
    .filter(isActive)
    .flatMap((item) => {
      const state = memoryStateOf(item)
      if (!state || !item.due) return []
      const goal = goals.find((g) => g.id === item.goal_id) ?? null
      const config = effectiveConfig(item, goal, settings)
      return [
        {
          itemId: item.id,
          state,
          anchor: item.last_review ?? item.first_studied_at,
          due: item.due,
          from: today,
          days: HORIZON_DAYS,
          horizon: config.horizon,
          intensity: config.intensity,
          targetRetention: config.targetRetention,
          minReviews: config.minReviews,
          repsSinceGoal: item.reps_since_goal,
          bufferDays: settings.bufferDays,
          maxIntervalDays: config.maxIntervalDays,
        },
      ]
    })

  const projection = projectGroup({ items: inputs, from: today, days: HORIZON_DAYS })

  const bars: LoadBar[] = []
  for (let i = 0; i <= HORIZON_DAYS; i += 1) {
    const date = addDays(today, i)
    bars.push({ date, count: projection.dailyCount[date] ?? 0 })
  }

  const total = projection.total
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
          selected={selected}
        />
        <p className="pt-3 text-[12px] text-text-2">
          막대를 누르면 그날 예정된 개수를 볼 수 있어요.
        </p>
      </section>

      {selected ? (
        <div className="flex items-center justify-between rounded-card bg-rail px-[16px] py-[12px]">
          <div>
            <div className="text-[13px] font-medium">{fullDate(selected)}</div>
            <div className="num text-[12px] text-text-3">
              {projection.dailyCount[selected] ?? 0}개 예정
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-[12px] text-text-3 hover:text-text-2"
          >
            선택 해제
          </button>
        </div>
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
                  {countInMonth(projection.dailyCount, month)}개
                </span>
              </div>
              <CalendarHeatmap
                month={month}
                counts={projection.dailyCount}
                cap={settings.dailyCap}
                selected={selected}
                onSelect={(date) =>
                  setSelected(date === selected ? null : date)
                }
              />
            </div>
          ))}
        </div>
        <p className="pt-3 text-[12px] text-text-2">
          {monthSentence(projection.dailyCount, settings.dailyCap)}
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
