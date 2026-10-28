import { BADGE_LABEL } from '../../lib/badge'

/**
 * 하루 분량 막대를 배지별로 쌓을 때 쓰는 색과 이름.
 *
 * 그림과 범례가 같은 곳을 봐야 색이 어긋나지 않는다. 컴포넌트 파일에 두면
 * 화면을 고칠 때마다 이 상수까지 다시 실려서 화면 갱신이 통째로 끊긴다.
 * 이름은 배지에서 가져온다. 여기 따로 적어 두면 배지 이름을 바꿀 때 범례만 남는다.
 */
export const LOAD_SERIES = [
  { key: 'easy' as const, name: BADGE_LABEL.easy, color: 'var(--easy-fg)' },
  { key: 'plain' as const, name: '그 외', color: 'var(--accent)' },
  { key: 'imp' as const, name: BADGE_LABEL.important, color: 'var(--imp-fg)' },
]
