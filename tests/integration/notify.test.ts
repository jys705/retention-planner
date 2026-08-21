import { describe, expect, it } from 'vitest'
import { shouldNotify } from '../../src/lib/notify'

function at(hour: number, minute: number): Date {
  return new Date(2026, 7, 22, hour, minute, 0)
}

describe('알림을 보낼 때', () => {
  it('정해둔 시각을 지나면 보낸다', () => {
    expect(shouldNotify(at(21, 0), '21:00', null, '2026-08-22')).toBe(true)
    expect(shouldNotify(at(23, 30), '21:00', null, '2026-08-22')).toBe(true)
  })

  it('시각 전에는 보내지 않는다', () => {
    expect(shouldNotify(at(20, 59), '21:00', null, '2026-08-22')).toBe(false)
    expect(shouldNotify(at(9, 0), '21:00', null, '2026-08-22')).toBe(false)
  })

  it('하루에 한 번만 보낸다', () => {
    expect(shouldNotify(at(22, 0), '21:00', '2026-08-22', '2026-08-22')).toBe(
      false
    )
    expect(shouldNotify(at(22, 0), '21:00', '2026-08-21', '2026-08-22')).toBe(
      true
    )
  })

  it('알림을 끄면 보내지 않는다', () => {
    expect(shouldNotify(at(23, 0), null, null, '2026-08-22')).toBe(false)
  })

  it('시각이 이상하면 보내지 않는다', () => {
    expect(shouldNotify(at(23, 0), '이상함', null, '2026-08-22')).toBe(false)
  })
})
