// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultFsrs } from '../../src/core/fsrs/fsrs6'
import { ItemDetailScreen } from '../../src/features/item/ItemDetailScreen'
import { stateFromHistory, usePlanner } from '../../src/store/planner'
import {
  aGoal,
  anItem,
  render,
  setupApp,
  shift,
  teardownApp,
  pickFromMenu,
} from './harness'

const TODAY = '2026-10-01'
const noop = () => {}

afterEach(teardownApp)

describe('항목 상세', () => {
  it('S-060 기억 곡선과 기준선이 그려진다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '곡선 항목' })],
    })
    render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    expect(
      await screen.findByRole('region', { name: '기억 곡선' })
    ).toBeInTheDocument()
    expect(screen.getAllByText('목표 기억률 90%')[0]).toBeInTheDocument()
    expect(screen.getByText(/지금 기억률은/)).toBeInTheDocument()
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
    await screen.findByRole('region', { name: '기억 곡선' })

    // y축 눈금이 60% 아래까지 내려와 있어야 한다.
    const ticks = [...document.querySelectorAll('svg text')]
      .map((t) => t.textContent ?? '')
      .filter((t) => /^\d+%$/.test(t))
      .map((t) => Number(t.replace('%', '')))
    expect(ticks.length).toBeGreaterThan(1)
    expect(Math.min(...ticks)).toBeLessThan(60)
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
    // 화면에 '봤다고 기록하기' 의 등급 단추도 같이 있으니 표 안으로 좁혀서 본다.
    const history = screen.getByRole('table')
    expect(within(history).getByText('9월 29일')).toBeInTheDocument()
    expect(within(history).getByText('무난함')).toBeInTheDocument()
    expect(within(history).getByText('3번 틀림')).toBeInTheDocument()
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

  it('S-154 소속 목표를 고르면 그 설정을 보여주기만 한다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: '2026-11-14',
          hold_until: '2026-11-14',
          intensity: 'focus',
        }),
      ],
      items: [anItem({ id: 'i1', title: '묶인 항목', goal_id: 'g1' })],
    })
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await pickFromMenu(user, '이 항목 더보기', '설정 편집')

    const panel = screen.getByText('설정 고치기').closest('section')!
    expect(within(panel).getByText('11월 14일')).toBeInTheDocument()
    expect(within(panel).getByText('집중')).toBeInTheDocument()
    // 목표에 속한 동안에는 고치는 칸이 없다.
    expect(within(panel).queryByRole('radio', { name: '정해두지 않음' })).toBeNull()
    expect(within(panel).getByText(/목표 화면에서 고치세요/)).toBeInTheDocument()
  })

  it('S-155 소속 목표를 없음으로 바꾸면 목표 시점과 강도를 정할 수 있다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: '2026-11-14',
          hold_until: '2026-11-14',
          intensity: 'focus',
        }),
      ],
      items: [anItem({ id: 'i1', title: '떼어낼 항목', goal_id: 'g1' })],
    })
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await pickFromMenu(user, '이 항목 더보기', '설정 편집')

    const panel = screen.getByText('설정 고치기').closest('section')!
    await user.click(within(panel).getByRole('button', { name: '없음' }))
    // 따르던 목표 값이 그대로 채워져 있어야 일정이 갑자기 안 달라진다.
    expect(
      within(panel).getByRole('radio', { name: '정확한 날짜' })
    ).toBeInTheDocument()
    expect(within(panel).getByLabelText('목표한 날 고르기')).toHaveTextContent(
      '11월 14일'
    )

    await user.click(within(panel).getByRole('radio', { name: '여유' }))
    await user.click(within(panel).getByRole('button', { name: '저장' }))

    const item = usePlanner.getState().items[0]
    expect(item.goal_id).toBeNull()
    // 고른 값이 항목 제 값으로 남는다.
    expect(item.horizon_kind).toBe('date')
    expect(item.ready_at).toBe('2026-11-14')
    expect(item.intensity).toBe('easy')
  })

  it('S-156 목표와 다르게 설정된 항목은 저장하면 목표를 따른다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: '2026-11-14',
          hold_until: '2026-11-14',
          intensity: 'focus',
        }),
      ],
      items: [
        anItem({
          id: 'i1',
          title: '따로 노는 항목',
          goal_id: 'g1',
          horizon_kind: 'open',
          intensity: 'easy',
        }),
      ],
    })
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    expect(
      await screen.findByText('목표와 다른 설정을 쓰는 중')
    ).toBeInTheDocument()

    await pickFromMenu(user, '이 항목 더보기', '설정 편집')
    const panel = screen.getByText('설정 고치기').closest('section')!
    expect(within(panel).getByText(/저장하면 목표 설정을 따라갑니다/)).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: '저장' }))

    const item = usePlanner.getState().items[0]
    expect(item.horizon_kind).toBeNull()
    expect(item.intensity).toBeNull()
    // 목표를 따르게 되면 어긋났다는 알림이 사라진다.
    expect(screen.queryByText('목표와 다른 설정을 쓰는 중')).toBeNull()
  })


  it('S-157 적을 때의 첫 평가가 이력에 남는다', async () => {
    await setupApp(TODAY)
    const item = await usePlanner.getState().addItem({
      title: '첫 평가 항목',
      firstStudiedAt: shift(TODAY, -3),
      initialGrade: 2,
    })
    render(<ItemDetailScreen itemId={item.id} onBack={noop} />)
    expect(await screen.findByText('평가 이력')).toBeInTheDocument()

    // 한 화면 안에서 본 횟수와 평가 건수가 어긋나면 안 된다.
    const history = screen.getByRole('table')
    expect(within(history).getByText('어려움')).toBeInTheDocument()
    expect(screen.getByTitle('지금까지 1번 봤어요')).toHaveTextContent('1번')
    expect(usePlanner.getState().reviews).toHaveLength(1)
  })

  it('S-158 이력만으로 지금 상태를 다시 만들 수 있다', async () => {
    await setupApp(TODAY)
    const item = await usePlanner.getState().addItem({
      title: '재생 항목',
      firstStudiedAt: shift(TODAY, -20),
    })
    await usePlanner.getState().rateItem(item.id, 4, { reviewedAt: TODAY })
    render(<ItemDetailScreen itemId={item.id} onBack={noop} />)
    await screen.findByText('평가 이력')

    const stored = usePlanner.getState().items[0]
    const replayed = stateFromHistory(usePlanner.getState().reviews, item.id)
    expect(replayed).not.toBeNull()
    expect(replayed!.stability).toBeCloseTo(stored.stability!, 9)
    expect(replayed!.difficulty).toBeCloseTo(stored.difficulty!, 9)
  })
})
