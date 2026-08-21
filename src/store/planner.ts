import { create } from 'zustand'
import { defaultFsrs } from '../core/fsrs/fsrs6'
import type { Grade, MemoryState } from '../core/fsrs/types'
import { resolveHorizon, type Horizon } from '../core/horizon/horizon'
import {
  applyReview,
  initialSchedule,
  schedule,
  type Intensity,
} from '../core/policy/constraints'
import {
  spread,
  type SpreadCandidate,
  type SpreadResult,
} from '../core/spread/assign'
import {
  feasibleInterval,
  type FeasibleInterval,
} from '../core/spread/feasible'
import { applyDailyCap, type CapCandidate } from '../core/spread/cap'
import { fuzzDue } from '../core/spread/fuzz'
import { replayState } from '../core/simulate/replay'
import { getRepository } from '../db'
import type {
  GoalRow,
  ItemRow,
  PlannedReviewRow,
  Repository,
  ReviewRow,
  DueKind,
  DueSource,
} from '../db/types'
import {
  diffDays,
  fromEpochDay,
  maxDate,
  toEpochDay,
  todayLocal,
  type DateOnly,
} from '../lib/date'
import {
  effectiveConfig,
  isActive,
  memoryStateOf,
  spreadGroupKey,
  type EffectiveConfig,
} from '../lib/domain'
import {
  DEFAULT_SETTINGS,
  parseSettings,
  serializeSetting,
  type Settings,
} from '../lib/settings'
import type { Backup } from '../lib/transfer'
import { newId } from './ids'

export interface NewItemDraft {
  title: string
  memo?: string
  goalId?: string | null
  firstStudiedAt?: DateOnly
  horizon?: Horizon | null
  intensity?: Intensity | number | null
}

export interface NewGoalDraft {
  name: string
  horizon: Horizon
  intensity?: Intensity
  minReviews?: number
  color?: string | null
}

interface PlannerState {
  ready: boolean
  today: DateOnly
  goals: GoalRow[]
  items: ItemRow[]
  reviews: ReviewRow[]
  /** 앞으로 잡아둔 복습. 다시 계산할 때마다 통째로 새로 만든다. */
  planned: PlannedReviewRow[]
  settings: Settings

  load(): Promise<void>
  setToday(date: DateOnly): void
  addItem(draft: NewItemDraft): Promise<ItemRow>
  rateItem(
    itemId: string,
    grade: Grade,
    options?: { reviewedAt?: DateOnly; memo?: string }
  ): Promise<void>
  createGoal(draft: NewGoalDraft): Promise<GoalRow>
  updateGoal(id: string, patch: Partial<GoalRow>): Promise<void>
  updateItem(id: string, patch: Partial<ItemRow>): Promise<void>
  deleteItem(id: string): Promise<void>
  attachItemsToGoal(goalId: string, itemIds: string[]): Promise<void>
  saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>
  importAll(backup: Backup): Promise<void>
  recomputeAll(): Promise<void>
}

let repository: Repository | null = null

async function repo(): Promise<Repository> {
  repository ??= await getRepository()
  return repository
}

/** 테스트에서 저장소를 새로 물릴 때 쓴다. */
export function resetPlannerForTest(): void {
  repository = null
}

function nowIso(): string {
  return new Date().toISOString()
}

