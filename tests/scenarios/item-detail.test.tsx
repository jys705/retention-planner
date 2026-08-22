// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultFsrs } from '../../src/core/fsrs/fsrs6'
import { ItemDetailScreen } from '../../src/features/item/ItemDetailScreen'
import { usePlanner } from '../../src/store/planner'
import { aGoal, anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'
const noop = () => {}

afterEach(teardownApp)

describe('항목 상세', () => {
  it('S-060 기억 곡선과 기준선이 그려진다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '곡선 항목' })],
    })
    render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    expect(await screen.findByText('기억 곡선')).toBeInTheDocument()
    expect(screen.getByText('목표 기억률 90%')).toBeInTheDocument()
    expect(screen.getByText(/지금 떠올릴 확률은/)).toBeInTheDocument()
  })

  it('S-061 기억률이 낮아도 곡선이 안 잘린다', async () => {
    // 반년 넘게 안 본 항목. 기억률이 60% 아래로 내려간다.
    await setupApp(TODAY, {
      items: [
        anItem({
          id: 'i1',
          title: '오래 안 본 항목',
          first_studied_at: '2026-02-01',
          last_review: '2026-02-01',
          due: '2026-02-03',
        }),
      ],
    })
    render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await screen.findByText('기억 곡선')

    // y축 눈금이 60% 아래까지 내려와 있어야 한다.
    const ticks = [...document.querySelectorAll('svg text')]
      .map((t) => t.textContent ?? '')
      .filter((t) => /^\d+%$/.test(t))
      .map((t) => Number(t.replace('%', '')))
    expect(ticks.length).toBeGreaterThan(1)
    expect(Math.min(...ticks)).toBeLessThan(60)
  })

  it('S-062 옮길 수 있는 날짜 범위가 두 끝을 보여준다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          horizon_kind: 'date',
          ready_at: '2026-10-20',
          hold_until: '2026-10-20',
        }),
      ],
      items: [anItem({ id: 'i1', goal_id: 'g1', title: '목표 있는 항목' })],
    })
    render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    expect(await screen.findByText('옮길 수 있는 날짜 범위')).toBeInTheDocument()
    expect(
      screen.getByText('이보다 이르면 목표한 날에 기억이 부족해요.')
    ).toBeInTheDocument()
    expect(screen.getByText(/고른 날:/)).toBeInTheDocument()
  })

  it('S-063 한 번으로 부족한 항목은 실제 두 날짜를 말한다', async () => {
    const weak = defaultFsrs.nextState(null, 0, 1)
    await setupApp(TODAY, {
      settings: { bufferDays: '3', minReviews: '1' },
      goals: [
        aGoal({
          id: 'g1',
          horizon_kind: 'date',
          ready_at: '2026-10-06',
          hold_until: '2026-10-06',
          min_reviews: 1,
        }),
      ],
      items: [
        anItem({
          id: 'i1',
          goal_id: 'g1',
          title: '부족한 항목',
          stability: weak.stability,
          difficulty: weak.difficulty,
          state: 'relearning',
          due: '2026-10-02',
          first_studied_at: '2026-09-30',
          last_review: '2026-09-30',
        }),
      ],
    })
    // 창이 사흘이라 두 번 잡을 자리가 있다.
    expect(
      usePlanner.getState().planned.filter((p) => p.item_id === 'i1')
    ).toHaveLength(2)

    render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    expect(
      await screen.findByText(/한 번 봐서는 목표한 날 기억이 모자라요/)
    ).toBeInTheDocument()
    expect(screen.getByText(/두 번 잡아두었어요/)).toBeInTheDocument()
  })

  it('S-063b 하루밖에 안 남았으면 두 번이라고 말하지 않는다', async () => {
    const weak = defaultFsrs.nextState(null, 0, 1)
    await setupApp(TODAY, {
      settings: { bufferDays: '3', minReviews: '1' },
      goals: [
        aGoal({
          id: 'g1',
          horizon_kind: 'date',
          ready_at: '2026-10-05',
          hold_until: '2026-10-05',
          min_reviews: 1,
        }),
      ],
      items: [
        anItem({
          id: 'i1',
          goal_id: 'g1',
          title: '오늘 본 부족한 항목',
          stability: weak.stability,
          difficulty: weak.difficulty,
          state: 'relearning',
          due: '2026-10-02',
          first_studied_at: TODAY,
          // 오늘 이미 봤으니 잡을 수 있는 날은 10월 2일 하루뿐이다.
          last_review: TODAY,
        }),
      ],
    })
    expect(
      usePlanner.getState().planned.filter((p) => p.item_id === 'i1')
    ).toHaveLength(1)

    render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await screen.findByText(/한 번 봐서는 목표한 날 기억이 모자라요/)
    // 하나만 잡혔으면 둘이라고 말하면 안 된다.
    expect(screen.queryByText(/두 번 잡아두었어요/)).toBeNull()
    expect(
      screen.getByText(/목표한 날 전에 한 번 더 잡아둡니다/)
    ).toBeInTheDocument()
  })

  it('S-064 평가 이력 표가 그려진다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '이력 항목' })],
      reviews: [
        {
          id: 'r1',
          item_id: 'i1',
          reviewed_at: '2026-09-29',
          recorded_at: '2026-09-29T00:00:00.000Z',
          rating: 3,
          state_before: 'review',
          s_before: 2,
          d_before: 5,
          s_after: 6,
          d_after: 5,
          elapsed_days: 2,
          scheduled_days: 2,
          r_at_review: 0.9,
          next_interval: 6,
          memo_snapshot: '3번 틀림',
        },
      ],
    })
    render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    expect(await screen.findByText('평가 이력')).toBeInTheDocument()
    expect(screen.getByText('9월 29일')).toBeInTheDocument()
    expect(screen.getByText('알맞음')).toBeInTheDocument()
    expect(screen.getByText('3번 틀림')).toBeInTheDocument()
  })

  it('S-065 평가한 적 없으면 그렇다고 말한다', async () => {
    await setupApp(TODAY, { items: [anItem({ id: 'i1' })] })
    render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    expect(
      await screen.findByText(/아직 평가한 적이 없어요/)
    ).toBeInTheDocument()
  })

  it('S-065b 없는 항목이면 그렇다고 말한다', async () => {
    await setupApp(TODAY)
    render(<ItemDetailScreen itemId="없음" onBack={noop} />)
    expect(await screen.findByText('항목을 찾을 수 없어요.')).toBeInTheDocument()
  })
})
