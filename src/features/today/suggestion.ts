import type { ItemRow } from '../../db/types'
import { groupByCommonPrefix } from '../../lib/domain'

export interface GroupSuggestion {
  stem: string
  itemIds: string[]
}

/**
 * 목표로 묶으면 좋을 항목 무리를 찾는다.
 *
 * 제목만 치고 넘어가면 모든 항목이 무기한이 된다. 그것도 정상이지만
 * 목표 시점 역산과 날짜 조정이 통째로 잠든다. 강요하지 않고 필요해지는 순간에만 권한다.
 *
 * 이미 목표에 묶인 항목은 후보에서 뺀다. 묶인 걸 또 묶으라고 하면 안 된다.
 */
export function findGroupSuggestion(
  items: ItemRow[],
  dismissedPrefixes: string[],
  minimumCount = 3
): GroupSuggestion | null {
  const dismissed = new Set(dismissedPrefixes)
  const loose = items.filter(
    (item) => item.goal_id === null && item.archived_at === null
  )

  let best: GroupSuggestion | null = null
  for (const [stem, bucket] of groupByCommonPrefix(loose, (i) => i.title)) {
    if (dismissed.has(stem)) continue
    if (bucket.length < minimumCount) continue
    if (best === null || bucket.length > best.itemIds.length) {
      best = { stem, itemIds: bucket.map((i) => i.id) }
    }
  }
  return best
}
