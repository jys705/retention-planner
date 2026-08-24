// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TodayScreen } from '../../src/features/today/TodayScreen'
import { usePlanner } from '../../src/store/planner'
import {
  render,
  setDateInput,
  setupApp,
  shift,
  teardownApp,
} from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

describe('오늘 화면: 소급 입력', () => {
  // 강도 표준이면 S0(3) = 2.3065 이고 I(0.9, S) = round(2.3065) = 2 다.
  // 그래서 다음에 볼 날은 언제나 공부한 날 + 2일이다.
  const cases: { id: string; back: number; due: string; overdue: number }[] = [
    { id: 'S-011', back: 1, due: '2026-10-02', overdue: 0 },
    { id: 'S-012', back: 3, due: '2026-09-30', overdue: 1 },
    { id: 'S-013', back: 10, due: '2026-09-23', overdue: 8 },
    { id: 'S-014', back: 100, due: '2026-06-25', overdue: 98 },
  ]

  for (const { id, back, due, overdue } of cases) {
    it(`${id} ${back}일 전으로 적으면 due 가 ${due} 이고 ${overdue}일 지남이다`, async () => {
      await setupApp(TODAY)
      const { user } = render(<TodayScreen onOpenItem={() => {}} />)
      const firstStudiedAt = shift(TODAY, -back)

      await user.type(screen.getByLabelText('새 항목 제목'), '소급 항목')
      await user.click(screen.getByRole('button', { name: /상세 설정/ }))
      await setDateInput(
        user,
        screen.getByLabelText('공부한 날 고르기'),
        firstStudiedAt
      )
      await user.click(screen.getByRole('button', { name: /적어두기/ }))

      const stored = usePlanner.getState().items[0]
      expect(stored.first_studied_at).toBe(firstStudiedAt)
      // 그 시점에 '무난함' 으로 한 번 본 것으로 친다.
      expect(stored.last_review).toBe(firstStudiedAt)
      expect(stored.due).toBe(due)

      if (overdue > 0) {
        expect(await screen.findByText(`${overdue}일 지남`)).toBeInTheDocument()
      } else {
        expect(screen.queryByText(/일 지남/)).toBeNull()
      }
    })
  }
})
