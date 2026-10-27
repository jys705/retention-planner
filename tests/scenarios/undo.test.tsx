// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { canUndo, usePlanner } from '../../src/store/planner'
import { freezeToday } from '../../src/lib/clock'
import { addDays } from '../../src/lib/date'
import { anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'
const noop = () => {}
beforeAll(() => freezeToday(TODAY))
afterEach(teardownApp)

function two() {
  return [
    anItem({ id: 'i1', title: '첫째', due: TODAY, last_review: '2026-09-24' }),
    anItem({ id: 'i2', title: '둘째', due: TODAY, last_review: '2026-09-24' }),
  ]
}

describe('방금 한 평가 되돌리기', () => {
  it('S-179 평가하면 되돌릴 자리가 뜨고 누르면 줄이 돌아온다', async () => {
    await setupApp(TODAY, { items: two() })
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    await user.click(screen.getByRole('checkbox', { name: /첫째/ }))
    await user.click(screen.getByRole('button', { name: /무난함/ }))

    const panel = await screen.findByLabelText('방금 한 일')
    expect(panel).toHaveTextContent('첫째')
    expect(panel).toHaveTextContent('무난함으로 적었어요')
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(screen.queryByLabelText('방금 한 일')).toBeNull()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('S-180 되돌리면 항목과 기록이 평가 전과 똑같아진다', async () => {
    await setupApp(TODAY, { items: two() })
    render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    const before = JSON.stringify(usePlanner.getState().items)
    const plannedBefore = JSON.stringify(usePlanner.getState().planned)

    await usePlanner.getState().rateItem('i1', 3, { reviewedAt: TODAY })
    expect(JSON.stringify(usePlanner.getState().items)).not.toBe(before)

    await usePlanner.getState().undoLastRating()
    expect(JSON.stringify(usePlanner.getState().items)).toBe(before)
    expect(JSON.stringify(usePlanner.getState().planned)).toBe(plannedBefore)
    expect(usePlanner.getState().reviews).toHaveLength(0)
    expect(usePlanner.getState().settings.ratingCount).toBe(0)
  })

  it('S-181 되돌린 줄은 펴진 채로 돌아온다', async () => {
    await setupApp(TODAY, { items: two() })
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    await user.click(screen.getByRole('checkbox', { name: /첫째/ }))
    await user.click(screen.getByRole('button', { name: /쉬움/ }))
    await user.click(await screen.findByRole('button', { name: '되돌리기' }))

    // 잘못 눌러서 되돌린 사람은 곧바로 다른 등급을 고르려던 참이다.
    expect(screen.getByText('얼마나 기억났나요?')).toBeInTheDocument()
  })

  it('S-182 다음 평가가 앞 것의 되돌릴 자리를 밀어낸다', async () => {
    await setupApp(TODAY, { items: two() })
    await usePlanner.getState().rateItem('i1', 3, { reviewedAt: TODAY })
    const first = usePlanner.getState().lastRating!.reviewId
    await usePlanner.getState().rateItem('i2', 3, { reviewedAt: TODAY })

    expect(usePlanner.getState().lastRating!.reviewId).not.toBe(first)
    await usePlanner.getState().undoLastRating()
    // 되돌린 것은 둘째뿐이다. 첫째 평가는 그대로 남는다.
    expect(usePlanner.getState().reviews.map((r) => r.item_id)).toEqual(['i1'])
  })

  it('S-183 평가가 도는 중에 항목을 적으면 되돌릴 자리를 내준다', async () => {
    // 오늘 화면은 평가도 적어두기도 기다리지 않고 부른다. 낡은 사진으로
    // 되돌리면 방금 적은 항목이 통째로 사라진다.
    await setupApp(TODAY, { items: two() })
    render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')

    const rating = usePlanner.getState().rateItem('i1', 3, { reviewedAt: TODAY })
    await usePlanner.getState().addItem({ title: '끼어든 항목' })
    await rating

    expect(canUndo(usePlanner.getState())).toBe(false)
    expect(screen.queryByLabelText('방금 한 일')).toBeNull()
    // 끼어든 항목이 살아 있어야 한다.
    expect(
      usePlanner.getState().items.map((i) => i.title)
    ).toContain('끼어든 항목')
  })

  it('S-184 평가가 겹쳐도 기록과 항목이 어긋나지 않는다', async () => {
    await setupApp(TODAY, { items: two() })
    const a = usePlanner.getState().rateItem('i1', 3, { reviewedAt: TODAY })
    const b = usePlanner.getState().rateItem('i2', 3, { reviewedAt: TODAY })
    await Promise.all([a, b])
    await usePlanner.getState().undoLastRating()

    // 되돌리기가 됐든 안 됐든, 남은 기록마다 그 항목이 그날 본 것으로 있어야 한다.
    for (const review of usePlanner.getState().reviews) {
      const item = usePlanner.getState().items.find((i) => i.id === review.item_id)!
      expect(item.last_review).toBe(review.reviewed_at)
    }
  })

  it('S-185 목표 마지막 날의 평가도 되돌리면 돌아온다', async () => {
    // 예전에는 목표가 지난 항목을 평가하면 그 자리에서 보관했고, 이 시험은 그
    // 보관까지 되돌리는지를 봤다. 지금은 평가가 보관을 일으키지 않는다. 끝은 날짜가
    // 정하고, 목표 시점이 지난 다음 날 앱을 켜는 순간 보관된다. 평가가 닿는 마지막
    // 자리는 목표의 마지막 날이다. 그날의 평가도 되돌리기가 온전히 물려야 하고,
    // 판은 오지 않을 다음 날짜를 약속하지 않아야 한다.
    await setupApp(TODAY, {
      items: [
        anItem({
          id: 'i1',
          title: '마지막 날 것',
          due: TODAY,
          last_review: '2026-09-24',
          horizon_kind: 'date',
          ready_at: TODAY,
          hold_until: TODAY,
          min_reviews: 1,
          reps_since_goal: 3,
        }),
      ],
    })
    render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    await usePlanner.getState().rateItem('i1', 4, { reviewedAt: TODAY })

    // 마지막 날에는 아직 목표 안이다. 다음 날짜는 목표 뒤라 판이 날짜를 말하지 않는다.
    const done = usePlanner.getState().items[0]
    expect(done.archived_at).toBeNull()
    expect(done.due! > TODAY).toBe(true)
    const panel = await screen.findByLabelText('방금 한 일')
    expect(panel).toHaveTextContent('목표의 마지막 날이라 다음 날짜는 잡지 않아요')
    expect(panel).not.toHaveTextContent('올라옵니다')
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)

    await usePlanner.getState().undoLastRating()
    expect(usePlanner.getState().reviews).toHaveLength(0)
    expect(usePlanner.getState().items[0].archived_at).toBeNull()
    expect(usePlanner.getState().items[0].state).toBe('review')
    expect(usePlanner.getState().items[0].due).toBe(TODAY)
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)

    // 다음 날이 되면 평가하지 않아도 목표가 끝난 것으로 넘어간다.
    usePlanner.getState().setToday(addDays(TODAY, 1))
    await usePlanner.getState().recomputeAll()
    expect(usePlanner.getState().items[0].archived_at).not.toBeNull()
  })
})
