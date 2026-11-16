import { ItemView, Scope, type WorkspaceLeaf } from 'obsidian'
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
    // 옵시디언은 Esc 를 받으면, 쓰던 탭이 이런 보기일 때 마지막 노트로 옮겨 간다. 이 보기를 쓰는
    // 동안에는 옵시디언 단축키 차례에서 Esc 의 기본 동작을 막는다. 따로 띄운 창의 키도 이 차례를
    // 먼저 거친다. false 를 돌려주면 옵시디언이 키를 아예 거둬 가서 앱이 Esc 를 못 받는다. 그래서
    // 기본 동작만 막고 키는 그대로 흘려보낸다. 대화 상자와 메뉴는 제 차례가 위에 있어 그대로 닫힌다.
    this.scope = new Scope(this.app.scope)
    this.scope.register([], 'Escape', (event: KeyboardEvent) => {
      event.preventDefault()
      return true
    })
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
    // 옵시디언은 Esc 를 받으면, 쓰던 탭이 이런 보기일 때 마지막 노트로 옮겨 간다. 그러면
    // 앱의 편집이나 지울지 묻는 것이 열린 채 남고, 이어 친 글자가 노트에 들어간다.
    // 창 맨 앞에서 기본 동작만 막는다. 앱 안의 Esc 처리는 그대로 받는다.
    // 따로 띄운 창의 키는 옵시디언이 본 창으로 한 벌 더 보내고, 거기서 탭을 옮긴다. 그래서 본 창에도
    // 건다. 탭을 다른 창으로 옮겨도 이 보기는 그대로라 다시 열리지 않으니, 본 창 쪽이 늘 받는다.
    this.registerDomEvent(window, 'keydown', (event) => this.holdEscape(event), true)
    const own = (this.containerEl as HTMLElement & { win?: Window }).win
    if (own && own !== window) {
      this.registerDomEvent(own, 'keydown', (event) => this.holdEscape(event), true)
    }
  }

  private holdEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    if (this.app.workspace.getActiveViewOfType(PlannerView) !== this) return
    // 옵시디언의 대화 상자나 메뉴가 떠 있으면 그것을 닫게 둔다. 이 보기가 있는 창과 본 창을 다 본다.
    const open = '.modal-container, .menu, .suggestion-container'
    if (this.containerEl.ownerDocument.querySelector(open) || document.querySelector(open)) return
    event.preventDefault()
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
