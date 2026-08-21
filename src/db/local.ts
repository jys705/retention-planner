import { MemoryRepository } from './memory'
import type {
  GoalRow,
  ItemRow,
  Repository,
  ReviewRow,
} from './types'

const STORAGE_KEY = 'retention-planner:v1'

interface Snapshot {
  goals: GoalRow[]
  items: ItemRow[]
  reviews: ReviewRow[]
  settings: Record<string, string>
}

/**
 * 브라우저에서 도는 동안 데이터를 남겨 둔다.
 *
 * Tauri 셸 안에서는 SQLite 를 쓴다. 이건 셸 없이 브라우저로 열었을 때
 * 새로고침 한 번에 적어둔 게 사라지지 않게 하려는 것이다.
 * 계약은 인메모리 구현과 완전히 같고, 바뀔 때마다 통째로 한 번 저장한다.
 */
export class LocalRepository implements Repository {
  private readonly inner = new MemoryRepository()

  async init(): Promise<void> {
    await this.inner.init()
    const raw = readRaw()
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Snapshot
      await this.inner.replaceAll({
        goals: parsed.goals ?? [],
        items: parsed.items ?? [],
        reviews: parsed.reviews ?? [],
        settings: parsed.settings ?? {},
      })
    } catch {
      // 저장된 내용을 못 읽으면 빈 상태로 시작한다. 지우지는 않는다.
    }
  }

  async close(): Promise<void> {
    await this.inner.close()
  }

  private async save(): Promise<void> {
    const snapshot: Snapshot = {
      goals: await this.inner.listGoals(),
      items: await this.inner.listItems(),
      reviews: await this.inner.listReviews(),
      settings: await this.inner.listSettings(),
    }
    writeRaw(JSON.stringify(snapshot))
  }

  listGoals(): Promise<GoalRow[]> {
    return this.inner.listGoals()
  }

  getGoal(id: string): Promise<GoalRow | null> {
    return this.inner.getGoal(id)
  }

  async insertGoal(goal: GoalRow): Promise<void> {
    await this.inner.insertGoal(goal)
    await this.save()
  }

  async updateGoal(id: string, patch: Partial<GoalRow>): Promise<void> {
    await this.inner.updateGoal(id, patch)
    await this.save()
  }

  async deleteGoal(id: string): Promise<void> {
    await this.inner.deleteGoal(id)
    await this.save()
  }

  listItems(): Promise<ItemRow[]> {
    return this.inner.listItems()
  }

  getItem(id: string): Promise<ItemRow | null> {
    return this.inner.getItem(id)
  }

  async insertItem(item: ItemRow): Promise<void> {
    await this.inner.insertItem(item)
    await this.save()
  }

  async updateItem(id: string, patch: Partial<ItemRow>): Promise<void> {
    await this.inner.updateItem(id, patch)
    await this.save()
  }

  async deleteItem(id: string): Promise<void> {
    await this.inner.deleteItem(id)
    await this.save()
  }

  listReviews(): Promise<ReviewRow[]> {
    return this.inner.listReviews()
  }

  listReviewsByItem(itemId: string): Promise<ReviewRow[]> {
    return this.inner.listReviewsByItem(itemId)
  }

  async insertReview(review: ReviewRow): Promise<void> {
    await this.inner.insertReview(review)
    await this.save()
  }

  getSetting(key: string): Promise<string | null> {
    return this.inner.getSetting(key)
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.inner.setSetting(key, value)
    await this.save()
  }

  listSettings(): Promise<Record<string, string>> {
    return this.inner.listSettings()
  }

  async replaceAll(data: Snapshot): Promise<void> {
    await this.inner.replaceAll(data)
    await this.save()
  }
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
