// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { getRepository } from '../../src/db'
import { ForecastScreen } from '../../src/features/forecast/ForecastScreen'
import { GoalDetailScreen } from '../../src/features/goal/GoalDetailScreen'
import { GoalListScreen } from '../../src/features/goal/GoalListScreen'
import { PlanPreview } from '../../src/features/newitem/PlanPreview'
import { AppShell } from '../../src/features/shell/AppShell'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { rollout } from '../../src/features/forecast/rollout'
import { freezeToday } from '../../src/lib/clock'
import { percent } from '../../src/lib/format'
import { retentionOn } from '../../src/lib/lifecycle'
import { DEFAULT_SETTINGS } from '../../src/lib/settings'
import { selectTodayItems, usePlanner } from '../../src/store/planner'
import {
  aGoal,
  anItem,
  render,
  setDateInput,
  setupApp,
  shift,
  teardownApp,
} from './harness'

/**
 * 목표한 날 당일을 비워 두는 목표.
 *
 * 목표한 날은 시험을 보거나 발표를 하는 날이라 복습할 틈이 없을 수 있다. 그날을
 * 비워 두면 그 목표의 것은 하나도 올리지 않는다. 준비하다 못 본 것도 같다.
 */
const TODAY = '2026-11-20'
const noop = () => {}

afterEach(teardownApp)

/** 오늘이 목표한 날이다. 훑어볼 것 하나, 준비하다 못 본 것 하나, 다른 목표 것 하나. */
function goalDay(rest: boolean) {
  return {
    goals: [
      aGoal({
        id: 'g1',
        name: '자격증 시험',
        horizon_kind: 'date',
        ready_at: TODAY,
        hold_until: TODAY,
        goal_day: rest ? 'rest' : null,
      }),
      aGoal({
        id: 'g2',
        name: '영어 회화',
        horizon_kind: 'date',
        ready_at: shift(TODAY, 20),
        hold_until: shift(TODAY, 20),
      }),
    ],
    items: [
      anItem({
        id: 'a',
        title: '훑어볼 것',
        goal_id: 'g1',
        due: TODAY,
        due_kind: 'final_check',
        last_review: shift(TODAY, -3),
        stability: 30,
      }),
      anItem({
        id: 'b',
        title: '못 본 것',
        goal_id: 'g1',
        due: shift(TODAY, -1),
        last_review: shift(TODAY, -6),
        stability: 5,
      }),
      anItem({
        id: 'c',
        title: '다른 목표 것',
        goal_id: 'g2',
        due: TODAY,
        last_review: shift(TODAY, -3),
        stability: 3,
      }),
    ],
  }
}

