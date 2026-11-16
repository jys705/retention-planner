import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'

/** 한 줄짜리 글에 들어온 줄바꿈. 둘레의 빈칸까지 빈칸 하나로 바꾼다. */
const LINE_BREAKS = /\s*[\r\n]+\s*/g

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
  /**
   * 길면 줄을 넘겨 다 보여 줄지. 끄면 한 줄로 자르고 끝에 말줄임표를 단다.
   * 항목 제목처럼 그 화면의 주인공인 글은 잘리면 읽을 길이 없다.
   */
  wrap?: boolean
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
  wrap = false,
}: InlineTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  /** 붙여 넣은 뒤 커서를 둘 자리. 고친 글로 다시 그리면 커서가 맨 끝으로 가기 때문이다. */
  const caret = useRef<number | null>(null)

  useEffect(() => {
    if (!editing) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [editing])

  // 여러 줄로 보여 주던 글은 고칠 때도 그만큼 높아야 글이 안 튄다. 칸이 글 높이를 따라간다.
  useLayoutEffect(() => {
    if (!editing || !wrap) return
    const area = inputRef.current
    if (!area || area.scrollHeight === 0) return
    area.style.height = 'auto'
    const border = area.offsetHeight - area.clientHeight
    area.style.height = `${area.scrollHeight + border}px`
  }, [editing, wrap, draft])

  useLayoutEffect(() => {
    const at = caret.current
    if (at === null) return
    caret.current = null
    inputRef.current?.setSelectionRange(at, at)
  }, [draft])

  function commit() {
    const next = draft.trim()
    setEditing(false)
    if (!allowEmpty && next === '') return
    if (next === value) return
    onSave(next)
  }

  if (editing) {
    const props = {
      ref: inputRef,
      value: draft,
      'aria-label': label,
      onBlur: commit,
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(value)
          setEditing(false)
        }
      },
    }
    // 읽을 때와 같은 자리, 같은 크기. 테만 잠깐 생긴다.
    const look = 'w-full rounded-ctl border border-accent bg-surface px-[6px] py-[2px] outline-none'
    if (wrap) {
      return (
        <textarea
          {...props}
          rows={1}
          // 한 줄짜리 글이다. 붙여 넣은 줄바꿈은 빈칸으로 바꾸고 커서는 붙인 글 끝에 둔다.
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text')
            if (!/[\r\n]/.test(pasted)) return
            event.preventDefault()
            const area = event.currentTarget
            const clean = pasted.replace(LINE_BREAKS, ' ')
            const start = area.selectionStart ?? area.value.length
            const end = area.selectionEnd ?? start
            caret.current = start + clean.length
            setDraft(area.value.slice(0, start) + clean + area.value.slice(end))
          }}
          // 끌어다 놓은 글처럼 붙여 넣기를 거치지 않은 줄바꿈도 빈칸으로 바꾼다. 커서는 그 자리에 둔다.
          onChange={(event) => {
            const raw = event.target.value
            const clean = raw.replace(LINE_BREAKS, ' ')
            if (clean !== raw) {
              const at = event.target.selectionStart ?? raw.length
              caret.current = raw.slice(0, at).replace(LINE_BREAKS, ' ').length
            }
            setDraft(clean)
          }}
          className={cn(look, 'block resize-none overflow-hidden break-keep [overflow-wrap:anywhere]', className)}
        />
      )
    }
    return (
      <input
        {...props}
        onChange={(event) => setDraft(event.target.value)}
        className={cn(look, className)}
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
        'max-w-full rounded-ctl border border-transparent px-[6px] py-[2px] text-left transition-colors hover:border-line-2 hover:bg-surface',
        wrap ? 'break-keep [overflow-wrap:anywhere]' : 'truncate',
        value === '' && 'text-text-3',
        className
      )}
    >
      {value === '' ? placeholder : value}
    </button>
  )
}
