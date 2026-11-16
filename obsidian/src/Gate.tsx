import type { ReactNode } from 'react'
import { josa } from '../../src/lib/format'
import { usePluginStatus } from './status'

/**
 * 플러그인이 기록을 다 읽기 전에는 앱을 띄우지 않는다.
 *
 * 기다리는 말과 못 읽었다는 말도 앱 카드와 같은 자리에 선다. 캔버스 칸을 채우는 규칙이
 * rp-card 를 보고 붙는다.
 */
export function Gate({ children }: { children: ReactNode }) {
  const status = usePluginStatus((s) => s.status)
  if (status.kind === 'ready') return <>{children}</>
  if (status.kind === 'loading') {
    return (
      <div className="rp-card rp-gate rp-card-pad flex min-h-[64px] items-center justify-center text-[13px] text-text-3">
        불러오는 중
      </div>
    )
  }
  return (
    <div
      role="alert"
      className="rp-card rp-gate rp-card-pad flex flex-col gap-[6px] rounded-panel border border-line bg-surface px-[16px] py-[14px]"
    >
      <p className="text-[14px] font-semibold text-text">복습 기록을 읽지 못했어요.</p>
      <p className="text-pretty break-keep text-[12.5px] leading-relaxed text-text-2 [overflow-wrap:anywhere]">
        기록이 담긴 파일을 그대로 두었어요. 고치기 전에는 아무것도 쓰지 않습니다.
        보관함의 {status.file}
        {josa(status.file, '을', '를')} 확인해 주세요.
      </p>
      <p className="text-pretty break-keep text-[12px] leading-relaxed text-text-2">{status.reason}</p>
      {status.detail ? (
        <details className="text-[11.5px] text-text-3">
          <summary className="cursor-pointer">자세히</summary>
          <p className="pt-[4px] [overflow-wrap:anywhere]">{status.detail}</p>
        </details>
      ) : null}
    </div>
  )
}
