import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LayerOrderError,
  packageCss,
  remToPx,
  ROOT_SELECTOR,
  scopeCss,
  scopeSelector,
  unscopedSelectors,
} from '../../obsidian/build/scopeCss'

const R = ROOT_SELECTOR

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')

type Weight = [number, number, number]
const heavier = (a: Weight, b: Weight) =>
  a[0] !== b[0] ? a[0] - b[0] : a[1] !== b[1] ? a[1] - b[1] : a[2] - b[2]

/**
 * 선택자의 무게(아이디, 클래스, 요소). 여기서 쓰는 꼴만 센다.
 * :is() 는 안에 든 것 가운데 가장 무거운 것의 무게를 갖고, :where() 는 무게가 없다.
 */
function weight(selector: string): Weight {
  const total: Weight = [0, 0, 0]
  const rest = selector
    .replace(/:where\([^()]*\)/g, '')
    .replace(/:(is|not)\(([^()]*)\)/g, (_, _name: string, inner: string) => {
      const best = inner
        .split(',')
        .map((part) => weight(part.trim()))
        .sort(heavier)
        .at(-1)!
      total[0] += best[0]
      total[1] += best[1]
      total[2] += best[2]
      return ''
    })
  total[0] += (rest.match(/#[\w-]+/g) ?? []).length
  total[1] += (rest.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length
  total[2] += (rest.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length
  return total
}

describe('앱 스타일을 앱 뿌리 안에 가두기', () => {
  it('문서 꼭대기를 가리키던 선택자는 앱 뿌리가 된다', () => {
    expect(scopeSelector(':root')).toBe(R)
    expect(scopeSelector('html')).toBe(R)
    expect(scopeSelector('body')).toBe(R)
    expect(scopeSelector(':host')).toBe(R)
    expect(scopeSelector('#root')).toBe(R)
    // 앞에 붙은 꾸밈은 뿌리에 그대로 붙는다. 앱 뿌리의 밝기 값을 본다.
    expect(scopeSelector(":root[data-theme='dark']")).toBe(`${R}[data-theme='dark']`)
    expect(scopeSelector(":root:not([data-theme='light'])")).toBe(`${R}:not([data-theme='light'])`)
  })

  it('나머지는 앱 뿌리의 자손만 고른다', () => {
    expect(scopeSelector('.flex')).toBe(`${R} .flex`)
    expect(scopeSelector('button:not(.x)')).toBe(`${R} button:not(.x)`)
    expect(scopeSelector('*')).toBe(`${R} *`)
    expect(scopeSelector('::backdrop')).toBe(`${R} ::backdrop`)
    expect(scopeSelector('.hover\\:bg-raise:hover')).toBe(`${R} .hover\\:bg-raise:hover`)
    // 이름이 html 로 시작할 뿐인 것은 꼭대기가 아니다.
    expect(scopeSelector('html-like')).toBe(`${R} html-like`)
    expect(scopeSelector('.body')).toBe(`${R} .body`)
  })

  it('뿌리 선택자는 클래스만 쌓은 옵시디언과 테마 규칙을 늘 이긴다', () => {
    // 아이디 하나의 무게가 붙어 있다. 클래스를 몇 겹 쌓은 규칙도 못 이긴다.
    expect(weight(R)).toEqual([1, 1, 0])
    const obsidian = [
      'button:not(.clickable-icon)',
      '.markdown-rendered ul > li',
      '.theme-dark .markdown-rendered .markdown-preview-view .is-live-preview button:not(.mod-cta)',
      'body.theme-light .workspace .workspace-leaf .view-content .markdown-preview-view p',
    ]
    for (const selector of obsidian) {
      expect(heavier(weight(`${R} button`), weight(selector))).toBeGreaterThan(0)
    }
    // 그래도 아이디를 쓰지는 않는다. 없는 아이디라 뿌리 요소에 아이디를 달 필요가 없다.
    expect(R.startsWith('.rp-root')).toBe(true)
  })

  it('층을 걷고 순서를 지키며 이름만 등록하는 것은 그대로 둔다', () => {
    const css = [
      '@layer theme, base, components, utilities;',
      '@layer theme { :root, :host { --spacing: .25rem } }',
      '@layer base { *, ::after { box-sizing: border-box } button { background: transparent } }',
      '@layer utilities { .px-3 { padding-inline: calc(var(--spacing) * 3) } @media (min-width: 40rem) { .sm\\:flex { display: flex } } }',
      ':root { --text: #111 }',
      '@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { --text: #eee } }',
      '@keyframes spin { from { transform: rotate(0) } to { transform: rotate(1turn) } }',
      '@property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000 }',
    ].join('\n')
    const out = scopeCss(css)
    expect(out).not.toMatch(/@layer/)
    expect(unscopedSelectors(out)).toEqual([])
    // :root 와 :host 는 둘 다 뿌리가 된다.
    expect(out).toMatch(new RegExp(`${escape(R)},\\s*${escape(R)} \\{`))
    expect(out).toContain(`${R} button`)
    expect(out).toContain(`${R} .px-3`)
    expect(out).toContain(`${R} .sm\\:flex`)
    expect(out).toContain(`${R}:not([data-theme=light])`)
    // 애니메이션의 차례 이름과 등록은 건드리지 않는다.
    expect(out).toMatch(/@keyframes spin \{ from \{/)
    expect(out).toContain('@property --tw-shadow')
    // 층 순서대로 적혀 있다. 테마, 바탕, 도구, 그 밖.
    const order = ['--spacing', 'box-sizing', 'padding-inline', '--text: #111'].map((needle) =>
      out.indexOf(needle)
    )
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('층을 걷으면 순서가 바뀌는 꼴이면 멈춘다', () => {
    expect(() => scopeCss('.a { color: red } @layer base { .b { color: blue } }')).toThrow(LayerOrderError)
    expect(() =>
      scopeCss('@layer base { .a { color: red } } @layer utilities { .b {} } @layer base { .c {} }')
    ).toThrow(LayerOrderError)
    expect(() =>
      scopeCss('@layer base, utilities; @layer utilities { .b {} } @layer base { .a {} }')
    ).toThrow(LayerOrderError)
  })

  it('남은 선택자를 찾아낸다', () => {
    expect(unscopedSelectors(`${R} .a {} .b {} @media print { .c {} }`)).toEqual(['.b', '.c'])
  })
})

describe('옵시디언이 읽을 스타일 묶기', () => {
  const reset = readFileSync(new URL('../../obsidian/src/reset.css', import.meta.url), 'utf8')
  const host = readFileSync(new URL('../../obsidian/src/host.css', import.meta.url), 'utf8')

  it('옵시디언 CSS 를 걷는 규칙이 앱 CSS 보다 앞에, 그릇 규칙이 뒤에 온다', () => {
    // 걷는 규칙의 무게는 앱 CSS 의 가장 가벼운 규칙과 같다. 뒤에 오면 앱의 바탕 재설정까지 걷힌다.
    const out = packageCss('button { padding: 0 } .flex { display: flex }', reset, host)
    const at = (needle: string) => out.indexOf(needle)
    expect(at('all: revert')).toBeGreaterThanOrEqual(0)
    expect(at('all: revert')).toBeLessThan(at(`${R} button`))
    expect(at(`${R} .flex`)).toBeLessThan(at('.workspace-leaf-content'))
  })

  it('앱 안의 요소는 모든 속성을 걷되 그림 안은 걷지 않는다', () => {
    // 옵시디언은 단추를 가운데 정렬한 flex 로 꾸민다. 속성을 골라 걷으면 고르지 않은 것이 샌다.
    // 차트는 색과 굵기를 속성으로 주는데 revert 는 그것까지 지운다.
    const out = packageCss('.a {}', reset, host)
    const rule = (selector: string) =>
      new RegExp(`(?:^|\\n)${escape(selector)}\\s*\\{[^}]*all:\\s*(\\w+)`).exec(out)?.[1]
    expect(rule(`${R} :where(:not(svg, svg *))`)).toBe('revert')
    expect(rule(R)).toBe('initial')
  })

  it('걷는 규칙과 그릇 규칙의 뿌리는 앱 CSS 와 같은 뿌리 선택자로 바뀐다', () => {
    const out = packageCss('.a {}', reset, host)
    expect(out).toContain(`${R}.rp-block {`)
    expect(out).toContain(`${R}.rp-app main {`)
    // 바꾸고 남은 맨 뿌리 클래스가 없다. 남으면 그 규칙만 가벼워져 옵시디언에 진다.
    expect(out.split(R).join('')).not.toMatch(/\.rp-root(?![\w-])/)
  })

  it('걷는 규칙과 그릇 규칙에 무게를 손으로 붙이면 멈춘다', () => {
    expect(() => packageCss('.a {}', '.rp-root.rp-root :where(*) { all: revert }', host)).toThrow(/reset\.css/)
    expect(() => packageCss('.a {}', reset, `${R} { display: block }`)).toThrow(/host\.css/)
    // 주석 속 글자는 선택자로 보지 않는다.
    expect(() =>
      packageCss('.a {}', '/* .rp-root.rp-root */ .rp-root { all: initial }', host)
    ).not.toThrow()
  })

  it('앱 CSS 의 rem 을 px 로 바꿔 옵시디언 글꼴 크기 설정에 흔들리지 않는다', () => {
    expect(remToPx('.a { padding: .25rem 1.5rem; margin: -0.5rem; width: calc(100% - 2rem) }')).toBe(
      '.a { padding: 4px 24px; margin: -8px; width: calc(100% - 32px) }'
    )
    // 카드 폭에 따라 열을 더 보이는 기준도 같이 바뀐다.
    expect(remToPx('@container (width >= 24rem) { .b { gap: 2rem } }')).toBe(
      '@container (width >= 384px) { .b { gap: 32px } }'
    )
    expect(remToPx('@media (min-width: 40rem) { .c { top: 0 } }')).toBe(
      '@media (min-width: 640px) { .c { top: 0 } }'
    )
    // 이름 속의 글자는 건드리지 않는다.
    expect(remToPx('.lorem { --premium: 1; font-size: 12px }')).toBe(
      '.lorem { --premium: 1; font-size: 12px }'
    )
    expect(packageCss('.a { padding: 1rem }', reset, host)).not.toMatch(/\d(?:\.\d+)?rem\b/)
  })
})
