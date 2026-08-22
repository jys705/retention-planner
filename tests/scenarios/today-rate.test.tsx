// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import { anItem, screenWithUser, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

/** 오늘 볼 항목 하나가 있는 상태. */
async function oneDueToday(over = {}) {
  await setupApp(TODAY, {
    items: [
      anItem({
        id: 'i1',
        title: '오늘 볼 항목',
        first_studied_at: '2026-09-29',
        last_review: '2026-09-29',
        due: TODAY,
        ...over,
      }),
    ],
  })
}

async function expandFirstRow(user: ReturnType<typeof screenWithUser>['user']) {
  await user.click((await screen.findAllByRole('checkbox'))[0])
}

describe('오늘 화면: 평가', () => {
  it('S-016 체크하면 그 자리에서 펼쳐진다', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    expect(screen.queryByText('얼마나 기억났나요?')).toBeNull()

    await expandFirstRow(user)
    expect(screen.getByText('얼마나 기억났나요?')).toBeInTheDocument()
    for (const name of ['다시', '어려움', '알맞음', '쉬움']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument()
    }
  })

  it('S-017 다시로 평가하면 잊음이 하나 는다', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    await expandFirstRow(user)
    const before = usePlanner.getState().items[0].stability!

    await user.click(screen.getByRole('button', { name: /다시/ }))

    const after = usePlanner.getState().items[0]
    expect(after.lapses).toBe(1)
    expect(after.state).toBe('relearning')
    expect(after.stability!).toBeLessThanOrEqual(before)
    expect(usePlanner.getState().reviews[0].rating).toBe(1)
  })

  it('S-018 어려움으로 평가한다', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    await expandFirstRow(user)
    await user.click(screen.getByRole('button', { name: /어려움/ }))
    expect(usePlanner.getState().reviews[0].rating).toBe(2)
  })

  it('S-019 알맞음으로 평가하면 단추에 뜬 날짜대로 잡힌다', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    await expandFirstRow(user)

    // 단추에 미리 뜬 '며칠 뒤' 를 읽어 둔다.
    const button = screen.getByRole('button', { name: /알맞음/ })
    const promised = within(button).getByText(/뒤$|^내일$|^오늘$/).textContent!
    await user.click(button)

    const item = usePlanner.getState().items[0]
    const gap = Math.round(
      (Date.parse(`${item.due}T00:00:00Z`) - Date.parse(`${TODAY}T00:00:00Z`)) /
        86400000
    )
    const expected =
      gap === 0 ? '오늘' : gap === 1 ? '내일' : `${gap}일 뒤`
    expect(promised).toBe(expected)
  })

  it('S-020 쉬움이 가장 멀리 잡힌다', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    await expandFirstRow(user)

    const days = (name: string) => {
      const text = within(
        screen.getByRole('button', { name: new RegExp(name) })
      ).getByText(/뒤$|^내일$|^오늘$/).textContent!
      if (text === '오늘') return 0
      if (text === '내일') return 1
      return Number(text.replace('일 뒤', ''))
    }
    expect(days('쉬움')).toBeGreaterThan(days('알맞음'))
    expect(days('알맞음')).toBeGreaterThan(days('어려움'))
    expect(days('어려움')).toBeGreaterThanOrEqual(days('다시'))
  })

  it('S-021 단추에 등급 뜻과 다음 날짜가 함께 있다', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    await expandFirstRow(user)
    expect(screen.getByText('거의 기억나지 않아 처음부터 다시 봤어요')).toBeInTheDocument()
    expect(screen.getByText('무난하게 기억났어요')).toBeInTheDocument()
  })

  it('S-022 평가하면 목록에서 사라진다', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    expect(await screen.findAllByRole('checkbox')).toHaveLength(1)
    await expandFirstRow(user)
    await user.click(screen.getByRole('button', { name: /알맞음/ }))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('S-023 다른 날짜로 기록: 어제', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    await expandFirstRow(user)
    await user.click(screen.getByRole('button', { name: '어제' }))
    expect(screen.getByText(/9월 30일에 본 것으로 기록해요/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /알맞음/ }))

    const review = usePlanner.getState().reviews[0]
    expect(review.reviewed_at).toBe('2026-09-30')
    // 9월 29일에 마지막으로 봤으니 하루가 지난 것으로 센다.
    expect(review.elapsed_days).toBe(1)
  })

  it('S-024 다른 날짜로 기록: 임의 날짜', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    await expandFirstRow(user)
    const picker = screen.getByLabelText('다른 날짜로 기록')
    await user.clear(picker)
    await user.type(picker, '2026-09-30')
    await user.click(screen.getByRole('button', { name: /알맞음/ }))
    expect(usePlanner.getState().reviews[0].reviewed_at).toBe('2026-09-30')
  })

  it('S-025 미래로는 기록되지 않는다', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    await expandFirstRow(user)
    expect(screen.getByLabelText('다른 날짜로 기록')).toHaveAttribute('max', TODAY)
  })

  it('S-026 마지막 복습일보다 이르게는 기록되지 않는다', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    await expandFirstRow(user)
    expect(screen.getByLabelText('다른 날짜로 기록')).toHaveAttribute(
      'min',
      '2026-09-29'
    )
  })

  it('S-027 같은 날 두 번 평가한다', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    await expandFirstRow(user)
    await user.click(screen.getByRole('button', { name: /다시/ }))
    // '다시' 를 누르면 오늘 목록에 그대로 남는다.
    expect(await screen.findAllByRole('checkbox')).toHaveLength(1)

    await expandFirstRow(user)
    await user.click(screen.getByRole('button', { name: /알맞음/ }))
    expect(usePlanner.getState().reviews).toHaveLength(2)
    expect(usePlanner.getState().reviews[1].elapsed_days).toBe(0)
  })

  it('S-028 평가 20회를 넘기면 등급 설명이 줄어든다', async () => {
    await oneDueToday()
    const { user } = screenWithUser(<TodayScreen />)
    await expandFirstRow(user)
    // 스무 번 전에는 단추마다 뜻이 붙는다.
    expect(screen.getByText('무난하게 기억났어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /알맞음/ }))

    await usePlanner.getState().saveSetting('ratingCount', 21)
    await setupAgain()
    const { user: user2 } = screenWithUser(<TodayScreen />)
    await user2.click((await screen.findAllByRole('checkbox'))[0])
    expect(screen.queryByText('무난하게 기억났어요')).toBeNull()
    expect(
      screen.getByText(/다시: 거의 기억 안 남 \| 어려움: 여러 번 막힘/)
    ).toBeInTheDocument()
  })
})

/** 평가 횟수만 남기고 항목을 하나 새로 둔다. */
async function setupAgain(): Promise<void> {
  const count = usePlanner.getState().settings.ratingCount
  await usePlanner.getState().importAll({
    version: 1,
    exportedAt: '',
    goals: [],
    items: [
      anItem({
        id: 'i2',
        title: '스무 번 뒤 항목',
        first_studied_at: '2026-09-29',
        last_review: '2026-09-29',
        due: TODAY,
      }),
    ],
    reviews: [],
    settings: { onboardingDone: 'true', ratingCount: String(count) },
  })
  usePlanner.getState().setToday(TODAY)
  await usePlanner.getState().recomputeAll()
}
