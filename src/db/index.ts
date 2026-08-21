import { MemoryRepository } from './memory'
import { SqliteRepository } from './sqlite'
import type { Repository } from './types'

export * from './types'
export { MemoryRepository } from './memory'
export { SqliteRepository } from './sqlite'

/** Tauri 셸 안에서 도는지. 브라우저에서는 SQL 플러그인이 없다. */
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

let cached: Repository | null = null

/**
 * 환경에 맞는 저장소 하나를 고른다.
 * Tauri 안이면 SQLite, 브라우저면 인메모리를 쓴다.
 */
export async function getRepository(): Promise<Repository> {
  if (cached) return cached
  const repo: Repository = isTauri()
    ? new SqliteRepository()
    : new MemoryRepository()
  await repo.init()
  cached = repo
  return repo
}

export function resetRepositoryForTest(): void {
  cached = null
}
