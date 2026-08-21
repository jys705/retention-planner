import { describe, expect, it } from 'vitest'
import { FSRSAlgorithm, type FSRSState, type Grade as TsGrade } from 'ts-fsrs'
import { Fsrs6 } from '../../src/core/fsrs/fsrs6'
import { DEFAULT_W } from '../../src/core/fsrs/params'
import { GRADES, type Grade, type MemoryState } from '../../src/core/fsrs/types'
import { makeRng, randInt } from './rng'

const TOLERANCE = 1e-9
const SEQUENCE_COUNT = 10_000
const SEED = 20260822

interface Step {
  grade: Grade
  gap: number
}

function makeSequence(rng: () => number): Step[] {
  const length = randInt(rng, 1, 30)
  const steps: Step[] = []
  for (let i = 0; i < length; i += 1) {
    steps.push({
      grade: randInt(rng, 1, 4) as Grade,
      // 첫 평가에는 지난 일수가 의미 없다. 그 뒤로는 1일에서 400일 사이.
      gap: i === 0 ? 0 : randInt(rng, 1, 400),
    })
  }
  return steps
}

/** 우리 구현으로 시퀀스를 끝까지 돌린다. */
function runOurs(engine: Fsrs6, steps: Step[]): MemoryState {
  let state: MemoryState | null = null
  for (const step of steps) {
    state = engine.nextState(state, step.gap, step.grade)
  }
  // 시퀀스 길이가 1 이상이므로 null 이 남을 수 없다.
  return state as MemoryState
}

/** 같은 시퀀스를 ts-fsrs 로 돌린다. */
function runReference(algo: FSRSAlgorithm, steps: Step[]): FSRSState {
  let state: FSRSState | null = null
  for (const step of steps) {
    state = algo.next_state(state, step.gap, step.grade as TsGrade)
  }
  return state as FSRSState
}

