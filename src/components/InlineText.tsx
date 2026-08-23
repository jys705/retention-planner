import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'

export interface InlineTextProps {
  value: string
  onSave: (next: string) => void
  /** 비었을 때 대신 보여줄 말. 눌러서 적을 수 있다는 걸 여기서 알린다. */
  placeholder: string
  /** 화면 낭독기와 시험이 이 자리를 부르는 이름. */
  label: string
  className?: string
  /** 비워 두는 걸 허용할지. 제목은 안 되고 메모는 된다. */
  allowEmpty?: boolean
}

/**
 * 눌러서 바로 고치는 글.
 *
 * 편집 화면을 따로 열지 않는다. 글자를 누르면 그 자리가 입력칸이 되고, 다른 데를
 * 누르거나 Enter 를 치면 저장된다. Esc 는 되돌린다.
 * 읽을 때와 고칠 때의 글자 크기와 자리가 같아야 눌렀을 때 글이 안 튄다.
 */
export function InlineText({
  value,
  onSave,
  placeholder,
  label,
  className,
  allowEmpty = false,
}: InlineTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [editing])

  function commit() {
    const next = draft.trim()
    setEditing(false)
    if (!allowEmpty && next === '') return
    if (next === value) return
    onSave(next)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(value)
            setEditing(false)
          }
        }}
        className={cn(
          // 읽을 때와 같은 자리, 같은 크기. 테만 잠깐 생긴다.
          'w-full rounded-ctl border border-accent bg-surface px-[6px] py-[2px] outline-none',
          className
        )}
      />
    )
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      className={cn(
        'max-w-full truncate rounded-ctl border border-transparent px-[6px] py-[2px] text-left transition-colors hover:border-line-2 hover:bg-surface',
        value === '' && 'text-text-3',
        className
      )}
    >
      {value === '' ? placeholder : value}
    </button>
  )
}
