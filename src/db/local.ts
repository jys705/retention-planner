import { SnapshotRepository, type SnapshotStore } from './snapshot'

const STORAGE_KEY = 'retention-planner:v1'

/**
 * 브라우저에서 도는 동안 데이터를 남겨 둔다.
 *
 * Tauri 셸 안에서는 SQLite 를 쓴다. 이건 셸 없이 브라우저로 열었을 때
 * 새로고침 한 번에 적어둔 게 사라지지 않게 하려는 것이다.
 * 계약은 인메모리 구현과 완전히 같고, 바뀔 때마다 통째로 한 번 저장한다.
 */
export class LocalRepository extends SnapshotRepository {
  constructor() {
    // 저장된 내용을 못 읽으면 빈 상태로 시작한다. 지우지는 않는다.
    super(browserStore, { startEmptyWhenUnreadable: true })
  }
}

const browserStore: SnapshotStore = {
  async read() {
    const raw = readRaw()
    return raw ? JSON.parse(raw) : null
  },
  async write(snapshot) {
    writeRaw(JSON.stringify(snapshot))
  },
}

function readRaw(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

function writeRaw(value: string): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value)
  } catch {
    // 저장 공간이 꽉 찼거나 막혀 있으면 이번 판만 메모리로 돈다.
  }
}
