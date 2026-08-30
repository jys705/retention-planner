// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import {
  aGoal,
  openCalendar,
  render,
  setDateInput,
  setupApp,
  shift,
  pickCard,
  pickSelect,
  teardownApp,
} from './harness'
import { fullDate } from '../../src/lib/format'

const TODAY = '2026-10-01'

afterEach(teardownApp)

async function openDetail(user: ReturnType<typeof render>['user']) {
  if (!screen.queryByLabelText('공부한 날 고르기')) {
    await user.click(screen.getByRole('button', { name: /상세 설정/ }))
  }
}

describe('오늘 화면: 항목 적기', () => {
  it('S-001 제목만 치고 Enter 로 적는다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
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
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '단추로 적기')
    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[0].title).toBe('단추로 적기')
  })

  it('S-003 제목이 비면 적히지 않는다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '{Enter}')
    expect(usePlanner.getState().items).toHaveLength(0)

    await user.type(screen.getByLabelText('새 항목 제목'), '   ')
    expect(screen.getByRole('button', { name: /적어두기/ })).toBeDisabled()
  })

  it('S-004 상세 설정을 펼치고 접는다', async () => {
    await setupApp(TODAY, { goals: [aGoal({ id: 'g1', name: 'AWS SCS-C03' })] })
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    expect(screen.queryByText('공부한 날')).toBeNull()

    await user.click(screen.getByRole('button', { name: /상세 설정/ }))
    expect(screen.getByText('공부한 날')).toBeInTheDocument()
    expect(screen.getByText('소속 목표')).toBeInTheDocument()
    expect(screen.getByText('목표 시점')).toBeInTheDocument()
    expect(screen.getByText('복습 강도')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /상세 설정/ }))
    expect(screen.queryByText('공부한 날')).toBeNull()
  })

  it('S-004b 목표가 하나도 없으면 소속 목표 칸을 안 보여준다', async () => {
    // 고를 것이 '없음' 뿐인 칸은 자리만 차지하고 아무것도 정해 주지 않는다.
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.click(screen.getByRole('button', { name: /상세 설정/ }))

    expect(screen.getByText('공부한 날')).toBeInTheDocument()
    expect(screen.queryByText('소속 목표')).toBeNull()
    expect(screen.getByText('목표 시점')).toBeInTheDocument()
  })

  it('S-005 공부한 날 오늘', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '오늘 것')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '오늘' }))
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    expect(usePlanner.getState().items[0].first_studied_at).toBe('2026-10-01')
    expect(usePlanner.getState().items[0].due).toBe('2026-10-03')
  })

  it('S-006 공부한 날 어제', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '어제 것')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '어제' }))
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    expect(usePlanner.getState().items[0].first_studied_at).toBe('2026-09-30')
    expect(usePlanner.getState().items[0].due).toBe('2026-10-02')
  })

  it('S-007 공부한 날 다른 날', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '다른 날 것')
    await openDetail(user)
    // 고르기 전에는 날짜가 아니라 '다른 날' 이라고 적혀 있어야 한다.
    expect(screen.getByText(/다른 날/)).toBeInTheDocument()

    await setDateInput(
      user,
      screen.getByLabelText('공부한 날 고르기'),
      '2026-09-21'
    )
    // 고른 뒤에는 그 날짜가 보인다.
    expect(screen.getByText(/9월 21일/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[0].due).toBe('2026-09-23')
  })

  it('S-008 메모를 붙여 적는다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '메모 있는 것')
    await openDetail(user)
    await user.type(screen.getByPlaceholderText('3, 7번 틀림'), '3, 7번 틀림')
    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[0].memo).toBe('3, 7번 틀림')
  })

  it('S-009 소속 목표를 골라 적는다', async () => {
    await setupApp(TODAY, { goals: [aGoal({ id: 'g1', name: 'AWS SCS-C03' })] })
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '목표에 넣기')
    await openDetail(user)
    await pickSelect(user, '소속 목표', 'AWS SCS-C03')
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    expect(usePlanner.getState().items[0].goal_id).toBe('g1')

    // 다음에 적을 때는 그 목표가 안 남아 있어야 한다.
    await user.type(screen.getByLabelText('새 항목 제목'), '그 다음 것')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[1].goal_id).toBeNull()
  })

  it('S-010 소속 목표를 없음으로 둔다', async () => {
    await setupApp(TODAY, { goals: [aGoal({ id: 'g1', name: 'AWS SCS-C03' })] })
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '목표 없이')
    await openDetail(user)
    await pickSelect(user, '소속 목표', '없음')
    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[0].goal_id).toBeNull()
  })

  it('S-015 공부한 날은 미래로 못 고른다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await openDetail(user)
    const grid = await openCalendar(
      user,
      screen.getByLabelText('공부한 날 고르기')
    )
    expect(within(grid).getByRole('button', { name: fullDate(TODAY) })).toBeEnabled()
    expect(
      within(grid).getByRole('button', { name: fullDate(shift(TODAY, 1)) })
    ).toBeDisabled()
  })

  it('S-147 소속 목표를 고르면 목표 시점과 강도를 못 만진다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          name: '자격증 시험',
          horizon_kind: 'date',
          ready_at: '2026-11-14',
          hold_until: '2026-11-14',
          intensity: 'focus',
        }),
      ],
    })
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await openDetail(user)
    await pickSelect(user, '소속 목표', '자격증 시험')

    // 고를 수 있는 칸은 사라지고 목표가 정한 값이 그대로 보인다.
    expect(screen.queryByText('정해두지 않음')).toBeNull()
    expect(screen.getByText('11월 14일')).toBeInTheDocument()
    expect(screen.getByText('집중')).toBeInTheDocument()
    expect(screen.getByText(/목표 화면에서 고치세요/)).toBeInTheDocument()

    // 없음으로 되돌리면 다시 고를 수 있다.
    await pickSelect(user, '소속 목표', '없음')
    expect(screen.getByRole('radio', { name: '정해두지 않음' })).toBeInTheDocument()
  })

  it('S-148 목표에 넣은 항목은 제 설정을 갖지 않는다', async () => {
    await setupApp(TODAY, {
      goals: [aGoal({ id: 'g1', name: '자격증 시험', intensity: 'focus' })],
    })
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '목표에 넣는 것')
    await openDetail(user)
    await pickSelect(user, '소속 목표', '자격증 시험')
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    const item = usePlanner.getState().items[0]
    expect(item.goal_id).toBe('g1')
    // 비어 있어야 목표를 고쳤을 때 이 항목도 따라온다.
    expect(item.horizon_kind).toBeNull()
    expect(item.intensity).toBeNull()
  })

  it('S-149 적은 날에 맞춰 등급을 묻고 그 답이 출발점이 된다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '어제 본 것')
    await openDetail(user)
    // 오늘 공부한 것도 스스로 매긴 등급이 있다. 안 묻고 무난함으로 적어 버리면
    // 어려웠던 것과 쉬웠던 것이 같은 날짜로 잡힌다.
    expect(screen.getByText('오늘 어땠나요?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '어제' }))
    expect(screen.getByText('그날 얼마나 기억났나요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '어려움' }))
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    const item = usePlanner.getState().items[0]
    expect(item.first_studied_at).toBe(shift(TODAY, -1))
    // 무난함으로 적었을 때보다 기억 지속력이 낮게 잡힌다.
    expect(item.stability).toBeLessThan(2.4)
  })

  it('S-152 오늘 고른 등급이 첫 날짜를 바꾼다', async () => {
    // 안 묻고 무난함으로 적어 버리면 어려웠던 것과 쉬웠던 것이 같은 날로 잡힌다.
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)

    await user.type(screen.getByLabelText('새 항목 제목'), '오늘 어려웠던 것')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '어려움' }))
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    await user.type(screen.getByLabelText('새 항목 제목'), '오늘 쉬웠던 것')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '쉬움' }))
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    const { items } = usePlanner.getState()
    const hard = items.find((i) => i.title === '오늘 어려웠던 것')!
    const easy = items.find((i) => i.title === '오늘 쉬웠던 것')!
    expect(hard.stability!).toBeLessThan(easy.stability!)
    expect(hard.due! < easy.due!).toBe(true)
  })

  it('S-150 달력으로 오늘을 고르면 오늘 칩이 켜진다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '어제' }))
    await setDateInput(
      user,
      screen.getByLabelText('공부한 날 고르기'),
      TODAY
    )
    // 두 표시가 어긋나면 안 된다. 오늘을 골랐으면 날짜 단추는 '다른 날' 로 돌아가고
    // 등급 칸의 물음도 오늘 것으로 바뀌어야 한다.
    expect(screen.getByLabelText('공부한 날 고르기')).toHaveTextContent(
      '다른 날'
    )
    expect(screen.getByText('오늘 어땠나요?')).toBeInTheDocument()
    await user.type(screen.getByLabelText('새 항목 제목'), '오늘로 되돌린 것')
    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[0].first_studied_at).toBe(TODAY)
  })

  it('S-151 미래 날짜는 오늘로 잘려서 저장된다', async () => {
    await setupApp(TODAY)
    await usePlanner.getState().addItem({
      title: '미래에서 온 것',
      firstStudiedAt: shift(TODAY, 30),
    })
    render(<TodayScreen onOpenItem={() => {}} />)
    const item = usePlanner.getState().items[0]
    expect(item.first_studied_at).toBe(TODAY)
    expect(item.last_review).toBe(TODAY)
  })
})

