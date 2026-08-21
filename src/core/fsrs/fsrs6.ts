import {
  clamp,
  DEFAULT_MAXIMUM_INTERVAL,
  DEFAULT_W,
  D_MAX,
  D_MIN,
  normalizeWeights,
  roundTo,
  S_MAX,
  S_MIN,
} from './params'
import { Rating, type Grade, type MemoryState, type Weights } from './types'

/**
 * FSRS-6.
 *
 * 수식 단계마다 소수점 8자리에서 끊는다. 원본 구현이 그렇게 하고 있고,
 * 끊는 자리가 하나만 어긋나도 여러 번 복습한 뒤에는 눈에 보일 만큼 값이 갈린다.
 */
export class Fsrs6 {
  readonly w: number[]
  /** 망각 곡선의 지수. 학습 가능한 파라미터라 상수가 아니다. */
  readonly decay: number
  readonly factor: number
  readonly maximumInterval: number
  /** 같은 날 두 번 기록했을 때 단기 수식을 쓸지. */
  readonly enableShortTerm: boolean

  constructor(options: {
    w?: Weights
    maximumInterval?: number
    enableShortTerm?: boolean
  } = {}) {
    this.w = normalizeWeights(options.w ?? DEFAULT_W)
    this.decay = -this.w[20]
    this.factor = roundTo(Math.exp(Math.log(0.9) / this.decay) - 1, 8)
    this.maximumInterval = options.maximumInterval ?? DEFAULT_MAXIMUM_INTERVAL
    this.enableShortTerm = options.enableShortTerm ?? true
  }

  /**
   * 망각 곡선. 마지막 복습에서 t 일이 지났을 때 떠올릴 수 있을 확률.
   * t 가 stability 와 같으면 0.9 가 나온다.
   */
  retrievability(elapsedDays: number, stability: number): number {
    return roundTo(
      Math.pow(1 + (this.factor * elapsedDays) / stability, this.decay),
      8
    )
  }

  /** 망각 곡선의 역함수를 stability 로 나눈 값. 회상률 하나당 한 번만 구하면 된다. */
  intervalModifier(desiredRetention: number): number {
    if (desiredRetention <= 0 || desiredRetention > 1) {
      throw new Error('목표 회상률은 0 초과 1 이하여야 한다')
    }
    return roundTo(
      (Math.pow(desiredRetention, 1 / this.decay) - 1) / this.factor,
      8
    )
  }

  /** 회상률이 desiredRetention 으로 떨어지기까지의 일수. 반올림하지 않은 값이다. */
  intervalExact(desiredRetention: number, stability: number): number {
    return stability * this.intervalModifier(desiredRetention)
  }

  /** 실제로 잡을 간격. 하루 미만은 하루로 올리고 상한을 넘지 않게 자른다. */
  nextInterval(desiredRetention: number, stability: number): number {
    const raw = Math.round(stability * this.intervalModifier(desiredRetention))
    return Math.min(Math.max(1, raw), this.maximumInterval)
  }

  /** 첫 평가 직후의 stability. */
  initStability(grade: Grade): number {
    return Math.max(this.w[grade - 1], 0.1)
  }

  /** 첫 평가 직후의 difficulty. 자르기 전 값이다. */
  initDifficulty(grade: Grade): number {
    return roundTo(this.w[4] - Math.exp((grade - 1) * this.w[5]) + 1, 8)
  }

  /** 이미 어려운 항목일수록 난이도가 덜 움직이게 감쇠시킨다. */
  private linearDamping(deltaD: number, oldD: number): number {
    return roundTo((deltaD * (10 - oldD)) / 9, 8)
  }

  /** 반복될수록 '쉬움'을 눌렀을 때의 난이도 쪽으로 조금씩 끌어당긴다. */
  private meanReversion(init: number, current: number): number {
    return roundTo(this.w[7] * init + (1 - this.w[7]) * current, 8)
  }

  nextDifficulty(difficulty: number, grade: Grade): number {
    const deltaD = -this.w[6] * (grade - 3)
    const nextD = difficulty + this.linearDamping(deltaD, difficulty)
    return clamp(
      this.meanReversion(this.initDifficulty(Rating.Easy), nextD),
      D_MIN,
      D_MAX
    )
  }