describe('목표한 날을 비워 두면', () => {
  it('S-252 그날은 그 목표 것을 밀린 것까지 하나도 올리지 않는다', async () => {
    await setupApp(TODAY, goalDay(true))
    render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')

    const list = screen.getByRole('list', { name: '오늘 볼 항목' })
    expect(within(list).getByText('다른 목표 것')).toBeInTheDocument()
    expect(within(list).queryByText('훑어볼 것')).toBeNull()
    expect(within(list).queryByText('못 본 것')).toBeNull()
    // 머리의 큰 숫자, 옆줄 배지, 알림은 모두 이 수를 센다.
    expect(selectTodayItems(usePlanner.getState()).map((i) => i.id)).toEqual(['c'])

    const note = screen.getByLabelText('목표한 날')
    // 목록에 다른 목표 것이 서 있으니 어느 목표 것을 뺐는지 이름으로 짚는다.
    expect(note).toHaveTextContent(
      '비워 두기로 해서 자격증 시험 것은 오늘 목록에 올리지 않았어요.'
    )
    expect(note).toHaveTextContent('준비하면서 못 본 1개도 올리지 않았어요.')
    expect(note).not.toHaveTextContent('안 봐도 괜찮습니다')
  })

  it('S-253 그날 볼 것이 없으면 다 봤다고 하지 않고 비워 둔 날이라고 한다', async () => {
    const world = goalDay(true)
    world.items = world.items.filter((i) => i.goal_id === 'g1')
    await setupApp(TODAY, world)
    render(<TodayScreen onOpenItem={noop} />)
    expect(await screen.findByText('오늘은 비워 둔 날이에요.')).toBeInTheDocument()
    expect(screen.queryByText('오늘 볼 건 다 봤어요.')).toBeNull()
  })

  it('S-254 옆줄 배지도 비워 둔 목표의 것을 세지 않는다', async () => {
    await setupApp(TODAY, goalDay(true))
    render(
      <AppShell screen="today" onNavigate={noop} onOpenGoal={noop} onOpenItem={noop}>
        <div />
      </AppShell>
    )
    const nav = await screen.findByRole('button', { name: '오늘 화면' })
    expect(within(nav).getByText('1')).toBeInTheDocument()
  })

  it('S-255 그날 마음을 바꾸면 다시 올라온다', async () => {
    await setupApp(TODAY, goalDay(true))
    await usePlanner.getState().updateGoal('g1', { goal_day: null })
    const ids = selectTodayItems(usePlanner.getState()).map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['a', 'b', 'c']))
  })

  it('S-256 예보에서도 그날은 그 목표 것이 없다', async () => {
    await setupApp(TODAY, goalDay(true))
    const { items, goals, settings } = usePlanner.getState()
    const [day] = rollout({ items, goals, settings, from: TODAY, days: 1 })
    expect(day.items.map((i) => i.itemId)).toEqual(['c'])
  })

  it('S-257 비워 두지 않은 목표는 그날 지금처럼 훑어볼 것을 올린다', async () => {
    await setupApp(TODAY, goalDay(false))
    render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    const ids = selectTodayItems(usePlanner.getState()).map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['a', 'b', 'c']))
    expect(screen.getByLabelText('목표한 날')).toHaveTextContent(
      '준비하면서 못 본 1개가 남아 있어요.'
    )
  })
})

describe('목표한 날 전날', () => {
  /** 내일이 비워 둔 목표한 날이다. 오늘 볼 것이 하나 있다. */
  function eve() {
    return {
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: shift(TODAY, 1),
          hold_until: shift(TODAY, 1),
          goal_day: 'rest',
        }),
      ],
      items: [
        anItem({
          id: 'a',
          title: '마지막 정리',
          goal_id: 'g1',
          due: TODAY,
          last_review: shift(TODAY, -5),
          stability: 10,
          reps_since_goal: 3,
        }),
      ],
    }
  }

  it('S-258 전날이 마지막 복습이라 단추는 날짜 대신 마친다고 적는다', async () => {
    await setupApp(TODAY, eve())
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await user.click(await screen.findByRole('checkbox', { name: '마지막 정리 평가하기' }))
    expect(screen.getAllByText('마침')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /^무난함/ })).toHaveAttribute(
      'title',
      '목표한 날은 비워 두기로 해서 이것이 마지막 복습이에요.'
    )
    await user.click(screen.getByRole('button', { name: /^무난함/ }))
    expect(await screen.findByLabelText('방금 한 일')).toHaveTextContent(
      '목표한 날은 비워 두기로 해서 이것이 마지막 복습이에요.'
    )
    // 다음 날짜는 목표한 날이거나 그 뒤라 오지 않는다. 내일 목록에 안 선다.
    usePlanner.getState().setToday(shift(TODAY, 1))
    await usePlanner.getState().recomputeAll()
    expect(selectTodayItems(usePlanner.getState())).toHaveLength(0)
  })
})

describe('목표 시점 고르기', () => {
  it('S-259 정확한 날짜 목표에서 그날을 비워 둘지 고른다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: shift(TODAY, 10),
          hold_until: shift(TODAY, 10),
        }),
      ],
    })
    const { user } = render(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />
    )
    const group = await screen.findByRole('group', { name: '목표한 날에는' })
    await user.click(within(group).getByRole('button', { name: '비워 두기' }))
    expect(usePlanner.getState().goals[0].goal_day).toBe('rest')
    expect(screen.getByText(', 그날은 비워 둠')).toBeInTheDocument()
    expect(
      screen.getByText('그날에는 아무것도 올리지 않아요. 준비하다 못 본 것도 올리지 않아요.')
    ).toBeInTheDocument()

    // 대략으로 바꾸면 그 선택은 없다.
    await user.click(screen.getByRole('radio', { name: /대략/ }))
    expect(usePlanner.getState().goals[0].goal_day).toBeNull()
    expect(screen.queryByRole('group', { name: '목표한 날에는' })).toBeNull()
  })

  it('S-260 목표 없는 항목의 날짜에는 이 선택이 없다', async () => {
    // 목표한 날 안내는 목표에만 뜬다. 낱개에는 비워 둔다는 것을 말할 자리가 없다.
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '날짜 있음')
    await user.click(screen.getByRole('button', { name: /상세 설정/ }))
    await user.click(screen.getByRole('radio', { name: '정확한 날짜' }))
    expect(screen.queryByRole('group', { name: '목표한 날에는' })).toBeNull()
  })
})

