// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ForecastScreen } from '../../src/features/forecast/ForecastScreen'
import { AppShell } from '../../src/features/shell/AppShell'
import { GoalListScreen } from '../../src/features/goal/GoalListScreen'
import { ItemDetailScreen } from '../../src/features/item/ItemDetailScreen'
import { LibraryScreen } from '../../src/features/library/LibraryScreen'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import {
  aGoal,
  anItem,
  render,
  setupApp,
  teardownApp,
} from './harness'

const TODAY = '2026-10-01'
const noop = () => {}

afterEach(teardownApp)

async function openDetail(user: ReturnType<typeof render>['user']) {
  if (!screen.queryByText('처음 공부한 날')) {
    await user.click(screen.getByRole('button', { name: /상세 설정/ }))
  }
}

describe('새 항목: 목표 시점 3모드', () => {
  it('S-104 정해두지 않음을 고른다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '무기한')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '정해두지 않음' }))
    expect(
      screen.getByText(/마감 없이, 잊을 만할 때마다 계속 올려드릴게요/)
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[0].horizon_kind).toBe('open')
  })

  it('S-105 정확한 날짜를 고른다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '날짜 있음')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '정확한 날짜' }))
    expect(
      screen.getByText('그날까지 기억이 가장 높게 올라오도록 잡아요.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /적어두기/ }))
    expect(usePlanner.getState().items[0].horizon_kind).toBe('date')
  })

  it('S-106 대략을 고르면 구간이 설명된다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '대략')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '대략' }))
    expect(
      screen.getByText(/이른 쪽\(/)
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /적어두기/ }))

    const item = usePlanner.getState().items[0]
    expect(item.horizon_kind).toBe('window')
    expect(item.ready_at).not.toBe(item.hold_until)
  })

  it('S-107 대략 프리셋 9개가 모두 눌린다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.type(screen.getByLabelText('새 항목 제목'), '프리셋')
    await openDetail(user)
    await user.click(screen.getByRole('button', { name: '대략' }))

    for (const label of [
      '1주쯤',
      '2주쯤',
      '3주쯤',
      '1개월쯤',
      '2개월쯤',
      '3개월쯤',
      '6개월쯤',
      '1년쯤',
      '직접',
    ]) {
      await user.click(screen.getByRole('button', { name: label }))
    }
    // 직접을 마지막으로 눌렀으니 숫자와 단위 칸이 열려 있다.
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '주' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '개월' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '년' })).toBeInTheDocument()
  })

  it('S-108 복습 강도 4단계를 고른다', async () => {
    for (const [label, key] of [
      ['여유', 'easy'],
      ['표준', 'standard'],
      ['집중', 'focus'],
      ['최대', 'max'],
    ] as const) {
      cleanup()
      await setupApp(TODAY)
      const { user } = render(<TodayScreen onOpenItem={() => {}} />)
      await user.type(screen.getByLabelText('새 항목 제목'), `강도 ${label}`)
      await openDetail(user)
      const panel = screen.getByText('복습 강도').closest('div')!.parentElement!
      await user.click(within(panel).getByRole('button', { name: label }))
      await user.click(screen.getByRole('button', { name: /적어두기/ }))
      expect(usePlanner.getState().items[0].intensity).toBe(key)
    }
  })
})

describe('새 항목: 입력창 단축키', () => {
  it('S-109 Alt+Enter 로 상세 설정을 연다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    const input = screen.getByLabelText('새 항목 제목')
    await user.click(input)
    await user.keyboard('{Alt>}{Enter}{/Alt}')
    expect(screen.getByText('처음 공부한 날')).toBeInTheDocument()
  })

  it('S-110 Esc 로 상세 설정을 닫는다', async () => {
    await setupApp(TODAY)
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    const input = screen.getByLabelText('새 항목 제목')
    await user.click(input)
    await user.keyboard('{Alt>}{Enter}{/Alt}')
    expect(screen.getByText('처음 공부한 날')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByText('처음 공부한 날')).toBeNull()
  })

  it('S-111 위쪽 키로 직전 제목을 채운다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '직전에 적은 것', due: '2026-10-09' })],
    })
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    const input = screen.getByLabelText('새 항목 제목')
    await user.click(input)
    await user.keyboard('{ArrowUp}')
    expect((input as HTMLInputElement).value).toBe('직전에 적은 것')
  })
})

