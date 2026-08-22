import { lazy, Suspense, useEffect, useState } from 'react'
import { AppShell, type ScreenKey } from './features/shell/AppShell'
import { GoalListScreen } from './features/goal/GoalListScreen'
import { LibraryScreen } from './features/library/LibraryScreen'
import { TodayScreen } from './features/today/TodayScreen'

/*
  차트를 쓰는 화면은 따로 떼어 낸다. 첫 화면인 오늘에는 차트가 없는데
  차트 라이브러리까지 같이 받아오면 처음 켤 때만 느려진다.
*/
const ForecastScreen = lazy(() =>
  import('./features/forecast/ForecastScreen').then((m) => ({
    default: m.ForecastScreen,
  }))
)
const GoalDetailScreen = lazy(() =>
  import('./features/goal/GoalDetailScreen').then((m) => ({
    default: m.GoalDetailScreen,
  }))
)
const ItemDetailScreen = lazy(() =>
  import('./features/item/ItemDetailScreen').then((m) => ({
    default: m.ItemDetailScreen,
  }))
)
const SettingsScreen = lazy(() =>
  import('./features/settings/SettingsScreen').then((m) => ({
    default: m.SettingsScreen,
  }))
)
import { Onboarding } from './features/onboarding/Onboarding'
import { isActive } from './lib/domain'
import { nowMinutes } from './lib/clock'
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
        nowMinutes(),
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
      <Suspense fallback={<ScreenLoading />}>
        {renderRoute(route, setRoute)}
      </Suspense>
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
        onDeleted={() => setRoute({ screen: 'goals' })}
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

function ScreenLoading() {
  return (
    <div className="mx-auto w-full max-w-[940px] px-6 py-7 text-[13px] text-text-3">
      불러오는 중
    </div>
  )
}
