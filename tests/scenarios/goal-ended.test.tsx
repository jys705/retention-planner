// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppShell } from '../../src/features/shell/AppShell'
import { ForecastScreen } from '../../src/features/forecast/ForecastScreen'
import { GoalDetailScreen } from '../../src/features/goal/GoalDetailScreen'
import { GoalListScreen } from '../../src/features/goal/GoalListScreen'
import { ItemDetailScreen } from '../../src/features/item/ItemDetailScreen'
import { LibraryScreen } from '../../src/features/library/LibraryScreen'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { toCsv } from '../../src/lib/transfer'
import { freezeToday } from '../../src/lib/clock'
import { isActive } from '../../src/lib/domain'
import { selectTodayItems, usePlanner } from '../../src/store/planner'
import type { ItemRow, ReviewRow } from '../../src/db/types'
import {
  aGoal,
  anItem,
  pickFromMenu,
  render,
  setupApp,
  shift,
  teardownApp,
} from './harness'

/**
 * 실제로 겪은 모양을 그대로 옮긴 세계.
 *
 * 목표한 날까지 공부하고 그 뒤로 앱을 안 켰다. 목표한 날 당일에 평가한 것들은
 * 다음 날짜가 목표 뒤로 잡혀 있고, 오늘은 그로부터 쉰 날 넘게 지났다.
 */
const GOAL_DAY = '2026-09-03'
const TODAY = '2026-10-27'
const noop = () => {}

afterEach(teardownApp)

function finishedWorld(count = 27, mode: 'archive' | 'maintain' = 'archive') {
  const items: ItemRow[] = []
  const reviews: ReviewRow[] = []
  for (let i = 0; i < count; i += 1) {
    const last = shift(GOAL_DAY, -(i % 3))
    items.push(
      anItem({
        id: `i${i}`,
        title: `${i * 10 + 1}~${i * 10 + 10}번 문제`,
        goal_id: 'g1',
        first_studied_at: '2026-08-19',
        last_review: last,
        // 목표한 날 다음 날부터 열하루 사이에 흩어져 있다.
        due: shift(GOAL_DAY, 1 + (i % 11)),
        state: i % 4 === 0 ? 'holding' : 'review',
        stability: 18 + (i % 7) * 4,
        difficulty: 5,
        reps: 5,
        reps_since_goal: 5,
      })
    )
    reviews.push({
      id: `r${i}`,
      item_id: `i${i}`,
      reviewed_at: last,
      recorded_at: `${last}T09:00:00.000Z`,
      rating: 3,
      state_before: 'review',
      s_before: 12,
      d_before: 5,
      s_after: 18 + (i % 7) * 4,
      d_after: 5,
      elapsed_days: 4,
      scheduled_days: 4,
      r_at_review: 0.9,
      next_interval: 6,
      memo_snapshot: null,
    })
  }
  return {
    goals: [
      aGoal({
        id: 'g1',
        name: '자격증 시험',
        horizon_kind: 'date',
        ready_at: GOAL_DAY,
        hold_until: GOAL_DAY,
        post_goal_mode: mode,
      }),
    ],
    items,
    reviews,
  }
}