describe('평가 줄의 날짜 단추', () => {
  it('S-112 어제를 골랐다가 오늘로 되돌린다', async () => {
    await setupApp(TODAY, {
      items: [
        anItem({
          id: 'i1',
          title: '되돌릴 항목',
          due: TODAY,
          first_studied_at: '2026-09-29',
          last_review: '2026-09-29',
        }),
      ],
    })
    const { user } = render(<TodayScreen onOpenItem={() => {}} />)
    await user.click((await screen.findAllByRole('checkbox'))[0])

    const row = screen.getByText('언제 봤나요?').closest('div')!
    await user.click(within(row).getByRole('button', { name: '어제' }))
    expect(screen.getByText(/9월 30일에 본 것으로 기록해요/)).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: '오늘' }))
    expect(screen.queryByText(/본 것으로 기록해요/)).toBeNull()

    await user.click(screen.getByRole('button', { name: /무난함/ }))
    expect(usePlanner.getState().reviews[0].reviewed_at).toBe(TODAY)
  })
})

describe('나머지 조작 요소', () => {
  it('S-113 목표 목록에서 목표를 눌러 상세로 간다', async () => {
    await setupApp(TODAY, { goals: [aGoal({ id: 'g1', name: '목표 하나' })] })
    let opened: string | null = null
    const { user } = render(<GoalListScreen onOpenGoal={(id) => (opened = id)} />)
    await user.click(await screen.findByRole('button', { name: /목표 하나/ }))
    expect(opened).toBe('g1')
  })

  it('S-114 항목 상세에서 서재로 돌아간다', async () => {
    await setupApp(TODAY, { items: [anItem({ id: 'i1' })] })
    let back = false
    const { user } = render(
      <ItemDetailScreen itemId="i1" onBack={() => (back = true)} />
    )
    await user.click(await screen.findByRole('button', { name: '← 서재' }))
    expect(back).toBe(true)
  })

  it('S-115 예보의 막대를 눌러 그날을 고른다', async () => {
    await setupApp(TODAY, {
      items: [
        anItem({
          id: 'i1',
          title: '예보 항목',
          due: '2026-10-05',
          first_studied_at: '2026-09-29',
          last_review: '2026-09-29',
        }),
      ],
    })
    const { user } = render(<ForecastScreen />)
    await screen.findByText('달력으로 보기')
    const bar = document.querySelector('.recharts-bar-rectangle')
    expect(bar).not.toBeNull()
    await user.click(bar as Element)
    expect(screen.getByText(/개 예정/)).toBeInTheDocument()
  })

  it('S-116 서재에서 제목 묶음을 접고 편다', async () => {
    await setupApp(TODAY, {
      items: [
        anItem({ id: 'a', title: '정보보안 개념 1~3', due: '2026-10-05' }),
        anItem({ id: 'b', title: '정보보안 개념 4~6', due: '2026-10-06' }),
      ],
    })
    const { user } = render(
      <LibraryScreen onOpenItem={noop} onOpenGoal={noop} />
    )
    const header = await screen.findByRole('button', {
      name: '제목 묶음 정보보안 개념',
    })
    expect(
      screen.getByRole('button', { name: '정보보안 개념 1~3' })
    ).toBeInTheDocument()
    await user.click(header)
    expect(screen.queryByRole('button', { name: '정보보안 개념 1~3' })).toBeNull()
    await user.click(header)
    expect(
      screen.getByRole('button', { name: '정보보안 개념 1~3' })
    ).toBeInTheDocument()
  })
})

describe('앱 껍데기', () => {
  it('S-117 왼쪽에서 화면을 옮겨 다닌다', async () => {
    await setupApp(TODAY, { items: [anItem({ id: 'i1', due: TODAY })] })
    const picked: string[] = []
    const { user } = render(
      <AppShell screen="today" onNavigate={(k) => picked.push(k)}>
        <p>본문</p>
      </AppShell>
    )
    for (const label of ['오늘', '예보', '목표', '서재', '설정']) {
      await user.click(screen.getByRole('button', { name: new RegExp(label) }))
    }
    expect(picked).toEqual(['today', 'forecast', 'goals', 'library', 'settings'])
  })

  it('S-118 오늘 볼 개수가 왼쪽에 뜬다', async () => {
    await setupApp(TODAY, {
      items: [
        anItem({ id: 'a', title: '가', due: TODAY }),
        anItem({ id: 'b', title: '나', due: '2026-09-28' }),
      ],
    })
    render(
      <AppShell screen="today" onNavigate={noop}>
        <p>본문</p>
      </AppShell>
    )
    const today = screen.getByRole('button', { name: /오늘/ })
    expect(within(today).getByText('2')).toBeInTheDocument()
  })

  it('S-119 다가오는 목표가 왼쪽에 뜬다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          name: '시험',
          horizon_kind: 'date',
          ready_at: '2026-11-14',
          hold_until: '2026-11-14',
        }),
      ],
    })
    render(
      <AppShell screen="today" onNavigate={noop}>
        <p>본문</p>
      </AppShell>
    )
    expect(screen.getByText('다가오는 목표')).toBeInTheDocument()
    expect(screen.getByText('시험')).toBeInTheDocument()
    expect(screen.getByText('11월 14일')).toBeInTheDocument()
  })
})