describe('목표한 날의 안내가 덮지 않는 것', () => {
  it('S-261 오늘 아침 기억이 목표 아래인 것은 안 봐도 된다고 하지 않는다', async () => {
    // 전날 '다시' 를 눌러 오늘로 잡힌 것은 건너뛰면 목표 아래다.
    await setupApp(TODAY, {
      goals: [
        aGoal({ id: 'g1', name: '자격증 시험', horizon_kind: 'date', ready_at: TODAY, hold_until: TODAY }),
      ],
      items: [
        anItem({
          id: 'a',
          title: '어제 다시 누른 것',
          goal_id: 'g1',
          due: TODAY,
          last_review: shift(TODAY, -1),
          stability: 0.4,
        }),
      ],
    })
    render(<TodayScreen onOpenItem={noop} />)
    const note = await screen.findByLabelText('목표한 날')
    expect(note).toHaveTextContent('아직 기억이 모자란 1개가 있어요.')
    expect(note).not.toHaveTextContent('안 봐도 괜찮습니다')
    expect(note).not.toHaveTextContent('준비는 어제까지 끝냈어요')
  })
})

describe('목표 화면의 복습 분포', () => {
  it('S-263 잡힌 복습이 없으면 가장 많은 날을 0개짜리 날로 짚지 않는다', async () => {
    // 비워 둔 목표한 날에는 그 목표의 복습이 하나도 없다. 첫날을 '0개' 로 짚으면
    // 그날 무언가 잡혀 있는 것처럼 읽힌다. 예보 화면처럼 없다고 적는다.
    await setupApp(TODAY, goalDay(true))
    render(<GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />)
    const spread = await screen.findByRole('region', { name: '복습 분포' })
    expect(spread).toHaveTextContent('가장 많은 날 없음')
    expect(spread).not.toHaveTextContent(/가장 많은 날 \d+월/)
  })
})

describe('예보 머리', () => {
  it('S-262 비워 둔 목표한 날도 예보가 그날 0개로 말한다', async () => {
    const world = goalDay(true)
    world.items = world.items.filter((i) => i.goal_id === 'g1')
    await setupApp(TODAY, world)
    render(<ForecastScreen />)
    await screen.findByText('예보')
    const { items, goals, settings } = usePlanner.getState()
    const plan = rollout({ items, goals, settings, from: TODAY, days: 3 })
    expect(plan.every((day) => day.items.length === 0)).toBe(true)
  })
})

/** 앱이 시키는 대로 하루씩 산다. 그날 목록에 선 것을 모두 무난함으로 본다. 목표한 날 아침에 멈춘다. */
async function liveUntil(from: string, goalDay: string) {
  const seen = new Map<string, string[]>()
  for (let date = from; date < goalDay; date = shift(date, 1)) {
    freezeToday(date)
    usePlanner.getState().setToday(date)
    await usePlanner.getState().recomputeAll()
    for (const item of selectTodayItems(usePlanner.getState())) {
      seen.set(item.id, [...(seen.get(item.id) ?? []), date])
      await usePlanner.getState().rateItem(item.id, 3, { reviewedAt: date })
    }
  }
  freezeToday(goalDay)
  usePlanner.getState().setToday(goalDay)
  await usePlanner.getState().recomputeAll()
  return seen
}

