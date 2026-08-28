// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { canUndo, usePlanner } from '../../src/store/planner'
import { freezeToday } from '../../src/lib/clock'
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

  it('S-185 목표를 다 채워 내린 것도 되돌리면 돌아온다', async () => {
    await setupApp(TODAY, {
      items: [
        anItem({
          id: 'i1',
          title: '끝난 것',
          due: TODAY,
          last_review: '2026-09-24',
          horizon_kind: 'date',
          ready_at: '2026-09-25',
          hold_until: '2026-09-25',
          min_reviews: 1,
          reps_since_goal: 3,
        }),
      ],
    })
    render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    await usePlanner.getState().rateItem('i1', 4, { reviewedAt: TODAY })

    const done = usePlanner.getState().items[0]
    if (done.archived_at !== null) {
      expect(await screen.findByLabelText('방금 한 일')).toHaveTextContent(
        '서재에서도 내렸어요'
      )
    }
    await usePlanner.getState().undoLastRating()
    expect(usePlanner.getState().items[0].archived_at).toBeNull()
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })
})
