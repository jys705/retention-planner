import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { fuzzDue, fuzzRange } from '../../src/core/spread/fuzz'
import { addDays, diffDays, toEpochDay } from '../../src/lib/date'

const TODAY = '2026-10-01'

describe('무기한 항목의 날짜 흔들기', () => {
  it('구간별 폭이 정해진 대로다', () => {
    expect(fuzzRange(1)).toBe(0)
    expect(fuzzRange(2.4)).toBe(0)
    expect(fuzzRange(2.5)).toBe(0.15)
    expect(fuzzRange(6.9)).toBe(0.15)
    expect(fuzzRange(7)).toBe(0.1)
    expect(fuzzRange(19.9)).toBe(0.1)
    expect(fuzzRange(20)).toBe(0.05)
    expect(fuzzRange(400)).toBe(0.05)
  })

  it('짧은 간격은 흔들지 않는다', () => {
    for (const interval of [1, 2]) {
      expect(fuzzDue({ from: TODAY, intervalDays: interval, dailyLoad: {} })).toBe(
        addDays(TODAY, interval)
      )
    }
  })

  it('예정된 항목이 가장 적은 날로 옮긴다', () => {
    const natural = addDays(TODAY, 10)
    const quiet = addDays(natural, -1)
    const load: Record<string, number> = {}
    for (let d = -1; d <= 1; d += 1) load[addDays(natural, d)] = 5
    load[quiet] = 0
    expect(fuzzDue({ from: TODAY, intervalDays: 10, dailyLoad: load })).toBe(quiet)
  })

  it('비어 있는 날이 여럿이면 원래 날짜에 가까운 쪽을 남긴다', () => {
    const natural = addDays(TODAY, 10)
    expect(fuzzDue({ from: TODAY, intervalDays: 10, dailyLoad: {} })).toBe(natural)
  })

  it('흔든 결과가 허용 폭을 벗어나지 않는다', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 400 }),
        fc.dictionary(
          fc.integer({ min: -30, max: 430 }).map((d) => addDays(TODAY, d)),
          fc.integer({ min: 0, max: 30 })
        ),
        (interval, load) => {
          const due = fuzzDue({ from: TODAY, intervalDays: interval, dailyLoad: load })
          const delta = Math.max(1, Math.round(interval * fuzzRange(interval)))
          const shift = Math.abs(
            diffDays(addDays(TODAY, interval), due)
          )
          expect(shift).toBeLessThanOrEqual(fuzzRange(interval) === 0 ? 0 : delta)
          expect(toEpochDay(due)).toBeGreaterThan(toEpochDay(TODAY))
        }
      ),
      { numRuns: 2_000 }
    )
  })

  it('같은 입력이면 항상 같은 날짜가 나온다', () => {
    const load = { [addDays(TODAY, 30)]: 4, [addDays(TODAY, 29)]: 1 }
    const first = fuzzDue({ from: TODAY, intervalDays: 30, dailyLoad: load })
    for (let i = 0; i < 20; i += 1) {
      expect(fuzzDue({ from: TODAY, intervalDays: 30, dailyLoad: load })).toBe(first)
    }
  })

  it('지정한 날보다 이르게는 옮기지 않는다', () => {
    const notBefore = addDays(TODAY, 10)
    const load: Record<string, number> = {}
    for (let d = 5; d <= 15; d += 1) load[addDays(TODAY, d)] = d >= 10 ? 9 : 0
    const due = fuzzDue({
      from: TODAY,
      intervalDays: 10,
      dailyLoad: load,
      notBefore,
    })
    expect(toEpochDay(due)).toBeGreaterThanOrEqual(toEpochDay(notBefore))
  })
})
