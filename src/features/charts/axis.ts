/**
 * 기억 곡선 y축의 아래쪽 끝.
 *
 * 0% 부터 그릴 필요는 없다. 아래를 잘라내면 목표 기억률 기준선에 톱니가 닿는 게
 * 훨씬 잘 읽힌다. 다만 **잘라낸 값으로 눌러 담으면 안 된다.**
 *
 * 망각 곡선은 시간이 지나면 0 으로 수렴한다. 기본 파라미터로 계산하면 기억률이
 * 60% 가 되는 시점은 기억 지속력의 약 27배다. 새 항목이면 두 달이 채 안 된다.
 * 한동안 손을 놓았다 돌아오는 건 플래너에서 흔한 일이라 반드시 일어난다.
 * 그래서 하한을 고정하지 않고 데이터에 따라 열어 준다.
 */
export const DEFAULT_AXIS_FLOOR = 0.6

export function yAxisMin(
  values: readonly number[],
  floor = DEFAULT_AXIS_FLOOR
): number {
  if (values.length === 0) return floor
  const lowest = Math.min(...values)
  const opened = Math.floor((lowest - 0.05) * 10) / 10
  return Math.max(0, Math.min(floor, opened))
}

/** 축에 눈금을 몇 개 놓을지. 10% 단위로 떨어지게 만든다. */
export function yAxisTicks(min: number): number[] {
  const ticks: number[] = []
  for (let value = Math.round(min * 10) / 10; value <= 1.0001; value += 0.1) {
    ticks.push(Math.round(value * 10) / 10)
  }
  if (ticks[ticks.length - 1] !== 1) ticks.push(1)
  return ticks
}
