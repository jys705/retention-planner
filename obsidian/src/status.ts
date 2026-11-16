import { create } from 'zustand'

/**
 * 플러그인이 기록을 읽었는지.
 *
 * 다 읽기 전에는 화면을 띄우지 않는다. 앱 화면은 뜨자마자 기록을 읽으러 가는데, 그때
 * 플러그인 저장소가 아직 없으면 브라우저 저장소를 잡고 그대로 굳는다.
 * 못 읽었으면 아무것도 쓰지 않는다. 쓰면 읽지 못한 원래 기록을 덮는다.
 */
export type PluginStatus =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | {
      kind: 'failed'
      /** 사람이 읽을 까닭. */
      reason: string
      /** 읽다가 난 오류 글 그대로. 영어일 수 있어 '자세히' 안에 둔다. */
      detail?: string
      /** 기록이 담긴 파일의 보관함 안 경로. 사람이 찾아가 볼 수 있게 알린다. */
      file: string
    }

export const usePluginStatus = create<{ status: PluginStatus }>(() => ({
  status: { kind: 'loading' },
}))

export function setPluginStatus(status: PluginStatus): void {
  usePluginStatus.setState({ status })
}
