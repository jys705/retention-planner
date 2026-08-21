import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { yAxisMin, yAxisTicks } from '../../src/features/charts/axis'

describe('기억 곡선 y축', () => {
  it('데이터가 높으면 하한이 기본값에 머문다', () => {
    expect(yAxisMin([0.95, 0.9, 0.88, 0.72])).toBe(0.6)
    expect(yAxisMin([1, 0.9])).toBe(0.6)
  })

  it('기억률 최솟값이 0.4 여도 곡선이 잘리지 않는다', () => {
    const min = yAxisMin([0.95, 0.7, 0.4])
    expect(min).toBeLessThanOrEqual(0.4)
    expect(min).toBe(0.3)
  })

  it('데이터 최솟값보다 항상 낮거나 같다', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.001, max: 1, noNaN: true }), {
          minLength: 1,
          maxLength: 60,
        }),
        (values) => {
          const min = yAxisMin(values)
          expect(min).toBeLessThanOrEqual(Math.min(...values))
          expect(min).toBeGreaterThanOrEqual(0)
          expect(min).toBeLessThanOrEqual(0.6)
        }
      ),
      { numRuns: 2_000 }
    )
  })

  it('아주 낮은 값에서도 0 아래로는 안 간다', () => {
    expect(yAxisMin([0.01])).toBe(0)
    expect(yAxisMin([0.0001])).toBe(0)
  })

  it('빈 데이터에는 기본 하한을 쓴다', () => {
    expect(yAxisMin([])).toBe(0.6)
  })

  it('눈금이 하한에서 1 까지 오름차순으로 놓인다', () => {
    const ticks = yAxisTicks(0.6)
    expect(ticks[0]).toBeCloseTo(0.6, 10)
    expect(ticks[ticks.length - 1]).toBe(1)
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1])
    }
  })

  it('축이 열리면 눈금도 따라 내려간다', () => {
    const ticks = yAxisTicks(yAxisMin([0.4]))
    expect(ticks[0]).toBeCloseTo(0.3, 10)
  })
})
