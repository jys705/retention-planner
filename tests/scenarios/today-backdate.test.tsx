// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import { screenWithUser, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

type User = ReturnType<typeof screenWithUser>['user']

/** 이미 떠 있는 오늘 화면에서 상세 설정을 열고 처음 공부한 날을 지정해 적는다. */
async function addWithFirstStudied(
  user: User,
  title: string,
  firstStudiedAt: string
): Promise<void> {
  await user.type(screen.getByLabelText('새 항목 제목'), title)
  if (!screen.queryByLabelText('처음 공부한 날 고르기')) {
    await user.click(screen.getByRole('button', { name: /상세 설정/ }))
  }
  const picker = screen.getByLabelText('처음 공부한 날 고르기')
  await user.clear(picker)
  await user.type(picker, firstStudiedAt)
  await user.click(screen.getByRole('button', { name: /적어두기/ }))
}

describe('S-010 처음 공부한 날 소급 입력', () => {
  // 강도 표준이면 S0(3) = 2.3065 이고 I(0.9, S) = round(2.3065) = 2 다.
  // 그래서 다음에 볼 날은 언제나 처음 공부한 날 + 2일이다.
  const cases: { back: number; due: string; overdue: number }[] = [
    { back: 1, due: '2026-10-02', overdue: 0 },
    { back: 3, due: '2026-09-30', overdue: 1 },
    { back: 10, due: '2026-09-23', overdue: 8 },
    { back: 100, due: '2026-06-25', overdue: 98 },
  ]

  for (const { back, due, overdue } of cases) {
    it(`S-010-${back} ${back}일 전으로 넣으면 due 가 ${due} 이고 ${overdue}일 지남이다`, async () => {
      await setupApp(TODAY)
      const { user } = screenWithUser(<TodayScreen />)
      const firstStudiedAt = shift(TODAY, -back)
      await addWithFirstStudied(user, '소급 항목', firstStudiedAt)

      const stored = usePlanner.getState().items[0]
      expect(stored.first_studied_at).toBe(firstStudiedAt)
      expect(stored.last_review).toBe(firstStudiedAt)
      expect(stored.due).toBe(due)

      if (overdue > 0) {
        expect(
          await screen.findByText(`${overdue}일 지남`)
        ).toBeInTheDocument()
      }
    })
  }
})

describe('S-011 어제 버튼', () => {
  it('S-011 어제를 고르면 처음 공부한 날이 어제가 된다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    await user.type(screen.getByLabelText('새 항목 제목'), '어제 공부한 것')
    await user.click(screen.getByRole('button', { name: /상세 설정/ }))
    await user.click(screen.getByRole('button', { name: '어제' }))
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    expect(usePlanner.getState().items[0].first_studied_at).toBe('2026-09-30')
  })
})

describe('S-013 연체 항목과 오늘 항목을 화면이 구분한다', () => {
  it('S-013 밀린 것과 오늘 것의 수를 따로 센다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    // 밀린 것 둘, 오늘 것 하나
    await addWithFirstStudied(user, '많이 밀린 것', shift(TODAY, -10))
    await addWithFirstStudied(user, '조금 밀린 것', shift(TODAY, -3))
    await addWithFirstStudied(user, '오늘 것', shift(TODAY, -2))

    const dues = usePlanner
      .getState()
      .items.map((i) => `${i.title}:${i.due}`)
      .sort()
    expect(dues).toEqual([
      '많이 밀린 것:2026-09-23',
      '오늘 것:2026-10-01',
      '조금 밀린 것:2026-09-30',
    ])

    // 머리에 밀린 것이 몇 개인지 따로 나와야 한다.
    expect(await screen.findByText('밀린 것')).toBeInTheDocument()
    expect(screen.getByText('2개')).toBeInTheDocument()
    // 큰 숫자는 오늘 것만 센다.
    expect(screen.getByText('오늘 볼 항목')).toBeInTheDocument()
  })

  it('S-014 밀린 것이 위에, 오래 밀린 것부터 온다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    await addWithFirstStudied(user, '조금 밀린 것', shift(TODAY, -3))
    await addWithFirstStudied(user, '많이 밀린 것', shift(TODAY, -10))
    await addWithFirstStudied(user, '오늘 것', shift(TODAY, -2))

    const rows = await screen.findAllByRole('checkbox')
    const titles = rows.map((r) => r.getAttribute('aria-label'))
    expect(titles[0]).toMatch(/많이 밀린 것/)
    expect(titles[1]).toMatch(/조금 밀린 것/)
    expect(titles[2]).toMatch(/오늘 것/)
  })

  it('S-015 오늘 것에는 지남 표시가 안 붙는다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    await addWithFirstStudied(user, '오늘 것', shift(TODAY, -2))

    const list = await screen.findByRole('list', { name: '오늘 볼 항목' })
    expect(within(list).queryByText(/지남/)).toBeNull()
    expect(within(list).getByText('오늘')).toBeInTheDocument()
  })
})

function shift(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}
