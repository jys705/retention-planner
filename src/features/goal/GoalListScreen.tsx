import { useState } from 'react'
import type { Horizon } from '../../core/horizon/horizon'
import { ChipLabel } from '../../components/Chip'
import { isActive } from '../../lib/domain'
import { daysLeftLabel, horizonLabel } from '../../lib/format'
import { usePlanner } from '../../store/planner'
import { HorizonPicker } from '../newitem/HorizonPicker'

export function GoalListScreen({
  onOpenGoal,
}: {
  onOpenGoal: (id: string) => void
}) {
  const { goals, items, settings, today } = usePlanner()
  const createGoal = usePlanner((s) => s.createGoal)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [horizon, setHorizon] = useState<Horizon>({ kind: 'open' })

  const active = goals.filter((g) => g.archived_at === null)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    const goal = await createGoal({ name: trimmed, horizon })
    setName('')
    setHorizon({ kind: 'open' })
    setCreating(false)
    onOpenGoal(goal.id)
  }

  return (
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-4 px-6 py-7">
      <header className="flex items-end justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[22px] font-semibold">목표</h1>
          <span className="num text-[13px] text-text-3">{active.length}개</span>
        </div>
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="rounded-ctl bg-accent px-[12px] py-[6px] text-[12.5px] font-semibold text-white"
        >
          {creating ? '취소' : '목표 만들기'}
        </button>
      </header>

      <p className="text-[13px] leading-relaxed text-text-2">
        목표는 폴더가 아니라 설정 묶음이에요. 같은 목표에 넣으면 목표 시점과 강도를
        한 번만 정하면 되고, 날짜가 바뀌어도 여기만 고치면 항목 전부가 따라옵니다.
      </p>

      {creating ? (
        <div className="flex flex-col gap-4 rounded-card border border-line bg-surface px-[16px] py-[14px]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
            }}
            placeholder="예: AWS SCS-C03"
            aria-label="목표 이름"
            className="w-full rounded-ctl border border-line-2 bg-surface px-[10px] py-[7px] text-[14px] outline-none"
          />
          <div className="flex flex-col gap-[6px]">
            <span className="text-[12px] font-medium text-text-2">목표 시점</span>
            <HorizonPicker
              today={today}
              uncertainty={settings.uncertainty}
              value={horizon}
              onChange={setHorizon}
            />
          </div>
          <div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={name.trim() === ''}
              className="rounded-ctl bg-accent px-[14px] py-[7px] text-[13px] font-semibold text-white disabled:opacity-35"
            >
              만들기
            </button>
          </div>
        </div>
      ) : null}

      {active.length === 0 && !creating ? (
        <div className="rounded-card border border-line bg-surface px-[18px] py-[22px]">
          <p className="text-[15px] font-medium">아직 목표가 없어요.</p>
          <p className="pt-1 text-[13px] text-text-2">
            시험이나 큰 주제가 있으면 목표로 묶어보세요. 날짜를 한 번만 정하면
            묶인 항목이 전부 그 날짜에 맞춰 잡힙니다.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {active.map((goal) => {
          const count = items.filter(
            (i) => i.goal_id === goal.id && isActive(i)
          ).length
          const atRisk = items.filter(
            (i) => i.goal_id === goal.id && i.goal_risk === 'at_risk'
          ).length
          return (
            <button
              key={goal.id}
              type="button"
              onClick={() => onOpenGoal(goal.id)}
              className="flex items-center gap-3 rounded-card border border-line bg-surface px-[16px] py-[12px] text-left hover:bg-hover"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">
                  {goal.name}
                </div>
                <div className="num pt-[2px] text-[11.5px] text-text-3">
                  {horizonLabel(goal.horizon_kind, goal.ready_at, goal.hold_until)}
                </div>
              </div>
              {atRisk > 0 ? <ChipLabel>{`부족 ${atRisk}개`}</ChipLabel> : null}
              <span className="num text-[12.5px] text-text-2">{count}개</span>
              {goal.ready_at ? (
                <span className="num w-[76px] text-right text-[12px] text-text-3">
                  {daysLeftLabel(today, goal.ready_at)}
                </span>
              ) : (
                <span className="w-[76px] text-right text-[12px] text-text-3">
                  기한 없음
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
