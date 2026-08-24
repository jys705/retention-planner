import type { GoalRow, ItemRow, ReviewRow } from '../db/types'

export const EXPORT_VERSION = 1

export interface Backup {
  version: number
  exportedAt: string
  goals: GoalRow[]
  items: ItemRow[]
  reviews: ReviewRow[]
  settings: Record<string, string>
}

export function toBackup(
  data: Omit<Backup, 'version' | 'exportedAt'>,
  exportedAt: string
): Backup {
  return { version: EXPORT_VERSION, exportedAt, ...data }
}

export class BackupFormatError extends Error {}

/**
 * 가져오기로 들어온 파일을 검사한다.
 *
 * 남의 파일을 잘못 넣으면 적어둔 게 통째로 날아가므로, 모양이 맞는지 먼저 본다.
 */
export function parseBackup(text: string): Backup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupFormatError('파일을 읽을 수 없어요. 내보내기로 만든 파일인지 확인해주세요.')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new BackupFormatError('파일 모양이 맞지 않아요.')
  }
  const value = parsed as Partial<Backup>
  if (
    !Array.isArray(value.goals) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.reviews)
  ) {
    throw new BackupFormatError('이 앱에서 내보낸 파일이 아닌 것 같아요.')
  }
  if (typeof value.version !== 'number' || value.version > EXPORT_VERSION) {
    throw new BackupFormatError(
      '더 새로운 버전에서 내보낸 파일이에요. 앱을 먼저 업데이트해주세요.'
    )
  }

  return {
    version: value.version,
    exportedAt: value.exportedAt ?? '',
    goals: value.goals,
    items: value.items,
    reviews: value.reviews,
    settings: value.settings ?? {},
  }
}

const CSV_COLUMNS = [
  '제목',
  '메모',
  '소속 목표',
  '공부한 날',
  '다음에 볼 날',
  '지금까지 본 횟수',
  '잊은 횟수',
  '기억 지속력(일)',
] as const

/** 표 계산기에서 열어볼 수 있게 사람이 읽는 열로 내보낸다. */
export function toCsv(items: ItemRow[], goals: GoalRow[]): string {
  const goalName = new Map(goals.map((g) => [g.id, g.name]))
  const rows = items.map((item) => [
    item.title,
    item.memo,
    item.goal_id ? (goalName.get(item.goal_id) ?? '') : '',
    item.first_studied_at,
    item.due ?? '',
    String(item.reps),
    String(item.lapses),
    item.stability === null ? '' : item.stability.toFixed(2),
  ])
  return [CSV_COLUMNS, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function backupFilename(today: string): string {
  return `retention-planner-${today}.json`
}

export function csvFilename(today: string): string {
  return `retention-planner-${today}.csv`
}
