import { afterEach, describe, expect, it } from 'vitest'
import { replayRowsByDay } from '../../src/core/simulate/replay'
import type { ReviewRow } from '../../src/db/types'
import { freezeToday, unfreezeToday } from '../../src/lib/clock'
import { retentionOn } from '../../src/lib/lifecycle'
import type { Backup } from '../../src/lib/transfer'
import { usePlanner } from '../../src/store/planner'
import { setupApp } from '../scenarios/harness'

afterEach(unfreezeToday)

const store = () => usePlanner.getState()

/** 그 컴퓨터의 시계를 그날 그 시각에 맞춘다. */
function at(date: string, hour: number, minute = 0) {
  freezeToday(date, hour * 60 + minute)
  store().setToday(date)
}

/** 다른 컴퓨터를 켠다. 그 컴퓨터가 마지막으로 남긴 기록을 그날 연다. */
async function open(date: string, saved: Backup) {
  await setupApp(date)
  await store().importAll(saved)
}

/** 두 컴퓨터를 견줄 때 보는 칸. 잡아둔 복습과 설정은 컴퓨터마다 다를 수 있다. */
function view() {
  const { goals, items, reviews } = store()
  return {
    goals: [...goals]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((g) => [g.id, g.name, g.horizon_kind, g.ready_at, g.hold_until]),
    items: [...items]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((i) => [
        i.id,
        i.title,
        i.memo,
        i.goal_id,
        i.state,
        i.archived_at !== null,
        i.horizon_kind,
        i.ready_at,
        i.stability,
        i.due,
      ]),
    reviews: [...reviews]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((r) => [r.id, r.s_before, r.s_after, r.elapsed_days, r.r_at_review]),
  }
}

/** 서로의 파일을 합친 두 컴퓨터. 같은 기록에 닿아야 한다. */
async function exchange(date: string, home: Backup, work: Backup) {
  await open(date, home)
  await store().mergeAll(work)
  const atHome = view()
  const homeItems = store().items
  await open(date, work)
  await store().mergeAll(home)
  const atWork = view()
  expect(atWork).toEqual(atHome)
  return homeItems
}

