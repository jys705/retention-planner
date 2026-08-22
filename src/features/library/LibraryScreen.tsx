import { useState } from 'react'
import { defaultFsrs } from '../../core/fsrs/fsrs6'
import { Badge } from '../../components/Badge'
import type { GoalRow, ItemRow } from '../../db/types'
import { statusBadgeOf } from '../../lib/badge'
import { cn } from '../../lib/cn'
import { diffDays, type DateOnly } from '../../lib/date'
import {
  goalColor,
  isActive,
  memoryStateOf,
  splitTitle,
  groupByCommonPrefix,
} from '../../lib/domain'
import { dueLabel, horizonLabel, percent } from '../../lib/format'
import { usePlanner } from '../../store/planner'

/**
 * 찾기 칸, 정렬 칸, 묶기 단추가 나란히 선다.
 * 셋의 높이가 다르면 줄이 어긋나 보이므로 한 곳에서 정해 준다.
 */
const CONTROL =
  'h-[32px] rounded-ctl border border-line-2 bg-surface px-[10px] text-[12.5px]'

type SortKey = 'due' | 'retention' | 'title'

const SORTS: { key: SortKey; name: string }[] = [
  { key: 'due', name: '다음에 볼 날' },
  { key: 'retention', name: '기억률 낮은순' },
  { key: 'title', name: '이름순' },
]

export function LibraryScreen({
  onOpenItem,
  onOpenGoal,
}: {
  onOpenItem: (id: string) => void
  onOpenGoal: (id: string) => void
}) {
  const { items, goals, today } = usePlanner()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('due')
  const [grouped, setGrouped] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const active = items.filter(isActive)
  const matched = query.trim()
    ? active.filter((i) => i.title.toLowerCase().includes(query.trim().toLowerCase()))
    : active

  const rows = matched.map((item) => ({
    item,
    goal: goals.find((g) => g.id === item.goal_id) ?? null,
    retention: retentionOf(item, today),
  }))

  const sorted = [...rows].sort((a, b) => {
    if (sort === 'retention') return a.retention - b.retention
    if (sort === 'title') return a.item.title < b.item.title ? -1 : 1
    return (a.item.due ?? '9999') < (b.item.due ?? '9999') ? -1 : 1
  })

  return (
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-4 px-6 py-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[22px] font-semibold">서재</h1>
          <span className="num text-[13px] text-text-3">
            {matched.length}개
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="찾기"
            aria-label="항목 찾기"
            className={cn(CONTROL, 'w-[180px] outline-none')}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="정렬"
            className={cn(CONTROL, 'pr-[6px]')}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setGrouped((g) => !g)}
            className={cn(CONTROL, 'text-text-2 hover:bg-hover')}
          >
            {grouped ? '목표 묶음 풀기' : '목표별로 묶기'}
          </button>
        </div>
      </header>

      {matched.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-[18px] py-[22px]">
          <p className="text-[15px] font-medium">찾는 항목이 없어요.</p>
          <p className="pt-1 text-[13px] text-text-2">
            {query.trim()
              ? `'${query.trim()}'와 맞는 제목이 없습니다. 다른 말로 찾아보거나 오늘 화면에서 새로 적어보세요.`
              : '오늘 화면에서 한 줄 적으면 여기에 쌓입니다.'}
          </p>
        </div>
      ) : grouped ? (
        <GroupedList
          rows={sorted}
          goals={goals}
          today={today}
          collapsed={collapsed}
          onToggle={(key) =>
            setCollapsed((c) => ({ ...c, [key]: !c[key] }))
          }
          onOpenItem={onOpenItem}
          onOpenGoal={onOpenGoal}
        />
      ) : (
        <div className="rounded-card border border-line bg-surface">
          {sorted.map(({ item, goal, retention }) => (
            <Row
              key={item.id}
              item={item}
              goal={goal}
              retention={retention}
              today={today}
              onClick={() => onOpenItem(item.id)}
            />
          ))}
        </div>
      )}

      <p className="text-[11px] text-text-3">
        바깥 묶음은 소속 목표이고, 안쪽 `제목` 묶음은 제목이 비슷해서 보기 좋게 접어둔
        것이에요. 제목이 비슷하다고 같은 목표에 든 것은 아닙니다.
      </p>
    </div>
  )
}

interface RowData {
  item: ItemRow
  goal: GoalRow | null
  retention: number
}

