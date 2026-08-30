// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ForecastScreen } from '../../src/features/forecast/ForecastScreen'
import { rollout } from '../../src/features/forecast/rollout'
import { usePlanner } from '../../src/store/planner'
import { aGoal, anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

function many(n: number, due: string) {
  return Array.from({ length: n }, (_, i) =>
    anItem({
      id: `i${i}`,
      title: `항목 ${i + 1}`,
      due,
      first_studied_at: '2026-09-29',
      last_review: '2026-09-29',
    })
  )
}

describe('예보', () => {
  it('S-066 60일 막대와 요약 한 문장', async () => {
    await setupApp(TODAY, { items: many(4, '2026-10-05') })
    render(<ForecastScreen />)
    expect((await screen.findAllByText('앞으로 60일')).length).toBeGreaterThan(0)
    // 머리 문장은 '곧 얼마나 바쁜가' 를 말한다. 예순 날 평균은 빈 날에 눌려
    // 실제보다 한가해 보이므로 앞 두 주로 센다.
    expect(
      screen.getByText(/다음 14일 동안 하루 평균 .*개예요/)
    ).toBeInTheDocument()
    // 예순 날 총계와 상한은 레일이 맡는다.
    expect(screen.getByText('다음 14일 하루 평균')).toBeInTheDocument()
    expect(screen.getByText('하루 상한')).toBeInTheDocument()
    // 막대가 실제로 그려졌는지 본다.
    expect(document.querySelectorAll('svg').length).toBeGreaterThan(0)
  })

  it('S-067 상한을 넘는 날을 알려준다', async () => {
    // 이미 밀린 항목은 상한을 무시하고 오늘 한꺼번에 올라온다.
    // 이건 펴서 없앨 수 없는 초과라 화면이 그렇다고 말해야 한다.
    await setupApp(TODAY, {
      settings: { dailyCap: '3' },
      items: many(9, '2026-09-20'),
    })
    render(<ForecastScreen />)
    expect(
      await screen.findByText(/하루 상한 3개를 넘어요/)
    ).toBeInTheDocument()
  })

  it('S-068 달력 히트맵이 두 달을 보여준다', async () => {
    await setupApp(TODAY, { items: many(3, '2026-10-05') })
    render(<ForecastScreen />)
    expect(await screen.findByText('달력으로 보기')).toBeInTheDocument()
    expect(screen.getAllByText('10월').length).toBeGreaterThan(0)
    expect(screen.getAllByText('11월').length).toBeGreaterThan(0)
    expect(screen.getAllByText('일').length).toBeGreaterThan(0)
  })

  it('S-068b 달력 칸을 누르면 그날이 선택된다', async () => {
    await setupApp(TODAY, { items: many(3, '2026-10-05') })
    const { user } = render(<ForecastScreen />)
    await screen.findByText('달력으로 보기')
    // 개수가 있는 칸 하나를 골라 누른다.
    const cell = [...document.querySelectorAll('button[title]')].find((b) =>
      /10월 \d+일 [1-9]\d*개/.test(b.getAttribute('title') ?? '')
    )!
    const [, count] = /(\d+)개$/.exec(cell.getAttribute('title')!)!
    await user.click(cell)
    const card = screen.getByRole('region', { name: '그날 무엇을 보나' })
    // 날짜 줄과 목표별 줄에 같은 수가 함께 나올 수 있다.
    expect(within(card).getAllByText(`${count}개`).length).toBeGreaterThan(0)
    // 그날 볼 항목의 제목이 실제로 적혀 있어야 한다.
    expect(within(card).getByText('항목 1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '고정 해제' }))
    expect(screen.queryByText('그날 무엇을 보나')).toBeNull()
  })

  it('S-069 앞으로 볼 게 없으면 그렇다고 말한다', async () => {
    await setupApp(TODAY)
    render(<ForecastScreen />)
    expect(
      await screen.findByText(/앞으로 잡힌 복습이 없어요/)
    ).toBeInTheDocument()
  })

  it('S-159 막대와 달력이 그날 볼 항목을 이름으로 보여준다', async () => {
    await setupApp(TODAY, {
      goals: [aGoal({ id: 'g1', name: '자격증 시험' })],
      items: [
        anItem({
          id: 'i1',
          title: '4장 연습문제',
          goal_id: 'g1',
          due: '2026-10-05',
          first_studied_at: '2026-09-29',
          last_review: '2026-09-29',
        }),
      ],
    })
    const { user } = render(<ForecastScreen />)
    await screen.findByText('달력으로 보기')

    const cell = [...document.querySelectorAll('button[title]')].find((b) =>
      /10월 5일 1개/.test(b.getAttribute('title') ?? '')
    )!
    await user.click(cell)

    const card = screen.getByRole('region', { name: '그날 무엇을 보나' })
    // 개수가 아니라 무엇인지가 나와야 한다.
    expect(within(card).getByText('4장 연습문제')).toBeInTheDocument()
    expect(within(card).getByText('자격증 시험')).toBeInTheDocument()
  })

  it('S-162 달력 칸에 마우스를 올리면 그날 항목이 뜬다', async () => {
    await setupApp(TODAY, {
      goals: [aGoal({ id: 'g1', name: '자격증 시험' })],
      items: [
        anItem({
          id: 'i1',
          title: '4장 연습문제',
          goal_id: 'g1',
          due: '2026-10-05',
          first_studied_at: '2026-09-29',
          last_review: '2026-09-29',
        }),
      ],
    })
    const { user } = render(<ForecastScreen />)
    await screen.findByText('달력으로 보기')

    const cell = [...document.querySelectorAll('button[title]')].find((b) =>
      /10월 5일 1개/.test(b.getAttribute('title') ?? '')
    )!
    await user.hover(cell)
    const card = screen.getByRole('region', { name: '그날 무엇을 보나' })
    expect(within(card).getByText('4장 연습문제')).toBeInTheDocument()

    // 마우스를 떼면 사라진다. 고정한 것이 아니기 때문이다.
    await user.unhover(cell)
    expect(screen.queryByRole('region', { name: '그날 무엇을 보나' })).toBeNull()
  })
})

describe('예보가 보여주는 기간', () => {
  it('S-192 목표 시점을 안 정했으면 예순 날을 본다', async () => {
    await setupApp(TODAY, {
      goals: [aGoal({ id: 'g1', horizon_kind: 'open', ready_at: null, hold_until: null })],
      items: many(3, '2026-10-05'),
    })
    render(<ForecastScreen />)
    expect((await screen.findAllByText('앞으로 60일'))[0]).toBeInTheDocument()
  })

  it('S-193 목표한 날을 정했으면 그 날에서 끊는다', async () => {
    // 그 뒤는 물어본 적이 없는 구간이다. 길게 그리면 목표까지의 모양이 납작해진다.
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          horizon_kind: 'date',
          ready_at: '2026-10-25',
          hold_until: '2026-10-25',
        }),
      ],
      items: many(3, '2026-10-05'),
    })
    render(<ForecastScreen />)
    expect((await screen.findAllByText('앞으로 24일'))[0]).toBeInTheDocument()
    expect(screen.queryAllByText('앞으로 60일')).toHaveLength(0)
  })

  it('S-194 대략으로 잡았으면 늦은 쪽 끝에서 끊는다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          horizon_kind: 'window',
          ready_at: '2026-10-20',
          hold_until: '2026-11-05',
        }),
      ],
      items: many(3, '2026-10-05'),
    })
    render(<ForecastScreen />)
    expect((await screen.findAllByText('앞으로 35일'))[0]).toBeInTheDocument()
  })

  it('S-195 목표가 여럿이면 가장 늦은 것에 맞춘다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({ id: 'g1', horizon_kind: 'date', ready_at: '2026-10-10', hold_until: '2026-10-10' }),
        aGoal({ id: 'g2', horizon_kind: 'date', ready_at: '2026-10-30', hold_until: '2026-10-30' }),
      ],
      items: many(3, '2026-10-05'),
    })
    render(<ForecastScreen />)
    expect((await screen.findAllByText('앞으로 29일'))[0]).toBeInTheDocument()
  })

  it('S-196 목표가 코앞이어도 볼 만한 길이는 남긴다', async () => {
    // 막대 두어 개짜리 그림에는 읽을 것이 없다.
    await setupApp(TODAY, {
      goals: [
        aGoal({ id: 'g1', horizon_kind: 'date', ready_at: '2026-10-03', hold_until: '2026-10-03' }),
      ],
      items: many(3, '2026-10-02'),
    })
    render(<ForecastScreen />)
    expect((await screen.findAllByText('앞으로 14일'))[0]).toBeInTheDocument()
  })
})

