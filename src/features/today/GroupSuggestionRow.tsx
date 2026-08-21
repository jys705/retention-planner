import { usePlanner } from '../../store/planner'
import { findGroupSuggestion } from './suggestion'

/**
 * 목표로 묶으면 좋을 항목이 쌓였을 때 조용히 한 줄로 권한다.
 *
 * 배너도 모달도 아니다. 무시하면 그냥 사라지고 같은 이름으로는 다시 묻지 않는다.
 */
export function GroupSuggestionRow() {
  const { items, settings, today } = usePlanner()
  const createGoal = usePlanner((s) => s.createGoal)
  const attachItemsToGoal = usePlanner((s) => s.attachItemsToGoal)
  const saveSetting = usePlanner((s) => s.saveSetting)

  // 하루에 한 번, 한 개만 권한다.
  if (settings.lastSuggestionDate === today) return null

  const suggestion = findGroupSuggestion(items, settings.dismissedPrefixes)
  if (!suggestion) return null

  async function accept() {
    if (!suggestion) return
    const goal = await createGoal({
      name: suggestion.stem,
      horizon: { kind: 'open' },
    })
    await attachItemsToGoal(goal.id, suggestion.itemIds)
    await saveSetting('lastSuggestionDate', today)
  }

  async function dismiss() {
    if (!suggestion) return
    await saveSetting('dismissedPrefixes', [
      ...settings.dismissedPrefixes,
      suggestion.stem,
    ])
    await saveSetting('lastSuggestionDate', today)
  }

  return (
    <div className="mt-3 flex items-center gap-3 rounded-card bg-rail px-[14px] py-[10px]">
      <p className="min-w-0 flex-1 text-[12.5px] text-text-2">
        {`"${suggestion.stem}"으로 시작하는 항목이 ${suggestion.itemIds.length}개예요. 목표로 묶으면 시험 날짜를 한 번만 정하면 돼요.`}
      </p>
      <button
        type="button"
        onClick={() => void accept()}
        className="flex-none rounded-ctl border border-accent px-[11px] py-[5px] text-[12px] font-semibold text-accent hover:bg-accent-soft"
      >
        묶기
      </button>
      <button
        type="button"
        onClick={() => void dismiss()}
        aria-label="제안 닫기"
        className="flex-none px-1 text-[13px] text-text-3 hover:text-text-2"
      >
        ✕
      </button>
    </div>
  )
}
