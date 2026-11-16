/**
 * 옵시디언 API 의 가짜.
 *
 * 옵시디언은 플러그인에게 이 모듈을 실행 중에만 쥐여 준다. npm 의 obsidian 은 타입뿐이라
 * 시험에서는 플러그인이 쓰는 만큼을 여기서 흉내 낸다. 동작은 옵시디언 문서에 적힌 것을 따른다.
 */

export class Notice {
  static messages: string[] = []
  /** 옵시디언처럼 글이나 글 조각을 받는다. 시험은 보이는 글만 본다. */
  constructor(message: string | DocumentFragment) {
    Notice.messages.push(typeof message === 'string' ? message : (message.textContent ?? ''))
  }
}

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '')
}

interface EventRef {
  off(): void
}

export class Component {
  private children: Component[] = []
  private cleanups: (() => void)[] = []
  private loaded = false

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    await this.onload()
    for (const child of this.children) await child.load()
  }

  unload(): void {
    if (!this.loaded) return
    for (const child of this.children) child.unload()
    this.children = []
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.loaded = false
    this.onunload()
  }

  onload(): void | Promise<void> {}

  onunload(): void {}

  addChild<T extends Component>(child: T): T {
    this.children.push(child)
    if (this.loaded) void child.load()
    return child
  }

  register(cleanup: () => void): void {
    this.cleanups.push(cleanup)
  }

  registerEvent(ref: EventRef): void {
    this.cleanups.push(() => ref.off())
  }

  registerInterval(id: number): number {
    this.cleanups.push(() => clearInterval(id))
    return id
  }

  registerDomEvent(
    el: EventTarget,
    type: string,
    callback: (event: Event) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void {
    el.addEventListener(type, callback, options)
    this.cleanups.push(() => el.removeEventListener(type, callback, options))
  }
}

export class MarkdownRenderChild extends Component {
  containerEl: HTMLElement
  constructor(containerEl: HTMLElement) {
    super()
    this.containerEl = containerEl
  }
}

/** 옵시디언 단축키 차례 하나. 시험은 무엇을 걸었는지만 본다. */
export class Scope {
  readonly parent: Scope | undefined
  keys: { modifiers: string[]; key: string; func: (event: KeyboardEvent) => unknown }[] = []
  constructor(parent?: Scope) {
    this.parent = parent
  }
  register(modifiers: string[], key: string, func: (event: KeyboardEvent) => unknown): void {
    this.keys.push({ modifiers, key, func })
  }
}

export class View extends Component {
  app: App
  leaf: WorkspaceLeaf
  scope: Scope | null = null
  containerEl: HTMLElement
  constructor(leaf: WorkspaceLeaf) {
    super()
    this.leaf = leaf
    this.app = leaf.workspace.app
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'workspace-leaf-content'
  }
  getViewType(): string {
    return ''
  }
  getDisplayText(): string {
    return ''
  }
  getIcon(): string {
    return ''
  }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class ItemView extends View {
  contentEl: HTMLElement
  constructor(leaf: WorkspaceLeaf) {
    super(leaf)
    this.contentEl = document.createElement('div')
    this.contentEl.className = 'view-content'
    this.containerEl.appendChild(this.contentEl)
  }
}

export class WorkspaceLeaf {
  readonly workspace: Workspace
  view: View | null = null
  /** 옵시디언이 어디에 연 탭인지. 시험이 본다. */
  readonly openedAs: { kind: unknown; direction: unknown }

  constructor(workspace: Workspace, kind: unknown, direction: unknown) {
    this.workspace = workspace
    this.openedAs = { kind, direction }
  }

  async setViewState(state: { type: string; active?: boolean }): Promise<void> {
    const create = this.workspace.creators.get(state.type)
    if (!create) throw new Error(`등록되지 않은 보기: ${state.type}`)
    if (this.view) {
      await this.view.onClose()
      this.view.unload()
    }
    const view = create(this)
    this.view = view
    view.containerEl.dataset.type = view.getViewType()
    document.body.appendChild(view.containerEl)
    await view.load()
    await view.onOpen()
    if (state.active) this.workspace.activeLeaf = this
  }

  get isDeferred(): boolean {
    return false
  }

  async loadIfDeferred(): Promise<void> {}

  async detach(): Promise<void> {
    if (this.view) {
      await this.view.onClose()
      this.view.unload()
      this.view.containerEl.remove()
    }
    this.view = null
    this.workspace.leaves = this.workspace.leaves.filter((l) => l !== this)
  }
}

export class Workspace {
  readonly app: App
  creators = new Map<string, (leaf: WorkspaceLeaf) => View>()
  leaves: WorkspaceLeaf[] = []
  activeLeaf: WorkspaceLeaf | null = null
  private handlers = new Map<string, Set<(...args: unknown[]) => unknown>>()

  constructor(app: App) {
    this.app = app
  }

  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return this.leaves.filter((leaf) => leaf.view?.getViewType() === type)
  }

