// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import { addDays as shift } from '../../src/lib/date'
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
