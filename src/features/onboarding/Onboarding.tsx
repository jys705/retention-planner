import { useState } from 'react'
import { usePlanner } from '../../store/planner'

const STEPS = [
  {
    title: '한 일을 한 줄로 적어요',
    body: '복습은 앱 밖에서 합니다. 원래 진행하던 공부를 마친 뒤에 돌아와서 한 줄로 적어두기만 하면 돼요.',
    example: '4장 연습문제 1번에서 10번',
  },
  {
    title: '다시 볼 날을 알려드려요',
    body: '잊을 때쯤 오늘 목록에 올려둡니다. 목표 시점을 정해두면 그날까지 기억이 가장 높게 올라오도록 일정을 역산해요.',
    example: '다음은 10월 2일에 3개예요',
  },
  {
    title: '얼마나 기억났는지 고르면 돼요',
    body: '자가 평가 네 단계 중 하나만 고르면 다음 복습일이 다시 잡힙니다. 그게 전부예요.',
    example: '다시 | 어려움 | 무난함 | 쉬움',
  },
] as const

/**
 * 첫 실행 안내. 세 단계이고 언제든 건너뛸 수 있으며 한 번만 보여준다.
 *
 * 익숙해진 사람에게 계속 보이는 설명은 잡음이라 다시 뜨지 않는다.
 */
export function Onboarding() {
  const saveSetting = usePlanner((s) => s.saveSetting)
  const [step, setStep] = useState(0)

  // 맛보기 항목을 만들어 두지 않는다. 사용자가 안 적은 것이 목록에 있으면
  // 지워야 할 남의 자국처럼 보인다. 빈 상태 안내가 그 역할을 대신한다.
  async function finish() {
    await saveSetting('onboardingDone', true)
  }

  const current = STEPS[step]
  const last = step === STEPS.length - 1

  return (
    <div className="flex h-full items-center justify-center bg-desk p-5">
      <div className="w-full max-w-[520px] rounded-panel border border-line bg-surface px-[28px] py-[26px] shadow-md">
        <div className="flex items-center justify-between">
          <span className="num text-[11.5px] text-text-3">
            {step + 1} / {STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => void finish()}
            className="text-[12px] text-text-3 hover:text-text-2"
          >
            건너뛰기
          </button>
        </div>

        <h1 className="pt-4 text-[19px] font-semibold leading-snug">
          {current.title}
        </h1>
        <p className="pt-2 text-[13.5px] leading-relaxed text-text-2">
          {current.body}
        </p>

        <div className="num mt-5 rounded-card bg-rail px-[14px] py-[12px] text-[13px] text-text-2">
          {current.example}
        </div>

        <div className="flex items-center justify-between pt-6">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-[12.5px] text-text-3 disabled:opacity-0"
          >
            이전
          </button>
          <button
            type="button"
            onClick={() => {
              if (last) void finish()
              else setStep((s) => s + 1)
            }}
            className="rounded-ctl bg-accent px-[16px] py-[8px] text-[13px] font-semibold text-white"
          >
            {last ? '시작하기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  )
}
