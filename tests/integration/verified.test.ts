import { describe, expect, it } from 'vitest'
import { FSRSAlgorithm } from 'ts-fsrs'
import { defaultFsrs, Fsrs6 } from '../../src/core/fsrs/fsrs6'
import { INIT_S_MAX, S_MAX } from '../../src/core/fsrs/params'
import { GRADES } from '../../src/core/fsrs/types'
import { resetRepositoryForTest } from '../../src/db'
import { addDays } from '../../src/lib/date'
import { GRADE_HELP_THRESHOLD } from '../../src/lib/settings'
import { resetPlannerForTest, usePlanner } from '../../src/store/planner'

const TODAY = '2026-08-22'

describe('등급 설명 축약', () => {
  it('평가 20회를 넘기면 설명이 짧은 쪽으로 바뀐다', async () => {
    resetRepositoryForTest()
    resetPlannerForTest()
    usePlanner.setState({
      ready: false,
      goals: [],
      items: [],
      reviews: [],
      planned: [],
      today: TODAY,
    })
    await usePlanner.getState().load()
    usePlanner.getState().setToday(TODAY)

    expect(usePlanner.getState().settings.ratingCount).toBe(0)
    expect(
      usePlanner.getState().settings.ratingCount < GRADE_HELP_THRESHOLD
    ).toBe(true)

    const item = await usePlanner.getState().addItem({
      title: '스무 번 넘게 볼 항목',
      firstStudiedAt: addDays(TODAY, -40),
    })

    let cursor = addDays(TODAY, -40)
    for (let i = 0; i < 25; i += 1) {
      cursor = addDays(cursor, 1)
      usePlanner.getState().setToday(cursor)
      await usePlanner.getState().rateItem(item.id, 3, { reviewedAt: cursor })
    }

    // 실제로 25회를 세었는지부터 확인한다.
    expect(usePlanner.getState().settings.ratingCount).toBe(25)
    // 항목을 적을 때의 첫 평가가 한 줄 더 있다. 그건 사용자가 누른 것이 아니라
    // 세는 값(ratingCount)에는 안 들어간다.
    expect(usePlanner.getState().reviews).toHaveLength(26)
    // 그리고 그 값이 축약 조건을 넘겼는지.
    expect(
      usePlanner.getState().settings.ratingCount < GRADE_HELP_THRESHOLD
    ).toBe(false)
  })

  it('세는 값이 저장소에도 남는다', async () => {
    const before = usePlanner.getState().settings.ratingCount
    expect(before).toBeGreaterThan(GRADE_HELP_THRESHOLD)

    usePlanner.setState({
      ready: false,
      goals: [],
      items: [],
      reviews: [],
      planned: [],
    })
    await usePlanner.getState().load()
    expect(usePlanner.getState().settings.ratingCount).toBe(before)
  })
})

describe('단기 수식 기본값', () => {
  it('우리 엔진과 ts-fsrs 가 같은 값을 쓴다', () => {
    expect(defaultFsrs.enableShortTerm).toBe(true)
    expect(new FSRSAlgorithm({}).parameters.enable_short_term).toBe(true)
  })

  it('앱이 쓰는 엔진은 기본 설정 그대로다', () => {
    // 앱의 모든 경로가 defaultFsrs 를 쓴다. 골든 테스트가 대조하는 것과 같은 인스턴스다.
    expect(defaultFsrs.enableShortTerm).toBe(new Fsrs6().enableShortTerm)
    expect(defaultFsrs.w).toEqual(new Fsrs6().w)
  })

  it('꺼두면 같은 날 재기록이 다르게 계산된다', () => {
    const off = new Fsrs6({ enableShortTerm: false })
    const state = defaultFsrs.nextState(null, 0, 3)

    // 켜져 있으면 단기 수식, 꺼져 있으면 성공 시 수식을 탄다.
    // '쉬움' 에서 갈린다. 켜진 쪽은 기억 지속력을 올리고 꺼진 쪽은 그대로 둔다.
    expect(defaultFsrs.nextState(state, 0, 4).stability).toBeGreaterThan(
      off.nextState(state, 0, 4).stability
    )

    // '어려움' 은 우연히 같은 값이 나온다. 켜진 쪽은 배수를 1로 막고,
    // 꺼진 쪽은 막 본 직후라 기억률이 1이어서 증가폭이 0이 된다.
    expect(defaultFsrs.nextState(state, 0, 2).stability).toBe(
      off.nextState(state, 0, 2).stability
    )
  })
})

describe('첫 기억 지속력의 상한', () => {
  it('파라미터를 크게 넣어도 잘려서 들어간다', () => {
    const huge = Array.from({ length: 21 }, () => 99_999)
    const engine = new Fsrs6({ w: huge })
    for (const grade of GRADES) {
      const s = engine.initStability(grade)
      expect(s).toBeLessThanOrEqual(INIT_S_MAX)
      expect(s).toBeLessThanOrEqual(S_MAX)
      expect(s).toBeGreaterThanOrEqual(0.1)
    }
  })

  it('음수나 이상한 값을 넣어도 하한 아래로 안 간다', () => {
    const weird = Array.from({ length: 21 }, () => -5)
    const engine = new Fsrs6({ w: weird })
    for (const grade of GRADES) {
      expect(engine.initStability(grade)).toBeGreaterThanOrEqual(0.1)
    }
  })

  it('개수가 안 맞는 파라미터는 기본값으로 되돌린다', () => {
    expect(new Fsrs6({ w: [1, 2, 3] }).w).toEqual(new Fsrs6().w)
  })

  it('잘린 파라미터로도 기억 상태가 범위 안에 머문다', () => {
    const engine = new Fsrs6({
      w: Array.from({ length: 21 }, () => 99_999),
    })
    let state = engine.nextState(null, 0, 3)
    for (let i = 0; i < 20; i += 1) {
      state = engine.nextState(state, 5, ((i % 4) + 1) as 1 | 2 | 3 | 4)
      expect(state.stability).toBeGreaterThanOrEqual(0.001)
      expect(state.stability).toBeLessThanOrEqual(S_MAX)
      expect(state.difficulty).toBeGreaterThanOrEqual(1)
      expect(state.difficulty).toBeLessThanOrEqual(10)
    }
  })
})
