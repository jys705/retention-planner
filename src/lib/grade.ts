import type { Grade } from '../core/fsrs/types'

/**
 * 자가 평가 네 단계.
 *
 * 오늘 화면, 항목 추가, 평가 이력이 같은 이름과 같은 뜻풀이를 써야 한다.
 * 기준이 없으면 다들 '쉬움' 을 누르므로 뜻을 늘 붙여 둔다.
 */
export const GRADE_META: {
  grade: Grade
  name: string
  hint: string
  color: string
}[] = [
  {
    grade: 1,
    name: '다시',
    hint: '거의 기억나지 않아 처음부터 다시 봤어요',
    color: 'var(--g1)',
  },
  {
    grade: 2,
    name: '어려움',
    hint: '떠올리는 데 오래 걸렸고 여러 번 막혔어요',
    color: 'var(--g2)',
  },
  {
    grade: 3,
    name: '무난함',
    hint: '무난하게 기억났어요',
    color: 'var(--g3)',
  },
  {
    grade: 4,
    name: '쉬움',
    hint: '볼 필요도 없이 바로 나왔어요',
    color: 'var(--g4)',
  },
]

/** 짧게 줄인 기준. 평가에 익숙해진 뒤에 이걸로 바꾼다. */
export const GRADE_HINT_SHORT =
  '다시: 거의 기억 안 남 | 어려움: 여러 번 막힘 | 무난함: 무난하게 기억남 | 쉬움: 바로 나옴'

export function gradeName(grade: number): string {
  return GRADE_META.find((m) => m.grade === grade)?.name ?? ''
}
