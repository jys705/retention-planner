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
import { today as clockToday } from './lib/clock'
import { useHost } from './lib/host'
import { usePlanner } from './store/planner'
import { remindIfDue } from './store/reminder'

export type Route =
  | { screen: ScreenKey }
  | { screen: 'goals'; goalId: string }
  | { screen: 'library'; itemId: string }

/**
 * 밖에서 화면을 옮겨 달라는 부탁.
 *
 * 옮길 때마다 새로 만든다. 같은 화면을 두 번 부탁해도 두 번 옮긴다.
 */
export interface RouteRequest {
  route: Route
}

export function App({ request = null }: { request?: RouteRequest | null } = {}) {
  const ready = usePlanner((s) => s.ready)
  const load = usePlanner((s) => s.load)
  const theme = usePlanner((s) => s.settings.theme)
  const settings = usePlanner((s) => s.settings)
  const items = usePlanner((s) => s.items)
  const goals = usePlanner((s) => s.goals)
  const today = usePlanner((s) => s.today)
  const host = useHost()
  const [route, setRoute] = useState<Route>(request?.route ?? { screen: 'today' })
  // 옵시디언 노트 속 카드에서 항목을 누르면 떠 있는 앱 화면이 그 항목으로 옮겨 간다.
  // 새 부탁이 온 것을 그리는 중에 알아채고 바로 옮긴다.
  const [handled, setHandled] = useState<RouteRequest | null>(request)
  if (request !== handled) {
    setHandled(request)
    if (request) setRoute(request.route)
  }

  // 옵시디언에서는 플러그인이 먼저 읽어 둔다. 탭을 열 때마다 다시 읽으면 노트 속
  // 카드에서 방금 한 평가의 되돌리기 자리가 사라진다.
  useEffect(() => {
    if (!usePlanner.getState().ready) void load()
  }, [load])

  // 오늘은 앱을 켤 때 한 번만 읽힌다. 창을 띄워 둔 채 자정을 넘기면 '오늘' 칩이
  // 어제를 가리키고 진짜 오늘은 고를 수 없게 된다. 창이 다시 앞으로 나올 때 확인한다.
  useEffect(() => {
    function refresh() {
      const now = clockToday()
      if (now !== usePlanner.getState().today) void load()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  // 옵시디언 안에서는 문서 전체가 옵시디언 것이다. 밝기도 옵시디언 테마를 따른다.
  useEffect(() => {
    if (!host.ownsTheme) return
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme, host.ownsTheme])

  // 정해둔 시각이 지났으면 오늘 볼 게 몇 개인지 한 번 알려준다.
  useEffect(() => {
    if (!host.ownsReminder) return
    void remindIfDue()
  }, [ready, settings, items, goals, today, host.ownsReminder])

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
      onOpenGoal={(goalId) => setRoute({ screen: 'goals', goalId })}
      onOpenItem={(itemId) => setRoute({ screen: 'library', itemId })}
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
      return (
        <TodayScreen
          onOpenItem={(itemId) => setRoute({ screen: 'library', itemId })}
          onOpenGoal={(goalId) => setRoute({ screen: 'goals', goalId })}
        />
      )
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
