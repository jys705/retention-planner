import { LocalRepository } from './local'
import { MemoryRepository } from './memory'
import { SqliteRepository } from './sqlite'
import type { Repository } from './types'

export * from './types'
export { LocalRepository } from './local'
export { MemoryRepository } from './memory'
export { SqliteRepository } from './sqlite'
export {
  parseSnapshot,
  SnapshotFormatError,
  SnapshotRepository,
  type Snapshot,
  type SnapshotStore,
} from './snapshot'

/** Tauri 셸 안에서 도는지. 브라우저에서는 SQL 플러그인이 없다. */
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

let cached: Repository | null = null

function hasLocalStorage(): boolean {
  try {
    return typeof globalThis.localStorage !== 'undefined'
  } catch {
    return false
  }
}

/**
 * 환경에 맞는 저장소 하나를 고른다.
 *
 * Tauri 안이면 SQLite, 브라우저면 localStorage 로 남기고,
 * 테스트처럼 둘 다 없는 곳에서는 인메모리로 돈다. 셋 다 같은 계약을 만족한다.
 */
export async function getRepository(): Promise<Repository> {
  if (cached) return cached
  const repo: Repository = isTauri()
    ? new SqliteRepository()
    : hasLocalStorage()
      ? new LocalRepository()
      : new MemoryRepository()
  await repo.init()
  cached = repo
  return repo
}

/**
 * 저장소를 밖에서 정해 준다.
 *
 * 옵시디언 플러그인처럼 저장할 곳을 껍데기가 쥐고 있을 때 쓴다. 넘기기 전에 init 을
 * 끝내 둔다. 못 읽었을 때 어떻게 할지는 껍데기가 정해야 한다.
 */
export function provideRepository(repo: Repository): void {
  cached = repo
}

export function resetRepositoryForTest(): void {
  cached = null
}
