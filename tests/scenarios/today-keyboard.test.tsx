// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import { anItem, screenWithUser, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

function three() {
  return ['가', '나', '다'].map((n, i) =>
    anItem({
      id: `i${i}`,
      title: `항목 ${n}`,
      due: TODAY,
      first_studied_at: '2026-09-29',
      last_review: '2026-09-29',
      created_at: `2026-09-2${i}T00:00:00.000Z`,
    })
  )
}

describe('오늘 화면: 키보드', () => {
  it('S-042 위아래로 옮겨 다닌다', async () => {
    await setupApp(TODAY, { items: three() })
    const { user } = screenWithUser(<TodayScreen />)
    await screen.findAllByRole('checkbox')

    // 아래로 두 번 간 뒤 Enter 로 펼치면 세 번째 항목이 열린다.
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(screen.getByText('얼마나 기억났나요?')).toBeInTheDocument()
    await user.keyboard('3')
    expect(usePlanner.getState().reviews[0].item_id).toBe('i2')
  })

  it('S-043 Enter 로 펼치고 Enter 로 접는다', async () => {
    await setupApp(TODAY, { items: three() })
    const { user } = screenWithUser(<TodayScreen />)
    await screen.findAllByRole('checkbox')

    await user.keyboard('{Enter}')
    expect(screen.getByText('얼마나 기억났나요?')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(screen.queryByText('얼마나 기억났나요?')).toBeNull()
  })

  it('S-044 1에서 4 키로 평가한다', async () => {
    for (const [key, rating] of [
      ['1', 1],
      ['2', 2],
      ['3', 3],
      ['4', 4],
    ] as const) {
      await setupApp(TODAY, { items: three() })
      const { user } = screenWithUser(<TodayScreen />)
      await screen.findAllByRole('checkbox')
      await user.keyboard(`{Enter}${key}`)
      expect(usePlanner.getState().reviews[0].rating).toBe(rating)
    }
  })

  it('S-044b 펼치지 않았으면 숫자 키가 아무 일도 안 한다', async () => {
    await setupApp(TODAY, { items: three() })
    const { user } = screenWithUser(<TodayScreen />)
    await screen.findAllByRole('checkbox')
    await user.keyboard('3')
    expect(usePlanner.getState().reviews).toHaveLength(0)
  })

  it('S-045 N 으로 새 항목 입력창에 간다', async () => {
    await setupApp(TODAY, { items: three() })
    const { user } = screenWithUser(<TodayScreen />)
    await screen.findAllByRole('checkbox')
    await user.keyboard('n')
    expect(document.activeElement).toBe(screen.getByLabelText('새 항목 제목'))
  })

  it('S-046 Esc 로 닫는다', async () => {
    await setupApp(TODAY, { items: three() })
    const { user } = screenWithUser(<TodayScreen />)
    await screen.findAllByRole('checkbox')
    await user.keyboard('{Enter}')
    expect(screen.getByText('얼마나 기억났나요?')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByText('얼마나 기억났나요?')).toBeNull()
  })
})