describe('목표 밖에 걸린 묵은 날짜', () => {
  const START = '2026-11-10'
  const EXAM = '2026-11-20'

  /** 목표 없이 적어 둔 것. 강도가 낮아 다음 날짜가 멀리 잡혀 있다. */
  function looseItem(due: string) {
    return anItem({
      id: 'x',
      title: '따로 적은 것',
      intensity: 'easy',
      first_studied_at: '2026-10-13',
      last_review: '2026-10-13',
      stability: 20,
      difficulty: 5,
      reps: 1,
      reps_since_goal: 1,
      due,
    })
  }

  it('S-264 비워 둔 목표에 넣은 것의 날짜가 목표한 날이면 그 전으로 다시 잡는다', async () => {
    // 날짜가 목표 밖에 걸린 채로 두면 분산도 하루 상한도 그 항목을 안 본다.
    // 목표한 날까지 한 번도 안 올라오고 목표 아래로 끝난다.
    await setupApp(START, {
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: EXAM,
          hold_until: EXAM,
          goal_day: 'rest',
        }),
      ],
      items: [looseItem(EXAM)],
    })
    await usePlanner.getState().attachItemsToGoal('g1', ['x'])
    expect(usePlanner.getState().items[0].due! < EXAM).toBe(true)

    const seen = await liveUntil(START, EXAM)
    expect(seen.get('x')?.length ?? 0).toBeGreaterThan(0)
    const { items, reviews } = usePlanner.getState()
    expect(retentionOn(items[0], reviews, EXAM)).toBeGreaterThanOrEqual(0.9)
  })

  it('S-265 목표한 날을 앞당겨 날짜가 목표 뒤에 걸려도 다시 잡는다', async () => {
    // 비워 두기 없이도 같다. 목표 뒤에 걸린 묵은 날짜는 오지 않는 날이 된다.
    await setupApp(START, {
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: shift(EXAM, 10),
          hold_until: shift(EXAM, 10),
        }),
      ],
      items: [looseItem(shift(EXAM, 1))],
    })
    await usePlanner.getState().attachItemsToGoal('g1', ['x'])
    // 시험이 앞당겨졌다.
    await usePlanner.getState().updateGoal('g1', { ready_at: EXAM, hold_until: EXAM })
    expect(usePlanner.getState().items[0].due! <= EXAM).toBe(true)

    const seen = await liveUntil(START, EXAM)
    expect(seen.get('x')?.length ?? 0).toBeGreaterThan(0)
    const { items, reviews } = usePlanner.getState()
    expect(retentionOn(items[0], reviews, EXAM)).toBeGreaterThanOrEqual(0.9)
  })
})

describe('전날 무너진 것', () => {
  it('S-266 전날 다시 를 눌러 그날 기억이 모자라면 그 사실을 말하고 준비가 끝났다고 하지 않는다', async () => {
    const EVE = shift(TODAY, -1)
    await setupApp(EVE, {
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: TODAY,
          hold_until: TODAY,
          goal_day: 'rest',
        }),
      ],
      items: [
        anItem({
          id: 'a',
          title: '약한 것',
          goal_id: 'g1',
          due: EVE,
          last_review: shift(EVE, -4),
          stability: 4,
          difficulty: 5,
          reps: 3,
          reps_since_goal: 3,
        }),
      ],
    })
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await user.click(await screen.findByRole('checkbox', { name: '약한 것 평가하기' }))
    await user.click(screen.getByRole('button', { name: /^다시/ }))
    const after = usePlanner.getState()
    const morning = retentionOn(after.items[0], after.reviews, TODAY)!
    // 전제: 그날 아침 기억이 목표 아래다. 그날은 올리지 않으니 지금 말해야 안다.
    expect(morning).toBeLessThan(0.9)
    expect(await screen.findByLabelText('방금 한 일')).toHaveTextContent(
      `그날 아침에는 기억이 ${percent(morning)}로 목표에 모자라요.`
    )

    cleanup()
    freezeToday(TODAY)
    usePlanner.getState().setToday(TODAY)
    await usePlanner.getState().recomputeAll()
    render(<TodayScreen onOpenItem={noop} />)
    const note = await screen.findByLabelText('목표한 날')
    expect(note).toHaveTextContent('아직 기억이 모자란 1개도 올리지 않았어요.')
    expect(note).not.toHaveTextContent('준비는 어제까지 끝냈어요')

    cleanup()
    render(<GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />)
    expect(
      await screen.findByText(
        '오늘이 목표한 날이에요. 비워 두기로 해서 아직 기억이 모자란 1개도 오늘 목록에 올리지 않았어요.'
      )
    ).toBeInTheDocument()
  })
})

