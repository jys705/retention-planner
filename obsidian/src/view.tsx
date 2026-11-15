import { ItemView, type WorkspaceLeaf } from 'obsidian'
import { App, type Route, type RouteRequest } from '../../src/App'
import type { Host } from '../../src/lib/host'
import { DISPLAY_NAME, ICON, VIEW_TYPE } from './constants'
import type { Mounted } from './mount'

/** 보기가 플러그인에게 바라는 것. 플러그인 클래스를 바로 물면 시험에서 떼어 쓰기 어렵다. */
export interface ViewDeps {
  mount(parent: HTMLElement, host: Host, node: React.ReactNode): Mounted
  host(view: PlannerView): Host
}

/**
 * 옵시디언 탭 하나를 다 쓰는 앱 화면.
 *
 * 데스크톱 앱과 같은 화면이다. 노트 속 카드에서 항목을 누르면 이 화면이 그 항목으로 간다.
 */
export class PlannerView extends ItemView {
  private mounted: Mounted | null = null
  private request: RouteRequest | null = null
  private readonly deps: ViewDeps

  constructor(leaf: WorkspaceLeaf, deps: ViewDeps) {
    super(leaf)
    this.deps = deps
  }

  override getViewType(): string {
    return VIEW_TYPE
  }

  override getDisplayText(): string {
    return DISPLAY_NAME
  }

  override getIcon(): string {
    return ICON
  }

  override async onOpen(): Promise<void> {
    this.contentEl.replaceChildren()
    this.mounted = this.deps.mount(this.contentEl, this.deps.host(this), this.node())
  }

  override async onClose(): Promise<void> {
    this.mounted?.unmount()
    this.mounted = null
  }

  /** 앱 화면을 한 자리로 옮긴다. */
  show(route: Route): void {
    // 부탁마다 새로 만든다. 같은 항목을 두 번 눌러도 두 번 옮겨 간다.
    this.request = { route }
    this.mounted?.render(this.node())
  }

  private node(): React.ReactNode {
    return <App request={this.request} />
  }
}
