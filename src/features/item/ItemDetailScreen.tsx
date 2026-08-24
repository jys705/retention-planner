import { useEffect, useState } from 'react'
import type { Horizon } from '../../core/horizon/horizon'
import { AdjustedBadge, Badge } from '../../components/Badge'
import { Chip } from '../../components/Chip'
import { InlineText } from '../../components/InlineText'
import { OptionCards } from '../../components/OptionCards'
import { MoreMenu } from '../../components/MoreMenu'
import type { GoalRow, Intensity, ItemRow } from '../../db/types'
import { dueReason, statusBadgeOf } from '../../lib/badge'
import { diffDays, type DateOnly } from '../../lib/date'
import {
  difficultyLabel,
  horizonLabel,
  dueLabel,
  josa,
  monthDay,
  percent,
  stabilityLabel,
} from '../../lib/format'
import { effectiveConfig, goalColor, horizonFields } from '../../lib/domain'
import { gradeColor, gradeName } from '../../lib/grade'
import { INTENSITY_META, intensityName } from '../../lib/intensity'
import type { Settings } from '../../lib/settings'
import { usePlanner } from '../../store/planner'
import { MemoryCurveChart } from '../charts/MemoryCurveChart'
import { GoalSettingsReadout } from '../goal/GoalSettingsReadout'
import { HorizonPicker } from '../newitem/HorizonPicker'
import { buildItemView } from './itemView'

