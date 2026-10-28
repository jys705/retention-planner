import { create } from 'zustand'
import { defaultFsrs } from '../core/fsrs/fsrs6'
import type { Grade, MemoryState } from '../core/fsrs/types'
import { resolveHorizon, restsOnDay, type Horizon } from '../core/horizon/horizon'
import {
  applyReview,
  DEFAULT_INITIAL_GRADE,
  initialSchedule,
  schedule,
  type Intensity,
  MIN_BUFFER_DAYS,
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
  PostGoalMode,
} from '../db/types'
import {
  diffDays,
  fromEpochDay,
  maxDate,
  minDate,
  toEpochDay,
  type DateOnly,
} from '../lib/date'
import {
  effectiveConfig,
  goalHorizon,
  goalHorizonFields,
  horizonFields,
  isActive,
  memoryStateOf,
  spreadGroupKey,
  stateForRating,
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
import { nowIso, today as clockToday } from '../lib/clock'
import {
  dueBeyondEnd,
  endedPatches,
  goalEnded,
  itemEndedKey,
  itemLastReviewDay,
  restingToday,
  restoredPatches,
  scheduledItems,
} from '../lib/lifecycle'

export interface NewItemDraft {
  title: string
  memo?: string
  goalId?: string | null
  firstStudiedAt?: DateOnly
  horizon?: Horizon | null
  intensity?: Intensity | number | null
  /** 처음 공부한 날 얼마나 기억했는지. 지난 날짜로 적을 때 고른다. */
  initialGrade?: Grade
}

export interface NewGoalDraft {
  name: string
  horizon: Horizon
  intensity?: Intensity
  minReviews?: number
  color?: string | null
}

/**
 * 방금 한 평가를 물릴 손잡이.
 *
 * 평가 직전의 사진을 그대로 들고 있다가 되돌릴 때 도로 써 넣는다. 이력에서
 * 되짚는 방식은 못 쓴다. due_kind 와 due_source 와 메모는 평가 기록에 칸이
 * 없고, 다시 계산으로 채우면 평가 전과 같아진다는 보장이 없다.
 *
 * `seq` 는 이 사진을 찍은 뒤로 다른 쓰기가 끼어들었는지 가리는 표다. 오늘
 * 화면은 평가를 기다리지 않고 부르므로, 평가가 도는 동안 항목을 적거나 다른
 * 줄을 평가하는 일이 실제로 생긴다. 그때 낡은 사진을 써 넣으면 방금 적은
 * 항목이 사라지거나 이력과 항목이 서로 다른 말을 하게 된다.
 */
export interface LastRating {
  seq: number
  reviewId: string
  itemId: string
  title: string
  grade: Grade
  /** 되돌린 뒤 그 줄을 다시 펴 주려고 들고 있다. */
  archived: boolean
  due: DateOnly | null
  itemsBefore: ItemRow[]
  plannedBefore: PlannedReviewRow[]
  ratingCountBefore: number
}

/**
 * 적어두기 줄에 쓰다 만 것.
 *
 * 화면 안에 두면 다른 탭에 갔다 오는 사이에 컴포넌트가 내려갔다 올라와서
 * 쓰던 글이 사라진다. 저장소에 두면 탭을 옮겨도 그대로 있다.
 * 저장 장치에는 안 남긴다. 앱을 껐다 켜면 빈 줄에서 시작한다.
 */
export interface QuickAddDraft {
  title: string
  goalId: string | null
  firstStudiedAt: DateOnly | null
  horizon: Horizon | null
  intensity: Intensity | null
  initialGrade: Grade
  memo: string
  detailOpen: boolean
}

export const EMPTY_DRAFT: QuickAddDraft = {
  title: '',
  goalId: null,
  firstStudiedAt: null,
  horizon: null,
  intensity: null,
  initialGrade: DEFAULT_INITIAL_GRADE,
  memo: '',
  detailOpen: false,
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
  /** 저장소에 쓸 때마다 하나씩 오른다. 사진이 아직 쓸모 있는지 가리는 데 쓴다. */
  writeSeq: number
  lastRating: LastRating | null
  lastReopen: LastReopen | null
  draft: QuickAddDraft

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
  /** 항목까지 지우라고 하지 않으면 목표만 지우고 항목은 남긴다. */
  deleteGoal(id: string, options?: { withItems?: boolean }): Promise<void>
  /** 끝난 목표를 알리는 줄을 확인했다고 적어 둔다. 같은 끝은 다시 안 알린다. */
  acknowledgeEnded(keys: string[]): Promise<void>
  /** 마친 목표에 새 목표 시점을 주어 다시 연다. 되돌릴 사진을 같이 남긴다. */
  reopenGoal(id: string, horizon: Horizon): Promise<void>
  undoReopen(): Promise<void>
  attachItemsToGoal(goalId: string, itemIds: string[]): Promise<void>
  saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>
  importAll(backup: Backup): Promise<void>
  /**
   * 오늘 기준으로 다시 셈한다. 이미 저장해 둔 고침을 같이 넘기면 그것까지 얹어
   * 한 번에 내보낸다. 두 번에 나눠 내보내면 그 사이를 본 알림이 다른 수를 센다.
   */
  recomputeAll(pending?: ReadonlyMap<string, Partial<ItemRow>>): Promise<void>
  undoLastRating(): Promise<void>
  setDraft(patch: Partial<QuickAddDraft>): void
}

/**
 * 마친 목표를 다시 연 일.
 *
 * 계속 기억하기나 날짜 다시 정하기는 끝난 날짜를 덮는다. 지난 날짜는 다시 고를 수
 * 없으므로 잘못 눌렀으면 돌아갈 길이 없다. 그래서 평가처럼 사진을 들고 있다가
 * 그 사이 다른 쓰기가 없을 때만 그대로 되돌린다.
 */
export interface LastReopen {
  seq: number
  goalId: string
  name: string
  /** 다시 올라온 항목 수. */
  count: number
  goalBefore: GoalRow
  itemsBefore: ItemRow[]
  plannedBefore: PlannedReviewRow[]
}

/** 다시 연 일을 아직 되돌릴 수 있는가. */
export function canUndoReopen(state: {
  lastReopen: LastReopen | null
  writeSeq: number
}): boolean {
  return state.lastReopen !== null && state.lastReopen.seq === state.writeSeq
}

/** 손잡이가 아직 방금 것을 가리키는가. 그 사이 다른 쓰기가 있었으면 아니다. */
export function canUndo(state: {
  lastRating: LastRating | null
  writeSeq: number
}): boolean {
  return state.lastRating !== null && state.lastRating.seq === state.writeSeq
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



export const usePlanner = create<PlannerState>((set, get) => ({
  ready: false,
  today: clockToday(),
  goals: [],
  items: [],
  reviews: [],
  planned: [],
  settings: DEFAULT_SETTINGS,
  writeSeq: 0,
  lastRating: null,
  lastReopen: null,
  draft: EMPTY_DRAFT,

  async load() {
    const db = await repo()
    const [rawGoals, items, reviews, rawSettings] = await Promise.all([
      db.listGoals(),
      db.listItems(),
      db.listReviews(),
      db.listSettings(),
    ])
    // 목표한 날 칸이 생기기 전에 저장한 행에는 그 키가 없다. 비어 있는 값으로 채운다.
    // 안 채우면 행을 통째로 되돌릴 때(다시 연 것 되돌리기) 그 키가 빠져서, 저장소에
    // 써 둔 '비워 두기' 가 지워지지 않고 다음에 켤 때 되살아난다.
    const goals = rawGoals.map((g) => ({ ...g, goal_day: g.goal_day ?? null }))
    const settings = parseSettings(rawSettings)
    const today = clockToday()
    // 화면과 알림에 내보내기 전에 오늘 기준으로 먼저 셈한다. 셈하기 전 목록을 한
    // 번이라도 내보내면, 그 사이에 알림이 끝난 목표의 항목까지 세어 울린다.
    const { patches, planned } = await settle(db, items, goals, settings, today)
    set({
      goals,
      items: withPatches(items, patches),
      reviews,
      settings,
      today,
      planned,
      ready: true,
      writeSeq: get().writeSeq + 1,
      // 쓰다 만 것은 이번 실행에만 산다. 껐다 켜면 빈 줄에서 시작한다.
      draft: EMPTY_DRAFT,
      lastRating: null,
      lastReopen: null,
    })
  },

  setToday(date) {
    set({ today: date })
  },

  async addItem(draft) {
    const db = await repo()
    const { settings, today } = get()
    const goalId = draft.goalId ?? null
    const goal = goalId ? (get().goals.find((g) => g.id === goalId) ?? null) : null
    // 아직 안 온 날에 공부했을 수는 없다. 화면의 max 속성은 값이 들어오는 걸 막지 못하므로
    // 평가와 마찬가지로 저장 직전에 한 번 더 자른다.
    const firstStudiedAt = minDate(draft.firstStudiedAt ?? today, today)

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

    // 처음 공부한 날에 한 번 본 것으로 친다. 등급을 안 고르면 '무난함' 이다.
    const grade = draft.initialGrade ?? DEFAULT_INITIAL_GRADE
    const config = effectiveConfig(row, goal, settings)
    const initial = initialSchedule({
      firstStudiedAt,
      initialGrade: grade,
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

    // 이 한 번은 실제로 일어난 평가다. 기억 지속력과 본 횟수를 이미 바꿔 놓았으니
    // 이력에도 남겨야 한다. 안 남기면 "1번 봤어요" 와 "평가 0건" 이 한 화면에 같이 뜨고,
    // 백업을 되살릴 때 이력만으로는 지금 상태를 다시 만들 수 없다.
    const firstReview: ReviewRow = {
      id: newId('rev'),
      item_id: row.id,
      reviewed_at: firstStudiedAt,
      recorded_at: nowIso(),
      rating: grade,
      state_before: 'new',
      s_before: null,
      d_before: null,
      s_after: initial.state.stability,
      d_after: initial.state.difficulty,
      elapsed_days: 0,
      scheduled_days: 0,
      // 처음 보는 것이라 떠올릴 것이 없다. 회상률은 1 로 둔다.
      r_at_review: 1,
      next_interval: initial.intervalDays,
      memo_snapshot: row.memo === '' ? null : row.memo,
    }

    await db.insertItem(row)
    await db.insertReview(firstReview)
    set({
      items: [...get().items, row],
      reviews: [...get().reviews, firstReview],
    })
    await get().recomputeAll()
    return get().items.find((i) => i.id === row.id) ?? row
  },

  async rateItem(itemId, grade, options = {}) {
    const db = await repo()
    const { settings, today } = get()
    const item = get().items.find((i) => i.id === itemId)
    // 보관한 항목은 평가할 자리가 없다. 여기로 들어오면 보관 날짜는 찬 채로 상태만
    // 바뀌어, 목록에서는 사라졌는데 상태는 살아 있는 유령이 된다.
    if (!item || !isActive(item)) return

    const goal = item.goal_id
      ? (get().goals.find((g) => g.id === item.goal_id) ?? null)
      : null
    const itemsBefore = get().items
    const plannedBefore = get().planned
    const ratingCountBefore = settings.ratingCount
    const seqBefore = get().writeSeq
    const config = effectiveConfig(item, goal, settings)
    const reviewedAt = clampReviewDate(
      options.reviewedAt ?? today,
      item.last_review,
      today
    )
    // 저장할 때와 버튼에 미리 적을 때가 같은 계산을 봐야 한다.
    const { state: before, lastReview } = stateForRating(
      item,
      get().reviews,
      reviewedAt
    )

    const applied = applyReview({
      reviewedAt,
      lastReview,
      state: before,
      grade,
      horizon: config.horizon,
      intensity: config.intensity,
      targetRetention: config.targetRetention,
      minReviews: config.minReviews,
      // 지금 적는 이 평가도 한 번 본 것이다. 빼고 세면 최소 횟수가 하나 더 잡혀,
      // 세 번이면 될 것을 네 번 보게 된다. 다시 셈할 때와 내다볼 때는 이미 센다.
      repsSinceGoal: item.reps_since_goal + 1,
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
      state: nextItemState(
        applied.inPlateau,
        applied.postGoalReached,
        grade,
        config.postGoalMode
      ),
      ...(options.memo ? { memo: options.memo } : {}),
      // 상태와 보관 날짜는 늘 같은 말을 해야 한다. 둘을 같은 조건으로 정한다.
      ...(applied.postGoalReached && config.postGoalMode === 'archive'
        ? { archived_at: nowIso(), goal_risk: null }
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

    // 이 평가가 올린 표는 제 recomputeAll 하나뿐이어야 한다. 더 올라가 있으면
    // 그 사이 남이 저장소에 썼다는 뜻이고, 사진은 이미 낡았다. 그 사진으로
    // 되돌리면 남이 적은 항목이 사라지거나 기록과 항목이 어긋난다.
    if (get().writeSeq !== seqBefore + 1) return

    const after = get().items.find((i) => i.id === itemId)
    set({
      lastRating: {
        seq: get().writeSeq,
        reviewId: review.id,
        itemId,
        title: item.title,
        grade,
        archived: after?.archived_at !== null && after !== undefined,
        due: after?.due ?? null,
        itemsBefore,
        plannedBefore,
        ratingCountBefore,
      },
    })
  },

  setDraft(patch) {
    set({ draft: { ...get().draft, ...patch } })
  },

  async undoLastRating() {
    const last = get().lastRating
    if (last === null || !canUndo(get())) return
    const db = await repo()

    // 항목과 잡아둔 복습을 먼저 되돌리고 평가 기록을 맨 뒤에 지운다. 중간에
    // 끊기면 항목은 평가 전인데 기록만 남는데, 그건 남은 기록으로 고칠 수 있다.
    // 반대로 기록부터 지우면 고칠 근거가 먼저 사라진다.
    const nowItems = get().items
    for (const before of last.itemsBefore) {
      const now = nowItems.find((i) => i.id === before.id)
      if (now !== before) await db.updateItem(before.id, before)
    }
    await db.replacePlannedReviews(last.plannedBefore)
    await db.deleteReview(last.reviewId)

    if (get().settings.ratingCount !== last.ratingCountBefore) {
      await get().saveSetting('ratingCount', last.ratingCountBefore)
    }

    set({
      items: last.itemsBefore,
      planned: last.plannedBefore,
      reviews: get().reviews.filter((r) => r.id !== last.reviewId),
      lastRating: null,
      // 사진을 그대로 되돌렸으니 다시 계산하지 않는다. 다시 계산하면 오늘
      // 기준으로 새로 잡아서 평가 전과 다른 날짜가 나올 수 있다.
      writeSeq: get().writeSeq + 1,
    })
  },

  async createGoal(draft) {
    const db = await repo()
    const { settings } = get()
    const row: GoalRow = {
      id: newId('goal'),
      name: draft.name.trim(),
      ...goalHorizonFields(draft.horizon),
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
    // 시험이 미뤄지는 일은 흔하다. 목표 날짜를 뒤로 옮기거나 계속 기억하기로 정하면
    // 끝난 것으로 쳤던 이 목표의 항목이 되살아나야 한다.
    const restored = await restore(get, db, (i) => i.goal_id === id)
    await get().recomputeAll(restored)
  },

  async updateItem(id, patch) {
    const db = await repo()
    await db.updateItem(id, patch)
    set({
      items: get().items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })
    // 항목이 제 목표 시점을 갖고 있으면 그것을 고치는 것도 되살릴 까닭이 된다.
    // 소속을 바꾸는 것도 같다. 마친 목표에서 꺼내면 다시 올라와야 한다.
    const moved =
      'horizon_kind' in patch ||
      'ready_at' in patch ||
      'hold_until' in patch ||
      'goal_id' in patch
    const restored = moved
      ? await restore(get, db, (i) => i.id === id)
      : undefined
    await get().recomputeAll(restored)
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

  async deleteGoal(id, options = {}) {
    const db = await repo()
    const { goals, items, today } = get()
    const goal = goals.find((g) => g.id === id)
    const members = items.filter((i) => i.goal_id === id)

    if (options.withItems) {
      // 평가 기록과 잡아둔 복습은 항목을 따라 같이 지워진다.
      for (const item of members) {
        await db.deleteItem(item.id)
      }
      await db.deleteGoal(id)
      const gone = new Set(members.map((i) => i.id))
      set({
        goals: get().goals.filter((g) => g.id !== id),
        items: get().items.filter((i) => !gone.has(i.id)),
        reviews: get().reviews.filter((r) => !gone.has(r.item_id)),
      })
      await get().recomputeAll()
      return
    }

    // 끝난 목표의 소속만 풀 때는 목표 시점을 항목에 옮겨 담는다. 소속만 풀면 항목이
    // 목표 시점 없는 것이 되어, 마친 것이 무기한으로 되살아나 오늘 목록에 쏟아진다.
    // 기록을 남기려고 목표만 지웠는데 할 일이 생기면 안 된다.
    const carried =
      goal && goalEnded(goal, today) ? horizonFields(goalHorizon(goal)) : null
    const carry = (item: ItemRow) => carried !== null && !isActive(item)
    for (const item of members) {
      if (carry(item)) await db.updateItem(item.id, carried ?? {})
    }
    await db.deleteGoal(id)
    set({
      goals: get().goals.filter((g) => g.id !== id),
      // 목표를 지워도 항목은 남는다. 소속만 풀린다.
      items: get().items.map((i) =>
        i.goal_id === id
          ? { ...i, goal_id: null, ...(carry(i) ? carried : {}) }
          : i
      ),
    })
    // 끝난 목표를 지운 사람은 그 끝을 이미 안다. 남긴 항목을 '마친 낱개' 로 또 알리지 않는다.
    const known = members
      .filter(carry)
      .map((i) => itemEndedKey({ ...i, goal_id: null, ...carried }, get().settings))
      .filter((k): k is string => k !== null)
    if (known.length > 0) await get().acknowledgeEnded(known)
    await get().recomputeAll()
  },

  async acknowledgeEnded(keys) {
    const seen = get().settings.seenEnded
    const next = [...new Set([...seen, ...keys])]
    if (next.length === seen.length) return
    await get().saveSetting('seenEnded', next)
  },

  async reopenGoal(id, horizon) {
    const goal = get().goals.find((g) => g.id === id)
    if (!goal) return
    const itemsBefore = get().items
    const plannedBefore = get().planned
    const seqBefore = get().writeSeq
    const alive = (list: ItemRow[]) =>
      list.filter((i) => i.goal_id === id && isActive(i)).length
    await get().updateGoal(id, goalHorizonFields(horizon))
    // 다시 연 것이 올린 표는 제 recomputeAll 하나뿐이어야 한다. 더 올라가 있으면
    // 그 사이 남이 썼다는 뜻이라 사진이 낡았다.
    if (get().writeSeq !== seqBefore + 1) return
    set({
      lastReopen: {
        seq: get().writeSeq,
        goalId: id,
        name: goal.name,
        count: alive(get().items) - alive(itemsBefore),
        goalBefore: goal,
        itemsBefore,
        plannedBefore,
      },
    })
  },

  async undoReopen() {
    const last = get().lastReopen
    if (last === null || !canUndoReopen(get())) return
    const db = await repo()
    await db.updateGoal(last.goalId, last.goalBefore)
    const nowItems = get().items
    for (const before of last.itemsBefore) {
      const now = nowItems.find((i) => i.id === before.id)
      if (now !== before) await db.updateItem(before.id, before)
    }
    await db.replacePlannedReviews(last.plannedBefore)
    set({
      goals: get().goals.map((g) => (g.id === last.goalId ? last.goalBefore : g)),
      items: last.itemsBefore,
      planned: last.plannedBefore,
      lastReopen: null,
      // 사진을 그대로 되돌렸으니 다시 계산하지 않는다. 평가 되돌리기와 같은 까닭이다.
      writeSeq: get().writeSeq + 1,
    })
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
    // 여기서 ready 를 내리면 앱이 "불러오는 중" 화면으로 갈아타면서 설정 화면이 통째로
    // 사라진다. 그러면 가져오기가 끝났다는 안내도 같이 사라져서 사용자는 아무 일도
    // 안 일어난 것처럼 본다. load() 가 어차피 전부 다시 채우므로 내릴 필요가 없다.
    await get().load()
  },

  async recomputeAll(pending) {
    // 쓸 때마다 표를 올린다. 평가가 도는 동안 남이 끼어들면 그 평가의 사진이
    // 낡았다는 것을 이 표 하나로 알 수 있다.
    set({ writeSeq: get().writeSeq + 1 })
    const db = await repo()
    const { goals, settings, today } = get()
    const items = pending ? withPatches(get().items, pending) : get().items
    const { patches, planned } = await settle(db, items, goals, settings, today)
    const all = mergePatches(pending ?? new Map(), patches)

    set({
      planned,
      ...(all.size > 0 ? { items: withPatches(get().items, all) } : {}),
    })
  },
}))

/**
 * 오늘 기준으로 다시 셈해 저장하고, 바꾼 칸을 돌려준다.
 *
 * 목표 시점이 지난 것부터 넘긴다. 앱을 켤 때와 날이 바뀔 때 여기를 지나므로,
 * 목표를 마치고 평가를 안 했어도 다음에 켜는 순간 보관된다. 분산은 넘긴 뒤의
 * 목록을 봐야 한다. 안 그러면 끝난 항목이 남의 날짜를 밀어낸다. 목표 밖에 걸린
 * 묵은 날짜도 분산 전에 풀어야 그 항목이 분산과 하루 상한에 들어간다.
 */
async function settle(
  db: Repository,
  items: ItemRow[],
  goals: GoalRow[],
  settings: Settings,
  today: DateOnly
): Promise<{ patches: Map<string, Partial<ItemRow>>; planned: PlannedReviewRow[] }> {
  const ended = endedPatches(items, goals, settings, today, nowIso())
  const afterEnded = withPatches(items, ended)
  const stranded = strandedPatches(afterEnded, goals, settings, today)
  const spread = computeSpread(
    withPatches(afterEnded, stranded),
    goals,
    settings,
    today
  )
  const patches = mergePatches(mergePatches(ended, stranded), spread.patches)
  for (const [id, patch] of patches) {
    await db.updateItem(id, patch)
  }
  await db.replacePlannedReviews(spread.planned)
  return { patches, planned: spread.planned }
}

/**
 * 다음 날짜가 목표 밖에 걸려 있지만 지금 설정으로는 그 안에 봐야 하는 항목.
 *
 * 다음 날짜가 목표 뒤면 그 날은 오지 않는 것으로 친다. 평가할 때 목표까지 이대로
 * 충분하다고 셈해서 그렇게 잡혔다면 맞다. 그런데 날짜를 잡은 뒤에 설정이 바뀌면
 * 틀린다. 목표 없이 적은 것을 목표에 넣거나, 목표한 날을 앞당기거나, 그날을 비워
 * 두면 묵은 날짜가 목표 밖에 걸려서 분산도 하루 상한도 그 항목을 보지 않는다.
 * 목표한 날까지 한 번도 안 올라오고 목표 아래로 끝난다.
 *
 * 마지막으로 본 날부터 지금 설정으로 다시 셈해서, 목표 안에 잡혀야 하면 날짜를
 * 그리로 옮긴다. 이미 지난 날이면 오늘로 둔다. 되살릴 때와 같은 까닭이다. 다시
 * 셈해도 목표 밖이면 평가할 때 셈한 그대로이므로 손대지 않는다.
 */
function strandedPatches(
  items: readonly ItemRow[],
  goals: readonly GoalRow[],
  settings: Settings,
  today: DateOnly
): Map<string, Partial<ItemRow>> {
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const patches = new Map<string, Partial<ItemRow>>()
  for (const item of items) {
    if (!isActive(item)) continue
    const goal = item.goal_id ? (goalById.get(item.goal_id) ?? null) : null
    if (!dueBeyondEnd(item, goal, settings)) continue
    const state = memoryStateOf(item)
    const last = itemLastReviewDay(item, goal, settings)
    if (state === null || last === null) continue
    const next = naturalScheduleOf(
      item,
      effectiveConfig(item, goal, settings),
      state,
      settings
    )
    const due = maxDate(today, next.due)
    if (due > last) continue
    patches.set(item.id, { due, due_kind: next.dueKind, due_source: 'fsrs' })
  }
  return patches
}

/** 항목마다 고친 칸을 덮어쓴다. 고칠 것이 없으면 같은 배열을 돌려준다. */
function withPatches(
  items: ItemRow[],
  patches: ReadonlyMap<string, Partial<ItemRow>>
): ItemRow[] {
  if (patches.size === 0) return items
  return items.map((i) => {
    const patch = patches.get(i.id)
    return patch ? { ...i, ...patch } : i
  })
}

/** 고친 칸 둘을 합친다. 같은 항목이면 뒤의 것이 이긴다. */
function mergePatches(
  first: ReadonlyMap<string, Partial<ItemRow>>,
  second: ReadonlyMap<string, Partial<ItemRow>>
): Map<string, Partial<ItemRow>> {
  const merged = new Map(first)
  for (const [id, patch] of second) {
    merged.set(id, { ...(merged.get(id) ?? {}), ...patch })
  }
  return merged
}

/**
 * 고른 범위에서 다시 살아날 항목을 되살려 저장한다.
 *
 * 다음 날짜는 오늘부터 다시 잡는다. 보관해 둔 동안의 묵은 날짜를 그대로 살리면
 * 몇 주 전 날짜가 붙은 것들이 '53일 지남' 으로 한꺼번에 쏟아진다. 볼 때가 이미
 * 지난 것은 오늘로 모이고, 하루 상한을 넘는 것은 다음 다시 계산이 뒤로 편다.
 */
async function restore(
  get: () => PlannerState,
  db: Repository,
  inScope: (item: ItemRow) => boolean
): Promise<Map<string, Partial<ItemRow>>> {
  const { items, goals, settings, today } = get()
  const restored = restoredPatches(items, goals, settings, today, inScope)
  for (const [id, patch] of restored) {
    const item = items.find((i) => i.id === id)
    const state = item ? memoryStateOf(item) : null
    if (item && state) {
      const goal = item.goal_id
        ? (goals.find((g) => g.id === item.goal_id) ?? null)
        : null
      const next = naturalScheduleOf(
        { ...item, ...patch },
        effectiveConfig({ ...item, ...patch }, goal, settings),
        state,
        settings
      )
      patch.due = maxDate(today, next.due)
      patch.due_kind = next.dueKind
      patch.due_source = 'fsrs'
    }
    // 예전 판이 평가로 보관한 것에는 그때의 '부족' 이 굳어 있을 수 있다.
    patch.goal_risk = null
    await db.updateItem(id, patch)
  }
  return restored
}

function horizonReadyAt(horizon: Horizon | null): DateOnly | null {
  return horizon ? horizonFields(horizon).ready_at : null
}

function horizonHoldUntil(horizon: Horizon | null): DateOnly | null {
  return horizon ? horizonFields(horizon).hold_until : null
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
  postGoalMode: PostGoalMode
): ItemRow['state'] {
  // 목표가 끝난 뒤의 평가는 앱에서는 생기지 않는다. 끝나는 날을 지나 앱을 켜면
  // 그 자리에서 보관하기 때문이다. 그래도 들어오면 보관하는 쪽은 등급과 상관없이
  // 마친다. 다시 잡아 봐야 지킬 목표가 없고, 상태와 보관 날짜도 같은 말을 해야 한다.
  if (postGoalReached && postGoalMode === 'archive') return 'archived'
  // '다시' 는 하나도 기억 안 났다는 뜻이다. 계속 보는 쪽에서는 그 사실이 그대로다.
  if (grade === 1) return 'relearning'
  if (postGoalReached) return 'maintaining'
  if (inPlateau) return 'holding'
  return 'review'
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
  settings: Settings,
  /**
   * 이미 목록에 서 있는 항목은 오늘 기준으로 다시 셈한다.
   *
   * 마지막으로 본 날에서 재면 목표까지 남은 날이 실제보다 길게 잡혀 제약이
   * 느슨해진다. 그래서 스무 날 밀린 것이 '평범한 복습' 으로 분류되어, 건너뛰어도
   * 목표를 지킨다는 사실('여유' 배지)을 말해 주지 못한다.
   *
   * FSRS 가 내는 간격은 기억 지속력만 보므로 이 값에 안 흔들린다. 바뀌는 것은
   * 목표까지 남은 날을 세는 쪽뿐이다.
   */
  standingOn: DateOnly | null = null
) {
  const anchor = item.last_review ?? item.first_studied_at
  return schedule({
    from: standingOn ?? anchor,
    // 건너뛰어도 되는지는 오늘이 아니라 마지막으로 본 날부터 잰다. 밀린 동안 내려간
    // 기억을 빼먹으면, 건너뛰면 목표에 못 미치는 것에 '여유' 가 붙는다.
    anchor,
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

/** 이 항목을 다시 잡을 수 있는 가장 이른 날. 마지막으로 본 날 다음 날부터다. */
function nextOpenDay(item: ItemRow, today: DateOnly): DateOnly {
  return item.last_review
    ? maxDate(today, fromEpochDay(toEpochDay(item.last_review) + 1))
    : today
}

/**
 * 마감선이 끌어당긴 항목인지.
 *
 * FSRS 는 더 뒤를 원했는데 마감선 때문에 앞으로 당겨진 항목들이 곧 몰림의 정체다.
 * 이것들만 편다. 아직 평소 간격으로 도는 항목은 그대로 둔다.
 */
function isPulledByDeadline(dueKind: DueKind): boolean {
  // session_fill 도 목표 때문에 생긴 날짜다. 같은 날에서 출발한 항목들이
  // 같은 몫으로 나뉘면 그것도 한 날에 쌓인다. 펼 후보에서 뺄 이유가 없다.
  return (
    dueKind === 'deadline_pull' ||
    dueKind === 'final_check' ||
    dueKind === 'session_fill'
  )
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
  // 다음 날짜가 목표 뒤로 나간 것은 그 날이 오기 전에 내려간다. 자리를 차지하게
  // 두면 다른 목표의 복습이 오지도 않을 것에 밀린다. 비워 둔 목표한 날의 항목도
  // 그날은 아무 자리도 차지하지 않는다.
  const active = scheduledItems(items, goals, settings).filter(
    (item) =>
      !restingToday(
        item,
        item.goal_id ? (goalById.get(item.goal_id) ?? null) : null,
        settings,
        today
      )
  )
  const itemsById = new Map(active.map((i) => [i.id, i]))
  const patches = new Map<string, Partial<ItemRow>>()
  // 항목별로 잡아둔 날짜들. 대부분 하나지만 부족한 항목에는 둘이 들어간다.
  const extraDates = new Map<string, DateOnly[]>()

  const groups = new Map<string, SpreadCandidate[]>()
  /** 오늘 기준으로 다시 셈한 갈래. 목록에 서 있는 항목의 배지가 이걸 읽는다. */
  const naturalKind = new Map<string, DueKind>()
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
      // 마지막으로 본 날에 또 잡으면 같은 날 두 번이 된다. 그 다음 날부터 본다.
      notBefore: nextOpenDay(item, today),
      readyAt: key,
      bufferDays: settings.bufferDays,
      targetRetention: config.targetRetention,
      rest: restsOnDay(config.horizon),
    })

    // 마감선 안에 잡을 수 있는 날이 없으면 옮겨서 나아질 게 없다. FSRS 에 맡긴다.
    if (!interval.hasRoomBeforeGoal) continue

    // 옮길 수 있는 구간은 마무리 복습에 대한 것이다.
    // 아직 평소 간격으로 도는 항목은 건드리지 않는다. 그쪽은 몰림의 원인이 아니다.
    const standing = item.due !== null && item.due <= today
    const natural = naturalScheduleOf(
      item,
      config,
      state,
      settings,
      standing ? today : null
    )
    if (!isPulledByDeadline(natural.dueKind) && !interval.atRisk) continue

    if (standing) naturalKind.set(item.id, natural.dueKind)
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
      // 밀린 것은 옮기지 않는다. 여기서 미래로 보내면 줄이 오늘 목록에서
      // 사라져서, 이틀 밀린 것이 둘 있는데 '오늘 볼 건 다 봤어요' 가 뜬다.
      const standing = item.due !== null && item.due <= today
      const source: DueSource = moved.has(id) ? 'spread' : 'fsrs'
      if (!standing) {
        if (item.due !== placed) patch.due = placed
        if (item.due_source !== source) patch.due_source = source
      }
      const risk = candidate.interval.atRisk ? 'at_risk' : 'safe'
      if (item.goal_risk !== risk) patch.goal_risk = risk
      if (candidate.interval.atRisk && item.due_kind !== 'deadline_pull') {
        patch.due_kind = 'deadline_pull'
      } else if (standing && item.due_kind !== naturalKind.get(id)) {
        // 갈래는 마지막으로 평가할 때 정해진 뒤로 안 고쳐진다. 목록에 서 있는
        // 동안 목표는 계속 가까워지므로 그때 값은 낡는다. 배지가 그 값을 읽는다.
        const kind = naturalKind.get(id)
        if (kind !== undefined) patch.due_kind = kind
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
    // 오늘이거나 이미 지난 날짜는 흔들지 않는다. 이미 사람 앞에 놓인 것이고,
    // 여기서 옮기면 앱을 켤 때마다 오늘 할 일이 바뀌고 밀린 사실도 지워진다.
    if (item.due <= today) continue
    const intervalDays = diffDays(item.last_review, item.due)
    if (intervalDays < 2.5) continue
    // 자기 자신은 빼고 센다. 안 그러면 제 날짜가 늘 한 칸 무거워 보여서
    // 몰린 것이 없는데도 이유 없이 옆으로 밀린다.
    const withoutSelf = { ...load }
    withoutSelf[item.due] = Math.max(0, (withoutSelf[item.due] ?? 1) - 1)
    const moved = fuzzDue({
      from: item.last_review,
      intervalDays,
      dailyLoad: withoutSelf,
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
  // 밀린 것은 오늘 목록에 이미 서 있다. 옮기지는 않지만 자리는 차지한다.
  // 안 세면 오늘이 빈 날로 보여서, 앱이 다른 날의 넘침을 오늘로 끌어온다.
  const standingLoad = new Map<DateOnly, number>()
  for (const item of active) {
    const due = patches.get(item.id)?.due ?? item.due
    if (!due) continue
    if (due < today) {
      standingLoad.set(today, (standingLoad.get(today) ?? 0) + 1)
      continue
    }
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
      // 목표한 날 당일로는 못 밀어낸다. 전날에 자리가 없을 때만 당일까지 쓴다.
      notAfter: placed
        ? fromEpochDay(placed.latest)
        : Number.isFinite(resolved.readyAt)
          ? fromEpochDay(
              lastSchedulableDay(
                resolved.readyAt,
                settings.bufferDays,
                toEpochDay(today),
                restsOnDay(config.horizon)
              )
            )
          : null,
      pushPriority: pushPriorityOf(item, resolved.readyAt, state, today),
    })
  }

  const capped = applyDailyCap(capCandidates, settings.dailyCap, standingLoad)
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

/**
 * 목표한 날 앞에서 마지막으로 잡을 수 있는 날.
 *
 * 목표한 날은 시험을 보거나 발표를 하는 날이다. 그날은 이미 준비돼 있어야 하니
 * 전날까지가 마지막이다. 전날이 이미 지났을 때만 당일까지 쓴다.
 */
function lastSchedulableDay(
  readyAt: number,
  bufferDays: number,
  todayDay: number,
  rest: boolean
): number {
  const preferred = readyAt - Math.max(MIN_BUFFER_DAYS, bufferDays)
  // 목표한 날을 비워 두기로 했으면 앞에 자리가 없어도 그날로는 안 민다.
  return preferred >= todayDay || rest ? preferred : readyAt - bufferDays
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
      notBefore: nextOpenDay(item, today),
      readyAt,
      bufferDays: settings.bufferDays,
      targetRetention: config.targetRetention,
      rest: restsOnDay(config.horizon),
    })
    if (!interval.hasRoomBeforeGoal) continue
    const standing = item.due !== null && item.due <= today
    const natural = naturalScheduleOf(
      item,
      config,
      state,
      settings,
      standing ? today : null
    )
    if (!isPulledByDeadline(natural.dueKind) && !interval.atRisk) continue
    candidates.push({ interval, naturalDue: natural.due })
  }

  return candidates.length === 0 ? null : spread(candidates)
}

/** 오늘 볼 항목. 연체된 것도 함께 올린다. */
/** 오늘 목록을 고르는 데 필요한 것. 목표를 봐야 그날을 비워 둔 목표를 거른다. */
export interface TodayInput {
  items: ItemRow[]
  goals: GoalRow[]
  settings: Settings
  today: DateOnly
}

export function selectTodayItems(state: TodayInput): ItemRow[] {
  const { overdue, dueToday } = splitTodayItems(state)
  return [...overdue, ...dueToday]
}

/**
 * 오늘 목록을 밀린 것과 오늘 것으로 가른다.
 *
 * 가르는 것은 줄 차례를 정하고 밀린 것이 몇인지 따로 알리기 위해서다.
 * 세는 데는 쓰지 않는다. 화면 머리의 큰 숫자, 옆줄 배지, 알림은 모두 합인
 * `selectTodayItems` 를 센다. 한쪽만 따로 세면 밀린 줄이 넷 보이는데 머리는
 * '0 개' 라고 적는 일이 생긴다.
 */
export function splitTodayItems(state: TodayInput): {
  overdue: ItemRow[]
  dueToday: ItemRow[]
} {
  const goalById = new Map(state.goals.map((g) => [g.id, g]))
  const due = state.items
    .filter(isActive)
    // 목표한 날을 비워 두기로 했으면 그날은 그 목표 것을 하나도 올리지 않는다.
    // 준비하다 못 본 것까지 그렇다. 화면이 아니라 여기서 걸러야 머리의 큰 숫자,
    // 옆줄 배지, 알림이 모두 같은 수를 센다.
    .filter(
      (i) =>
        !restingToday(
          i,
          i.goal_id ? (goalById.get(i.goal_id) ?? null) : null,
          state.settings,
          state.today
        )
    )
    // 복습은 앱 밖에서 한다. '다시' 는 "다시 보여줘" 가 아니라 "거의 기억 안 났다"
    // 는 평가고, 앱이 할 일은 간격을 가장 짧게 잡는 것뿐이다. 그날 다시 띄우는
    // 것은 암기 카드 앱의 방식이지 이 앱의 것이 아니다.
    .filter((i) => i.due !== null && i.due <= state.today)

  const overdue = due
    .filter((i) => i.due !== null && i.due < state.today)
    // 오래 밀린 것부터. 더 오래 둘수록 급하다.
    .sort((a, b) =>
      a.due !== b.due
        ? a.due! < b.due!
          ? -1
          : 1
        : a.created_at < b.created_at
          ? -1
          : 1
    )

  const dueToday = due
    .filter((i) => !(i.due !== null && i.due < state.today))
    .sort((a, b) => {
      const rank =
        badgeRank(b.due_kind, b.goal_risk) - badgeRank(a.due_kind, a.goal_risk)
      if (rank !== 0) return rank
      return a.created_at < b.created_at ? -1 : 1
    })

  return { overdue, dueToday }
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

/**
 * 활성 항목들의 지금 기억률 평균. 오늘 화면 머리에 걸리는 값이다.
 *
 * 셀 것이 없으면 없음이다. 0 을 돌려주면 목표를 다 마치고 돌아온 날 머리에
 * '0%' 가 서서, 다 잊어버린 것처럼 읽힌다.
 */
export function selectOverallRetention(
  items: ItemRow[],
  today: DateOnly
): number | null {
  const active = items.filter(
    (i) => isActive(i) && i.stability !== null && i.last_review !== null
  )
  if (active.length === 0) return null
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