  /**
   * 떠올리는 데 성공했을 때의 stability.
   * 회상률이 낮을 때 볼수록 많이 오른다. 간격 효과가 수식에 들어 있는 자리가 여기다.
   */
  nextRecallStability(
    difficulty: number,
    stability: number,
    retrievability: number,
    grade: Grade
  ): number {
    const hardPenalty = grade === Rating.Hard ? this.w[15] : 1
    const easyBound = grade === Rating.Easy ? this.w[16] : 1
    return roundTo(
      clamp(
        stability *
          (1 +
            Math.exp(this.w[8]) *
              (11 - difficulty) *
              Math.pow(stability, -this.w[9]) *
              (Math.exp((1 - retrievability) * this.w[10]) - 1) *
              hardPenalty *
              easyBound),
        S_MIN,
        S_MAX
      ),
      8
    )
  }

  /** 떠올리지 못했을 때의 stability. 상한은 nextState 에서 따로 씌운다. */
  nextForgetStability(
    difficulty: number,
    stability: number,
    retrievability: number
  ): number {
    return roundTo(
      clamp(
        this.w[11] *
          Math.pow(difficulty, -this.w[12]) *
          (Math.pow(stability + 1, this.w[13]) - 1) *
          Math.exp((1 - retrievability) * this.w[14]),
        S_MIN,
        S_MAX
      ),
      8
    )
  }

  /**
   * 같은 날 두 번째로 기록했을 때의 stability.
   * 하루가 지나지 않았으니 망각 곡선을 태우지 않고 등급만 반영한다.
   */
  nextShortTermStability(stability: number, grade: Grade): number {
    const sinc =
      Math.pow(stability, -this.w[19]) *
      Math.exp(this.w[17] * (grade - 3 + this.w[18]))
    const masked = grade >= Rating.Hard ? Math.max(sinc, 1) : sinc
    return roundTo(clamp(stability * masked, S_MIN, S_MAX), 8)
  }

  /**
   * 평가 한 번을 반영해 다음 기억 상태를 낸다.
   * state 가 null 이면 첫 평가로 보고 초기 상태를 만든다.
   *
   * @param elapsedDays 마지막 복습에서 지난 일수. 같은 날이면 0
   */
  nextState(
    state: MemoryState | null,
    elapsedDays: number,
    grade: Grade
  ): MemoryState {
    if (elapsedDays < 0) {
      throw new Error(`지난 일수가 음수다: ${elapsedDays}`)
    }
    if (state === null) {
      return {
        difficulty: clamp(this.initDifficulty(grade), D_MIN, D_MAX),
        stability: this.initStability(grade),
      }
    }

    const { stability: s, difficulty: d } = state
    if (d < D_MIN || s < S_MIN) {
      throw new Error(`기억 상태가 범위 밖이다: S=${s}, D=${d}`)
    }

    const r = this.retrievability(elapsedDays, s)
    let nextStability: number

    if (elapsedDays === 0 && this.enableShortTerm) {
      nextStability = this.nextShortTermStability(s, grade)
    } else if (grade === Rating.Again) {
      const afterFail = this.nextForgetStability(d, s, r)
      const w17 = this.enableShortTerm ? this.w[17] : 0
      const w18 = this.enableShortTerm ? this.w[18] : 0
      // 실패한 뒤의 stability 가 실패 전보다 커지지 않게 위쪽을 막는다.
      const ceilingFromPrevious = s / Math.exp(w17 * w18)
      nextStability = clamp(
        roundTo(ceilingFromPrevious, 8),
        S_MIN,
        afterFail
      )
    } else {
      nextStability = this.nextRecallStability(d, s, r, grade)
    }

    return {
      stability: nextStability,
      difficulty: this.nextDifficulty(d, grade),
    }
  }
}

/** 기본 파라미터로 만든 엔진. 대부분의 호출부는 이걸 쓴다. */
export const defaultFsrs = new Fsrs6()
