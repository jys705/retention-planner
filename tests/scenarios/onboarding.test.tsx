// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Onboarding } from '../../src/features/onboarding/Onboarding'
import { usePlanner } from '../../src/store/planner'
import { render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

async function fresh(): Promise<void> {
  await setupApp(TODAY)
  await usePlanner.getState().saveSetting('onboardingDone', false)
}

describe('첫 실행 안내', () => {
  it('S-096 3단계를 지나 빈 상태로 시작한다', async () => {
    await fresh()
    const { user } = render(<Onboarding />)

    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText('한 일을 한 줄로 적어요')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '시작하기' }))
    expect(usePlanner.getState().settings.onboardingDone).toBe(true)
    // 사용자가 안 적은 항목이 목록에 남아 있으면 안 된다.
    expect(usePlanner.getState().items).toHaveLength(0)
  })

  it('S-289 예시 날짜는 오늘에서 셈해 지난 날을 다음이라고 하지 않는다', async () => {
    await fresh()
    const { user } = render(<Onboarding />)
    await user.click(screen.getByRole('button', { name: '다음' }))
    // 오늘은 10월 1일이다. 이틀 뒤를 다음 날짜로 보여 준다.
    // 숫자 덩어리만 따로 감싸 그리므로 글이 여러 조각이다. 상자 전체의 글로 본다.
    const example = screen.getByText(
      (_, element) =>
        element?.tagName === 'DIV' && element.textContent === '다음은 10월\u00a03일에 3개예요'
    )
    // 한글 낱말은 본문 글꼴이고 숫자 덩어리만 등폭이다. 통째로 등폭이면 낱말 사이가 벌어진다.
    expect(example).not.toHaveClass('num')
    // 날짜는 한 덩어리다. 월과 일 사이에서 줄이 바뀌지 않는다.
    expect([...example.querySelectorAll('.num')].map((n) => n.textContent)).toEqual([
      '10월\u00a03일',
      '3개',
    ])
  })

  it('S-096b 이전으로 돌아간다', async () => {
    await fresh()
    const { user } = render(<Onboarding />)
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.click(screen.getByRole('button', { name: '이전' }))
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('S-097 건너뛰어도 빈 상태로 끝난다', async () => {
    await fresh()
    const { user } = render(<Onboarding />)
    await user.click(screen.getByRole('button', { name: '건너뛰기' }))
    expect(usePlanner.getState().settings.onboardingDone).toBe(true)
    expect(usePlanner.getState().items).toHaveLength(0)
  })

  it('S-098 한 번 지나면 저장된다', async () => {
    await fresh()
    const { user } = render(<Onboarding />)
    await user.click(screen.getByRole('button', { name: '건너뛰기' }))

    // 저장소에서 다시 읽어도 남아 있다.
    usePlanner.setState({ ready: false, goals: [], items: [], reviews: [], planned: [] })
    await usePlanner.getState().load()
    expect(usePlanner.getState().settings.onboardingDone).toBe(true)
  })
})
