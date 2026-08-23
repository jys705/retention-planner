// @vitest-environment happy-dom
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryScreen } from '../../src/features/library/LibraryScreen'
import { aGoal, anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'
const noop = () => {}

afterEach(teardownApp)

function mixed() {
  return {
    goals: [aGoal({ id: 'g1', name: 'AWS SCS-C03' })],
    items: [
      anItem({
        id: 'a',
        goal_id: 'g1',
        title: '가나다 문제',
        due: '2026-10-05',
        stability: 20,
        last_review: '2026-09-30',
      }),
      anItem({
        id: 'b',
        goal_id: null,
        title: '정보보안 개념 1~3',
        due: '2026-10-03',
        stability: 3,
        last_review: '2026-09-30',
      }),
      anItem({
        id: 'c',
        goal_id: null,
        title: '정보보안 개념 4~6',
        due: '2026-10-09',
        stability: 8,
        last_review: '2026-09-30',
      }),
    ],
  }
}

describe('서재', () => {
  it('S-070 목표별로 묶어 보여준다', async () => {
    await setupApp(TODAY, mixed())
    render(<LibraryScreen onOpenItem={noop} onOpenGoal={noop} />)
    // 바깥 묶음 머리글이 소속 목표다.
    expect(
      await screen.findByRole('button', { name: 'AWS SCS-C03 접기' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '목표 없음 접기' })
    ).toBeInTheDocument()
  })

  it('S-071 목표 묶음을 풀어 한 줄로 본다', async () => {
    await setupApp(TODAY, mixed())
    const { user } = render(
      <LibraryScreen onOpenItem={noop} onOpenGoal={noop} />
    )
    await user.click(screen.getByRole('button', { name: '목표별로 묶기' }))
    // 묶음 머리글이 사라지고 항목이 한 줄씩 늘어선다.
    expect(screen.queryByRole('button', { name: 'AWS SCS-C03 접기' })).toBeNull()
    expect(
      screen.getByRole('button', { name: '가나다 문제' })
    ).toBeInTheDocument()
  })

  it('S-073 정렬: 기억률 낮은순', async () => {
    await setupApp(TODAY, mixed())
    const { user } = render(
      <LibraryScreen onOpenItem={noop} onOpenGoal={noop} />
    )
    await user.click(screen.getByRole('button', { name: '목표별로 묶기' }))
    await user.click(screen.getByRole('button', { name: '기억률 낮은순' }))
    // 기억 지속력이 가장 짧은 것이 가장 낮은 기억률이다.
    expect(visibleTitles()[0]).toContain('정보보안 개념 1~3')
  })

  it('S-074 정렬: 이름순', async () => {
    await setupApp(TODAY, mixed())
    const { user } = render(
      <LibraryScreen onOpenItem={noop} onOpenGoal={noop} />
    )
    await user.click(screen.getByRole('button', { name: '목표별로 묶기' }))
    await user.click(screen.getByRole('button', { name: '이름순' }))
    expect(visibleTitles()[0]).toContain('가나다 문제')
  })

  it('S-075 검색으로 걸러낸다', async () => {
    await setupApp(TODAY, mixed())
    const { user } = render(
      <LibraryScreen onOpenItem={noop} onOpenGoal={noop} />
    )
    await user.type(screen.getByLabelText('항목 찾기'), '가나다')
    expect(
      screen.getByRole('button', { name: '가나다 문제' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /정보보안/ })).toBeNull()
  })

  it('S-076 검색 결과가 없을 때', async () => {
    await setupApp(TODAY, mixed())
    const { user } = render(
      <LibraryScreen onOpenItem={noop} onOpenGoal={noop} />
    )
    await user.type(screen.getByLabelText('항목 찾기'), '없는말')
    expect(screen.getByText('찾는 항목이 없어요.')).toBeInTheDocument()
    expect(screen.getByText(/다른 말로 찾아보거나/)).toBeInTheDocument()
  })

  it('S-077 목표 묶음을 접고 편다', async () => {
    await setupApp(TODAY, mixed())
    const { user } = render(
      <LibraryScreen onOpenItem={noop} onOpenGoal={noop} />
    )
    expect(
      await screen.findByRole('button', { name: '가나다 문제' })
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'AWS SCS-C03 접기' })
    )
    expect(screen.queryByRole('button', { name: '가나다 문제' })).toBeNull()
    await user.click(
      screen.getByRole('button', { name: 'AWS SCS-C03 펼치기' })
    )
    expect(
      screen.getByRole('button', { name: '가나다 문제' })
    ).toBeInTheDocument()
  })

  it('S-078 묶는 단위는 목표 하나뿐이다', async () => {
    await setupApp(TODAY, mixed())
    render(<LibraryScreen onOpenItem={noop} onOpenGoal={noop} />)
    await screen.findByRole('button', { name: '목표 없음 접기' })

    // 제목이 비슷하다고 앱이 따로 묶어 주지 않는다.
    expect(screen.queryByText('제목')).toBeNull()
    expect(
      screen.getByText('아직 어느 목표에도 안 넣은 항목이에요')
    ).toBeInTheDocument()
  })

  it('S-079 목표 없는 항목은 소속 칸에 목표 없음이라고 적힌다', async () => {
    await setupApp(TODAY, mixed())
    const { user } = render(
      <LibraryScreen onOpenItem={noop} onOpenGoal={noop} />
    )
    await user.click(screen.getByRole('button', { name: '목표별로 묶기' }))
    const row = screen.getByRole('button', { name: '정보보안 개념 1~3' })
    expect(within(row).getByText('목표 없음')).toBeInTheDocument()
  })

  it('S-080 항목을 눌러 상세로 간다', async () => {
    await setupApp(TODAY, mixed())
    let opened: string | null = null
    const { user } = render(
      <LibraryScreen onOpenItem={(id) => (opened = id)} onOpenGoal={noop} />
    )
    await user.click(await screen.findByRole('button', { name: '가나다 문제' }))
    expect(opened).toBe('a')
  })

  it('S-080b 목표 이름을 눌러 목표 상세로 간다', async () => {
    await setupApp(TODAY, mixed())
    let opened: string | null = null
    const { user } = render(
      <LibraryScreen onOpenItem={noop} onOpenGoal={(id) => (opened = id)} />
    )
    await user.click(
      await screen.findByRole('button', { name: /이 목표 자세히 보기/ })
    )
    expect(opened).toBe('g1')
  })
})

/** 지금 보이는 항목 줄의 제목들. 화면에 뜬 차례 그대로다. */
function visibleTitles(): string[] {
  return [...document.querySelectorAll('button[aria-label]')]
    .filter((b) => /%/.test(b.textContent ?? ''))
    .map((b) => b.getAttribute('aria-label') ?? '')
}
