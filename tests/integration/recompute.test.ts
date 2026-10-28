import { afterEach, describe, expect, it } from 'vitest'
import type { Grade } from '../../src/core/fsrs/types'
import type {
  DueKind,
  DueSource,
  GoalRisk,
  GoalRow,
  ItemRow,
} from '../../src/db/types'
import { freezeToday, nowIso } from '../../src/lib/clock'
import {
  selectTodayItems,
  settlePatches,
  usePlanner,
} from '../../src/store/planner'
import { makeRng, randInt } from '../golden/rng'
import { aGoal, anItem, setupApp, shift, teardownApp } from '../scenarios/harness'

/**
 * 다시 셈하기는 한 번에 제자리에 닿아야 한다.
 *
 * 평가 하나 없이 다시 셈하는 일은 하루에도 여러 번 있다. 앱을 켤 때, 목표나 설정을
 * 고칠 때, 다른 줄을 평가할 때다. 그때마다 날짜나 배지가 바뀌면 사람은 아무것도 안
 * 했는데 목록이 움직인다. 목표 시점 다섯 가지, 준비 여유 0 에서 3, 하루 최대 개수
 * 3, 5, 20 을 모두 돌린다. 날마다 다시 셈한 뒤 오늘 목록을 평가하고 다음 날로 넘어간다.
 */
const TODAY = '2026-11-10'
const GOAL_KINDS = ['date', 'rest', 'window', 'open', 'maintain'] as const
const BUFFERS = [0, 1, 2, 3]
const CAPS = [3, 5, 20]
const SEEDS = 3
const DAYS = 6
/** 다시 를 자주 넣는다. 다음 날 목록에 선 채로 한 번으로 모자란 것이 그렇게 생긴다. */
const GRADES: Grade[] = [1, 1, 2, 3, 3, 4]
const KINDS: DueKind[] = [
  'normal',
  'session_fill',
  'deadline_pull',
  'final_check',
  'hold',
]
const SOURCES: DueSource[] = ['fsrs', 'spread', 'replan']
const RISKS: (GoalRisk | null)[] = [null, 'safe', 'at_risk']

afterEach(teardownApp)

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[randInt(rng, 0, list.length - 1)]
}

function goalOf(
  kind: (typeof GOAL_KINDS)[number],
  rng: () => number
): GoalRow {
  const ready = shift(TODAY, randInt(rng, 1, 8))
  const common = {
    id: 'g1',
    intensity: pick(rng, ['easy', 'standard', 'focus'] as const),
    min_reviews: randInt(rng, 1, 4),
  }
  if (kind === 'open') return aGoal({ ...common, horizon_kind: 'open' })
  if (kind === 'window') {
    return aGoal({
      ...common,
      horizon_kind: 'window',
      ready_at: ready,
      hold_until: shift(ready, randInt(rng, 1, 5)),
    })
  }
  return aGoal({
    ...common,
    horizon_kind: 'date',
    ready_at: ready,
    hold_until: ready,
    goal_day: kind === 'rest' ? 'rest' : null,
    post_goal_mode: kind === 'maintain' ? 'maintain' : 'archive',
  })
}

/**
 * 항목 여섯. 저장된 갈래와 출처와 위험도 아무렇게나 둔다. 가져온 백업이나 예전
 * 판이 남긴 값처럼 어떤 조합에서 시작해도 한 번 셈하면 제자리여야 한다.
 */
function itemsOf(rng: () => number): ItemRow[] {
  return Array.from({ length: 6 }, (_, i) =>
    anItem({
      id: `i${i}`,
      title: `항목 ${i + 1}`,
      goal_id: 'g1',
      last_review: shift(TODAY, -randInt(rng, 1, 20)),
      stability: 0.3 + rng() * 39.7,
      difficulty: 2 + rng() * 7,
      reps_since_goal: randInt(rng, 0, 3),
      due: shift(TODAY, randInt(rng, -5, 25)),
      due_kind: pick(rng, KINDS),
      due_source: pick(rng, SOURCES),
      goal_risk: pick(rng, RISKS),
    })
  )
}

