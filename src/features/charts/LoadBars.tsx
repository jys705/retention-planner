import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'
import type { DateOnly } from '../../lib/date'
import { barTickStep } from './axis'
import { LOAD_SERIES } from './loadSeries'
import { monthDay, shortDate } from '../../lib/format'

export interface LoadBar {
  date: DateOnly
  count: number
  /** 날짜를 옮기기 전의 개수. 비교 토글에서 유령 레이어로 겹친다. */
  before?: number
  markGoal?: boolean
  /** 배지별로 쌓아 그릴 때의 조각. 안 주면 단색 한 덩어리로 그린다. */
  imp?: number
  plain?: number
  easy?: number
}

/** 그림 위에 세로선으로 세울 날. 목표한 날이 어디인지 알려준다. */
export interface GoalMark {
  date: DateOnly
  label: string
  color: string
}

/** 대략 목표의 구간. 옅은 띠로 깔아 어디까지가 그 목표인지 보인다. */
export interface GoalBand {
  from: DateOnly
  to: DateOnly
  color: string
}


/** 날짜별 복습 개수 막대. 예보와 목표 상세가 같이 쓴다. */
export function LoadBars({
  bars,
  cap,
  showBefore,
  onSelect,
  onHover,
  renderTooltip,
  selected,
  height = 200,
  stacked = false,
  marks,
  bands,
}: {
  bars: LoadBar[]
  cap?: number | null
  showBefore?: boolean
  onSelect?: (date: DateOnly) => void
  onHover?: (date: DateOnly | null) => void
  /** 호버할 때 띄울 내용. 안 주면 개수만 적힌 기본 상자가 뜬다. */
  renderTooltip?: (date: DateOnly) => ReactNode
  selected?: DateOnly | null
  height?: number
  /** 배지별로 쌓아 그릴지. 무엇이 몰리는지 색으로 읽힌다. */
  stacked?: boolean
  marks?: GoalMark[]
  bands?: GoalBand[]
}) {
  // 목표한 날이 그림의 오른쪽 끝에 서면 가운데 맞춘 이름표가 밖으로 잘린다.
  // 끝자락에 선 것은 이름표 끝을 선에 맞춰 왼쪽으로 세운다.
  const edge = Math.max(2, Math.round(bars.length * 0.12))
  const indexOf = (date: DateOnly) => bars.findIndex((b) => b.date === date)
  const nearEnd = (date: DateOnly) => {
    if (bars.length === 0) return false
    const at = indexOf(date)
    return at < 0 || at >= bars.length - edge
  }
  // 하루 상한 선은 그 근처까지 차는 날이 있을 때만 긋는다. 한참 모자란 날뿐이면 선을 그으려고
  // 축을 늘리게 되고, 막대가 바닥에 눌려 차이가 안 보인다.
  const tallest = Math.max(
    0,
    ...bars.map((b) =>
      Math.max(
        stacked ? (b.imp ?? 0) + (b.plain ?? 0) + (b.easy ?? 0) : b.count,
        showBefore ? (b.before ?? 0) : 0
      )
    )
  )
  const capShown = cap != null && cap > 0 && tallest >= cap * 0.75

  return (
    <div className="w-full">
      <div style={{ height }} className="w-full">
        {/* 높이를 수로 준다. 탭이 숨어 폭이 0 이어도 그림 크기가 0 이라고 경고하지 않는다. */}
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={bars}
            // 목표한 날 이름표가 그림 위에 선다. 여백이 좁으면 글자가 잘린다.
            margin={{ top: marks && marks.length > 0 ? 24 : 8, right: 12, bottom: 4, left: 0 }}
            onMouseLeave={() => onHover?.(null)}
          >
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: 'var(--text-3)', fontSize: 11 }}
              stroke="var(--line-2)"
              // 글자 폭을 재서 고르지 않고 같은 간격으로 찍는다. 데스크톱 앱과 옵시디언이 같은 날짜를 보인다.
              interval={barTickStep(bars.length) - 1}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--text-3)', fontSize: 11 }}
              stroke="var(--line-2)"
              width={32}
            />
            {capShown ? (
              // 이름표는 그림 밖 아래에 따로 적는다. 그림 안에 세우면 막대나 목표한 날 선과 겹친다.
              <ReferenceLine
                y={cap}
                stroke="var(--imp-fg)"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
              />
            ) : null}
            {bands?.map((band) => (
              <ReferenceArea
                key={`${band.from}-${band.to}`}
                x1={band.from}
                x2={band.to}
                fill={band.color}
                fillOpacity={0.12}
                stroke="none"
              />
            ))}
            {marks?.map((mark) => (
              <ReferenceLine
                key={mark.date}
                x={mark.date}
                stroke={mark.color}
                strokeWidth={1.5}
                // 이름표는 늘 그림 위 여백 줄에 선다. 그림 안에 세우면 하루 상한 이름표와 겹친다.
                label={(props: { viewBox?: { x?: number; y?: number } }) => (
                  <text
                    x={(props.viewBox?.x ?? 0) + (nearEnd(mark.date) ? 2 : 0)}
                    y={(props.viewBox?.y ?? 0) - 7}
                    textAnchor={nearEnd(mark.date) ? 'end' : 'middle'}
                    fill={mark.color}
                    fontSize={10.5}
                  >
                    {/* 이름이 길면 옆 이름표와 겹친다. 앞부분만 세운다. */}
                    {mark.label.length > 10 ? `${mark.label.slice(0, 10)}...` : mark.label}
                  </text>
                )}
              />
            ))}
            {showBefore ? (
              <Bar
                dataKey="before"
                fill="var(--line-2)"
                fillOpacity={0.55}
                isAnimationActive={false}
              />
            ) : null}
            {stacked
              ? LOAD_SERIES.map((series) => (
                  <Bar
                    key={series.key}
                    dataKey={series.key}
                    stackId="load"
                    fill={series.color}
                    isAnimationActive={false}
                    onClick={(entry: unknown) => {
                      const row = entry as { date?: DateOnly }
                      if (row.date && onSelect) onSelect(row.date)
                    }}
                    onMouseEnter={(entry: unknown) => {
                      const row = entry as { date?: DateOnly }
                      if (row.date) onHover?.(row.date)
                    }}
                    cursor={onSelect ? 'pointer' : undefined}
                  />
                ))
              : null}
            <Bar
              dataKey={stacked ? '__none__' : 'count'}
              hide={stacked}
              isAnimationActive={false}
              onClick={(entry: unknown) => {
                const row = entry as { date?: DateOnly }
                if (row.date && onSelect) onSelect(row.date)
              }}
              onMouseEnter={(entry: unknown) => {
                const row = entry as { date?: DateOnly }
                if (row.date) onHover?.(row.date)
              }}
            >
              {bars.map((bar) => (
                <Cell
                  key={bar.date}
                  fill={
                    selected === bar.date
                      ? 'var(--accent-2)'
                      : cap && bar.count > cap
                        ? 'var(--imp-fg)'
                        : 'var(--accent)'
                  }
                  cursor={onSelect ? 'pointer' : undefined}
                />
              ))}
            </Bar>
            {renderTooltip ? (
              <Tooltip
                cursor={{ fill: 'var(--hover)' }}
                wrapperStyle={{ outline: 'none', zIndex: 10 }}
                content={({ active, label }) =>
                  active && typeof label === 'string' ? renderTooltip(label) : null
                }
              />
            ) : (
              <Tooltip
                cursor={{ fill: 'var(--hover)' }}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 9,
                  fontSize: 12,
                }}
                labelFormatter={(label) =>
                  typeof label === 'string' ? monthDay(label) : ''
                }
                // 기본 구분자 ' : ' 는 쌍점 앞에 빈칸이 들어간다. '예정 3개' 로 적는다.
                separator=" "
                formatter={(value, name) => [
                  `${String(value)}개`,
                  name === 'before' ? '조정 전' : '예정',
                ]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {capShown ? (
        <div className="flex justify-end pt-[2px] text-[11px] text-text-3">
          <span className="flex items-center gap-[6px]">
            <svg aria-hidden width="18" height="2" className="flex-none">
              <line x1="0" y1="1" x2="18" y2="1" stroke="var(--imp-fg)" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            <span>
              하루 상한 <span className="num">{cap}개</span>
            </span>
          </span>
        </div>
      ) : null}
    </div>
  )
}
