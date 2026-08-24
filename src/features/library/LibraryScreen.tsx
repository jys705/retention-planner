import { useState } from 'react'
import { defaultFsrs } from '../../core/fsrs/fsrs6'
import { Badge } from '../../components/Badge'
import { Chip } from '../../components/Chip'
import type { GoalRow, ItemRow } from '../../db/types'
import { statusBadgeOf } from '../../lib/badge'
import { cn } from '../../lib/cn'
import { diffDays, type DateOnly } from '../../lib/date'
import {
  goalColor,
  isActive,
  memoryStateOf,
  splitTitle,
} from '../../lib/domain'
import { percent } from '../../lib/format'
import { usePlanner } from '../../store/planner'

type SortKey = 'title' | 'retention'

const SORTS: { key: SortKey; name: string }[] = [
  { key: 'title', name: '이름순' },
  { key: 'retention', name: '기억률 낮은순' },
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
  const [sort, setSort] = useState<SortKey>('title')

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const active = items.filter(isActive)
  const matched = query.trim()
    ? active.filter((i) =>
        i.title.toLowerCase().includes(query.trim().toLowerCase())
      )
    : active

  const rows = matched.map((item) => ({
    item,
    goal: goals.find((g) => g.id === item.goal_id) ?? null,
    retention: retentionOf(item, today),
  }))

  const sorted = [...rows].sort((a, b) => {
    if (sort === 'retention') return a.retention - b.retention
    return a.item.title < b.item.title ? -1 : 1
  })

  // 부제는 서재 전체를 말한다. 걸러진 것만 세면 걸개를 켤 때마다 '목표 0개' 가 된다.
  const whole = items.filter(isActive)
  const goalCount = new Set(
    whole.map((i) => i.goal_id).filter((id): id is string => id !== null)
  ).size
  const looseCount = whole.filter((i) => i.goal_id === null).length
  const narrowed = matched.length !== whole.length

  return (
    <div className="mx-auto flex w-full max-w-[940px] flex-col gap-4 px-6 pb-7 pt-10">
      <header className="flex flex-col gap-[10px]">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[22px] font-semibold">서재</h1>
          <span className="text-[13px] text-text-3">
            항목 <span className="num">{whole.length}</span>개, 목표{' '}
            <span className="num">{goalCount}</span>개와 낱개{' '}
            <span className="num">{looseCount}</span>개
            {narrowed ? (
              <span className="text-accent">
                {' '}
                (지금 <span className="num">{matched.length}</span>개 보는 중)
              </span>
            ) : null}
          </span>
        </div>

        {/* 찾기 칸과 정렬 칩이 한 줄에서 같은 높이로 선다. */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목으로 찾기"
            aria-label="항목 찾기"
            className="h-[36px] min-w-[220px] flex-1 rounded-ctl border border-line-2 bg-surface px-[12px] text-[13px] outline-none focus:border-accent"
          />
          <span className="flex-none text-[11.5px] text-text-3">정렬</span>
          <div className="flex flex-none gap-[6px]">
            {SORTS.map((s) => (
              <Chip
                key={s.key}
                tall
                active={sort === s.key}
                onClick={() => setSort(s.key)}
              >
                {s.name}
              </Chip>
            ))}
          </div>
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
      ) : (
        <GroupedList
          rows={sorted}
          goals={goals}
          collapsed={collapsed}
          onToggle={(key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
          onOpenItem={onOpenItem}
          onOpenGoal={onOpenGoal}
        />
      )}
    </div>
  )
}

interface RowData {
  item: ItemRow
  goal: GoalRow | null
  retention: number
}

/**
 * 목표로 한 번만 접힌다.
 *
 * 제목이 비슷하다고 한 번 더 묶던 것이 있었는데, 묶는 단위는 사용자가 스스로 만든
 * 목표 하나면 된다. 앱이 제목을 보고 지어낸 묶음은 목표와 헷갈리기만 했다.
 */
function GroupedList({
  rows,
  goals,
  collapsed,
  onToggle,
  onOpenItem,
  onOpenGoal,
}: {
  rows: RowData[]
  goals: GoalRow[]
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

  // 어디에도 안 넣은 것은 늘 맨 아래다. 제목 차례에 밀려 목표들 사이에 끼면
  // 그것도 목표 하나인 줄 알게 된다.
  const order = [...byGoal.entries()].sort(([a], [b]) => {
    if (a === '__none__') return 1
    if (b === '__none__') return -1
    return goals.findIndex((g) => g.id === a) - goals.findIndex((g) => g.id === b)
  })

  return (
    <div className="flex flex-col gap-3">
      {order.map(([goalKey, goalRows]) => {
        const goal = goals.find((g) => g.id === goalKey) ?? null
        const goalCollapsed = collapsed[goalKey] ?? false
        const avg =
          goalRows.reduce((s, r) => s + r.retention, 0) / goalRows.length

        return (
          <section
            key={goalKey}
            className="relative overflow-hidden rounded-panel border border-line bg-surface"
          >
            <div
              aria-hidden
              className="absolute bottom-0 right-0 top-0 w-[120px] bg-rail"
            />

            {/*
              머리글 전체가 접고 펴는 단추다. 점 옆에 네모난 단추를 따로 두면
              색점과 겹쳐 보이고, 테두리를 없애면 눌리는 자리인지 안 보였다.
              줄 전체가 반응하고 오른쪽 끝의 꺾쇠가 돌아가는 쪽이 분명하다.
            */}
            <button
              type="button"
              onClick={() => onToggle(goalKey)}
              aria-expanded={!goalCollapsed}
              aria-label={`${goal?.name ?? '목표 없음'} ${
                goalCollapsed ? '펼치기' : '접기'
              }`}
              className="group relative flex w-full items-center gap-2 border-b border-line px-[14px] py-[11px] text-left transition-colors hover:bg-hover"
            >
              <span
                aria-hidden
                className="h-[7px] w-[7px] flex-none rounded-full"
                style={{
                  background: goal
                    ? goalColor(goal, goals.indexOf(goal))
                    : 'var(--dot)',
                }}
              />
              <span className="text-[13.5px] font-medium">
                {goal?.name ?? '목표 없음'}
              </span>
              <span className="num text-[12px] text-text-3">
                {goalRows.length}개
              </span>
              {goal ? null : (
                <span className="text-[11.5px] text-text-3">
                  아직 어느 목표에도 안 넣은 항목이에요
                </span>
              )}
              <div className="flex-1" />
              {/* 글자 길이와 상관없이 늘 같은 자리에 서야 눈이 찾아간다. */}
              <span
                aria-hidden
                className={cn(
                  'flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[11px] text-text-3 transition-all group-hover:bg-line group-hover:text-text',
                  goalCollapsed ? '-rotate-90' : ''
                )}
              >
                ▾
              </span>
              <span className="num w-[120px] flex-none pr-[4px] text-right text-[12px] text-text-2">
                평균 {percent(avg)}
              </span>
            </button>

            {!goalCollapsed ? (
              <div className="relative">
                {goalRows.map((row) => (
                  <Row
                    key={row.item.id}
                    item={row.item}
                    retention={row.retention}
                    onClick={() => onOpenItem(row.item.id)}
                  />
                ))}
              </div>
            ) : null}

            {goal ? (
              <button
                type="button"
                onClick={() => onOpenGoal(goal.id)}
                className="relative flex w-full items-center gap-1 border-t border-line px-[14px] py-[7px] text-left text-[11.5px] text-text-3 transition-colors hover:bg-hover hover:text-text-2"
              >
                이 목표 자세히 보기
                <span aria-hidden>›</span>
              </button>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

function Row({
  item,
  retention,
  goal,
  goalDot,
  onClick,
}: {
  item: ItemRow
  retention: number
  /** 묶음을 풀었을 때만 준다. 목표 안에서는 어느 목표인지 이미 안다. */
  goal?: GoalRow | null
  goalDot?: string | undefined
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
      className="flex w-full items-center gap-3 border-b border-line px-[14px] py-[9px] text-left last:border-b-0 hover:bg-hover"
    >
      <span className="min-w-0 flex-1 truncate text-[13.5px]">
        <span className="text-text-2">{parts.pre}</span>
        <span className="num text-[13px]">{parts.num}</span>
        <span className="text-text-2">{parts.post}</span>
      </span>
      {goal !== undefined ? (
        // 칸 너비를 고정한다. 이름 길이에 따라 뒤의 배지 자리가 들쭉날쭉하면 안 된다.
        <span className="flex w-[150px] flex-none items-center justify-end gap-[5px] text-[11.5px] text-text-3">
          <span
            aria-hidden
            className="h-[5px] w-[5px] flex-none rounded-full"
            style={{ background: goalDot ?? 'var(--dot)' }}
          />
          <span className="truncate">{goal?.name ?? '목표 없음'}</span>
        </span>
      ) : null}
      <span className="flex w-[42px] flex-none justify-end">
        {badge ? <Badge kind={badge} /> : null}
      </span>
      <span className="rail-panel num w-[120px] flex-none pr-[4px] text-right text-[12.5px]">
        {percent(retention)}
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
