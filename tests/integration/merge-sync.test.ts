import { afterEach, describe, expect, it } from 'vitest'
import { replayByDay } from '../../src/core/simulate/replay'
import { freezeToday, unfreezeToday } from '../../src/lib/clock'
import { usePlanner } from '../../src/store/planner'
import { setupApp } from '../scenarios/harness'

afterEach(unfreezeToday)

const store = () => usePlanner.getState()

async function moveTo(date: string) {
  freezeToday(date)
  store().setToday(date)
  await store().recomputeAll()
}

/** 두 컴퓨터를 견줄 때 보는 칸. 잡아둔 복습과 설정은 컴퓨터마다 다를 수 있다. */
function view() {
  const { goals, items, reviews } = store()
  return {
    goals: goals.map((g) => [g.id, g.name]),
    items: [...items]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((i) => [i.id, i.title, i.goal_id, i.stability, i.difficulty, i.last_review, i.due, i.reps, i.state]),
    reviews: reviews.map((r) => r.id).sort(),
  }
}

describe('집과 회사의 기록 합치기', () => {
  it('두 컴퓨터가 서로의 파일을 합치면 같은 기록에 닿는다', async () => {
    // 집: 목표와 항목 셋을 적고 내보낸다. 회사는 이 파일로 시작한다.
    await setupApp('2026-03-01')
    const goal = await store().createGoal({ name: '시험', horizon: { kind: 'date', at: '2026-04-15' } })
    const one = await store().addItem({ title: '1장', goalId: goal.id })
    const two = await store().addItem({ title: '2장', goalId: goal.id })
    const three = await store().addItem({ title: '3장', goalId: goal.id })
    const start = await store().exportBackup()

    // 집: 1장을 보고, 3장을 지우고, 4장을 적는다.
    await moveTo('2026-03-04')
    await store().rateItem(one.id, 3, { reviewedAt: '2026-03-04' })
    await store().deleteItem(three.id)
    await store().addItem({ title: '4장', goalId: goal.id })
    const home = await store().exportBackup()

    // 회사: 같은 시작에서 1장을 따로 보고, 2장 제목을 고치고, 5장을 적는다.
    await setupApp('2026-03-05')
    await store().importAll(start)
    await store().rateItem(one.id, 1, { reviewedAt: '2026-03-05' })
    await store().updateItem(two.id, { title: '2장 다시 정리' })
    await store().addItem({ title: '5장', goalId: goal.id })
    const work = await store().exportBackup()

    // 집에서 회사 파일을 합친다.
    await setupApp('2026-03-06')
    await store().importAll(home)
    const atHomeResult = await store().mergeAll(work)
    const atHome = view()
    expect(atHomeResult).toEqual({ addedItems: 1, addedReviews: 2 })

    // 회사에서 집 파일을 합친다.
    await setupApp('2026-03-06')
    await store().importAll(work)
    await store().mergeAll(home)
    const atWork = view()

    expect(atWork).toEqual(atHome)
    expect(store().items.map((i) => i.title).sort()).toEqual(['1장', '2장 다시 정리', '4장', '5장'])

    // 1장은 처음 공부한 것, 집에서 본 것, 회사에서 본 것을 다 반영한다.
    const merged = store().items.find((i) => i.id === one.id)!
    const own = store().reviews.filter((r) => r.item_id === one.id)
    expect(own).toHaveLength(3)
    const replay = replayByDay(own.map((r) => ({ reviewedAt: r.reviewed_at, recordedAt: r.recorded_at, rating: r.rating })))!
    expect(merged.stability).toBe(replay.state.stability)
    expect(merged.last_review).toBe('2026-03-05')
    expect(merged.state).toBe('relearning')
  })

  it('같은 파일을 두 번 합쳐도 기록이 늘지 않는다', async () => {
    await setupApp('2026-03-01')
    await store().addItem({ title: '1장' })
    const first = await store().exportBackup()
    await setupApp('2026-03-02')
    await store().addItem({ title: '다른 컴퓨터의 것' })
    await store().mergeAll(first)
    const once = view()
    expect(await store().mergeAll(first)).toEqual({ addedItems: 0, addedReviews: 0 })
    expect(view()).toEqual(once)
  })

  it('합쳐도 이 컴퓨터의 설정은 그대로 둔다', async () => {
    await setupApp('2026-03-01')
    await store().saveSetting('dailyCap', 7)
    const other = await store().exportBackup()
    await setupApp('2026-03-02')
    await store().saveSetting('dailyCap', 33)
    await store().mergeAll(other)
    expect(store().settings.dailyCap).toBe(33)
  })
})
