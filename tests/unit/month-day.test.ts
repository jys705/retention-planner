import { describe, expect, it } from 'vitest'
import { daysLeftLabel, dueLabel, fullDate, horizonLabel, intervalLabel, monthDay } from '../../src/lib/format'

describe('날짜 글', () => {
  it('월과 일 사이는 줄을 바꾸지 않는 빈칸이다', () => {
    // 좁은 칸의 문장에서 '다음은 1월' / '8일에 올라옵니다' 처럼 날짜가 갈리지 않는다.
    expect(monthDay('2027-01-08')).toBe('1월 8일')
    expect(monthDay('2026-12-25')).toBe('12월 25일')
    expect(monthDay('2027-01-08')).not.toContain(' ')
  })

  it("'N일 뒤', 'N일 지남', 'N일 남음' 도 한 덩어리로 붙인다", () => {
    // 좁은 칸의 문장에서 '13일' / '뒤에 올라옵니다' 처럼 갈리지 않는다.
    expect(dueLabel('2026-11-16', '2026-11-29')).toBe('13일\u00a0뒤')
    expect(dueLabel('2026-11-16', '2026-11-14')).toBe('2일\u00a0지남')
    expect(intervalLabel(7)).toBe('7일\u00a0뒤')
    expect(daysLeftLabel('2026-11-16', '2026-11-20')).toBe('4일\u00a0남음')
    // 가까운 날은 낱말 하나라 그대로다.
    expect(dueLabel('2026-11-16', '2026-11-17')).toBe('내일')
  })

  it('날짜를 품은 다른 글도 같은 날짜 덩어리를 쓴다', () => {
    expect(fullDate('2026-11-16')).toBe('11월 16일 월요일')
    expect(dueLabel('2026-11-16', '2027-01-08')).toBe('1월 8일')
    expect(horizonLabel('window', '2026-11-08', '2026-12-05')).toBe('11월 8일 ~ 12월 5일')
  })
})