describe('목표한 날이 지난 목표', () => {
  it('S-210 끝난 목표의 항목은 오늘 목록에 안 올라온다', async () => {
    // 목표를 마쳤으면 지킬 기억률이 없다. 며칠 지났는지도 물을 일이 아니다.
    await setupApp(TODAY, finishedWorld())
    render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText(/밀린 것/)).toBeNull()
    expect(screen.queryByText(/일 지남/)).toBeNull()
  })

  it('S-211 옆줄 배지도 알림 수도 끝난 목표를 안 센다', async () => {
    await setupApp(TODAY, finishedWorld())
    render(
      <AppShell
        screen="today"
        onNavigate={noop}
        onOpenGoal={noop}
        onOpenItem={noop}
      >
        <div />
      </AppShell>
    )
    const nav = await screen.findByRole('button', { name: '오늘 화면' })
    expect(within(nav).queryByText('27')).toBeNull()
    // 알림은 이 수를 센다.
    expect(selectTodayItems(usePlanner.getState())).toHaveLength(0)
  })

  it('S-212 지난 목표는 다가오는 목표에 안 선다', async () => {
    await setupApp(TODAY, finishedWorld())
    render(
      <AppShell
        screen="today"
        onNavigate={noop}
        onOpenGoal={noop}
        onOpenItem={noop}
      >
        <div />
      </AppShell>
    )
    await screen.findByRole('button', { name: '오늘 화면' })
    expect(screen.queryByText('다가오는 목표')).toBeNull()
    expect(screen.queryByText('자격증 시험')).toBeNull()
  })

  it('S-213 예보는 비어 있다고 바르게 말한다', async () => {
    // 막대는 비었는데 '오늘 화면에서 한 줄 적어보세요' 라고만 하면, 적어둔 것이
    // 어디 갔는지 모른다. 마친 목표의 것은 보관해 뒀다고 말한다.
    await setupApp(TODAY, finishedWorld())
    render(<ForecastScreen />)
    expect(
      await screen.findByText(
        '앞으로 잡힌 복습이 없어요. 마친 목표의 항목은 보관해 두어서 여기에 안 올라와요.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('두 달 동안 잡힌 복습이 없어요.')).toBeInTheDocument()
    expect(selectTodayItems(usePlanner.getState())).toHaveLength(0)
  })

  it('S-214 평가 기록은 하나도 안 사라진다', async () => {
    await setupApp(TODAY, finishedWorld())
    expect(usePlanner.getState().reviews).toHaveLength(27)
    expect(usePlanner.getState().items).toHaveLength(27)
  })
})

describe('끝나지 않은 목표는 그대로', () => {
  it('S-215 목표한 날 당일에는 아직 끝나지 않았다', async () => {
    // 당일에 남는 것은 해도 되고 안 해도 되는 것으로 권한다(앞서 만든 동작).
    const world = finishedWorld(3)
    world.items.forEach((i) => {
      i.due = GOAL_DAY
    })
    await setupApp(GOAL_DAY, world)
    render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.getByText(/안 봐도 괜찮습니다/)).toBeInTheDocument()
  })

  it('S-216 대략 목표의 유지 구간에서는 계속 본다', async () => {
    // 이른 쪽 끝이 지났어도 늦은 쪽 끝까지는 그 상태를 지켜야 한다.
    const world = finishedWorld(3)
    world.goals[0] = aGoal({
      id: 'g1',
      name: '자격증 시험',
      horizon_kind: 'window',
      ready_at: shift(TODAY, -10),
      hold_until: shift(TODAY, 10),
      post_goal_mode: 'archive',
    })
    world.items.forEach((i) => {
      i.due = shift(TODAY, -1)
    })
    await setupApp(TODAY, world)
    render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('S-217 목표 뒤에도 계속 보기로 한 목표는 이어 간다', async () => {
    await setupApp(TODAY, finishedWorld(3, 'maintain'))
    expect(selectTodayItems(usePlanner.getState()).length).toBe(3)
  })

  it('S-218 목표한 날을 뒤로 미루면 항목이 돌아온다', async () => {
    // 시험이 미뤄지는 일은 흔하다. 끝난 것으로 쳤던 항목이 되살아나야 한다.
    await setupApp(TODAY, finishedWorld(3))
    expect(selectTodayItems(usePlanner.getState())).toHaveLength(0)

    await usePlanner.getState().updateGoal('g1', {
      ready_at: shift(TODAY, 20),
      hold_until: shift(TODAY, 20),
    })
    expect(selectTodayItems(usePlanner.getState()).length).toBe(3)
    // 보관해 둔 동안의 묵은 날짜는 살리지 않는다. 오늘부터 다시 잡는다.
    expect(usePlanner.getState().items.every((i) => i.due! >= TODAY)).toBe(true)
  })
})

/** 저장소를 처음부터 다시 읽는다. 앱을 껐다 켠 것과 같다. */
async function reopen() {
  await usePlanner.getState().load()
}

/** 보관 날짜와 상태는 늘 같은 말을 해야 한다. */
function expectConsistent() {
  for (const item of usePlanner.getState().items) {
    expect(item.archived_at !== null).toBe(item.state === 'archived')
  }
}

describe('마친 목표를 알린다', () => {
  it('S-219 돌아온 날 오늘 화면이 무엇을 내렸는지 한 번 말한다', async () => {
    // 항목이 말없이 사라지면 지워진 줄 안다. 며칠 지났는지는 말하지 않는다.
    await setupApp(TODAY, finishedWorld())
    const { user } = render(<TodayScreen onOpenItem={noop} onOpenGoal={noop} />)
    const note = await screen.findByLabelText('마친 목표')
    expect(note).toHaveTextContent('자격증 시험을 9월 3일에 마쳤어요.')
    // 돌아온 사람이 먼저 궁금한 것은 목표한 날 기억이 충분했는지다.
    expect(note).toHaveTextContent(
      '목표한 날 27개 모두 목표 기억률 90%를 넘겼어요. 더 올라오지 않고 기록으로 남겨 뒀어요.'
    )
    expect(note).not.toHaveTextContent(/지남/)

    await user.click(within(note).getByRole('button', { name: '확인' }))
    expect(screen.queryByLabelText('마친 목표')).toBeNull()
    expect(usePlanner.getState().settings.seenEnded).toContain('g1@2026-09-03')

    // 껐다 켜도 같은 끝을 또 알리지 않는다.
    await reopen()
    expect(screen.queryByLabelText('마친 목표')).toBeNull()
  })

  it('S-220 알림에서 목표를 열면 그것으로 확인한 것이다', async () => {
    await setupApp(TODAY, finishedWorld(3))
    const opened: string[] = []
    const { user } = render(
      <TodayScreen onOpenItem={noop} onOpenGoal={(id) => opened.push(id)} />
    )
    const note = await screen.findByLabelText('마친 목표')
    await user.click(within(note).getByRole('button', { name: '기록 보기' }))
    expect(opened).toEqual(['g1'])
    expect(usePlanner.getState().settings.seenEnded).toContain('g1@2026-09-03')
  })

  it('S-221 날짜를 미뤘다가 그 날이 또 지나면 다시 알린다', async () => {
    await setupApp(TODAY, finishedWorld(3))
    await usePlanner.getState().acknowledgeEnded(['g1@2026-09-03'])
    await usePlanner.getState().updateGoal('g1', {
      ready_at: shift(TODAY, 5),
      hold_until: shift(TODAY, 5),
    })
    usePlanner.getState().setToday(shift(TODAY, 6))
    await usePlanner.getState().recomputeAll()
    render(<TodayScreen onOpenItem={noop} onOpenGoal={noop} />)
    expect(await screen.findByLabelText('마친 목표')).toHaveTextContent(
      '자격증 시험을 11월 1일에 마쳤어요.'
    )
  })

  it('S-222 전부 마쳤으면 전체 기억률 자리에 0% 를 세우지 않는다', async () => {
    // 지킬 것이 없을 뿐 다 잊은 것이 아니다.
    await setupApp(TODAY, finishedWorld())
    render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    expect(screen.queryByText('전체 기억률')).toBeNull()
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('S-223 전부 마친 날의 빈 화면은 다 봤다고 하지 않는다', async () => {
    await setupApp(TODAY, finishedWorld())
    render(<TodayScreen onOpenItem={noop} />)
    expect(await screen.findByText('지금 볼 항목이 없어요.')).toBeInTheDocument()
    expect(screen.queryByText('오늘 볼 건 다 봤어요.')).toBeNull()
    expect(screen.queryByText(/다시 채워집니다/)).toBeNull()
  })
})

describe('목표의 마지막 날', () => {
  /** 오늘이 목표한 날이고, 오늘 볼 것이 하나 있는 세계. */
  function lastDay(post: 'archive' | 'maintain' = 'archive') {
    return {
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: TODAY,
          hold_until: TODAY,
          post_goal_mode: post,
        }),
      ],
      items: [
        anItem({
          id: 'i1',
          title: '마지막 점검',
          goal_id: 'g1',
          due: TODAY,
          due_kind: 'final_check',
          last_review: shift(TODAY, -4),
          stability: 30,
          reps: 4,
          reps_since_goal: 4,
        }),
      ],
    }
  }

  it('S-243 목표한 날 안내는 그 목표의 것만 세고 남의 것을 덮지 않는다', async () => {
    // 다른 목표의 복습까지 '안 봐도 괜찮습니다' 로 덮으면 해야 할 일을 빼먹게 된다.
    const world = lastDay()
    world.items.push(
      anItem({ id: 'i2', title: '못 본 것', goal_id: 'g1', due: shift(TODAY, -1), last_review: shift(TODAY, -6), stability: 5 }),
      anItem({ id: 'i3', title: '다른 목표 것', goal_id: 'g2', due: TODAY, last_review: shift(TODAY, -3), stability: 3 })
    )
    world.goals.push(
      aGoal({ id: 'g2', name: '다음 시험', horizon_kind: 'date', ready_at: shift(TODAY, 20), hold_until: shift(TODAY, 20) })
    )
    await setupApp(TODAY, world)
    render(<TodayScreen onOpenItem={noop} />)
    const note = await screen.findByLabelText('목표한 날')
    expect(note).toHaveTextContent('준비하면서 못 본 1개가 남아 있어요.')
    expect(note).toHaveTextContent('나머지 자격증 시험 것은 안 봐도 괜찮습니다.')
    expect(note).not.toHaveTextContent('준비는 어제까지 끝냈어요')
  })

  it('S-224 마지막 날의 등급 단추는 날짜 대신 마친다고 적는다', async () => {
    // 그날 보고 나면 다음 날짜는 목표 뒤라 오지 않는다. 오지 않을 날을 약속하지 않는다.
    await setupApp(TODAY, lastDay())
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await user.click(await screen.findByRole('checkbox', { name: '마지막 점검 평가하기' }))
    expect(screen.getAllByText('마침')).toHaveLength(4)
    expect(screen.queryByText(/일 뒤$/)).toBeNull()
  })

  it('S-225 마지막 날에는 평가해도 보관하지 않고, 다음 날 목표째로 마친다', async () => {
    // 그날 본 것을 바로 넘기면 한 목표 안에 마친 것과 진행 중인 것이 하루 동안 섞인다.
    // 목표 화면에서 항목이 하나씩 빠져 목표가 반쯤 끝난 꼴이 된다.
    await setupApp(TODAY, lastDay())
    await usePlanner.getState().rateItem('i1', 1, { reviewedAt: TODAY })
    let item = usePlanner.getState().items[0]
    expect(item.state).toBe('relearning')
    expect(item.archived_at).toBeNull()
    expectConsistent()

    usePlanner.getState().setToday(shift(TODAY, 1))
    await usePlanner.getState().recomputeAll()
    item = usePlanner.getState().items[0]
    expect(item.state).toBe('archived')
    expectConsistent()
  })

  it('S-226 계속 보기로 한 목표는 마지막 날 뒤로도 이어 간다', async () => {
    await setupApp(TODAY, lastDay('maintain'))
    await usePlanner.getState().rateItem('i1', 3, { reviewedAt: TODAY })
    expect(usePlanner.getState().items[0].due! > TODAY).toBe(true)
    usePlanner.getState().setToday(shift(TODAY, 1))
    await usePlanner.getState().recomputeAll()
    const item = usePlanner.getState().items[0]
    expect(item.archived_at).toBeNull()
    expect(isActive(item)).toBe(true)
  })

  it('S-244 목표 전이라도 다음 날짜가 목표 뒤면 단추와 판이 날짜를 약속하지 않는다', async () => {
    // 목표한 날까지 기억이 충분하면 다음 날짜가 목표 뒤로 잡힌다. 그 날은 오지 않는다.
    const world = lastDay()
    world.goals[0] = aGoal({
      id: 'g1',
      name: '자격증 시험',
      horizon_kind: 'date',
      ready_at: shift(TODAY, 2),
      hold_until: shift(TODAY, 2),
    })
    await setupApp(TODAY, world)
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await user.click(await screen.findByRole('checkbox', { name: '마지막 점검 평가하기' }))
    // 쉬움은 목표 뒤로 넘어가고, 다시는 그 전에 다시 본다.
    const easy = screen.getByRole('button', { name: /^쉬움/ })
    expect(easy).toHaveTextContent('마침')
    expect(easy).toHaveAttribute('title', '목표한 날까지는 이것으로 마쳐요. 다음 날짜가 목표 뒤라서요.')
    expect(screen.getByRole('button', { name: /^다시/ })).not.toHaveTextContent('마침')

    await user.click(easy)
    const panel = await screen.findByLabelText('방금 한 일')
    expect(panel).toHaveTextContent('목표한 날까지는 이것으로 마쳐요.')
  })

  it('S-227 목표 뒤로 잡힌 날짜는 다음에 볼 날로 세지 않는다', async () => {
    // 목표한 날까지 충분해서 다음 날짜가 목표 뒤로 잡힌 것. 그 날이 오기 전에
    // 목표가 끝나 내려가므로, 오늘 화면이 '다음은 9월 7일' 이라고 하면 거짓이다.
    const world = finishedWorld(3)
    world.items.forEach((i) => {
      i.due = shift(GOAL_DAY, 4)
    })
    await setupApp(GOAL_DAY, world)
    render(<TodayScreen onOpenItem={noop} />)
    expect(await screen.findByText('오늘 볼 건 다 봤어요.')).toBeInTheDocument()
    expect(screen.getByText('목표한 날까지 볼 것은 다 마쳤어요.')).toBeInTheDocument()
    expect(screen.queryByText(/9월 7일/)).toBeNull()
    // 잡아둔 복습에도 그 날은 없다.
    expect(usePlanner.getState().planned).toHaveLength(0)
  })

  it('S-228 목표 뒤로 잡힌 항목은 항목 상세에서도 다음에 볼 날이 없다', async () => {
    const world = finishedWorld(1)
    world.items[0].due = shift(GOAL_DAY, 4)
    await setupApp(shift(GOAL_DAY, -1), world)
    render(<ItemDetailScreen itemId="i0" onBack={noop} />)
    await screen.findByText('다음에 볼 날')
    expect(screen.getByText('더 잡지 않는 이유')).toBeInTheDocument()
    expect(screen.getByText(/목표한 날까지 이대로 충분해서 더 잡지 않았어요/)).toBeInTheDocument()
    expect(screen.queryByText('5일 뒤')).toBeNull()
  })

  it('S-229 다른 목표의 복습이 끝날 목표의 것에 밀리지 않는다', async () => {
    // 끝나는 목표의 다음 날짜는 오지 않는다. 그 자리를 세면 오지도 않을 것 때문에
    // 하루 상한이 차서 다른 목표의 복습이 엉뚱한 날로 밀린다.
    const ending = finishedWorld(3)
    ending.items.forEach((i) => {
      i.due = shift(GOAL_DAY, 1)
    })
    // 간격을 이틀로 둔다. 그보다 길면 하루 상한과 상관없이 흔드는 층이 날짜를 옮긴다.
    const other = [0, 1, 2].map((n) =>
      anItem({
        id: `o${n}`,
        title: `다른 것 ${n + 1}`,
        goal_id: null,
        due: shift(GOAL_DAY, 1),
        last_review: shift(GOAL_DAY, -1),
        stability: 3,
      })
    )
    await setupApp(GOAL_DAY, {
      goals: ending.goals,
      items: [...ending.items, ...other],
      reviews: ending.reviews,
      settings: { dailyCap: '3' },
    })
    for (const n of [0, 1, 2]) {
      const item = usePlanner.getState().items.find((i) => i.id === `o${n}`)!
      expect(item.due).toBe(shift(GOAL_DAY, 1))
      expect(item.due_source).toBe('fsrs')
    }
  })
})

describe('마친 목표는 목표 화면에 결과로 남는다', () => {
  it('S-230 목표 목록은 마친 목표를 따로 세우고 며칠 지났는지 적지 않는다', async () => {
    await setupApp(TODAY, finishedWorld())
    render(<GoalListScreen onOpenGoal={noop} />)
    expect(await screen.findByText('진행 중인 목표가 없어요.')).toBeInTheDocument()
    const done = screen.getByRole('region', { name: '마친 목표' })
    const row = within(done).getByRole('button', { name: /자격증 시험/ })
    expect(row).toHaveTextContent('9월 3일에 마침')
    expect(row).toHaveTextContent('27개')
    expect(row).toHaveTextContent(/목표한 날 (9\d|100)%/)
    expect(row).not.toHaveTextContent(/부족|지남/)
  })

  it('S-231 마친 목표의 상세는 결과를 말한다', async () => {
    await setupApp(TODAY, finishedWorld())
    render(<GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />)
    await screen.findByText('항목별 결과')
    // 레일의 큰 값과 표의 칸 이름이 같은 말을 쓴다.
    expect(screen.getAllByText('목표한 날 기억률')).toHaveLength(2)
    expect(screen.getByText('마침')).toBeInTheDocument()
    expect(screen.getByText('목표 90%를 지켰어요.')).toBeInTheDocument()
    expect(
      screen.getByText(
        '8월 19일부터 9월 3일까지 27개를 27번 봤어요. 목표한 날에는 27개 모두 목표 기억률 90%를 넘겼어요.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('항목별 결과')).toBeInTheDocument()
    // 앞으로 할 일을 말하던 것들은 없다.
    expect(screen.queryByText(/끌어올리는 중/)).toBeNull()
    expect(screen.queryByText(/지남/)).toBeNull()
    expect(screen.queryByText(/밀린/)).toBeNull()
    expect(screen.queryByRole('region', { name: '복습 분포' })).toBeNull()
    // 앞날의 분포 대신 지나온 기록을 그린다.
    const history = screen.getByRole('region', { name: '지난 복습' })
    expect(history).toHaveTextContent('가장 많이 본 날 9월 1일 9번')
    expect(history).toHaveTextContent('처음 공부한 날부터 목표한 날까지 실제로 본 날과 횟수예요.')
    // 연 것으로 확인한 것이다.
    expect(usePlanner.getState().settings.seenEnded).toContain('g1@2026-09-03')
  })

  it('S-232 계속 기억하기를 고르면 항목이 다시 올라온다', async () => {
    await setupApp(TODAY, finishedWorld())
    const { user } = render(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />
    )
    await user.click(await screen.findByRole('button', { name: '계속 기억하기' }))
    expect(screen.getByText(/27개를 다시 올려요/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 올리기' }))

    expect(usePlanner.getState().goals[0].horizon_kind).toBe('open')
    const items = usePlanner.getState().items
    expect(items.every(isActive)).toBe(true)
    // 보관해 둔 동안의 묵은 날짜를 살리면 '53일 지남' 27개가 쏟아진다. 오늘부터
    // 다시 잡고, 하루 상한을 넘는 것은 뒤로 편다.
    expect(items.every((i) => i.due !== null && i.due >= TODAY)).toBe(true)
    expect(selectTodayItems(usePlanner.getState())).toHaveLength(20)
    expectConsistent()
    // 이제 끝나지 않는 목표다. 결과 화면이 아니라 평소 화면이 선다.
    expect(await screen.findByText('지금 평균 기억률')).toBeInTheDocument()
  })

  it('S-248 다시 연 목표는 그 자리에서 되돌릴 수 있다', async () => {
    // 다시 열면 끝난 날짜가 덮이고, 지난 날짜는 다시 고를 수 없다. 잘못 눌렀으면
    // 평가처럼 그 자리에서 물릴 수 있어야 한다.
    await setupApp(TODAY, finishedWorld())
    const before = usePlanner.getState()
    const { user } = render(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />
    )
    await user.click(await screen.findByRole('button', { name: '계속 기억하기' }))
    await user.click(screen.getByRole('button', { name: '다시 올리기' }))

    const note = await screen.findByLabelText('방금 한 일')
    expect(note).toHaveTextContent('자격증 시험을 다시 열었어요. 항목 27개가 오늘부터 다시 잡혔어요.')
    await user.click(within(note).getByRole('button', { name: '되돌리기' }))

    const after = usePlanner.getState()
    expect(after.goals[0]).toEqual(before.goals[0])
    expect(after.items).toEqual(before.items)
    expect(after.planned).toEqual(before.planned)
    expect(selectTodayItems(after)).toHaveLength(0)
    expectConsistent()
    expect(await screen.findByText('항목별 결과')).toBeInTheDocument()
    // 껐다 켜도 되돌린 그대로다.
    await reopen()
    expect(usePlanner.getState().goals[0].ready_at).toBe(GOAL_DAY)
    expect(usePlanner.getState().items.every((i) => !isActive(i))).toBe(true)
  })

  it('S-249 그 사이 다른 쓰기가 끼면 다시 연 것은 되돌리지 않는다', async () => {
    await setupApp(TODAY, finishedWorld(3))
    await usePlanner.getState().reopenGoal('g1', { kind: 'open' })
    expect(usePlanner.getState().lastReopen).not.toBeNull()
    await usePlanner.getState().rateItem('i0', 3, { reviewedAt: TODAY })
    await usePlanner.getState().undoReopen()
    // 사진이 낡았다. 그대로 되돌리면 방금 한 평가와 항목이 어긋난다.
    expect(usePlanner.getState().goals[0].horizon_kind).toBe('open')
    expect(usePlanner.getState().items.every(isActive)).toBe(true)
  })

  it('S-233 날짜 다시 정하기는 새 날짜를 고르는 칸을 연다', async () => {
    await setupApp(TODAY, finishedWorld(3))
    const { user } = render(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />
    )
    await user.click(await screen.findByRole('button', { name: '날짜 다시 정하기' }))
    expect(screen.getByText(/그 시점에 맞춰 3개가 다시 잡혀요/)).toBeInTheDocument()
    // 지난 날짜 그대로는 다시 시작할 수 없다. 고르기만 해서는 아무것도 안 바뀐다.
    const start = screen.getByRole('button', { name: '이 시점으로 다시 시작하기' })
    expect(start).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: /정해두지 않음/ }))
    expect(usePlanner.getState().goals[0].horizon_kind).toBe('date')
    expect(start).toBeEnabled()

    await user.click(start)
    expect(usePlanner.getState().goals[0].horizon_kind).toBe('open')
    expect(usePlanner.getState().items.every(isActive)).toBe(true)
  })

  it('S-234 마친 목표만 지우면 항목은 마친 채로 남는다', async () => {
    // 평가 이력은 나중에 계산을 이 사람에게 맞추는 데 쓴다. 지우는 쪽보다 남기는
    // 쪽이 기본이다. 소속만 풀면 목표 시점이 사라져 마친 것이 무기한으로 되살아나므로
    // 목표 시점을 항목에 옮겨 담는다.
    await setupApp(TODAY, finishedWorld())
    const { user } = render(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />
    )
    await screen.findByText('항목별 결과')
    await pickFromMenu(user, '이 목표 더보기', '목표 삭제')
    expect(screen.getByRole('radio', { name: /목표만 지우기/ })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await user.click(screen.getByRole('button', { name: '지우기' }))

    const { goals, items, reviews } = usePlanner.getState()
    expect(goals).toHaveLength(0)
    expect(items).toHaveLength(27)
    expect(reviews).toHaveLength(27)
    expect(items.every((i) => !isActive(i) && i.goal_id === null)).toBe(true)
    expect(items.every((i) => i.horizon_kind === 'date' && i.ready_at === GOAL_DAY)).toBe(true)
    expect(selectTodayItems(usePlanner.getState())).toHaveLength(0)
    expectConsistent()

    // 지운 사람은 끝난 것을 안다. 남긴 항목을 또 알리지 않는다.
    await reopen()
    render(<TodayScreen onOpenItem={noop} />)
    await screen.findByText('오늘 볼 항목')
    expect(screen.queryByLabelText('마친 목표')).toBeNull()
    expect(screen.queryByLabelText('마친 항목')).toBeNull()
  })

  it('S-235 항목까지 지우면 평가 기록도 함께 사라진다', async () => {
    await setupApp(TODAY, finishedWorld())
    const { user } = render(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />
    )
    await screen.findByText('항목별 결과')
    await pickFromMenu(user, '이 목표 더보기', '목표 삭제')
    const all = screen.getByRole('radio', { name: /항목까지 지우기/ })
    expect(all).toHaveTextContent('항목 27개와 평가 27건이 함께 사라집니다. 되돌릴 수 없어요.')
    await user.click(all)
    await user.click(screen.getByRole('button', { name: '지우기' }))

    const { goals, items, reviews, planned } = usePlanner.getState()
    expect(goals).toHaveLength(0)
    expect(items).toHaveLength(0)
    expect(reviews).toHaveLength(0)
    expect(planned).toHaveLength(0)
    await reopen()
    expect(usePlanner.getState().items).toHaveLength(0)
    expect(usePlanner.getState().reviews).toHaveLength(0)
  })

  it('S-236 새 항목은 마친 목표에 넣을 수 없다', async () => {
    // 넣는 순간 마친 것이 되어 오늘에 한 번도 안 선다.
    await setupApp(TODAY, {
      ...finishedWorld(3),
      goals: [
        ...finishedWorld(3).goals,
        aGoal({ id: 'g2', name: '다음 시험', horizon_kind: 'date', ready_at: shift(TODAY, 30), hold_until: shift(TODAY, 30) }),
      ],
    })
    const { user } = render(<TodayScreen onOpenItem={noop} />)
    await user.click(await screen.findByRole('button', { name: /상세 설정/ }))
    await user.click(screen.getByRole('button', { name: /소속 목표/ }))
    expect(screen.getByRole('option', { name: /다음 시험/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /자격증 시험/ })).toBeNull()
  })
})

describe('서재와 항목 상세의 마친 것', () => {
  it('S-237 서재는 마친 것을 맨 아래에 접어 둔다', async () => {
    await setupApp(TODAY, finishedWorld())
    const { user } = render(<LibraryScreen onOpenItem={noop} onOpenGoal={noop} />)
    const done = await screen.findByRole('region', { name: '마친 것' })
    expect(done).toHaveTextContent('9월 3일에 마침')
    // 기본으로 접혀 있다.
    expect(within(done).queryByRole('button', { name: '1~10번 문제' })).toBeNull()
    expect(screen.queryByText('찾는 항목이 없어요.')).toBeNull()

    await user.click(within(done).getByRole('button', { name: '마친 것 자격증 시험 펼치기' }))
    expect(within(done).getByRole('button', { name: '1~10번 문제' })).toBeInTheDocument()
    // 마친 것에는 할 일을 말하는 배지가 없다.
    expect(within(done).queryByText(/부족|여유|중요/)).toBeNull()
  })

  it('S-238 마친 것도 찾기에는 걸린다', async () => {
    await setupApp(TODAY, finishedWorld())
    const { user } = render(<LibraryScreen onOpenItem={noop} onOpenGoal={noop} />)
    await user.type(await screen.findByLabelText('항목 찾기'), '11~20')
    expect(screen.queryByText('찾는 항목이 없어요.')).toBeNull()
    expect(screen.getByRole('button', { name: '11~20번 문제' })).toBeInTheDocument()
  })

  it('S-239 마친 항목의 상세는 그날의 결과를 말하고 앞날을 약속하지 않는다', async () => {
    await setupApp(TODAY, finishedWorld())
    render(<ItemDetailScreen itemId="i0" onBack={noop} />)
    expect(await screen.findByText('목표한 날 기억률')).toBeInTheDocument()
    expect(screen.getByText('마침')).toBeInTheDocument()
    expect(screen.getByText('더 잡지 않는 이유')).toBeInTheDocument()
    expect(screen.getByText(/자격증 시험을 9월 3일에 마쳤어요/)).toBeInTheDocument()
    expect(screen.queryByText(/지남/)).toBeNull()
    expect(screen.queryByText(/모자라요/)).toBeNull()
  })

  it('S-245 마친 항목 하나만 다시 꺼낼 수 있다', async () => {
    // 꺼내는 사람은 계속 보려는 것이다. 지난 목표 시점을 옮겨 담으면 꺼내자마자 다시 끝난다.
    await setupApp(TODAY, finishedWorld(3))
    const { user } = render(<ItemDetailScreen itemId="i0" onBack={noop} />)
    await screen.findByText('더 잡지 않는 이유')
    await pickFromMenu(user, '이 항목 더보기', '설정 편집')
    await user.click(screen.getByRole('button', { name: '없음' }))
    expect(screen.getByRole('radio', { name: /정해두지 않음/ })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await user.click(screen.getByRole('button', { name: '저장' }))

    const item = usePlanner.getState().items.find((i) => i.id === 'i0')!
    expect(isActive(item)).toBe(true)
    expect(item.goal_id).toBeNull()
    expect(item.due! >= TODAY).toBe(true)
    // 나머지는 그대로 마친 채다.
    expect(usePlanner.getState().items.filter(isActive)).toHaveLength(1)
    expectConsistent()
  })

  it('S-240 표로 내보낼 때 마친 항목에는 다음에 볼 날이 없다', async () => {
    await setupApp(TODAY, finishedWorld(1))
    const { items, goals } = usePlanner.getState()
    const line = toCsv(items, goals).split('\r\n')[1]
    expect(line).not.toContain('2026-09-04')
  })
})

describe('대략 목표의 유지 기간', () => {
  it('S-241 유지 기간에는 며칠 지났다고 하지 않고 언제까지 지키는지 적는다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          name: '발표 준비',
          horizon_kind: 'window',
          ready_at: shift(TODAY, -7),
          hold_until: shift(TODAY, 14),
        }),
      ],
      items: [anItem({ id: 'i1', goal_id: 'g1', due: shift(TODAY, 2) })],
    })
    render(<GoalListScreen onOpenGoal={noop} />)
    const row = await screen.findByRole('button', { name: /발표 준비/ })
    expect(row).toHaveTextContent('11월 10일까지 유지')
    expect(row).not.toHaveTextContent(/지남/)
  })
})

