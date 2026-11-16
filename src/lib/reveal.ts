import { useEffect, useRef } from 'react'

/**
 * 새로 나타난 것을 화면 안으로 끌어온다. 이미 보이면 움직이지 않는다.
 *
 * 목록을 내려 보다 평가하면 방금 한 일이 목록 위에 생겨 화면 밖에 있고, 아래쪽 줄을 펴면 등급 칸이
 * 화면 밑으로 나간다. 결과와 되돌리기, 고를 칸이 보여야 한다. key 가 바뀔 때마다 한 번 끌어온다.
 * 옵시디언 캔버스 칸처럼 위아래에 붙은 것이 있으면 그 칸의 scroll-padding 이 그만큼 비켜 준다.
 */
export function useReveal<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (key === null || key === undefined || key === false) return
    ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [key])
  return ref
}
