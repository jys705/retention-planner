// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ForecastScreen } from '../../src/features/forecast/ForecastScreen'
import { anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

function many(n: number, due: string) {
  return Array.from({ length: n }, (_, i) =>
    anItem({
      id: `i${i}`,
      title: `항목 ${i + 1}`,
      due,
      first_studied_at: '2026-09-29',
      last_review: '2026-09-29',
    })
  )
}

describe('예보', () => {
  it('S-066 60일 막대와 요약 한 문장', async () => {
    await setupApp(TODAY, { items: many(4, '2026-10-05') })
    render(<ForecastScreen />)
    expect((await screen.findAllByText('앞으로 60일')).length).toBeGreaterThan(0)
    expect(
      screen.getByText(/앞으로 60일 동안 .*번 보게 돼요/)
    ).toBeInTheDocument()
    expect(screen.getByText('하루 평균')).toBeInTheDocument()
    expect(screen.getByText('하루 상한')).toBeInTheDocument()
    // 막대가 실제로 그려졌는지 본다.
    expect(document.querySelectorAll('svg').length).toBeGreaterThan(0)
  })

  it('S-067 상한을 넘는 날을 알려준다', async () => {
    // 이미 밀린 항목은 상한을 무시하고 오늘 한꺼번에 올라온다.
    // 이건 펴서 없앨 수 없는 초과라 화면이 그렇다고 말해야 한다.
    await setupApp(TODAY, {
      settings: { dailyCap: '3' },
      items: many(9, '2026-09-20'),
    })
    render(<ForecastScreen />)
    expect(
      await screen.findByText(/하루 상한 3개를 넘어요/)
    ).toBeInTheDocument()
  })

  it('S-068 달력 히트맵이 두 달을 보여준다', async () => {
    await setupApp(TODAY, { items: many(3, '2026-10-05') })
    render(<ForecastScreen />)
    expect(await screen.findByText('달력으로 보기')).toBeInTheDocument()
    expect(screen.getByText('10월')).toBeInTheDocument()
    expect(screen.getByText('11월')).toBeInTheDocument()
    expect(screen.getAllByText('일').length).toBeGreaterThan(0)
  })

  it('S-068b 달력 칸을 누르면 그날이 선택된다', async () => {
    await setupApp(TODAY, { items: many(3, '2026-10-05') })
    const { user } = render(<ForecastScreen />)
    await screen.findByText('달력으로 보기')
    // 개수가 있는 칸 하나를 골라 누른다.
    const cell = [...document.querySelectorAll('button[title]')].find((b) =>
      /10월 \d+일 [1-9]\d*개/.test(b.getAttribute('title') ?? '')
    )!
    const [, count] = /(\d+)개$/.exec(cell.getAttribute('title')!)!
    await user.click(cell)
    expect(screen.getByText(`${count}개 예정`)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '선택 해제' }))
    expect(screen.queryByText(`${count}개 예정`)).toBeNull()
  })

  it('S-069 앞으로 볼 게 없으면 그렇다고 말한다', async () => {
    await setupApp(TODAY)
    render(<ForecastScreen />)
    expect(
      await screen.findByText(/앞으로 잡힌 복습이 없어요/)
    ).toBeInTheDocument()
  })
})
