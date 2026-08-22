// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import { anItem, screenWithUser, setupApp, teardownApp } from './harness'

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
  it('S-029 밀린 것과 오늘 것을 따로 센다', async () => {
    await setupApp(TODAY, {
      items: [
        overdueItem('a', '많이 밀린 것', '2026-09-23'),
        overdueItem('b', '조금 밀린 것', '2026-09-30'),
        overdueItem('c', '오늘 것', TODAY),
      ],
    })
    screenWithUser(<TodayScreen />)

    expect(await screen.findByText('오늘 볼 항목')).toBeInTheDocument()
    expect(screen.getByText('밀린 것')).toBeInTheDocument()
    expect(screen.getByText('2개')).toBeInTheDocument()
    // 큰 숫자는 오늘 것만 센다.
    expect(screen.getByText('1')).toBeInTheDocument()
    // 넣어둔 날짜가 그대로 남아 있어야 한다. 켤 때마다 바뀌면 안 된다.
    expect(
      usePlanner.getState().items.map((i) => i.due).sort()
    ).toEqual(['2026-09-23', '2026-09-30', '2026-10-01'])
  })

  it('S-030 밀린 것이 없으면 그 줄이 안 보인다', async () => {
    await setupApp(TODAY, { items: [overdueItem('c', '오늘 것', TODAY)] })
    screenWithUser(<TodayScreen />)
    expect(await screen.findAllByRole('checkbox')).toHaveLength(1)
    expect(screen.queryByText('밀린 것')).toBeNull()
  })

  it('S-031 밀린 것이 위에, 오래 밀린 것부터 온다', async () => {
    await setupApp(TODAY, {
      items: [
        overdueItem('b', '조금 밀린 것', '2026-09-30'),
        overdueItem('c', '오늘 것', TODAY),
        overdueItem('a', '많이 밀린 것', '2026-09-23'),
      ],
    })
    screenWithUser(<TodayScreen />)
    const labels = (await screen.findAllByRole('checkbox')).map((c) =>
      c.getAttribute('aria-label')
    )
    expect(labels[0]).toMatch(/많이 밀린 것/)
    expect(labels[1]).toMatch(/조금 밀린 것/)
    expect(labels[2]).toMatch(/오늘 것/)
  })

  it('S-032 오늘 것에는 지남 표시가 안 붙는다', async () => {
    await setupApp(TODAY, { items: [overdueItem('c', '오늘 것', TODAY)] })
    screenWithUser(<TodayScreen />)
    const list = await screen.findByRole('list', { name: '오늘 볼 항목' })
    expect(within(list).queryByText(/지남/)).toBeNull()
    expect(within(list).getByText('오늘')).toBeInTheDocument()
  })

  it('S-033 밀린 항목도 똑같이 평가된다', async () => {
    await setupApp(TODAY, {
      items: [overdueItem('a', '많이 밀린 것', '2026-09-23')],
    })
    const { user } = screenWithUser(<TodayScreen />)
    expect(await screen.findByText('8일 지남')).toBeInTheDocument()

    await user.click((await screen.findAllByRole('checkbox'))[0])
    await user.click(screen.getByRole('button', { name: /알맞음/ }))

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
    screenWithUser(<TodayScreen />)
    // 이미 밀린 것을 더 미루지 않는다. 다섯 개가 모두 오늘 목록에 남는다.
    expect(await screen.findAllByRole('checkbox')).toHaveLength(5)
    expect(
      usePlanner.getState().items.every((i) => i.due === '2026-09-25')
    ).toBe(true)
  })
})
