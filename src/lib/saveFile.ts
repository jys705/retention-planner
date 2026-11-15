import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../db'

/**
 * 만든 파일을 사용자 쪽에 내려놓는다. 데스크톱 앱이면 저장한 경로를 돌려준다.
 *
 * 브라우저에서는 다운로드로 내려받는다. 데스크톱 앱의 웹뷰는 다운로드를 처리하지 않아서
 * 앱이 다운로드 폴더에 직접 쓴다. 같은 이름이 있으면 덮어쓰지 않고 번호를 붙인다.
 */
export async function saveTextFile(
  name: string,
  text: string,
  type: string
): Promise<string | null> {
  if (isTauri()) {
    return invoke<string>('save_to_downloads', { name, contents: text })
  }
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
  return null
}

/** 저장한 경로에서 파일 이름만 꺼낸다. 안내 문장에 긴 경로를 다 적지 않는다. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