export const usePlanner = create<PlannerState>((set, get) => ({
  ready: false,
  today: todayLocal(),
  goals: [],
  items: [],
  reviews: [],
  planned: [],
  settings: DEFAULT_SETTINGS,

  async load() {
    const db = await repo()
    const [goals, items, reviews, rawSettings] = await Promise.all([
      db.listGoals(),
      db.listItems(),
      db.listReviews(),
      db.listSettings(),
    ])
    set({
      goals,
      items,
      reviews,
      settings: parseSettings(rawSettings),
      today: todayLocal(),
      ready: true,
    })
    await get().recomputeAll()
  },

  setToday(date) {
    set({ today: date })
  },

  async addItem(draft) {
    const db = await repo()
    const { settings, today } = get()
    const goalId = draft.goalId ?? null
    const goal = goalId ? (get().goals.find((g) => g.id === goalId) ?? null) : null
    const firstStudiedAt = draft.firstStudiedAt ?? today

    const row: ItemRow = {
      id: newId('itm'),
      goal_id: goalId,
      title: draft.title.trim(),
      memo: draft.memo ?? '',
      tags: '[]',
      created_at: nowIso(),
      first_studied_at: firstStudiedAt,
      horizon_kind: draft.horizon ? draft.horizon.kind : null,
      ready_at: horizonReadyAt(draft.horizon ?? null),
      hold_until: horizonHoldUntil(draft.horizon ?? null),
      target_retention: null,
      intensity:
        typeof draft.intensity === 'string' ? draft.intensity : null,
      min_reviews: null,
      state: 'review',
      stability: null,
      difficulty: null,
      due: null,
      due_kind: null,
      due_source: null,
      last_review: null,
      reps: 1,
      lapses: 0,
      reps_since_goal: 1,
      goal_risk: null,
      archived_at: null,
    }

    // 처음 공부한 날에 '알맞음' 으로 한 번 본 것으로 친다.
    const config = effectiveConfig(row, goal, settings)
    const initial = initialSchedule({
      firstStudiedAt,
      horizon: config.horizon,
      intensity: config.intensity,
      targetRetention: config.targetRetention,
      minReviews: config.minReviews,
      maxIntervalDays: config.maxIntervalDays,
      bufferDays: settings.bufferDays,
    })

    row.stability = initial.state.stability
    row.difficulty = initial.state.difficulty
    row.due = initial.due
    row.due_kind = initial.dueKind
    row.due_source = 'fsrs'
    row.last_review = firstStudiedAt

    await db.insertItem(row)
    set({ items: [...get().items, row] })
    if (goalId) await get().saveSetting('lastGoalId', goalId)
    await get().recomputeAll()
    return get().items.find((i) => i.id === row.id) ?? row
  },

  async rateItem(itemId, grade, options = {}) {
    const db = await repo()
    const { settings, today } = get()
    const item = get().items.find((i) => i.id === itemId)
    if (!item) return

    const goal = item.goal_id
      ? (get().goals.find((g) => g.id === item.goal_id) ?? null)
      : null
    const config = effectiveConfig(item, goal, settings)
    const reviewedAt = clampReviewDate(
      options.reviewedAt ?? today,
      item.last_review,
      today
    )
    const before = memoryStateOf(item)

    const applied = applyReview({
      reviewedAt,
      lastReview: item.last_review,
      state: before,
      grade,
      horizon: config.horizon,
      intensity: config.intensity,
      targetRetention: config.targetRetention,
      minReviews: config.minReviews,
      repsSinceGoal: item.reps_since_goal,
      maxIntervalDays: config.maxIntervalDays,
      bufferDays: settings.bufferDays,
    })

    const review: ReviewRow = {
      id: newId('rev'),
      item_id: itemId,
      reviewed_at: reviewedAt,
      recorded_at: nowIso(),
      rating: grade,
      state_before: item.state,
      s_before: before?.stability ?? null,
      d_before: before?.difficulty ?? null,
      s_after: applied.state.stability,
      d_after: applied.state.difficulty,
      elapsed_days: applied.elapsedDays,
      scheduled_days: item.due ? diffDays(reviewedAt, item.due) : 0,
      r_at_review: applied.retrievabilityAtReview,
      next_interval: applied.intervalDays,
      memo_snapshot: options.memo ?? null,
    }

    const patch: Partial<ItemRow> = {
      stability: applied.state.stability,
      difficulty: applied.state.difficulty,
      due: applied.due,
      due_kind: applied.dueKind,
      due_source: 'fsrs',
      last_review: reviewedAt,
      reps: item.reps + 1,
      lapses: item.lapses + (grade === 1 ? 1 : 0),
      reps_since_goal: item.reps_since_goal + 1,
      state: nextItemState(applied.inPlateau, applied.postGoalReached, grade, settings),
      ...(options.memo ? { memo: options.memo } : {}),
      ...(applied.postGoalReached && settings.postGoalMode === 'archive'
        ? { archived_at: nowIso() }
        : {}),
    }

    await db.insertReview(review)
    await db.updateItem(itemId, patch)

    set({
      reviews: [...get().reviews, review],
      items: get().items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    })
    await get().saveSetting('ratingCount', settings.ratingCount + 1)
    await get().recomputeAll()
  },

  async createGoal(draft) {
    const db = await repo()
    const { settings } = get()
    const row: GoalRow = {
      id: newId('goal'),
      name: draft.name.trim(),
      horizon_kind: draft.horizon.kind,
      ready_at: horizonReadyAt(draft.horizon),
      hold_until: horizonHoldUntil(draft.horizon),
      target_retention: settings.targetRetention,
      intensity: draft.intensity ?? settings.defaultIntensity,
      min_reviews: draft.minReviews ?? settings.minReviews,
      max_interval_days: settings.maxIntervalDays,
      post_goal_mode: settings.postGoalMode,
      color: draft.color ?? null,
      created_at: nowIso(),
      archived_at: null,
    }
    await db.insertGoal(row)
    set({ goals: [...get().goals, row] })
    return row
  },

  async updateGoal(id, patch) {
    const db = await repo()
    await db.updateGoal(id, patch)
    set({
      goals: get().goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    })
    await get().recomputeAll()
  },

  async updateItem(id, patch) {
    const db = await repo()
    await db.updateItem(id, patch)
    set({
      items: get().items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })
    await get().recomputeAll()
  },

  async deleteItem(id) {
    const db = await repo()
    await db.deleteItem(id)
    set({
      items: get().items.filter((i) => i.id !== id),
      reviews: get().reviews.filter((r) => r.item_id !== id),
    })
    await get().recomputeAll()
  },

  async attachItemsToGoal(goalId, itemIds) {
    const db = await repo()
    for (const id of itemIds) {
      await db.updateItem(id, { goal_id: goalId })
    }
    set({
      items: get().items.map((i) =>
        itemIds.includes(i.id) ? { ...i, goal_id: goalId } : i
      ),
    })
    await get().recomputeAll()
  },

  async saveSetting(key, value) {
    const db = await repo()
    await db.setSetting(key, serializeSetting(value))
    set({ settings: { ...get().settings, [key]: value } })
  },

  async importAll(backup) {
    const db = await repo()
    await db.replaceAll({
      goals: backup.goals,
      items: backup.items,
      reviews: backup.reviews,
      settings: backup.settings,
    })
    set({ ready: false })
    await get().load()
  },

  async recomputeAll() {
    const db = await repo()
    const { items, goals, settings, today } = get()
    const { patches, planned } = computeSpread(items, goals, settings, today)

    for (const [id, patch] of patches) {
      await db.updateItem(id, patch)
    }
    await db.replacePlannedReviews(planned)

    set({
      planned,
      ...(patches.size > 0
        ? {
            items: get().items.map((i) => {
              const patch = patches.get(i.id)
              return patch ? { ...i, ...patch } : i
            }),
          }
        : {}),
    })
  },
}))

