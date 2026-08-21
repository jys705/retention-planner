import { useEffect, useState } from 'react'
import { AppShell, type ScreenKey } from './features/shell/AppShell'
import { ForecastScreen } from './features/forecast/ForecastScreen'
import { GoalDetailScreen } from './features/goal/GoalDetailScreen'
import { GoalListScreen } from './features/goal/GoalListScreen'
import { ItemDetailScreen } from './features/item/ItemDetailScreen'
import { LibraryScreen } from './features/library/LibraryScreen'
import { TodayScreen } from './features/today/TodayScreen'
import { usePlanner } from './store/planner'

type Route =
  | { screen: ScreenKey }
  | { screen: 'goals'; goalId: string }
  | { screen: 'library'; itemId: string }

export function App() {
  const ready = usePlanner((s) => s.ready)
  const load = usePlanner((s) => s.load)
  const theme = usePlanner((s) => s.settings.theme)
  const [route, setRoute] = useState<Route>({ screen: 'today' })

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-desk text-[13px] text-text-3">
        불러오는 중
      </div>
    )
  }

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
      return <SettingsPlaceholder />
  }
}

function SettingsPlaceholder() {
  return (
    <div className="mx-auto w-full max-w-[940px] px-6 py-7">
      <h1 className="text-[22px] font-semibold">설정</h1>
      <p className="pt-2 text-[13px] text-text-2">준비 중이에요.</p>
    </div>
  )
}
