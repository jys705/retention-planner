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
  // 끝자락에 선 것은 안쪽으로 붙여 세운다.
  const lastDate = bars[bars.length - 1]?.date ?? null
  const nearEnd = (date: DateOnly) => {
    if (lastDate === null || bars.length === 0) return false
    const at = bars.findIndex((b) => b.date === date)
    return at < 0 || at >= bars.length - Math.max(2, Math.round(bars.length * 0.12))
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
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
            minTickGap={30}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--text-3)', fontSize: 11 }}
            stroke="var(--line-2)"
            width={32}
          />
          {cap ? (
            <ReferenceLine
              y={cap}
              stroke="var(--imp-fg)"
              strokeDasharray="4 4"
              label={{
                value: `하루 상한 ${cap}개`,
                position: 'insideTopRight',
                fill: 'var(--text-3)',
                fontSize: 11,
              }}
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
              label={{
                // 이름이 길면 옆 이름표와 겹친다. 앞부분만 세운다.
                value:
                  mark.label.length > 10
                    ? `${mark.label.slice(0, 10)}...`
                    : mark.label,
                position: nearEnd(mark.date) ? 'insideTopRight' : 'top',
                fill: mark.color,
                fontSize: 10.5,
              }}
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
              formatter={(value, name) => [
                `${String(value)}개`,
                name === 'before' ? '조정 전' : '예정',
              ]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
