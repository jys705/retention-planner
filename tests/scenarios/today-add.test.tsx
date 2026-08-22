// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import {
  aGoal,
  screenWithUser,
  setupApp,
  teardownApp,
} from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

async function openDetail(user: ReturnType<typeof screenWithUser>['user']) {
  if (!screen.queryByLabelText('처음 공부한 날 고르기')) {
    await user.click(screen.getByRole('button', { name: /상세 설정/ }))
  }
}

describe('오늘 화면: 항목 적기', () => {
  it('S-001 제목만 치고 Enter 로 적는다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    const input = screen.getByLabelText('새 항목 제목')
    await user.type(input, 'AWS SCS-C03 1~10번 문제 풀이{Enter}')

    const items = usePlanner.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('AWS SCS-C03 1~10번 문제 풀이')
    expect(items[0].first_studied_at).toBe(TODAY)
    expect(items[0].due).toBe('2026-10-03')
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('S-002 적어두기 단추로 적는다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    await user.type(screen.getByLabelText('새 항목 제목'), '단추로 적기')
    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[0].title).toBe('단추로 적기')
  })

  it('S-003 제목이 비면 적히지 않는다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    await user.type(screen.getByLabelText('새 항목 제목'), '{Enter}')
    expect(usePlanner.getState().items).toHaveLength(0)

    await user.type(screen.getByLabelText('새 항목 제목'), '   ')
    expect(screen.getByRole('button', { name: /적어두기/ })).toBeDisabled()
  })

  it('S-004 상세 설정을 펼치고 접는다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    expect(screen.queryByText('처음 공부한 날')).toBeNull()

    await user.click(screen.getByRole('button', { name: /상세 설정/ }))
    expect(screen.getByText('처음 공부한 날')).toBeInTheDocument()
    expect(screen.getByText('소속 목표')).toBeInTheDocument()
    expect(screen.getByText('목표 시점')).toBeInTheDocument()
    expect(screen.getByText('복습 강도')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /상세 설정/ }))
    expect(screen.queryByText('처음 공부한 날')).toBeNull()
  })

  it('S-005 처음 공부한 날 오늘', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    await user.type(screen.getByLabelText('새 항목 제목'), '오늘 것')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '오늘' }))
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    expect(usePlanner.getState().items[0].first_studied_at).toBe('2026-10-01')
    expect(usePlanner.getState().items[0].due).toBe('2026-10-03')
  })

  it('S-006 처음 공부한 날 어제', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    await user.type(screen.getByLabelText('새 항목 제목'), '어제 것')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '어제' }))
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    expect(usePlanner.getState().items[0].first_studied_at).toBe('2026-09-30')
    expect(usePlanner.getState().items[0].due).toBe('2026-10-02')
  })

  it('S-007 처음 공부한 날 다른 날', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    await user.type(screen.getByLabelText('새 항목 제목'), '다른 날 것')
    await openDetail(user)
    // 고르기 전에는 날짜가 아니라 '다른 날' 이라고 적혀 있어야 한다.
    expect(screen.getByText(/다른 날/)).toBeInTheDocument()

    const picker = screen.getByLabelText('처음 공부한 날 고르기')
    await user.clear(picker)
    await user.type(picker, '2026-09-21')
    // 고른 뒤에는 그 날짜가 보인다.
    expect(screen.getByText(/9월 21일/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[0].due).toBe('2026-09-23')
  })

  it('S-008 메모를 붙여 적는다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    await user.type(screen.getByLabelText('새 항목 제목'), '메모 있는 것')
    await openDetail(user)
    await user.type(screen.getByPlaceholderText('3, 7번 틀림'), '3, 7번 틀림')
    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[0].memo).toBe('3, 7번 틀림')
  })

  it('S-009 소속 목표를 골라 적는다', async () => {
    await setupApp(TODAY, { goals: [aGoal({ id: 'g1', name: 'AWS SCS-C03' })] })
    const { user } = screenWithUser(<TodayScreen />)
    await user.type(screen.getByLabelText('새 항목 제목'), '목표에 넣기')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: 'AWS SCS-C03' }))
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    expect(usePlanner.getState().items[0].goal_id).toBe('g1')
    // 다음에 적을 때 그 목표가 기본으로 남는다.
    expect(usePlanner.getState().settings.lastGoalId).toBe('g1')
  })

  it('S-010 소속 목표를 없음으로 둔다', async () => {
    await setupApp(TODAY, { goals: [aGoal({ id: 'g1', name: 'AWS SCS-C03' })] })
    const { user } = screenWithUser(<TodayScreen />)
    await user.type(screen.getByLabelText('새 항목 제목'), '목표 없이')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '없음' }))
    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[0].goal_id).toBeNull()
  })

  it('S-015 처음 공부한 날은 미래로 못 고른다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<TodayScreen />)
    await openDetail(user)
    expect(screen.getByLabelText('처음 공부한 날 고르기')).toHaveAttribute(
      'max',
      TODAY
    )
  })
})
