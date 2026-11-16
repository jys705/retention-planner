// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CurvePoint } from '../../src/core/simulate/project'
import { curveRows } from '../../src/features/charts/curveRows'
import { CurveTip } from '../../src/features/charts/MemoryCurveChart'
import { toEpochDay } from '../../src/lib/date'

const TODAY = '2026-10-05'
const x = (date: string) => toEpochDay(date)

function point(date: string, over: Partial<CurvePoint> = {}): CurvePoint {
  const retention = over.retention ?? 0.95
  return {
    date,
    retention,
    before: retention,
    reviewed: false,
    projected: date > TODAY,
    planned: null,
    ...over,
  }
}

describe('기억 곡선을 그릴 점', () => {
  it('복습한 날은 같은 날짜에 전과 후 두 점을 둬서 튀는 자리가 세로로 선다', () => {
    const rows = curveRows(
      [
        point('2026-10-01', { retention: 1, reviewed: true }),
        point('2026-10-02', { retention: 0.97 }),
        point('2026-10-03', { retention: 1, before: 0.94, reviewed: true }),
        point('2026-10-04', { retention: 0.98 }),
      ],
      TODAY
    )
    expect(rows).toEqual([
      // 처음 공부한 날은 그 전이 없다. 한 점만 둔다.
      { x: x('2026-10-01'), past: 1, future: null, mark: 1 },
      { x: x('2026-10-02'), past: 0.97, future: null, mark: null },
      { x: x('2026-10-03'), past: 0.94, future: null, mark: null },
      { x: x('2026-10-03'), past: 1, future: null, mark: 1 },
      { x: x('2026-10-04'), past: 0.98, future: null, mark: null },
    ])
  })

  it('실선은 오늘에서 끝나고 점선은 오늘의 같은 값에서 이어 시작한다', () => {
    const rows = curveRows(
      [point('2026-10-04', { retention: 0.93 }), point(TODAY, { retention: 0.92 }), point('2026-10-06', { retention: 0.91 })],
      TODAY
    )
    expect(rows).toEqual([
      { x: x('2026-10-04'), past: 0.93, future: null, mark: null },
      { x: x(TODAY), past: 0.92, future: 0.92, mark: null },
      { x: x('2026-10-06'), past: null, future: 0.91, mark: null },
    ])
  })

  it('오늘 볼 차례면 점선이 오늘에서 오늘 볼 때의 값으로 튀고, 계획한 복습 날에도 튄다', () => {
    const rows = curveRows(
      [
        point(TODAY, { retention: 0.82, planned: 1 }),
        point('2026-10-06', { retention: 0.99 }),
        point('2026-10-07', { retention: 1, before: 0.9, reviewed: true }),
      ],
      TODAY
    )
    expect(rows).toEqual([
      { x: x(TODAY), past: 0.82, future: 0.82, mark: null },
      { x: x(TODAY), past: null, future: 1, mark: 1 },
      { x: x('2026-10-06'), past: null, future: 0.99, mark: null },
      { x: x('2026-10-07'), past: null, future: 0.9, mark: null },
      { x: x('2026-10-07'), past: null, future: 1, mark: 1 },
    ])
  })
})

describe('곡선 위에 띄우는 설명', () => {
  const tip = (p: CurvePoint) => {
    const { container } = render(<CurveTip point={p} today={TODAY} />)
    return container.textContent
  }

  it('그날 하나에 한 줄이다. 같은 값을 두 번 적지 않는다', () => {
    expect(tip(point('2026-10-02', { retention: 0.97 }))).toBe('10월\u00a02일기억률 97%')
  })

  it('복습한 날은 복습 전과 후를 같이 적는다', () => {
    expect(tip(point('2026-10-03', { retention: 1, before: 0.94, reviewed: true }))).toBe(
      '10월\u00a03일 복습기억률 94%에서 100%로'
    )
    expect(tip(point('2026-10-09', { retention: 1, before: 0.9, reviewed: true, projected: true }))).toBe(
      '10월\u00a09일 복습 예정기억률 90%에서 100%로'
    )
  })

  it('오늘 볼 차례면 지금 값과 오늘 보면 오를 값을 적는다', () => {
    expect(tip(point(TODAY, { retention: 0.82, planned: 1 }))).toBe('10월\u00a05일 오늘 볼 차례기억률 82%에서 100%로')
    expect(tip(point(TODAY, { retention: 0.92 }))).toBe('10월\u00a05일 오늘기억률 92%')
  })

  it('숫자만 등폭 글꼴이다', () => {
    render(<CurveTip point={point('2026-10-03', { retention: 1, before: 0.94, reviewed: true })} today={TODAY} />)
    expect(screen.getByText('94%')).toHaveClass('num')
    expect(screen.getByText('100%')).toHaveClass('num')
  })
})
