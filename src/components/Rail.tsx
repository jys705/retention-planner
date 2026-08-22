import type { ReactNode } from 'react'

/**
 * 숫자 레일.
 *
 * 화면을 세로로 둘로 나눈다. 왼쪽은 사용자가 쓴 말, 오른쪽은 앱이 계산한 숫자다.
 * 오른쪽은 늘 같은 열에 서고 등폭으로 찍혀서 장부처럼 줄이 맞는다.
 *
 * 테두리와 안쪽 여백을 폭에 포함시켜야 열 위치가 어긋나지 않는다.
 */
export function RailPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rail-panel w-[268px] flex-none pr-[18px]">{children}</div>
  )
}

export function RailRow({
  retention,
  due,
  goalName,
  goalColor,
}: {
  retention: string
  due: string
  goalName?: string | null
  goalColor?: string
}) {
  return (
    <div className="rail-panel num grid w-[268px] flex-none grid-cols-[52px_76px_1fr] items-center gap-[14px] pr-[18px]">
      <div className="text-right text-[13px] text-text">{retention}</div>
      <div className="text-right text-[12.5px] text-text-2">{due}</div>
      {/* 목표가 없어도 칸을 비우지 않는다. 비워 두면 그 자리가 무엇을 말하는지 안 보인다. */}
      <div className="flex min-w-0 items-center gap-[6px]">
        <span
          aria-hidden
          className="h-1 w-1 flex-none rounded-full"
          style={{ background: goalName ? (goalColor ?? 'var(--dot)') : 'var(--dot)' }}
        />
        <span className="truncate font-sans text-[12px] text-text-3">
          {goalName ?? '없음'}
        </span>
      </div>
    </div>
  )
}
