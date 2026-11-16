import type { GoalRow, ItemRow } from '../../db/types'
import { cn } from '../../lib/cn'
import type { DateOnly } from '../../lib/date'
import { goalRestsOnDay } from '../../lib/domain'
import { monthDay, shortDate } from '../../lib/format'
import { scheduledItems } from '../../lib/lifecycle'
import type { Settings } from '../../lib/settings'

/**
 * 오늘 목록이 비었을 때 그 자리에 서는 말.
 *
 * 왜 비었는지에 따라 할 말이 다르다. 앱의 오늘 화면과 옵시디언 카드가 같이 쓴다.
 * 카드는 좁아서 여백만 줄인다.
 */
export function TodayEmpty({
  items,
  goals,
  settings,
  activeCount,
  goalsToday,
  listedToday,
  reviewedToday,
  upcoming,
  compact = false,
}: {
  items: readonly ItemRow[]
  goals: readonly GoalRow[]
  settings: Settings
  activeCount: number
  goalsToday: readonly GoalRow[]
  listedToday: number
  /** 오늘 실제로 복습한 것이 있는지. 새로 적으며 매긴 첫 평가는 세지 않는다. */
  reviewedToday: boolean
  upcoming: { date: DateOnly; count: number }[]
  compact?: boolean
}) {
  if (items.length === 0) return <EmptyLibrary compact={compact} />
  if (activeCount === 0) return <AllEnded compact={compact} />
  // 다 봐서 빈 것이 아니다. 오늘을 비워 두기로 해서 올리지 않은 것이다.
  // 다른 것을 올려서 다 봤다면 그건 다 본 날이다.
  if (goalsToday.some(goalRestsOnDay) && listedToday === 0) {
    return <RestDay upcoming={upcoming} compact={compact} />
  }
  return (
    <EmptyToday
      upcoming={upcoming}
      reviewedToday={reviewedToday}
      // 남은 것이 모두 목표 뒤로 잡혀 있으면 할 일을 다 한 것이다.
      finishedForGoal={
        upcoming.length === 0 &&
        scheduledItems(items, goals, settings).length < activeCount
      }
      compact={compact}
    />
  )
}

/**
 * 오늘 목록이 빈 날.
 *
 * 다음 날짜와 그날 개수를 같이 적는다. 언제 또 올라오는지 알면 앱을 닫아도 된다.
 * 오늘 본 것이 하나도 없으면 '다 봤어요' 는 맞지 않는다. 처음부터 볼 것이 없던 날이다.
 */
function EmptyToday({
  upcoming,
  reviewedToday,
  finishedForGoal,
  compact,
}: {
  upcoming: { date: DateOnly; count: number }[]
  reviewedToday: boolean
  finishedForGoal: boolean
  compact: boolean
}) {
  const next = upcoming[0]
  return (
    <EmptyFrame
      title={reviewedToday ? '오늘 볼 건 다 봤어요.' : '오늘은 볼 게 없어요.'}
      compact={compact}
    >
      <p className={cn('text-pretty break-keep text-text-2', bodySize(compact))}>
        {next
          ? `다음은 ${monthDay(next.date)}에 ${next.count}개예요. 그때 알려드릴게요.`
          : finishedForGoal
            ? '목표한 날까지 볼 것은 다 마쳤어요.'
            : '앞으로 잡힌 복습이 없어요. 아래에 한 줄 적어보세요.'}
      </p>
      {upcoming.length > 0 ? (
        <div
          className={cn(
            'num flex pt-[6px] text-[12px] text-text-3',
            compact ? 'flex-wrap gap-x-[12px] gap-y-[2px]' : 'gap-[18px]'
          )}
        >
          {upcoming.map((entry) => (
            <span key={entry.date}>
              {shortDate(entry.date)} {entry.count}개
            </span>
          ))}
        </div>
      ) : null}
    </EmptyFrame>
  )
}

/** 목표한 날을 비워 두기로 해서 오늘 목록이 빈 날. */
function RestDay({
  upcoming,
  compact,
}: {
  upcoming: { date: DateOnly; count: number }[]
  compact: boolean
}) {
  const next = upcoming[0]
  return (
    <EmptyFrame title="오늘은 비워 둔 날이에요." compact={compact}>
      <p className={cn('text-pretty break-keep text-text-2', bodySize(compact))}>
        {next
          ? `다음은 ${monthDay(next.date)}에 ${next.count}개예요. 그때 알려드릴게요.`
          : '앞으로 잡힌 복습이 없어요.'}
      </p>
    </EmptyFrame>
  )
}

/**
 * 적어둔 것이 모두 마친 목표의 것일 때.
 *
 * '다 봤어요' 는 맞지 않는다. 본 것이 아니라 목표가 끝난 것이다. 남은 일은 새로
 * 공부한 것을 적는 것뿐이다.
 */
function AllEnded({ compact }: { compact: boolean }) {
  return (
    <EmptyFrame title="지금 볼 항목이 없어요." compact={compact}>
      <p
        className={cn(
          'max-w-[460px] text-pretty break-keep leading-relaxed text-text-2',
          bodySize(compact)
        )}
      >
        마친 목표의 항목은 보관해 두었어요. 새로 공부한 것을 아래에 한 줄로 적으면 다시
        볼 날을 계산해서 오늘 목록에 올려둘게요.
      </p>
    </EmptyFrame>
  )
}

function EmptyLibrary({ compact }: { compact: boolean }) {
  return (
    <EmptyFrame title="아직 적어둔 게 없어요." compact={compact}>
      <p
        className={cn(
          'max-w-[460px] text-pretty break-keep leading-relaxed text-text-2',
          bodySize(compact)
        )}
      >
        방금 공부한 걸 아래에 한 줄로 적어보세요. 다시 볼 날은 앱이 계산해서 오늘
        목록에 올려둘게요.
      </p>
    </EmptyFrame>
  )
}

function bodySize(compact: boolean): string {
  return compact ? 'text-[13px]' : 'text-[13.5px]'
}

function EmptyFrame({
  title,
  compact,
  children,
}: {
  title: string
  compact: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col',
        compact
          ? 'gap-[6px] px-[8px] pb-[14px] pt-[12px]'
          : 'gap-[9px] px-[20px] pb-[34px] pt-[38px]'
      )}
    >
      <p
        className={cn(
          'font-semibold tracking-[-0.01em]',
          compact ? 'text-[15px]' : 'text-[17px]'
        )}
      >
        {title}
      </p>
      {children}
    </div>
  )
}