describe('켜는 순간', () => {
  it('S-246 앱을 켜는 사이에도 끝난 목표의 항목을 세지 않는다', async () => {
    // 저장소에서 읽은 목록을 먼저 내보내고 나중에 보관하면, 그 틈을 본 알림이
    // 끝난 27개를 세어 '27개가 기다리고 있어요' 를 보낸다. 셈을 마친 뒤 한 번에 내보낸다.
    await setupApp(GOAL_DAY, finishedWorld())
    expect(usePlanner.getState().items.every(isActive)).toBe(true)

    freezeToday(TODAY)
    const counts: number[] = []
    const stop = usePlanner.subscribe((state) => {
      if (state.ready) counts.push(selectTodayItems(state).length)
    })
    await usePlanner.getState().load()
    stop()

    expect(counts.length).toBeGreaterThan(0)
    expect(counts.every((n) => n === 0)).toBe(true)
    expect(usePlanner.getState().items.every((i) => !isActive(i))).toBe(true)
  })

  it('S-247 되살릴 때도 하루 상한을 넘는 수를 한 번도 내보내지 않는다', async () => {
    await setupApp(TODAY, finishedWorld())
    const counts: number[] = []
    const stop = usePlanner.subscribe((state) => {
      counts.push(selectTodayItems(state).length)
    })
    await usePlanner.getState().updateGoal('g1', { horizon_kind: 'open', ready_at: null, hold_until: null })
    stop()
    expect(Math.max(...counts)).toBe(20)
  })
})

describe('상태는 늘 한 가지 말을 한다', () => {
  it('S-242 켜기, 평가, 되돌리기, 되살리기를 거쳐도 보관 날짜와 상태가 맞다', async () => {
    await setupApp(TODAY, finishedWorld(5))
    expectConsistent()
    await usePlanner.getState().updateGoal('g1', { horizon_kind: 'open', ready_at: null, hold_until: null })
    expectConsistent()
    await usePlanner.getState().rateItem('i0', 3, { reviewedAt: TODAY })
    expectConsistent()
    await usePlanner.getState().undoLastRating()
    expectConsistent()
    await reopen()
    expectConsistent()
  })
})
