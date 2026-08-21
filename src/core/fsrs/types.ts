/** 자가평가 4단계. 1 다시, 2 어려움, 3 알맞음, 4 쉬움. */
export type Grade = 1 | 2 | 3 | 4

export const Rating = {
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
} as const satisfies Record<string, Grade>

export const GRADES: readonly Grade[] = [1, 2, 3, 4]

/**
 * 항목 하나의 기억 상태.
 * stability 는 회상률이 90% 로 떨어지기까지의 일수, difficulty 는 1 에서 10 사이의 추정 난이도다.
 */
export interface MemoryState {
  stability: number
  difficulty: number
}

/** 파라미터 21개. 순서가 곧 의미라 배열로 둔다. */
export type Weights = readonly number[]
