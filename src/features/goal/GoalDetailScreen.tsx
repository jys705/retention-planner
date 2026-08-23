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
import { diffDays } from '../../lib/date'
import { effectiveConfig, isActive, memoryStateOf } from '../../lib/domain'
import { daysLeftLabel, dueLabel, monthDay, percent } from '../../lib/format'
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
      <div className="mx-auto w-full max-w-[940px] px-6 py-7 text-[13px] text-text-2">
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
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-5 px-6 py-7">
      <header className="grid grid-cols-[1fr_268px] items-start gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <InlineText
              value={goal.name}
              label="목표 이름"
              placeholder="이름 없음"
              className="-ml-[6px] text-[22px] font-semibold tracking-[-0.02em]"
              onSave={(next) => void updateGoal(goal.id, { name: next })}
            />
            {goal.ready_at ? (
              <span className="num flex-none text-[13px] text-text-2">
                {daysLeftLabel(today, goal.ready_at)}
              </span>
            ) : null}
          </div>
        </div>

        {/*
          이 화면이 답해야 할 것은 '몇 개가 부족한가' 가 아니라
          '목표를 지키려고 앱이 무엇을 해뒀는가' 다.
        */}
        <div className="rail-panel flex flex-col items-end gap-[8px] pr-[18px]">
          <div className="flex w-full items-start justify-between">
            <div className="flex flex-col gap-[1px]">
              <span className="text-[11.5px] text-text-3">
                {goal.ready_at ? '목표한 날까지 잡아둔 복습' : '앞으로 잡아둔 복습'}
              </span>
              <span className="font-display num text-[30px] font-semibold leading-none tracking-[-0.02em]">
                {totalReviews}번
              </span>
            </div>
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
        {didSentence(
          rows.length,
          totalReviews,
          atRisk,
          overdue,
          busiest,
          settings.dailyCap,
          goal
        )}
      </p>

      <section
        aria-label="목표 설정"
        className="relative overflow-hidden rounded-panel border border-line bg-surface"
      >
        <div
          aria-hidden
          className="absolute bottom-0 right-0 top-0 w-[268px] bg-rail"
        />
        <div className="relative grid grid-cols-[1fr_268px]">
          <div className="flex min-w-0 flex-col gap-4 px-[20px] py-[16px]">
            <h2 className="text-[13px] font-semibold">목표 설정</h2>

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

          <div className="rail-panel flex flex-col gap-[10px] px-[18px] py-[16px]">
            <span className="text-[11.5px] text-text-3">지금 상태</span>
            {rows.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-text-2">
                아직 묶인 항목이 없어요. 여기서 정한 값은 앞으로 이 목표에 넣는
                항목에 그대로 적용됩니다.
              </p>
            ) : (
              <>
                <p className="text-[12.5px] leading-relaxed text-text-2">
                  여기서 바꾸면 이 목표에 묶인{' '}
                  <span className="num">{rows.length}</span>개 전부에 함께
                  적용됩니다.
                </p>
                <p className="text-[12px] leading-relaxed text-text-3">
                  목표한 날이 미뤄지면 여기서 날짜만 바꾸면 됩니다. 항목을 하나씩
                  고칠 필요가 없어요.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {rows.length > 0 ? (
        <section
          aria-label="복습 분포"
          className="relative overflow-hidden rounded-panel border border-line bg-surface"
        >
          <div
            aria-hidden
            className="absolute bottom-0 right-0 top-0 w-[268px] bg-rail"
          />
          <div className="relative grid grid-cols-[1fr_268px]">
            <div className="min-w-0 px-[20px] py-[16px]">
              <h2 className="pb-3 text-[13px] font-semibold">복습 분포</h2>
              <LoadBars bars={bars} cap={settings.dailyCap} />
              <p className="pt-3 text-[12px] leading-relaxed text-text-2">
                복습 항목을 목표 시점 범위 안에서만 조정해요. 목표 기억률인{' '}
                <span className="num">{percent(settings.targetRetention)}</span>는
                그대로 유지됩니다.
              </p>
            </div>

            <div className="rail-panel flex flex-col gap-[12px] px-[18px] py-[16px]">
              <span className="text-[11.5px] text-text-3">하루 분량</span>
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-text-3">가장 많은 날</span>
                <span className="num text-[13px]">
                  {busiest ? `${monthDay(busiest.date)} ` : ''}
                  {peak}개
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-text-3">하루 평균</span>
                <span className="num text-[13px]">{perDayAvg}개</span>
              </div>

            </div>
          </div>
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
  busiest: LoadBar | null,
  dailyCap: number | null,
  goal: GoalRow
): string {
  if (count === 0) {
    return '아직 이 목표에 묶인 항목이 없어요. 오늘 화면에서 적고 이 목표에 넣어보세요.'
  }
  if (!goal.ready_at) {
    return `${count}개를 마감 없이 계속 볼 수 있게 잡아뒀어요. 잊을 만할 때마다 올라옵니다.`
  }

  const parts = [`목표한 날까지 ${totalReviews}번 볼 수 있게 잡아뒀어요.`]
  if (atRisk > 0) {
    parts.push(`한 번으로 모자란 ${atRisk}개는 두 번씩 잡았습니다.`)
  }
  if (overdue > 0) {
    parts.push(`밀린 ${overdue}개는 다시 계산해서 앞으로 당겼어요.`)
  }
  if (busiest && busiest.count > 0) {
    parts.push(
      `가장 몰리는 날은 ${monthDay(busiest.date)} ${busiest.count}개입니다.`
    )
    if (dailyCap !== null && busiest.count > dailyCap) {
      parts.push(
        `하루 상한 ${dailyCap}개를 넘지만, 목표한 날 전에 다 보려면 이만큼은 잡아야 해요.`
      )
    }
  }
  return parts.join(' ')
}