export function ItemDetailScreen({
  itemId,
  onBack,
}: {
  itemId: string
  onBack: () => void
}) {
  const { items, goals, reviews, settings, today, planned } = usePlanner()
  const updateItem = usePlanner((s) => s.updateItem)
  const deleteItem = usePlanner((s) => s.deleteItem)

  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [draftGoalId, setDraftGoalId] = useState<string | null>(null)
  const [draftHorizon, setDraftHorizon] = useState<Horizon>({ kind: 'open' })
  const [draftIntensity, setDraftIntensity] = useState<Intensity>('standard')

  const item = items.find((i) => i.id === itemId)

  /**
   * 편집 칸을 지금 실제로 쓰고 있는 값으로 채운다.
   *
   * 항목 고유값이 아니라 적용 중인 값을 넣는다. 목표에서 풀었을 때 일정이 갑자기
   * 달라지지 않고, 사용자가 본 그대로 이어진다.
   */
  function seed(target: ItemRow) {
    const config = seedConfig(target, goals, settings)
    setDraftGoalId(target.goal_id)
    setDraftHorizon(config.horizon)
    setDraftIntensity(config.intensity)
    setConfirmingDelete(false)
  }

  // 훅은 이른 반환보다 앞에 와야 한다. 항목이 사라지는 순간에도 호출 순서가 같아야 하기 때문이다.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!item) return
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      if (typing) {
        if (event.key === 'Escape') setEditing(false)
        return
      }
      if (event.key === 'e' || event.key === 'E') {
        event.preventDefault()
        seed(item)
        setEditing(true)
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        setEditing(false)
        setConfirmingDelete(true)
      } else if (event.key === 'Escape') {
        setEditing(false)
        setConfirmingDelete(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!item) {
    return (
      <div className="mx-auto w-full max-w-[940px] px-6 pb-7 pt-10 text-[13px] text-text-2">
        항목을 찾을 수 없어요.
      </div>
    )
  }

  const goal = goals.find((g) => g.id === item.goal_id) ?? null
  const view = buildItemView(item, goal, reviews, settings, today)
  const badge = statusBadgeOf(item.due_kind, item.goal_risk)
  const plannedDates = planned
    .filter((p) => p.item_id === item.id)
    .map((p) => p.date)
    .sort()

  const found = item
  const draftGoal =
    goals.find((g) => g.id === draftGoalId && g.archived_at === null) ?? null

  function startEditing() {
    seed(found)
    setEditing(true)
  }

  async function saveEdit() {
    // 목표에 속하면 시점과 강도는 목표 것이다. 항목 쪽 칸을 비워야 목표를 고쳤을 때 따라온다.
    const own = draftGoalId === null
    await updateItem(found.id, {
      goal_id: draftGoalId,
      horizon_kind: own ? horizonFields(draftHorizon).horizon_kind : null,
      ready_at: own ? horizonFields(draftHorizon).ready_at : null,
      hold_until: own ? horizonFields(draftHorizon).hold_until : null,
      intensity: own ? draftIntensity : null,
      // 목표 기억률과 최소 복습 횟수도 항목 쪽에 남으면 목표를 안 따르는 셈이 된다.
      ...(own ? {} : { target_retention: null, min_reviews: null }),
    })
    setEditing(false)
  }

  async function removeItem() {
    await deleteItem(found.id)
    onBack()
  }

  return (
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-[14px] px-6 pb-7 pt-10">
      <div>
        <div className="flex items-center justify-between pr-[18px]">
          <button
            type="button"
            onClick={onBack}
            className="text-[12px] text-text-3 hover:text-text-2"
          >
            ← 서재
          </button>
          <MoreMenu
            label="이 항목 더보기"
            items={[
              { label: '설정 편집', onSelect: startEditing },
              {
                label: '삭제',
                danger: true,
                onSelect: () => {
                  setEditing(false)
                  setConfirmingDelete(true)
                },
              },
            ]}
          />
        </div>
        <div className="grid grid-cols-[1fr_268px] items-start gap-4 pt-2">
          <div className="min-w-0">
            <InlineText
              value={item.title}
              label="제목"
              placeholder="제목 없음"
              allowEmpty={false}
              className="-ml-[6px] text-[23px] font-semibold tracking-[-0.02em]"
              onSave={(next) => void updateItem(found.id, { title: next })}
            />

            <div className="flex flex-wrap items-center gap-[10px] pt-[7px]">
              {badge ? <Badge kind={badge} /> : null}
              {item.due_source === 'spread' ? <AdjustedBadge /> : null}
              {goal ? (
                <span className="flex items-center gap-[6px] rounded-full border border-line bg-surface px-[10px] py-[3px] text-[12px] text-text-2">
                  <span
                    aria-hidden
                    className="h-[5px] w-[5px] rounded-full"
                    style={{ background: goalColor(goal, goals.indexOf(goal)) }}
                  />
                  {goal.name}
                </span>
              ) : null}
              <span className="text-[12px] text-text-3">
                목표 시점{' '}
                {horizonLabel(
                  view.config.horizon.kind,
                  view.readyAt,
                  view.holdUntil
                )}
              </span>
              <span className="text-[12px] text-text-3">
                복습 강도 {intensityName(view.config.intensity)}
              </span>
            </div>

            <div className="pt-[8px]">
              <InlineText
                value={item.memo}
                label="메모"
                placeholder="메모 없음. 눌러서 적을 수 있어요."
                allowEmpty
                className="-ml-[6px] w-full text-[13px] text-text-2"
                onSave={(next) => void updateItem(found.id, { memo: next })}
              />
            </div>
          </div>

          {/* 오른쪽 268px 은 앱이 계산한 숫자 자리다. 한 값만 크게 세운다. */}
          <div className="rail-panel flex flex-col items-end gap-[8px] pr-[18px]">
            <div className="flex flex-col items-end gap-[1px]">
              <span className="text-[11.5px] text-text-3">지금 기억률</span>
              <span className="font-display num text-[38px] font-semibold leading-none tracking-[-0.02em]">
                {percent(view.retention)}
              </span>
            </div>
            <div className="num flex gap-4 text-[12.5px]">
              <span className="flex flex-col items-end gap-[2px]">
                <span className="font-sans text-[11px] text-text-3">
                  다음에 볼 날
                </span>
                <span className="text-accent">
                  {item.due ? dueLabel(today, item.due) : '없음'}
                </span>
              </span>
              <span className="flex flex-col items-end gap-[2px]">
                <span className="font-sans text-[11px] text-text-3">지금까지</span>
                <span title={`지금까지 ${item.reps}번 봤어요`}>
                  {item.reps}번
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {editing ? (
        <section className="flex flex-col gap-4 rounded-panel border border-accent bg-surface px-[16px] py-[14px]">
          <h2 className="text-[13px] font-semibold">설정 고치기</h2>

          <div className="flex flex-col gap-[6px]">
            <span className="text-[12px] font-medium text-text-2">소속 목표</span>
            <div className="flex flex-wrap gap-[6px]">
              <Chip
                active={draftGoalId === null}
                onClick={() => setDraftGoalId(null)}
              >
                없음
              </Chip>
              {goals
                .filter((g) => g.archived_at === null)
                .map((g) => (
                  <Chip
                    key={g.id}
                    active={draftGoalId === g.id}
                    onClick={() => setDraftGoalId(g.id)}
                  >
                    {g.name}
                  </Chip>
                ))}
            </div>
          </div>

          {draftGoal ? (
            <div className="flex flex-col gap-[6px]">
              <span className="text-[12px] font-medium text-text-2">
                목표 시점과 복습 강도
              </span>
              <GoalSettingsReadout goal={draftGoal} />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-[6px]">
                <span className="text-[12px] font-medium text-text-2">
                  목표 시점
                </span>
                <HorizonPicker
                  today={today}
                  uncertainty={settings.uncertainty}
                  value={draftHorizon}
                  onChange={setDraftHorizon}
                />
              </div>

              <div className="flex flex-col gap-[6px]">
                <span className="text-[12px] font-medium text-text-2">
                  복습 강도
                </span>
                <OptionCards
                  label="복습 강도"
                  value={draftIntensity}
                  options={INTENSITY_META.map((meta) => ({
                    key: meta.key,
                    name: meta.name,
                    desc: meta.desc,
                  }))}
                  onChange={setDraftIntensity}
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void saveEdit()}
              className="rounded-ctl bg-accent px-[14px] py-[7px] text-[13px] font-semibold text-white disabled:opacity-35"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-ctl border border-line-2 px-[12px] py-[7px] text-[13px] text-text-2 hover:bg-hover"
            >
              취소
            </button>
          </div>
        </section>
      ) : null}

      {confirmingDelete ? (
        <section className="flex flex-col gap-3 rounded-panel border border-imp-fg bg-surface px-[16px] py-[14px]">
          <h2 className="text-[13px] font-semibold">이 항목을 지울까요?</h2>
          <p className="text-[12.5px] leading-relaxed text-text-2">
            {`"${item.title}"${josa(
              item.title,
              '과',
              '와'
            )} 지금까지의 평가 ${view.reviews.length}건이 함께 사라집니다. 되돌릴 수 없어요.`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void removeItem()}
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

      {/*
        시안에는 '기억 곡선' 이라는 머리글이 없다. 결론 문장이 그 자리를 대신한다.
        그래도 이 구역에 이름은 있어야 하므로 aria-label 로 붙인다.
      */}
      <section
        aria-label="기억 곡선"
        className="relative overflow-hidden rounded-panel border border-line bg-surface"
      >
        <div
          aria-hidden
          className="absolute bottom-0 right-0 top-0 w-[268px] bg-rail"
        />
        <div className="relative grid grid-cols-[1fr_268px]">
          <div className="min-w-0 px-[20px] py-[16px]">
            {/* 한 줄만 읽는다면 이 줄이다. 그림보다 먼저 나와야 한다. */}
            <p className="pb-3 text-[15px] font-medium leading-relaxed">
              {curveSentence(
                item,
                view.retention,
                view.config.targetRetention,
                today
              )}
            </p>
            <MemoryCurveChart
              curve={view.curve}
              today={today}
              targetRetention={view.config.targetRetention}
              readyAt={view.readyAt}
              holdUntil={view.holdUntil}
            />
          </div>
          <div className="rail-panel flex flex-col gap-[14px] px-[18px] py-[16px]">
            <Summary item={item} />
            <div className="h-px bg-line" />
            <div className="flex flex-col gap-[6px]">
              <span className="text-[11.5px] text-text-3">
                {item.due && item.due <= today
                  ? '이 항목이 오늘 올라온 이유'
                  : '다음 날짜를 이렇게 잡은 이유'}
              </span>
              <p className="text-[12.5px] leading-relaxed text-text-2">
                {whyToday(item, view.retention, view.config.targetRetention, today)}
              </p>
              {view.feasible?.atRisk ? (
                <p className="text-[12.5px] leading-relaxed text-text-2">
                  {plannedDates.length >= 2
                    ? `한 번 봐서는 목표한 날 기억이 모자라요. 그래서 ${plannedDates
                        .map(monthDay)
                        .join(', ')} 두 번 잡아두었어요.`
                    : '한 번 봐서는 목표한 날 기억이 모자라요. 목표한 날 전에 한 번 더 잡아둡니다.'}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-panel border border-line bg-surface">
        <div
          aria-hidden
          className="absolute bottom-0 right-0 top-0 w-[268px] bg-rail"
        />
        <div className="relative py-[16px]">
          <h2 className="px-[20px] pb-3 text-[14px] font-semibold tracking-[-0.01em]">
            평가 이력
          </h2>
          {view.reviews.length === 0 ? (
            <p className="px-[20px] text-[13px] text-text-3">
              아직 평가한 적이 없어요. 공부한 날만 기록돼 있습니다.
            </p>
          ) : (
            <div role="table" aria-label="평가 이력">
              <div
                role="row"
                className="grid grid-cols-[1fr_268px] pb-2 text-[11px] text-text-3"
              >
                <div className="grid grid-cols-[96px_90px_1fr] gap-3 px-[20px]">
                  <span role="columnheader">날짜</span>
                  <span role="columnheader">등급</span>
                  <span role="columnheader">메모</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pr-[18px] text-right">
                  <span role="columnheader">그때의 기억률</span>
                  <span role="columnheader">다음에 본 날</span>
                </div>
              </div>
              {[...view.reviews].reverse().map((review, index, list) => {
                const next = list[index - 1]
                return (
                  <div
                    key={review.id}
                    role="row"
                    className="grid h-[44px] grid-cols-[1fr_268px] items-center hover:bg-raise"
                  >
                    <div className="grid min-w-0 grid-cols-[96px_90px_1fr] items-center gap-3 px-[20px]">
                      <span role="cell" className="num text-[12.5px] text-text-2">
                        {monthDay(review.reviewed_at)}
                      </span>
                      <span
                        role="cell"
                        className="flex items-center gap-[7px] text-[13px]"
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 flex-none rounded-full"
                          style={{ background: gradeColor(review.rating) }}
                        />
                        {gradeName(review.rating)}
                      </span>
                      <span
                        role="cell"
                        className="truncate text-[12.5px] text-text-3"
                      >
                        {review.memo_snapshot ?? ''}
                      </span>
                    </div>
                    <div className="num grid grid-cols-2 items-center gap-3 pr-[18px] text-right text-[12.5px]">
                      <span role="cell">{percent(review.r_at_review)}</span>
                      <span role="cell" className="text-text-2">
                        {next ? monthDay(next.reviewed_at) : '아직'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

    </div>
  )
}

function Summary({ item }: { item: ItemRow }) {
  return (
    <>
      <div className="flex flex-col gap-[3px]">
        <span className="text-[11.5px] text-text-3">기억 지속력</span>
        <span className="num text-[19px]">
          {item.stability !== null ? stabilityLabel(item.stability) : '아직'}
        </span>
        <span className="text-[11.5px] text-text-3">90%까지 유지되는 기간</span>
      </div>

      <div className="h-px bg-line" />

      <div className="flex flex-col gap-[6px]">
        <span className="text-[11.5px] text-text-3">체감 난이도</span>
        <div className="flex items-center gap-[9px]">
          {item.difficulty !== null ? (
            <DifficultyMeter difficulty={item.difficulty} />
          ) : null}
          <span className="text-[13px] font-medium">
            {item.difficulty !== null
              ? difficultyLabel(item.difficulty)
              : '아직'}
          </span>
        </div>
        <span className="text-[11.5px] leading-relaxed text-text-3">
          어렵게 느낀 항목일수록 사이를 좁게 잡아요.
        </span>
      </div>
    </>
  )
}

/**
 * 체감 난이도 눈금.
 *
 * 숫자를 그대로 적으면 1부터 10까지 중 어디쯤인지 읽는 데 시간이 걸린다.
 * 칸 다섯 개로 나누면 눈으로 한 번에 들어온다.
 */
function DifficultyMeter({ difficulty }: { difficulty: number }) {
  // difficultyLabel 이 쓰는 경계와 같아야 이름과 칸수가 서로 안 어긋난다.
  const filled =
    difficulty < 3 ? 1 : difficulty < 5 ? 2 : difficulty < 7 ? 3 : difficulty < 8.5 ? 4 : 5
  return (
    <div
      className="flex flex-none gap-[3px]"
      role="img"
      aria-label={`다섯 칸 중 ${filled}칸`}
    >
      {[0, 1, 2, 3, 4].map((slot) => (
        <span
          key={slot}
          className="h-[6px] w-[16px] rounded-[2px]"
          style={{
            background: slot < filled ? 'var(--accent)' : 'var(--line-2)',
          }}
        />
      ))}
    </div>
  )
}

function curveSentence(
  item: ItemRow,
  retention: number,
  target: number,
  today: DateOnly
): string {
  const now = `지금 기억률은 ${percent(retention)}예요.`
  const due = item.due
  if (!due) return now
  if (due > today) {
    return `${now} 목표 기억률 ${percent(
      target
    )} 아래로 떨어지기 전인 ${dueLabel(today, due)} 보라고 잡아두었어요.`
  }
  // 오늘 올라온 까닭은 규칙마다 다르다. 오른쪽 이유와 어긋나면 안 된다.
  switch (item.due_kind) {
    case 'deadline_pull':
      return `${now} 목표한 날에 기억을 지키려고 오늘로 당겨 잡았어요.`
    case 'session_fill':
      return `${now} 목표한 날 전에 정해둔 횟수를 채우려고 오늘 잡았어요.`
    case 'final_check':
      return `${now} 이미 충분히 기억하고 있어서 마지막으로 한 번 훑는 자리예요.`
    case 'hold':
      return `${now} 목표한 기간 동안 기억을 붙잡아 두려고 오늘 잡았어요.`
    default:
      return `${now} 목표 기억률 ${percent(
        target
      )}보다 낮아서 오늘 보라고 잡았어요.`
  }
}

/**
 * 이 항목이 오늘 올라온 이유.
 *
 * 규칙 이름만 적으면 왜 하필 오늘인지가 안 보인다. 마지막으로 본 날과 그 뒤로 지난 날수,
 * 지금 내려온 기억률까지 같이 적어야 사용자가 스스로 납득한다.
 */
function whyToday(
  item: ItemRow,
  retention: number,
  target: number,
  today: DateOnly
): string {
  if (!item.due || item.due > today) {
    return `아직 오늘 볼 차례는 아니에요. ${dueLabel(
      today,
      item.due ?? today
    )} 올라옵니다.`
  }

  const since = item.last_review
    ? `마지막으로 본 ${monthDay(item.last_review)}부터 ${diffDays(
        item.last_review,
        today
      )}일이 지나서 기억률이 ${percent(retention)}까지 내려왔어요. `
    : ''

  if (item.due_kind === 'normal' || item.due_kind === null) {
    return `${since}목표 기억률 ${percent(target)}를 밑돌아서 오늘로 잡았습니다.`
  }
  return `${since}${dueReason(item.due_kind)}`
}

/**
 * 편집 칸에 채울 값.
 *
 * 항목이 제 값을 가지고 있으면 그걸, 없으면 소속 목표 것을, 그것도 없으면 전역 기본값을 준다.
 */
function seedConfig(
  item: ItemRow,
  goals: readonly GoalRow[],
  settings: Settings
): { horizon: Horizon; intensity: Intensity } {
  const goal = goals.find((g) => g.id === item.goal_id) ?? null
  const config = effectiveConfig(item, goal, settings)
  return {
    horizon: config.horizon,
    // 강도는 화면에서 늘 네 단계 중 하나다. 숫자로 들어오는 건 계산 쪽 표현이다.
    intensity:
      typeof config.intensity === 'string'
        ? config.intensity
        : settings.defaultIntensity,
  }
}
