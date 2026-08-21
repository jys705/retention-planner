import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { applyDailyCap, type CapCandidate } from '../../src/core/spread/cap'
import { addDays, toEpochDay } from '../../src/lib/date'

const TODAY = '2026-10-01'

function candidate(
  id: string,
  date: string,
  over: Partial<CapCandidate> = {}
): CapCandidate {
  return {
    itemId: id,
    date,
    notBefore: TODAY,
    notAfter: null,
    pushPriority: 0,
    ...over,
  }
}

function loadOf(
  candidates: CapCandidate[],
  moved: Record<string, string>
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const c of candidates) {
    const date = moved[c.itemId] ?? c.date
    counts.set(date, (counts.get(date) ?? 0) + 1)
  }
  return counts
}

describe('하루 상한 밀어내기', () => {
  it('상한을 넘지 않으면 아무것도 옮기지 않는다', () => {
    const list = [
      candidate('a', TODAY),
      candidate('b', TODAY),
      candidate('c', addDays(TODAY, 1)),
    ]
    expect(applyDailyCap(list, 5)).toEqual({ moved: {}, stillOver: [] })
  })

  it('넘치는 만큼만 덜어낸다', () => {
    const list = Array.from({ length: 9 }, (_, i) =>
      candidate(`i${i}`, addDays(TODAY, 3))
    )
    const result = applyDailyCap(list, 4)
    const counts = loadOf(list, result.moved)
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(4)
    expect(Object.keys(result.moved)).toHaveLength(5)
    expect(result.stillOver).toEqual([])
  })

  it('미뤄도 덜 아쉬운 것부터 옮긴다', () => {
    const list = [
      candidate('급함', addDays(TODAY, 3), { pushPriority: 0 }),
      candidate('보통', addDays(TODAY, 3), { pushPriority: 1 }),
      candidate('여유', addDays(TODAY, 3), { pushPriority: 2 }),
    ]
    const result = applyDailyCap(list, 2)
    expect(Object.keys(result.moved)).toEqual(['여유'])
  })

  it('옮길 수 있는 범위를 벗어나지 않는다', () => {
    const list = Array.from({ length: 6 }, (_, i) =>
      candidate(`i${i}`, addDays(TODAY, 5), {
        notBefore: addDays(TODAY, 4),
        notAfter: addDays(TODAY, 6),
      })
    )
    const result = applyDailyCap(list, 2)
    for (const [id, date] of Object.entries(result.moved)) {
      void id
      expect(toEpochDay(date)).toBeGreaterThanOrEqual(
        toEpochDay(addDays(TODAY, 4))
      )
      expect(toEpochDay(date)).toBeLessThanOrEqual(toEpochDay(addDays(TODAY, 6)))
    }
  })

  it('옮길 자리가 없으면 남겨두고 알려준다', () => {
    // 하루짜리 창에 다섯 개. 어디로도 못 옮긴다.
    const list = Array.from({ length: 5 }, (_, i) =>
      candidate(`i${i}`, addDays(TODAY, 2), {
        notBefore: addDays(TODAY, 2),
        notAfter: addDays(TODAY, 2),
      })
    )
    const result = applyDailyCap(list, 2)
    expect(result.moved).toEqual({})
    expect(result.stillOver).toEqual([addDays(TODAY, 2)])
  })

  it('오늘보다 이르게는 옮기지 않는다', () => {
    const list = Array.from({ length: 8 }, (_, i) => candidate(`i${i}`, TODAY))
    const result = applyDailyCap(list, 3)
    for (const date of Object.values(result.moved)) {
      expect(toEpochDay(date)).toBeGreaterThanOrEqual(toEpochDay(TODAY))
    }
  })

  it('같은 입력이면 같은 결과가 나온다', () => {
    const list = Array.from({ length: 30 }, (_, i) =>
      candidate(`i${String(i).padStart(2, '0')}`, addDays(TODAY, i % 3), {
        pushPriority: i % 4,
      })
    )
    const first = applyDailyCap(list, 5)
    for (let i = 0; i < 5; i += 1) {
      expect(applyDailyCap(list, 5)).toEqual(first)
    }
  })

  it('항목 수는 늘지도 줄지도 않는다', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 80 }),
        fc.integer({ min: 1, max: 8 }),
        (offsets, cap) => {
          const list = offsets.map((offset, i) =>
            candidate(`i${String(i).padStart(3, '0')}`, addDays(TODAY, offset), {
              pushPriority: i % 5,
            })
          )
          const result = applyDailyCap(list, cap)
          const counts = loadOf(list, result.moved)
          const total = [...counts.values()].reduce((a, b) => a + b, 0)
          expect(total).toBe(list.length)
          // 옮기고 나서 상한을 넘는 날은 자리가 없다고 알려준 날뿐이다.
          for (const [date, count] of counts) {
            if (count > cap) expect(result.stillOver).toContain(date)
          }
        }
      ),
      { numRuns: 1_000 }
    )
  })
})

