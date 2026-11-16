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

  it('영문자로 끝나면 그 글자를 읽는 소리로 고른다', () => {
    // 내보낸 파일 이름: retention-planner.json 이에요, retention-planner.csv 예요.
    expect(josa('retention-planner-2026-11-16.json', '이에요', '예요')).toBe('이에요')
    expect(josa('retention-planner-2026-11-16.csv', '이에요', '예요')).toBe('예요')
    expect(josa('양자 컴퓨팅', '과', '와')).toBe('과')
    expect(josa('Rust', '과', '와')).toBe('와')
    expect(josa('SQL', '을', '를')).toBe('을')
    expect(josa('TCP 3-way handshake', '과', '와')).toBe('와')
  })

  it('닫는 괄호와 따옴표 너머 마지막 소리를 본다', () => {
    expect(josa('암호학 개론 2부 (블록 암호)', '과', '와')).toBe('와')
    expect(josa('운영체제 (9장)', '과', '와')).toBe('과')
    expect(josa('"해시 함수 2장"', '과', '와')).toBe('과')
    expect(josa('"파이썬 기초"', '과', '와')).toBe('와')
    expect(josa('해킹 기법 ', '과', '와')).toBe('과')
  })
})
