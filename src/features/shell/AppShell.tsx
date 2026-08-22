import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { horizonLabel } from '../../lib/format'
import { usePlanner } from '../../store/planner'
import { isActive } from '../../lib/domain'

export type ScreenKey = 'today' | 'forecast' | 'goals' | 'library' | 'settings'

const NAV: { key: ScreenKey; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'forecast', label: '예보' },
  { key: 'goals', label: '목표' },
  { key: 'library', label: '서재' },
]

export function AppShell({
  screen,
  onNavigate,
  children,
}: {
  screen: ScreenKey
  onNavigate: (key: ScreenKey) => void
  children: ReactNode
}) {
  const { items, goals, today } = usePlanner()
  const dueCount = items.filter(
    (i) => isActive(i) && i.due !== null && i.due <= today
  ).length
  const upcomingGoals = goals
    .filter((g) => g.archived_at === null && g.horizon_kind !== 'open')
    .slice(0, 3)

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
                onClick={() => onNavigate(entry.key)}
                className={cn(
                  'flex items-center justify-between rounded-ctl px-[10px] py-[7px] text-[13.5px] transition-colors',
                  screen === entry.key
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-text-2 hover:bg-hover'
                )}
              >
                <span>{entry.label}</span>
                {entry.key === 'today' && dueCount > 0 ? (
                  <span className="num text-[12px]">{dueCount}</span>
                ) : null}
              </button>
            ))}

            {upcomingGoals.length > 0 ? (
              <div className="flex flex-col gap-[6px] pt-5">
                <span className="px-[10px] text-[11px] text-text-3">
                  다가오는 목표
                </span>
                {upcomingGoals.map((goal) => (
                  <div key={goal.id} className="px-[10px]">
                    <div className="truncate text-[12.5px] text-text-2">
                      {goal.name}
                    </div>
                    <div className="num text-[11.5px] text-text-3">
                      {horizonLabel(
                        goal.horizon_kind,
                        goal.ready_at,
                        goal.hold_until
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
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