/** 다시 셈하기가 고칠 수 있는 것 전부. */
function snapshot() {
  const { items, planned } = usePlanner.getState()
  return {
    items: items.map((i) => ({
      id: i.id,
      state: i.state,
      archived: i.archived_at !== null,
      due: i.due,
      kind: i.due_kind,
      source: i.due_source,
      risk: i.goal_risk,
    })),
    planned,
  }
}

describe('다시 셈하기', () => {
  for (const kind of GOAL_KINDS) {
    it(`${kind} 목표: 한 번 셈한 결과에 다시 셈해도 아무것도 안 바뀐다`, async () => {
      for (const buffer of BUFFERS) {
        for (const cap of CAPS) {
          for (let seed = 1; seed <= SEEDS; seed += 1) {
            const world = `${kind} 여유 ${buffer} 상한 ${cap} 시드 ${seed}`
            const rng = makeRng(seed * 7919 + buffer * 31 + cap)
            await setupApp(TODAY, {
              goals: [goalOf(kind, rng)],
              items: itemsOf(rng),
              settings: { bufferDays: String(buffer), dailyCap: String(cap) },
            })

            for (let day = 0; day < DAYS; day += 1) {
              const today = shift(TODAY, day)
              if (day > 0) {
                freezeToday(today)
                usePlanner.getState().setToday(today)
                await usePlanner.getState().recomputeAll()
              }

              // 되풀이가 흔들림을 덮고 있으면 안 된다. 한 번만 셈해도 고칠 것이 없어야 한다.
              const { items, goals, settings, planned } = usePlanner.getState()
              const once = settlePatches(items, goals, settings, today, nowIso(), {
                maxRounds: 1,
              })
              expect([...once.patches], `${world} ${today}`).toEqual([])
              expect(once.planned, `${world} ${today}`).toEqual(planned)

              const before = snapshot()
              await usePlanner.getState().recomputeAll()
              expect(snapshot(), `${world} ${today}`).toEqual(before)

              for (const item of selectTodayItems(usePlanner.getState())) {
                await usePlanner.getState().rateItem(item.id, pick(rng, GRADES))
              }
            }
          }
        }
      }
    })
  }
})

describe('목표 없는 항목 흔들기', () => {
  it('한 번 옮긴 날짜에서 더 걸어 나가지 않는다', async () => {
    // FSRS 가 열흘 뒤로 잡은 것이다. 그날과 앞뒤에 다른 목표 것이 서 있어서 덜 붐비는
    // 다음 날로 한 칸 옮긴다. 흔드는 폭이 하루라 거기까지다. 옮긴 날을 가운데 두고
    // 또 흔들면 그 다음 날이 비었다는 이유로 다시 셈할 때마다 하루씩 더 간다.
    const fsrsDay = shift(TODAY, 10)
    const neighbor = (id: string, due: string) =>
      anItem({
        id,
        title: `다른 목표 것 ${id}`,
        goal_id: 'g1',
        last_review: TODAY,
        stability: 300,
        reps_since_goal: 3,
        due,
      })
    await setupApp(TODAY, {
      goals: [
        aGoal({
          id: 'g1',
          horizon_kind: 'date',
          ready_at: shift(TODAY, 90),
          hold_until: shift(TODAY, 90),
        }),
      ],
      items: [
        anItem({
          id: 'x',
          title: '목표 없는 것',
          last_review: TODAY,
          stability: 10,
          due: fsrsDay,
        }),
        neighbor('a1', shift(fsrsDay, -1)),
        neighbor('a2', shift(fsrsDay, -1)),
        neighbor('a3', shift(fsrsDay, -1)),
        neighbor('b1', fsrsDay),
        neighbor('b2', fsrsDay),
        neighbor('c1', shift(fsrsDay, 1)),
      ],
    })

    for (let n = 0; n < 3; n += 1) {
      const x = usePlanner.getState().items.find((i) => i.id === 'x')
      expect(x?.due).toBe(shift(fsrsDay, 1))
      expect(x?.due_source).toBe('spread')
      await usePlanner.getState().recomputeAll()
    }
  })
})
