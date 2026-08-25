// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import { addDays } from '../../src/lib/date'
import { effectiveConfig, stateForRating } from '../../src/lib/domain'
import { gradeOptions } from '../../src/features/today/gradeOptions'
import { aGoal, anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'
const noop = () => {}
afterEach(teardownApp)

describe('다시 를 눌렀을 때', () => {
  it('S-170 가장 짧은 간격으로 다시 잡고 목록에서 내려간다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '못 외운 것', due: TODAY })],
    })
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    await user.click(screen.getByRole('checkbox', { name: '못 외운 것 평가하기' }))
    await user.click(screen.getByRole('button', { name: /다시/ }))

    const after = usePlanner.getState().items[0]
    expect(after.due! > TODAY).toBe(true)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
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

  it('S-175 한참 만에 본 것도 고쳐 누른 값이 흔들리지 않는다', async () => {
    // 그날 첫 평가가 며칠 만이었는지를 평가 목록만 훑어 찾으면, 그 앞의 기록이
    // 없을 때 하루도 안 지난 것처럼 되어 두 번째부터 답이 달라진다.
    await setupApp(TODAY, {
      items: [
        anItem({
          id: 'i1',
          first_studied_at: '2026-08-01',
          last_review: addDays(TODAY, -21),
          due: TODAY,
          stability: 14.5,
          reps: 4,
        }),
      ],
    })
    await usePlanner.getState().rateItem('i1', 1, { reviewedAt: TODAY })
    const once = usePlanner.getState().items[0]

    for (let n = 0; n < 3; n += 1) {
      await usePlanner.getState().rateItem('i1', 1, { reviewedAt: TODAY })
      expect(usePlanner.getState().items[0].stability).toBeCloseTo(
        once.stability!,
        8
      )
      expect(usePlanner.getState().items[0].due).toBe(once.due)
    }

    // 다른 등급으로 갔다가 돌아와도 처음 값 그대로여야 한다.
    await usePlanner.getState().rateItem('i1', 4, { reviewedAt: TODAY })
    await usePlanner.getState().rateItem('i1', 1, { reviewedAt: TODAY })
    expect(usePlanner.getState().items[0].stability).toBeCloseTo(
      once.stability!,
      8
    )
    expect(usePlanner.getState().items[0].due).toBe(once.due)
  })

  it('S-176 적은 날 바로 고쳐 눌러도 겹쳐 깎이지 않는다', async () => {
    // 적을 때 고른 등급과 그날 다시 고른 등급이 겹치면 안 된다. 나중 것이 그날의 답이다.
    await setupApp(TODAY, { items: [] })
    await usePlanner
      .getState()
      .addItem({ title: '오늘 공부한 것', firstStudiedAt: TODAY, initialGrade: 3 })
    const id = usePlanner.getState().items[0].id

    await usePlanner.getState().rateItem(id, 1, { reviewedAt: TODAY })
    const once = usePlanner.getState().items[0]
    for (let n = 0; n < 3; n += 1) {
      await usePlanner.getState().rateItem(id, 1, { reviewedAt: TODAY })
      expect(usePlanner.getState().items[0].stability).toBeCloseTo(
        once.stability!,
        8
      )
    }
  })
})

describe('버튼이 약속한 날짜', () => {
  it('S-174 미리보기와 저장이 같은 계산을 본다', async () => {
    // 갈라 두면 버튼이 약속한 날짜와 실제로 잡히는 날짜가 달라진다.
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '못 외운 것', due: TODAY })],
    })
    const { items, reviews, settings, goals } = usePlanner.getState()
    const item = items[0]
    const config = effectiveConfig(item, goals[0] ?? null, settings)
    const rating = stateForRating(item, reviews, TODAY)
    const preview = gradeOptions({
      reviewedAt: TODAY,
      lastReview: rating.lastReview,
      state: rating.state,
      horizon: config.horizon,
      intensity: config.intensity,
      targetRetention: config.targetRetention,
      minReviews: config.minReviews,
      repsSinceGoal: item.reps_since_goal,
      bufferDays: settings.bufferDays,
      maxIntervalDays: config.maxIntervalDays,
    })

    await usePlanner.getState().rateItem('i1', 1, { reviewedAt: TODAY })
    const due = usePlanner.getState().items[0].due!
    const days = Math.round(
      (new Date(due).getTime() - new Date(TODAY).getTime()) / 864e5
    )
    const again = preview.find((o) => o.grade === 1)!
    if (again.next.includes('내일')) expect(days).toBe(1)
    else expect(again.next).toContain(`${days}일 뒤`)
  })
})
