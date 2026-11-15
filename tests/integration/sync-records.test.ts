import { afterEach, describe, expect, it } from 'vitest'
import { getRepository } from '../../src/db'
import { freezeToday, unfreezeToday } from '../../src/lib/clock'
import { EXPORT_VERSION } from '../../src/lib/transfer'
import { usePlanner } from '../../src/store/planner'
import { setupApp } from '../scenarios/harness'

afterEach(unfreezeToday)

const store = () => usePlanner.getState()
const tombstones = async () => (await getRepository()).listTombstones()

/**
 * 합치기가 기대는 흔적. 사람이 고친 때와 지운 것이 남아야 다른 컴퓨터의 파일과
 * 합칠 때 나중 것을 고르고 지운 것을 되살리지 않는다.
 */
describe('합치기에 쓰는 흔적', () => {
  it('손으로 고치면 고친 때가 남는다', async () => {
    await setupApp('2026-03-01')
    const item = await store().addItem({ title: '1장' })
    expect(item.updated_at).toBe(item.created_at)
    freezeToday('2026-03-02')
    await store().updateItem(item.id, { title: '1장 고침' })
    const after = store().items[0]
    expect(after.updated_at! > item.created_at).toBe(true)
    expect((await (await getRepository()).getItem(item.id))?.updated_at).toBe(after.updated_at)
  })

  it('평가는 고친 것으로 치지 않는다', async () => {
    // 평가로 바뀌는 기억 상태는 합칠 때 평가 기록에서 다시 셈한다.
    await setupApp('2026-03-01')
    const item = await store().addItem({ title: '1장' })
    freezeToday('2026-03-03')
    store().setToday('2026-03-03')
    await store().rateItem(item.id, 3, { reviewedAt: '2026-03-03' })
    expect(store().items[0].updated_at).toBe(item.updated_at)
  })

  it('항목을 지우면 지운 흔적이 남는다', async () => {
    await setupApp('2026-03-01')
    const item = await store().addItem({ title: '1장' })
    await store().deleteItem(item.id)
    expect((await tombstones()).map((t) => [t.id, t.kind])).toEqual([[item.id, 'item']])
  })

  it('평가를 물리면 그 평가의 흔적이 남는다', async () => {
    await setupApp('2026-03-01')
    const item = await store().addItem({ title: '1장' })
    freezeToday('2026-03-03')
    store().setToday('2026-03-03')
    await store().rateItem(item.id, 2, { reviewedAt: '2026-03-03' })
    const reviewId = store().lastRating!.reviewId
    await store().undoLastRating()
    expect((await tombstones()).map((t) => [t.id, t.kind])).toEqual([[reviewId, 'review']])
  })

  it('목표만 지우면 목표의 흔적이 남고 풀린 항목은 고친 때가 바뀐다', async () => {
    await setupApp('2026-03-01')
    const goal = await store().createGoal({ name: '시험', horizon: { kind: 'date', at: '2026-04-01' } })
    const item = await store().addItem({ title: '1장', goalId: goal.id })
    freezeToday('2026-03-02')
    await store().deleteGoal(goal.id)
    expect((await tombstones()).map((t) => [t.id, t.kind])).toEqual([[goal.id, 'goal']])
    const after = store().items[0]
    expect(after.goal_id).toBeNull()
    expect(after.updated_at! > item.updated_at!).toBe(true)
  })

  it('항목까지 지우면 목표와 항목의 흔적이 다 남는다', async () => {
    await setupApp('2026-03-01')
    const goal = await store().createGoal({ name: '시험', horizon: { kind: 'date', at: '2026-04-01' } })
    const item = await store().addItem({ title: '1장', goalId: goal.id })
    await store().deleteGoal(goal.id, { withItems: true })
    expect((await tombstones()).map((t) => t.id).sort()).toEqual([goal.id, item.id].sort())
  })

  it('내보낸 파일에 지운 흔적이 들어가고 스키마 번호는 안 들어간다', async () => {
    await setupApp('2026-03-01')
    const item = await store().addItem({ title: '1장' })
    await store().deleteItem(item.id)
    const backup = await store().exportBackup()
    expect(backup.version).toBe(EXPORT_VERSION)
    expect(backup.tombstones?.map((t) => t.id)).toEqual([item.id])
    expect(backup.settings.schema_version).toBeUndefined()
  })
})
