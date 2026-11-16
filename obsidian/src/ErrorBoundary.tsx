import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 앱 화면이 그리다 멈췄을 때 빈 칸 대신 무슨 일인지 알린다.
 *
 * React 는 그리는 도중에 던지면 그 아래를 통째로 걷는다. 옵시디언 탭이나 캔버스 카드가 아무
 * 말 없이 비어 버리면 사람은 기록이 사라졌다고 여긴다. 기록은 그대로라는 것과 다시 그려 볼
 * 단추를 보인다.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('복습 플래너 화면을 그리지 못했다', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        role="alert"
        className="rp-card rp-gate rp-card-pad flex flex-col gap-[6px] rounded-panel border border-line bg-surface px-[16px] py-[14px]"
      >
        <p className="text-[14px] font-semibold text-text">화면을 그리지 못했어요.</p>
        <p className="text-pretty break-keep text-[12.5px] leading-relaxed text-text-2">
          기록은 그대로 있어요. 다시 그려 보고, 또 이러면 옵시디언을 껐다 켜 주세요.
        </p>
        <div>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-ctl border border-line-2 px-[10px] py-[5px] text-[12.5px] text-text-2 hover:bg-hover"
          >
            다시 그리기
          </button>
        </div>
        <details className="text-[11.5px] text-text-3">
          <summary className="cursor-pointer">자세히</summary>
          <p className="pt-[4px] [overflow-wrap:anywhere]">{error.message}</p>
        </details>
      </div>
    )
  }
}
