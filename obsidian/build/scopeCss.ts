import postcss, { type AtRule, type Container, type Root, type Rule } from 'postcss'
import { ROOT_CLASS } from '../src/constants.ts'

/**
 * 뿌리를 가리키는 선택자.
 *
 * 같은 클래스를 세 번 겹쳐 무게를 올린다. 옵시디언과 테마는 `button:not(.clickable-icon)`,
 * `.markdown-rendered ul > li` 같은 선택자로 단추와 목록을 꾸민다. 앱의 규칙이 그보다
 * 가벼우면 노트 속 카드에서 단추에 옵시디언 바탕색이 깔린다.
 */
export const ROOT_SELECTOR = `.${ROOT_CLASS}.${ROOT_CLASS}.${ROOT_CLASS}`

/** 문서 꼭대기를 가리키는 선택자. 옵시디언 안에서는 앱 뿌리가 그 자리를 대신한다. */
const TOP = /^(?::root|:host|html|body|#root)(?![\w-])/

/**
 * 선택자 하나를 앱 뿌리 안으로 가둔다.
 *
 * `:root`, `html`, `body` 는 뿌리 자신이 된다. 나머지는 뿌리의 자손만 고른다.
 * 앞에 붙은 꾸밈(`:root[data-theme='dark']`)은 그대로 뿌리에 붙는다.
 */
export function scopeSelector(selector: string, root = ROOT_SELECTOR): string {
  const trimmed = selector.trim()
  if (trimmed === '') return trimmed
  const top = TOP.exec(trimmed)
  if (top) {
    const rest = trimmed.slice(top[0].length)
    return `${root}${rest}`
  }
  return `${root} ${trimmed}`
}

function insideKeyframes(rule: Rule): boolean {
  let parent: Container | undefined = rule.parent as Container | undefined
  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule' && /keyframes$/i.test((parent as AtRule).name)) {
      return true
    }
    parent = parent.parent as Container | undefined
  }
  return false
}

/**
 * 앱 스타일 전체를 뿌리 안으로 가둔다.
 *
 * 1. 층(@layer)을 걷어낸다. 옵시디언의 규칙은 층 밖에 있다. 층 안의 규칙은 층 밖의
 *    규칙에 무게와 상관없이 지므로, 층에 남겨 두면 어떤 무게를 줘도 옵시디언이 이긴다.
 *    층을 걷어도 순서는 그대로라 앱 안에서 누가 이기는지는 바뀌지 않는다.
 * 2. 모든 선택자를 뿌리 안으로 가둔다. 앱 스타일이 옵시디언 화면으로 새지 않는다.
 *
 * @property 와 @keyframes 는 이름만 등록하는 것이라 그대로 둔다.
 */
export function scopeCss(css: string, root = ROOT_SELECTOR): string {
  const ast: Root = postcss.parse(css)
  assertFlattenable(ast)

  const layers: AtRule[] = []
  ast.walkAtRules('layer', (rule) => {
    layers.push(rule)
  })
  // 안쪽 층부터 걷어야 바깥 층을 옮길 때 안쪽이 따라간다.
  for (const layer of layers.reverse()) {
    if (layer.nodes && layer.nodes.length > 0) layer.replaceWith(layer.nodes)
    else layer.remove()
  }

  ast.walkRules((rule) => {
    if (insideKeyframes(rule)) return
    // 중첩 규칙은 부모를 따라간다. 부모가 이미 갇혀 있다.
    if (rule.parent?.type === 'rule') return
    rule.selectors = rule.selectors.map((s) => scopeSelector(s, root))
  })

  return ast.toString()
}

/** 층을 걷으면 앱 안의 순서가 바뀌는 꼴. */
export class LayerOrderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LayerOrderError'
  }
}

/** 이름만 등록하고 화면에 바로 닿지 않는 것. 어디에 있어도 순서와 상관없다. */
const REGISTRATIONS = new Set(['property', 'keyframes', 'font-face', 'charset', 'import'])

/**
 * 층을 걷어도 되는 꼴인지 본다.
 *
 * 층은 처음 나온 차례대로 이기고, 층 밖의 규칙은 모든 층을 이긴다. 층을 걷으면 적힌
 * 차례만 남는다. 둘이 같으려면 층이 한 번씩만, 처음 나온 차례대로 나오고, 층 밖의
 * 규칙은 모든 층 뒤에 와야 한다. 아니면 걷지 않고 멈춘다.
 */
function assertFlattenable(ast: Root): void {
  // 층의 차례는 이름이 처음 나온 차례다. 선언문이든 블록이든 같다.
  const order: string[] = []
  const blocks: string[] = []
  let unlayered = false
  for (const node of ast.nodes) {
    if (node.type === 'comment') continue
    if (node.type === 'atrule' && node.name === 'layer') {
      const names = node.params.split(',').map((n) => n.trim()).filter(Boolean)
      for (const name of names) if (!order.includes(name)) order.push(name)
      if (!node.nodes) continue
      if (unlayered) {
        throw new LayerOrderError(`층 밖 규칙 뒤에 @layer ${node.params} 가 나온다.`)
      }
      for (const name of names) {
        if (blocks.includes(name)) {
          throw new LayerOrderError(`@layer ${name} 가 두 번 나온다.`)
        }
        blocks.push(name)
      }
      continue
    }
    if (node.type === 'atrule' && REGISTRATIONS.has(node.name.replace(/^-\w+-/, ''))) {
      continue
    }
    unlayered = true
  }
  const expected = order.filter((name) => blocks.includes(name))
  if (expected.join(',') !== blocks.join(',')) {
    throw new LayerOrderError(
      `층이 정해진 차례(${expected.join(', ')})와 다르게 적혀 있다: ${blocks.join(', ')}`
    )
  }
}

/** 가둔 결과에 뿌리 밖을 고르는 선택자가 남았는지. 시험과 빌드가 같이 본다. */
export function unscopedSelectors(css: string, root = ROOT_SELECTOR): string[] {
  const left: string[] = []
  postcss.parse(css).walkRules((rule) => {
    if (insideKeyframes(rule)) return
    if (rule.parent?.type === 'rule') return
    for (const selector of rule.selectors) {
      if (!selector.trim().startsWith(root)) left.push(selector)
    }
  })
  return left
}