describe('목표를 지난 항목', () => {
  it('S-201 목표한 날이 지나면 예보에 안 나온다', async () => {
    // 목표를 지나서까지 이어 보는 것은 물어본 적이 없는 구간이다.
    await setupApp(TODAY, {
      goals: [
        // 목표를 지나도 계속 보는 쪽으로 둬야 걸러내는 일이 실제로 생긴다.
        // 보관하는 쪽은 목표를 지나면 스스로 사라진다.
        aGoal({ id: 'g1', horizon_kind: 'date', ready_at: '2026-10-08',
          hold_until: '2026-10-08', post_goal_mode: 'maintain', max_interval_days: 3 }),
        aGoal({ id: 'g2', horizon_kind: 'date', ready_at: '2026-10-28',
          hold_until: '2026-10-28', post_goal_mode: 'maintain' }),
      ],
      items: [
        // 간격이 짧아 목표를 지나서도 계속 올라오는 항목이라야 걸러내는 일이 생긴다.
        anItem({ id: 'a', title: '이른 목표 것', goal_id: 'g1', due: '2026-10-02',
          first_studied_at: '2026-09-01', last_review: '2026-09-28',
          stability: 1.2 }),
        anItem({ id: 'b', title: '늦은 목표 것', goal_id: 'g2', due: '2026-10-02',
          first_studied_at: '2026-09-01', last_review: '2026-09-28', stability: 5 }),
      ],
    })
    const s = usePlanner.getState()
    const days = rollout({ items: s.items, goals: s.goals, settings: s.settings, from: TODAY, days: 27 })
    const afterFirst = days.filter((d) => d.date > '2026-10-08')
    // 이른 목표 것은 10월 8일 뒤로 한 번도 안 나온다.
    expect(afterFirst.some((d) => d.items.some((i) => i.itemId === 'a'))).toBe(false)
    // 늦은 목표 것은 계속 나온다.
    expect(afterFirst.some((d) => d.items.some((i) => i.itemId === 'b'))).toBe(true)
  })
})
