import { percent } from '../../lib/format'

/**
 * 지금 기억률이 목표까지 얼마나 왔는지.
 *
 * 0부터 100까지 그리면 83% 와 90% 가 붙어 보여서 나아가는 느낌이 안 난다.
 * 기억률은 실제로 50 아래로 잘 안 내려가므로 50 부터 그린다.
 */
export function RetentionBar({
  now,
  target,
  when = '지금',
}: {
  now: number
  target: number
  /** 이 값이 언제의 것인지. 마친 목표는 목표한 날의 값을 그린다. */
  when?: string
}) {
  const FLOOR = 0.5
  const at = (v: number) =>
    Math.min(100, Math.max(0, ((v - FLOOR) / (1 - FLOOR)) * 100))
  return (
    <div
      className="relative h-[6px] w-full overflow-hidden rounded-full bg-line-2"
      role="img"
      aria-label={`목표 ${percent(target)} 가운데 ${when} ${percent(now)}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-accent"
        style={{ width: `${at(now)}%` }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 w-[2px] bg-text-3"
        style={{ left: `${at(target)}%` }}
      />
    </div>
  )
}
