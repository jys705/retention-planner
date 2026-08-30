// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import { addDays as shift } from '../../src/lib/date'
import { rollout } from '../../src/features/forecast/rollout'
import { aGoal, anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

function overdueItem(id: string, title: string, due: string) {
  return anItem({
    id,
    title,
    due,
    first_studied_at: '2026-09-01',
    last_review: '2026-09-01',
  })
}

describe('오늘 화면: 밀린 항목', () => {
  it('S-029 큰 숫자는 목록에 선 줄 수와 같다', async () => {
    await setupApp(TODAY, {
      items: [
        overdueItem('a', '많이 밀린 것', '2026-09-23'),
        overdueItem('b', '조금 밀린 것', '2026-09-30'),
        overdueItem('c', '오늘 것', TODAY),
      ],
    })
    render(<TodayScreen onOpenItem={() => {}} />)

    expect(await screen.findByText('오늘 볼 항목')).toBeInTheDocument()
    expect(screen.getByText('이 가운데 밀린 것')).toBeInTheDocument()
    expect(screen.getByText('2개')).toBeInTheDocument()
    // 큰 숫자는 줄 수 그대로다. 밀린 2 + 오늘 1 이면 3 이다.
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    // 넣어둔 날짜가 그대로 남아 있어야 한다. 켤 때마다 바뀌면 안 된다.
    expect(
      usePlanner.getState().items.map((i) => i.due).sort()
    ).toEqual(['2026-09-23', '2026-09-30', '2026-10-01'])
  })

  it('S-030 밀린 것이 없으면 그 줄이 안 보인다', async () => {
    await setupApp(TODAY, { items: [overdueItem('c', '오늘 것', TODAY)] })
    render(<TodayScreen onOpenItem={() => {}} />)
    expect(await screen.findAllByRole('checkbox')).toHaveLength(1)
    expect(screen.queryByText(/밀린 것/)).toBeNull()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('S-177 다 밀린 날에도 큰 숫자가 줄 수를 센다', async () => {
    // 여기가 감사에서 나온 자리다. 줄이 넷 보이는데 머리가 '0 개' 라고 적었다.
    await setupApp(TODAY, {
      items: [
        overdueItem('a', '밀린 것 1', '2026-09-23'),
        overdueItem('b', '밀린 것 2', '2026-09-28'),
        overdueItem('c', '밀린 것 3', '2026-09-30'),
      ],
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    expect(await screen.findByText('오늘 볼 항목')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('0')).toBeNull()

    // 같이 볼 오늘 것이 없으니 '같이' 라고 말하지 않는다.
    expect(screen.getByText('모두 볼 날이 지났어요.')).toBeInTheDocument()
    expect(screen.getByText('밀린 것')).toBeInTheDocument()
    // 다 밀린 날에도 밀린 수는 눈에 띄게 세워 둔다.
    expect(screen.getByText('3개')).toHaveClass('text-imp-fg')
  })

  it('S-178 오늘 것을 하나 끝내도 큰 숫자가 늘지 않는다', async () => {
    // 오늘 것만 세면 밀린 4 + 오늘 1 인 날 그 하나를 끝냈을 때 1 에서 4 로 커진다.
    await setupApp(TODAY, {
      items: [
        overdueItem('a', '밀린 것 1', '2026-09-23'),
        overdueItem('b', '밀린 것 2', '2026-09-28'),
        overdueItem('c', '오늘 것', TODAY),
      ],
    })
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    expect(await screen.findByText('3')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /오늘 것/ }))
    await user.click(screen.getByRole('button', { name: /쉬움/ }))

    expect(await screen.findByText('2')).toBeInTheDocument()
    expect(screen.queryByText('3')).toBeNull()
  })

  it('S-031 밀린 것이 위에, 오래 밀린 것부터 온다', async () => {
    await setupApp(TODAY, {
      items: [
        overdueItem('b', '조금 밀린 것', '2026-09-30'),
        overdueItem('c', '오늘 것', TODAY),
        overdueItem('a', '많이 밀린 것', '2026-09-23'),
      ],
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    const labels = (await screen.findAllByRole('checkbox')).map((c) =>
      c.getAttribute('aria-label')
    )
    expect(labels[0]).toMatch(/많이 밀린 것/)
    expect(labels[1]).toMatch(/조금 밀린 것/)
    expect(labels[2]).toMatch(/오늘 것/)
  })

  it('S-032 오늘 것에는 지남 표시가 안 붙는다', async () => {
    await setupApp(TODAY, { items: [overdueItem('c', '오늘 것', TODAY)] })
    render(<TodayScreen onOpenItem={() => {}} />)
    const list = await screen.findByRole('list', { name: '오늘 볼 항목' })
    expect(within(list).queryByText(/지남/)).toBeNull()
    expect(within(list).getByText('오늘')).toBeInTheDocument()
  })

  it('S-033 밀린 항목도 똑같이 평가된다', async () => {
    await setupApp(TODAY, {
      items: [overdueItem('a', '많이 밀린 것', '2026-09-23')],
    })
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    expect(await screen.findByText('8일 지남')).toBeInTheDocument()

    await user.click((await screen.findAllByRole('checkbox'))[0])
    await user.click(screen.getByRole('button', { name: /무난함/ }))

    expect(usePlanner.getState().reviews).toHaveLength(1)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('S-034 밀린 항목은 하루 상한을 무시한다', async () => {
    await setupApp(TODAY, {
      settings: { dailyCap: '2' },
      items: Array.from({ length: 5 }, (_, i) =>
        overdueItem(`o${i}`, `밀린 것 ${i + 1}`, '2026-09-25')
      ),
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    // 이미 밀린 것을 더 미루지 않는다. 다섯 개가 모두 오늘 목록에 남는다.
    expect(await screen.findAllByRole('checkbox')).toHaveLength(5)
    expect(
      usePlanner.getState().items.every((i) => i.due === '2026-09-25')
    ).toBe(true)
  })
})

describe('밀린 것과 하루 최대 개수', () => {
  /** 밀린 것 n개 + 내일로 몰아둔 것 30개. */
  function pile(overdue: number, goalId: string | null) {
    const items = []
    for (let i = 0; i < overdue; i += 1) {
      items.push(
        anItem({
          id: `o${i}`,
          title: `밀린 ${i}`,
          goal_id: goalId,
          first_studied_at: '2026-08-01',
          last_review: shift(TODAY, -20 - i),
          due: shift(TODAY, -1 - (i % 12)),
          stability: 9 + (i % 7),
          reps: 3,
        })
      )
    }
    for (let i = 0; i < 30; i += 1) {
      items.push(
        anItem({
          id: `a${i}`,
          title: `앞날 ${i}`,
          goal_id: 'g1',
          first_studied_at: '2026-08-01',
          last_review: shift(TODAY, -8),
          due: shift(TODAY, 1),
          stability: 6 + (i % 5),
          reps: 3,
        })
      )
    }
    return items
  }

  const goal = () =>
    aGoal({
      id: 'g1',
      horizon_kind: 'date' as const,
      ready_at: shift(TODAY, 25),
      hold_until: shift(TODAY, 25),
    })

  it('S-188 밀린 것이 상한 안이면 오늘 줄 수가 상한을 안 넘는다', async () => {
    // 밀린 것을 안 세면 오늘이 빈 날로 보여서 앱이 그 위에 상한만큼 더 얹는다.
    await setupApp(TODAY, {
      goals: [goal()],
      items: pile(5, null),
      settings: { dailyCap: '10' },
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    await screen.findByText('오늘 볼 항목')
    expect(screen.getAllByRole('checkbox').length).toBeLessThanOrEqual(10)
  })

  it('S-189 밀린 것이 상한을 넘으면 오늘에 새로 얹지 않는다', async () => {
    await setupApp(TODAY, {
      goals: [goal()],
      items: pile(15, null),
      settings: { dailyCap: '10' },
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    await screen.findByText('오늘 볼 항목')
    // 밀린 15줄 그대로. 앱이 그 위에 더 얹지 않는다.
    expect(screen.getAllByRole('checkbox')).toHaveLength(15)
    const state = usePlanner.getState()
    expect(state.items.filter((i) => i.id.startsWith('a') && i.due === TODAY)).toHaveLength(0)
  })

  it('S-190 목표에 묶인 밀린 것도 앞으로 옮기지 않는다', async () => {
    // 옮기면 줄이 오늘 목록에서 사라져서 '오늘 볼 건 다 봤어요' 가 뜬다.
    await setupApp(TODAY, {
      goals: [goal()],
      items: pile(15, 'g1'),
      settings: { dailyCap: '10' },
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    await screen.findByText('오늘 볼 항목')
    const escaped = usePlanner
      .getState()
      .items.filter((i) => i.id.startsWith('o') && i.due! > TODAY)
    expect(escaped).toHaveLength(0)
    expect(screen.getAllByRole('checkbox')).toHaveLength(15)
  })

  it('S-191 밀린 것이 쌓여도 앞날 예정일이 날마다 뒤로 가지 않는다', async () => {
    // 밀린 것을 덜어내기 쪽에 세면, 안 본 날이 하루 늘 때마다 앞으로 잡아둔
    // 날짜가 통째로 뒤로 도망간다.
    await setupApp(TODAY, {
      goals: [goal()],
      items: pile(15, null),
      settings: { dailyCap: '10' },
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    await screen.findByText('오늘 볼 항목')
    const first = usePlanner
      .getState()
      .items.filter((i) => i.id.startsWith('a'))
      .map((i) => i.due)
    for (let n = 0; n < 5; n += 1) {
      await usePlanner.getState().recomputeAll()
    }
    const after = usePlanner
      .getState()
      .items.filter((i) => i.id.startsWith('a'))
      .map((i) => i.due)
    expect(after).toEqual(first)
  })
})

describe('목표한 날 당일', () => {
  it('S-202 목표한 날 당일에는 해야 할 복습을 안 잡는다', async () => {
    // 그날은 시험을 보는 날이다. 준비는 늦어도 전날까지 끝나 있어야 한다.
    const READY = shift(TODAY, 14)
    await setupApp(TODAY, {
      // 버퍼를 0 으로 둬도 당일은 비워 둔다.
      settings: { bufferDays: '0' },
      goals: [
        aGoal({ id: 'g1', horizon_kind: 'date', ready_at: READY, hold_until: READY, min_reviews: 3 }),
      ],
      items: Array.from({ length: 12 }, (_, i) =>
        anItem({
          id: `i${i}`, title: `항목 ${i}`, goal_id: 'g1',
          first_studied_at: '2026-09-01',
          last_review: shift(TODAY, -(2 + (i % 9))),
          due: shift(TODAY, (i % 5) + 1),
          stability: 3 + i * 1.5, difficulty: 5, reps: 2, reps_since_goal: 1,
        })
      ),
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    await screen.findByText('오늘 볼 항목')
    // 저장된 예정일은 '다음 한 번' 뿐이라 목표 근처를 못 본다. 하루씩 굴려서 본다.
    const s = usePlanner.getState()
    const plan = rollout({
      items: s.items, goals: s.goals, settings: s.settings, from: TODAY, days: 16,
    })
    const at = (d: string) => plan.find((x) => x.date === d)?.items.length ?? 0
    // 앞에 자리가 있는 만큼은 전날로 당겨 둔다.
    expect(at(shift(READY, -1))).toBeGreaterThan(at(READY))
  })

  it('S-203 목표한 날에는 해도 되고 안 해도 된다고 말한다', async () => {
    await setupApp(TODAY, {
      goals: [aGoal({ id: 'g1', horizon_kind: 'date', ready_at: TODAY, hold_until: TODAY })],
      items: [anItem({ id: 'i1', title: '남은 것', goal_id: 'g1', due: TODAY })],
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    await screen.findByText('오늘 볼 항목')
    expect(screen.getByText(/오늘이/)).toHaveTextContent('목표한 날이에요')
    expect(screen.getByText(/안 봐도 괜찮습니다/)).toBeInTheDocument()
  })

  it('S-204 목표한 날에 볼 게 없으면 그렇게 말한다', async () => {
    await setupApp(TODAY, {
      goals: [aGoal({ id: 'g1', horizon_kind: 'date', ready_at: TODAY, hold_until: TODAY })],
      items: [anItem({ id: 'i1', title: '앞날 것', goal_id: 'g1', due: shift(TODAY, 3) })],
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    await screen.findByText('오늘 볼 항목')
    expect(screen.getByText(/오늘은 보실 게 없습니다/)).toBeInTheDocument()
  })
})

describe('밀린 항목의 배지', () => {
  it('S-209 밀린 것도 오늘 기준으로 다시 셈해 배지를 붙인다', async () => {
    // 마지막으로 본 날에서 재면 목표까지 남은 날이 실제보다 길게 잡혀 제약이
    // 느슨해진다. 그래서 스무 날 밀린 것이 '평범한 복습' 으로 분류되고,
    // 건너뛰어도 목표를 지킨다는 사실을 화면이 말해 주지 못한다.
    const READY = shift(TODAY, 14)
    await setupApp(TODAY, {
      goals: [
        aGoal({ id: 'g1', horizon_kind: 'date', ready_at: READY, hold_until: READY, min_reviews: 3 }),
      ],
      items: [
        anItem({
          id: 'late', title: '20일 밀린 것', goal_id: 'g1',
          first_studied_at: '2026-08-01', last_review: shift(TODAY, -20),
          due: shift(TODAY, -6), stability: 15, difficulty: 5, reps: 3, reps_since_goal: 1,
        }),
      ],
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    await screen.findByText('오늘 볼 항목')

    const late = usePlanner.getState().items[0]
    // 목표까지 남은 날을 오늘부터 세면 건너뛰어도 지킨다는 판정이 나온다.
    expect(late.due_kind).toBe('final_check')
    expect(late.goal_risk).toBe('safe')
    // 그러고도 날짜는 안 움직인다. 밀린 것은 앱이 옮기지 않는다.
    expect(late.due).toBe(shift(TODAY, -6))
  })
})
