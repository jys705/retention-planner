import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

/** 손을 멈추고 이만큼 지나면 저장한다. 글자마다 저장하면 다시 셈이 글자마다 돈다. */
export const MEMO_SAVE_DELAY_MS = 600

type SaveState = 'idle' | 'pending' | 'saved'

/**
 * 항목의 메모 칸.
 *
 * 노트 앱의 본문처럼 늘 열려 있다. 누르면 바로 적고, 줄을 바꿔 길게 적어도 된다.
 * 저장 단추는 없다. 손을 멈추거나 다른 데를 누르거나 화면을 떠나면 저장된다.
 *
 * 쓰는 동안에는 칸의 글이 원본이다. 저장한 값이 돌아와도 쓰던 글을 덮지 않는다.
 * 다른 컴퓨터의 기록을 합쳐 메모가 바뀌면, 쓰고 있지 않을 때만 새 값으로 바꾼다.
 */
export function MemoPanel({
  itemId,
  value,
  onSave,
}: {
  itemId: string
  value: string
  onSave: (itemId: string, next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<SaveState>('idle')
  const [focused, setFocused] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 아직 저장하지 않은 글과 그 글의 항목. 화면을 떠날 때 그 항목에 마저 남긴다.
  const pending = useRef<{ itemId: string; text: string } | null>(null)
  const save = useRef(onSave)
  useEffect(() => {
    save.current = onSave
  })

  // 다른 항목으로 가면 그 항목의 메모로 바꾼다. 쓰고 있지 않을 때 바깥에서 메모가
  // 바뀌면 따라간다.
  const [seen, setSeen] = useState({ itemId, value })
  if (seen.itemId !== itemId) {
    setSeen({ itemId, value })
    setDraft(value)
    setDirty(false)
    setStatus('idle')
  } else if (seen.value !== value && !focused && !dirty) {
    setSeen({ itemId, value })
    setDraft(value)
  }

  function flush() {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const next = pending.current
    if (next === null) return
    pending.current = null
    save.current(next.itemId, next.text)
    setDirty(false)
    setStatus('saved')
  }

  // 화면을 떠나거나 다른 항목으로 가면 쓰던 것을 마저 남긴다.
  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
      const next = pending.current
      pending.current = null
      if (next !== null) save.current(next.itemId, next.text)
    }
  }, [itemId])

  // 글이 늘면 칸도 같이 늘어난다. 칸 안에서 따로 굴리지 않는다.
  useLayoutEffect(() => {
    const area = areaRef.current
    if (!area) return
    area.style.height = 'auto'
    area.style.height = `${area.scrollHeight}px`
  }, [draft])

  return (
    <section
      aria-label="메모"
      className={cn(
        'rounded-panel border bg-surface px-[20px] py-[16px] transition-colors',
        focused ? 'border-accent' : 'border-line'
      )}
    >
      {/* 같은 화면의 '평가 이력' 과 같은 머리글이다. */}
      <div className="flex items-center justify-between pb-[8px]">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">메모</h2>
        <span aria-live="polite" className="text-[11.5px] text-text-3">
          {status === 'pending' ? '저장 중' : status === 'saved' ? '저장했어요' : ''}
        </span>
      </div>
      <textarea
        ref={areaRef}
        value={draft}
        aria-label="메모"
        rows={3}
        spellCheck={false}
        placeholder="틀린 문제, 헷갈린 개념, 다음에 볼 곳 같은 것을 적어 두세요."
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          flush()
        }}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          setDirty(true)
          setStatus('pending')
          pending.current = { itemId, text: next }
          if (timer.current !== null) clearTimeout(timer.current)
          timer.current = setTimeout(flush, MEMO_SAVE_DELAY_MS)
        }}
        className="block min-h-[66px] w-full resize-none overflow-hidden bg-transparent text-[14px] leading-[1.65] text-text outline-none placeholder:text-text-3"
      />
    </section>
  )
}
