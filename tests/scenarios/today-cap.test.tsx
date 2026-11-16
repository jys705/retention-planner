// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { selectTodayItems, usePlanner } from '../../src/store/planner'
import {
  aGoal,
  anItem,
  itemsById,
  quickAdd,
  render,
  setupApp,
  shift,
  teardownApp,
} from './harness'

/**
 * 하루 상한이 넘친 날을 덜어낼 때.
 *
 * 덜어낸 것을 앞당길 자리로 오늘도 본다. 그런데 오늘 본 것을 오늘로 당기면 방금
 * 공부한 것이 오늘 목록에 또 선다. 오늘 본 것은 내일부터 자리를 찾아야 한다.
 */
const TODAY = '2026-11-10'
const EXAM = shift(TODAY, 6)
const CAP = 3
const noop = () => {}

afterEach(teardownApp)

/** 오늘 공부한 것 열다섯 개를 목표에 적는다. 상한 3이면 닷새 치다. */
async function addStudiedToday(goalId: string) {
  for (let n = 1; n <= 15; n += 1) {
    await usePlanner.getState().addItem({ title: `문제 풀이 ${n}`, goalId })
  }
}

/** 다음 날짜가 마지막으로 본 날이거나 그 전인 것. 있으면 방금 본 것이 또 선다. */
function backOnLastReview() {
  return usePlanner
    .getState()
    .items.filter((i) => i.due !== null && i.last_review !== null && i.due <= i.last_review)
}

/** 하루에 잡힌 가장 많은 개수. */
function busiestDay() {
  const count = new Map<string, number>()
  for (const item of usePlanner.getState().items) {
    if (item.due) count.set(item.due, (count.get(item.due) ?? 0) + 1)
  }
  return Math.max(...count.values())
}

describe('하루 상한과 오늘 본 것', () => {
  it('S-284 넘친 날을 덜어낼 때 오늘 공부한 것을 오늘로 당기지 않는다', async () => {
    await setupApp(TODAY, { settings: { dailyCap: String(CAP) } })
    const goal = await usePlanner.getState().createGoal({
      name: '자격증 시험',
      horizon: { kind: 'date', at: EXAM },
      minReviews: 3,
    })
    await addStudiedToday(goal.id)
    render(<TodayScreen onOpenItem={noop} />)

    // 새로 적기만 했고 복습한 것은 없다. 오늘 목록이 처음부터 빈 날이다.
    expect(await screen.findByText('오늘은 볼 게 없어요.')).toBeInTheDocument()
    expect(selectTodayItems(usePlanner.getState())).toHaveLength(0)
    expect(backOnLastReview()).toHaveLength(0)
    // 오늘을 못 쓰는 만큼 뒤로 가도 상한은 그대로 지킨다.
    expect(busiestDay()).toBeLessThanOrEqual(CAP)
  })

  it('S-285 목표 없이 적은 것도 오늘로 당기지 않는다', async () => {
    await setupApp(TODAY, { settings: { dailyCap: String(CAP) } })
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    for (let n = 1; n <= 15; n += 1) {
      await quickAdd(user, screen, `읽은 글 ${n}`)
    }

    expect(usePlanner.getState().items).toHaveLength(15)
    expect(await screen.findByText('오늘은 볼 게 없어요.')).toBeInTheDocument()
    expect(backOnLastReview()).toHaveLength(0)
    expect(busiestDay()).toBeLessThanOrEqual(CAP)
  })

  it('S-286 오늘 볼 것을 평가해도 상한이 오늘로 되돌리지 않는다', async () => {
    await setupApp(TODAY, {
      settings: { dailyCap: String(CAP) },
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: EXAM,
          hold_until: EXAM,
        }),
      ],
      items: [
        anItem({
          id: 'due',
          title: '이틀 전에 본 것',
          goal_id: 'g1',
          first_studied_at: shift(TODAY, -2),
          last_review: shift(TODAY, -2),
          due: TODAY,
        }),
      ],
    })
    await addStudiedToday('g1')
    const { user } = render(<TodayScreen onOpenItem={noop} />)

    // 오늘 목록에는 이틀 전에 본 것만 선다. 오늘 적은 것은 끼지 않는다.
    expect(await screen.findAllByRole('checkbox')).toHaveLength(1)
    await user.click(screen.getByRole('checkbox', { name: '이틀 전에 본 것 평가하기' }))
    await user.click(screen.getByRole('button', { name: /^무난함/ }))

    // 평가한 것은 내일부터 잡히고, 비어 버린 오늘 자리로 다른 오늘 본 것을 끌어오지도 않는다.
    expect(await screen.findByText('오늘 볼 건 다 봤어요.')).toBeInTheDocument()
    const rated = itemsById().get('due')!
    expect(rated.last_review).toBe(TODAY)
    expect(rated.due! > TODAY).toBe(true)
    expect(backOnLastReview()).toHaveLength(0)
  })
})
