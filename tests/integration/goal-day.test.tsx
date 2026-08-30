// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { defaultFsrs } from '../../src/core/fsrs/fsrs6'
import { freezeToday } from '../../src/lib/clock'
import { addDays, diffDays } from '../../src/lib/date'
import { splitTodayItems, usePlanner } from '../../src/store/planner'
import { aGoal, anItem, render, setupApp, teardownApp } from '../scenarios/harness'

const START = '2026-10-01'
const TARGET = 0.9

beforeAll(() => freezeToday(START))
afterEach(teardownApp)

/**
 * 앱이 시키는 대로 하루씩 살아 본다. 목표한 날 전날까지만 보고,
 * 목표한 날 아침에 기억률이 어디까지 와 있는지 잰다.
 */
async function liveUntilGoal(bufferDays: string, runway: number, count: number) {
  const ready = addDays(START, runway)
  await setupApp(START, {
    settings: { bufferDays },
    goals: [
      aGoal({
        id: 'g1', horizon_kind: 'date', ready_at: ready,
        hold_until: ready, min_reviews: 3,
      }),
    ],
    items: Array.from({ length: count }, (_, i) =>
      anItem({
        id: `i${i}`, title: `항목 ${i}`, goal_id: 'g1',
        first_studied_at: '2026-09-01',
        last_review: addDays(START, -(2 + (i % 9))),
        due: addDays(START, (i % 5) + 1),
        stability: 3 + i * 1.5, difficulty: 5, reps: 2, reps_since_goal: 1,
      })
    ),
  })
  render(<div />)

  let onGoalDay: string[] = []
  for (let d = 0; d <= runway; d += 1) {
    const day = addDays(START, d)
    usePlanner.getState().setToday(day)
    await usePlanner.getState().recomputeAll()
    const { overdue, dueToday } = splitTodayItems(usePlanner.getState())
    const rows = [...overdue, ...dueToday]
    if (day === ready) {
      onGoalDay = rows.map((i) => i.due_kind ?? 'normal')
      break
    }
    for (const item of rows) {
      await usePlanner.getState().rateItem(item.id, 3, { reviewedAt: day })
    }
  }

  // 목표한 날 아침. 그날 뜬 것은 아직 안 봤다.
  const retentions = usePlanner
    .getState()
    .items.filter((i) => i.stability !== null && i.last_review !== null)
    .map((i) =>
      defaultFsrs.retrievability(
        Math.max(0, diffDays(i.last_review!, ready)),
        i.stability!
      )
    )
  return { onGoalDay, retentions }
}

describe('목표한 날 아침', () => {
  const WORLDS: [string, number, number][] = [
    ['0', 14, 12],
    ['0', 8, 16],
    ['0', 30, 24],
    ['1', 14, 12],
    ['1', 30, 24],
  ]

  for (const [buffer, runway, count] of WORLDS) {
    it(`S-206 버퍼 ${buffer} / ${runway}일 / ${count}개: 전날까지 목표 기억률에 닿는다`, async () => {
      const { onGoalDay, retentions } = await liveUntilGoal(buffer, runway, count)

      // 기억률이 먼저다. 목표한 날 아침에 미달이 하나도 없어야 한다.
      expect(retentions.filter((r) => r < TARGET)).toHaveLength(0)

      // 목표한 날에 뜨는 것은 해야 할 일이 아니라 권하는 일이어야 한다.
      // final_check 는 '건너뛰어도 목표 기억률을 지킨다' 는 뜻이다.
      expect(onGoalDay.filter((k) => k !== 'final_check')).toHaveLength(0)
    })
  }
})