describe('상한 층이 앞 층의 구간을 넘지 않는다', () => {
  it('구간이 좁고 항목이 많아도 모두 자기 구간 안에 남는다', () => {
    // 옮길 수 있는 날이 나흘뿐인데 항목이 스물이다.
    // 상한을 지키려면 구간 밖으로 나가야 하지만, 나가면 안 된다.
    const window = { from: 3, to: 6 }
    const list = Array.from({ length: 20 }, (_, i) =>
      candidate(`i${String(i).padStart(2, '0')}`, addDays(TODAY, 5), {
        notBefore: addDays(TODAY, window.from),
        notAfter: addDays(TODAY, window.to),
        pushPriority: i % 4,
      })
    )
    const result = applyDailyCap(list, 2)
    for (const c of list) {
      const placed = result.moved[c.itemId] ?? c.date
      expect(toEpochDay(placed)).toBeGreaterThanOrEqual(
        toEpochDay(addDays(TODAY, window.from))
      )
      expect(toEpochDay(placed)).toBeLessThanOrEqual(
        toEpochDay(addDays(TODAY, window.to))
      )
    }
    // 구간을 지키느라 못 지킨 날은 숨기지 않고 알려준다.
    expect(result.stillOver.length).toBeGreaterThan(0)
  })

  it('구간이 오늘보다 늦게 시작해도 오늘로 당기지 않는다', () => {
    const earliest = addDays(TODAY, 4)
    const list = Array.from({ length: 9 }, (_, i) =>
      candidate(`i${i}`, addDays(TODAY, 5), {
        notBefore: earliest,
        notAfter: addDays(TODAY, 6),
      })
    )
    const result = applyDailyCap(list, 2)
    for (const c of list) {
      const placed = result.moved[c.itemId] ?? c.date
      expect(toEpochDay(placed)).toBeGreaterThanOrEqual(toEpochDay(earliest))
    }
  })

  it('구간 안에 자리가 있으면 이른 쪽을 먼저 쓴다', () => {
    // 구간은 넉넉하고 넘치는 날만 덜어내면 되는 경우.
    const list = Array.from({ length: 5 }, (_, i) =>
      candidate(`i${i}`, addDays(TODAY, 5), {
        notBefore: addDays(TODAY, 1),
        notAfter: addDays(TODAY, 9),
      })
    )
    const result = applyDailyCap(list, 2)
    const placedDays = list.map((c) =>
      toEpochDay(result.moved[c.itemId] ?? c.date)
    )
    // 앞쪽으로 펴야 마감선을 넘지 않는다.
    expect(Math.min(...placedDays)).toBeLessThan(toEpochDay(addDays(TODAY, 5)))
    expect(Math.max(...placedDays)).toBeLessThanOrEqual(
      toEpochDay(addDays(TODAY, 9))
    )
  })
})
