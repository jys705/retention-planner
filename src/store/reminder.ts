import { nowMinutes } from '../lib/clock'
import { notifyDueCount, shouldNotify } from '../lib/notify'
import { selectTodayItems, usePlanner } from './planner'

let sending = false

/**
 * 정해둔 시각이 지났으면 오늘 볼 게 몇 개인지 한 번 알려준다.
 *
 * 앱 화면이 떠 있을 때는 화면이 부르고, 옵시디언에서는 플러그인이 일정한 간격으로 부른다.
 * 알리는 중에 또 불려도 두 번 울리지 않는다.
 */
export async function remindIfDue(): Promise<boolean> {
  const state = usePlanner.getState()
  const { settings, today } = state
  if (!state.ready || !settings.onboardingDone) return false
  if (
    !shouldNotify(nowMinutes(), settings.notifyAt, settings.lastNotifiedDate, today)
  ) {
    return false
  }
  if (sending) return false
  sending = true
  try {
    // 알림이 말하는 수와 화면 머리의 큰 숫자가 같은 데서 나와야 한다.
    const due = selectTodayItems(state).length
    const sent = await notifyDueCount(due, today)
    if (sent) await usePlanner.getState().saveSetting('lastNotifiedDate', today)
    return sent
  } finally {
    sending = false
  }
}
