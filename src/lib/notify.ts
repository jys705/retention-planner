import type { DateOnly } from './date'

/**
 * 하루 한 번, 정해둔 시각에 오늘 볼 게 몇 개인지 알려준다.
 *
 * Tauri 셸 안에서는 네이티브 알림을 쓰고, 브라우저에서는 웹 알림으로 대신한다.
 * 권한을 거절하면 조용히 넘어간다. 알림 때문에 앱이 막히면 안 된다.
 */
export async function notifyDueCount(
  count: number,
  today: DateOnly
): Promise<boolean> {
  if (count <= 0) return false
  const title = '오늘 다시 볼 항목'
  const body = `${count}개가 기다리고 있어요.`

  try {
    if (isTauriShell()) {
      const plugin = await import('@tauri-apps/plugin-notification')
      let granted = await plugin.isPermissionGranted()
      if (!granted) granted = (await plugin.requestPermission()) === 'granted'
      if (!granted) return false
      plugin.sendNotification({ title, body })
      return true
    }

    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'denied') return false
    if (Notification.permission !== 'granted') {
      if ((await Notification.requestPermission()) !== 'granted') return false
    }
    new Notification(title, { body, tag: `retention-planner:${today}` })
    return true
  } catch {
    return false
  }
}

function isTauriShell(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

/**
 * 지금이 알림 시각을 지났는지. 하루에 한 번만 울리게 마지막 날짜와 함께 본다.
 *
 * 시계를 직접 읽지 않고 자정부터의 분을 받는다. 시험에서 시각을 고정할 수 있어야 한다.
 */
export function shouldNotify(
  minutesNow: number,
  notifyAt: string | null,
  lastNotifiedDate: string | null,
  today: DateOnly
): boolean {
  if (!notifyAt) return false
  if (lastNotifiedDate === today) return false
  const [hour, minute] = notifyAt.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false
  return minutesNow >= hour * 60 + minute
}
