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
