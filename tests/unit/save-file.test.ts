// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn(async () => '/Users/someone/Downloads/backup (1).json')
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

const { fileNameOf, saveTextFile } = await import('../../src/lib/saveFile')

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  invoke.mockClear()
})

describe('파일 내려놓기', () => {
  it('데스크톱 앱에서는 다운로드 폴더에 쓰고 경로를 돌려준다', async () => {
    // 데스크톱 앱의 웹뷰는 다운로드를 조용히 버린다. 앱 쪽에 직접 쓰라고 맡긴다.
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    const path = await saveTextFile('backup.json', '{}', 'application/json')
    expect(invoke).toHaveBeenCalledWith('save_to_downloads', { name: 'backup.json', contents: '{}' })
    expect(path).toBe('/Users/someone/Downloads/backup (1).json')
    expect(fileNameOf(path!)).toBe('backup (1).json')
  })

  it('브라우저에서는 다운로드로 내려받는다', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const path = await saveTextFile('backup.json', '{}', 'application/json')
    expect(path).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalledTimes(1)
    click.mockRestore()
  })
})
