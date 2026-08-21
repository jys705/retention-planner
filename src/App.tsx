import { useEffect, useState } from 'react'
import { AppShell, type ScreenKey } from './features/shell/AppShell'
import { TodayScreen } from './features/today/TodayScreen'
import { usePlanner } from './store/planner'

export function App() {
  const ready = usePlanner((s) => s.ready)
  const load = usePlanner((s) => s.load)
  const theme = usePlanner((s) => s.settings.theme)
  const [screen, setScreen] = useState<ScreenKey>('today')

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
    <AppShell screen={screen} onNavigate={setScreen}>
      {screen === 'today' ? <TodayScreen /> : <Placeholder screen={screen} />}
    </AppShell>
  )
}

const PLACEHOLDER_LABEL: Record<Exclude<ScreenKey, 'today'>, string> = {
  forecast: '예보',
  goals: '목표',
  library: '서재',
  settings: '설정',
}

function Placeholder({ screen }: { screen: Exclude<ScreenKey, 'today'> }) {
  return (
    <div className="mx-auto w-full max-w-[940px] px-6 py-7">
      <h1 className="text-[20px] font-semibold">{PLACEHOLDER_LABEL[screen]}</h1>
      <p className="pt-2 text-[13px] text-text-2">준비 중이에요.</p>
    </div>
  )
}
