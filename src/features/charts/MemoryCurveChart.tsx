import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CurvePoint } from '../../core/simulate/project'
import type { DateOnly } from '../../lib/date'
import { monthDay, percent, shortDate } from '../../lib/format'
import { yAxisMin, yAxisTicks } from './axis'

export interface MemoryCurveChartProps {
  curve: CurvePoint[]
  today: DateOnly
  targetRetention: number
  readyAt?: DateOnly | null
  holdUntil?: DateOnly | null
}

/**
 * 기억 곡선.
 *
 * 복습할 때마다 100% 로 튀고 그 사이는 망각 곡선을 따라 내려온다.
 * 지나간 구간은 실선, 앞으로는 점선이다.
 */
export function MemoryCurveChart({
  curve,
  today,
  targetRetention,
  readyAt,
  holdUntil,
}: MemoryCurveChartProps) {
  const values = curve.map((p) => p.retention)
  // 하한을 데이터에 맞춰 연다. 눌러 담으면 낮은 구간이 바닥에 붙어 거짓말이 된다.
  const min = yAxisMin([...values, targetRetention])
  const ticks = yAxisTicks(min)

  const data = curve.map((point) => ({
    date: point.date,
    past: point.projected ? null : point.retention,
    future: point.projected ? point.retention : null,
    reviewed: point.reviewed ? point.retention : null,
  }))

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          {readyAt && holdUntil && readyAt !== holdUntil ? (
            <ReferenceArea
              x1={readyAt}
              x2={holdUntil}
              fill="var(--accent-soft)"
              fillOpacity={0.9}
              stroke="none"
            />
          ) : null}
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fill: 'var(--text-3)', fontSize: 11 }}
            stroke="var(--line-2)"
            minTickGap={36}
          />
          <YAxis
            domain={[min, 1]}
            ticks={ticks}
            // 눈금을 우리가 정해서 넘기므로 하나도 빼지 않고 그린다.
            interval={0}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={{ fill: 'var(--text-3)', fontSize: 11 }}
            stroke="var(--line-2)"
            width={44}
          />
          <ReferenceLine
            y={targetRetention}
            stroke="var(--accent)"
            strokeDasharray="4 4"
            label={{
              value: `목표 기억률 ${percent(targetRetention)}`,
              position: 'insideTopRight',
              fill: 'var(--text-3)',
              fontSize: 11,
            }}
          />
          <ReferenceLine x={today} stroke="var(--text-3)" strokeWidth={1} />
          {readyAt ? (
            <ReferenceLine
              x={readyAt}
              stroke="var(--imp-fg)"
              strokeDasharray="3 3"
              label={{
                value: '목표한 날',
                position: 'top',
                fill: 'var(--imp-fg)',
                fontSize: 11,
              }}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="past"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="var(--accent-soft)"
            fillOpacity={0.45}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="future"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            dataKey="reviewed"
            stroke="none"
            dot={{ r: 3, fill: 'var(--accent)' }}
            isAnimationActive={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 9,
              fontSize: 12,
            }}
            labelFormatter={(label) =>
              typeof label === 'string' ? monthDay(label) : ''
            }
            formatter={(value) => [
              typeof value === 'number' ? percent(value) : '',
              '기억률',
            ]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
