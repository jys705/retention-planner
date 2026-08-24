import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { addDays } from '../../lib/date'
import { horizonLabel, shortDate } from '../../lib/format'
import { usePlanner } from '../../store/planner'
import { goalColor, isActive } from '../../lib/domain'

export type ScreenKey = 'today' | 'forecast' | 'goals' | 'library' | 'settings'

const NAV: { key: ScreenKey; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'forecast', label: '예보' },
  { key: 'goals', label: '목표' },
  { key: 'library', label: '서재' },
]

/**
 * 옆줄에 늘어놓을 수. 이보다 많으면 남은 수만 알리고 해당 화면으로 보낸다.
 *
 * 목표는 두 줄(이름과 날짜)이라 자리를 두 배로 먹는다. 항목은 한 줄이라 더 담을 수 있다.
 */
const GOALS_SHOWN = 4
const ITEMS_SHOWN = 6

/**
 * '다가오는' 을 며칠까지로 볼지.
 *
 * 목표는 몇 달 뒤가 흔해서 좁게 자르면 아무것도 안 뜬다. 항목은 며칠 간격으로
 * 계속 올라오므로 넓게 두면 옆줄이 먼 날짜로 채워진다. 둘의 성격이 달라 따로 잡는다.
 */
const GOAL_HORIZON_DAYS = 120
const ITEM_HORIZON_DAYS = 14

