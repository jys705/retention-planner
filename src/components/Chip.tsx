import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-ctl border px-[11px] py-[6px] text-[13px] transition-colors',
        active
          ? 'border-accent bg-accent-soft font-semibold text-accent'
          : 'border-line-2 bg-surface text-text-2 hover:bg-hover'
      )}
    >
      {children}
    </button>
  )
}

/**
 * 누를 수 없는 칩. 이미 버튼 안에 들어가는 자리에 쓴다.
 * 버튼 안에 버튼을 넣으면 안 되는 마크업이 된다.
 */
export function ChipLabel({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-ctl border border-line-2 bg-surface px-[11px] py-[6px] text-[13px] text-text-2">
      {children}
    </span>
  )
}

export function Hint({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="inline-flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full border border-line-2 text-[9.5px] leading-none text-text-3"
    >
      ?
    </span>
  )
}
