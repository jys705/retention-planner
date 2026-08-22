// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GoalDetailScreen } from '../../src/features/goal/GoalDetailScreen'
import { GoalListScreen } from '../../src/features/goal/GoalListScreen'
import { usePlanner } from '../../src/store/planner'
import { aGoal, anItem, screenWithUser, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'
const noop = () => {}

afterEach(teardownApp)

async function newGoal(user: ReturnType<typeof screenWithUser>['user'], name: string) {
  await user.click(screen.getByRole('button', { name: '목표 만들기' }))
  await user.type(screen.getByLabelText('목표 이름'), name)
}

describe('목표 만들기', () => {
  it('S-047 정해두지 않음', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<GoalListScreen onOpenGoal={noop} />)
    await newGoal(user, '쿠버네티스')
    await user.click(screen.getByRole('button', { name: '정해두지 않음' }))
    await user.click(screen.getByRole('button', { name: '만들기' }))

    const goal = usePlanner.getState().goals[0]
    expect(goal.name).toBe('쿠버네티스')
    expect(goal.horizon_kind).toBe('open')
    expect(goal.ready_at).toBeNull()
  })

  it('S-048 정확한 날짜', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<GoalListScreen onOpenGoal={noop} />)
    await newGoal(user, 'AWS SCS-C03')
    await user.click(screen.getByRole('button', { name: '정확한 날짜' }))
    const picker = screen.getByDisplayValue(TODAY)
    await user.tripleClick(picker)
    await user.keyboard('2026-11-14')
    await user.click(screen.getByRole('button', { name: '만들기' }))

    const goal = usePlanner.getState().goals[0]
    expect(goal.horizon_kind).toBe('date')
    expect(goal.ready_at).toBe('2026-11-14')
    expect(goal.hold_until).toBe('2026-11-14')
  })

  it('S-049 대략', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<GoalListScreen onOpenGoal={noop} />)
    await newGoal(user, '개념 정리')
    await user.click(screen.getByRole('button', { name: '대략' }))
    await user.click(screen.getByRole('button', { name: '만들기' }))

    const goal = usePlanner.getState().goals[0]
    expect(goal.horizon_kind).toBe('window')
    expect(goal.ready_at).not.toBe(goal.hold_until)
  })

  it('S-050 대략 프리셋 8개가 각각 정해진 구간을 만든다', async () => {
    // 중심까지 거리 D 를 여유 폭 25% 로 앞뒤로 벌린 값. 손으로 계산해 적는다.
    const table: [string, string, string][] = [
      ['1주쯤', '2026-10-07', '2026-10-10'],
      ['2주쯤', '2026-10-12', '2026-10-19'],
      ['3주쯤', '2026-10-18', '2026-10-27'],
      ['1개월쯤', '2026-10-25', '2026-11-08'],
      ['2개월쯤', '2026-11-18', '2026-12-15'],
      ['3개월쯤', '2026-12-12', '2027-01-22'],
      ['6개월쯤', '2027-02-22', '2027-05-14'],
      ['1년쯤', '2027-07-20', '2027-12-31'],
    ]
    for (const [label, readyAt, holdUntil] of table) {
      cleanup()
      await setupApp(TODAY)
      const { user } = screenWithUser(<GoalListScreen onOpenGoal={noop} />)
      await newGoal(user, `목표 ${label}`)
      await user.click(screen.getByRole('button', { name: '대략' }))
      await user.click(screen.getByRole('button', { name: label }))
      await user.click(screen.getByRole('button', { name: '만들기' }))

      const goal = usePlanner.getState().goals[0]
      expect(`${label} ${goal.ready_at} ${goal.hold_until}`).toBe(
        `${label} ${readyAt} ${holdUntil}`
      )
    }
  })

  it('S-051 직접 입력으로 임의 구간을 만든다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<GoalListScreen onOpenGoal={noop} />)
    await newGoal(user, '6주쯤 목표')
    await user.click(screen.getByRole('button', { name: '대략' }))
    await user.click(screen.getByRole('button', { name: '직접' }))

    const amount = screen.getByRole('spinbutton')
    await user.tripleClick(amount)
    await user.keyboard('6')
    await user.click(screen.getByRole('button', { name: '주' }))
    await user.click(screen.getByRole('button', { name: '만들기' }))

    // 6주 = 42일. 42/1.25 = 33.6 -> 34, 42*1.25 = 52.5 -> 53
    const goal = usePlanner.getState().goals[0]
    expect(goal.ready_at).toBe('2026-11-04')
    expect(goal.hold_until).toBe('2026-11-23')
  })

  it('S-051b 직접 입력의 단위 세 가지', async () => {
    for (const [unit, readyAt] of [
      ['주', '2026-11-04'],
      ['개월', '2027-02-22'],
      ['년', '2031-07-19'],
    ] as const) {
      cleanup()
      await setupApp(TODAY)
      const { user } = screenWithUser(<GoalListScreen onOpenGoal={noop} />)
      await newGoal(user, `단위 ${unit}`)
      await user.click(screen.getByRole('button', { name: '대략' }))
      await user.click(screen.getByRole('button', { name: '직접' }))
      const amount = screen.getByRole('spinbutton')
      await user.tripleClick(amount)
      await user.keyboard('6')
      await user.click(screen.getByRole('button', { name: unit }))
      await user.click(screen.getByRole('button', { name: '만들기' }))
      expect(`${unit} ${usePlanner.getState().goals[0].ready_at}`).toBe(
        `${unit} ${readyAt}`
      )
    }
  })

  it('S-052 목표 이름이 비면 안 만들어진다', async () => {
    await setupApp(TODAY)
    const { user } = screenWithUser(<GoalListScreen onOpenGoal={noop} />)
    await user.click(screen.getByRole('button', { name: '목표 만들기' }))
    expect(screen.getByRole('button', { name: '만들기' })).toBeDisabled()
  })

  it('S-052b 목표가 없으면 빈 상태를 안내한다', async () => {
    await setupApp(TODAY)
    screenWithUser(<GoalListScreen onOpenGoal={noop} />)
    expect(await screen.findByText('아직 목표가 없어요.')).toBeInTheDocument()
  })
})

