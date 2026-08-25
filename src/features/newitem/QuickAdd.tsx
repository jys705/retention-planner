import { useState } from 'react'
import type { Grade } from '../../core/fsrs/types'
import type { Horizon } from '../../core/horizon/horizon'
import {
  DEFAULT_INITIAL_GRADE,
  type Intensity,
} from '../../core/policy/constraints'
import { Chip, Hint } from '../../components/Chip'
import { OptionCards } from '../../components/OptionCards'
import { SelectField } from '../../components/SelectField'
import { DateField } from '../../components/DateField'
import type { GoalRow } from '../../db/types'
import { GoalSettingsReadout } from '../goal/GoalSettingsReadout'
import { addDays, type DateOnly } from '../../lib/date'
import { goalColor } from '../../lib/domain'
import { horizonLabel, monthDay } from '../../lib/format'
import { GRADE_META } from '../../lib/grade'
import { INTENSITY_META, intensityName } from '../../lib/intensity'
import type { Settings } from '../../lib/settings'
import type { NewItemDraft } from '../../store/planner'
import { HorizonPicker } from './HorizonPicker'
import { PlanPreview } from './PlanPreview'

export interface QuickAddProps {
  today: DateOnly
  goals: GoalRow[]
  settings: Settings
  /** 상세 설정이 펼쳐졌는지. 카드 밖 안내문이 이 값을 같이 본다. */
  detailOpen: boolean
  onDetailOpenChange: (open: boolean) => void
  onAdd: (draft: NewItemDraft) => void
}

/**
 * 한 줄 적기.
 *
 * 매일 하는 행동이라 마찰이 0에 가까워야 한다. 제목만 치고 Enter 를 누르면 끝난다.
 */
