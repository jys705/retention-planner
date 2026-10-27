import type { ReactNode } from 'react'

/**
 * 오늘 목록 위에 잠깐 서는 판.
 *
 * 목표한 날 안내, 방금 한 일, 마친 목표 알림이 같은 테를 쓴다. 판마다 따로 그리면
 * 여백과 모서리가 조금씩 어긋나서 서로 다른 종류의 것으로 읽힌다.
 */
export function Note({
  label,
  ariaLabel,
  children,
  actions,
}: {
  /** 판 위에 작게 서는 이름. 없으면 본문만 선다. */
  label?: string
  ariaLabel?: string
  children: ReactNode
  /** 오른쪽 끝에 서는 단추들. */
  actions?: ReactNode
}) {
  return (
    <section
      aria-label={ariaLabel ?? label}
      className="mb-[10px] flex items-center gap-3 rounded-card border border-line bg-surface px-[16px] py-[11px]"
    >
      <div className="flex min-w-0 flex-col gap-[3px]">
        {label ? (
          <span className="text-[11.5px] text-text-3">{label}</span>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="ml-auto flex flex-none items-center gap-2">{actions}</div>
      ) : null}
    </section>
  )
}

/** 판 오른쪽의 보조 단추. */
export function NoteButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-none rounded-ctl border border-line-2 px-[12px] py-[7px] text-[13px] text-text-2 transition-colors hover:bg-hover"
    >
      {children}
    </button>
  )
}
