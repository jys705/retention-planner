import type { GoalRow } from '../../db/types'
import { horizonLabel } from '../../lib/format'
import { intensityName } from '../../lib/intensity'

/**
 * 목표가 정해 둔 값을 읽기만 하게 보여준다.
 *
 * 항목이 목표에 속하면 목표 시점과 강도는 목표 것이다. 항목 쪽에서 고칠 수 있게 두면
 * 같은 값이 두 군데 있게 되고, 목표를 고쳤을 때 이 항목만 따라오지 않는다.
 * 그래서 여기서는 보여만 주고 고치는 자리는 목표 화면 한 곳으로 모은다.
 */
export function GoalSettingsReadout({ goal }: { goal: GoalRow }) {
  return (
    <div className="flex flex-col gap-[7px] rounded-card bg-rail px-[13px] py-[11px]">
      <Line label="목표" value={goal.name} plain />
      <Line
        label="목표 시점"
        value={horizonLabel(goal.horizon_kind, goal.ready_at, goal.hold_until)}
      />
      <Line label="복습 강도" value={intensityName(goal.intensity)} />
      <Line label="최소 복습 횟수" value={`${goal.min_reviews}번`} />
      <p className="pt-[2px] text-[11.5px] leading-relaxed text-text-3">
        이 목표가 정한 값이에요. 바꾸려면 목표 화면에서 고치세요. 거기서 바꾸면 이
        목표에 묶인 항목 전부에 함께 적용됩니다.
      </p>
    </div>
  )
}

function Line({
  label,
  value,
  plain = false,
}: {
  label: string
  value: string
  /** 이름처럼 숫자가 아닌 값. 고정폭으로 찍으면 글자 사이가 벌어져 보인다. */
  plain?: boolean
}) {
  return (
    <div className="flex items-baseline gap-2 text-[12.5px]">
      <span className="w-[84px] flex-none text-text-3">{label}</span>
      <span className={plain ? 'text-text-2' : 'num text-text-2'}>{value}</span>
    </div>
  )
}
