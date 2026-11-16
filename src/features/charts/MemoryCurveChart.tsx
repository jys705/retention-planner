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
import { fromEpochDay, toEpochDay, type DateOnly } from '../../lib/date'
import { monthDay, percent, shortDate } from '../../lib/format'
import { dayTicks, yAxisMin, yAxisTicks } from './axis'
import { curveRows, type CurveRow } from './curveRows'

export interface MemoryCurveChartProps {
  curve: CurvePoint[]
  today: DateOnly
  targetRetention: number
  readyAt?: DateOnly | null
  holdUntil?: DateOnly | null
}

const HEIGHT = 240

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
  const values = curve.flatMap((p) => [p.retention, p.before])
  // 하한을 데이터에 맞춰 연다. 눌러 담으면 낮은 구간이 바닥에 붙어 거짓말이 된다.
  const min = yAxisMin([...values, targetRetention])
  const ticks = yAxisTicks(min)

  const rows = curveRows(curve, today)
  const firstPoint = curve[0]
  const lastPoint = curve[curve.length - 1]
  const first = firstPoint ? toEpochDay(firstPoint.date) : toEpochDay(today)
  const end = Math.max(lastPoint ? toEpochDay(lastPoint.date) : first, first + 1)
  const byDay = new Map(curve.map((p) => [toEpochDay(p.date), p]))

  return (
    <div className="w-full" style={{ height: HEIGHT }}>
      {/* 높이를 수로 준다. 탭이 숨어 폭이 0 이어도 그림 크기가 0 이라고 경고하지 않는다. */}
      <ResponsiveContainer width="100%" height={HEIGHT}>
        {/* 위쪽 여백은 '목표한 날' 이름이 들어갈 자리다. 좁으면 글자가 잘린다. */}
        <ComposedChart
          data={rows}
          margin={{ top: 26, right: 24, bottom: 4, left: 0 }}
        >
          <CartesianGrid stroke="var(--line)" vertical={false} />
          {readyAt && holdUntil && readyAt !== holdUntil ? (
            <ReferenceArea
              x1={toEpochDay(readyAt)}
              x2={toEpochDay(holdUntil)}
              fill="var(--accent-soft)"
              fillOpacity={0.9}
              stroke="none"
            />
          ) : null}
          <XAxis
            type="number"
            dataKey="x"
            domain={[first, end]}
            ticks={dayTicks(first, end)}
            // 눈금을 우리가 정해서 넘기므로 하나도 빼지 않고 그린다.
            interval={0}
            allowDecimals={false}
            tickFormatter={(x: number) => shortDate(fromEpochDay(x))}
            tick={{ fill: 'var(--text-3)', fontSize: 11 }}
            stroke="var(--line-2)"
          />
          <YAxis
            domain={[min, 1]}
            ticks={ticks}
            interval={0}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={{ fill: 'var(--text-3)', fontSize: 11 }}
            stroke="var(--line-2)"
            width={44}
          />
          <ReferenceLine x={toEpochDay(today)} stroke="var(--text-3)" strokeWidth={1} />
          {readyAt ? (
            <ReferenceLine
              x={toEpochDay(readyAt)}
              stroke="var(--imp-fg)"
              strokeDasharray="3 3"
              label={{
                value: '목표한 날',
                position: 'top',
                // 그 전날 잡힌 복습 점이 그림 맨 위(100%)에 찍힌다. 이름표를 점보다 위로 올린다.
                offset: 12,
                fill: 'var(--imp-fg)',
                fontSize: 11,
              }}
            />
          ) : null}
          {/* 목표 기억률 선은 오늘 선과 목표한 날 선 뒤에 그린다. 나중에 그린 것이 위에 와서 글자를 가린다. */}
          <ReferenceLine
            y={targetRetention}
            stroke="var(--accent)"
            strokeDasharray="4 4"
            // 바탕색 테를 둘러 쓴다. 새 항목은 '오늘' 세로선이 이 글자 자리를 지나간다.
            label={(props: { viewBox?: { x?: number; y?: number } }) => (
              <text
                x={(props.viewBox?.x ?? 0) + 6}
                y={(props.viewBox?.y ?? 0) + 16}
                fill="var(--text-3)"
                fontSize={11}
                stroke="var(--surface)"
                strokeWidth={4}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {`목표 기억률 ${percent(targetRetention)}`}
              </text>
            )}
          />
          <Area
            type="linear"
            dataKey="past"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="var(--accent-soft)"
            fillOpacity={0.45}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="future"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            dataKey="mark"
            stroke="none"
            dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
            activeDot={false}
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
          />
          <Tooltip
            cursor={{ stroke: 'var(--line-2)' }}
            wrapperStyle={{ outline: 'none', zIndex: 10 }}
            content={({ active, payload, label }) => {
              if (!active) return null
              const row = payload?.[0]?.payload as CurveRow | undefined
              const x = row?.x ?? (typeof label === 'number' ? label : null)
              const point = x === null ? undefined : byDay.get(x)
              return point ? <CurveTip point={point} today={today} /> : null
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * 곡선 위에 마우스를 올리거나 키보드로 고른 날의 설명.
 *
 * 그날 하나에 한 줄이다. 복습한 날은 복습 전과 후를 같이 적는다.
 */
export function CurveTip({ point, today }: { point: CurvePoint; today: DateOnly }) {
  const isToday = point.date === today
  const plannedNow = isToday && point.planned !== null && !point.reviewed
  const note = point.reviewed
    ? point.projected
      ? '복습 예정'
      : isToday
        ? '오늘 복습'
        : '복습'
    : plannedNow
      ? '오늘 볼 차례'
      : isToday
        ? '오늘'
        : null
  const from = point.reviewed ? point.before : point.retention
  const to = point.reviewed ? point.retention : plannedNow ? point.planned : null
  return (
    <div className="rounded-[9px] border border-line bg-surface px-[11px] py-[8px] text-[12px] leading-[1.5]">
      <div className="text-text-2">
        {monthDay(point.date)}
        {note ? <span className="text-text-3"> {note}</span> : null}
      </div>
      <div className="text-text">
        기억률 <span className="num">{percent(from)}</span>
        {to !== null && to !== from ? (
          <>
            에서 <span className="num">{percent(to)}</span>로
          </>
        ) : null}
      </div>
    </div>
  )
}