function horizonReadyAt(horizon: Horizon | null): DateOnly | null {
  if (!horizon) return null
  if (horizon.kind === 'date') return horizon.at
  if (horizon.kind === 'window') return horizon.readyAt
  return null
}

function horizonHoldUntil(horizon: Horizon | null): DateOnly | null {
  if (!horizon) return null
  if (horizon.kind === 'date') return horizon.at
  if (horizon.kind === 'window') return horizon.holdUntil
  return null
}

/** 이력 순서를 보존하고 미래로는 기록하지 못하게 막는다. */
function clampReviewDate(
  wanted: DateOnly,
  lastReview: DateOnly | null,
  today: DateOnly
): DateOnly {
  let date = wanted > today ? today : wanted
  if (lastReview && date < lastReview) date = lastReview
  return date
}

function nextItemState(
  inPlateau: boolean,
  postGoalReached: boolean,
  grade: Grade,
  settings: Settings
): ItemRow['state'] {
  if (postGoalReached) {
    return settings.postGoalMode === 'archive' ? 'archived' : 'maintaining'
  }
  if (inPlateau) return 'holding'
  return grade === 1 ? 'relearning' : 'review'
}

/**
 * 날짜 조정을 걷어냈을 때 FSRS 와 제약만으로 잡히는 날.
 *
 * 저장된 `due` 를 쓰면 안 된다. 그건 이미 조정을 거친 값이라
 * "조정 전과 비교" 가 자기 자신과의 비교가 되고, 다시 계산할 때마다
 * 그룹에 들었다 빠졌다 하며 일정이 흔들린다.
 */
