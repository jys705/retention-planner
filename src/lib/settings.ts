import type { Intensity } from '../core/policy/constraints'
import type { PostGoalMode } from '../db/types'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface Settings {
  /** 새 항목에 처음 적용되는 복습 강도. */
  defaultIntensity: Intensity
  /** 목표한 날 지켜야 할 기억률 하한. 목표별 다이얼이 아니라 전역 하나다. */
  targetRetention: number
  minReviews: number
  /** 목표한 날 며칠 전까지 새 복습을 잡을지. */
  bufferDays: number
  /** 대략 목표의 여유 폭. */
  uncertainty: number
  /** 하루 최대 개수. 넘으면 앞뒤로 편다. */
  dailyCap: number
  maxIntervalDays: number | null
  postGoalMode: PostGoalMode
  theme: ThemePreference
  notifyAt: string | null
  /** 묶기 제안을 무시한 접두사들. 같은 접두사로는 다시 제안하지 않는다. */
  dismissedPrefixes: string[]
  /** 마지막으로 묶기를 제안한 날. 하루에 한 번만 제안한다. */
  lastSuggestionDate: string | null
  onboardingDone: boolean
  /** 평가한 횟수. 20회를 넘기면 등급 설명을 한 줄로 줄인다. */
  ratingCount: number
  /** 새 항목의 마지막 설정. 제목만 치고 넘어갈 때 이걸 물려준다. */
  lastGoalId: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  defaultIntensity: 'standard',
  targetRetention: 0.9,
  minReviews: 3,
  bufferDays: 1,
  uncertainty: 0.25,
  dailyCap: 20,
  maxIntervalDays: null,
  postGoalMode: 'archive',
  theme: 'system',
  notifyAt: '21:00',
  dismissedPrefixes: [],
  lastSuggestionDate: null,
  onboardingDone: false,
  ratingCount: 0,
  lastGoalId: null,
}

/** 등급 설명을 상시 노출하다가 이 횟수를 넘기면 한 줄로 줄인다. */
export const GRADE_HELP_THRESHOLD = 20

const NUMBER_KEYS = [
  'targetRetention',
  'minReviews',
  'bufferDays',
  'uncertainty',
  'dailyCap',
  'ratingCount',
] as const

export function parseSettings(raw: Record<string, string>): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS }

  for (const key of NUMBER_KEYS) {
    const value = raw[key]
    if (value !== undefined && value !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) out[key] = parsed
    }
  }

  if (raw.defaultIntensity) out.defaultIntensity = raw.defaultIntensity as Intensity
  if (raw.postGoalMode) out.postGoalMode = raw.postGoalMode as PostGoalMode
  if (raw.theme) out.theme = raw.theme as ThemePreference
  if (raw.notifyAt !== undefined) out.notifyAt = raw.notifyAt || null
  if (raw.maxIntervalDays !== undefined) {
    const parsed = Number(raw.maxIntervalDays)
    out.maxIntervalDays =
      raw.maxIntervalDays === '' || !Number.isFinite(parsed) ? null : parsed
  }
  if (raw.dismissedPrefixes) {
    try {
      const parsed: unknown = JSON.parse(raw.dismissedPrefixes)
      if (Array.isArray(parsed)) out.dismissedPrefixes = parsed as string[]
    } catch {
      out.dismissedPrefixes = []
    }
  }
  if (raw.lastSuggestionDate !== undefined) {
    out.lastSuggestionDate = raw.lastSuggestionDate || null
  }
  if (raw.lastGoalId !== undefined) out.lastGoalId = raw.lastGoalId || null
  if (raw.onboardingDone !== undefined) {
    out.onboardingDone = raw.onboardingDone === 'true'
  }

  return out
}

export function serializeSetting(value: Settings[keyof Settings]): string {
  if (value === null) return ''
  if (Array.isArray(value)) return JSON.stringify(value)
  return String(value)
}
