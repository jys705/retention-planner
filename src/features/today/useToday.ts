import { useState } from 'react'
import type { Grade } from '../../core/fsrs/types'
import { goalRestsOnDay, isActive } from '../../lib/domain'
import {
  dueBeyondEnd,
  endedNotice,
  itemLastReviewDay,
  retentionOn,
  scheduledItems,
} from '../../lib/lifecycle'
import { GRADE_HELP_THRESHOLD } from '../../lib/settings'
import {
  canUndo,
  selectOverallRetention,
  selectTodayItems,
  selectUpcoming,
  splitTodayItems,
  usePlanner,
} from '../../store/planner'
import type { Ending } from './JustDone'

/**
 * 오늘 화면이 보는 것과 하는 일.
 *
 * 앱의 오늘 화면과 옵시디언 노트 속 카드가 같이 쓴다. 둘이 따로 세면 같은 날
 * 목록과 되돌리기가 서로 다르게 보인다.
 */
export function useToday() {
  const state = usePlanner()
  const { items, goals, reviews, settings, today } = state
  const rateItem = usePlanner((s) => s.rateItem)
  const addItem = usePlanner((s) => s.addItem)
  const undoLastRating = usePlanner((s) => s.undoLastRating)
  const undoable = canUndo(state) ? state.lastRating : null
  // 방금 본 것의 다음 날짜가 목표 밖이면 판이 그 날짜를 약속하지 않게 한다.
  const lastItem = undoable
    ? (items.find((i) => i.id === undoable.itemId) ?? null)
    : null
  const lastGoal = lastItem?.goal_id
    ? (goals.find((g) => g.id === lastItem.goal_id) ?? null)
    : null
  const ending: Ending =
    lastItem && dueBeyondEnd(lastItem, lastGoal, settings)
      ? itemLastReviewDay(lastItem, lastGoal, settings) === today
        ? lastGoal !== null && goalRestsOnDay(lastGoal)
          ? 'restEve'
          : 'lastDay'
        : 'early'
      : null
  // 목표한 날을 비워 뒀으니 이것이 마지막이다. '다시' 처럼 막 무너진 것은 그날 아침
  // 목표 아래로 내려와 있을 수 있다. 그날은 올리지 않으므로 지금 말해야 알 수 있다.
  const goalDayRetention =
    ending === 'restEve' && lastItem && lastGoal?.ready_at
      ? retentionOn(lastItem, reviews, lastGoal.ready_at)
      : null
  const shortOnGoalDay =
    goalDayRetention !== null &&
    lastGoal !== null &&
    goalDayRetention < lastGoal.target_retention
      ? goalDayRetention
      : null
  // 오늘이 목표한 날인 목표들. 준비는 어제까지 끝나 있다. 대략 목표는 그날부터
  // 기억을 붙잡는 기간이 시작되므로 '안 봐도 괜찮다' 고 할 날이 아니다.
  const goalsToday = goals.filter(
    (g) =>
      g.archived_at === null && g.horizon_kind === 'date' && g.ready_at === today
  )
  const ended = endedNotice(items, goals, reviews, settings, today)
  const acknowledgeEnded = usePlanner((s) => s.acknowledgeEnded)

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { overdue, dueToday } = splitTodayItems({ items, goals, settings, today })
  const todayItems = selectTodayItems({ items, goals, settings, today })
  // 오늘 목록에 섰던 수. 다 보고 나면 목록은 비지만 올린 적이 없는 것은 아니다.
  // 이걸 안 세면 다른 것을 다 본 뒤에 '오늘은 아무것도 올리지 않았어요' 가 된다.
  const listedToday =
    todayItems.length + reviews.filter((r) => r.reviewed_at === today).length
  // 목표 뒤로 잡힌 날짜는 그 날이 오기 전에 목표가 끝나 내려간다. 다음 날짜로 세지 않는다.
  const upcoming = selectUpcoming(scheduledItems(items, goals, settings), today)
  const overall = selectOverallRetention(items, today)
  const activeCount = items.filter(isActive).length
  const showFullGradeHelp = settings.ratingCount < GRADE_HELP_THRESHOLD

  // 평가가 끝나기 전에 또 누르면 되돌릴 사진이 낡는다. 저장소가 표로 걸러
  // 내지만, 그러면 되돌리기 자리가 조용히 사라져 사람이 영문을 모른다.
  const [rating, setRating] = useState(false)

  async function handleRate(itemId: string, grade: Grade) {
    if (rating) return
    setRating(true)
    setExpandedId(null)
    try {
      // 여기는 '오늘' 화면이다. 오늘 본 것으로만 기록한다.
      await rateItem(itemId, grade, { reviewedAt: today })
    } finally {
      setRating(false)
    }
  }

  async function handleUndo() {
    const itemId = undoable?.itemId ?? null
    await undoLastRating()
    // 되돌린 사람은 대개 다른 등급을 고르려던 참이다. 그 줄을 다시 펴 준다.
    if (itemId !== null) setExpandedId(itemId)
  }


  return {
    items,
    goals,
    reviews,
    settings,
    today,
    addItem,
    undoable,
    ending,
    shortOnGoalDay,
    goalsToday,
    ended,
    acknowledgeEnded,
    expandedId,
    setExpandedId,
    overdue,
    dueToday,
    todayItems,
    listedToday,
    upcoming,
    overall,
    activeCount,
    showFullGradeHelp,
    handleRate,
    handleUndo,
  }
}
