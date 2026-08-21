export type HorizonMode = 'open' | 'date' | 'window'

/** 목표 시점의 세 가지 성격. 이름만으로는 안 통해서 한 줄 설명을 붙여 둔다. */
export const MODE_META: { mode: HorizonMode; name: string; desc: string }[] = [
  { mode: 'open', name: '정해두지 않음', desc: '계속 기억하고 싶어요' },
  { mode: 'date', name: '정확한 날짜', desc: '시험처럼 날짜가 확실해요' },
  { mode: 'window', name: '대략', desc: '언제쯤인지만 알아요' },
]