function naturalScheduleOf(
  item: ItemRow,
  config: EffectiveConfig,
  state: MemoryState,
  settings: Settings
) {
  return schedule({
    from: item.last_review ?? item.first_studied_at,
    state,
    horizon: config.horizon,
    intensity: config.intensity,
    targetRetention: config.targetRetention,
    minReviews: config.minReviews,
    repsSinceGoal: item.reps_since_goal,
    bufferDays: settings.bufferDays,
    maxIntervalDays: config.maxIntervalDays,
  })
}

/**
 * 마감선이 끌어당긴 항목인지.
 *
 * FSRS 는 더 뒤를 원했는데 마감선 때문에 앞으로 당겨진 항목들이 곧 몰림의 정체다.
 * 이것들만 편다. 아직 평소 간격으로 도는 항목은 그대로 둔다.
 */
function isPulledByDeadline(dueKind: DueKind): boolean {
  return dueKind === 'deadline_pull' || dueKind === 'final_check'
}

/**
 * 같은 준비 완료일을 향하는 항목들을 서로 다른 날로 편다.
 *
 * 목표가 없는 항목은 몰림이 구조적으로 생기지 않으므로 가볍게 흔들기만 한다.
 * 평가 직후, 항목이나 목표가 바뀔 때, 앱을 켤 때 다시 돈다.
 */
export interface SpreadOutcome {
  patches: Map<string, Partial<ItemRow>>
  /** 항목마다 앞으로 잡아둔 복습. 한 번으로 부족한 항목에는 둘이 들어간다. */
  planned: PlannedReviewRow[]
}

