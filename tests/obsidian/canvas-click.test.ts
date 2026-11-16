// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFirstClickForwarder } from '../../obsidian/src/canvasClick'

/**
 * 캔버스 칸 하나. 옵시디언처럼 고르지 않은 칸 위에 막을 덮는다.
 *
 * 막 아래에 카드가 있다. 시험은 그 자리에 무엇이 겹쳐 있는지를 직접 정한다.
 */
function canvasNode(withCard = true) {
  const node = document.createElement('div')
  node.className = 'canvas-node'
  const blocker = document.createElement('div')
  blocker.className = 'canvas-node-content-blocker'
  const content = document.createElement('div')
  content.className = 'canvas-node-content'
  node.append(blocker, content)
  const root = document.createElement('div')
  root.className = withCard ? 'rp-root rp-block' : 'markdown-preview-view'
  // 플러그인이 세우는 뿌리처럼 초점을 받을 수 있다.
  root.tabIndex = -1
  const button = document.createElement('button')
  button.textContent = '되돌리기'
  const label = document.createElement('span')
  label.textContent = '글자'
  button.appendChild(label)
  const input = document.createElement('input')
  const text = document.createElement('p')
  text.textContent = '그냥 글'
  // 한 줄 적기 줄. 비어 있으면 적어두기 단추는 꺼져 있다.
  const add = document.createElement('div')
  add.className = 'rp-card-add'
  const addInput = document.createElement('input')
  const addButton = document.createElement('button')
  addButton.disabled = true
  addButton.textContent = '적어두기'
  add.append(addInput, addButton)
  const details = document.createElement('details')
  const summary = document.createElement('summary')
  summary.textContent = '자세히'
  details.append(summary)
  root.append(button, input, text, add, details)
  content.appendChild(root)
  document.body.appendChild(node)
  return { node, blocker, button, label, input, text, root, addInput, addButton, summary, details }
}

function press(target: Element, x: number, y: number, upX = x, upY = y, shiftKey = false) {
  return {
    down: new MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, shiftKey }),
    up: new MouseEvent('click', { clientX: upX, clientY: upY, bubbles: true, shiftKey }),
    target,
  }
}

function run(forward: ReturnType<typeof createFirstClickForwarder>, p: ReturnType<typeof press>) {
  Object.defineProperty(p.down, 'target', { value: p.target })
  Object.defineProperty(p.up, 'target', { value: p.target })
  forward.pointerdown(p.down)
  forward.click(p.up)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('캔버스에서 고르지 않은 카드를 누른 첫 클릭', () => {
  it('그 자리의 단추를 누른다. 단추 속 글자를 눌러도 단추다', () => {
    const { blocker, button, label } = canvasNode()
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    const forward = createFirstClickForwarder({
      hitTest: () => [blocker, label, button],
      defer: (go) => go(),
    })
    run(forward, press(blocker, 10, 10))
    expect(clicked).toHaveBeenCalledTimes(1)
    // 초점도 단추로 간다. 캔버스에 남으면 이어 누른 Backspace 가 칸을 지운다.
    expect(document.activeElement).toBe(button)
  })

  it('Shift 를 누른 클릭은 캔버스가 칸을 여럿 고르는 것이라 건네지 않는다', () => {
    const { blocker, button } = canvasNode()
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    const forward = createFirstClickForwarder({
      hitTest: () => [blocker, button],
      defer: (go) => go(),
    })
    run(forward, press(blocker, 10, 10, 10, 10, true))
    expect(clicked).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(button)
  })

  it('입력 칸이면 초점을 준다. 이어서 친 Backspace 가 카드를 지우지 않는다', () => {
    const { blocker, input } = canvasNode()
    const forward = createFirstClickForwarder({
      hitTest: () => [blocker, input],
      defer: (go) => go(),
    })
    run(forward, press(blocker, 10, 10))
    expect(document.activeElement).toBe(input)
  })

  it('캔버스가 칸을 고른 다음에 건넨다', () => {
    const { blocker, button } = canvasNode()
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    let later: (() => void) | null = null
    const forward = createFirstClickForwarder({
      hitTest: () => [blocker, button],
      defer: (go) => {
        later = go
      },
    })
    run(forward, press(blocker, 10, 10))
    expect(clicked).not.toHaveBeenCalled()
    later!()
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it('끌어서 옮긴 것은 클릭이 아니다', () => {
    const { blocker, button } = canvasNode()
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    const forward = createFirstClickForwarder({
      hitTest: () => [blocker, button],
      defer: (go) => go(),
    })
    run(forward, press(blocker, 10, 10, 40, 10))
    expect(clicked).not.toHaveBeenCalled()
  })

  it('단추나 입력 칸이 아닌 글을 누르면 아무것도 누르지 않고 초점만 카드 뿌리에 둔다', () => {
    const { blocker, button, text, root } = canvasNode()
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    const forward = createFirstClickForwarder({
      hitTest: () => [blocker, text],
      defer: (go) => go(),
    })
    run(forward, press(blocker, 10, 10))
    expect(clicked).not.toHaveBeenCalled()
    // 초점이 캔버스에 남으면 이어 누른 Backspace 가 칸을 지운다.
    expect(document.activeElement).toBe(root)
  })

  it('꺼진 적어두기를 누르면 누르지 않고 한 줄 적기 칸에 초점을 둔다', () => {
    const { blocker, addButton, addInput } = canvasNode()
    const clicked = vi.fn()
    addButton.addEventListener('click', clicked)
    const forward = createFirstClickForwarder({
      hitTest: () => [blocker, addButton],
      defer: (go) => go(),
    })
    run(forward, press(blocker, 10, 10))
    expect(clicked).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(addInput)
  })

  it('자세히를 누르면 한 번에 펼친다', () => {
    const { blocker, summary, details } = canvasNode()
    const forward = createFirstClickForwarder({
      hitTest: () => [blocker, summary],
      defer: (go) => go(),
    })
    run(forward, press(blocker, 10, 10))
    expect(details.open).toBe(true)
  })

  it('이 카드가 없는 칸은 건드리지 않는다', () => {
    const { blocker, button } = canvasNode(false)
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    const forward = createFirstClickForwarder({
      hitTest: () => [blocker, button],
      defer: (go) => go(),
    })
    run(forward, press(blocker, 10, 10))
    expect(clicked).not.toHaveBeenCalled()
  })

  it('막이 아닌 곳을 누른 것은 캔버스가 이미 카드에 건넨 클릭이다', () => {
    const { button } = canvasNode()
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    const forward = createFirstClickForwarder({
      hitTest: () => [button],
      defer: (go) => go(),
    })
    run(forward, press(button, 10, 10))
    expect(clicked).not.toHaveBeenCalled()
  })

  it('다른 칸의 것은 누르지 않는다', () => {
    const first = canvasNode()
    const second = canvasNode()
    const clicked = vi.fn()
    second.button.addEventListener('click', clicked)
    const forward = createFirstClickForwarder({
      hitTest: () => [first.blocker, second.button],
      defer: (go) => go(),
    })
    run(forward, press(first.blocker, 10, 10))
    expect(clicked).not.toHaveBeenCalled()
  })
})