describe('목표 상세', () => {
  async function withGoal(over = {}) {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          name: 'AWS SCS-C03',
          horizon_kind: 'date',
          ready_at: '2026-11-14',
          hold_until: '2026-11-14',
          ...over,
        }),
      ],
      items: [1, 2, 3].map((n) =>
        anItem({
          id: `i${n}`,
          goal_id: 'g1',
          title: `문제 ${n}`,
          due: '2026-10-0' + (n + 2),
          first_studied_at: '2026-09-29',
          last_review: '2026-09-29',
        })
      ),
    })
  }

  it('S-053 요약 한 문장이 남은 날과 기억률을 말한다', async () => {
    await withGoal()
    screenWithUser(<GoalDetailScreen goalId="g1" onOpenItem={noop} />)
    expect((await screen.findAllByText(/44일 남음/)).length).toBeGreaterThan(0)
    expect(
      screen.getByText(/지금 속도면 목표한 날 평균 .*쯤 기억하고 있을 거예요/)
    ).toBeInTheDocument()
  })

  it('S-054 강도 4단계를 일괄 수정한다', async () => {
    for (const [label, key] of [
      ['여유', 'easy'],
      ['표준', 'standard'],
      ['집중', 'focus'],
      ['최대', 'max'],
    ] as const) {
      cleanup()
      await withGoal()
      const { user } = screenWithUser(
        <GoalDetailScreen goalId="g1" onOpenItem={noop} />
      )
      await user.click(await screen.findByRole('button', { name: /설정 일괄 수정/ }))
      const panel = screen
        .getByText('여기서 바꾸면 이 목표에 묶인 항목 전부에 적용돼요.')
        .closest('div')!.parentElement!
      await user.click(within(panel).getByRole('button', { name: label }))
      expect(usePlanner.getState().goals[0].intensity).toBe(key)
    }
  })

  it('S-055 목표 시점을 바꾸면 묶인 항목이 따라온다', async () => {
    await withGoal()
    const { user } = screenWithUser(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} />
    )
    await user.click(await screen.findByRole('button', { name: /설정 일괄 수정/ }))
    const picker = screen.getByDisplayValue('2026-11-14')
    await user.tripleClick(picker)
    await user.keyboard('2026-10-20')

    expect(usePlanner.getState().goals[0].ready_at).toBe('2026-10-20')
    // 묶인 항목들이 새 마감선을 넘지 않는다.
    for (const item of usePlanner.getState().items) {
      expect(item.due! <= '2026-10-20').toBe(true)
    }
  })

  it('S-056 고급에서 최소 복습 횟수를 조절한다', async () => {
    await withGoal()
    const { user } = screenWithUser(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} />
    )
    await user.click(await screen.findByRole('button', { name: /설정 일괄 수정/ }))
    await user.click(screen.getByRole('button', { name: /고급/ }))
    const before = usePlanner.getState().goals[0].min_reviews
    await user.click(screen.getByRole('button', { name: '+' }))
    expect(usePlanner.getState().goals[0].min_reviews).toBe(before + 1)
    await user.click(screen.getByRole('button', { name: '−' }))
    expect(usePlanner.getState().goals[0].min_reviews).toBe(before)
  })

  it('S-057 조정 전과 비교를 켠다', async () => {
    await withGoal()
    const { user } = screenWithUser(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} />
    )
    const toggle = await screen.findByRole('checkbox', { name: /조정 전과 비교/ })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    expect(toggle).toBeChecked()
  })

  it('S-058 목표 시점이 없는 목표는 준비 상태가 필요 없다고 말한다', async () => {
    await withGoal({ horizon_kind: 'open', ready_at: null, hold_until: null })
    screenWithUser(<GoalDetailScreen goalId="g1" onOpenItem={noop} />)
    expect(
      await screen.findByText(/목표한 날이 없어서 준비 상태나 날짜 조정은 필요하지 않아요/)
    ).toBeInTheDocument()
  })

  it('S-059 항목별 상태 표에서 항목으로 간다', async () => {
    await withGoal()
    let opened: string | null = null
    const { user } = screenWithUser(
      <GoalDetailScreen goalId="g1" onOpenItem={(id) => (opened = id)} />
    )
    await user.click(await screen.findByText('문제 1'))
    expect(opened).toBe('i1')
  })
})
