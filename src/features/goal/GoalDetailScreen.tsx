import { useState } from 'react'
import { defaultFsrs } from '../../core/fsrs/fsrs6'
import type { Horizon } from '../../core/horizon/horizon'
import { Badge } from '../../components/Badge'
import { Hint } from '../../components/Chip'
import { InlineText } from '../../components/InlineText'
import { MoreMenu } from '../../components/MoreMenu'
import { OptionCards } from '../../components/OptionCards'
import { Expand } from '../../components/Expand'
import type { GoalRow } from '../../db/types'
import { statusBadgeOf } from '../../lib/badge'
import { cn } from '../../lib/cn'
import { diffDays } from '../../lib/date'
import { effectiveConfig, goalColor, isActive, memoryStateOf } from '../../lib/domain'
import {
  daysLeftLabel,
  dueLabel,
  horizonLabel,
  monthDay,
  percent,
  weekday,
} from '../../lib/format'
import { INTENSITY_META } from '../../lib/intensity'
import { usePlanner } from '../../store/planner'
import { LoadBars, type LoadBar } from '../charts/LoadBars'
import { rollout } from '../forecast/rollout'
import { HorizonPicker } from '../newitem/HorizonPicker'

export function GoalDetailScreen({
  goalId,
  onOpenItem,
  onDeleted,
}: {
  goalId: string
  onOpenItem: (itemId: string) => void
  onDeleted: () => void
}) {
  const { items, goals, settings, today } = usePlanner()
  const updateGoal = usePlanner((s) => s.updateGoal)
  const deleteGoal = usePlanner((s) => s.deleteGoal)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const goal = goals.find((g) => g.id === goalId)
  if (!goal) {
    return (
      <div className="mx-auto w-full max-w-[940px] px-6 pb-7 pt-10 text-[13px] text-text-2">
        목표를 찾을 수 없어요.
      </div>
    )
  }

  const mine = items.filter((i) => i.goal_id === goal.id && isActive(i))
  const rows = mine.map((item) => {
    const config = effectiveConfig(item, goal, settings)
    const state = memoryStateOf(item)
    const retention =
      state && item.last_review
        ? defaultFsrs.retrievability(
            Math.max(0, diffDays(item.last_review, today)),
            state.stability
          )
        : 1
    const retentionAtGoal =
      state && goal.ready_at
        ? defaultFsrs.retrievability(
            Math.max(0, diffDays(today, goal.ready_at)),
            state.stability
          )
        : retention
    return { item, config, retention, retentionAtGoal }
  })

  const atRisk = rows.filter((r) => r.item.goal_risk === 'at_risk').length

  // 이미 잡혀 있는 다음 한 번만 그리면 목표한 날까지의 절반 넘게가 빈칸이 된다.
  // 예보와 같은 방식으로 하루씩 굴려서 목표한 날까지의 계획을 통째로 얻는다.
  const runway = goal.ready_at ? Math.max(1, diffDays(today, goal.ready_at)) : 60
  const plan = rollout({ items, goals, settings, from: today, days: runway })
  const bars: LoadBar[] = plan.map((day) => ({
    date: day.date,
    count: day.items.filter((p) => p.goalId === goal.id).length,
    markGoal: day.date === goal.ready_at,
  }))
  const totalReviews = bars.reduce((sum, b) => sum + b.count, 0)
  const target = goal.target_retention ?? settings.targetRetention
  // 지금 이 목표가 어디까지 와 있는지. 화면이 크게 말할 값은 이것 하나다.
  const avgNow =
    rows.length === 0
      ? 0
      : rows.reduce((sum, r) => sum + r.retention, 0) / rows.length
  // 마감이 가까워지면 마지막 점검이 한 날에 모인다. 그 봉우리를 평소 분량인 척
  // 말하면 "하루에 많아야 24개" 같은 거짓말이 되므로, 어느 날인지 같이 밝힌다.
  const busiest = bars.reduce<LoadBar | null>(
    (best, b) => (best === null || b.count > best.count ? b : best),
    null
  )
  const peak = busiest?.count ?? 0
  // 복습이 없는 날까지 나누면 실제보다 한참 작게 나온다. 있는 날만 센다.
  const busyDays = bars.filter((b) => b.count > 0).length
  const perDayAvg =
    busyDays === 0 ? 0 : Math.round((totalReviews / busyDays) * 10) / 10
  const overdue = rows.filter(
    (r) => r.item.due !== null && r.item.due < today
  ).length

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
            {goal.ready_at ? (
              <span className="flex-none rounded-[5px] bg-adj-bg px-[9px] py-[3px] text-[11.5px] font-medium text-adj-fg">
                {daysLeftLabel(today, goal.ready_at)}
              </span>
            ) : null}
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

        {/*
          몇 번 잡아뒀는지는 숫자만 크고 막막하다. 지금 어디까지 왔고 어디로 가는
          중인지가 이 화면이 답할 것이다.
        */}
        <div className="rail-panel flex flex-col gap-[6px] pr-[18px]">
          <div className="flex items-start justify-between">
            <span className="text-[11.5px] text-text-3">지금 평균 기억률</span>
            <MoreMenu
              label="이 목표 더보기"
              items={[
                {
                  label: '목표 삭제',
                  danger: true,
                  onSelect: () => setConfirmingDelete(true),
                },
              ]}
            />
          </div>
          <span className="font-display num text-[34px] font-semibold leading-none tracking-[-0.02em]">
            {percent(avgNow)}
          </span>
          <RetentionBar now={avgNow} target={target} />
          <span className="text-[11.5px] leading-relaxed text-text-3">
            {avgNow >= target
              ? `목표 ${percent(target)}를 지키는 중이에요.`
              : `목표 ${percent(target)}까지 끌어올리는 중이에요.`}
          </span>
        </div>
      </header>

      {confirmingDelete ? (
        <section className="flex flex-col gap-3 rounded-card border border-imp-fg bg-surface px-[16px] py-[14px]">
          <h2 className="text-[13px] font-semibold">이 목표를 지울까요?</h2>
          <p className="text-[12.5px] leading-relaxed text-text-2">
            {rows.length === 0
              ? '묶인 항목이 없어서 이 목표만 사라집니다.'
              : `묶여 있던 항목 ${rows.length}개는 지워지지 않고 소속만 풀립니다. 각 항목은 목표 시점 없이 계속 올라옵니다.`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void deleteGoal(goal.id).then(() => onDeleted())
              }
              className="rounded-ctl bg-imp-fg px-[14px] py-[7px] text-[13px] font-semibold text-white"
            >
              지우기
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-ctl border border-line-2 px-[12px] py-[7px] text-[13px] text-text-2 hover:bg-hover"
            >
              취소
            </button>
          </div>
        </section>
      ) : null}

      <p className="text-[16px] font-medium leading-relaxed">
        {didSentence(rows.length, totalReviews, atRisk, overdue, goal)}
      </p>

      <section
        aria-label="목표 설정"
        className="rounded-panel border border-line bg-surface px-[20px] py-[16px]"
      >
        <div className="flex min-w-0 flex-col gap-4">
          {/*
            안내문을 오른쪽 레일에 두었더니 왼쪽이 끝난 뒤로 레일만 길게 남았다.
            제목 옆 한 줄이면 충분하다.
          */}
          <div className="flex flex-wrap items-baseline gap-[9px]">
            <h2 className="text-[13px] font-semibold">목표 설정</h2>
            <span className="text-[12px] text-text-3">
              {rows.length === 0
                ? '여기서 정한 값은 앞으로 이 목표에 넣는 항목에 그대로 적용돼요.'
                : `여기서 바꾸면 이 목표에 묶인 항목 ${rows.length}개 전부에 함께 적용돼요.`}
            </span>
          </div>

            <Field label="목표 시점">
              <HorizonPicker
                today={today}
                uncertainty={settings.uncertainty}
                value={goalHorizonOf(goal)}
                onChange={(horizon: Horizon) => {
                  void updateGoal(goal.id, {
                    horizon_kind: horizon.kind,
                    ready_at:
                      horizon.kind === 'date'
                        ? horizon.at
                        : horizon.kind === 'window'
                          ? horizon.readyAt
                          : null,
                    hold_until:
                      horizon.kind === 'date'
                        ? horizon.at
                        : horizon.kind === 'window'
                          ? horizon.holdUntil
                          : null,
                  })
                }}
              />
            </Field>

            <Field label="복습 강도">
              <OptionCards
                label="복습 강도"
                value={goal.intensity}
                options={INTENSITY_META.map((meta) => ({
                  key: meta.key,
                  name: meta.name,
                  desc: meta.desc,
                }))}
                onChange={(key) => void updateGoal(goal.id, { intensity: key })}
              />
            </Field>

            <div className="border-t border-line pt-[12px]">
              <Expand
                plain
                open={advancedOpen}
                onToggle={() => setAdvancedOpen((o) => !o)}
                label="고급"
                hint="대부분 그대로 두시면 돼요."
              >
                <div className="flex flex-col gap-4 pt-3">
                  <Field label="최소 복습 횟수">
                    <div className="flex items-center gap-2">
                      <Stepper
                        value={goal.min_reviews}
                        onChange={(next) =>
                          void updateGoal(goal.id, { min_reviews: next })
                        }
                      />
                      <span className="text-[12px] text-text-3">
                        목표한 날 전에 최소 이만큼은 보게 잡아요.
                      </span>
                    </div>
                  </Field>
                  <Field label="목표 기억률">
                    <p className="text-[12px] text-text-3">
                      모든 목표에 같이 적용돼요. 설정에서 바꿉니다. 지금은{' '}
                      <span className="num">
                        {percent(settings.targetRetention)}
                      </span>
                      예요.
                    </p>
                  </Field>
                </div>
              </Expand>
            </div>
        </div>
      </section>

      {rows.length > 0 ? (
        <section
          aria-label="복습 분포"
          className="rounded-panel border border-line bg-surface px-[20px] py-[16px]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3">
            <h2 className="text-[13px] font-semibold">복습 분포</h2>
            <div className="num flex items-baseline gap-4 text-[12px] text-text-3">
              <span>
                가장 많은 날{' '}
                <span
                  className={cn(
                    'text-text-2',
                    settings.dailyCap !== null && peak > settings.dailyCap
                      ? 'text-imp-fg'
                      : ''
                  )}
                >
                  {busiest ? `${monthDay(busiest.date)} ` : ''}
                  {peak}개
                </span>
              </span>
              <span>
                하루 평균 <span className="text-text-2">{perDayAvg}개</span>
              </span>
            </div>
          </div>
          <LoadBars bars={bars} cap={settings.dailyCap} />
          <p className="pt-3 text-[12px] leading-relaxed text-text-2">
            복습 항목을 목표 시점 범위 안에서만 조정해요. 목표 기억률인{' '}
            <span className="num">{percent(target)}</span>는 그대로 유지됩니다.
          </p>
        </section>
      ) : null}

      <section className="rounded-card border border-line bg-surface px-[16px] py-[14px]">
        <h2 className="pb-3 text-[13px] font-semibold">항목별 상태</h2>
        {rows.length === 0 ? (
          <p className="text-[13px] text-text-3">
            항목을 오늘 화면에서 적고 이 목표에 넣어보세요.
          </p>
        ) : (
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[11.5px] text-text-3">
              <tr className="border-b border-line">
                <th className="py-2 font-normal">항목</th>
                <th className="py-2 font-normal">준비</th>
                <th className="py-2 text-right font-normal">
                  목표한 날 기억률
                </th>
                <th className="py-2 text-right font-normal">다음에 볼 날</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => a.retentionAtGoal - b.retentionAtGoal)
                .map(({ item, retentionAtGoal }) => {
                  const badge = statusBadgeOf(item.due_kind, item.goal_risk)
                  return (
                    <tr
                      key={item.id}
                      className="cursor-pointer border-b border-line hover:bg-hover"
                      onClick={() => onOpenItem(item.id)}
                    >
                      <td className="py-2">{item.title}</td>
                      <td className="py-2">
                        {badge ? <Badge kind={badge} /> : null}
                      </td>
                      <td className="num py-2 text-right">
                        {percent(retentionAtGoal)}
                      </td>
                      <td className="num py-2 text-right text-text-3">
                        {item.due ? dueLabel(today, item.due) : '없음'}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function goalHorizonOf(goal: GoalRow): Horizon {
  if (goal.horizon_kind === 'date' && goal.ready_at) {
    return { kind: 'date', at: goal.ready_at }
  }
  if (goal.horizon_kind === 'window' && goal.ready_at && goal.hold_until) {
    return { kind: 'window', readyAt: goal.ready_at, holdUntil: goal.hold_until }
  }
  return { kind: 'open' }
}


function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | undefined
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-center gap-[5px]">
        <span className="text-[12px] font-medium text-text-2">{label}</span>
        {hint ? <Hint text={hint} /> : null}
      </div>
      {children}
    </div>
  )
}

function Stepper({
  value,
  onChange,
}: {
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center overflow-hidden rounded-ctl border border-line-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="px-[10px] py-[5px] text-[13px] hover:bg-hover"
      >
        −
      </button>
      <span className="num min-w-[46px] text-center text-[13px]">{value}번</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(20, value + 1))}
        className="px-[10px] py-[5px] text-[13px] hover:bg-hover"
      >
        +
      </button>
    </div>
  )
}

/**
 * 이 목표를 위해 앱이 무엇을 해뒀는지 한 줄로.
 *
 * "몇 개가 부족해요" 는 알려 봐야 사용자가 할 일이 없다. 이 앱이 하는 일은
 * 목표 기억률을 지키도록 날짜를 잡고 다시 잡는 것이므로, 그 결과를 말한다.
 */
function didSentence(
  count: number,
  totalReviews: number,
  atRisk: number,
  overdue: number,
  goal: GoalRow
): string {
  if (count === 0) {
    return '아직 이 목표에 묶인 항목이 없어요. 오늘 화면에서 적고 이 목표에 넣어보세요.'
  }
  if (!goal.ready_at) {
    return `${count}개를 마감 없이 계속 볼 수 있게 잡아뒀어요. 잊을 만할 때마다 올라옵니다.`
  }

  // 가장 몰리는 날과 하루 상한은 바로 옆 '하루 분량' 과 그림이 이미 말한다.
  // 여기서 또 적으면 같은 말을 두 번 읽게 된다.
  const parts = [`목표한 날까지 ${totalReviews}번 볼 수 있게 잡아뒀어요.`]
  if (atRisk > 0) {
    parts.push(`한 번으로 모자란 ${atRisk}개는 두 번씩 잡았습니다.`)
  }
  if (overdue > 0) {
    // 밀린 것은 앱이 옮기지 않는다. 날짜를 흔드는 쪽이 오늘이거나 지난 날짜를
    // 건너뛰기 때문이다. 당겼다고 적으면 안 한 일을 했다고 말하는 것이 된다.
    parts.push(`밀린 ${overdue}개는 오늘 목록에 그대로 올려뒀어요.`)
  }
  return parts.join(' ')
}

/**
 * 지금 기억률이 목표까지 얼마나 왔는지.
 *
 * 0부터 100까지 그리면 83% 와 90% 가 붙어 보여서 나아가는 느낌이 안 난다.
 * 기억률은 실제로 50 아래로 잘 안 내려가므로 50 부터 그린다.
 */
function RetentionBar({ now, target }: { now: number; target: number }) {
  const FLOOR = 0.5
  const at = (v: number) =>
    Math.min(100, Math.max(0, ((v - FLOOR) / (1 - FLOOR)) * 100))
  return (
    <div
      className="relative h-[6px] w-full overflow-hidden rounded-full bg-line-2"
      role="img"
      aria-label={`목표 ${percent(target)} 가운데 지금 ${percent(now)}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-accent"
        style={{ width: `${at(now)}%` }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 w-[2px] bg-text-3"
        style={{ left: `${at(target)}%` }}
      />
    </div>
  )
}
