import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { freezeToday, unfreezeToday } from '../../src/lib/clock'
import { fullDate } from '../../src/lib/format'
import { resetRepositoryForTest } from '../../src/db'
import type { GoalRow, ItemRow, ReviewRow } from '../../src/db/types'
import {
  resetPlannerForTest,
  usePlanner,
} from '../../src/store/planner'

export interface SeedInput {
  goals?: GoalRow[]
  items?: ItemRow[]
  reviews?: ReviewRow[]
  settings?: Record<string, string>
}

/**
 * 사람이 앱을 켠 상태를 만든다.
 *
 * 오늘을 고정하고, 저장소를 비우고, 준 자료를 넣은 뒤 다시 계산까지 마친다.
 * 시험은 이 뒤로 화면만 조작한다.
 */
export async function setupApp(
  today: string,
  seed: SeedInput = {}
): Promise<void> {
  freezeToday(today)
  try {
    globalThis.localStorage?.clear()
  } catch {
    // 저장소가 없는 환경이면 인메모리로 돈다.
  }
  resetRepositoryForTest()
  resetPlannerForTest()
  usePlanner.setState({
    ready: false,
    goals: [],
    items: [],
    reviews: [],
    planned: [],
    today,
  })
  await usePlanner.getState().load()
  usePlanner.getState().setToday(today)

  const hasSeed =
    (seed.goals?.length ?? 0) > 0 ||
    (seed.items?.length ?? 0) > 0 ||
    (seed.reviews?.length ?? 0) > 0 ||
    seed.settings !== undefined

  if (hasSeed) {
    await usePlanner.getState().importAll({
      version: 1,
      exportedAt: '',
      goals: seed.goals ?? [],
      items: seed.items ?? [],
      reviews: seed.reviews ?? [],
      settings: { onboardingDone: 'true', ...(seed.settings ?? {}) },
    })
    usePlanner.getState().setToday(today)
    await usePlanner.getState().recomputeAll()
  } else {
    await usePlanner.getState().saveSetting('onboardingDone', true)
  }
}

export function teardownApp(): void {
  unfreezeToday()
}

/**
 * 화면 하나를 그리고 사람 노릇을 할 손을 함께 돌려준다.
 *
 * 시나리오 시험은 전부 이걸로 시작한다. 함수를 직접 부르지 않고
 * 실제 화면을 그린 뒤 눌러서 확인한다.
 */
export function render(node: ReactElement) {
  const user = userEvent.setup()
  const utils = rtlRender(node)
  return { user, ...utils }
}

/** 목표 하나. 필요한 것만 바꿔 쓴다. */
export function aGoal(over: Partial<GoalRow> = {}): GoalRow {
  return {
    id: 'g1',
    name: '시험 준비',
    horizon_kind: 'open',
    ready_at: null,
    hold_until: null,
    target_retention: 0.9,
    intensity: 'standard',
    min_reviews: 3,
    max_interval_days: null,
    post_goal_mode: 'archive',
    color: null,
    created_at: '2026-01-01T00:00:00.000Z',
    archived_at: null,
    ...over,
  }
}

/** 항목 하나. 아직 평가한 적 없는 상태가 기본이다. */
export function anItem(over: Partial<ItemRow> = {}): ItemRow {
  return {
    id: 'i1',
    goal_id: null,
    title: '항목',
    memo: '',
    tags: '[]',
    created_at: '2026-01-01T00:00:00.000Z',
    first_studied_at: '2026-10-01',
    horizon_kind: null,
    ready_at: null,
    hold_until: null,
    target_retention: null,
    intensity: null,
    min_reviews: null,
    state: 'review',
    stability: 2.3065,
    difficulty: 5.2,
    due: '2026-10-03',
    due_kind: 'normal',
    due_source: 'fsrs',
    last_review: '2026-10-01',
    reps: 1,
    lapses: 0,
    reps_since_goal: 1,
    goal_risk: null,
    archived_at: null,
    ...over,
  }
}

export function itemsById(): Map<string, ItemRow> {
  return new Map(usePlanner.getState().items.map((i) => [i.id, i]))
}

/** 날짜를 며칠 옮긴다. 시나리오에서 기대값을 손으로 적을 때 쓴다. */
export function shift(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

/** 이미 떠 있는 오늘 화면에서 제목만 치고 Enter 로 적는다. */
export async function quickAdd(
  user: ReturnType<typeof render>['user'],
  screenApi: typeof import('@testing-library/react').screen,
  title: string
): Promise<void> {
  const input = screenApi.getByLabelText('새 항목 제목')
  await user.click(input)
  await user.type(input, `${title}{Enter}`)
}

/**
 * 날짜 고르기 단추를 눌러 달력을 연다.
 *
 * 앱은 브라우저가 주는 달력을 안 쓰고 제 달력을 팝오버로 띄운다.
 * 시험도 사람과 같은 길로 간다.
 */
export function openCalendar(
  user: ReturnType<typeof render>['user'],
  trigger: HTMLElement
): Promise<HTMLElement> {
  const open = trigger.getAttribute('aria-expanded') === 'true'
  const label = `${trigger.getAttribute('aria-label') ?? ''} 달력`
  const show = open ? Promise.resolve() : user.click(trigger)
  return show.then(() => screen.getByRole('group', { name: label }))
}

/**
 * 날짜를 고른다.
 *
 * 달력을 열고, 그 달까지 넘긴 다음, 그 날 칸을 누른다.
 */
export async function setDateInput(
  user: ReturnType<typeof render>['user'],
  trigger: HTMLElement,
  value: string
): Promise<void> {
  const grid = await openCalendar(user, trigger)
  const want = monthIndex(value)
  // 달을 한 칸씩 옮긴다. 20년치면 어떤 시험도 닿는다.
  for (let step = 0; step < 240; step += 1) {
    const title = within(grid).getByText(/^\d{4}년 \d+월$/).textContent ?? ''
    const shown =
      Number(title.slice(0, 4)) * 12 + Number(title.slice(6, title.length - 1)) - 1
    if (shown === want) break
    await user.click(
      within(grid).getByRole('button', { name: shown > want ? '지난달' : '다음달' })
    )
  }
  await user.click(within(grid).getByRole('button', { name: fullDate(value) }))
}

function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
}

/**
 * 점 세 개 메뉴를 열고 그 안의 항목을 누른다.
 *
 * 편집과 삭제는 이제 화면에 늘어놓지 않고 이 메뉴 안에 접혀 있다.
 */
export async function pickFromMenu(
  user: ReturnType<typeof render>['user'],
  menuLabel: string,
  itemLabel: string
): Promise<void> {
  await user.click(await screen.findByRole('button', { name: menuLabel }))
  await user.click(
    within(screen.getByRole('menu')).getByRole('menuitem', { name: itemLabel })
  )
}

/** 설명이 붙은 고르기 칸에서 하나를 누른다. */
export async function pickCard(
  user: ReturnType<typeof render>['user'],
  groupLabel: string,
  name: string
): Promise<void> {
  const group = await screen.findByRole('radiogroup', { name: groupLabel })
  await user.click(within(group).getByRole('radio', { name }))
}

/** 접힌 고르기 칸을 열고 하나를 누른다. */
export async function pickSelect(
  user: ReturnType<typeof render>['user'],
  fieldLabel: string,
  name: string
): Promise<void> {
  await user.click(await screen.findByRole('button', { name: fieldLabel }))
  const list = screen.getByRole('listbox', { name: fieldLabel })
  await user.click(
    within(list).getByRole('option', { name: new RegExp(`^${name}`) })
  )
}
