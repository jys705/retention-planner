import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { horizonLabel } from '../../lib/format'
import { usePlanner } from '../../store/planner'
import { goalColor, isActive } from '../../lib/domain'

export type ScreenKey = 'today' | 'forecast' | 'goals' | 'library' | 'settings'

const NAV: { key: ScreenKey; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'forecast', label: '예보' },
  { key: 'goals', label: '목표' },
  { key: 'library', label: '서재' },
]

/** 옆줄에 늘어놓을 목표 수. 이보다 많으면 남은 수만 알리고 목표 화면으로 보낸다. */
const UPCOMING_SHOWN = 4

export function AppShell({
  screen,
  onNavigate,
  onOpenGoal,
  onOpenLoose,
  children,
}: {
  screen: ScreenKey
  onNavigate: (key: ScreenKey) => void
  onOpenGoal: (goalId: string) => void
  /** 어느 목표에도 안 넣은 항목만 서재에서 보여준다. */
  onOpenLoose: () => void
  children: ReactNode
}) {
  const { items, goals, today } = usePlanner()
  const dueCount = items.filter(
    (i) => isActive(i) && i.due !== null && i.due <= today
  ).length
  // 가까운 것부터 올린다. 만들어 둔 차례대로 자르면 '다가오는' 이 아니게 된다.
  const dated = goals
    .filter((g) => g.archived_at === null && g.horizon_kind !== 'open')
    .sort((a, b) => (a.ready_at ?? '9999') < (b.ready_at ?? '9999') ? -1 : 1)
  const upcomingGoals = dated.slice(0, UPCOMING_SHOWN)
  const restGoals = dated.length - upcomingGoals.length
  const looseCount = items.filter((i) => isActive(i) && i.goal_id === null).length

  return (
    // macOS 창이 이미 테두리와 그림자와 둥근 모서리를 갖고 있다. 그 안에 같은 것을
    // 한 겹 더 그리면 창 속에 창이 든 것처럼 보인다. 창을 그대로 채운다.
    <div className="flex h-full bg-bg">
      <div className="flex h-full w-full overflow-hidden">
        <nav className="flex w-[196px] flex-none flex-col justify-between border-r border-line bg-surface px-3 py-5">
          <div className="flex flex-col gap-1">
            {NAV.map((entry) => (
              <button
                key={entry.key}
                type="button"
                // 옆줄에는 목표 이름도 같이 서 있다. 이름이 겹치지 않게 자리를 밝힌다.
                aria-label={`${entry.label} 화면`}
                onClick={() => onNavigate(entry.key)}
                className={cn(
                  'flex items-center justify-between rounded-ctl px-[10px] py-[7px] text-[13.5px] transition-colors',
                  screen === entry.key
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-text-2 hover:bg-hover'
                )}
              >
                <span className="flex items-center gap-[8px]">
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

            {upcomingGoals.length > 0 || looseCount > 0 ? (
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
                  <button
                    type="button"
                    onClick={() => onNavigate('goals')}
                    className="rounded-ctl px-[10px] py-[5px] pl-[22px] text-left text-[11.5px] text-text-3 transition-colors hover:bg-hover hover:text-text-2"
                  >
                    목표 <span className="num">{restGoals}</span>개 더
                  </button>
                ) : null}

                {/*
                  어디에도 안 넣은 항목은 수십 개까지 늘어난다. 여기에 늘어놓으면
                  옆줄이 그것만으로 채워지므로 개수 한 줄로 접고 서재에서 본다.
                */}
                {looseCount > 0 ? (
                  <button
                    type="button"
                    onClick={onOpenLoose}
                    className="mt-[6px] flex items-center gap-[7px] rounded-ctl border-t border-line px-[10px] pb-[5px] pt-[9px] text-left transition-colors hover:bg-hover"
                  >
                    <span
                      aria-hidden
                      className="h-[5px] w-[5px] flex-none rounded-full border border-line-2"
                    />
                    <span className="flex-1 truncate text-[12px] text-text-3">
                      목표에 안 넣은 것
                    </span>
                    <span className="num text-[12px] text-text-3">
                      {looseCount}
                    </span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            aria-label="설정 화면"
            onClick={() => onNavigate('settings')}
            className={cn(
              'rounded-ctl px-[10px] py-[7px] text-left text-[13.5px] transition-colors',
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
