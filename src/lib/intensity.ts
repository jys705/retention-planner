import type { Intensity } from '../db/types'

/**
 * 복습 강도 네 단계.
 *
 * 항목 추가, 항목 편집, 목표 상세, 설정이 모두 같은 이름과 같은 설명을 써야 한다.
 * 화면마다 따로 적어 두면 한 곳만 고쳐지고 나머지가 남는다.
 */
export const INTENSITY_META: {
  key: Intensity
  name: string
  desc: string
}[] = [
  { key: 'easy', name: '여유', desc: '가끔만 볼게요' },
  { key: 'standard', name: '표준', desc: '알맞게 볼게요' },
  { key: 'focus', name: '집중', desc: '자주 볼게요' },
  { key: 'max', name: '최대', desc: '아주 자주 볼게요' },
]

export function intensityName(intensity: Intensity | number): string {
  return INTENSITY_META.find((m) => m.key === intensity)?.name ?? '표준'
}
