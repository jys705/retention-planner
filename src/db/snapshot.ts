import { MemoryRepository } from './memory'
import type {
  GoalRow,
  ItemRow,
  PlannedReviewRow,
  Repository,
  ReviewRow,
  TombstoneRow,
} from './types'

/**
 * 기록 전체를 한 덩어리로 남긴 꼴.
 *
 * 브라우저 저장소와 옵시디언 플러그인 데이터가 이 꼴로 남는다.
 */
export interface Snapshot {
  goals: GoalRow[]
  items: ItemRow[]
  reviews: ReviewRow[]
  settings: Record<string, string>
  /** 잡아둔 복습. 계산으로 다시 만들 수 있지만 켜자마자 보여줄 수 있게 함께 남긴다. */
  planned?: PlannedReviewRow[]
  /** 지운 흔적. 이 칸이 생기기 전에 남긴 것에는 없다. */
  tombstones?: TombstoneRow[]
}

/**
 * 덩어리를 읽고 쓰는 곳.
 *
 * 남긴 것이 없으면 read 는 null 을 준다.
 */
export interface SnapshotStore {
  read(): Promise<unknown>
  write(snapshot: Snapshot): Promise<void>
}

/** 남아 있는 것이 덩어리 꼴이 아니다. */
export class SnapshotFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SnapshotFormatError'
  }
}

export interface SnapshotRepositoryOptions {
  /**
   * 남은 것을 못 읽을 때 빈 상태로 시작할지.
   *
   * 빈 상태로 시작하면 다음 쓰기가 원래 기록을 덮는다. 브라우저에서 열어 본 것이면 괜찮지만,
   * 진짜 기록을 담은 곳이면 멈추고 사람에게 알려야 한다.
   */
  startEmptyWhenUnreadable?: boolean
}

/**
 * 바뀔 때마다 기록 전체를 한 번에 남기는 저장소.
 *
 * 읽기와 계산은 인메모리 구현이 맡고, 쓰기가 끝날 때마다 덩어리를 통째로 넘긴다.
 * 그래서 계약은 인메모리 구현과 완전히 같다.
 */
export class SnapshotRepository implements Repository {
  private readonly inner = new MemoryRepository()
  private writing: Promise<void> = Promise.resolve()
  private readonly store: SnapshotStore
  private readonly startEmpty: boolean

  constructor(store: SnapshotStore, options: SnapshotRepositoryOptions = {}) {
    this.store = store
    this.startEmpty = options.startEmptyWhenUnreadable ?? false
  }

  async init(): Promise<void> {
    await this.inner.init()
    await this.reload()
  }

  /**
   * 남긴 것을 다시 읽어 지금 것과 갈아끼운다.
   *
   * 다른 프로그램이 저장한 곳을 고쳤을 때 쓴다. 쓰고 있던 것은 마저 쓰고 읽는다.
   */
  async reload(): Promise<void> {
    await this.writing
    let snapshot: Snapshot | null
    try {
      snapshot = parseSnapshot(await this.store.read())
    } catch (error) {
      if (!this.startEmpty) throw error
      snapshot = null
    }
    await this.inner.replaceAll({
      goals: snapshot?.goals ?? [],
      items: snapshot?.items ?? [],
      reviews: snapshot?.reviews ?? [],
      settings: snapshot?.settings ?? {},
      tombstones: snapshot?.tombstones ?? [],
    })
    await this.inner.replacePlannedReviews(snapshot?.planned ?? [])
  }

  /** 지금 기록 전체. */
  async snapshot(): Promise<Snapshot> {
    return {
      goals: await this.inner.listGoals(),
      items: await this.inner.listItems(),
      reviews: await this.inner.listReviews(),
      settings: await this.inner.listSettings(),
      planned: await this.inner.listPlannedReviews(),
      tombstones: await this.inner.listTombstones(),
    }
  }

  /** 쓰고 있는 것이 다 끝날 때까지 기다린다. */
  flush(): Promise<void> {
    return this.writing
  }

  async close(): Promise<void> {
    await this.writing
    await this.inner.close()
  }

  /**
   * 쓰기는 하나씩 차례로 한다.
   *
   * 저장이 비동기인 곳에서는 늦게 시작한 쓰기가 먼저 끝나 예전 내용으로 덮을 수 있다.
   * 차례가 오면 그때의 전체를 쓰므로 마지막에 끝나는 쓰기가 늘 마지막 상태다.
   */
  private save(): Promise<void> {
    const run = this.writing.then(async () => {
      await this.store.write(await this.snapshot())
    })
    this.writing = run.catch(() => {})
    return run
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

  listPlannedReviews(): Promise<PlannedReviewRow[]> {
    return this.inner.listPlannedReviews()
  }

  async replacePlannedReviews(rows: PlannedReviewRow[]): Promise<void> {
    await this.inner.replacePlannedReviews(rows)
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

  async deleteReview(id: string): Promise<void> {
    await this.inner.deleteReview(id)
    await this.save()
  }

  listTombstones(): Promise<TombstoneRow[]> {
    return this.inner.listTombstones()
  }

  async addTombstones(rows: TombstoneRow[]): Promise<void> {
    await this.inner.addTombstones(rows)
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

  async replaceAll(data: {
    goals: GoalRow[]
    items: ItemRow[]
    reviews: ReviewRow[]
    settings: Record<string, string>
    tombstones?: TombstoneRow[]
  }): Promise<void> {
    await this.inner.replaceAll(data)
    await this.save()
  }
}

/**
 * 남아 있던 것을 덩어리로 읽는다. 아무것도 없었으면 null.
 *
 * 칸이 아예 없으면 빈 것으로 본다. 예전에 남긴 것에는 나중에 생긴 칸이 없다.
 * 칸이 있는데 꼴이 다르면 읽지 않는다. 빈 것으로 읽으면 그 칸의 기록을 잃는다.
 */
export function parseSnapshot(value: unknown): Snapshot | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new SnapshotFormatError('남아 있는 기록이 알아볼 수 있는 꼴이 아니에요.')
  }
  const raw = value as Record<string, unknown>
  const list = <T>(key: string): T[] => {
    const field = raw[key]
    if (field === undefined || field === null) return []
    if (!Array.isArray(field)) {
      throw new SnapshotFormatError(`남아 있는 기록의 ${key} 칸을 읽을 수 없어요.`)
    }
    return field as T[]
  }
  const settings = raw.settings
  if (
    settings !== undefined &&
    settings !== null &&
    (typeof settings !== 'object' || Array.isArray(settings))
  ) {
    throw new SnapshotFormatError('남아 있는 기록의 settings 칸을 읽을 수 없어요.')
  }
  return {
    goals: list<GoalRow>('goals'),
    items: list<ItemRow>('items'),
    reviews: list<ReviewRow>('reviews'),
    settings: (settings as Record<string, string> | null | undefined) ?? {},
    planned: list<PlannedReviewRow>('planned'),
    tombstones: list<TombstoneRow>('tombstones'),
  }
}
