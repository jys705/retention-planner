// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/App'
import { GoalDetailScreen } from '../../src/features/goal/GoalDetailScreen'
import { ItemDetailScreen } from '../../src/features/item/ItemDetailScreen'
import { usePlanner } from '../../src/store/planner'
import { aGoal, anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'
const noop = () => {}

afterEach(teardownApp)

async function withItem(over = {}) {
  await setupApp(TODAY, {
    goals: [
      aGoal({ id: 'g1', name: 'AWS SCS-C03' }),
      aGoal({ id: 'g2', name: '정보보안 개념 정리' }),
    ],
    items: [
      anItem({
        id: 'i1',
        goal_id: 'g1',
        title: '원래 제목',
        memo: '원래 메모',
        due: TODAY,
        first_studied_at: '2026-09-29',
        last_review: '2026-09-29',
        ...over,
      }),
    ],
  })
}

describe('항목 고치기', () => {
  it('S-120 편집을 열면 지금 값이 채워져 있다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.click(await screen.findByRole('button', { name: '편집' }))

    expect(screen.getByLabelText('제목 고치기')).toHaveValue('원래 제목')
    expect(screen.getByLabelText('메모 고치기')).toHaveValue('원래 메모')
  })

  it('S-121 제목과 메모를 고쳐 저장한다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.click(await screen.findByRole('button', { name: '편집' }))

    const title = screen.getByLabelText('제목 고치기')
    await user.tripleClick(title)
    await user.keyboard('바꾼 제목')
    const memo = screen.getByLabelText('메모 고치기')
    await user.tripleClick(memo)
    await user.keyboard('바꾼 메모')
    await user.click(screen.getByRole('button', { name: '저장' }))

    const item = usePlanner.getState().items[0]
    expect(item.title).toBe('바꾼 제목')
    expect(item.memo).toBe('바꾼 메모')
    // 편집 칸이 닫히고 새 제목이 화면에 보인다.
    expect(screen.queryByLabelText('제목 고치기')).toBeNull()
    expect(screen.getByRole('heading', { name: '바꾼 제목' })).toBeInTheDocument()
  })

  it('S-122 취소하면 아무것도 안 바뀐다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.click(await screen.findByRole('button', { name: '편집' }))
    await user.tripleClick(screen.getByLabelText('제목 고치기'))
    await user.keyboard('버릴 제목')
    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(usePlanner.getState().items[0].title).toBe('원래 제목')
    expect(screen.queryByLabelText('제목 고치기')).toBeNull()
  })

  it('S-123 제목을 비우면 저장이 안 된다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.click(await screen.findByRole('button', { name: '편집' }))
    await user.tripleClick(screen.getByLabelText('제목 고치기'))
    await user.keyboard('   ')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  it('S-124 소속 목표를 바꾼다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.click(await screen.findByRole('button', { name: '편집' }))
    await user.click(screen.getByRole('button', { name: '정보보안 개념 정리' }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(usePlanner.getState().items[0].goal_id).toBe('g2')
  })

  it('S-125 소속 목표를 없음으로 되돌린다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.click(await screen.findByRole('button', { name: '편집' }))
    await user.click(screen.getByRole('button', { name: '없음' }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(usePlanner.getState().items[0].goal_id).toBeNull()
  })

  it('S-126 Enter 로도 저장된다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.click(await screen.findByRole('button', { name: '편집' }))
    await user.tripleClick(screen.getByLabelText('제목 고치기'))
    await user.keyboard('엔터로 저장{Enter}')
    expect(usePlanner.getState().items[0].title).toBe('엔터로 저장')
  })
})

describe('항목 지우기', () => {
  it('S-127 바로 지우지 않고 한 번 묻는다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.click(await screen.findByRole('button', { name: '삭제' }))

    expect(screen.getByText('이 항목을 지울까요?')).toBeInTheDocument()
    expect(screen.getByText(/되돌릴 수 없어요/)).toBeInTheDocument()
    // 아직 안 지워졌다.
    expect(usePlanner.getState().items).toHaveLength(1)
  })

  it('S-128 묻는 말에 평가 이력 수가 나온다', async () => {
    await withItem()
    await usePlanner.getState().rateItem('i1', 3, { reviewedAt: TODAY })
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.click(await screen.findByRole('button', { name: '삭제' }))
    expect(screen.getByText(/평가 1건이 함께 사라집니다/)).toBeInTheDocument()
  })

  it('S-129 취소하면 안 지워진다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.click(await screen.findByRole('button', { name: '삭제' }))
    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(usePlanner.getState().items).toHaveLength(1)
    expect(screen.queryByText('이 항목을 지울까요?')).toBeNull()
  })

  it('S-130 지우면 항목과 평가 이력이 함께 사라지고 서재로 돌아간다', async () => {
    await withItem()
    await usePlanner.getState().rateItem('i1', 3, { reviewedAt: TODAY })
    expect(usePlanner.getState().reviews).toHaveLength(1)

    let backed = false
    const { user } = render(
      <ItemDetailScreen itemId="i1" onBack={() => (backed = true)} />
    )
    await user.click(await screen.findByRole('button', { name: '삭제' }))
    await user.click(screen.getByRole('button', { name: '지우기' }))

    expect(usePlanner.getState().items).toHaveLength(0)
    expect(usePlanner.getState().reviews).toHaveLength(0)
    expect(usePlanner.getState().planned).toHaveLength(0)
    expect(backed).toBe(true)
  })

  it('S-131 지운 뒤 다시 열면 없다고 말한다', async () => {
    await withItem()
    await usePlanner.getState().deleteItem('i1')
    render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    expect(await screen.findByText('항목을 찾을 수 없어요.')).toBeInTheDocument()
  })
})

