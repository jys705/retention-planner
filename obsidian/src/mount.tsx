import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HostContext, isTypingTarget, type Host } from '../../src/lib/host'
import { ROOT_CLASS } from './constants'
import { Gate } from './Gate'

export type Theme = 'light' | 'dark'

/** 옵시디언이 어두운 테마인지. 창마다 body 에 붙는다. */
export function obsidianTheme(doc: Document): Theme {
  return doc.body.classList.contains('theme-dark') ? 'dark' : 'light'
}

/**
 * 옵시디언 그릇 안에 세운 앱 하나.
 *
 * 뿌리 요소를 따로 만들어 그 안에만 그린다. 앱 스타일은 이 뿌리 안에만 닿는다.
 */
export interface Mounted {
  readonly element: HTMLElement
  render(node: ReactNode): void
  unmount(): void
}

/**
 * 옵시디언 그릇 안에 앱을 세우고 거둔다.
 *
 * 탭 하나와 여러 노트 카드가 한 저장소를 같이 본다. 한쪽에서 평가하면 다른 쪽도 바로 바뀐다.
 */
export class Mounts {
  private readonly live = new Set<HTMLElement>()

  mount(
    parent: HTMLElement,
    kind: 'app' | 'block',
    host: Host,
    node: ReactNode
  ): Mounted {
    const doc = parent.ownerDocument
    const element = doc.createElement('div')
    element.className = `${ROOT_CLASS} rp-${kind}`
    // 밝기는 옵시디언 테마를 따른다. 앱 스타일은 뿌리의 이 값만 본다.
    element.dataset.theme = obsidianTheme(doc)
    parent.appendChild(element)
    containKeys(element)

    const root = createRoot(element)
    const draw = (child: ReactNode) =>
      root.render(
        <HostContext.Provider value={host}>
          <Gate>{child}</Gate>
        </HostContext.Provider>
      )
    draw(node)
    this.live.add(element)

    return {
      element,
      render: draw,
      unmount: () => {
        root.unmount()
        element.remove()
        this.live.delete(element)
      },
    }
  }

  /** 옵시디언 테마가 바뀌었을 때 떠 있는 것 전부를 맞춘다. */
  syncTheme(): void {
    for (const element of this.live) {
      element.dataset.theme = obsidianTheme(element.ownerDocument)
    }
  }

  get size(): number {
    return this.live.size
  }
}

/**
 * 앱 안의 입력 칸에서 친 키를 옵시디언에 넘기지 않는다.
 *
 * 캔버스는 카드를 고른 채 Backspace 를 누르면 카드를 지운다. 카드 속 입력 칸에서 글자를
 * 지우려던 키가 카드를 지우면 안 된다. 수정 키를 같이 누른 것은 옵시디언 명령이라 넘긴다.
 * Esc 도 넘긴다. 앱 화면은 창 전체에서 Esc 를 듣고 편집을 닫는다.
 */
function containKeys(element: HTMLElement): void {
  const stop = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Escape') return
    if (isTypingTarget(event.target)) event.stopPropagation()
  }
  element.addEventListener('keydown', stop)
  element.addEventListener('keyup', stop)
  element.addEventListener('keypress', stop)
}
