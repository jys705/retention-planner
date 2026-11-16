import type { CurvePoint } from '../../core/simulate/project'
import { toEpochDay, type DateOnly } from '../../lib/date'

/** 그림에 넘기는 점 하나. 가로축은 날짜를 날 수로 바꾼 값이다. */
export interface CurveRow {
  x: number
  /** 지나온 날의 기억률. 실선과 옅은 바탕으로 그린다. */
  past: number | null
  /** 앞날의 예상 기억률. 점선으로 그린다. */
  future: number | null
  /** 복습한 날과 복습할 날에 찍는 점. */
  mark: number | null
}

/**
 * 곡선을 그릴 점들.
 *
 * 복습한 날은 같은 날짜에 점을 둘 둔다. 복습 바로 전 값과 직후 값이다. 그래야 튀는
 * 자리가 세로로 곧게 선다. 날짜 사이를 부드럽게 이으면 복습하기도 전에 기억이 오르는
 * 것처럼 보인다.
 * 실선은 오늘에서 끝나고 점선은 오늘에서 시작한다. 오늘 볼 차례면 점선이 오늘에서 튄다.
 */
export function curveRows(curve: readonly CurvePoint[], today: DateOnly): CurveRow[] {
  const now = toEpochDay(today)
  const rows: CurveRow[] = []
  for (const point of curve) {
    const x = toEpochDay(point.date)
    const jumps = point.reviewed && point.before !== point.retention
    const mark = point.reviewed ? point.retention : null
    if (x < now) {
      if (jumps) rows.push({ x, past: point.before, future: null, mark: null })
      rows.push({ x, past: point.retention, future: null, mark })
    } else if (x === now) {
      if (jumps) rows.push({ x, past: point.before, future: null, mark: null })
      rows.push({ x, past: point.retention, future: point.retention, mark })
      if (point.planned !== null) {
        rows.push({ x, past: null, future: point.planned, mark: point.planned })
      }
    } else {
      if (jumps) rows.push({ x, past: null, future: point.before, mark: null })
      rows.push({ x, past: null, future: point.retention, mark })
    }
  }
  return rows
}
