import { describe, expect, it } from 'vitest'
import {
  LayerOrderError,
  ROOT_SELECTOR,
  scopeCss,
  scopeSelector,
  unscopedSelectors,
} from '../../obsidian/build/scopeCss'

const R = ROOT_SELECTOR

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

  it('뿌리 선택자는 옵시디언 단추 꾸밈보다 무겁다', () => {
    // 옵시디언은 button:not(.clickable-icon) 과 .markdown-rendered ul > li 같은 것으로 꾸민다.
    // 무게는 클래스 하나와 요소 하나쯤이다. 앱의 요소 규칙이 이보다 가벼우면 진다.
    const classes = (R.match(/\./g) ?? []).length
    expect(classes).toBeGreaterThanOrEqual(3)
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
    expect(out).toMatch(new RegExp(`${R.replace(/\./g, '\\.')},\\s*${R.replace(/\./g, '\\.')} \\{`))
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
