import { afterEach, describe, expect, it } from 'vitest'
import { freezeToday, unfreezeToday } from '../../src/lib/clock'
import { addDays } from '../../src/lib/date'
import { retentionOn } from '../../src/lib/lifecycle'
import { selectTodayItems, usePlanner } from '../../src/store/planner'
import { setupApp } from '../scenarios/harness'

const START = '2026-11-02'
const GOAL_IN = 16
const GOAL_DAY = addDays(START, GOAL_IN)

afterEach(unfreezeToday)

/**
 * 앱이 시키는 대로 하루씩 살아 본다. 그날 오늘 목록에 선 것을 모두 같은 등급으로 본다.
 * 목표한 날 아침에 멈춘다.
 */
async function liveUntilGoal(intensity: 'standard' | 'max', grade: 3 | 4) {
  await setupApp(START)
  const goal = await usePlanner.getState().createGoal({
    name: '시험',
    horizon: { kind: 'date', at: GOAL_DAY },
    intensity,
  })
  for (let i = 0; i < 5; i += 1) {
    await usePlanner.getState().addItem({ title: `${i + 1}장`, goalId: goal.id })
  }
  for (let day = 1; day < GOAL_IN; day += 1) {
    const date = addDays(START, day)
    freezeToday(date)
    usePlanner.getState().setToday(date)
    await usePlanner.getState().recomputeAll()
    for (const item of selectTodayItems(usePlanner.getState())) {
      await usePlanner.getState().rateItem(item.id, grade, { reviewedAt: date })
    }
  }
  return usePlanner.getState()
}

describe('최소 복습 횟수', () => {
  it('S-250 최소 세 번이면 목표한 날까지 세 번 본다', async () => {
    // 평가를 적을 때 지금 적는 그 한 번을 빼고 세서, 세 번이면 될 것을 네 번씩
    // 보게 하던 셈을 바로잡았다. 처음 공부한 것도 한 번 본 것이다.
    const state = await liveUntilGoal('standard', 3)
    for (const item of state.items) {
      expect(item.reps_since_goal).toBe(3)
      // 그래도 목표한 날 기억률은 목표 위다.
      expect(retentionOn(item, state.reviews, GOAL_DAY)).toBeGreaterThanOrEqual(0.9)
    }
  })

  it('S-251 강도가 높으면 그만큼 더 본다. 최소 횟수는 바닥일 뿐이다', async () => {
    const standard = await liveUntilGoal('standard', 3)
    const looks = (s: typeof standard) =>
      s.items.reduce((sum, item) => sum + item.reps_since_goal, 0)
    const atStandard = looks(standard)
    const max = await liveUntilGoal('max', 3)
    expect(looks(max)).toBeGreaterThan(atStandard)
  })
})
