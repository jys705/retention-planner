// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TodayCard } from '../../src/features/today/TodayCard'
import { usePlanner } from '../../src/store/planner'
import { aGoal, anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

/** 노트 속 카드에 오늘 볼 것 둘, 다음 주에 볼 것 하나. */
async function cardWorld() {
  await setupApp(TODAY, {
    goals: [aGoal({ id: 'g1', name: '정보보안기사' })],
    items: [
      anItem({ id: 'i1', title: '4장 연습문제', goal_id: 'g1', due: TODAY, last_review: '2026-09-29' }),
      anItem({ id: 'i2', title: '키 관리 정리', due: '2026-09-28', last_review: '2026-09-26', created_at: '2026-01-02T00:00:00.000Z' }),
      anItem({ id: 'i3', title: '다음 주 것', due: '2026-10-08', created_at: '2026-01-03T00:00:00.000Z' }),
    ],
  })
}

describe('노트 속 오늘 카드', () => {
  it('S-300 카드는 오늘 볼 항목을 세고 줄마다 기억률을 보인다', async () => {
    await cardWorld()
    render(<TodayCard onOpenApp={() => {}} />)
    const card = screen.getByRole('region', { name: '오늘 복습' })
    // 앱 머리와 같은 수를 센다. 밀린 것도 오늘 목록에 선다.
    expect(within(card).getByText('2')).toBeInTheDocument()
    const rows = within(card).getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByRole('button', { name: /자세히 보기/ }).textContent)).toEqual([
      '키 관리 정리',
      '4장 연습문제',
    ])
    expect(within(rows[1]).getByText(/^\d+%$/)).toBeInTheDocument()
    expect(within(card).queryByText('다음 주 것')).toBeNull()
  })

  it('S-301 밀린 것이 있으면 그 가운데 몇 개인지 알린다', async () => {
    await cardWorld()
    render(<TodayCard onOpenApp={() => {}} />)
    expect(screen.getByText('이 가운데 밀린 것')).toBeInTheDocument()
    expect(screen.getByText('1개')).toBeInTheDocument()
  })

  it('S-302 카드에서 평가하면 그 줄이 빠지고 방금 한 일을 되돌릴 수 있다', async () => {
    await cardWorld()
    const { user } = render(<TodayCard onOpenApp={() => {}} />)
    await user.click(screen.getByRole('checkbox', { name: '4장 연습문제 평가하기' }))
    expect(screen.getByText('얼마나 기억났나요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /무난함/ }))

    expect(await screen.findByLabelText('방금 한 일')).toHaveTextContent('"4장 연습문제"를 무난함으로 적었어요.')
    expect(screen.queryByRole('button', { name: '4장 연습문제 자세히 보기' })).toBeNull()
    expect(usePlanner.getState().reviews.map((r) => r.reviewed_at)).toEqual([TODAY])

    await user.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(await screen.findByRole('button', { name: '4장 연습문제 자세히 보기' })).toBeInTheDocument()
    expect(usePlanner.getState().reviews).toEqual([])
  })

  it('S-303 카드에서 한 줄 적으면 언제 다시 올라오는지 알려 준다', async () => {
    await cardWorld()
    const { user } = render(<TodayCard onOpenApp={() => {}} />)
    await user.type(screen.getByRole('textbox', { name: '새 항목 제목' }), '6장 요약{Enter}')
    const saved = usePlanner.getState().items.find((i) => i.title === '6장 요약')!
    expect(saved.goal_id).toBeNull()
    expect(saved.first_studied_at).toBe(TODAY)
    expect(await screen.findByRole('status')).toHaveTextContent('"6장 요약"을 적어뒀어요. 다음은')
    // 다시 쓰기 시작하면 알림은 물러난다.
    await user.type(screen.getByRole('textbox', { name: '새 항목 제목' }), '7')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('S-304 제목을 누르면 그 항목으로 앱을 열고, 머리의 단추는 오늘 화면을 연다', async () => {
    await cardWorld()
    const onOpenApp = vi.fn()
    const { user } = render(<TodayCard onOpenApp={onOpenApp} />)
    await user.click(screen.getByRole('button', { name: '키 관리 정리 자세히 보기' }))
    expect(onOpenApp).toHaveBeenLastCalledWith({ itemId: 'i2' })
    await user.click(screen.getByRole('button', { name: '앱에서 보기' }))
    expect(onOpenApp).toHaveBeenLastCalledWith(null)
  })

  it('S-305 오늘 것을 다 봤으면 다음에 올라올 날을 알려 준다', async () => {
    await setupApp(TODAY, {
      items: [
        anItem({ id: 'i3', title: '다음 주 것', due: '2026-10-08' }),
        anItem({ id: 'i4', title: '오늘 본 것', due: '2026-10-20', last_review: TODAY }),
      ],
      reviews: [
        {
          id: 'r1',
          item_id: 'i4',
          reviewed_at: TODAY,
          recorded_at: `${TODAY}T09:00:00.000Z`,
          rating: 3,
          state_before: 'review',
          s_before: 2.3065,
          d_before: 5.2,
          s_after: 19,
          d_after: 5.2,
          elapsed_days: 0,
          scheduled_days: 19,
          r_at_review: 0.9,
          next_interval: 19,
          memo_snapshot: null,
        },
      ],
    })
    render(<TodayCard onOpenApp={() => {}} />)
    expect(screen.getByText('오늘 볼 건 다 봤어요.')).toBeInTheDocument()
    expect(screen.getByText('다음은 10월 8일에 1개예요. 그때 알려드릴게요.')).toBeInTheDocument()
    // 적어두기 줄은 늘 있다.
    expect(screen.getByRole('textbox', { name: '새 항목 제목' })).toBeInTheDocument()
  })

  it('S-310 오늘 볼 것이 처음부터 없던 날은 다 봤다고 하지 않는다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i3', title: '다음 주 것', due: '2026-10-08' })],
    })
    const { user } = render(<TodayCard onOpenApp={() => {}} />)
    expect(screen.getByText('오늘은 볼 게 없어요.')).toBeInTheDocument()
    expect(screen.queryByText('오늘 볼 건 다 봤어요.')).toBeNull()
    expect(screen.getByText('다음은 10월 8일에 1개예요. 그때 알려드릴게요.')).toBeInTheDocument()

    // 새로 적으며 매긴 첫 평가는 복습이 아니다. 적고 나서도 다 봤다고 하지 않는다.
    await user.type(screen.getByRole('textbox', { name: '새 항목 제목' }), '6장 요약{Enter}')
    await screen.findByRole('status')
    expect(screen.getByText('오늘은 볼 게 없어요.')).toBeInTheDocument()
    expect(screen.queryByText('오늘 볼 건 다 봤어요.')).toBeNull()
  })

  it('S-306 아직 적어둔 게 없으면 한 줄 적어 보라고 한다', async () => {
    await setupApp(TODAY)
    render(<TodayCard onOpenApp={() => {}} />)
    expect(screen.getByText('아직 적어둔 게 없어요.')).toBeInTheDocument()
  })

  it('S-307 처음 쓰는 사람에게는 쓰는 법부터 보도록 앱을 연다', async () => {
    await setupApp(TODAY)
    await usePlanner.getState().saveSetting('onboardingDone', false)
    const onOpenApp = vi.fn()
    const { user } = render(<TodayCard onOpenApp={onOpenApp} />)
    expect(screen.getByText('처음 쓰시나요?')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '새 항목 제목' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '시작하기' }))
    expect(onOpenApp).toHaveBeenCalledWith(null)
  })
})
