import { AdjustedBadge, Badge } from '../../components/Badge'
import type { ItemRow } from '../../db/types'
import { dueReason, statusBadgeOf } from '../../lib/badge'
import { fromEpochDay, type DateOnly } from '../../lib/date'
import {
  difficultyLabel,
  horizonLabel,
  dueLabel,
  monthDay,
  percent,
  stabilityLabel,
} from '../../lib/format'
import { usePlanner } from '../../store/planner'
import { MemoryCurveChart } from '../charts/MemoryCurveChart'
import { buildItemView } from './itemView'

const GRADE_NAME = ['', '다시', '어려움', '알맞음', '쉬움']

export function ItemDetailScreen({
  itemId,
  onBack,
}: {
  itemId: string
  onBack: () => void
}) {
  const { items, goals, reviews, settings, today } = usePlanner()
  const item = items.find((i) => i.id === itemId)
  if (!item) {
    return (
      <div className="mx-auto w-full max-w-[940px] px-6 py-7 text-[13px] text-text-2">
        항목을 찾을 수 없어요.
      </div>
    )
  }
  const goal = goals.find((g) => g.id === item.goal_id) ?? null
  const view = buildItemView(item, goal, reviews, settings, today)
  const badge = statusBadgeOf(item.due_kind, item.goal_risk)

  return (
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-5 px-6 py-7">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="text-[12px] text-text-3 hover:text-text-2"
        >
          ← 서재
        </button>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <h1 className="text-[19px] font-semibold">{item.title}</h1>
          {badge ? <Badge kind={badge} /> : null}
          {item.due_source === 'spread' ? <AdjustedBadge /> : null}
        </div>
        <div className="num flex flex-wrap gap-4 pt-1 text-[12px] text-text-3">
          {goal ? <span>{goal.name}</span> : null}
          <span>
            목표 시점{' '}
            {horizonLabel(
              view.config.horizon.kind,
              view.readyAt,
              view.holdUntil
            )}
          </span>
        </div>
      </div>

      <Summary item={item} today={today} retention={view.retention} />

      <Section title="기억 곡선">
        <MemoryCurveChart
          curve={view.curve}
          today={today}
          targetRetention={view.config.targetRetention}
          readyAt={view.readyAt}
          holdUntil={view.holdUntil}
        />
        <Caption>{curveSentence(view.retention, item.due, today)}</Caption>
      </Section>

      {view.feasible ? (
        <Section title="옮길 수 있는 날짜 범위">
          <p className="pb-3 text-[12.5px] text-text-2">
            다음에 볼 날을 이 사이로 옮겨도 계획이 틀어지지 않아요.
          </p>
          <div className="rounded-card bg-rail px-[14px] py-[12px]">
            <div className="num flex items-center justify-between text-[13px]">
              <span>{monthDay(fromEpochDay(view.feasible.earliest))}</span>
              <span className="text-accent">
                고른 날: {item.due ? monthDay(item.due) : '없음'}
              </span>
              <span>{monthDay(fromEpochDay(view.feasible.latest))}</span>
            </div>
            <div className="flex justify-between pt-2 text-[11px] text-text-3">
              <span>이보다 이르면 목표한 날에 기억이 부족해요.</span>
              <span>이보다 늦으면 목표한 날을 넘어요.</span>
            </div>
          </div>
          <Caption>
            {view.feasible.atRisk
              ? '한 번 봐서는 목표한 날 기억이 모자라요. 그래서 두 번 잡아두었어요.'
              : `이 범위 안에서 보면 목표한 날 기억률이 ${percent(
                  view.config.targetRetention
                )} 아래로 안 떨어져요.`}
          </Caption>
        </Section>
      ) : null}

      <Section title="이 항목이 오늘 올라온 이유">
        <p className="text-[13px] text-text-2">{dueReason(item.due_kind)}</p>
      </Section>

      <Section title="평가 이력">
        {view.reviews.length === 0 ? (
          <p className="text-[13px] text-text-3">
            아직 평가한 적이 없어요. 처음 공부한 날만 기록돼 있습니다.
          </p>
        ) : (
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[11.5px] text-text-3">
              <tr className="border-b border-line">
                <th className="py-2 font-normal">날짜</th>
                <th className="py-2 font-normal">등급</th>
                <th className="py-2 font-normal">메모</th>
                <th className="py-2 text-right font-normal">그때의 기억률</th>
                <th className="py-2 text-right font-normal">다음에 본 날</th>
              </tr>
            </thead>
            <tbody>
              {[...view.reviews].reverse().map((review, index, list) => {
                const next = list[index - 1]
                return (
                  <tr key={review.id} className="border-b border-line">
                    <td className="num py-2">{monthDay(review.reviewed_at)}</td>
                    <td className="py-2">{GRADE_NAME[review.rating]}</td>
                    <td className="py-2 text-text-3">
                      {review.memo_snapshot ?? ''}
                    </td>
                    <td className="num py-2 text-right">
                      {percent(review.r_at_review)}
                    </td>
                    <td className="num py-2 text-right text-text-3">
                      {next ? monthDay(next.reviewed_at) : '아직'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

function Summary({
  item,
  today,
  retention,
}: {
  item: ItemRow
  today: DateOnly
  retention: number
}) {
  return (
    <div className="rail-panel grid grid-cols-4 gap-3 rounded-card bg-rail px-[16px] py-[13px]">
      <Stat label="지금 기억률" value={percent(retention)} />
      <Stat
        label="다음에 볼 날"
        value={item.due ? dueLabel(today, item.due) : '없음'}
      />
      <Stat
        label="기억 지속력"
        value={item.stability !== null ? stabilityLabel(item.stability) : '아직'}
        note="90%까지 유지되는 기간"
      />
      <Stat
        label="체감 난이도"
        value={
          item.difficulty !== null ? difficultyLabel(item.difficulty) : '아직'
        }
        note={`지금까지 ${item.reps}번 봤어요`}
      />
    </div>
  )
}

function Stat({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[11px] text-text-3">{label}</span>
      <span className="num text-[16px] font-semibold">{value}</span>
      {note ? <span className="text-[10.5px] text-text-3">{note}</span> : null}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-card border border-line bg-surface px-[16px] py-[14px]">
      <h2 className="pb-3 text-[13px] font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** 그래프를 못 읽어도 결론은 알 수 있게 한 문장을 붙인다. */
function Caption({ children }: { children: React.ReactNode }) {
  return <p className="pt-3 text-[12px] text-text-2">{children}</p>
}

function curveSentence(
  retention: number,
  due: DateOnly | null,
  today: DateOnly
): string {
  const now = percent(retention)
  if (!due) return `지금 이 항목을 떠올릴 확률은 ${now}쯤이에요.`
  if (due <= today) {
    return `지금 떠올릴 확률은 ${now}쯤이에요. 오늘 다시 보면 곡선이 100%로 올라갑니다.`
  }
  return `지금 떠올릴 확률은 ${now}쯤이에요. ${dueLabel(
    today,
    due
  )} 다시 보면 곡선이 100%로 올라갑니다.`
}
