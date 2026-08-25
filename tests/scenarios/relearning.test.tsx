// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import { addDays } from '../../src/lib/date'
import { aGoal, anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'
const noop = () => {}
afterEach(teardownApp)

describe('다시 를 눌렀을 때', () => {
  it('S-170 오늘 목록에 남는 것과 날짜 칸이 어긋나지 않는다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '못 외운 것', due: TODAY })],
    })
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    await user.click(screen.getByRole('checkbox', { name: '못 외운 것 평가하기' }))
    await user.click(screen.getByRole('button', { name: /다시/ }))

    // 줄이 오늘 목록에 남는다. 날짜 칸이 '모레' 라고 적혀 서로 어긋나면 안 된다.
    expect(usePlanner.getState().items[0].state).toBe('relearning')
    expect(screen.getByText('오늘 또')).toBeInTheDocument()
  })

  it('S-171 목표가 지났어도 다시 는 보관하지 않는다', async () => {
    // 목표가 끝났다고 앱이 '됐다' 고 정하면 안 된다. 하나도 기억 안 났다는데
    // 그 자리에서 치워 버리면 다시 볼 길이 사라진다.
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          name: '지난 시험',
          horizon_kind: 'date',
          ready_at: addDays(TODAY, -10),
          hold_until: addDays(TODAY, -10),
          post_goal_mode: 'archive',
        }),
      ],
      items: [
        anItem({ id: 'i1', title: '지난 목표 항목', goal_id: 'g1', due: TODAY }),
      ],
    })
    await usePlanner.getState().rateItem('i1', 1, { reviewedAt: TODAY })
    const after = usePlanner.getState().items[0]
    expect(after.state).toBe('relearning')
    expect(after.archived_at).toBeNull()
  })

  it('S-172 목표가 지났고 기억났으면 그때는 보관한다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          name: '지난 시험',
          horizon_kind: 'date',
          ready_at: addDays(TODAY, -10),
          hold_until: addDays(TODAY, -10),
          post_goal_mode: 'archive',
        }),
      ],
      items: [
        anItem({ id: 'i1', title: '지난 목표 항목', goal_id: 'g1', due: TODAY }),
      ],
    })
    await usePlanner.getState().rateItem('i1', 3, { reviewedAt: TODAY })
    expect(usePlanner.getState().items[0].state).toBe('archived')
  })
})

describe('같은 날 여러 번 누르면', () => {
  it('S-173 그날의 마지막 답 하나만 반영된다', async () => {
    // 지난 시간이 0 인 평가가 겹쳐 쌓이면 기억 지속력이 무너진다. 화면의 날짜는
    // 내내 그대로라 아무 일도 안 난 것처럼 보이는데 안에서만 망가진다.
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '못 외운 것', due: TODAY })],
    })
    await usePlanner.getState().rateItem('i1', 1, { reviewedAt: TODAY })
    const once = usePlanner.getState().items[0].stability

    for (let n = 0; n < 4; n += 1) {
      await usePlanner.getState().rateItem('i1', 1, { reviewedAt: TODAY })
    }
    expect(usePlanner.getState().items[0].stability).toBeCloseTo(once!, 8)

    // 마지막에 다른 등급을 고르면 그 답이 그날의 답이 된다.
    await usePlanner.getState().rateItem('i1', 3, { reviewedAt: TODAY })
    const after = usePlanner.getState().items[0]
    expect(after.stability).toBeGreaterThan(once!)
    expect(after.state).toBe('review')
  })
})

describe('버튼이 약속한 날짜', () => {
  it('S-174 다시 를 거듭 눌러도 버튼과 결과가 같다', async () => {
    // 저장할 때와 미리 적을 때가 다른 계산을 보면 버튼이 거짓말을 한다.
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '못 외운 것', due: TODAY })],
    })
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')

    for (let round = 0; round < 3; round += 1) {
      await user.click(
        screen.getByRole('checkbox', { name: '못 외운 것 평가하기' })
      )
      const again = screen.getByRole('button', { name: /다시/ })
      const promised = again.textContent ?? ''
      await user.click(again)
      const due = usePlanner.getState().items[0].due!
      const days = Math.round(
        (new Date(due).getTime() - new Date(TODAY).getTime()) / 864e5
      )
      // 버튼에 '내일' 이라 적혔으면 실제로도 하루 뒤여야 한다.
      if (promised.includes('내일')) expect(days).toBe(1)
      else expect(promised).toContain(`${days}일 뒤`)
    }
  })
})
