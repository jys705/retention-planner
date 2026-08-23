import { addDays, diffDays, type DateOnly } from './date'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function monthDay(date: DateOnly): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`
}

export function shortDate(date: DateOnly): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}

export function weekday(date: DateOnly): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return WEEKDAYS[day]
}

export function fullDate(date: DateOnly): string {
  return `${monthDay(date)} ${weekday(date)}요일`
}

/**
 * 다음에 볼 날을 사람이 읽는 말로.
 *
 * 가까우면 상대 표현이 빠르게 읽히고, 멀어지면 날짜가 더 쓸모 있다.
 */
export function dueLabel(today: DateOnly, due: DateOnly): string {
  const gap = diffDays(today, due)
  if (gap < 0) return `${-gap}일 지남`
  if (gap === 0) return '오늘'
  if (gap === 1) return '내일'
  if (gap === 2) return '모레'
  if (gap <= 13) return `${gap}일 뒤`
  return monthDay(due)
}

/** 평가 버튼에 붙는 다음 복습일. 며칠 뒤인지가 결론이다. */
export function intervalLabel(intervalDays: number): string {
  if (intervalDays <= 0) return '오늘'
  if (intervalDays === 1) return '내일'
  return `${intervalDays}일 뒤`
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** 목표 시점을 한 줄로. 대략이면 구간을 그대로 보여준다. */
export function horizonLabel(
  kind: string,
  readyAt: DateOnly | null,
  holdUntil: DateOnly | null
): string {
  if (kind === 'date' && readyAt) return monthDay(readyAt)
  if (kind === 'window' && readyAt && holdUntil) {
    return `${monthDay(readyAt)} ~ ${monthDay(holdUntil)}`
  }
  return '정해두지 않음'
}

/** 목표까지 남은 날. 화면에는 D-4 같은 표기를 쓰지 않는다. */
export function daysLeftLabel(today: DateOnly, readyAt: DateOnly): string {
  const gap = diffDays(today, readyAt)
  if (gap < 0) return `${-gap}일 지남`
  if (gap === 0) return '오늘'
  if (gap === 1) return '내일'
  return `${gap}일 남음`
}

/** 기억 지속력을 화면 표기로. 숫자만 두지 않고 단위와 뜻을 붙인다. */
export function stabilityLabel(stability: number): string {
  if (stability < 1) return '하루 미만'
  if (stability < 60) return `${Math.round(stability)}일`
  if (stability < 730) return `${Math.round(stability / 30)}개월`
  return `${Math.round(stability / 365)}년`
}

/**
 * 체감 난이도를 단계 표현으로.
 * 5.2 / 10 같은 점수는 그 자체로 뜻이 안 통한다.
 */
export function difficultyLabel(difficulty: number): string {
  // 평가 등급 이름(무난함)과 겹치지 않게 고른 말들이다.
  // 같은 화면에서 둘이 나란히 나오면 무엇을 가리키는 말인지 헷갈린다.
  if (difficulty < 3) return '아주 쉬움'
  if (difficulty < 5) return '쉬운 편'
  if (difficulty < 7) return '보통'
  if (difficulty < 8.5) return '어려운 편'
  return '많이 어려움'
}

export function relativeWindowLabel(
  today: DateOnly,
  readyAt: DateOnly,
  holdUntil: DateOnly
): string {
  const early = diffDays(today, readyAt)
  const late = diffDays(today, holdUntil)
  const center = Math.round((early + late) / 2)
  if (center <= 10) return '1주쯤'
  if (center <= 17) return '2주쯤'
  if (center <= 25) return '3주쯤'
  if (center <= 45) return '1개월쯤'
  if (center <= 75) return '2개월쯤'
  if (center <= 135) return '3개월쯤'
  if (center <= 270) return '6개월쯤'
  return '1년쯤'
}

export function nextDates(dates: DateOnly[], limit = 3): string {
  return dates.slice(0, limit).map(shortDate).join(', ')
}

export function yesterdayOf(today: DateOnly): DateOnly {
  return addDays(today, -1)
}

/**
 * 앞말에 맞는 조사를 고른다.
 *
 * 사용자가 지은 제목이 그대로 문장에 들어가므로 조사를 하나로 못 박을 수 없다.
 * 받침이 있으면 앞엣것, 없으면 뒤엣것을 쓴다. 한글이 아니면 받침 없는 쪽으로 둔다.
 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return withoutFinal
  return (code - 0xac00) % 28 === 0 ? withoutFinal : withFinal
}
