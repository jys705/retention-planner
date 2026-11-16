import { ROOT_CLASS } from './constants'

/**
 * 캔버스에서 고르지 않은 카드를 누른 첫 클릭을 카드 속 단추와 입력 칸에 건넨다.
 *
 * 옵시디언 캔버스는 고르지 않은 칸 위에 막(.canvas-node-content-blocker)을 덮는다. 첫 클릭은
 * 칸을 고르기만 하고 단추에 닿지 않는다. 입력 칸을 눌렀는데 초점이 안 가면, 이어서 친
 * Backspace 가 글자 대신 카드를 지운다. 그래서 칸이 골라진 다음, 그 자리에 있는 우리
 * 단추를 누르거나 입력 칸에 초점을 준다. 끌어서 옮긴 것은 클릭으로 치지 않는다.
 */
export interface FirstClickDeps {
  /** 그 자리에 겹쳐 있는 요소들. 위에 있는 것부터. */
  hitTest(doc: Document, x: number, y: number): Element[]
  /** 캔버스가 칸을 고른 다음에 돌린다. */
  defer(run: () => void): void
}

const CONTROL = 'input, textarea, button, summary, [role="checkbox"], a[href]'

/** 마우스로 누른 것이라 키보드 테두리를 그리지 않는다. 옛 크롬은 이 값을 모른 채 넘긴다. */
const POINTER_FOCUS = { preventScroll: true, focusVisible: false } as FocusOptions
/** 이보다 많이 움직였으면 끌기다. */
const MOVE_LIMIT = 4

const defaultDeps: FirstClickDeps = {
  hitTest: (doc, x, y) => doc.elementsFromPoint(x, y),
  defer: (run) => void setTimeout(run, 0),
}

export function createFirstClickForwarder(deps: FirstClickDeps = defaultDeps) {
  let start: { x: number; y: number; node: Element } | null = null

  return {
    pointerdown(event: MouseEvent): void {
      start = null
      const target = event.target as Element | null
      if (!target?.classList?.contains('canvas-node-content-blocker')) return
      const node = target.closest('.canvas-node')
      if (!node?.querySelector(`.${ROOT_CLASS}`)) return
      start = { x: event.clientX, y: event.clientY, node }
    },

    click(event: MouseEvent): void {
      const begun = start
      start = null
      if (!begun) return
      // Shift 나 Cmd 를 누른 클릭은 캔버스가 칸을 여럿 고르는 손짓이다. 카드에 건네지 않는다.
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
      if (Math.hypot(event.clientX - begun.x, event.clientY - begun.y) > MOVE_LIMIT) return
      const doc = begun.node.ownerDocument
      const { clientX: x, clientY: y } = event
      deps.defer(() => {
        const hit = deps.hitTest(doc, x, y).find(
          (el) => begun.node.contains(el) && el.closest(`.${ROOT_CLASS}`)
        )
        if (!hit) return
        const control = hit.closest(CONTROL) as HTMLElement | null
        const usable =
          control !== null && begun.node.contains(control) && !(control as HTMLButtonElement).disabled
        if (usable) {
          // 초점을 카드 속으로 옮긴다. 캔버스에 남아 있으면 이어 누른 Backspace 가 칸을 통째로 지운다.
          control.focus(POINTER_FOCUS)
          if (!control.matches('input, textarea')) control.click()
          return
        }
        // 단추가 아닌 자리나 꺼진 단추를 눌렀다. 그래도 초점은 카드 속에 둔다. 한 줄 적기 줄이면 그
        // 입력 칸으로, 아니면 카드 뿌리로 간다.
        const addInput = hit.closest('.rp-card-add')?.querySelector('input') ?? null
        const root = hit.closest(`.${ROOT_CLASS}`) as HTMLElement | null
        ;(addInput ?? root)?.focus(POINTER_FOCUS)
      })
    },
  }
}
