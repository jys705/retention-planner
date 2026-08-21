import type { Weights } from './types'

export const S_MIN = 0.001
export const S_MAX = 36500
export const INIT_S_MAX = 100
export const D_MIN = 1
export const D_MAX = 10

export const DEFAULT_MAXIMUM_INTERVAL = 36500

/** FSRS-6 기본 파라미터 21개. */
export const DEFAULT_W: Weights = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542,
])

/**
 * 각 파라미터가 벗어나면 안 되는 범위.
 * 사용자가 설정에서 값을 건드려도 수식이 깨지지 않게 여기서 잘라낸다.
 */
export const W_BOUNDS: readonly (readonly [number, number])[] = Object.freeze([
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [1.0, 10.0],
  [0.001, 4.0],
  [0.001, 4.0],
  [0.001, 0.75],
  [0.0, 4.5],
  [0.0, 0.8],
  [0.001, 3.5],
  [0.001, 5.0],
  [0.001, 0.25],
  [0.001, 0.9],
  [0.0, 4.0],
  [0.0, 1.0],
  [1.0, 6.0],
  [0.0, 2.0],
  [0.0, 2.0],
  [0.01, 0.8],
  [0.1, 0.8],
])

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 소수점 8자리에서 끊는다. 수식 단계마다 같은 자리에서 끊어야 결과가 갈리지 않는다. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** 범위 밖 값을 잘라 21개짜리 파라미터로 정규화한다. */
export function normalizeWeights(weights?: Weights): number[] {
  if (!weights || weights.length !== 21) return [...DEFAULT_W]
  return W_BOUNDS.map(([min, max], i) => clamp(weights[i] || 0, min, max))
}
