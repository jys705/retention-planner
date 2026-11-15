import { createContext, useContext } from 'react'
import { fileNameOf, saveTextFile } from './saveFile'

/** 남긴 파일이 어디에 있는지. 안내 문장에 그대로 넣는다. */
export interface SavedFile {
  /** '다운로드 폴더' 처럼 사람이 찾아갈 수 있는 이름. */
  place: string
  name: string
}

/**
 * 앱을 띄운 껍데기가 정하는 것.
 *
 * 데스크톱 앱과 브라우저에서는 앱이 창 하나를 다 쓴다. 옵시디언 안에서는 탭 하나와
 * 노트 속 카드에 들어가 남의 화면과 함께 산다. 그때 문서 전체를 건드리는 일과
 * 창 전체의 키를 받는 일은 껍데기가 정해야 한다.
 */
export interface Host {
  /** 앱이 문서 전체의 밝기를 정해도 되는지. 옵시디언 안에서는 옵시디언 테마를 따른다. */
  ownsTheme: boolean
  /**
   * 정해둔 시각 알림을 앱 화면이 띄우는지.
   *
   * 옵시디언에서는 화면이 여러 개 떠 있을 수 있어서 플러그인이 한 번만 띄운다.
   */
  ownsReminder: boolean
  /**
   * 창 전체에서 듣는 단축키가 이 키를 받아도 되는지.
   *
   * 입력 칸에서 친 글자는 앱이 따로 거른다. 여기서는 그 키가 이 앱에 온 것인지를 본다.
   * 옵시디언에서 다른 노트를 쓰는 중에 친 글자가 이 앱의 단축키가 되면 안 된다.
   */
  acceptsShortcut(event: KeyboardEvent): boolean
  /** 파일 하나를 남긴다. 브라우저가 받아 갔으면 null. */
  saveTextFile(name: string, text: string, type: string): Promise<SavedFile | null>
}

export const appHost: Host = {
  ownsTheme: true,
  ownsReminder: true,
  acceptsShortcut: () => true,
  async saveTextFile(name, text, type) {
    const path = await saveTextFile(name, text, type)
    // 데스크톱 앱이면 다운로드 폴더에 쓴다. 어디에 생겼는지 알아야 다른 컴퓨터로 옮긴다.
    return path ? { place: '다운로드 폴더', name: fileNameOf(path) } : null
  },
}

export const HostContext = createContext<Host>(appHost)

export function useHost(): Host {
  return useContext(HostContext)
}

/** 글을 쓰는 자리인지. 옵시디언 편집기는 입력 칸이 아니라 편집 가능한 요소다. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Node).nodeType !== 'number') return false
  const element = target as HTMLElement
  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (element.isContentEditable === true) return true
  // 흉내 낸 브라우저는 isContentEditable 을 모를 수 있다. 속성으로 한 번 더 본다.
  return (
    typeof element.closest === 'function' &&
    element.closest('[contenteditable]:not([contenteditable="false"])') !== null
  )
}