export function AppShell({
  screen,
  onNavigate,
  onOpenGoal,
  onOpenItem,
  children,
}: {
  screen: ScreenKey
  onNavigate: (key: ScreenKey) => void
  onOpenGoal: (goalId: string) => void
  onOpenItem: (itemId: string) => void
  children: ReactNode
}) {
  const { items, goals, today } = usePlanner()
  const dueCount = items.filter(
    (i) => isActive(i) && i.due !== null && i.due <= today
  ).length
  // 가까운 것부터 올린다. 만들어 둔 차례대로 자르면 '다가오는' 이 아니게 된다.
  const goalCutoff = addDays(today, GOAL_HORIZON_DAYS)
  const dated = goals
    .filter(
      (g) =>
        g.archived_at === null &&
        g.horizon_kind !== 'open' &&
        (g.ready_at ?? '9999') <= goalCutoff
    )
    .sort((a, b) => ((a.ready_at ?? '9999') < (b.ready_at ?? '9999') ? -1 : 1))
  const upcomingGoals = dated.slice(0, GOALS_SHOWN)
  const restGoals = dated.length - upcomingGoals.length

  // 목표에 안 넣은 항목은 묶일 데가 없어서 서재에서도 맨 아래 한 덩어리로만 보인다.
  // 곧 볼 것만 여기 올려 두면 그 덩어리를 안 뒤져도 된다.
  // 오늘 것은 오늘 화면이 맡는다. 여기까지 올리면 같은 줄이 두 군데 서게 된다.
  const itemCutoff = addDays(today, ITEM_HORIZON_DAYS)
  const looseSoon = items
    .filter(
      (i) =>
        isActive(i) &&
        i.goal_id === null &&
        i.due !== null &&
        i.due > today &&
        i.due <= itemCutoff
    )
    .sort((a, b) => ((a.due ?? '9999') < (b.due ?? '9999') ? -1 : 1))
  const upcomingItems = looseSoon.slice(0, ITEMS_SHOWN)
  const restItems = looseSoon.length - upcomingItems.length

  return (
    // macOS 창이 이미 테두리와 그림자와 둥근 모서리를 갖고 있다. 그 안에 같은 것을
    // 한 겹 더 그리면 창 속에 창이 든 것처럼 보인다. 창을 그대로 채운다.
    <div className="flex h-full bg-bg">
      <div className="flex h-full w-full overflow-hidden">
        <nav className="flex w-[196px] flex-none flex-col justify-between border-r border-line bg-rail py-5">
          {/*
            창을 작게 쓰면 다가오는 목록이 아래를 밀어내 설정이 화면 밖으로 나갔다.
            위쪽만 스스로 굴러가게 두면 창이 얼마나 작든 설정은 늘 바닥에 남는다.
          */}
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3">
            {NAV.map((entry) => (
              <button
                key={entry.key}
                type="button"
                // 옆줄에는 목표 이름도 같이 서 있다. 이름이 겹치지 않게 자리를 밝힌다.
                aria-label={`${entry.label} 화면`}
                onClick={() => onNavigate(entry.key)}
                className={cn(
                  'flex items-center justify-between rounded-[7px] px-[10px] py-[7px] text-[13px] transition-colors',
                  screen === entry.key
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-text-2 hover:bg-hover'
                )}
              >
                <span className="flex items-center gap-[9px]">
                  <span
                    aria-hidden
                    className="h-[5px] w-[5px] flex-none rounded-full"
                    style={{
                      background:
                        screen === entry.key ? 'var(--accent)' : 'var(--dot)',
                    }}
                  />
                  {entry.label}
                </span>
                {entry.key === 'today' && dueCount > 0 ? (
                  <span className="num text-[12px]">{dueCount}</span>
                ) : null}
              </button>
            ))}

            {upcomingGoals.length > 0 ? (
              <div className="flex flex-col gap-[2px] pt-5">
                <span className="px-[10px] pb-[4px] text-[11px] text-text-3">
                  다가오는 목표
                </span>
                {upcomingGoals.map((goal) => (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => onOpenGoal(goal.id)}
                    className="flex flex-col items-start rounded-ctl px-[10px] py-[5px] text-left transition-colors hover:bg-hover"
                  >
                    <span className="flex w-full items-center gap-[7px]">
                      <span
                        aria-hidden
                        className="h-[5px] w-[5px] flex-none rounded-full"
                        style={{
                          background: goalColor(goal, goals.indexOf(goal)),
                        }}
                      />
                      <span className="truncate text-[12.5px] text-text-2">
                        {goal.name}
                      </span>
                    </span>
                    <span className="num pl-[12px] text-[11.5px] text-text-3">
                      {horizonLabel(
                        goal.horizon_kind,
                        goal.ready_at,
                        goal.hold_until
                      )}
                    </span>
                  </button>
                ))}
                {restGoals > 0 ? (
                  <MoreRow
                    onClick={() => onNavigate('goals')}
                    label="목표"
                    count={restGoals}
                  />
                ) : null}
              </div>
            ) : null}

            {upcomingItems.length > 0 ? (
              <div className="flex flex-col gap-[2px] pt-5">
                <span className="px-[10px] pb-[4px] text-[11px] text-text-3">
                  다가오는 항목
                </span>
                {upcomingItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenItem(item.id)}
                    className="flex items-center gap-[7px] rounded-ctl px-[10px] py-[5px] text-left transition-colors hover:bg-hover"
                  >
                    <span
                      aria-hidden
                      className="h-[5px] w-[5px] flex-none rounded-full border border-line-2"
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-2">
                      {item.title}
                    </span>
                    <span className="num flex-none text-[11px] text-text-3">
                      {shortDate(item.due ?? today)}
                    </span>
                  </button>
                ))}
                {restItems > 0 ? (
                  <MoreRow
                    onClick={() => onNavigate('library')}
                    label="항목"
                    count={restItems}
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            aria-label="설정 화면"
            onClick={() => onNavigate('settings')}
            className={cn(
              'mx-3 mt-2 flex-none rounded-[7px] px-[10px] py-[7px] text-left text-[13px] transition-colors',
              screen === 'settings'
                ? 'bg-accent-soft font-semibold text-accent'
                : 'text-text-2 hover:bg-hover'
            )}
          >
            설정
          </button>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

/** 다 못 보여준 나머지를 알리고 그 화면으로 보내는 줄. */
function MoreRow({
  onClick,
  label,
  count,
}: {
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 숫자만 등폭으로 뽑아 쓰느라 조각이 나뉜다. 이름은 따로 붙여 준다.
      aria-label={`${label} ${count}개 더`}
      className="rounded-ctl px-[10px] py-[5px] pl-[22px] text-left text-[11.5px] text-text-3 transition-colors hover:bg-hover hover:text-text-2"
    >
      {label} <span className="num">{count}</span>개 더
    </button>
  )
}