export function computeSpread(
  items: ItemRow[],
  goals: GoalRow[],
  settings: Settings,
  today: DateOnly
): SpreadOutcome {
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const active = items.filter(isActive)
  const itemsById = new Map(active.map((i) => [i.id, i]))
  const patches = new Map<string, Partial<ItemRow>>()
  // 항목별로 잡아둔 날짜들. 대부분 하나지만 부족한 항목에는 둘이 들어간다.
  const extraDates = new Map<string, DateOnly[]>()

  const groups = new Map<string, SpreadCandidate[]>()
  const openItems: ItemRow[] = []
  // 날짜 조정이 자리를 잡아준 항목들. 뒤에 오는 하루 상한 층이 이 구간을 넘으면 안 된다.
  const placedIntervals = new Map<string, FeasibleInterval>()

  for (const item of active) {
    const goal = item.goal_id ? (goalById.get(item.goal_id) ?? null) : null
    const config = effectiveConfig(item, goal, settings)
    const key = spreadGroupKey(config)
    const state = memoryStateOf(item)
    if (key === null || state === null || item.due === null) {
      if (item.due !== null) openItems.push(item)
      continue
    }

    const interval = feasibleInterval({
      itemId: item.id,
      state,
      anchor: item.last_review ?? item.first_studied_at,
      readyAt: key,
      notBefore: today,
      bufferDays: settings.bufferDays,
      targetRetention: config.targetRetention,
    })

    // 옮길 수 있는 구간은 마무리 복습에 대한 것이다.
    // 아직 평소 간격으로 도는 항목은 건드리지 않는다. 그쪽은 몰림의 원인이 아니다.
    const natural = naturalScheduleOf(item, config, state, settings)
    if (!isPulledByDeadline(natural.dueKind) && !interval.atRisk) continue

    const list = groups.get(key) ?? []
    list.push({ interval, naturalDue: natural.due })
    groups.set(key, list)
    placedIntervals.set(item.id, interval)
  }

  for (const candidates of groups.values()) {
    // 마감선이 아직 안 왔고 실제로 몰릴 여지가 있을 때만 편다.
    const result = spread(candidates)
    const moved = new Set(result.movedItemIds)
    for (const [itemId, dates] of groupAssignments(result.assignments)) {
      extraDates.set(itemId, dates)
    }
    for (const candidate of candidates) {
      const id = candidate.interval.itemId
      const placed = result.primaryDue[id]
      if (placed === undefined) continue
      const item = active.find((i) => i.id === id)
      if (!item) continue

      const patch: Partial<ItemRow> = {}
      const source: DueSource = moved.has(id) ? 'spread' : 'fsrs'
      if (item.due !== placed) patch.due = placed
      if (item.due_source !== source) patch.due_source = source
      const risk = candidate.interval.atRisk ? 'at_risk' : 'safe'
      if (item.goal_risk !== risk) patch.goal_risk = risk
      if (candidate.interval.atRisk && item.due_kind !== 'deadline_pull') {
        patch.due_kind = 'deadline_pull'
      }
      if (Object.keys(patch).length > 0) patches.set(id, patch)
    }
  }

  // 목표가 없는 항목들: 같은 날에 쌓인 만큼만 가볍게 흔든다.
  const load: Record<DateOnly, number> = {}
  for (const item of active) {
    const key = patches.get(item.id)?.due ?? item.due
    if (key) load[key] = (load[key] ?? 0) + 1
  }
  for (const item of openItems) {
    if (!item.due || !item.last_review) continue
    const intervalDays = diffDays(item.last_review, item.due)
    if (intervalDays < 2.5) continue
    const moved = fuzzDue({
      from: item.last_review,
      intervalDays,
      dailyLoad: load,
      notBefore: today,
    })
    if (moved !== item.due) {
      load[item.due] = Math.max(0, (load[item.due] ?? 1) - 1)
      load[moved] = (load[moved] ?? 0) + 1
      patches.set(item.id, {
        ...(patches.get(item.id) ?? {}),
        due: moved,
        due_source: 'spread',
      })
    }
  }

  // 마지막으로 모든 목표를 합쳐서 하루 총량을 본다.
  // 각 목표가 잘 펴져 있어도 셋이 겹치면 하루에 서른 개가 될 수 있다.
  const capCandidates: CapCandidate[] = []
  for (const item of active) {
    const due = patches.get(item.id)?.due ?? item.due
    if (!due || due < today) continue
    const goal = item.goal_id ? (goalById.get(item.goal_id) ?? null) : null
    const config = effectiveConfig(item, goal, settings)
    const resolved = resolveHorizon(config.horizon)
    const state = memoryStateOf(item)

    // 앞 층이 잡아준 구간이 있으면 그 밖으로는 못 나간다.
    // 구간의 이른 쪽 끝은 "이보다 일찍 보면 목표한 날 기억률이 목표치에 못 미친다" 는 선이다.
    const placed = placedIntervals.get(item.id)
    capCandidates.push({
      itemId: item.id,
      date: due,
      notBefore: placed
        ? maxDate(today, fromEpochDay(placed.earliest))
        : today,
      notAfter: placed
        ? fromEpochDay(placed.latest)
        : Number.isFinite(resolved.readyAt)
          ? fromEpochDay(resolved.readyAt - settings.bufferDays)
          : null,
      pushPriority: pushPriorityOf(item, resolved.readyAt, state, today),
    })
  }

  const capped = applyDailyCap(capCandidates, settings.dailyCap)
  for (const [itemId, date] of Object.entries(capped.moved)) {
    const before = patches.get(itemId)?.due ?? itemsById.get(itemId)?.due
    patches.set(itemId, {
      ...(patches.get(itemId) ?? {}),
      due: date,
      due_source: 'spread',
    })
    // 상한이 첫 날짜를 옮겼으면 잡아둔 목록의 첫 칸도 따라 움직인다.
    const dates = extraDates.get(itemId)
    if (dates && before) {
      const at = dates.indexOf(before)
      if (at >= 0) {
        const next = [...dates]
        next[at] = date
        next.sort()
        extraDates.set(itemId, next)
      }
    }
  }

  const planned = buildPlannedReviews(active, patches, extraDates)
  return { patches, planned }
}

