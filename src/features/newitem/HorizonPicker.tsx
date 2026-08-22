import { useState } from 'react'
import {
  APPROX_PRESETS,
  customCenterDays,
  relativeWindow,
  UNIT_LABEL,
  type ApproxUnit,
  type Horizon,
} from '../../core/horizon/horizon'
import { Chip } from '../../components/Chip'
import { DateField } from '../../components/DateField'
import { cn } from '../../lib/cn'
import type { DateOnly } from '../../lib/date'
import { fullDate, monthDay } from '../../lib/format'
import { MODE_META } from './horizonModes'

export interface HorizonPickerProps {
  today: DateOnly
  uncertainty: number
  value: Horizon
  onChange: (horizon: Horizon) => void
}

/**
 * 목표 시점 고르기.
 *
 * 대략은 점이 아니라 구간이다. 처음 보면 모르는 개념이라 고를 때 구간을 그대로 보여준다.
 */
export function HorizonPicker({
  today,
  uncertainty,
  value,
  onChange,
}: HorizonPickerProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const [amount, setAmount] = useState(4)
  const [unit, setUnit] = useState<ApproxUnit>('week')

  function pickPreset(centerDays: number) {
    setCustomOpen(false)
    const w = relativeWindow(today, centerDays, uncertainty)
    onChange({ kind: 'window', readyAt: w.readyAt, holdUntil: w.holdUntil })
  }

  function applyCustom(nextAmount: number, nextUnit: ApproxUnit) {
    const w = relativeWindow(
      today,
      customCenterDays(nextAmount, nextUnit),
      uncertainty
    )
    onChange({ kind: 'window', readyAt: w.readyAt, holdUntil: w.holdUntil })
  }

  const customWindow = relativeWindow(
    today,
    customCenterDays(amount, unit),
    uncertainty
  )

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex flex-wrap gap-[6px]">
        {MODE_META.map((meta) => (
          <Chip
            key={meta.mode}
            active={value.kind === meta.mode}
            title={meta.desc}
            onClick={() => {
              if (meta.mode === 'open') onChange({ kind: 'open' })
              else if (meta.mode === 'date') {
                onChange({ kind: 'date', at: today })
              } else pickPreset(30)
            }}
          >
            {meta.name}
          </Chip>
        ))}
      </div>

      {value.kind === 'open' ? (
        <p className="text-[12px] leading-relaxed text-text-3">
          마감 없이, 잊을 만할 때마다 계속 올려드릴게요. 간격은 볼수록 길어집니다.
        </p>
      ) : null}

      {value.kind === 'date' ? (
        <div className="flex flex-col items-start gap-[6px]">
          <DateField
            value={value.at}
            today={today}
            min={today}
            onChange={(at) => onChange({ kind: 'date', at })}
            label="목표한 날 고르기"
            text={fullDate(value.at)}
            active
          />
          <p className="text-[12px] text-text-3">
            그날까지 기억이 가장 높게 올라오도록 잡아요.
          </p>
        </div>
      ) : null}

      {value.kind === 'window' ? (
        <div className="flex flex-col gap-[8px]">
          <div className="flex flex-wrap gap-[6px]">
            {APPROX_PRESETS.map((preset) => {
              const w = relativeWindow(today, preset.centerDays, uncertainty)
              const active =
                !customOpen &&
                value.readyAt === w.readyAt &&
                value.holdUntil === w.holdUntil
              return (
                <Chip
                  key={preset.id}
                  active={active}
                  onClick={() => pickPreset(preset.centerDays)}
                >
                  {preset.label}
                </Chip>
              )
            })}
            <Chip
              active={customOpen}
              onClick={() => {
                setCustomOpen(true)
                applyCustom(amount, unit)
              }}
            >
              직접
            </Chip>
          </div>

          {customOpen ? (
            <div className="flex flex-wrap items-center gap-[6px]">
              <input
                type="number"
                min={1}
                max={99}
                value={amount}
                onChange={(event) => {
                  const next = Math.min(
                    99,
                    Math.max(1, Number(event.target.value) || 1)
                  )
                  setAmount(next)
                  applyCustom(next, unit)
                }}
                className="num w-[58px] rounded-ctl border border-line-2 bg-surface px-[8px] py-[5px] text-[13px]"
              />
              <div className="flex overflow-hidden rounded-ctl border border-line-2">
                {(['week', 'month', 'year'] as ApproxUnit[]).map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => {
                      setUnit(candidate)
                      applyCustom(amount, candidate)
                    }}
                    className={cn(
                      'px-[10px] py-[5px] text-[13px]',
                      unit === candidate
                        ? 'bg-accent-soft font-semibold text-accent'
                        : 'bg-surface text-text-2 hover:bg-hover'
                    )}
                  >
                    {UNIT_LABEL[candidate]}
                  </button>
                ))}
              </div>
              <span className="text-[13px] text-text-2">쯤</span>
              <span className="num text-[12.5px] text-text-3">
                {monthDay(customWindow.readyAt)}부터{' '}
                {monthDay(customWindow.holdUntil)} 사이
              </span>
            </div>
          ) : null}

          <p className="text-[12px] leading-relaxed text-text-3">
            정확한 날을 모를 땐 앞뒤로 여유를 둡니다. 이른 쪽(
            <span className="num">{monthDay(value.readyAt)}</span>)까지는 준비를
            끝내고, 늦은 쪽(
            <span className="num">{monthDay(value.holdUntil)}</span>)까지 그
            상태를 유지해요.
          </p>
        </div>
      ) : null}
    </div>
  )
}
