import { beforeEach, describe, expect, it } from 'vitest'
import { resetRepositoryForTest } from '../../src/db'
import { addDays } from '../../src/lib/date'
import {
  resetPlannerForTest,
  spreadPreview,
  usePlanner,
} from '../../src/store/planner'

const TODAY = '2026-08-22'
const EXAM = '2026-10-18'

async function seed(count: number): Promise<string> {
  resetRepositoryForTest()
  resetPlannerForTest()
  usePlanner.setState({
    ready: false,
    goals: [],
    items: [],
    reviews: [],
    today: TODAY,
  })
  await usePlanner.getState().load()
  usePlanner.getState().setToday(TODAY)

  const goal = await usePlanner.getState().createGoal({
    name: 'AWS SCS-C03',
    horizon: { kind: 'date', at: EXAM },
    intensity: 'standard',
  })

  for (let i = 0; i < count; i += 1) {
    await usePlanner.getState().addItem({
      title: `AWS SCS-C03 ${i * 10 + 1}~${i * 10 + 10}번 문제 풀이`,
      goalId: goal.id,
      firstStudiedAt: addDays(TODAY, -(2 + (i % 26))),
    })
  }
  return goal.id
}

/** 항목들을 여러 번 평가해서 마감선이 끌어당기는 상태까지 밀어 올린다. */
async function reviewUntilPulled(rounds: number): Promise<void> {
  let cursor = TODAY
  for (let r = 0; r < rounds; r += 1) {
    const due = usePlanner
      .getState()
      .items.filter((i) => i.due !== null && i.due <= cursor)
    if (due.length === 0) {
      const next = usePlanner
        .getState()
        .items.map((i) => i.due)
        .filter((d): d is string => d !== null)
        .sort()[0]
      if (!next) break
      cursor = next
      usePlanner.getState().setToday(cursor)
      continue
    }
    for (const item of due) {
      await usePlanner.getState().rateItem(item.id, 4, { reviewedAt: cursor })
    }
  }
}

describe('앱 안에서의 날짜 조정', () => {
  beforeEach(() => {
    resetRepositoryForTest()
    resetPlannerForTest()
  })

  it('마감선이 끌어당긴 항목들의 몰림을 실제로 덜어낸다', async () => {
    const goalId = await seed(22)
    await reviewUntilPulled(40)
    usePlanner.getState().setToday(TODAY)
    await usePlanner.getState().recomputeAll()

    const { items, goals, settings } = usePlanner.getState()
    const preview = spreadPreview(items, goals, settings, TODAY, EXAM)
    expect(preview).not.toBeNull()
    expect(preview!.assignments.length).toBeGreaterThan(1)
    // 조정 전에는 마감선 하루 앞에 그대로 쌓인다.
    expect(preview!.peakBefore).toBeGreaterThan(preview!.peakAfter)
    expect(goals.find((g) => g.id === goalId)).toBeDefined()
  })

  it('평소 간격으로 도는 항목은 건드리지 않는다', async () => {
    await seed(8)
    const before = usePlanner
      .getState()
      .items.map((i) => ({ id: i.id, due: i.due, source: i.due_source }))
    await usePlanner.getState().recomputeAll()
    const after = usePlanner
      .getState()
      .items.map((i) => ({ id: i.id, due: i.due, source: i.due_source }))
    expect(after).toEqual(before)
    expect(after.every((i) => i.source === 'fsrs')).toBe(true)
  })

  it('다시 계산해도 일정이 흔들리지 않는다', async () => {
    await seed(16)
    await reviewUntilPulled(30)
    usePlanner.getState().setToday(TODAY)
    await usePlanner.getState().recomputeAll()
    const first = usePlanner.getState().items.map((i) => i.due)
    for (let i = 0; i < 5; i += 1) {
      await usePlanner.getState().recomputeAll()
    }
    expect(usePlanner.getState().items.map((i) => i.due)).toEqual(first)
  })

  it('조정된 항목에는 조정됨 표시가 붙는다', async () => {
    await seed(22)
    await reviewUntilPulled(40)
    usePlanner.getState().setToday(TODAY)
    await usePlanner.getState().recomputeAll()
    const moved = usePlanner
      .getState()
      .items.filter((i) => i.due_source === 'spread')
    expect(moved.length).toBeGreaterThan(0)
  })
})

describe('하루 상한', () => {
  it('모든 목표를 합쳐 하루 상한을 넘지 않게 편다', async () => {
    resetRepositoryForTest()
    resetPlannerForTest()
    usePlanner.setState({
      ready: false,
      goals: [],
      items: [],
      reviews: [],
      today: TODAY,
    })
    await usePlanner.getState().load()
    usePlanner.getState().setToday(TODAY)
    await usePlanner.getState().saveSetting('dailyCap', 4)

    // 같은 날 공부한 항목을 잔뜩 넣으면 다음 복습이 한 날에 몰린다.
    for (let i = 0; i < 24; i += 1) {
      await usePlanner.getState().addItem({
        title: `몰림 확인 ${i + 1}`,
        firstStudiedAt: TODAY,
      })
    }
    await usePlanner.getState().recomputeAll()

    const counts = new Map<string, number>()
    for (const item of usePlanner.getState().items) {
      if (!item.due) continue
      counts.set(item.due, (counts.get(item.due) ?? 0) + 1)
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(4)
  })

  it('상한을 올리면 다시 모인다', async () => {
    resetRepositoryForTest()
    resetPlannerForTest()
    usePlanner.setState({
      ready: false,
      goals: [],
      items: [],
      reviews: [],
      today: TODAY,
    })
    await usePlanner.getState().load()
    usePlanner.getState().setToday(TODAY)
    await usePlanner.getState().saveSetting('dailyCap', 50)

    for (let i = 0; i < 12; i += 1) {
      await usePlanner.getState().addItem({
        title: `여유 확인 ${i + 1}`,
        firstStudiedAt: TODAY,
      })
    }
    await usePlanner.getState().recomputeAll()

    const counts = new Map<string, number>()
    for (const item of usePlanner.getState().items) {
      if (!item.due) continue
      counts.set(item.due, (counts.get(item.due) ?? 0) + 1)
    }
    // 상한이 넉넉하면 굳이 흩뜨리지 않는다.
    expect(Math.max(...counts.values())).toBeGreaterThan(4)
  })
})
