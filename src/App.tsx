import { useEffect, useState } from 'react'
import { AppShell, type ScreenKey } from './features/shell/AppShell'
import { ForecastScreen } from './features/forecast/ForecastScreen'
import { GoalDetailScreen } from './features/goal/GoalDetailScreen'
import { GoalListScreen } from './features/goal/GoalListScreen'
import { ItemDetailScreen } from './features/item/ItemDetailScreen'
import { LibraryScreen } from './features/library/LibraryScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { TodayScreen } from './features/today/TodayScreen'
import { Onboarding } from './features/onboarding/Onboarding'
import { isActive } from './lib/domain'
import { notifyDueCount, shouldNotify } from './lib/notify'
import { usePlanner } from './store/planner'

type Route =
  | { screen: ScreenKey }
  | { screen: 'goals'; goalId: string }
  | { screen: 'library'; itemId: string }

export function App() {
  const ready = usePlanner((s) => s.ready)
  const load = usePlanner((s) => s.load)
  const theme = usePlanner((s) => s.settings.theme)
  const settings = usePlanner((s) => s.settings)
  const items = usePlanner((s) => s.items)
  const today = usePlanner((s) => s.today)
  const saveSetting = usePlanner((s) => s.saveSetting)
  const [route, setRoute] = useState<Route>({ screen: 'today' })

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  // 정해둔 시각이 지났으면 오늘 볼 게 몇 개인지 한 번 알려준다.
  useEffect(() => {
    if (!ready || !settings.onboardingDone) return
    if (
      !shouldNotify(
        new Date(),
        settings.notifyAt,
        settings.lastNotifiedDate,
        today
      )
    ) {
      return
    }
    const due = items.filter(
      (i) => isActive(i) && i.due !== null && i.due <= today
    ).length
    void notifyDueCount(due, today).then((sent) => {
      if (sent) void saveSetting('lastNotifiedDate', today)
    })
  }, [ready, settings, items, today, saveSetting])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-desk text-[13px] text-text-3">
        불러오는 중
      </div>
    )
  }

  if (!settings.onboardingDone) return <Onboarding />

  return (
    <AppShell
      screen={route.screen}
      onNavigate={(screen) => setRoute({ screen })}
    >
      {renderRoute(route, setRoute)}
    </AppShell>
  )
}

function renderRoute(
  route: Route,
  setRoute: (next: Route) => void
): React.ReactNode {
  if ('itemId' in route) {
    return (
      <ItemDetailScreen
        itemId={route.itemId}
        onBack={() => setRoute({ screen: 'library' })}
      />
    )
  }
  if ('goalId' in route) {
    return (
      <GoalDetailScreen
        goalId={route.goalId}
        onOpenItem={(itemId) => setRoute({ screen: 'library', itemId })}
      />
    )
  }
  switch (route.screen) {
    case 'today':
      return <TodayScreen />
    case 'forecast':
      return <ForecastScreen />
    case 'goals':
      return (
        <GoalListScreen
          onOpenGoal={(goalId) => setRoute({ screen: 'goals', goalId })}
        />
      )
    case 'library':
      return (
        <LibraryScreen
          onOpenItem={(itemId) => setRoute({ screen: 'library', itemId })}
          onOpenGoal={(goalId) => setRoute({ screen: 'goals', goalId })}
        />
      )
    case 'settings':
      return <SettingsScreen />
  }
}
