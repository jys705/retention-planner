import { useEffect, useState } from 'react'
import { resolveHorizon, type Horizon } from '../../core/horizon/horizon'
import { InlineText } from '../../components/InlineText'
import { MoreMenu } from '../../components/MoreMenu'
import { NumText } from '../../components/NumText'
import { OptionCards } from '../../components/OptionCards'
import type { GoalRow, ReviewRow } from '../../db/types'
import { addDays, toEpochDay, type DateOnly } from '../../lib/date'
import { goalColor, goalHorizon, horizonFields, isActive } from '../../lib/domain'
import { horizonLabel, monthDay, percent, weekday } from '../../lib/format'
import {
  averageRetentionOn,
  endedKey,
  goalEndDay,
  retentionOn,
} from '../../lib/lifecycle'
import { usePlanner } from '../../store/planner'
import { LoadBars, type LoadBar } from '../charts/LoadBars'
import { HorizonPicker } from '../newitem/HorizonPicker'
import { RetentionBar } from './RetentionBar'

/**
 * 목표 시점이 지난 목표.
 *
 * 앞으로 할 일이 없으니 화면이 할 말은 결과다. 목표한 날 기억률이 목표에 닿았는지,
 * 그때까지 언제 몇 번 봤는지를 적는다. 며칠 지났는지는 적지 않는다.
 * 그 다음은 사람이 정할 일이다. 그대로 두거나, 계속 기억하거나, 날짜를 다시
 * 정하거나, 지운다.
 */
