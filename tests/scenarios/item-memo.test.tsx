// @vitest-environment happy-dom
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ItemDetailScreen } from '../../src/features/item/ItemDetailScreen'
import { MEMO_SAVE_DELAY_MS } from '../../src/features/item/MemoPanel'
import { usePlanner } from '../../src/store/planner'
import { anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'
const noop = () => {}

afterEach(teardownApp)

async function withItem(memo = '') {
  await setupApp(TODAY, {
    items: [
      anItem({ id: 'i1', title: '4장 연습문제', memo, due: TODAY, last_review: '2026-09-29' }),
      anItem({ id: 'i2', title: '5장 개념', memo: '5장 메모', created_at: '2026-01-02T00:00:00.000Z' }),
    ],
  })
}

const memoOf = (id: string) => usePlanner.getState().items.find((i) => i.id === id)!.memo

function waitPastSaveDelay() {
  return act(() => new Promise((resolve) => setTimeout(resolve, MEMO_SAVE_DELAY_MS + 150)))
}

describe('항목 메모', () => {
  it('S-292 메모는 줄을 바꿔 길게 적는다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    const memo = await screen.findByRole('textbox', { name: '메모' })
    await user.click(memo)
    await user.keyboard('3번 틀림{Enter}분산 처리 다시 보기')
    await user.tab()

    // Enter 는 저장이 아니라 줄 바꿈이다.
    expect(memoOf('i1')).toBe('3번 틀림\n분산 처리 다시 보기')
    expect(memo).toHaveValue('3번 틀림\n분산 처리 다시 보기')
  })

  it('S-293 손을 멈추면 저장 단추 없이 저장된다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    const memo = await screen.findByRole('textbox', { name: '메모' })
    await user.type(memo, '공식 외우기')
    // 아직 손을 떼지 않았다. 글자마다 저장하지 않는다.
    expect(memoOf('i1')).toBe('')
    expect(screen.getByText('저장 중')).toBeInTheDocument()

    await waitPastSaveDelay()
    expect(memoOf('i1')).toBe('공식 외우기')
    expect(screen.getByText('저장했어요')).toBeInTheDocument()
    // 칸을 떠나지 않았으니 계속 쓸 수 있다.
    expect(memo).toHaveFocus()
  })

  it('S-294 쓰다가 바로 화면을 떠나도 쓰던 메모가 남는다', async () => {
    await withItem()
    const { user, unmount } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.type(await screen.findByRole('textbox', { name: '메모' }), '떠나기 직전')
    unmount()
    await waitFor(() => expect(memoOf('i1')).toBe('떠나기 직전'))
  })

  it('S-295 다른 항목으로 넘어가도 쓰던 메모는 원래 항목에 남는다', async () => {
    await withItem()
    const { user, rerender } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    await user.type(await screen.findByRole('textbox', { name: '메모' }), '4장 것')
    rerender(<ItemDetailScreen itemId="i2" onBack={noop} />)

    await waitFor(() => expect(memoOf('i1')).toBe('4장 것'))
    expect(memoOf('i2')).toBe('5장 메모')
    expect(await screen.findByRole('textbox', { name: '메모' })).toHaveValue('5장 메모')
  })

  it('S-296 메모를 쓰는 동안에는 항목 단축키가 먹지 않는다', async () => {
    await withItem('지울 글자')
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    const memo = await screen.findByRole('textbox', { name: '메모' })
    await user.click(memo)
    await user.keyboard('{End}{Backspace}e')
    await user.tab()

    // e 는 설정 편집, Backspace 는 지우기 확인이다. 메모 칸에서는 글자일 뿐이다.
    expect(screen.queryByText('설정 고치기')).toBeNull()
    expect(screen.queryByText('이 항목을 지울까요?')).toBeNull()
    expect(memoOf('i1')).toBe('지울 글e')
  })

  it('S-297 다른 컴퓨터의 기록을 합쳐 메모가 바뀌면 쓰고 있지 않을 때 따라간다', async () => {
    await withItem('집에서 쓴 메모')
    render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    const memo = await screen.findByRole('textbox', { name: '메모' })
    await act(() => usePlanner.getState().updateItem('i1', { memo: '회사에서 쓴 메모' }))
    expect(memo).toHaveValue('회사에서 쓴 메모')
  })

  it('S-298 쓰는 중에는 저장한 값이 돌아와도 쓰던 글을 덮지 않는다', async () => {
    await withItem()
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    const memo = await screen.findByRole('textbox', { name: '메모' })
    await user.type(memo, '앞부분')
    await waitPastSaveDelay()
    await user.type(memo, ' 뒷부분')
    expect(memo).toHaveValue('앞부분 뒷부분')
    await user.tab()
    expect(memoOf('i1')).toBe('앞부분 뒷부분')
  })

  it('S-299 쓰는 중에 다른 곳에서 메모가 바뀌어도 쓰던 글을 지키고 그것을 저장한다', async () => {
    await withItem('원래')
    const { user } = render(<ItemDetailScreen itemId="i1" onBack={noop} />)
    const memo = await screen.findByRole('textbox', { name: '메모' })
    await user.type(memo, ' 고치는 중')
    await act(() => usePlanner.getState().updateItem('i1', { memo: '합쳐 들어온 메모' }))
    expect(memo).toHaveValue('원래 고치는 중')
    await user.tab()
    expect(memoOf('i1')).toBe('원래 고치는 중')
  })
})