describe('목표한 날 안내와 목표 화면이 같은 것을 말한다', () => {
  it('S-267 비워 둔 날에 다른 것이 목록에 서 있으면 아무것도 안 올렸다고 하지 않는다', async () => {
    const world = goalDay(true)
    // 밀린 것은 없다. 다른 목표 것과 낱개 하나가 목록에 선다.
    world.items = world.items.filter((i) => i.id !== 'b')
    world.items.push(
      anItem({
        id: 'l',
        title: '낱개 것',
        due: TODAY,
        last_review: shift(TODAY, -3),
        stability: 3,
      })
    )
    await setupApp(TODAY, world)
    render(<TodayScreen onOpenItem={noop} />)
    const note = await screen.findByLabelText('목표한 날')
    expect(note).toHaveTextContent(
      '준비는 어제까지 끝냈어요. 비워 두기로 해서 자격증 시험 것은 오늘 목록에 올리지 않았어요.'
    )
    expect(note).not.toHaveTextContent('아무것도')
    const list = screen.getByRole('list', { name: '오늘 볼 항목' })
    expect(within(list).getByText('낱개 것')).toBeInTheDocument()
  })

  it('S-268 비워 두지 않은 날도 목표 화면은 기억이 모자란 것이 있으면 준비가 끝났다고 하지 않는다', async () => {
    // 오늘 화면의 안내는 '아직 기억이 모자란 1개가 있어요' 라고 한다(S-261).
    await setupApp(TODAY, {
      goals: [
        aGoal({ id: 'g1', name: '자격증 시험', horizon_kind: 'date', ready_at: TODAY, hold_until: TODAY }),
      ],
      items: [
        anItem({
          id: 'a',
          title: '어제 다시 누른 것',
          goal_id: 'g1',
          due: TODAY,
          last_review: shift(TODAY, -1),
          stability: 0.4,
        }),
      ],
    })
    render(<GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />)
    expect(
      await screen.findByText(
        '오늘이 목표한 날이에요. 아직 기억이 모자란 1개는 오늘 목록에 올려뒀어요.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('오늘이 목표한 날이에요. 준비는 어제까지 마쳤어요.')).toBeNull()
  })

  it('S-269 비워 둔 날 숨긴 밀린 것은 목표 화면에서도 다음에 볼 날이 없다', async () => {
    // 항목 화면이 '없음' 이라 하는데 목표 화면이 '1일 지남' 이라 하면 둘 중 하나는 틀린 말이다.
    await setupApp(TODAY, goalDay(true))
    render(<GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />)
    const row = (await screen.findByText('못 본 것')).closest('tr')!
    expect(row).toHaveTextContent('없음')
    expect(row).not.toHaveTextContent('지남')
  })
})

describe('비워 두기가 뜻이 없는 곳', () => {
  it('S-270 목표 뒤로도 계속 보는 목표에는 비워 두기가 없다', async () => {
    // 계속 보는 목표는 목표한 날 뒤로도 이어진다. 그날을 비우면 그날 잡힌 것이 다음 날
    // 밀린 것으로 선다. '마지막 복습은 전날' 이라는 약속이 성립하지 않는다.
    const world = goalDay(true)
    world.goals[0] = { ...world.goals[0], post_goal_mode: 'maintain' }
    await setupApp(TODAY, world)
    const ids = selectTodayItems(usePlanner.getState()).map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['a', 'b', 'c']))
    render(<GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />)
    await screen.findByText('목표 설정')
    expect(screen.queryByRole('group', { name: '목표한 날에는' })).toBeNull()
    expect(screen.queryByText(', 그날은 비워 둠')).toBeNull()
  })

  it('S-273 오늘을 목표한 날로 두고 비워 두면 목표를 만들지 않는다', async () => {
    // 그러면 이 목표로는 볼 날이 하루도 없다. 넣는 항목이 그날 숨었다가 다음 날 끝난다.
    await setupApp(TODAY)
    const { user } = render(<GoalListScreen onOpenGoal={noop} />)
    await user.click(screen.getByRole('button', { name: '목표 만들기' }))
    await user.type(screen.getByLabelText('목표 이름'), '발표')
    await user.click(screen.getByRole('radio', { name: /^정확한 날짜/ }))
    const group = screen.getByRole('group', { name: '목표한 날에는' })
    await user.click(within(group).getByRole('button', { name: '비워 두기' }))
    expect(screen.getByRole('button', { name: '만들기' })).toBeDisabled()
    expect(
      screen.getByText('오늘을 비워 두면 볼 날이 없어요. 내일이나 그 뒤를 고르세요.')
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('목표 이름'), '{Enter}')
    expect(usePlanner.getState().goals).toHaveLength(0)
  })

  it('S-274 비워 둔 날 적는 것은 미리보기가 바로 오늘 목록에 오른다고 하지 않는다', () => {
    // 공부한 날을 앞으로 당겨 적으면 볼 때가 이미 됐다. 그래도 오늘은 비워 둔 날이다.
    const goal = aGoal({
      id: 'g1',
      name: '자격증 시험',
      horizon_kind: 'date',
      ready_at: TODAY,
      hold_until: TODAY,
      goal_day: 'rest',
    })
    render(
      <PlanPreview
        today={TODAY}
        goal={goal}
        settings={DEFAULT_SETTINGS}
        firstStudiedAt={shift(TODAY, -3)}
        horizon={null}
        intensity={null}
        initialGrade={3}
      />
    )
    const rail = screen.getByLabelText('앞으로 보게 될 횟수')
    expect(rail).not.toHaveTextContent('적으면 바로 오늘 목록에 올라옵니다')
    expect(rail).toHaveTextContent(
      '오늘은 비워 두기로 한 목표한 날이라 오늘 목록에 올리지 않아요.'
    )
  })
})