describe('두 컴퓨터를 오가는 기록', () => {
  it('목표만 지운 컴퓨터가 다른 컴퓨터에서 지운 항목을 되살리지 않는다', async () => {
    await setupApp('2026-03-01')
    const goal = await store().createGoal({ name: '시험', horizon: { kind: 'date', at: '2026-04-15' } })
    const z = await store().addItem({ title: 'Z', goalId: goal.id })
    const k = await store().addItem({ title: 'K', goalId: goal.id })
    const start = await store().exportBackup()

    await open('2026-03-02', start)
    at('2026-03-02', 8)
    await store().deleteItem(z.id)
    const work = await store().exportBackup()

    await open('2026-03-02', start)
    at('2026-03-02', 9)
    await store().deleteGoal(goal.id)
    const home = await store().exportBackup()

    const items = await exchange('2026-03-02', home, work)
    expect(items.map((i) => i.id)).toEqual([k.id])
    expect(items[0].goal_id).toBeNull()
  })

  it('목표만 지워도 다른 컴퓨터에서 고친 메모는 남는다', async () => {
    await setupApp('2026-03-01')
    const goal = await store().createGoal({ name: '시험', horizon: { kind: 'date', at: '2026-04-15' } })
    const m = await store().addItem({ title: 'M', goalId: goal.id })
    const start = await store().exportBackup()

    await open('2026-03-02', start)
    at('2026-03-02', 9)
    await store().updateItem(m.id, { memo: '회사 메모' })
    const work = await store().exportBackup()

    await open('2026-03-02', start)
    at('2026-03-02', 20)
    await store().deleteGoal(goal.id)
    const home = await store().exportBackup()

    const items = await exchange('2026-03-02', home, work)
    expect(items.map((i) => [i.memo, i.goal_id])).toEqual([['회사 메모', null]])
  })

  // 고친 때가 같은 두 행은 내용으로 갈린다. 여기서는 보관한 때가 늦은 쪽이 골라진다.
  // 그래서 어느 컴퓨터가 늦게 켰느냐에 따라 지운 쪽 행이 남기도 하고 다른 쪽 행이 남기도 한다.
  for (const [homeOpens, workOpens] of [
    ['2026-03-07', '2026-03-06'],
    ['2026-03-06', '2026-03-07'],
  ] as const) {
    it(`끝난 목표만 지우면 어느 쪽 행이 남아도 목표 시점을 옮겨 담는다 (집 ${homeOpens}, 회사 ${workOpens})`, async () => {
      await setupApp('2026-03-01')
      const goal = await store().createGoal({ name: '시험', horizon: { kind: 'date', at: '2026-03-05' } })
      const item = await store().addItem({ title: '1장', goalId: goal.id })
      const start = await store().exportBackup()

      // 둘 다 목표가 끝난 뒤에 켜서 항목이 보관된다.
      await open(workOpens, start)
      const work = await store().exportBackup()
      await open(homeOpens, start)
      at('2026-03-07', 9)
      await store().deleteGoal(goal.id)
      const home = await store().exportBackup()
      const carried = store().items.find((i) => i.id === item.id)!
      expect([carried.horizon_kind, carried.ready_at]).toEqual(['date', '2026-03-05'])

      const items = await exchange('2026-03-08', home, work)
      const merged = items.find((i) => i.id === item.id)!
      // 마친 것이 목표 시점 없는 것이 되어 되살아나면 안 된다.
      expect([merged.goal_id, merged.state, merged.horizon_kind, merged.ready_at]).toEqual([
        null,
        'archived',
        'date',
        '2026-03-05',
      ])
    })
  }

  it('다시 연 목표의 항목은 다른 컴퓨터에서 고친 것이 있어도 되살아난다', async () => {
    await setupApp('2026-03-01')
    const goal = await store().createGoal({ name: '시험', horizon: { kind: 'date', at: '2026-03-10' } })
    const q = await store().addItem({ title: 'Q', goalId: goal.id })
    const q2 = await store().addItem({ title: 'Q2', goalId: goal.id })
    const start = await store().exportBackup()

    // 회사: 끝난 목표의 Q 제목만 고친다.
    await open('2026-03-11', start)
    at('2026-03-12', 10)
    await store().updateItem(q.id, { title: 'Q 회사' })
    const work = await store().exportBackup()

    // 집: 그날 저녁 목표 날짜를 다시 정한다.
    await open('2026-03-11', start)
    at('2026-03-12', 20)
    await store().reopenGoal(goal.id, { kind: 'date', at: '2026-04-30' })
    const home = await store().exportBackup()

    const items = await exchange('2026-03-12', home, work)
    expect(
      items
        .filter((i) => i.id === q.id || i.id === q2.id)
        .map((i) => [i.title, i.state, i.archived_at])
        .sort()
    ).toEqual([
      ['Q 회사', 'review', null],
      ['Q2', 'review', null],
    ])
  })

  it('다시 연 것을 되돌렸으면 그 전에 내보낸 파일을 합쳐도 되돌린 대로다', async () => {
    await setupApp('2026-03-01')
    const goal = await store().createGoal({ name: '시험', horizon: { kind: 'date', at: '2026-03-10' } })
    const item = await store().addItem({ title: '1장', goalId: goal.id })
    const start = await store().exportBackup()

    await open('2026-03-13', start)
    at('2026-03-13', 10)
    await store().reopenGoal(goal.id, { kind: 'open' })
    at('2026-03-13', 10, 2)
    const carried = await store().exportBackup()
    at('2026-03-13', 10, 5)
    await store().undoReopen()
    const home = await store().exportBackup()

    // 회사가 들고 간 파일을 먼저 합치고, 되돌린 뒤의 파일도 합친다.
    await open('2026-03-13', start)
    at('2026-03-13', 12)
    await store().mergeAll(carried)
    await store().mergeAll(home)
    const work = await store().exportBackup()

    await exchange('2026-03-13', home, work)
    const g = store().goals.find((x) => x.id === goal.id)!
    const i = store().items.find((x) => x.id === item.id)!
    expect([g.horizon_kind, g.ready_at, i.state]).toEqual(['date', '2026-03-10', 'archived'])
  })

  it('합친 평가 기록의 그때 값도 한 컴퓨터에서 한 것과 같다', async () => {
    await setupApp('2026-03-01')
    const goal = await store().createGoal({ name: '시험', horizon: { kind: 'date', at: '2026-03-20' } })
    const rx = await store().addItem({ title: 'RX', goalId: goal.id })
    const start = await store().exportBackup()

    await open('2026-03-03', start)
    at('2026-03-03', 9)
    await store().rateItem(rx.id, 3, { reviewedAt: '2026-03-03' })
    const work = await store().exportBackup()

    // 집은 회사 평가를 모른 채 밀린 것으로 보고 평가한다.
    await open('2026-03-05', start)
    at('2026-03-05', 9)
    await store().rateItem(rx.id, 2, { reviewedAt: '2026-03-05' })
    const home = await store().exportBackup()

    // 한 컴퓨터에서 같은 평가를 한 것.
    await open('2026-03-03', start)
    at('2026-03-03', 9)
    await store().rateItem(rx.id, 3, { reviewedAt: '2026-03-03' })
    at('2026-03-05', 9)
    await store().rateItem(rx.id, 2, { reviewedAt: '2026-03-05' })
    const single = store().reviews
      .filter((r) => r.item_id === rx.id)
      .sort((a, b) => (a.reviewed_at < b.reviewed_at ? -1 : 1))
    const singleItem = store().items.find((i) => i.id === rx.id)!

    await exchange('2026-03-05', home, work)
    const merged = store().reviews
      .filter((r) => r.item_id === rx.id)
      .sort((a, b) => (a.reviewed_at < b.reviewed_at ? -1 : 1))
    const fields = (r: ReviewRow) => [r.reviewed_at, r.rating, r.s_before, r.d_before, r.s_after, r.d_after, r.elapsed_days, r.r_at_review]
    expect(merged.map(fields)).toEqual(single.map(fields))
    const mergedItem = store().items.find((i) => i.id === rx.id)!
    expect(retentionOn(mergedItem, merged, '2026-03-20')).toBe(
      retentionOn(singleItem, single, '2026-03-20')
    )
  })

  it('처음 공부한 날의 다시는 합쳐도 잊은 횟수로 세지 않는다', async () => {
    await setupApp('2026-03-01')
    const item = await store().addItem({ title: '1장', initialGrade: 1 })
    expect(store().items[0].lapses).toBe(0)
    const start = await store().exportBackup()
    await open('2026-03-04', start)
    at('2026-03-04', 9)
    await store().rateItem(item.id, 3, { reviewedAt: '2026-03-04' })
    const work = await store().exportBackup()
    const items = await exchange('2026-03-04', start, work)
    expect(items[0].lapses).toBe(0)
    expect(items[0].reps).toBe(2)
  })
})

