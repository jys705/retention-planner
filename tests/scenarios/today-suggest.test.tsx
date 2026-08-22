// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import { aGoal, anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

function trio(goalId: string | null = null) {
  return [1, 2, 3].map((n) =>
    anItem({
      id: `i${n}`,
      goal_id: goalId,
      title: `AWS SCS-C03 ${n}0~${n}9번 문제 풀이`,
      due: '2026-10-05',
      first_studied_at: '2026-09-29',
      last_review: '2026-09-29',
    })
  )
}

describe('오늘 화면: 빈 상태와 제안', () => {
  it('S-035 항목이 하나도 없을 때', async () => {
    await setupApp(TODAY)
    render(<TodayScreen />)
    expect(await screen.findByText('아직 적어둔 게 없어요.')).toBeInTheDocument()
    expect(
      screen.getByText(/방금 공부한 걸 아래에 한 줄로 적어보세요/)
    ).toBeInTheDocument()
  })

  it('S-036 오늘 볼 게 없을 때', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '나중 것', due: '2026-10-09' })],
    })
    render(<TodayScreen />)
    expect(await screen.findByText('오늘 볼 건 다 봤어요.')).toBeInTheDocument()
    expect(screen.getByText(/다음은 10월 9일에 1개예요/)).toBeInTheDocument()
  })

  it('S-037 묶기 제안이 조용한 한 줄로 뜬다', async () => {
    await setupApp(TODAY, { items: trio() })
    render(<TodayScreen />)
    expect(
      await screen.findByText(/"AWS SCS-C03"으로 시작하는 항목이 3개예요/)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '묶기' })).toBeInTheDocument()
    // 모달이 아니다. 화면을 막지 않는다.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('S-038 묶기를 누르면 목표가 생기고 항목이 묶인다', async () => {
    await setupApp(TODAY, { items: trio() })
    const { user } = render(<TodayScreen />)
    await user.click(await screen.findByRole('button', { name: '묶기' }))

    const goals = usePlanner.getState().goals
    expect(goals).toHaveLength(1)
    expect(goals[0].name).toBe('AWS SCS-C03')
    expect(
      usePlanner.getState().items.every((i) => i.goal_id === goals[0].id)
    ).toBe(true)
  })

  it('S-039 제안을 닫으면 같은 이름으로 다시 안 뜬다', async () => {
    await setupApp(TODAY, { items: trio() })
    const { user } = render(<TodayScreen />)
    await user.click(await screen.findByRole('button', { name: '제안 닫기' }))

    expect(usePlanner.getState().settings.dismissedPrefixes).toContain(
      'AWS SCS-C03'
    )
    expect(screen.queryByRole('button', { name: '묶기' })).toBeNull()
  })

  it('S-040 이미 목표에 묶인 항목은 제안하지 않는다', async () => {
    await setupApp(TODAY, { goals: [aGoal({ id: 'g1' })], items: trio('g1') })
    render(<TodayScreen />)
    await screen.findByText('오늘 볼 건 다 봤어요.')
    expect(screen.queryByRole('button', { name: '묶기' })).toBeNull()
  })

  it('S-041 하루에 한 번만 제안한다', async () => {
    await setupApp(TODAY, {
      items: trio(),
      settings: { lastSuggestionDate: TODAY },
    })
    render(<TodayScreen />)
    await screen.findByText('오늘 볼 건 다 봤어요.')
    expect(screen.queryByRole('button', { name: '묶기' })).toBeNull()
  })
})
