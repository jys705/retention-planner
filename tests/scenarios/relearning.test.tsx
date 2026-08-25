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
  it('S-170 오늘 목록에 남는 까닭을 화면이 말한다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '못 외운 것', due: TODAY })],
    })
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    await user.click(screen.getByRole('checkbox', { name: '못 외운 것 평가하기' }))
    await user.click(screen.getByRole('button', { name: /다시/ }))

    // 다음 날짜는 내일인데도 오늘 목록에 남는다. 그 까닭이 줄에 적힌다.
    expect(usePlanner.getState().items[0].state).toBe('relearning')
    expect(screen.getByText('오늘 한 번 더')).toBeInTheDocument()
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