/** 목표로 한 번, 제목의 공통 부분으로 한 번. 두 단으로 접힌다. */
function GroupedList({
  rows,
  goals,
  today,
  collapsed,
  onToggle,
  onOpenItem,
  onOpenGoal,
}: {
  rows: RowData[]
  goals: GoalRow[]
  today: DateOnly
  collapsed: Record<string, boolean>
  onToggle: (key: string) => void
  onOpenItem: (id: string) => void
  onOpenGoal: (id: string) => void
}) {
  const byGoal = new Map<string, RowData[]>()
  for (const row of rows) {
    const key = row.goal?.id ?? '__none__'
    byGoal.set(key, [...(byGoal.get(key) ?? []), row])
  }

  return (
    <div className="flex flex-col gap-3">
      {[...byGoal.entries()].map(([goalKey, goalRows]) => {
        const goal = goals.find((g) => g.id === goalKey) ?? null
        const goalCollapsed = collapsed[goalKey] ?? false
        const avg =
          goalRows.reduce((s, r) => s + r.retention, 0) / goalRows.length

        // 제목 앞부분이 같은 것끼리 한 번 더 접는다. 이건 보기 편하라고 하는 묶음이고
        // 목표 소속과는 다른 것이다. 머리글에서 그 차이가 드러나야 한다.
        const byStem = groupByCommonPrefix(goalRows, (r) => r.item.title)
        const groupedIds = new Set(
          [...byStem.values()].flatMap((rows) =>
            rows.length > 1 ? rows.map((r) => r.item.id) : []
          )
        )
        for (const row of goalRows) {
          if (groupedIds.has(row.item.id)) continue
          byStem.set(row.item.title, [row])
        }

        return (
          <div
            key={goalKey}
            className="overflow-hidden rounded-card border border-line bg-surface"
          >
            <div className="flex items-center gap-2 border-b border-line px-[14px] py-[10px]">
              <button
                type="button"
                onClick={() => onToggle(goalKey)}
                className="flex h-[20px] w-[20px] flex-none items-center justify-center rounded-ctl border border-line-2 bg-surface text-[11px] text-text-2 transition-colors hover:bg-hover"
                aria-label={`${goal?.name ?? '목표 없음'} ${
                  goalCollapsed ? '펼치기' : '접기'
                }`}
              >
                {goalCollapsed ? '▸' : '▾'}
              </button>
              <span
                aria-hidden
                className="h-[6px] w-[6px] rounded-full"
                style={{
                  background: goal
                    ? goalColor(goal, goals.indexOf(goal))
                    : 'var(--dot)',
                }}
              />
              <button
                type="button"
                onClick={() => (goal ? onOpenGoal(goal.id) : undefined)}
                className={cn(
                  'text-[13.5px] font-medium',
                  goal && 'hover:text-accent'
                )}
              >
                {goal?.name ?? '목표 없음'}
              </button>
              <span className="num text-[12px] text-text-3">
                {goalRows.length}개
              </span>
              {goal ? null : (
                <span className="text-[11.5px] text-text-3">
                  아직 어느 목표에도 안 넣은 항목이에요
                </span>
              )}
              <div className="flex-1" />
              {goal ? (
                <span className="num text-[11.5px] text-text-3">
                  {horizonLabel(goal.horizon_kind, goal.ready_at, goal.hold_until)}
                </span>
              ) : null}
              <span className="num text-[12px] text-text-2">
                {percent(avg)}
              </span>
            </div>

            {!goalCollapsed
              ? [...byStem.entries()].map(([stem, stemRows]) => {
                  const stemKey = `${goalKey}::${stem}`
                  const stemCollapsed = collapsed[stemKey] ?? false
                  if (stemRows.length === 1) {
                    const row = stemRows[0]
                    return (
                      <Row
                        key={row.item.id}
                        item={row.item}
                        goal={row.goal}
                        retention={row.retention}
                        today={today}
                        onClick={() => onOpenItem(row.item.id)}
                      />
                    )
                  }
                  return (
                    <div key={stemKey}>
                      <button
                        type="button"
                        onClick={() => onToggle(stemKey)}
                        aria-label={`제목 묶음 ${stem}`}
                        title="제목이 비슷해서 보기 좋게 접어둔 것이에요. 목표 소속과는 다릅니다."
                        className="flex w-full items-center gap-2 bg-rail px-[14px] py-[7px] pl-[26px] text-left transition-colors hover:bg-hover"
                      >
                        <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-ctl border border-line-2 bg-surface text-[10px] text-text-2">
                          {stemCollapsed ? '▸' : '▾'}
                        </span>
                        <span className="rounded-[4px] border border-line-2 px-[5px] py-[1px] text-[10px] text-text-3">
                          제목
                        </span>
                        <span className="text-[12.5px] text-text-2">{stem}</span>
                        <span className="num text-[11.5px] text-text-3">
                          {stemRows.length}개
                        </span>
                      </button>
                      {!stemCollapsed
                        ? stemRows.map((row) => (
                            <Row
                              key={row.item.id}
                              item={row.item}
                              goal={row.goal}
                              retention={row.retention}
                              today={today}
                              indent
                              onClick={() => onOpenItem(row.item.id)}
                            />
                          ))
                        : null}
                    </div>
                  )
                })
              : null}
          </div>
        )
      })}
    </div>
  )
}

function Row({
  item,
  goal,
  retention,
  today,
  indent,
  onClick,
}: {
  item: ItemRow
  goal: GoalRow | null
  retention: number
  today: DateOnly
  indent?: boolean
  onClick: () => void
}) {
  const badge = statusBadgeOf(item.due_kind, item.goal_risk)
  const parts = splitTitle(item.title)
  return (
    <button
      type="button"
      onClick={onClick}
      // 제목이 등폭 숫자 때문에 여러 조각으로 나뉘어 있어서 이름을 따로 붙인다.
      aria-label={item.title}
      className={cn(
        'flex w-full items-center gap-3 border-b border-line px-[14px] py-[9px] text-left last:border-b-0 hover:bg-hover',
        indent && 'pl-[32px]'
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[13.5px]">
        <span className="text-text-2">{parts.pre}</span>
        <span className="num text-[13px]">{parts.num}</span>
        <span className="text-text-2">{parts.post}</span>
      </span>
      {badge ? <Badge kind={badge} /> : null}
      <span className="rail-panel num grid w-[220px] flex-none grid-cols-[52px_84px_1fr] items-center gap-[12px] pr-[4px]">
        <span className="text-right text-[12.5px]">{percent(retention)}</span>
        <span className="text-right text-[12px] text-text-2">
          {item.due ? dueLabel(today, item.due) : '없음'}
        </span>
        <span className="truncate font-sans text-[11.5px] text-text-3">
          {goal?.name ?? '목표 없음'}
        </span>
      </span>
    </button>
  )
}

function retentionOf(item: ItemRow, today: DateOnly): number {
  const state = memoryStateOf(item)
  if (!state || !item.last_review) return 1
  return defaultFsrs.retrievability(
    Math.max(0, diffDays(item.last_review, today)),
    state.stability
  )
}