describe('골든 테스트: ts-fsrs 대조', () => {
  const ours = new Fsrs6()
  const reference = new FSRSAlgorithm({})

  it('두 구현이 같은 파라미터를 쓴다', () => {
    expect(ours.w).toEqual([...DEFAULT_W])
    expect([...reference.parameters.w]).toEqual([...DEFAULT_W])
  })

  it(`무작위 등급 시퀀스 ${SEQUENCE_COUNT.toLocaleString('en-US')}개에서 S, D, 다음 간격이 ${TOLERANCE} 이내로 일치한다`, () => {
    const rng = makeRng(SEED)
    let maxStabilityError = 0
    let maxDifficultyError = 0
    const intervalMismatches: string[] = []

    for (let n = 0; n < SEQUENCE_COUNT; n += 1) {
      const steps = makeSequence(rng)
      const mine = runOurs(ours, steps)
      const theirs = runReference(reference, steps)

      const sError = Math.abs(mine.stability - theirs.stability)
      const dError = Math.abs(mine.difficulty - theirs.difficulty)

      if (sError >= TOLERANCE || dError >= TOLERANCE) {
        throw new Error(
          `시퀀스 ${n} 에서 어긋남\n` +
            `  단계: ${JSON.stringify(steps)}\n` +
            `  우리 S=${mine.stability} D=${mine.difficulty}\n` +
            `  ts-fsrs S=${theirs.stability} D=${theirs.difficulty}\n` +
            `  차이 S=${sError} D=${dError}`
        )
      }
      maxStabilityError = Math.max(maxStabilityError, sError)
      maxDifficultyError = Math.max(maxDifficultyError, dError)

      const lastGap = steps[steps.length - 1].gap
      const myInterval = ours.nextInterval(0.9, mine.stability)
      const theirInterval = reference.next_interval(theirs.stability, lastGap)
      if (myInterval !== theirInterval) {
        intervalMismatches.push(
          `시퀀스 ${n}: 우리 ${myInterval}일, ts-fsrs ${theirInterval}일 (S=${mine.stability})`
        )
      }
    }

    expect(maxStabilityError).toBeLessThan(TOLERANCE)
    expect(maxDifficultyError).toBeLessThan(TOLERANCE)
    expect(intervalMismatches).toEqual([])
  })

  it('같은 날 두 번 기록해도 두 구현이 일치한다', () => {
    const rng = makeRng(SEED + 1)
    for (let n = 0; n < 2_000; n += 1) {
      const steps: Step[] = [
        { grade: randInt(rng, 1, 4) as Grade, gap: 0 },
        { grade: randInt(rng, 1, 4) as Grade, gap: 0 },
        { grade: randInt(rng, 1, 4) as Grade, gap: 0 },
        { grade: randInt(rng, 1, 4) as Grade, gap: randInt(rng, 1, 60) },
        { grade: randInt(rng, 1, 4) as Grade, gap: 0 },
      ]
      const mine = runOurs(ours, steps)
      const theirs = runReference(reference, steps)
      expect(Math.abs(mine.stability - theirs.stability)).toBeLessThan(TOLERANCE)
      expect(Math.abs(mine.difficulty - theirs.difficulty)).toBeLessThan(TOLERANCE)
    }
  })

  it("같은 날 '어려움' 을 눌러도 ts-fsrs 와 일치한다", () => {
    // 단기 수식의 마스크가 G >= 3 이 아니라 G >= 2 라는 것은 여기서만 드러난다.
    // 일반 시퀀스 테스트는 이 자리를 안 밟고 지나간다.
    for (const first of GRADES) {
      let mine = ours.nextState(null, 0, first)
      let theirs = reference.next_state(null, 0, first as TsGrade)

      for (let repeat = 0; repeat < 6; repeat += 1) {
        mine = ours.nextState(mine, 0, 2)
        theirs = reference.next_state(theirs, 0, 2 as TsGrade)
        expect(Math.abs(mine.stability - theirs.stability)).toBeLessThan(
          TOLERANCE
        )
        expect(Math.abs(mine.difficulty - theirs.difficulty)).toBeLessThan(
          TOLERANCE
        )
      }
    }
  })

  it('같은 날 네 등급을 각각 눌러도 일치한다', () => {
    for (const first of GRADES) {
      for (const second of GRADES) {
        const mine = ours.nextState(ours.nextState(null, 0, first), 0, second)
        const theirs = reference.next_state(
          reference.next_state(null, 0, first as TsGrade),
          0,
          second as TsGrade
        )
        expect(Math.abs(mine.stability - theirs.stability)).toBeLessThan(
          TOLERANCE
        )
        expect(Math.abs(mine.difficulty - theirs.difficulty)).toBeLessThan(
          TOLERANCE
        )
      }
    }
  })

  it('여러 목표 회상률에서 간격이 일치한다', () => {
    const rng = makeRng(SEED + 2)
    for (const dr of [0.7, 0.8, 0.85, 0.9, 0.94, 0.97]) {
      const referenceAtDr = new FSRSAlgorithm({ request_retention: dr })
      for (let n = 0; n < 500; n += 1) {
        const steps = makeSequence(rng)
        const mine = runOurs(ours, steps)
        const theirs = runReference(referenceAtDr, steps)
        expect(ours.nextInterval(dr, mine.stability)).toBe(
          referenceAtDr.next_interval(theirs.stability, steps[steps.length - 1].gap)
        )
      }
    }
  })

  it('망각 곡선과 간격 역함수가 ts-fsrs 와 일치한다', () => {
    const rng = makeRng(SEED + 3)
    for (let n = 0; n < 5_000; n += 1) {
      const stability = 0.01 + rng() * 3000
      const elapsed = randInt(rng, 0, 2000)
      expect(
        Math.abs(
          ours.retrievability(elapsed, stability) -
            reference.forgetting_curve(elapsed, stability)
        )
      ).toBeLessThan(TOLERANCE)
    }
    for (const dr of [0.7, 0.8, 0.9, 0.95, 0.99, 1]) {
      expect(
        Math.abs(
          ours.intervalModifier(dr) -
            new FSRSAlgorithm({ request_retention: dr }).interval_modifier
        )
      ).toBeLessThan(TOLERANCE)
    }
  })
})