describe('앞으로 보게 될 횟수', () => {
  it('S-205 오른쪽 숫자는 오늘로부터 며칠 뒤인지다', async () => {
    // 앞 복습과의 간격을 'N일 뒤' 라고 적으면 8월 31일과 9월 1일이 나란히
    // '1일 뒤' 가 되어 셈이 틀린 것처럼 보인다.
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '오늘 적는 것')
    await openDetail(user)
    // 간격이 짧으면 앞 복습과의 사이가 1, 1, 2 처럼 되풀이된다. 그때
    // 간격을 그대로 적으면 같은 수가 잇달아 서서 셈이 틀린 것처럼 보인다.
    await pickCard(user, '복습 강도', '최대')

    const rail = screen.getByLabelText('앞으로 보게 될 횟수')
    // 한 줄에 '10월 5일 (월)' 과 '4일 뒤' 가 나란히 선다. 둘이 서로 맞는지 본다.
    const rows = [...rail.querySelectorAll('div')].filter((el) =>
      /\d+월 \d+일/.test(el.textContent ?? '')
    )
    expect(rows.length).toBeGreaterThan(2)

    for (const row of rows) {
      const text = row.textContent ?? ''
      const date = text.match(/(\d+)월 (\d+)일/)!
      const label = text.match(/(오늘|\d+일 뒤)/)!
      const shown = new Date(2026, Number(date[1]) - 1, Number(date[2]))
      const days = Math.round(
        (shown.getTime() - new Date(2026, 9, 1).getTime()) / 86_400_000
      )
      expect(label[1]).toBe(days <= 0 ? '오늘' : `${days}일 뒤`)
    }
  })
})

describe('쓰다 만 것', () => {
  it('S-207 다른 탭에 갔다 와도 쓰던 글이 남아 있다', async () => {
    await setupApp(TODAY)
    const first = render(<TodayScreen onOpenItem={() => {}} />)
    await first.user.type(screen.getByLabelText('새 항목 제목'), '쓰다 만 제목')
    await openDetail(first.user)

    // 다른 탭으로 갔다가 돌아오는 것은 이 화면이 내려갔다 올라오는 것과 같다.
    cleanup()
    render(<TodayScreen onOpenItem={() => {}} />)

    expect(await screen.findByLabelText('새 항목 제목')).toHaveValue('쓰다 만 제목')
    // 펴 둔 상세 설정도 그대로 있어야 한다.
    expect(screen.getByLabelText('앞으로 보게 될 횟수')).toBeInTheDocument()
  })

  it('S-208 적어두고 나면 빈 줄로 돌아온다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '적을 것')
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    cleanup()
    render(<TodayScreen onOpenItem={() => {}} />)
    expect(await screen.findByLabelText('새 항목 제목')).toHaveValue('')
  })
})