describe('한 컴퓨터의 기록은 다시 셈해도 그대로다', () => {
  // 같은 씨앗이면 같은 수열이다. 실패하면 그 번호로 다시 본다.
  function rng(seed: number) {
    let s = seed >>> 0
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 2 ** 32
    }
  }

  it('평가마다 적힌 그때 값이 다시 셈한 값과 같다', async () => {
    // 합칠 때 평가 기록의 그때 값을 다시 적는다. 한 컴퓨터의 기록에서 어긋나면 합치기만 해도
    // 멀쩡한 이력 표의 숫자가 바뀐다.
    for (let seed = 1; seed <= 40; seed += 1) {
      const r = rng(seed)
      await setupApp('2026-03-01')
      const item = await store().addItem({
        title: '항목',
        firstStudiedAt: `2026-02-${String(26 + Math.floor(r() * 4)).padStart(2, '0')}`,
        initialGrade: (1 + Math.floor(r() * 4)) as 1 | 2 | 3 | 4,
      })
      let day = '2026-03-01'
      for (let step = 0; step < 12; step += 1) {
        // 같은 날 다시 누르기도 섞는다.
        if (r() >= 0.3) {
          const next = new Date(`${day}T00:00:00Z`)
          next.setUTCDate(next.getUTCDate() + 1 + Math.floor(r() * 9))
          day = next.toISOString().slice(0, 10)
        }
        at(day, 9, step)
        await store().rateItem(item.id, (1 + Math.floor(r() * 4)) as 1 | 2 | 3 | 4, { reviewedAt: day })
      }
      const stored = store().reviews.filter((rv) => rv.item_id === item.id)
      const replayed = replayRowsByDay(
        stored.map((rv) => ({ reviewedAt: rv.reviewed_at, recordedAt: rv.recorded_at, rating: rv.rating }))
      )
      expect(replayed).toHaveLength(stored.length)
      const byKey = new Map(stored.map((rv) => [`${rv.reviewed_at}|${rv.recorded_at}`, rv]))
      for (const { entry, row } of replayed) {
        const rv = byKey.get(`${entry.reviewedAt}|${entry.recordedAt}`)!
        const label = `씨앗 ${seed} ${rv.reviewed_at}`
        expect(row.before?.stability ?? null, label).toBe(rv.s_before === null ? null : row.before!.stability)
        if (rv.s_before !== null) {
          expect(Math.abs(row.before!.stability - rv.s_before), label).toBeLessThan(1e-9)
          expect(Math.abs(row.before!.difficulty - rv.d_before!), label).toBeLessThan(1e-9)
        } else {
          expect(row.before, label).toBeNull()
        }
        expect(Math.abs(row.after.stability - rv.s_after), label).toBeLessThan(1e-9)
        expect(Math.abs(row.after.difficulty - rv.d_after), label).toBeLessThan(1e-9)
        expect(row.elapsedDays, label).toBe(rv.elapsed_days)
        expect(Math.abs(row.retrievabilityAtReview - rv.r_at_review), label).toBeLessThan(1e-9)
      }
    }
  }, 120000)
})
