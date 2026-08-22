import { useState } from 'react'
import type { Horizon } from '../../core/horizon/horizon'
import { INTENSITY_RETENTION, type Intensity } from '../../core/policy/constraints'
import { Chip, Hint } from '../../components/Chip'
import type { GoalRow } from '../../db/types'
import { cn } from '../../lib/cn'
import { addDays, isDateOnly, type DateOnly } from '../../lib/date'
import { horizonLabel, monthDay } from '../../lib/format'
import type { Settings } from '../../lib/settings'
import type { NewItemDraft } from '../../store/planner'
import { HorizonPicker } from './HorizonPicker'

const INTENSITY_META: { key: Intensity; name: string; desc: string }[] = [
  { key: 'easy', name: '여유', desc: '가끔만 볼게요' },
  { key: 'standard', name: '표준', desc: '알맞게 볼게요' },
  { key: 'focus', name: '집중', desc: '자주 볼게요' },
  { key: 'max', name: '최대', desc: '아주 자주 볼게요' },
]

export interface QuickAddProps {
  today: DateOnly
  goals: GoalRow[]
  settings: Settings
  lastTitle: string | null
  onAdd: (draft: NewItemDraft) => void
}

/**
 * 한 줄 적기.
 *
 * 매일 하는 행동이라 마찰이 0에 가까워야 한다. 제목만 치고 Enter 를 누르면 끝나고,
 * 나머지는 마지막에 쓴 설정을 그대로 물려받는다.
 */
export function QuickAdd({
  today,
  goals,
  settings,
  lastTitle,
  onAdd,
}: QuickAddProps) {
  const [title, setTitle] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [goalId, setGoalId] = useState<string | null>(settings.lastGoalId)
  const [firstStudiedAt, setFirstStudiedAt] = useState<DateOnly>(today)
  const [dateTouched, setDateTouched] = useState(false)
  const [horizon, setHorizon] = useState<Horizon | null>(null)
  const [intensity, setIntensity] = useState<Intensity | null>(null)
  const [memo, setMemo] = useState('')

  function reset() {
    setTitle('')
    setMemo('')
    setDetailOpen(false)
    setFirstStudiedAt(today)
    setDateTouched(false)
    setHorizon(null)
    setIntensity(null)
  }

  function submit() {
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd({
      title: trimmed,
      memo,
      goalId,
      firstStudiedAt,
      horizon,
      intensity,
    })
    reset()
  }

  const selectedGoal = goals.find((g) => g.id === goalId) ?? null
  const yesterday = addDays(today, -1)

  return (
    <div className="rounded-card border border-dashed border-line-2">
      <div className="flex h-[52px] items-center gap-3 pl-[14px] pr-[18px]">
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
            if (event.key === 'Enter' && event.altKey) {
              event.preventDefault()
              setDetailOpen((open) => !open)
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              if (detailOpen) setDetailOpen(false)
              else reset()
              return
            }
            if (
              event.key === 'ArrowUp' &&
              title === '' &&
              lastTitle !== null
            ) {
              event.preventDefault()
              setTitle(lastTitle)
            }
          }}
          placeholder="예: 4장 연습문제 1번에서 10번"
          aria-label="새 항목 제목"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-3"
        />
        <button
          type="button"
          onClick={() => setDetailOpen((open) => !open)}
          className="flex-none rounded-ctl px-[9px] py-[5px] text-[12px] text-text-3 hover:bg-hover"
        >
          상세 설정 <span className="num">⌥⏎</span>
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={title.trim() === ''}
          className="flex-none rounded-ctl bg-accent px-[12px] py-[6px] text-[12.5px] font-semibold text-white disabled:opacity-35"
        >
          적어두기 <span className="num">⏎</span>
        </button>
      </div>

      {detailOpen ? (
        <div className="flex flex-col gap-[14px] border-t border-line px-[18px] py-[14px] pl-[40px]">
          <Field label="처음 공부한 날">
            <div className="flex flex-wrap items-center gap-[6px]">
              <Chip
                active={!dateTouched && firstStudiedAt === today}
                onClick={() => {
                  setFirstStudiedAt(today)
                  setDateTouched(false)
                }}
              >
                오늘
              </Chip>
              <Chip
                active={!dateTouched && firstStudiedAt === yesterday}
                onClick={() => {
                  setFirstStudiedAt(yesterday)
                  setDateTouched(false)
                }}
              >
                어제
              </Chip>
              <label
                className={cn(
                  'flex items-center gap-1 rounded-ctl border px-[10px] py-[6px] text-[13px]',
                  dateTouched
                    ? 'border-accent bg-accent-soft font-semibold text-accent'
                    : 'border-line-2 bg-surface text-text-2'
                )}
              >
                <span>
                  {dateTouched ? monthDay(firstStudiedAt) : '다른 날'} ▾
                </span>
                <input
                  type="date"
                  max={today}
                  value={firstStudiedAt}
                  aria-label="처음 공부한 날 고르기"
                  onChange={(event) => {
                    if (!isDateOnly(event.target.value)) return
                    setFirstStudiedAt(event.target.value)
                    setDateTouched(true)
                  }}
                  className="w-[18px] bg-transparent text-transparent outline-none"
                />
              </label>
            </div>
          </Field>

          <Field
            label="소속 목표"
            hint="같은 목표에 넣으면 목표 시점과 강도를 한 번만 정하면 돼요. 목표한 날이 바뀌어도 여기만 고치면 됩니다."
          >
            <div className="flex flex-wrap gap-[6px]">
              <Chip active={goalId === null} onClick={() => setGoalId(null)}>
                없음
              </Chip>
              {goals.map((goal) => (
                <Chip
                  key={goal.id}
                  active={goalId === goal.id}
                  onClick={() => setGoalId(goal.id)}
                  title={horizonLabel(
                    goal.horizon_kind,
                    goal.ready_at,
                    goal.hold_until
                  )}
                >
                  {goal.name}
                </Chip>
              ))}
            </div>
          </Field>

          <Field
            label="목표 시점"
            hint={
              selectedGoal && horizon === null
                ? '비워두면 목표 설정을 그대로 따릅니다.'
                : undefined
            }
          >
            <HorizonPicker
              today={today}
              uncertainty={settings.uncertainty}
              value={horizon ?? { kind: 'open' }}
              onChange={setHorizon}
            />
          </Field>

          <Field label="복습 강도">
            <div className="flex flex-wrap gap-[6px]">
              {INTENSITY_META.map((meta) => (
                <Chip
                  key={meta.key}
                  active={
                    (intensity ?? selectedGoal?.intensity ??
                      settings.defaultIntensity) === meta.key
                  }
                  onClick={() => setIntensity(meta.key)}
                  title={`${meta.desc} (기억률 ${Math.round(
                    INTENSITY_RETENTION[meta.key] * 100
                  )}% 기준)`}
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

          <p className="text-[12px] text-text-3">
            한 항목은 20분에서 40분에 훑을 분량이 적당해요.
          </p>
        </div>
      ) : (
        <p className="border-t border-line px-[18px] py-[9px] pl-[40px] text-[12px] text-text-3">
          제목만 치고 Enter 를 누르면 끝입니다. 나머지는 마지막에 쓴 목표 설정을
          그대로 씁니다.
        </p>
      )}
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
