import type { Grade } from '../../core/fsrs/types'
import type { Horizon } from '../../core/horizon/horizon'
import { initialSchedule, type Intensity } from '../../core/policy/constraints'
import { projectItem } from '../../core/simulate/project'
import type { GoalRow, ItemRow } from '../../db/types'
import { diffDays, type DateOnly } from '../../lib/date'
import { effectiveConfig, horizonFields } from '../../lib/domain'
import { monthDay } from '../../lib/format'
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
  // 마지막 날까지의 길이. 점을 이 위에 비율로 찍는다.
  const span = dates.length > 0 ? Math.max(1, diffDays(today, dates[dates.length - 1])) : 1

  return (
    <aside
      aria-label="이렇게 잡힐 거예요"
      className="rail-panel flex flex-col gap-[14px] px-[18px] py-[14px]"
    >
      <span className="text-[11.5px] text-text-3">이렇게 잡힐 거예요</span>

      <div className="flex flex-col gap-[1px]">
        <span className="text-[11.5px] text-text-3">앞으로 보게 될 횟수</span>
        <span className="font-display num text-[34px] font-semibold leading-none tracking-[-0.02em]">
          {dates.length}번
        </span>
      </div>

      {dates.length > 0 ? (
        <>
          <div className="h-px bg-line" />

          <div className="flex flex-col gap-[9px]">
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

            {/*
              날짜만 늘어놓으면 간격이 어떻게 벌어지는지가 안 읽힌다.
              처음엔 촘촘하다가 뒤로 갈수록 뜸해지는 게 이 앱이 하는 일이다.
            */}
            <div className="relative h-[13px]" aria-hidden>
              <div className="absolute inset-x-0 top-[6px] h-px bg-line-2" />
              <span className="absolute left-0 top-[3px] h-[7px] w-[2px] rounded-full bg-text-3" />
              {dates.map((date) => (
                <span
                  key={date}
                  className="absolute top-[3px] h-[7px] w-[7px] -translate-x-1/2 rounded-full border-2 border-rail bg-accent"
                  style={{
                    left: `calc(${(diffDays(today, date) / span) * 100}% + ${
                      (0.5 - diffDays(today, date) / span) * 7
                    }px)`,
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10.5px] text-text-3">
              <span>오늘</span>
              <span className="num">{monthDay(dates[dates.length - 1])}</span>
            </div>
          </div>
        </>
      ) : null}
    </aside>
  )
}
