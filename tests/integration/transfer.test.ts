import { describe, expect, it } from 'vitest'
import type { GoalRow, ItemRow } from '../../src/db/types'
import {
  BackupFormatError,
  EXPORT_VERSION,
  parseBackup,
  toBackup,
  toCsv,
} from '../../src/lib/transfer'

function goal(id: string, name: string): GoalRow {
  return {
    id,
    name,
    horizon_kind: 'date',
    ready_at: '2026-10-18',
    hold_until: '2026-10-18',
    target_retention: 0.9,
    intensity: 'standard',
    min_reviews: 3,
    max_interval_days: null,
    post_goal_mode: 'archive',
    color: null,
    created_at: '2026-08-01T00:00:00.000Z',
    archived_at: null,
  }
}

function item(id: string, title: string, over: Partial<ItemRow> = {}): ItemRow {
  return {
    id,
    goal_id: null,
    title,
    memo: '',
    tags: '[]',
    created_at: '2026-08-01T00:00:00.000Z',
    first_studied_at: '2026-08-01',
    horizon_kind: null,
    ready_at: null,
    hold_until: null,
    target_retention: null,
    intensity: null,
    min_reviews: null,
    state: 'review',
    stability: 12.345,
    difficulty: 5,
    due: '2026-08-13',
    due_kind: 'normal',
    due_source: 'fsrs',
    last_review: '2026-08-01',
    reps: 2,
    lapses: 1,
    reps_since_goal: 2,
    goal_risk: null,
    archived_at: null,
    ...over,
  }
}

describe('내보내기와 가져오기', () => {
  it('내보낸 것을 그대로 다시 읽어들인다', () => {
    const backup = toBackup(
      {
        goals: [goal('g1', 'AWS SCS-C03')],
        items: [item('i1', 'AWS SCS-C03 1~10번 문제 풀이', { goal_id: 'g1' })],
        reviews: [],
        settings: { theme: 'dark' },
      },
      '2026-08-22T00:00:00.000Z'
    )
    const roundTripped = parseBackup(JSON.stringify(backup))
    expect(roundTripped).toEqual(backup)
    expect(roundTripped.version).toBe(EXPORT_VERSION)
  })

  it('빈 상태도 내보내고 읽어들인다', () => {
    const backup = toBackup(
      { goals: [], items: [], reviews: [], settings: {} },
      '2026-08-22T00:00:00.000Z'
    )
    expect(parseBackup(JSON.stringify(backup)).items).toEqual([])
  })

  it('읽을 수 없는 파일은 막는다', () => {
    expect(() => parseBackup('깨진 파일')).toThrow(BackupFormatError)
    expect(() => parseBackup('null')).toThrow(BackupFormatError)
    expect(() => parseBackup('{"a":1}')).toThrow(BackupFormatError)
  })

  it('더 새로운 버전의 파일은 막는다', () => {
    const future = JSON.stringify({
      version: EXPORT_VERSION + 1,
      goals: [],
      items: [],
      reviews: [],
    })
    expect(() => parseBackup(future)).toThrow(/업데이트/)
  })

  it('설정이 없어도 읽어들인다', () => {
    const text = JSON.stringify({
      version: 1,
      goals: [],
      items: [],
      reviews: [],
    })
    expect(parseBackup(text).settings).toEqual({})
  })
})

describe('CSV 내보내기', () => {
  it('사람이 읽는 열 이름으로 내보낸다', () => {
    const csv = toCsv(
      [item('i1', 'AWS SCS-C03 1~10번 문제 풀이', { goal_id: 'g1' })],
      [goal('g1', 'AWS SCS-C03')]
    )
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(
      '제목,메모,소속 목표,공부한 날,다음에 볼 날,지금까지 본 횟수,잊은 횟수,기억 지속력(일)'
    )
    expect(lines[1]).toBe(
      'AWS SCS-C03 1~10번 문제 풀이,,AWS SCS-C03,2026-08-01,2026-08-13,2,1,12.35'
    )
  })

  it('쉼표와 따옴표가 든 제목을 감싼다', () => {
    const csv = toCsv([item('i1', '가, 나 "다"')], [])
    expect(csv.split('\r\n')[1].startsWith('"가, 나 ""다""",')).toBe(true)
  })

  it('항목이 없으면 머리글만 나온다', () => {
    expect(toCsv([], []).split('\r\n')).toHaveLength(1)
  })
})

describe('앱에서 내보내고 다시 가져오기', () => {
  it('내보낸 파일을 그대로 가져오면 원래대로 돌아온다', async () => {
    const { resetRepositoryForTest } = await import('../../src/db')
    const { resetPlannerForTest, usePlanner } = await import(
      '../../src/store/planner'
    )
    const TODAY = '2026-10-01'

    resetRepositoryForTest()
    resetPlannerForTest()
    usePlanner.setState({
      ready: false,
      goals: [],
      items: [],
      reviews: [],
      today: TODAY,
    })
    await usePlanner.getState().load()
    usePlanner.getState().setToday(TODAY)

    const g = await usePlanner.getState().createGoal({
      name: '정보보안 개념 정리',
      horizon: { kind: 'window', readyAt: '2026-11-08', holdUntil: '2026-12-05' },
    })
    const created = await usePlanner.getState().addItem({
      title: '정보보안 개념 1~3',
      goalId: g.id,
    })
    await usePlanner.getState().rateItem(created.id, 3, { reviewedAt: TODAY })

    const before = usePlanner.getState()
    const backup = toBackup(
      {
        goals: before.goals,
        items: before.items,
        reviews: before.reviews,
        settings: {},
      },
      '2026-10-01T00:00:00.000Z'
    )
    const text = JSON.stringify(backup)

    // 전부 지운 뒤 파일만 가지고 되살린다.
    await usePlanner.getState().importAll({
      version: 1,
      exportedAt: '',
      goals: [],
      items: [],
      reviews: [],
      settings: {},
    })
    expect(usePlanner.getState().items).toHaveLength(0)

    await usePlanner.getState().importAll(parseBackup(text))
    usePlanner.getState().setToday(TODAY)

    const after = usePlanner.getState()
    expect(after.goals.map((x) => x.id)).toEqual(before.goals.map((x) => x.id))
    expect(after.items.map((x) => x.id)).toEqual(before.items.map((x) => x.id))
    expect(after.reviews.map((x) => x.id)).toEqual(
      before.reviews.map((x) => x.id)
    )
    expect(after.items[0].stability).toBeCloseTo(before.items[0].stability!, 12)
    expect(after.items[0].due).toBe(before.items[0].due)
  })
})