/** 배정 결과를 항목별 날짜 목록으로 모은다. */
function groupAssignments(
  assignments: readonly { itemId: string; date: DateOnly; ordinal: number }[]
): Map<string, DateOnly[]> {
  const byItem = new Map<string, DateOnly[]>()
  for (const a of [...assignments].sort((x, y) => x.ordinal - y.ordinal)) {
    byItem.set(a.itemId, [...(byItem.get(a.itemId) ?? []), a.date])
  }
  for (const [id, dates] of byItem) byItem.set(id, [...new Set(dates)].sort())
  return byItem
}

/**
 * 잡아둔 복습 목록을 만든다.
 *
 * 대부분의 항목은 다음 날짜 하나뿐이고, 한 번으로 부족한 항목만 둘을 갖는다.
 * `items.due` 는 이 중 가장 이른 날짜를 그대로 담아둔 값이다.
 */
function buildPlannedReviews(
  active: ItemRow[],
  patches: Map<string, Partial<ItemRow>>,
  extraDates: Map<string, DateOnly[]>
): PlannedReviewRow[] {
  const rows: PlannedReviewRow[] = []
  for (const item of active) {
    const patch = patches.get(item.id)
    const due = patch?.due ?? item.due
    if (!due) continue
    const kind = patch?.due_kind ?? item.due_kind ?? 'normal'
    const source = patch?.due_source ?? item.due_source ?? 'fsrs'
    const dates = extraDates.get(item.id) ?? [due]
    dates.forEach((date, ordinal) => {
      rows.push({
        // 계산으로 다시 만드는 값이라 id 도 계산해서 만든다. 다시 돌려도 같은 id 다.
        id: `${item.id}#${ordinal}`,
        item_id: item.id,
        date,
        ordinal,
        kind,
        source,
      })
    })
  }
  return rows.sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      (a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0) ||
      a.ordinal - b.ordinal
  )
}

/**
 * 하루가 넘칠 때 어느 항목부터 미룰지.
 *
 * 큰 값이 먼저 밀린다. 이미 충분히 기억하고 있는 항목이 가장 먼저 밀리고,
 * 목표한 날에 기억을 못 지킬 위험이 있는 항목은 끝까지 남긴다.
 */
function pushPriorityOf(
  item: ItemRow,
  readyAtDay: number,
  state: MemoryState | null,
  today: DateOnly
): number {
  if (item.due_kind === 'deadline_pull') return 0
  if (item.goal_risk === 'at_risk') return 1
  if (item.due_kind === 'final_check') return 5

  // 목표가 가까울수록 덜 밀린다.
  if (Number.isFinite(readyAtDay)) {
    const daysLeft = readyAtDay - toEpochDay(today)
    if (daysLeft <= 7) return 2
    if (daysLeft <= 30) return 3
  }

  // 지금 기억률이 높을수록 미뤄도 덜 아쉽다.
  if (state && item.last_review) {
    const elapsed = Math.max(0, diffDays(item.last_review, today))
    const retention = defaultFsrs.retrievability(elapsed, state.stability)
    return retention >= 0.85 ? 4 : 3
  }
  return 3
}

