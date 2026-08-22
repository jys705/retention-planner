import { describe, expect, it } from 'vitest'
import type { ItemRow } from '../../src/db/types'
import { commonTitlePrefix, splitTitle } from '../../src/lib/domain'
import { findGroupSuggestion } from '../../src/features/today/suggestion'

function item(id: string, title: string, goalId: string | null = null): ItemRow {
  return {
    id,
    goal_id: goalId,
    title,
    memo: '',
    tags: '[]',
    created_at: '2026-10-01T00:00:00.000Z',
    first_studied_at: '2026-10-01',
    horizon_kind: null,
    ready_at: null,
    hold_until: null,
    target_retention: null,
    intensity: null,
    min_reviews: null,
    state: 'review',
    stability: 2.3,
    difficulty: 5,
    due: '2026-10-03',
    due_kind: 'normal',
    due_source: 'fsrs',
    last_review: '2026-10-01',
    reps: 1,
    lapses: 0,
    reps_since_goal: 1,
    goal_risk: null,
    archived_at: null,
  }
}

describe('제목에서 공통 앞부분 뽑기', () => {
  // 지시서의 검증표를 그대로 옮긴다.
  it('여러 제목이 앞에서부터 공유하는 부분을 찾는다', () => {
    expect(
      commonTitlePrefix([
        'AWS SCS-C03 1~10번 문제 풀이',
        'AWS SCS-C03 11~20번 문제 풀이',
      ])
    ).toBe('AWS SCS-C03')
    expect(commonTitlePrefix(['정보보안 개념 1~3', '정보보안 개념 4~6'])).toBe(
      '정보보안 개념'
    )
    expect(
      commonTitlePrefix(['모의고사 1회차 오답', '모의고사 2회차 오답'])
    ).toBe('모의고사')
    expect(commonTitlePrefix(['네트워크 정리', '보안 정리'])).toBe('')
  })

  it('미리 정해두지 않은 번호 표기에도 공통 부분을 찾는다', () => {
    // 한 제목만 보고 정규식으로 짐작하면 '회' 를 몰라서 놓친다.
    expect(commonTitlePrefix(['모의고사 1회 오답', '모의고사 2회 오답'])).toBe(
      '모의고사'
    )
    expect(commonTitlePrefix(['영어 단어 day1', '영어 단어 day2'])).toBe(
      '영어 단어'
    )
  })

  it('뒤쪽 공통 부분은 접두사가 아니다', () => {
    expect(
      commonTitlePrefix(['1~10번 문제 풀이', '11~20번 문제 풀이'])
    ).toBe('')
  })

  it('한 글자거나 비면 묶지 않는다', () => {
    expect(commonTitlePrefix(['가 나', '가 다'])).toBe('')
    expect(commonTitlePrefix([])).toBe('')
  })

  it('제목이 하나뿐이면 그 제목 전체가 공통 부분이다', () => {
    expect(commonTitlePrefix(['쿠버네티스 보안 심화'])).toBe(
      '쿠버네티스 보안 심화'
    )
  })

  it('제목을 세 조각으로 가른다', () => {
    expect(splitTitle('AWS SCS-C03 1~10번 문제 풀이')).toEqual({
      pre: 'AWS SCS-C03 ',
      num: '1~10번',
      post: ' 문제 풀이',
    })
  })
})

describe('목표 묶기 제안', () => {
  it('같은 앞부분이 3개 이상 쌓이면 제안한다', () => {
    const suggestion = findGroupSuggestion(
      [
        item('a', 'AWS SCS-C03 1~10번 문제 풀이'),
        item('b', 'AWS SCS-C03 11~20번 문제 풀이'),
        item('c', 'AWS SCS-C03 21~30번 문제 풀이'),
      ],
      []
    )
    expect(suggestion).not.toBeNull()
    expect(suggestion!.stem).toBe('AWS SCS-C03')
    expect(suggestion!.itemIds).toHaveLength(3)
  })

  it('두 개까지는 제안하지 않는다', () => {
    expect(
      findGroupSuggestion(
        [
          item('a', 'AWS SCS-C03 1~10번 문제 풀이'),
          item('b', 'AWS SCS-C03 11~20번 문제 풀이'),
        ],
        []
      )
    ).toBeNull()
  })

  it('이미 목표에 묶인 항목은 후보에서 뺀다', () => {
    const suggestion = findGroupSuggestion(
      [
        item('a', 'AWS SCS-C03 1~10번 문제 풀이', 'goal_1'),
        item('b', 'AWS SCS-C03 11~20번 문제 풀이', 'goal_1'),
        item('c', 'AWS SCS-C03 21~30번 문제 풀이', 'goal_1'),
      ],
      []
    )
    expect(suggestion).toBeNull()
  })

  it('일부만 묶여 있으면 안 묶인 것만 센다', () => {
    const suggestion = findGroupSuggestion(
      [
        item('a', 'AWS SCS-C03 1~10번 문제 풀이', 'goal_1'),
        item('b', 'AWS SCS-C03 11~20번 문제 풀이'),
        item('c', 'AWS SCS-C03 21~30번 문제 풀이'),
      ],
      []
    )
    expect(suggestion).toBeNull()
  })

  it('한 번 무시한 앞부분으로는 다시 제안하지 않는다', () => {
    const items = [
      item('a', 'AWS SCS-C03 1~10번 문제 풀이'),
      item('b', 'AWS SCS-C03 11~20번 문제 풀이'),
      item('c', 'AWS SCS-C03 21~30번 문제 풀이'),
    ]
    expect(findGroupSuggestion(items, ['AWS SCS-C03'])).toBeNull()
  })

  it('보관한 항목은 세지 않는다', () => {
    const items = [
      { ...item('a', 'AWS SCS-C03 1~10번 문제 풀이'), archived_at: '2026-10-02' },
      item('b', 'AWS SCS-C03 11~20번 문제 풀이'),
      item('c', 'AWS SCS-C03 21~30번 문제 풀이'),
    ]
    expect(findGroupSuggestion(items, [])).toBeNull()
  })

  it('가장 많이 쌓인 앞부분 하나만 고른다', () => {
    const suggestion = findGroupSuggestion(
      [
        item('a', 'AWS SCS-C03 1~10번 문제 풀이'),
        item('b', 'AWS SCS-C03 11~20번 문제 풀이'),
        item('c', 'AWS SCS-C03 21~30번 문제 풀이'),
        item('d', 'AWS SCS-C03 31~40번 문제 풀이'),
        item('e', '정보보안기사 1회차 오답'),
        item('f', '정보보안기사 2회차 오답'),
        item('g', '정보보안기사 3회차 오답'),
      ],
      []
    )
    expect(suggestion!.stem).toBe('AWS SCS-C03')
    expect(suggestion!.itemIds).toHaveLength(4)
  })
})
