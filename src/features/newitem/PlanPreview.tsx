import type { Grade } from '../../core/fsrs/types'
import type { Horizon } from '../../core/horizon/horizon'
import { initialSchedule, type Intensity } from '../../core/policy/constraints'
import { projectItem } from '../../core/simulate/project'
import type { GoalRow, ItemRow } from '../../db/types'
import { diffDays, type DateOnly } from '../../lib/date'
import { effectiveConfig, horizonFields } from '../../lib/domain'
import { monthDay, weekday } from '../../lib/format'
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

/** 마감이 없을 때 내다볼 날수. 이보다 멀면 사람이 계획으로 안 읽는다. */
const OPEN_LOOKAHEAD = 120
/** 목표가 아무리 멀어도 여기까지만 센다. */
const MAX_LOOKAHEAD = 730
/** 줄을 몇 개까지 늘어놓을지. 넘치면 뒤는 한 줄로 접는다. */
const SHOWN = 7

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

  // 목표가 있으면 그날까지 몇 번인지가 답이다. 120일에서 끊으면 먼 목표일수록
  // 실제보다 적게 세어 놓고 '앞으로 N번' 이라고 말하게 된다.
  const fieldsOf = horizonFields(config.horizon)
  const until = fieldsOf.hold_until ?? fieldsOf.ready_at
  const lookahead = until
    ? Math.min(MAX_LOOKAHEAD, Math.max(1, diffDays(today, until)))
    : OPEN_LOOKAHEAD

  const future = projectItem({
    itemId: 'preview',
    state: initial.state,
    anchor: firstStudiedAt,
    due: initial.due,
    from: today,
    days: lookahead,
    horizon: config.horizon,
    intensity: config.intensity,
    targetRetention: config.targetRetention,
    minReviews: config.minReviews,
    repsSinceGoal: 1,
    bufferDays: settings.bufferDays,
    maxIntervalDays: config.maxIntervalDays,
  })

  const dates = future.map((f) => f.date)
  // 지난 날짜로 적으면 이미 볼 때가 지난 것이라 적자마자 오늘 목록에 오른다.
  // 적기 전에 알려야 "왜 바로 뜨지" 하고 놀라지 않는다.
  const dueNow = initial.due <= today
  // 각 복습이 그 앞의 복습에서 며칠 뒤인지. 첫 줄만 오늘을 기준으로 센다.
  const steps = dates.map((date, index) => ({
    date,
    gap: diffDays(index === 0 ? today : dates[index - 1], date),
  }))
  const shown = steps.slice(0, SHOWN)
  const rest = steps.length - shown.length
  // 막대는 가장 긴 간격을 꽉 찬 것으로 놓고 나머지를 그에 견준다.
  const longest = Math.max(1, ...steps.map((s) => s.gap))

  return (
    <aside
      aria-label="앞으로 보게 될 횟수"
      className="rail-panel flex flex-col gap-[12px] px-[18px] py-[14px]"
    >
      {/*
        큰 숫자 하나만 위에 얹으면 아래로 남는 빈 칸이 넓어서 붕 뜬다.
        왼쪽 칸이 '이름 + 고르는 것' 으로 흐르니 여기도 '이름 + 목록' 으로 맞춘다.
      */}
      <div className="flex flex-col gap-[5px]">
        <span className="text-[12px] font-medium text-text-2">
          {until ? '목표한 날까지' : '앞으로 넉 달 동안'}{' '}
          <span className="num">{dates.length}번</span> 보게 돼요
        </span>
        {dueNow ? (
          <span className="text-[11.5px] leading-relaxed text-imp-fg">
            공부한 날이 지나서 볼 때가 이미 됐어요. 적으면 바로 오늘 목록에
            올라옵니다.
          </span>
        ) : null}

          {/*
            날짜를 시간 축 위에 점으로 찍으면 초반 이삼일 간격이 왼쪽 끝에 뭉친다.
            한 줄에 하나씩 놓고 막대 길이로 간격을 보이면 몇 번이 되든 안 겹친다.
          */}
          <div className="flex flex-col gap-[1px]">
            {shown.map((step) => (
              <div
                key={step.date}
                className="relative flex h-[21px] items-center justify-between overflow-hidden rounded-[3px] px-[5px]"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-[3px] bg-accent-soft"
                  style={{
                    width: `${Math.max(11, (step.gap / longest) * 100)}%`,
                  }}
                />
                <span className="num relative text-[11.5px] text-text-2">
                  {monthDay(step.date)}
                  {/*
                    무슨 요일인지 알아야 그날 볼 수 있을지 가늠이 된다.
                    괄호까지 고정폭으로 찍으면 사이가 벌어져 보여서 본문 서체로 둔다.
                  */}
                  <span className="font-sans text-[11px] text-text-3">
                    {' '}
                    ({weekday(step.date)})
                  </span>
                </span>
                <span className="num relative text-[11px] text-text-3">
                  {step.gap}일 뒤
                </span>
              </div>
            ))}
            {rest > 0 ? (
              <span className="px-[5px] pt-[3px] text-[11px] text-text-3">
                외 {rest}번 더
              </span>
            ) : null}
          </div>
      </div>
    </aside>
  )
}