export function QuickAdd({
  today,
  goals,
  settings,
  detailOpen,
  onDetailOpenChange: setDetailOpen,
  onAdd,
}: QuickAddProps) {
  const [title, setTitle] = useState('')
  const [goalId, setGoalId] = useState<string | null>(null)
  const [firstStudiedAt, setFirstStudiedAt] = useState<DateOnly>(today)
  const [horizon, setHorizon] = useState<Horizon | null>(null)
  const [intensity, setIntensity] = useState<Intensity | null>(null)
  const [initialGrade, setInitialGrade] = useState<Grade>(DEFAULT_INITIAL_GRADE)
  const [memo, setMemo] = useState('')

  function reset() {
    setTitle('')
    setMemo('')
    setDetailOpen(false)
    // 직전에 쓴 설정을 다음 항목에 물려주지 않는다. 늘 같은 자리에서 시작한다.
    setGoalId(null)
    setFirstStudiedAt(today)
    setHorizon(null)
    setIntensity(null)
    setInitialGrade(DEFAULT_INITIAL_GRADE)
  }

  function submit() {
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd({
      title: trimmed,
      memo,
      goalId,
      firstStudiedAt,
      // 목표에 넣은 항목은 제 값을 갖지 않는다. 목표를 고치면 이 항목도 따라와야 한다.
      horizon: goalId === null ? horizon : null,
      intensity: goalId === null ? intensity : null,
      initialGrade,
    })
    reset()
  }

  const selectedGoal = goals.find((g) => g.id === goalId) ?? null
  const yesterday = addDays(today, -1)
  // 칩이 켜졌는지는 따로 기억하지 않고 고른 날에서 끌어낸다. 달력으로 오늘을 골랐는데
  // '오늘' 칩이 꺼져 있는 식으로 두 표시가 어긋나지 않는다.
  const pickedOther =
    firstStudiedAt !== today && firstStudiedAt !== yesterday
  const backdated = firstStudiedAt !== today

  return (
    // 겉껍데기는 오늘 화면이 준다. 여기서는 목록 카드의 마지막 줄로만 그린다.
    <div>
      <div className="flex h-[54px] items-center gap-3 pl-[14px] pr-[14px]">
        <span
          aria-hidden
          className="flex h-[17px] w-[17px] flex-none items-center justify-center text-[15px] text-text-3"
        >
          +
        </span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
              return
            }
          }}
          placeholder="예: 4장 연습문제 1번에서 10번"
          aria-label="새 항목 제목"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-3"
        />
        <button
          type="button"
          onClick={() => setDetailOpen(!detailOpen)}
          className="flex-none rounded-ctl px-[9px] py-[5px] text-[12px] text-text-3 hover:bg-hover"
        >
          상세 설정
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={title.trim() === ''}
          className="flex-none rounded-ctl bg-accent px-[12px] py-[6px] text-[12.5px] font-semibold text-white disabled:opacity-35"
        >
          적어두기
        </button>
      </div>

      {detailOpen ? (
        <div className="grid grid-cols-[1fr_268px] border-t border-line">
          <div className="flex flex-col gap-[14px] py-[14px] pl-[43px] pr-[20px]">
            <Field label="공부한 날">
              <div className="flex flex-wrap items-center gap-[6px]">
                <Chip
                  active={firstStudiedAt === today}
                  onClick={() => setFirstStudiedAt(today)}
                >
                  오늘
                </Chip>
                <Chip
                  active={firstStudiedAt === yesterday}
                  onClick={() => setFirstStudiedAt(yesterday)}
                >
                  어제
                </Chip>
                <DateField
                  value={firstStudiedAt}
                  today={today}
                  max={today}
                  onChange={setFirstStudiedAt}
                  label="공부한 날 고르기"
                  text={pickedOther ? monthDay(firstStudiedAt) : '다른 날'}
                  active={pickedOther}
                />
              </div>
            </Field>

            {/* 목표가 하나도 없으면 고를 것이 '없음' 뿐이다. 그 칸은 안 보여준다. */}
            {goals.length > 0 ? (
              <Field
                label="소속 목표"
                hint="목표에 넣으면 목표 시점과 강도를 목표에서 한 번만 정하면 돼요. 없음을 고르면 이 항목만의 설정을 여기서 정합니다."
              >
                <SelectField
                  label="소속 목표"
                  value={goalId}
                  onChange={setGoalId}
                  options={[
                    { value: null, label: '없음' },
                    ...goals.map((goal, index) => ({
                      value: goal.id,
                      label: goal.name,
                      dot: goalColor(goal, index),
                      note: horizonLabel(
                        goal.horizon_kind,
                        goal.ready_at,
                        goal.hold_until
                      ),
                    })),
                  ]}
                />
              </Field>
            ) : null}

            {selectedGoal ? (
              <Field label="목표 시점과 복습 강도">
                <GoalSettingsReadout goal={selectedGoal} />
              </Field>
            ) : (
              <>
                <Field label="목표 시점">
                  <HorizonPicker
                    today={today}
                    uncertainty={settings.uncertainty}
                    value={horizon ?? { kind: 'open' }}
                    onChange={setHorizon}
                  />
                </Field>

                <Field
                  label="복습 강도"
                  aside={`기본값 ${intensityName(settings.defaultIntensity)}`}
                >
                  <OptionCards
                    label="복습 강도"
                    value={intensity ?? settings.defaultIntensity}
                    options={INTENSITY_META.map((meta) => ({
                      key: meta.key,
                      name: meta.name,
                      desc: meta.desc,
                    }))}
                    onChange={setIntensity}
                  />
                </Field>
              </>
            )}

            <Field
                label={backdated ? '그날 얼마나 기억났나요?' : '오늘 어땠나요?'}
                hint="이 등급이 다음 복습일을 계산하는 출발점이에요. 어려웠으면 더 일찍 올라옵니다."
              >
                <div className="flex flex-wrap gap-[6px]">
                  {GRADE_META.map((meta) => (
                    <Chip
                      key={meta.grade}
                      active={initialGrade === meta.grade}
                      onClick={() => setInitialGrade(meta.grade)}
                      title={meta.hint}
                    >
                      {meta.name}
                    </Chip>
                  ))}
                </div>
            </Field>

            <Field label="메모 (선택)">
              <input
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="3, 7번 틀림"
                className="w-full rounded-ctl border border-line-2 bg-surface px-[10px] py-[6px] text-[13px] outline-none"
              />
            </Field>
          </div>

          <PlanPreview
            today={today}
            goal={selectedGoal}
            settings={settings}
            firstStudiedAt={firstStudiedAt}
            horizon={horizon}
            intensity={intensity}
            initialGrade={initialGrade}
          />
        </div>
      ) : null}
    </div>
  )
}

/** 카드 밖에 한 줄로 두는 안내. */
export function QuickAddHint({ detailOpen }: { detailOpen: boolean }) {
  return (
    <p className="px-[18px] pt-[10px] text-[12px] text-text-3">
      {detailOpen
        ? '한 항목은 20분에서 40분에 훑을 분량이 적당해요.'
        : '제목만 치고 Enter 를 누르면 끝입니다. 목표에 넣거나 날짜를 바꾸려면 상세 설정을 펼치세요.'}
    </p>
  )
}

function Field({
  label,
  hint,
  aside,
  children,
}: {
  label: string
  hint?: string | undefined
  /** 이름 줄 오른쪽 끝에 작게 붙는 말. 기본값이 무엇인지 같은 것. */
  aside?: string | undefined
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-center gap-[5px]">
        <span className="text-[12px] font-medium text-text-2">{label}</span>
        {hint ? <Hint text={hint} /> : null}
        {aside ? (
          <span className="ml-auto text-[11.5px] text-text-3">{aside}</span>
        ) : null}
      </div>
      {children}
    </div>
  )
}
