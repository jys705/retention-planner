import { describe, expect, it } from 'vitest'
import { josa } from '../../src/lib/format'
describe('조사', () => {
  it('S-186 숫자로 끝나는 제목의 조사를 소리대로 고른다', () => {
    expect(josa('오늘 것 1', '을', '를')).toBe('을')
    expect(josa('1~10번 문제', '을', '를')).toBe('를')
    expect(josa('1~10번', '을', '를')).toBe('을')
    expect(josa('연습문제 2', '을', '를')).toBe('를')
    expect(josa('3장', '을', '를')).toBe('을')
    expect(josa('5', '을', '를')).toBe('를')
    expect(josa('6', '을', '를')).toBe('을')
    // 한글은 그대로.
    expect(josa('정보보안', '을', '를')).toBe('을')
    expect(josa('개념 정리', '을', '를')).toBe('를')
    // 등급 이름.
    expect(josa('다시', '으로', '로')).toBe('로')
    expect(josa('무난함', '으로', '로')).toBe('으로')
  })
})
