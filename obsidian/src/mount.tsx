import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HostContext, isTypingTarget, type Host } from '../../src/lib/host'
import { ROOT_CLASS } from './constants'
import { ErrorBoundary } from './ErrorBoundary'
import { Gate } from './Gate'

export type Theme = 'light' | 'dark'

/**
 * 옵시디언이 어두운 테마인지.
 *
 * 본 창의 body 를 본다. 따로 띄운 창의 body 는 테마가 바뀐 뒤 조금 늦게 따라 바뀌어서,
 * 바뀌었다는 알림이 올 때는 아직 옛 값이다. 따로 띄운 창은 본 창을 그대로 따른다.
 */
export function obsidianTheme(doc: Document = document): Theme {
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
  private readonly live = new Map<HTMLElement, Root>()

  mount(
    parent: HTMLElement,
    kind: 'app' | 'block',
    host: Host,
    node: ReactNode
  ): Mounted {
    const doc = parent.ownerDocument
    const element = doc.createElement('div')
    element.className = `${ROOT_CLASS} rp-${kind}`
    // 캔버스는 고른 칸을 다시 누르면 글 고치기로 바꾼다. 카드 속을 누른 것은 카드가 받는다.
    // 옵시디언이 정해 둔 이 표시가 있으면 캔버스가 그러지 않는다. 칸 끌기는 그대로 된다.
    if (kind === 'block') {
      element.classList.add('interactive-child')
      // 캔버스에서 카드의 빈자리를 눌렀을 때 초점을 받을 자리. 초점이 캔버스에 남으면 Backspace 가 칸을 지운다.
      element.tabIndex = -1
    }
    // 밝기는 옵시디언 테마를 따른다. 앱 스타일은 뿌리의 이 값만 본다.
    element.dataset.theme = obsidianTheme()
    parent.appendChild(element)
    containKeys(element)

    const root = createRoot(element)
    const draw = (child: ReactNode) =>
      root.render(
        <HostContext.Provider value={host}>
          <ErrorBoundary>
            <Gate>{child}</Gate>
          </ErrorBoundary>
        </HostContext.Provider>
      )
    draw(node)
    this.live.set(element, root)

    return {
      element,
      render: (child) => {
        if (this.live.has(element)) draw(child)
      },
      unmount: () => this.unmountOne(element),
    }
  }

  /** 떠 있는 것을 모두 거둔다. 플러그인을 끄거나 바꿀 때. */
  unmountAll(): void {
    for (const element of [...this.live.keys()]) this.unmountOne(element)
  }

  /** 옵시디언 테마가 바뀌었을 때 떠 있는 것 전부를 맞춘다. */
  syncTheme(): void {
    const theme = obsidianTheme()
    for (const element of this.live.keys()) element.dataset.theme = theme
  }

  get size(): number {
    return this.live.size
  }

  private unmountOne(element: HTMLElement): void {
    const root = this.live.get(element)
    if (!root) return
    this.live.delete(element)
    root.unmount()
    element.remove()
  }
}

/**
 * 앱 안의 입력 칸에서 친 키를 옵시디언에 넘기지 않는다.
 *
 * 캔버스는 카드를 고른 채 Backspace 를 누르면 카드를 지운다. 카드 속 입력 칸에서 글자를
 * 지우려던 키가 카드를 지우면 안 된다. 수정 키를 같이 누른 것은 옵시디언 명령이라 넘긴다.
 * Esc 도 넘긴다. 앱 탭은 보기가 Esc 를 붙잡아 옵시디언이 다른 탭으로 옮기지 않게 한다.
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