  getLeaf(kind?: unknown, direction?: unknown): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf(this, kind, direction)
    this.leaves.push(leaf)
    return leaf
  }

  /** 옵시디언처럼 탭을 앞으로 내기만 한다. 쓰고 있는 탭은 바꾸지 않는다. */
  async revealLeaf(leaf: WorkspaceLeaf): Promise<void> {
    this.revealed = leaf
  }

  revealed: WorkspaceLeaf | null = null

  setActiveLeaf(leaf: WorkspaceLeaf, _options?: { focus?: boolean }): void {
    this.revealed = leaf
    this.activeLeaf = leaf
  }

  layoutReady = true

  onLayoutReady(callback: () => unknown): void {
    void callback()
  }

  getActiveViewOfType<T extends View>(type: new (...args: never[]) => T): T | null {
    const view = this.activeLeaf?.view
    return view instanceof type ? view : null
  }

  on(name: string, callback: (...args: never[]) => unknown): EventRef {
    const set = this.handlers.get(name) ?? new Set()
    const listener = callback as (...args: unknown[]) => unknown
    set.add(listener)
    this.handlers.set(name, set)
    return { off: () => set.delete(listener) }
  }

  trigger(name: string, ...args: unknown[]): void {
    for (const callback of this.handlers.get(name) ?? []) callback(...args)
  }
}

export class TFolder {
  constructor(readonly path: string) {}
}

export class TFile {
  constructor(readonly path: string) {}
}

export class Vault {
  configDir = '.obsidian'
  files = new Map<string, string>()
  folders = new Set<string>()
  private handlers = new Map<string, Set<(...args: unknown[]) => unknown>>()

  /** 'raw' 는 보관함 안의 파일이 바뀌거나 지워질 때마다 그 경로로 온다. 설정 폴더도 온다. */
  on(name: string, callback: (...args: never[]) => unknown): EventRef {
    const set = this.handlers.get(name) ?? new Set()
    const listener = callback as (...args: unknown[]) => unknown
    set.add(listener)
    this.handlers.set(name, set)
    return { off: () => set.delete(listener) }
  }

  trigger(name: string, ...args: unknown[]): void {
    for (const callback of this.handlers.get(name) ?? []) callback(...args)
  }

  getFolderByPath(path: string): TFolder | null {
    return this.folders.has(path) ? new TFolder(path) : null
  }

  async createFolder(path: string): Promise<TFolder> {
    this.folders.add(path)
    return new TFolder(path)
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    if (this.files.has(path)) return new TFile(path)
    if (this.folders.has(path)) return new TFolder(path)
    return null
  }

  async create(path: string, data: string): Promise<TFile> {
    if (this.files.has(path)) throw new Error(`이미 있는 파일: ${path}`)
    this.files.set(path, data)
    return new TFile(path)
  }
}

export class App {
  workspace: Workspace
  vault = new Vault()
  scope = new Scope()
  constructor() {
    this.workspace = new Workspace(this)
  }
}

export interface PluginManifest {
  id: string
  name: string
  version: string
}

export interface Command {
  id: string
  name: string
  callback?: () => unknown
  editorCallback?: (editor: { replaceSelection(text: string): void }) => unknown
}

/**
 * 플러그인. data.json 은 글로 들고 있는다. 옵시디언처럼 읽을 때 JSON 으로 푼다.
 */
export class Plugin extends Component {
  app: App
  manifest: PluginManifest
  /** 플러그인 폴더의 data.json 내용. 없으면 null. */
  dataText: string | null = null
  saves = 0
  processors = new Map<
    string,
    (
      source: string,
      el: HTMLElement,
      ctx: { addChild(child: Component): void; sourcePath: string }
    ) => unknown
  >()
  commands: Command[] = []
  ribbons: { icon: string; title: string; callback: () => unknown }[] = []

  constructor(app: App, manifest: PluginManifest) {
    super()
    this.app = app
    this.manifest = manifest
  }

  /**
   * 옵시디언과 같이 깨진 JSON 에서 던지지 않는다. 콘솔에 남기고 undefined 를 준다.
   * 파일이 없을 때만 null 이다.
   */
  async loadData(): Promise<unknown> {
    if (this.dataText === null) return null
    try {
      return JSON.parse(this.dataText)
    } catch {
      return undefined
    }
  }

  async saveData(data: unknown): Promise<void> {
    this.dataText = JSON.stringify(data, null, 2)
    this.saves += 1
  }

  registerView(type: string, creator: (leaf: WorkspaceLeaf) => View): void {
    this.app.workspace.creators.set(type, creator)
  }

  registerMarkdownCodeBlockProcessor(
    language: string,
    handler: Plugin['processors'] extends Map<string, infer H> ? H : never
  ): void {
    this.processors.set(language, handler)
  }

  addRibbonIcon(icon: string, title: string, callback: () => unknown): HTMLElement {
    this.ribbons.push({ icon, title, callback })
    return document.createElement('div')
  }

  addCommand(command: Command): Command {
    this.commands.push(command)
    return command
  }
}