describe('마친 목표를 다시 열 때', () => {
  const ENDED = '2026-09-03'
  const NOW = '2026-10-27'

  /** 목표한 날 칸이 생기기 전에 저장한 목표와 그 항목. 목표 행에 goal_day 키가 없다. */
  function oldWorld() {
    return {
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: ENDED,
          hold_until: ENDED,
        }),
      ],
      items: [
        anItem({
          id: 'a',
          title: '마친 것',
          goal_id: 'g1',
          state: 'archived',
          archived_at: '2026-09-04T00:00:00.000Z',
          first_studied_at: '2026-08-20',
          last_review: ENDED,
          stability: 30,
          due: shift(ENDED, 5),
        }),
      ],
    }
  }

  it('S-271 다시 연 것을 되돌리면 저장소의 비워 두기도 같이 되돌린다', async () => {
    const world = oldWorld()
    expect('goal_day' in world.goals[0]).toBe(false)
    await setupApp(NOW, world)
    await usePlanner
      .getState()
      .reopenGoal('g1', { kind: 'date', at: shift(NOW, 10), rest: true })
    await usePlanner.getState().undoReopen()
    const stored = await (await getRepository()).getGoal('g1')
    expect(stored?.goal_day ?? null).toBeNull()
    // 다시 켜도 비워 두기가 살아나지 않는다.
    await usePlanner.getState().load()
    expect(usePlanner.getState().goals[0].goal_day ?? null).toBeNull()
  })

  it('S-272 오늘 날짜로 다시 열면서 그날을 비워 두면 다시 시작하지 않는다', async () => {
    await setupApp(NOW, oldWorld())
    const { user } = render(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />
    )
    await user.click(await screen.findByRole('button', { name: '날짜 다시 정하기' }))
    await setDateInput(user, screen.getByRole('button', { name: '목표한 날 고르기' }), NOW)
    const group = screen.getByRole('group', { name: '목표한 날에는' })
    await user.click(within(group).getByRole('button', { name: '비워 두기' }))
    const start = screen.getByRole('button', { name: '이 시점으로 다시 시작하기' })
    expect(start).toBeDisabled()
    expect(
      screen.getByText('오늘을 비워 두면 볼 날이 없어요. 내일이나 그 뒤를 고르세요.')
    ).toBeInTheDocument()
    // 하루 뒤로 고르면 전날인 오늘 볼 수 있다.
    await setDateInput(
      user,
      screen.getByRole('button', { name: '목표한 날 고르기' }),
      shift(NOW, 1)
    )
    expect(start).toBeEnabled()
  })
})
