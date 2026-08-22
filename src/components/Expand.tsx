import type { ReactNode } from 'react'

/** 접혀 있는 영역. 상세 설정, 고급, 목표 선택이 전부 이 모양을 쓴다. */
export function Expand({
  open,
  onToggle,
  label,
  hint,
  children,
}: {
  open: boolean
  onToggle: () => void
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-card border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-[13px] py-[10px] text-left"
      >
        <span className="flex h-[20px] w-[20px] flex-none items-center justify-center rounded-ctl border border-line-2 bg-surface text-[11px] text-text-2">
          {open ? '▾' : '▸'}
        </span>
        <span className="text-[13px] font-medium text-text">{label}</span>
        {hint ? (
          <span className="truncate text-[12px] text-text-3">{hint}</span>
        ) : null}
      </button>
      {open ? (
        <div className="border-t border-line px-[13px] py-[12px]">{children}</div>
      ) : null}
    </div>
  )
}