/**
 * 목표 하나에 대해 날짜 조정 결과를 다시 계산해서 그대로 돌려준다.
 *
 * 조정 전 분포와 봉우리가 함께 나온다. 목표 상세의 "조정 전과 비교" 토글과
 * "가장 몰리는 날" 한 줄이 이 값을 쓴다.
 */
export function spreadPreview(
  items: ItemRow[],
  goals: GoalRow[],
  settings: Settings,
  today: DateOnly,
  readyAt: DateOnly
): SpreadResult | null {
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const candidates: SpreadCandidate[] = []

  for (const item of items.filter(isActive)) {
    const goal = item.goal_id ? (goalById.get(item.goal_id) ?? null) : null
    const config = effectiveConfig(item, goal, settings)
    if (spreadGroupKey(config) !== readyAt) continue
    const state = memoryStateOf(item)
    if (!state || item.due === null) continue

    const interval = feasibleInterval({
      itemId: item.id,
      state,
      anchor: item.last_review ?? item.first_studied_at,
      readyAt,
      notBefore: today,
      bufferDays: settings.bufferDays,
      targetRetention: config.targetRetention,
    })
    const natural = naturalScheduleOf(item, config, state, settings)
    if (!isPulledByDeadline(natural.dueKind) && !interval.atRisk) continue
    candidates.push({ interval, naturalDue: natural.due })
  }

  return candidates.length === 0 ? null : spread(candidates)
}

/** 오늘 볼 항목. 연체된 것도 함께 올린다. */
export function selectTodayItems(state: {
  items: ItemRow[]
  today: DateOnly
}): ItemRow[] {
  return state.items
    .filter(isActive)
    .filter((i) => i.due !== null && i.due <= state.today)
    .sort((a, b) => {
      const rank = badgeRank(b.due_kind, b.goal_risk) - badgeRank(a.due_kind, a.goal_risk)
      if (rank !== 0) return rank
      if (a.due !== b.due) return (a.due ?? '') < (b.due ?? '') ? -1 : 1
      return a.created_at < b.created_at ? -1 : 1
    })
}

function badgeRank(kind: DueKind | null, risk: string | null): number {
  if (risk === 'at_risk') return 3
  if (kind === 'deadline_pull') return 2
  if (kind === 'final_check') return 0
  return 1
}

/** 앞으로 볼 날들. 오늘 할 게 없을 때 다음이 언제인지 알려준다. */
export function selectUpcoming(
  items: ItemRow[],
  today: DateOnly,
  limit = 3
): { date: DateOnly; count: number }[] {
  const counts = new Map<DateOnly, number>()
  for (const item of items) {
    if (!isActive(item) || !item.due || item.due <= today) continue
    counts.set(item.due, (counts.get(item.due) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([date, count]) => ({ date, count }))
}

/** 활성 항목들의 지금 기억률 평균. 오늘 화면 머리에 걸리는 값이다. */
export function selectOverallRetention(
  items: ItemRow[],
  today: DateOnly
): number {
  const active = items.filter(
    (i) => isActive(i) && i.stability !== null && i.last_review !== null
  )
  if (active.length === 0) return 0
  const total = active.reduce((sum, item) => {
    const elapsed = Math.max(0, diffDays(item.last_review!, today))
    return sum + defaultFsrs.retrievability(elapsed, item.stability!)
  }, 0)
  return total / active.length
}

/** 저장된 상태가 이력과 어긋나지 않는지 확인할 때 쓴다. */
export function stateFromHistory(
  reviews: ReviewRow[],
  itemId: string
): MemoryState | null {
  return replayState(
    reviews
      .filter((r) => r.item_id === itemId)
      .map((r) => ({ reviewedAt: r.reviewed_at, rating: r.rating }))
  )
}
