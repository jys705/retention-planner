import type {
  GoalRow,
  ItemRow,
  PlannedReviewRow,
  Repository,
  ReviewRow,
} from './types'

function clone<T>(v: T): T {
  return structuredClone(v)
}

/**
 * 인메모리 구현. 개발과 테스트에서 쓴다.
 * SQLite 구현과 같은 계약 테스트를 통과해야 하므로 동작이 어긋나면 안 된다.
 */
export class MemoryRepository implements Repository {
  private goals = new Map<string, GoalRow>()
  private items = new Map<string, ItemRow>()
  private reviews = new Map<string, ReviewRow>()
  private planned = new Map<string, PlannedReviewRow>()
  private settings = new Map<string, string>()

  async init(): Promise<void> {}

  async close(): Promise<void> {}

  async listGoals(): Promise<GoalRow[]> {
    return [...this.goals.values()]
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1))
      .map(clone)
  }

  async getGoal(id: string): Promise<GoalRow | null> {
    const g = this.goals.get(id)
    return g ? clone(g) : null
  }

  async insertGoal(goal: GoalRow): Promise<void> {
    if (this.goals.has(goal.id)) {
      throw new Error(`goal 중복: ${goal.id}`)
    }
    this.goals.set(goal.id, clone(goal))
  }

  async updateGoal(id: string, patch: Partial<GoalRow>): Promise<void> {
    const cur = this.goals.get(id)
    if (!cur) return
    this.goals.set(id, { ...cur, ...clone(patch), id })
  }

  async deleteGoal(id: string): Promise<void> {
    if (!this.goals.delete(id)) return
    // ON DELETE SET NULL 과 같은 동작
    for (const [itemId, item] of this.items) {
      if (item.goal_id === id) {
        this.items.set(itemId, { ...item, goal_id: null })
      }
    }
  }

  async listItems(): Promise<ItemRow[]> {
    return [...this.items.values()]
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1))
      .map(clone)
  }

  async getItem(id: string): Promise<ItemRow | null> {
    const i = this.items.get(id)
    return i ? clone(i) : null
  }

  async insertItem(item: ItemRow): Promise<void> {
    if (this.items.has(item.id)) {
      throw new Error(`item 중복: ${item.id}`)
    }
    this.items.set(item.id, clone(item))
  }

  async updateItem(id: string, patch: Partial<ItemRow>): Promise<void> {
    const cur = this.items.get(id)
    if (!cur) return
    this.items.set(id, { ...cur, ...clone(patch), id })
  }

  async deleteItem(id: string): Promise<void> {
    if (!this.items.delete(id)) return
    // ON DELETE CASCADE 와 같은 동작
    for (const [reviewId, review] of this.reviews) {
      if (review.item_id === id) this.reviews.delete(reviewId)
    }
    for (const [plannedId, planned] of this.planned) {
      if (planned.item_id === id) this.planned.delete(plannedId)
    }
  }

  async listPlannedReviews(): Promise<PlannedReviewRow[]> {
    return [...this.planned.values()].sort(comparePlanned).map(clone)
  }

  async replacePlannedReviews(rows: PlannedReviewRow[]): Promise<void> {
    this.planned = new Map(
      rows.filter((r) => this.items.has(r.item_id)).map((r) => [r.id, clone(r)])
    )
  }

  async listReviews(): Promise<ReviewRow[]> {
    return [...this.reviews.values()].sort(compareReview).map(clone)
  }

  async listReviewsByItem(itemId: string): Promise<ReviewRow[]> {
    return [...this.reviews.values()]
      .filter((r) => r.item_id === itemId)
      .sort(compareReview)
      .map(clone)
  }

  async insertReview(review: ReviewRow): Promise<void> {
    if (this.reviews.has(review.id)) {
      throw new Error(`review 중복: ${review.id}`)
    }
    if (!this.items.has(review.item_id)) {
      throw new Error(`없는 항목의 평가: ${review.item_id}`)
    }
    this.reviews.set(review.id, clone(review))
  }
  async deleteReview(id: string): Promise<void> {
    this.reviews.delete(id)
  }


  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value)
  }

  async listSettings(): Promise<Record<string, string>> {
    return Object.fromEntries(this.settings)
  }

  async replaceAll(data: {
    goals: GoalRow[]
    items: ItemRow[]
    reviews: ReviewRow[]
    settings: Record<string, string>
  }): Promise<void> {
    this.goals = new Map(data.goals.map((g) => [g.id, clone(g)]))
    this.items = new Map(data.items.map((i) => [i.id, clone(i)]))
    this.reviews = new Map(data.reviews.map((r) => [r.id, clone(r)]))
    this.settings = new Map(Object.entries(data.settings))
    // 잡아둔 복습은 계산으로 다시 만드는 값이라 통째로 비운다.
    this.planned = new Map()
  }
}

function comparePlanned(a: PlannedReviewRow, b: PlannedReviewRow): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.item_id !== b.item_id) return a.item_id < b.item_id ? -1 : 1
  return a.ordinal - b.ordinal
}

function compareReview(a: ReviewRow, b: ReviewRow): number {
  if (a.reviewed_at !== b.reviewed_at) return a.reviewed_at < b.reviewed_at ? -1 : 1
  if (a.recorded_at !== b.recorded_at) return a.recorded_at < b.recorded_at ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
