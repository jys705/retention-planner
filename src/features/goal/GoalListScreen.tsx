import { useState } from 'react'
import {
  lastReviewDay,
  resolveHorizon,
  type Horizon,
} from '../../core/horizon/horizon'
import { INTENSITY_RETENTION } from '../../core/policy/constraints'
import { Chip, ChipLabel } from '../../components/Chip'
import { NumText } from '../../components/NumText'
import type { GoalRow, Intensity } from '../../db/types'
import { toEpochDay } from '../../lib/date'
import { isActive } from '../../lib/domain'
import { horizonLabel, percent } from '../../lib/format'
import {
  averageRetentionOn,
  goalEndDay,
  goalEnded,
  goalTimeLabel,
} from '../../lib/lifecycle'
import { INTENSITY_META } from '../../lib/intensity'
import { usePlanner } from '../../store/planner'
import { HorizonPicker } from '../newitem/HorizonPicker'

export function GoalListScreen({
  onOpenGoal,
}: {
  onOpenGoal: (id: string) => void
}) {
  const { goals, items, reviews, settings, today } = usePlanner()
  const createGoal = usePlanner((s) => s.createGoal)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [horizon, setHorizon] = useState<Horizon>({ kind: 'open' })
  const [intensity, setIntensity] = useState<Intensity>(settings.defaultIntensity)

  const live = goals.filter((g) => g.archived_at === null)
  // 끝난 목표는 아래 칸으로 내린다. 지울 때까지 기록으로 남는다.
  const active = live.filter((g) => !goalEnded(g, today))
  const finished = live
    .filter((g) => goalEnded(g, today))
    .sort((a, b) =>
      (goalEndDay(a) ?? '') > (goalEndDay(b) ?? '') ? -1 : 1
    )

  // 오늘을 목표한 날로 잡고 그날을 비워 두면 이 목표로는 볼 날이 하루도 없다.
  // 폼을 열어 둔 채 날이 바뀌면 고른 날짜가 어제가 된다. 그건 지난 날이라고 말한다.
  const noDayLeft = lastReviewDay(horizon) < toEpochDay(today)
  const pastDate = resolveHorizon(horizon).holdUntil < toEpochDay(today)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed || noDayLeft) return
    const goal = await createGoal({ name: trimmed, horizon, intensity })
    setName('')
    setHorizon({ kind: 'open' })
    setIntensity(settings.defaultIntensity)
    setCreating(false)
    onOpenGoal(goal.id)
  }

  return (
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-4 px-6 pb-7 pt-10">
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
            placeholder="예: 자격증 시험"
            aria-label="목표 이름"
            className="w-full rounded-ctl border border-line-2 bg-surface px-[10px] py-[7px] text-[14px] outline-none"
          />
          <div className="flex flex-col gap-[6px]">
            <span className="text-[12px] font-medium text-text-2">목표 시점</span>
            <HorizonPicker
              today={today}
              uncertainty={settings.uncertainty}
              value={horizon}
              restChoice={settings.postGoalMode === 'archive'}
              onChange={setHorizon}
            />
          </div>
          <div className="flex flex-col gap-[6px]">
            <span className="text-[12px] font-medium text-text-2">복습 강도</span>
            <div className="flex flex-wrap gap-[6px]">
              {INTENSITY_META.map((meta) => (
                <Chip
                  key={meta.key}
                  active={intensity === meta.key}
                  onClick={() => setIntensity(meta.key)}
                  title={`${meta.desc} (기억률 ${Math.round(
                    INTENSITY_RETENTION[meta.key] * 100
                  )}% 기준)`}
                >
                  {meta.name}
                </Chip>
              ))}
            </div>
            {/*
              강도가 목표한 날의 기억을 정한다고 여기면 높은 쪽을 고르게 된다. 그날의
              기억률은 어느 강도든 지키고, 강도는 그 전까지의 횟수만 바꾼다.
            */}
            <p className="text-pretty break-keep text-[11.5px] leading-relaxed text-text-3">
              이 목표에 넣은 항목을 얼마나 자주 볼지예요. 어느 강도를 골라도 목표한
              날 목표 기억률은 지키도록 잡고, 높을수록 그 전까지 더 자주 볼 뿐이에요.
              나중에 목표 화면에서 바꿀 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={name.trim() === '' || noDayLeft}
              className="rounded-ctl bg-accent px-[14px] py-[7px] text-[13px] font-semibold text-white disabled:opacity-35"
            >
              만들기
            </button>
            {noDayLeft ? (
              <span className="text-[12px] text-text-3">
                {pastDate
                  ? '이미 지난 날이에요. 오늘이나 그 뒤를 고르세요.'
                  : '오늘을 비워 두면 볼 날이 없어요. 내일이나 그 뒤를 고르세요.'}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {active.length === 0 && !creating ? (
        <div className="rounded-card border border-line bg-surface px-[18px] py-[22px]">
          <p className="text-[15px] font-medium">
            {finished.length > 0 ? '진행 중인 목표가 없어요.' : '아직 목표가 없어요.'}
          </p>
          <p className="pt-1 text-[13px] text-text-2">
            {finished.length > 0
              ? '새 시험이나 큰 주제가 생기면 목표로 묶어보세요. 마친 목표는 아래에 남아 있어요.'
              : '시험이나 큰 주제가 있으면 목표로 묶어보세요. 날짜를 한 번만 정하면 묶인 항목이 전부 그 날짜에 맞춰 잡힙니다.'}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {active.map((goal) => {
          const mine = items.filter((i) => i.goal_id === goal.id && isActive(i))
          const atRisk = mine.filter((i) => i.goal_risk === 'at_risk').length
          return (
            <GoalLine
              key={goal.id}
              goal={goal}
              sub={horizonLabel(goal.horizon_kind, goal.ready_at, goal.hold_until)}
              onOpen={() => onOpenGoal(goal.id)}
            >
              {atRisk > 0 ? <ChipLabel>{`부족 ${atRisk}개`}</ChipLabel> : null}
              <span className="num text-[12.5px] text-text-2">{mine.length}개</span>
              <span className="w-[110px] text-right text-[12px] text-text-3">
                <NumText text={goalTimeLabel(goal, today)} />
              </span>
            </GoalLine>
          )
        })}
      </div>

      {finished.length > 0 ? (
        <section aria-label="마친 목표" className="flex flex-col gap-2 pt-3">
          <div className="flex items-baseline gap-[9px]">
            <h2 className="text-[13px] font-semibold">마친 목표</h2>
            <span className="num text-[12px] text-text-3">{finished.length}개</span>
            <span className="text-[12px] text-text-3">
              목표 시점이 지나 항목을 보관해 둔 목표예요. 오늘과 예보에는 안 올라옵니다.
            </span>
          </div>
          {finished.map((goal) => {
            // 보관한 것까지 센다. 살아 있는 것만 세면 마친 목표는 전부 '0개' 다.
            const members = items.filter((i) => i.goal_id === goal.id)
            const end = goalEndDay(goal)
            const result = end ? averageRetentionOn(members, reviews, end) : null
            return (
              <GoalLine
                key={goal.id}
                goal={goal}
                sub={goalTimeLabel(goal, today)}
                onOpen={() => onOpenGoal(goal.id)}
              >
                <span className="num text-[12.5px] text-text-2">
                  {members.length}개
                </span>
                <span className="w-[110px] text-right text-[12px] text-text-3">
                  <NumText
                    text={result === null ? '결과 없음' : `목표한 날 ${percent(result)}`}
                  />
                </span>
              </GoalLine>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}

/** 목표 한 줄. 진행 중인 것과 마친 것이 같은 꼴을 쓰고 오른쪽 칸만 다르다. */
function GoalLine({
  goal,
  sub,
  onOpen,
  children,
}: {
  goal: GoalRow
  sub: string
  onOpen: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-3 rounded-card border border-line bg-surface px-[16px] py-[12px] text-left hover:bg-hover"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{goal.name}</div>
        <div className="pt-[2px] text-[11.5px] text-text-3">
          <NumText text={sub} />
        </div>
      </div>
      {children}
    </button>
  )
}
