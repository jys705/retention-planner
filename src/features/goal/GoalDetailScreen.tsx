import { useState } from 'react'
import { defaultFsrs } from '../../core/fsrs/fsrs6'
import type { Horizon } from '../../core/horizon/horizon'
import { INTENSITY_RETENTION } from '../../core/policy/constraints'
import { Badge } from '../../components/Badge'
import { Chip, Hint } from '../../components/Chip'
import { Expand } from '../../components/Expand'
import type { GoalRow } from '../../db/types'
import { statusBadgeOf } from '../../lib/badge'
import { addDays, diffDays, maxDate, toEpochDay, type DateOnly } from '../../lib/date'
import { effectiveConfig, isActive, memoryStateOf } from '../../lib/domain'
import {
  daysLeftLabel,
  dueLabel,
  horizonLabel,
  percent,
} from '../../lib/format'
import { INTENSITY_META } from '../../lib/intensity'
import { spreadPreview, usePlanner } from '../../store/planner'
import type { SpreadResult } from '../../core/spread/assign'
import { LoadBars, type LoadBar } from '../charts/LoadBars'
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
  const { items, goals, settings, today, planned } = usePlanner()
  const updateGoal = usePlanner((s) => s.updateGoal)
  const deleteGoal = usePlanner((s) => s.deleteGoal)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [showBefore, setShowBefore] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [draftName, setDraftName] = useState<string | null>(null)

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

  const avgAtGoal =
    rows.length === 0
      ? 0
      : rows.reduce((sum, r) => sum + r.retentionAtGoal, 0) / rows.length
  const atRisk = rows.filter((r) => r.item.goal_risk === 'at_risk').length
  // 화면이 "두 번 잡아두었다" 고 말하려면 실제로 두 날짜가 있어야 한다.
  const doubleBooked = rows.filter(
    (r) => planned.filter((p) => p.item_id === r.item.id).length >= 2
  ).length

  const preview = goal.ready_at
    ? spreadPreview(items, goals, settings, today, goal.ready_at)
    : null
  const mineIds = new Set(mine.map((i) => i.id))
  const plannedDates = planned
    .filter((p) => mineIds.has(p.item_id))
    .map((p) => p.date)
  const bars = buildBars(plannedDates, preview, today, goal.ready_at)
  const peakAfter = Math.max(0, ...bars.map((b) => b.count))
  const peakBefore = preview?.peakBefore ?? peakAfter
  const scheduled = bars.reduce((sum, b) => sum + b.count, 0)
  const perDayAvg =
    bars.length === 0 ? 0 : Math.round((scheduled / bars.length) * 10) / 10

  return (
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-5 px-6 py-7">
      <header>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[22px] font-semibold">{goal.name}</h1>
          {goal.ready_at ? (
            <span className="num text-[13px] text-text-2">
              {daysLeftLabel(today, goal.ready_at)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <p className="num text-[12.5px] text-text-3">
            목표 시점:{' '}
            {horizonLabel(goal.horizon_kind, goal.ready_at, goal.hold_until)}
          </p>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-ctl border border-line-2 px-[10px] py-[5px] text-[12px] text-text-2 hover:bg-hover"
          >
            목표 삭제
          </button>
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

      <div className="rail-panel grid grid-cols-4 gap-3 rounded-card bg-rail px-[16px] py-[13px]">
        <Stat label="항목 수" value={`${rows.length}개`} />
        <Stat label="목표한 날 평균 기억률" value={percent(avgAtGoal)} />
        <Stat label="한 번으로 부족한 항목" value={`${atRisk}개`} />
        <Stat
          label="복습 강도"
          value={INTENSITY_META.find((m) => m.key === goal.intensity)?.name ?? '표준'}
        />
      </div>

      <p className="text-[13px] leading-relaxed text-text-2">
        {summarySentence(goal, rows.length, avgAtGoal, atRisk, doubleBooked, today)}
      </p>

      <Expand
        open={editOpen}
        onToggle={() => setEditOpen((o) => !o)}
        label="목표 편집"
        hint="이름, 목표 시점, 복습 강도를 여기서 고칩니다. 묶인 항목 전부에 적용돼요."
      >
        <div className="flex flex-col gap-4">
          <Field label="이름">
            <input
              value={draftName ?? goal.name}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => {
                const next = (draftName ?? '').trim()
                setDraftName(null)
                if (next !== '' && next !== goal.name) {
                  void updateGoal(goal.id, { name: next })
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') setDraftName(null)
              }}
              aria-label="목표 이름 고치기"
              className="w-full rounded-ctl border border-line-2 bg-surface px-[10px] py-[7px] text-[14px] outline-none"
            />
          </Field>

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
            <div className="flex flex-wrap gap-[6px]">
              {INTENSITY_META.map((meta) => (
                <Chip
                  key={meta.key}
                  active={goal.intensity === meta.key}
                  title={`${meta.desc} (기억률 ${Math.round(
                    INTENSITY_RETENTION[meta.key] * 100
                  )}% 기준)`}
                  onClick={() => void updateGoal(goal.id, { intensity: meta.key })}
                >
                  {meta.name}
                </Chip>
              ))}
            </div>
          </Field>

          <Expand
            open={advancedOpen}
            onToggle={() => setAdvancedOpen((o) => !o)}
            label="고급"
            hint="대부분 그대로 두시면 돼요."
          >
            <div className="flex flex-col gap-4">
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
      </Expand>

      <section className="rounded-card border border-line bg-surface px-[16px] py-[14px]">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-[13px] font-semibold">날짜 조정</h2>
          <label className="flex items-center gap-[6px] text-[12px] text-text-2">
            <input
              type="checkbox"
              checked={showBefore}
              onChange={(e) => setShowBefore(e.target.checked)}
            />
            조정 전과 비교
          </label>
        </div>
        <LoadBars bars={bars} cap={settings.dailyCap} showBefore={showBefore} />
        <p className="pt-3 text-[12px] text-text-2">
          {rows.length === 0
            ? '아직 이 목표에 묶인 항목이 없어요.'
            : peakBefore > peakAfter
              ? `가장 몰리는 날을 ${peakBefore}개에서 ${peakAfter}개로 줄였어요. 하루 평균 ${perDayAvg}개입니다.`
              : `가장 많은 날이 ${peakAfter}개, 하루 평균 ${perDayAvg}개예요.`}
        </p>
      </section>

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

function buildBars(
  plannedDates: readonly DateOnly[],
  preview: SpreadResult | null,
  today: DateOnly,
  readyAt: DateOnly | null
): LoadBar[] {
  const after = new Map<DateOnly, number>()
  for (const planned of plannedDates) {
    // 연체된 것은 오늘 칸에 얹는다. 지나간 날에 복습이 일어날 수는 없다.
    const date = planned < today ? today : planned
    after.set(date, (after.get(date) ?? 0) + 1)
  }

  const before = new Map<DateOnly, number>()
  for (const [date, count] of Object.entries(preview?.dailyLoadBefore ?? {})) {
    const key = date < today ? today : date
    before.set(key, (before.get(key) ?? 0) + count)
  }

  // 빈 날도 칸을 만들어야 분포가 제대로 읽힌다.
  const last = maxDate(
    readyAt ?? today,
    [...after.keys(), ...before.keys()].reduce(
      (a, b) => (toEpochDay(a) >= toEpochDay(b) ? a : b),
      today
    )
  )
  const span = Math.max(0, toEpochDay(last) - toEpochDay(today))

  const bars: LoadBar[] = []
  for (let i = 0; i <= span; i += 1) {
    const date = addDays(today, i)
    bars.push({
      date,
      count: after.get(date) ?? 0,
      before: before.get(date) ?? 0,
    })
  }
  return bars
}

function summarySentence(
  goal: GoalRow,
  count: number,
  avgAtGoal: number,
  atRisk: number,
  doubleBooked: number,
  today: DateOnly
): string {
  if (count === 0) return '아직 이 목표에 묶인 항목이 없어요.'
  if (goal.horizon_kind === 'open') {
    return `항목 ${count}개를 잊을 만할 때마다 올려드리고 있어요. 목표한 날이 없어서 준비 상태나 날짜 조정은 필요하지 않아요.`
  }
  const left = goal.ready_at ? daysLeftLabel(today, goal.ready_at) : ''
  const risk =
    doubleBooked > 0
      ? ` 다만 ${doubleBooked}개는 한 번 봐서는 모자라서 두 번 잡아두었어요.`
      : atRisk > 0
        ? ` 다만 ${atRisk}개는 한 번 봐서는 모자라요. 목표한 날 전에 한 번 더 잡아둡니다.`
        : ''
  return `${left}. 지금 속도면 목표한 날 평균 ${percent(
    avgAtGoal
  )}쯤 기억하고 있을 거예요.${risk}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[11px] text-text-3">{label}</span>
      <span className="num text-[16px] font-semibold">{value}</span>
    </div>
  )
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
