import type { Grade } from '../../core/fsrs/types'
import type { Horizon } from '../../core/horizon/horizon'
import { initialSchedule, type Intensity } from '../../core/policy/constraints'
import { projectItem } from '../../core/simulate/project'
import type { GoalRow, ItemRow } from '../../db/types'
import type { DateOnly } from '../../lib/date'
import { effectiveConfig, horizonFields } from '../../lib/domain'
import { monthDay, percent } from '../../lib/format'
import type { Settings } from '../../lib/settings'

export interface PlanPreviewProps {
  today: DateOnly
  goal: GoalRow | null
  settings: Settings
  firstStudiedAt: DateOnly
  horizon: Horizon | null
  intensity: Intensity | null
  initialGrade: Grade
}

/** 내다볼 날수. 이보다 멀면 사람이 계획으로 안 읽는다. */
const LOOKAHEAD = 120
/** 날짜를 몇 개까지 늘어놓을지. 넘치면 뒤는 접는다. */
const SHOWN = 6

/**
 * 적기 전에 보여주는 미리보기.
 *
 * 목표 시점과 강도를 고르는 동안 그게 무슨 결과를 낳는지 안 보이면, 사용자는
 * 감으로 고르고 적은 뒤에야 확인하게 된다. 여기서 미리 실제 계산을 돌려 보여준다.
 */
export function PlanPreview({
  today,
  goal,
  settings,
  firstStudiedAt,
  horizon,
  intensity,
  initialGrade,
}: PlanPreviewProps) {
  // 저장될 모습 그대로 만들어서 실제 계산에 넣는다. 여기만 따로 셈하면 화면과 결과가 갈린다.
  const fields = horizonFields(horizon ?? { kind: 'open' })
  const draftRow = {
    goal_id: goal?.id ?? null,
    horizon_kind: goal ? null : fields.horizon_kind,
    ready_at: goal ? null : fields.ready_at,
    hold_until: goal ? null : fields.hold_until,
    target_retention: null,
    intensity: goal ? null : intensity,
    min_reviews: null,
    reps_since_goal: 1,
  } as unknown as ItemRow
  const config = effectiveConfig(draftRow, goal, settings)

  const initial = initialSchedule({
    firstStudiedAt,
    initialGrade,
    horizon: config.horizon,
    intensity: config.intensity,
    targetRetention: config.targetRetention,
    minReviews: config.minReviews,
    maxIntervalDays: config.maxIntervalDays,
    bufferDays: settings.bufferDays,
  })

  const future = projectItem({
    itemId: 'preview',
    state: initial.state,
    anchor: firstStudiedAt,
    due: initial.due,
    from: today,
    days: LOOKAHEAD,
    horizon: config.horizon,
    intensity: config.intensity,
    targetRetention: config.targetRetention,
    minReviews: config.minReviews,
    repsSinceGoal: 1,
    bufferDays: settings.bufferDays,
    maxIntervalDays: config.maxIntervalDays,
  })

  const dates = future.map((f) => f.date)
  const shown = dates.slice(0, SHOWN)
  const rest = dates.length - shown.length

  const resolved = config.horizon
  const readyAt = resolved.kind === 'open' ? null : horizonFields(resolved).ready_at
  const holdUntil =
    resolved.kind === 'open' ? null : horizonFields(resolved).hold_until

  return (
    <aside
      aria-label="이렇게 잡힐 거예요"
      className="rail-panel flex flex-col gap-[14px] px-[18px] py-[14px]"
    >
      <span className="text-[11.5px] text-text-3">이렇게 잡힐 거예요</span>

      <div className="flex flex-col gap-[2px]">
        {readyAt ? (
          <>
            <span className="num text-[15px] font-semibold">
              {monthDay(readyAt)}까지 준비
            </span>
            {holdUntil && holdUntil !== readyAt ? (
              <span className="num text-[12.5px] text-text-2">
                {monthDay(holdUntil)}까지 유지
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-[15px] font-semibold">마감 없이 계속</span>
        )}
      </div>

      <div className="h-px bg-line" />

      <div className="flex flex-col gap-[5px]">
        <span className="text-[12.5px] font-medium">
          {dates.length === 0
            ? '앞으로 볼 날이 없어요'
            : `앞으로 ${dates.length}번 보게 돼요`}
        </span>
        {shown.length > 0 ? (
          <span className="num flex flex-wrap gap-x-[6px] gap-y-[2px] text-[12px] leading-relaxed text-text-2">
            {shown.map((date, index) => (
              <span key={date} className="whitespace-nowrap">
                {monthDay(date)}
                {index < shown.length - 1 ? ',' : ''}
              </span>
            ))}
            {rest > 0 ? (
              <span className="whitespace-nowrap">외 {rest}번</span>
            ) : null}
          </span>
        ) : null}
        <span className="text-[11px] leading-relaxed text-text-3">
          다른 항목과 같은 날에 몰리면 하루씩 옮겨 잡을 수 있어요.
        </span>
      </div>

      <div className="h-px bg-line" />

      <div className="flex flex-col gap-[2px]">
        <span className="text-[11.5px] text-text-3">
          {readyAt ? '목표한 날 기억률' : '유지할 기억률'}
        </span>
        <span className="font-display num text-[28px] font-semibold leading-none tracking-[-0.02em]">
          {percent(config.targetRetention)}
        </span>
      </div>
    </aside>
  )
}
