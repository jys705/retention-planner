// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryScreen } from '../../src/features/library/LibraryScreen'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import { aGoal, anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'
const noop = () => {}

afterEach(teardownApp)

describe('경계', () => {
  it('S-099 목표 시점이 오늘이어도 다음 날짜가 잡힌다', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          horizon_kind: 'date',
          ready_at: TODAY,
          hold_until: TODAY,
        }),
      ],
      items: [anItem({ id: 'i1', goal_id: 'g1', title: '오늘이 목표', due: TODAY })],
    })
    const { user } = render(<TodayScreen />)
    await user.click((await screen.findAllByRole('checkbox'))[0])
    await user.click(screen.getByRole('button', { name: /알맞음/ }))

    const item = usePlanner.getState().items[0]
    expect(item.due).not.toBeNull()
    expect(item.due! > TODAY).toBe(true)
  })

  it('S-100 목표 시점을 이미 지난 항목', async () => {
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          horizon_kind: 'date',
          ready_at: '2026-09-01',
          hold_until: '2026-09-01',
          post_goal_mode: 'maintain',
        }),
      ],
      items: [anItem({ id: 'i1', goal_id: 'g1', title: '지난 목표', due: TODAY })],
    })
    const { user } = render(<TodayScreen />)
    await user.click((await screen.findAllByRole('checkbox'))[0])
    await user.click(screen.getByRole('button', { name: /알맞음/ }))

    const item = usePlanner.getState().items[0]
    // 마감선이 지났으니 제약이 풀리고 순수 간격으로 돈다.
    expect(item.state).toBe('maintaining')
    expect(item.due! > TODAY).toBe(true)
  })

  it('S-101 제목이 아주 길어도 화면이 안 깨진다', async () => {
    const long = '아주 긴 제목 '.repeat(30).trim()
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: long, due: TODAY })],
    })
    render(<TodayScreen />)
    const box = (await screen.findAllByRole('checkbox'))[0]
    expect(box.getAttribute('aria-label')).toContain('아주 긴 제목')
    // 잘려서 보이도록 처리돼 있어야 한다.
    expect(document.querySelector('.truncate')).not.toBeNull()
  })

  it('S-102 항목 300개에서도 화면이 뜨고 조작이 된다', async () => {
    await setupApp(TODAY, {
      // 상한을 넉넉히 두어 300개가 모두 오늘 목록에 오르게 한다.
      settings: { dailyCap: '400' },
      items: Array.from({ length: 300 }, (_, i) =>
        anItem({
          id: `i${String(i).padStart(3, '0')}`,
          title: `항목 ${i + 1}`,
          due: TODAY,
          created_at: `2026-09-01T00:00:${String(i % 60).padStart(2, '0')}.000Z`,
        })
      ),
    })
    const { user } = render(<TodayScreen />)
    const boxes = await screen.findAllByRole('checkbox')
    expect(boxes).toHaveLength(300)

    await user.click(boxes[0])
    await user.click(screen.getByRole('button', { name: /알맞음/ }))
    expect(usePlanner.getState().reviews).toHaveLength(1)
    expect(screen.getAllByRole('checkbox')).toHaveLength(299)
  })

  it('S-103 하루 상한을 넘게 몰리면 펴서 잡는다', async () => {
    await setupApp(TODAY, {
      settings: { dailyCap: '3' },
      items: Array.from({ length: 12 }, (_, i) =>
        anItem({
          id: `i${i}`,
          title: `몰린 항목 ${i + 1}`,
          due: '2026-10-10',
          first_studied_at: '2026-09-29',
          last_review: '2026-09-29',
        })
      ),
    })
    const counts = new Map<string, number>()
    for (const item of usePlanner.getState().items) {
      counts.set(item.due!, (counts.get(item.due!) ?? 0) + 1)
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3)
  })

  it('S-103b 항목이 없어도 서재가 뜬다', async () => {
    await setupApp(TODAY)
    render(<LibraryScreen onOpenItem={noop} onOpenGoal={noop} />)
    expect(await screen.findByText('찾는 항목이 없어요.')).toBeInTheDocument()
  })
})
