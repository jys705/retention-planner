import { beforeEach, describe, expect, it } from 'vitest'
import { resetRepositoryForTest } from '../../src/db'
import {
  selectOverallRetention,
  selectTodayItems,
  selectUpcoming,
  stateFromHistory,
  resetPlannerForTest,
  usePlanner,
} from '../../src/store/planner'
import { addDays } from '../../src/lib/date'

const TODAY = '2026-10-01'

async function freshStore(): Promise<void> {
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
}

describe('핵심 루프', () => {
  beforeEach(async () => {
    await freshStore()
  })

  it('목표를 만들고 항목을 넣고 평가까지 완주한다', async () => {
    const goal = await usePlanner.getState().createGoal({
      name: '시험 준비',
      horizon: { kind: 'date', at: addDays(TODAY, 45) },
      intensity: 'standard',
    })
    expect(usePlanner.getState().goals).toHaveLength(1)

    // 사흘 전에 공부해 두고 오늘 복습한 상황이다.
    const item = await usePlanner.getState().addItem({
      title: '1~10번 문제 풀이',
      goalId: goal.id,
      firstStudiedAt: addDays(TODAY, -3),
    })

    expect(item.stability).not.toBeNull()
    expect(item.due).not.toBeNull()
    expect(item.last_review).toBe(addDays(TODAY, -3))

    const beforeDue = usePlanner.getState().items[0].due

    await usePlanner.getState().rateItem(item.id, 3, { reviewedAt: TODAY })

    // 항목을 적을 때의 첫 평가와 방금 누른 평가, 둘이 남는다.
    const reviews = usePlanner.getState().reviews
    expect(reviews).toHaveLength(2)
    expect(reviews[0].reviewed_at).toBe(addDays(TODAY, -3))
    expect(reviews[1].item_id).toBe(item.id)
    expect(reviews[1].rating).toBe(3)
    expect(reviews[1].reviewed_at).toBe(TODAY)

    const after = usePlanner.getState().items[0]
    expect(after.reps).toBe(2)
    expect(after.last_review).toBe(TODAY)
    expect(after.due! > TODAY).toBe(true)
    // 평가가 반영돼 다음 날짜가 다시 잡혔다.
    expect(after.due).not.toBe(beforeDue)
    expect(after.stability).toBeGreaterThan(item.stability!)
  })

  it('평가가 저장소에도 남는다', async () => {
    const item = await usePlanner.getState().addItem({ title: '혼자 있는 항목' })
    await usePlanner.getState().rateItem(item.id, 4, { reviewedAt: TODAY })

    // 저장소는 그대로 두고 메모리 상태만 비운 뒤 다시 읽는다.
    usePlanner.setState({ ready: false, goals: [], items: [], reviews: [] })
    await usePlanner.getState().load()
    usePlanner.getState().setToday(TODAY)

    expect(usePlanner.getState().reviews).toHaveLength(2)
    expect(usePlanner.getState().items[0].reps).toBe(2)
  })

  it('저장된 상태가 평가 이력 재생 결과와 일치한다', async () => {
    const firstStudiedAt = addDays(TODAY, -30)
    const item = await usePlanner.getState().addItem({
      title: '재생 확인',
      firstStudiedAt,
    })

    let cursor = firstStudiedAt
    for (const grade of [3, 2, 4, 1, 3] as const) {
      cursor = addDays(cursor, 5)
      usePlanner.getState().setToday(cursor)
      await usePlanner.getState().rateItem(item.id, grade, { reviewedAt: cursor })
    }

    const stored = usePlanner.getState().items.find((i) => i.id === item.id)!
    // 항목을 만들 때의 첫 평가까지 이력에 있으므로 손대지 않고 그대로 재생한다.
    const full = stateFromHistory(usePlanner.getState().reviews, item.id)

    expect(full).not.toBeNull()
    expect(full!.stability).toBeCloseTo(stored.stability!, 9)
    expect(full!.difficulty).toBeCloseTo(stored.difficulty!, 9)
  })

  it('지난 날짜로 기록해도 그 시점에서 센다', async () => {
    const item = await usePlanner.getState().addItem({
      title: '어제 공부한 것',
      firstStudiedAt: addDays(TODAY, -10),
    })
    const yesterday = addDays(TODAY, -1)
    await usePlanner.getState().rateItem(item.id, 3, { reviewedAt: yesterday })

    const review = usePlanner.getState().reviews[1]
    expect(review.reviewed_at).toBe(yesterday)
    expect(review.elapsed_days).toBe(9)
    expect(usePlanner.getState().items[0].last_review).toBe(yesterday)
  })

  it('미래 날짜로는 기록되지 않는다', async () => {
    const item = await usePlanner.getState().addItem({ title: '미래 기록 시도' })
    await usePlanner
      .getState()
      .rateItem(item.id, 3, { reviewedAt: addDays(TODAY, 10) })
    expect(usePlanner.getState().reviews[0].reviewed_at).toBe(TODAY)
  })

  it("'다시' 를 누르면 잊음으로 세고 다시 익히는 상태가 된다", async () => {
    const item = await usePlanner.getState().addItem({
      title: '다시 볼 것',
      firstStudiedAt: addDays(TODAY, -5),
    })
    await usePlanner.getState().rateItem(item.id, 1, { reviewedAt: TODAY })
    const stored = usePlanner.getState().items[0]
    expect(stored.lapses).toBe(1)
    expect(stored.state).toBe('relearning')
  })

  it('같은 목표를 향하는 항목들이 서로 다른 날로 펴진다', async () => {
    const goal = await usePlanner.getState().createGoal({
      name: '정보보안 개념 정리',
      horizon: { kind: 'date', at: addDays(TODAY, 40) },
    })
    for (let i = 0; i < 24; i += 1) {
      await usePlanner.getState().addItem({
        title: `정보보안 개념 ${i + 1}`,
        goalId: goal.id,
        firstStudiedAt: addDays(TODAY, -(i % 12)),
      })
    }

    const dues = usePlanner
      .getState()
      .items.map((i) => i.due)
      .filter((d): d is string => d !== null)
    expect(new Set(dues).size).toBeGreaterThan(3)

    const counts = new Map<string, number>()
    for (const d of dues) counts.set(d, (counts.get(d) ?? 0) + 1)
    expect(Math.max(...counts.values())).toBeLessThan(24)
  })

  it('오늘 목록과 다음 예정일을 골라낸다', async () => {
    await usePlanner.getState().addItem({
      title: '오늘 볼 것',
      firstStudiedAt: addDays(TODAY, -30),
    })
    await usePlanner.getState().addItem({ title: '나중에 볼 것' })

    const todayList = selectTodayItems(usePlanner.getState())
    expect(todayList.length).toBeGreaterThanOrEqual(1)
    expect(todayList.every((i) => i.due! <= TODAY)).toBe(true)

    const upcoming = selectUpcoming(usePlanner.getState().items, TODAY)
    expect(upcoming.length).toBeGreaterThanOrEqual(1)
    expect(upcoming[0].date > TODAY).toBe(true)
  })

  it('전체 기억률이 0 과 1 사이로 나온다', async () => {
    await usePlanner.getState().addItem({ title: '가' })
    await usePlanner.getState().addItem({ title: '나' })
    const overall = selectOverallRetention(usePlanner.getState().items, TODAY)
    expect(overall).toBeGreaterThan(0)
    expect(overall).toBeLessThanOrEqual(1)
  })

  it('항목을 지우면 평가 이력도 함께 사라진다', async () => {
    const item = await usePlanner.getState().addItem({ title: '지울 것' })
    await usePlanner.getState().rateItem(item.id, 3)
    expect(usePlanner.getState().reviews).toHaveLength(2)
    await usePlanner.getState().deleteItem(item.id)
    expect(usePlanner.getState().items).toHaveLength(0)
    expect(usePlanner.getState().reviews).toHaveLength(0)
  })
})
