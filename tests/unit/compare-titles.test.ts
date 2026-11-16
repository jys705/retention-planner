import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compareTitles } from '../../src/lib/domain'

const sorted = (titles: string[]) => [...titles].sort(compareTitles)

describe('제목 차례', () => {
  it('숫자 덩어리는 수로 견준다', () => {
    expect(sorted(['13장', '1장', '7장', '19장'])).toEqual(['1장', '7장', '13장', '19장'])
    expect(sorted(['101~110', '41~50', '161~170'])).toEqual(['41~50', '101~110', '161~170'])
    expect(sorted(['1~10번 2회', '1~10번 10회'])).toEqual(['1~10번 2회', '1~10번 10회'])
  })

  it('앞의 0 은 수를 바꾸지 않는다. 수가 같으면 짧게 적은 쪽이 앞이다', () => {
    expect(sorted(['010장', '9장', '10장'])).toEqual(['9장', '10장', '010장'])
    expect(compareTitles('07', '7')).toBeGreaterThan(0)
  })

  it('나머지는 글자 차례다. 앞부분이 같으면 짧은 것이 앞이다', () => {
    expect(sorted(['정보보안 개념', '가나다 문제', '가나'])).toEqual(['가나', '가나다 문제', '정보보안 개념'])
    expect(compareTitles('1장', '1장 요약')).toBeLessThan(0)
  })

  it('아주 긴 수도 자릿수로 견준다. 수로 바꾸다 넘치지 않는다', () => {
    expect(compareTitles('99999999999999999999', '100000000000000000000')).toBeLessThan(0)
  })

  it('늘 같은 차례를 낸다. 두 제목을 바꿔 견주면 부호만 바뀐다', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const ab = compareTitles(a, b)
        const ba = compareTitles(b, a)
        expect(Math.sign(ab) + Math.sign(ba)).toBe(0)
        if (a === b) expect(ab).toBe(0)
      })
    )
  })

  it('차례가 이어진다. a 가 b 앞이고 b 가 c 앞이면 a 가 c 앞이다', () => {
    const piece = fc.oneof(fc.constantFrom('장', '부', ' ', '~', '가', 'a'), fc.integer({ min: 0, max: 200 }).map(String))
    const title = fc.array(piece, { maxLength: 5 }).map((parts) => parts.join(''))
    fc.assert(
      fc.property(title, title, title, (a, b, c) => {
        const [x, y, z] = sorted([a, b, c])
        expect(compareTitles(x, y)).toBeLessThanOrEqual(0)
        expect(compareTitles(y, z)).toBeLessThanOrEqual(0)
        expect(compareTitles(x, z)).toBeLessThanOrEqual(0)
      })
    )
  })
})