describe('목표 지우기', () => {
  async function withGoal() {
    await setupApp(TODAY, {
      goals: [aGoal({ id: 'g1', name: 'AWS SCS-C03' })],
      items: [
        anItem({ id: 'i1', goal_id: 'g1', title: '가', due: '2026-10-05' }),
        anItem({ id: 'i2', goal_id: 'g1', title: '나', due: '2026-10-06' }),
      ],
    })
  }

  it('S-132 바로 지우지 않고 한 번 묻는다', async () => {
    await withGoal()
    const { user } = render(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />
    )
    await user.click(await screen.findByRole('button', { name: '목표 삭제' }))
    expect(screen.getByText('이 목표를 지울까요?')).toBeInTheDocument()
    expect(screen.getByText(/항목 2개는 지워지지 않고 소속만 풀립니다/)).toBeInTheDocument()
    expect(usePlanner.getState().goals).toHaveLength(1)
  })

  it('S-133 목표를 지워도 항목은 남고 소속만 풀린다', async () => {
    await withGoal()
    let deleted = false
    const { user } = render(
      <GoalDetailScreen
        goalId="g1"
        onOpenItem={noop}
        onDeleted={() => (deleted = true)}
      />
    )
    await user.click(await screen.findByRole('button', { name: '목표 삭제' }))
    await user.click(screen.getByRole('button', { name: '지우기' }))

    expect(usePlanner.getState().goals).toHaveLength(0)
    expect(usePlanner.getState().items).toHaveLength(2)
    expect(
      usePlanner.getState().items.every((i) => i.goal_id === null)
    ).toBe(true)
    expect(deleted).toBe(true)
  })

  it('S-134 묶인 항목이 없으면 그렇게 말한다', async () => {
    await setupApp(TODAY, { goals: [aGoal({ id: 'g1' })] })
    const { user } = render(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />
    )
    await user.click(await screen.findByRole('button', { name: '목표 삭제' }))
    expect(screen.getByText(/묶인 항목이 없어서 이 목표만 사라집니다/)).toBeInTheDocument()
  })

  it('S-135 취소하면 안 지워진다', async () => {
    await withGoal()
    const { user } = render(
      <GoalDetailScreen goalId="g1" onOpenItem={noop} onDeleted={noop} />
    )
    await user.click(await screen.findByRole('button', { name: '목표 삭제' }))
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(usePlanner.getState().goals).toHaveLength(1)
  })
})

describe('삭제까지 가는 길', () => {
  it('S-142 오늘 화면에서 제목을 눌러 항목 상세로 간다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '오늘 볼 것', due: TODAY })],
    })
    const { user } = render(<App />)
    await screen.findByText('오늘 볼 항목')

    await user.click(
      screen.getByRole('button', { name: '오늘 볼 것 자세히 보기' })
    )
    // 항목 상세가 열리고 삭제가 바로 보인다.
    expect(await screen.findByText('기억 곡선')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '편집' })).toBeInTheDocument()
  })

  it('S-143 오늘 화면에서 연 항목을 그 자리에서 지운다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '지울 것', due: TODAY })],
    })
    const { user } = render(<App />)
    await screen.findByText('오늘 볼 항목')
    await user.click(screen.getByRole('button', { name: '지울 것 자세히 보기' }))
    await user.click(await screen.findByRole('button', { name: '삭제' }))
    await user.click(screen.getByRole('button', { name: '지우기' }))
    expect(usePlanner.getState().items).toHaveLength(0)
  })

  it('S-144 체크박스는 여전히 평가를 펼친다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '평가할 것', due: TODAY })],
    })
    const { user } = render(<App />)
    await screen.findByText('오늘 볼 항목')
    await user.click((await screen.findAllByRole('checkbox'))[0])
    // 제목을 눌렀을 때와 다른 일이 일어나야 한다.
    expect(screen.getByText('얼마나 기억났나요?')).toBeInTheDocument()
    expect(screen.queryByText('기억 곡선')).toBeNull()
  })

  it('S-145 E 키로 편집을 연다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '단축키 항목', due: TODAY })],
    })
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await screen.findByText('기억 곡선')
    await user.keyboard('e')
    expect(screen.getByLabelText('제목 고치기')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('제목 고치기')).toBeNull()
  })

  it('S-146 지우기 키로 삭제를 묻는다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '단축키 항목', due: TODAY })],
    })
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await screen.findByText('기억 곡선')
    await user.keyboard('{Backspace}')
    expect(screen.getByText('이 항목을 지울까요?')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByText('이 항목을 지울까요?')).toBeNull()
  })
})
