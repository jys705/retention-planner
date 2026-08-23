import { cn } from '../lib/cn'

export interface OptionCard<T extends string> {
  key: T
  name: string
  desc: string
}

/**
 * 이름과 한 줄 설명을 같이 보여주는 고르기 칸.
 *
 * 목표 시점이나 복습 강도는 이름만으로 뜻이 안 통한다. '대략' 이 무엇인지 눌러 보고
 * 알게 두면 안 된다. 고르기 전에 설명이 이미 화면에 있어야 한다.
 */
export function OptionCards<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly OptionCard<T>[]
  value: T | null
  onChange: (key: T) => void
  /** 화면 낭독기와 시험이 이 묶음을 부르는 이름. */
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-[8px]"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          // 이름과 설명이 같이 들어 있어서, 이름표를 안 주면 둘이 붙은 채로 불린다.
          aria-label={option.name}
          aria-checked={option.key === value}
          onClick={() => onChange(option.key)}
          className={cn(
            'flex flex-col gap-[3px] rounded-ctl border px-[13px] py-[10px] text-left transition-colors',
            option.key === value
              ? 'border-accent bg-accent-soft'
              : 'border-line-2 bg-surface hover:bg-hover'
          )}
        >
          <span
            className={cn(
              'text-[13px] font-semibold',
              option.key === value ? 'text-accent' : 'text-text'
            )}
          >
            {option.name}
          </span>
          <span className="text-[11.5px] leading-snug text-text-3">
            {option.desc}
          </span>
        </button>
      ))}
    </div>
  )
}
