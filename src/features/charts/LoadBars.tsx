import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'
import type { DateOnly } from '../../lib/date'
import { monthDay, shortDate } from '../../lib/format'

export interface LoadBar {
  date: DateOnly
  count: number
  /** 날짜를 옮기기 전의 개수. 비교 토글에서 유령 레이어로 겹친다. */
  before?: number
  markGoal?: boolean
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
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={bars}
          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
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
          {showBefore ? (
            <Bar
              dataKey="before"
              fill="var(--line-2)"
              fillOpacity={0.55}
              isAnimationActive={false}
            />
          ) : null}
          <Bar
            dataKey="count"
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
