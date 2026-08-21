import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays, toEpochDay } from '../../src/lib/date'
import {
  APPROX_PRESETS,
  customCenterDays,
  NEVER,
  relativeHorizon,
  relativeWindow,
  resolveHorizon,
  UNIT_DAYS,
  type Horizon,
} from '../../src/core/horizon/horizon'

const TODAY = '2026-10-01'

describe('세 모드가 하나의 구간으로 합쳐진다', () => {
  it('여유 폭이 0 이면 대략이 정확한 날짜와 같아진다', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2000 }), (days) => {
        const asWindow = resolveHorizon(relativeHorizon(TODAY, days, 0))
        const asDate = resolveHorizon({
          kind: 'date',
          at: addDays(TODAY, days),
        })
        expect(asWindow).toEqual(asDate)
      }),
      { numRuns: 500 }
    )
  })

  it('준비 마감선이 무한이면 무기한과 같아진다', () => {
    const asOpen = resolveHorizon({ kind: 'open' })
    expect(asOpen).toEqual({ readyAt: NEVER, holdUntil: NEVER })
    expect(Number.isFinite(asOpen.readyAt)).toBe(false)
  })

  it('정확한 날짜는 두 끝이 같은 날에 모인다', () => {
    const resolved = resolveHorizon({ kind: 'date', at: '2026-11-14' })
    expect(resolved.readyAt).toBe(resolved.holdUntil)
    expect(resolved.readyAt).toBe(toEpochDay('2026-11-14'))
  })

  it('대략은 항상 준비 마감선이 유지 마감선보다 이르거나 같다', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (days, u) => {
          const w = relativeWindow(TODAY, days, u)
          expect(w.readyAt <= w.holdUntil).toBe(true)
        }
      ),
      { numRuns: 500 }
    )
  })
})

describe('상대 표현을 구간으로 바꾼다', () => {
  const table: [number, number, number][] = [
    [7, 6, 9],
    [14, 11, 18],
    [21, 17, 26],
    [30, 24, 38],
    [60, 48, 75],
    [90, 72, 113],
    [180, 144, 225],
    [365, 292, 456],
  ]

  it.each(table)(
    '중심 %i일이면 +%i일에서 +%i일 구간이 된다',
    (center, early, late) => {
      const w = relativeWindow(TODAY, center)
      expect(w.readyAt).toBe(addDays(TODAY, early))
      expect(w.holdUntil).toBe(addDays(TODAY, late))
    }
  )
})

describe('대략 프리셋', () => {
  it('프리셋은 8개이고 3주쯤이 들어 있다', () => {
    expect(APPROX_PRESETS).toHaveLength(8)
    expect(APPROX_PRESETS.map((p) => p.label)).toEqual([
      '1주쯤',
      '2주쯤',
      '3주쯤',
      '1개월쯤',
      '2개월쯤',
      '3개월쯤',
      '6개월쯤',
      '1년쯤',
    ])
  })

  it('프리셋이 멀수록 중심이 커진다', () => {
    const days = APPROX_PRESETS.map((p) => p.centerDays)
    expect([...days].sort((a, b) => a - b)).toEqual(days)
  })

  it('직접 입력이 단위를 일수로 바꾼다', () => {
    expect(customCenterDays(6, 'week')).toBe(42)
    expect(customCenterDays(4, 'month')).toBe(120)
    expect(customCenterDays(2, 'year')).toBe(730)
  })

  it('직접 입력이 프리셋이 못 덮는 구간을 채운다', () => {
    // 6주쯤: 프리셋 1개월(24에서 38일)과 2개월(48에서 75일) 사이의 빈 구간
    const w = relativeWindow(TODAY, customCenterDays(6, 'week'))
    expect(w.readyAt).toBe(addDays(TODAY, 34))
    expect(w.holdUntil).toBe(addDays(TODAY, 53))
  })

  it('직접 입력은 1 에서 99 사이만 받는다', () => {
    expect(() => customCenterDays(0, 'week')).toThrow()
    expect(() => customCenterDays(100, 'week')).toThrow()
    expect(() => customCenterDays(1.5, 'week')).not.toThrow()
    expect(customCenterDays(1.5, 'week')).toBe(2 * UNIT_DAYS.week)
  })
})

describe('경계값', () => {
  it('오늘이 목표인 경우에도 구간이 성립한다', () => {
    const h: Horizon = { kind: 'date', at: TODAY }
    const resolved = resolveHorizon(h)
    expect(resolved.readyAt).toBe(toEpochDay(TODAY))
    expect(resolved.holdUntil).toBe(toEpochDay(TODAY))
  })

  it('중심이 0일이면 두 끝이 오늘로 모인다', () => {
    const w = relativeWindow(TODAY, 0)
    expect(w.readyAt).toBe(TODAY)
    expect(w.holdUntil).toBe(TODAY)
  })
})
