import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'

/**
 * 차트는 그릴 자리의 크기를 재서 그린다. 흉내 낸 브라우저는 모든 요소의 크기를
 * 0 으로 보고하므로 그대로 두면 차트가 아예 안 그려진다.
 * 시험에서도 차트를 눈으로 확인할 수 있게 창 크기를 하나 정해 준다.
 */
const WIDTH = 900
const HEIGHT = 320

beforeAll(() => {
  // 순수 계산 시험은 node 에서 돈다. 거기에는 문서가 없으니 아무것도 하지 않는다.
  if (typeof globalThis.HTMLElement === 'undefined') return

  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      private readonly callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }
      observe(target: Element): void {
        this.callback(
          [
            {
              target,
              contentRect: { width: WIDTH, height: HEIGHT },
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver
        )
      }
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver
  }

  for (const [name, value] of [
    ['offsetWidth', WIDTH],
    ['offsetHeight', HEIGHT],
    ['clientWidth', WIDTH],
    ['clientHeight', HEIGHT],
  ] as const) {
    Object.defineProperty(globalThis.HTMLElement.prototype, name, {
      configurable: true,
      get() {
        return value
      },
    })
  }

  Object.defineProperty(globalThis.Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: WIDTH,
      height: HEIGHT,
      top: 0,
      left: 0,
      right: WIDTH,
      bottom: HEIGHT,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  })
})

afterEach(() => {
  if (typeof globalThis.document === 'undefined') return
  cleanup()
})
