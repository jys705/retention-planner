import postcss, { type AtRule, type Container, type Root, type Rule } from 'postcss'
import { ROOT_CLASS } from '../src/constants.ts'

/**
 * 뿌리를 가리키는 선택자.
 *
 * 옵시디언과 테마, 사용자 조각은 `.theme-dark .markdown-rendered button:not(.clickable-icon)`
 * 같은 선택자로 단추와 목록을 꾸민다. 클래스를 몇 겹 쌓아도 그보다 더 쌓은 규칙이 이긴다.
 * :is() 는 안에 든 것 가운데 가장 무거운 것의 무게를 갖는다. 없는 아이디를 하나 넣어 두면
 * 뿌리는 그대로 고르면서 아이디 하나의 무게를 얻는다. 클래스만 쓴 규칙은 아무리 쌓아도 못 이긴다.
 */
export const ROOT_SELECTOR = `.${ROOT_CLASS}:is(#${ROOT_CLASS}-never, .${ROOT_CLASS})`

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

/** 주석을 걷는다. 주석 속 '.rp-root' 같은 글자를 선택자로 잘못 읽지 않게. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const REM = /(-?(?:\d+\.?\d*|\.\d+))rem\b/g

/**
 * rem 을 px 로 바꾼다. 1rem 은 16px.
 *
 * rem 은 문서 뿌리(html)의 글자 크기를 따른다. 옵시디언은 글꼴 크기 설정을 html 에 건다.
 * 그대로 두면 사용자가 글꼴을 한 칸 키울 때 앱의 간격과 카드 폭 기준(@container)이 같이
 * 늘어 날짜와 목표 이름이 사라진다. 데스크톱 앱의 뿌리는 16px 이라 바꿔도 모양이 같다.
 */
export function remToPx(css: string): string {
  const px = (value: string) =>
    value.replace(REM, (_, n: string) => `${Number((parseFloat(n) * 16).toFixed(4))}px`)
  const ast = postcss.parse(css)
  ast.walkDecls((decl) => {
    decl.value = px(decl.value)
  })
  ast.walkAtRules((rule) => {
    if (/^(container|media|supports)$/i.test(rule.name)) rule.params = px(rule.params)
  })
  return ast.toString()
}

const TOKEN = new RegExp(`\\.${ROOT_CLASS}(?![\\w-])`, 'g')

/**
 * reset.css 와 host.css 의 뿌리 자리(.rp-root)에 앱 CSS 와 같은 뿌리 선택자를 넣는다.
 * 세 곳의 무게가 늘 같아야 차례대로 이긴다. 손으로 겹쳐 적은 것은 받지 않는다.
 */
function rooted(css: string, name: string, root: string): string {
  const body = withoutComments(css)
  if (body.includes(`#${ROOT_CLASS}-never`) || body.includes(`.${ROOT_CLASS}.${ROOT_CLASS}`)) {
    throw new Error(`${name} 은 뿌리를 .${ROOT_CLASS} 하나로 적는다. 무게는 빌드가 붙인다.`)
  }
  return css.replace(TOKEN, root)
}

/**
 * 옵시디언이 읽을 styles.css 를 묶는다.
 *
 * 차례가 중요하다. reset 은 앱 CSS 보다 앞이어야 한다. 무게가 앱 CSS 의 가장 가벼운 규칙과
 * 같으니 앞에 와야 앱이 이긴다. host 는 뒤에 와서 옵시디언 그릇과 뿌리를 다듬는다.
 * reset 과 host 는 뿌리를 .rp-root 하나로 적고, 여기서 ROOT_SELECTOR 로 바꿔 넣는다.
 */
export function packageCss(appCss: string, resetCss: string, hostCss: string, root = ROOT_SELECTOR): string {
  const scoped = remToPx(scopeCss(appCss, root))
  const leaks = unscopedSelectors(scoped, root)
  if (leaks.length > 0) {
    throw new Error(`앱 뿌리 밖을 고르는 선택자가 남았다: ${leaks.slice(0, 5).join(', ')}`)
  }
  return `${rooted(resetCss, 'reset.css', root)}\n${scoped}\n${rooted(hostCss, 'host.css', root)}`
}
