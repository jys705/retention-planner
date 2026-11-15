import { afterEach, describe, expect, it } from 'vitest'
import { replayByDay } from '../../src/core/simulate/replay'
import { freezeToday, unfreezeToday } from '../../src/lib/clock'
import { addDays } from '../../src/lib/date'
import { usePlanner } from '../../src/store/planner'
import { setupApp } from '../scenarios/harness'

afterEach(unfreezeToday)

// 같은 씨앗이면 같은 수열이다. 실패하면 그 번호로 다시 본다.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('하루 마지막 평가로 다시 짚기', () => {
  it('한 컴퓨터에서 쌓은 기록은 저장된 기억 상태와 같게 나온다', async () => {
    // 두 컴퓨터의 기록을 합칠 때 이 방식으로 상태를 다시 셈한다. 한 컴퓨터의 기록에서
    // 저장된 값과 어긋나면, 합치기만 해도 멀쩡한 항목의 기억 상태가 바뀐다.
    for (let seed = 1; seed <= 40; seed += 1) {
      const r = rng(seed)
      const start = '2026-03-01'
      await setupApp(start)
      const backdated = Math.floor(r() * 4)
      const item = await usePlanner.getState().addItem({
        title: '항목',
        firstStudiedAt: addDays(start, -backdated),
        initialGrade: (1 + Math.floor(r() * 4)) as 1 | 2 | 3 | 4,
      })
      let day = start
      for (let step = 0; step < 12; step += 1) {
        // 같은 날 다시 누르기도 섞는다. 앱은 그날 첫 평가 전으로 되감는다.
        day = r() < 0.3 ? day : addDays(day, 1 + Math.floor(r() * 9))
        freezeToday(day)
        usePlanner.getState().setToday(day)
        await usePlanner
          .getState()
          .rateItem(item.id, (1 + Math.floor(r() * 4)) as 1 | 2 | 3 | 4, {
            reviewedAt: day,
          })
      }
      const state = usePlanner.getState()
      const stored = state.items.find((i) => i.id === item.id)!
      const replay = replayByDay(
        state.reviews
          .filter((rv) => rv.item_id === item.id)
          .map((rv) => ({
            reviewedAt: rv.reviewed_at,
            recordedAt: rv.recorded_at,
            rating: rv.rating,
          }))
      )!
      expect(replay.lastReview, `씨앗 ${seed}`).toBe(stored.last_review)
      expect(Math.abs(replay.state.stability - stored.stability!), `씨앗 ${seed}`).toBeLessThan(1e-9)
      expect(Math.abs(replay.state.difficulty - stored.difficulty!), `씨앗 ${seed}`).toBeLessThan(1e-9)
    }
  }, 120000)
})