export function FinishedGoal({
  goal,
  onOpenItem,
  onDeleted,
}: {
  goal: GoalRow
  onOpenItem: (itemId: string) => void
  onDeleted: () => void
}) {
  const { items, goals, reviews, settings, today } = usePlanner()
  const updateGoal = usePlanner((s) => s.updateGoal)
  const deleteGoal = usePlanner((s) => s.deleteGoal)
  const acknowledgeEnded = usePlanner((s) => s.acknowledgeEnded)
  const [panel, setPanel] = useState<'continue' | 'redate' | 'delete' | null>(
    null
  )
  // 날짜는 고르는 것만으로 바뀌지 않는다. 고른 뒤 단추를 눌러야 다시 시작한다.
  const [draft, setDraft] = useState<Horizon>(() => goalHorizon(goal))
  // 지울 때는 기록을 남기는 쪽이 기본이다. 평가 이력은 나중에 이 사람에게 맞게
  // 계산을 다시 맞추는 데 쓴다.
  const [deleteScope, setDeleteScope] = useState<'goal' | 'all'>('goal')

  // 이 화면을 열어 봤으면 끝난 것을 안 것이다. 오늘 화면에서 또 알리지 않는다.
  const key = endedKey(goal)
  useEffect(() => {
    if (key !== null) void acknowledgeEnded([key])
  }, [key, acknowledgeEnded])

  const end = goalEndDay(goal) ?? today
  // 대략 목표는 기간이 끝나는 날의 기억률을 본다. 목표한 '날' 이 하나가 아니다.
  const dayName = goal.horizon_kind === 'window' ? '마지막 날' : '목표한 날'
  const target = goal.target_retention ?? settings.targetRetention
  // 보관한 것까지 다 센다. 이 목표의 기록은 소속 항목 전부다.
  const members = items.filter((i) => i.goal_id === goal.id)
  const memberIds = new Set(members.map((i) => i.id))
  const kept = members.filter((i) => !isActive(i)).length
  const allReviews = reviews.filter((r) => memberIds.has(r.item_id))
  const ownReviews = allReviews.filter((r) => r.reviewed_at <= end)
  const rows = members
    .map((item) => ({
      item,
      result: retentionOn(item, reviews, end),
      count: ownReviews.filter((r) => r.item_id === item.id).length,
    }))
    .sort((a, b) => (a.result ?? 2) - (b.result ?? 2))
  const average = averageRetentionOn(members, reviews, end)
  const known = rows.filter((r) => r.result !== null)
  const reached = known.filter((r) => r.result! >= target).length
  const since = members.reduce<DateOnly | null>(
    (first, i) =>
      first === null || i.first_studied_at < first ? i.first_studied_at : first,
    null
  )
  const history = historyBars(ownReviews, since, end)
  const busiest = history.reduce<LoadBar | null>(
    (best, b) => (best === null || b.count > best.count ? b : best),
    null
  )
  const studyDays = history.filter((b) => b.count > 0).length
  const perDay =
    studyDays === 0 ? 0 : Math.round((ownReviews.length / studyDays) * 10) / 10
  // 고른 날짜가 이미 지난 날이면 다시 시작해 봐야 그대로 끝난 목표다.
  const { holdUntil: draftEnd } = resolveHorizon(draft)
  const draftOpen = !Number.isFinite(draftEnd) || draftEnd >= toEpochDay(today)

  return (
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-4 px-6 pb-7 pt-10">
      <header className="grid grid-cols-[1fr_268px] items-start gap-6">
        <div className="flex min-w-0 flex-col gap-[7px]">
          <div className="flex items-center gap-[9px]">
            <span
              aria-hidden
              className="h-[7px] w-[7px] flex-none rounded-full"
              style={{ background: goalColor(goal, goals.indexOf(goal)) }}
            />
            <InlineText
              value={goal.name}
              label="목표 이름"
              placeholder="이름 없음"
              className="-ml-[6px] text-[24px] font-semibold tracking-[-0.02em]"
              onSave={(next) => void updateGoal(goal.id, { name: next })}
            />
            <span
              className="flex-none rounded-[5px] bg-adj-bg px-[9px] py-[3px] text-[11.5px] font-medium text-adj-fg"
              title="목표 시점이 지나서 항목을 보관해 둔 목표예요."
            >
              마침
            </span>
          </div>
          <p className="text-[13px] text-text-2">
            목표 시점:{' '}
            <span className="num text-[12.5px] text-text">
              {horizonLabel(goal.horizon_kind, goal.ready_at, goal.hold_until)}
              {goal.horizon_kind === 'date' && goal.ready_at ? (
                <span className="font-sans"> ({weekday(goal.ready_at)})</span>
              ) : null}
            </span>
          </p>
        </div>

        <div className="rail-panel flex flex-col gap-[6px] pr-[18px]">
          <div className="flex items-start justify-between">
            <span className="text-[11.5px] text-text-3">{dayName} 기억률</span>
            <MoreMenu
              label="이 목표 더보기"
              items={[
                {
                  label: '목표 삭제',
                  danger: true,
                  onSelect: () => setPanel('delete'),
                },
              ]}
            />
          </div>
          <span className="font-display num text-[34px] font-semibold leading-none tracking-[-0.02em]">
            {average === null ? '없음' : percent(average)}
          </span>
          {average !== null ? (
            <>
              <RetentionBar now={average} target={target} when={dayName} />
              <span className="text-[11.5px] leading-relaxed text-text-3">
                {average >= target
                  ? `목표 ${percent(target)}를 지켰어요.`
                  : `목표 ${percent(target)}에는 못 미쳤어요.`}
              </span>
            </>
          ) : null}
        </div>
      </header>

      {panel === 'delete' ? (
        <section className="flex flex-col gap-3 rounded-card border border-imp-fg bg-surface px-[16px] py-[14px]">
          <h2 className="text-[13px] font-semibold">이 목표를 지울까요?</h2>
          {members.length === 0 ? (
            <p className="text-[12.5px] leading-relaxed text-text-2">
              묶인 항목이 없어서 이 목표만 사라집니다.
            </p>
          ) : (
            <OptionCards
              label="지울 범위"
              value={deleteScope}
              onChange={setDeleteScope}
              options={[
                {
                  key: 'goal',
                  name: '목표만 지우기',
                  desc: `항목 ${members.length}개와 평가 기록은 서재의 마친 것에 남아요.`,
                },
                {
                  key: 'all',
                  name: '항목까지 지우기',
                  desc: `항목 ${members.length}개와 평가 ${allReviews.length}건이 함께 사라집니다. 되돌릴 수 없어요.`,
                },
              ]}
            />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void deleteGoal(goal.id, {
                  withItems: members.length > 0 && deleteScope === 'all',
                }).then(() => onDeleted())
              }
              className="rounded-ctl bg-imp-fg px-[14px] py-[7px] text-[13px] font-semibold text-white"
            >
              지우기
            </button>
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="rounded-ctl border border-line-2 px-[12px] py-[7px] text-[13px] text-text-2 hover:bg-hover"
            >
              취소
            </button>
          </div>
        </section>
      ) : null}

      <p className="text-pretty break-keep text-[16px] font-medium leading-relaxed">
        {resultSentence({
          since,
          end,
          count: members.length,
          looks: ownReviews.length,
          known: known.length,
          reached,
          target,
          dayName,
        })}
      </p>

      <section
        aria-label="마친 뒤"
        className="flex flex-col gap-3 rounded-panel border border-line bg-surface px-[20px] py-[16px]"
      >
        <div className="flex flex-wrap items-baseline gap-[9px]">
          <h2 className="text-[13px] font-semibold">마친 뒤</h2>
          <span className="text-[12px] text-text-3">
            {members.length === 0
              ? '이 목표에 묶인 항목이 없었어요.'
              : kept === members.length
                ? `항목 ${kept}개는 보관해 두었어요. 오늘 화면과 예보에 안 올라오고, 평가 기록은 그대로 남아요.`
                : `목표 뒤에도 계속 보기로 해 둔 목표라 항목 ${
                    members.length - kept
                  }개는 그대로 올라와요.`}
          </span>
        </div>

        {kept > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPanel(panel === 'continue' ? null : 'continue')}
              aria-expanded={panel === 'continue'}
              className="rounded-ctl border border-line-2 px-[12px] py-[7px] text-[13px] text-text-2 transition-colors hover:bg-hover"
            >
              계속 기억하기
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(goalHorizon(goal))
                setPanel(panel === 'redate' ? null : 'redate')
              }}
              aria-expanded={panel === 'redate'}
              className="rounded-ctl border border-line-2 px-[12px] py-[7px] text-[13px] text-text-2 transition-colors hover:bg-hover"
            >
              날짜 다시 정하기
            </button>
          </div>
        ) : null}

        {panel === 'continue' ? (
          <div className="flex flex-col gap-3 rounded-card border border-accent px-[14px] py-[12px]">
            <p className="max-w-[640px] text-pretty break-keep text-[12.5px] leading-relaxed text-text-2">
              목표 시점을 정해두지 않은 것으로 바꾸고 {kept}개를 다시 올려요. 그
              뒤로는 잊을 만할 때마다 올라옵니다. 볼 때가 이미 지난 것은 오늘부터
              올라오고, 하루 상한 {settings.dailyCap}개를 넘는 것은 다음 날로
              넘어가요.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  void updateGoal(goal.id, horizonFields({ kind: 'open' }))
                }
                className="rounded-ctl bg-accent px-[14px] py-[7px] text-[13px] font-semibold text-white"
              >
                다시 올리기
              </button>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded-ctl border border-line-2 px-[12px] py-[7px] text-[13px] text-text-2 hover:bg-hover"
              >
                취소
              </button>
            </div>
          </div>
        ) : null}

        {panel === 'redate' ? (
          <div className="flex flex-col gap-[10px] rounded-card border border-accent px-[14px] py-[12px]">
            <p className="max-w-[640px] text-pretty break-keep text-[12.5px] leading-relaxed text-text-2">
              시험이 미뤄졌으면 새 목표 시점을 고르세요. 그 시점에 맞춰 {kept}개가
              다시 잡혀요. 볼 때가 이미 지난 것은 오늘부터 올라옵니다.
            </p>
            <HorizonPicker
              today={today}
              uncertainty={settings.uncertainty}
              value={draft}
              onChange={setDraft}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!draftOpen}
                onClick={() => void updateGoal(goal.id, horizonFields(draft))}
                className="rounded-ctl bg-accent px-[14px] py-[7px] text-[13px] font-semibold text-white disabled:opacity-35"
              >
                이 시점으로 다시 시작하기
              </button>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded-ctl border border-line-2 px-[12px] py-[7px] text-[13px] text-text-2 hover:bg-hover"
              >
                취소
              </button>
              {!draftOpen ? (
                <span className="text-[12px] text-text-3">
                  이미 지난 날이에요. 오늘이나 그 뒤를 고르세요.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {ownReviews.length > 0 ? (
        <section
          aria-label="지난 복습"
          className="rounded-panel border border-line bg-surface px-[20px] py-[16px]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3">
            <h2 className="text-[13px] font-semibold">지난 복습</h2>
            <div className="flex items-baseline gap-4 text-[12px] text-text-3">
              {busiest ? (
                <span>
                  가장 많이 본 날{' '}
                  <span className="text-text-2">
                    <NumText text={`${monthDay(busiest.date)} ${busiest.count}번`} />
                  </span>
                </span>
              ) : null}
              <span>
                본 날 하루 평균{' '}
                <span className="text-text-2">
                  <NumText text={`${perDay}번`} />
                </span>
              </span>
            </div>
          </div>
          <LoadBars
            bars={history}
            marks={[{ date: end, label: dayName, color: 'var(--imp-fg)' }]}
            renderTooltip={(date) => {
              const bar = history.find((b) => b.date === date)
              return (
                <div className="rounded-[9px] border border-line bg-surface px-[10px] py-[7px] text-[12px] shadow-[var(--shadow-sm)]">
                  <NumText text={`${monthDay(date)} ${bar?.count ?? 0}번`} />
                </div>
              )
            }}
          />
          <p className="pt-3 text-[12px] leading-relaxed text-text-2">
            처음 공부한 날부터 {dayName}까지 실제로 본 날과 횟수예요.
          </p>
        </section>
      ) : null}

      <section className="rounded-card border border-line bg-surface px-[16px] py-[14px]">
        <h2 className="pb-3 text-[13px] font-semibold">항목별 결과</h2>
        {rows.length === 0 ? (
          <p className="text-[13px] text-text-3">이 목표에 묶인 항목이 없었어요.</p>
        ) : (
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[11.5px] text-text-3">
              <tr className="border-b border-line">
                <th className="py-2 font-normal">항목</th>
                <th className="py-2 text-right font-normal">본 횟수</th>
                <th className="py-2 text-right font-normal">{dayName} 기억률</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, result, count }) => (
                <tr
                  key={item.id}
                  className="cursor-pointer border-b border-line hover:bg-hover"
                  onClick={() => onOpenItem(item.id)}
                >
                  <td className="py-2">{item.title}</td>
                  <td className="num py-2 text-right text-text-2">{count}번</td>
                  <td className="num py-2 text-right">
                    {result === null ? '없음' : percent(result)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

/** 처음 공부한 날부터 끝나는 날까지 날마다 몇 번 봤는지. 안 본 날도 칸을 둔다. */
function historyBars(
  reviews: readonly ReviewRow[],
  since: DateOnly | null,
  end: DateOnly
): LoadBar[] {
  if (since === null || since > end) return []
  const counts = new Map<DateOnly, number>()
  for (const review of reviews) {
    counts.set(review.reviewed_at, (counts.get(review.reviewed_at) ?? 0) + 1)
  }
  const bars: LoadBar[] = []
  for (let date = since; date <= end; date = addDays(date, 1)) {
    bars.push({ date, count: counts.get(date) ?? 0 })
  }
  return bars
}

/**
 * 결과를 한 줄로.
 *
 * 앱이 사실로 말할 수 있는 것은 목표한 날 기억률이 목표에 닿았는지 하나다.
 * 시험에 붙었는지는 모른다. 축하하지 않고 있었던 일만 적는다.
 * 처음 공부한 날의 평가도 기록에 한 줄로 남는다. 그래서 '복습' 이 아니라 '봤다' 고 센다.
 */
function resultSentence(args: {
  since: DateOnly | null
  end: DateOnly
  count: number
  looks: number
  known: number
  reached: number
  target: number
  dayName: string
}): string {
  const { since, end, count, looks, known, reached, target, dayName } = args
  if (count === 0) return `${monthDay(end)}에 마친 목표예요. 묶인 항목은 없었어요.`
  const span =
    since && since < end
      ? `${monthDay(since)}부터 ${monthDay(end)}까지`
      : `${monthDay(end)}까지`
  const did = `${span} ${count}개를 ${looks}번 봤어요.`
  if (known === 0) return did
  // '퍼센트' 로 읽으니 늘 '를' 이다.
  const goal = `목표 기억률 ${percent(target)}를`
  if (reached === known) {
    return `${did} ${dayName}에는 ${known}개 모두 ${goal} 넘겼어요.`
  }
  if (reached === 0) return `${did} ${dayName}에 ${goal} 넘긴 것은 없었어요.`
  return `${did} ${dayName}에는 ${known}개 가운데 ${reached}개가 ${goal} 넘겼어요.`
}
