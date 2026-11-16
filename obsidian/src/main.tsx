import {
  MarkdownRenderChild,
  normalizePath,
  Notice,
  Plugin,
  type EventRef,
  type WorkspaceLeaf,
} from 'obsidian'
import {
  provideRepository,
  SnapshotFormatError,
  SnapshotRepository,
  type Snapshot,
} from '../../src/db'
import { TodayCard, type OpenTarget } from '../../src/features/today/TodayCard'
import { localStamp, today as clockToday } from '../../src/lib/clock'
import { josa } from '../../src/lib/format'
import type { Host, SavedFile } from '../../src/lib/host'
import { usePlanner } from '../../src/store/planner'
import { remindIfDue } from '../../src/store/reminder'
import { createFirstClickForwarder } from './canvasClick'
import { BLOCK_LANGUAGE, DISPLAY_NAME, ICON, VIEW_TYPE } from './constants'
import { nodeDataFile, parseDataText, type DataFile, type DataFs } from './datafile'
import { nodeDownloads, type Downloads } from './files'
import { Mounts, type Mounted } from './mount'
import { setPluginStatus, usePluginStatus } from './status'
import { PlannerView } from './view'
import './styles.css'

/** 다운로드 폴더를 못 쓸 때 내보낸 파일을 둘 보관함 안 폴더. */
const EXPORT_FOLDER = 'retention-planner'

/** 같은 알림을 이 간격 안에서는 한 번만 띄운다. 저장과 바뀜은 연달아 온다. */
const NOTICE_GAP_MS = 10_000

/**
 * 밖에서 깨진 data.json 을 이만큼 기다렸다가 지금 기록으로 되살린다. 그사이에 다른 프로그램이
 * 마저 쓰면 그것을 읽는다. 기다리지 않고 두면, 옵시디언을 끄는 순간 기록이 깨진 파일로만 남는다.
 */
const REPAIR_DELAY_MS = 3_000

/** 캔버스 칸 가운데 옵시디언 안쪽에서 여기서 쓰는 것만. 옵시디언이 바꾸면 조용히 건너뛴다. */
interface CanvasNodeLike {
  text?: unknown
  nodeEl?: unknown
  child?: { previewMode?: { renderer?: { rerender?: (full?: boolean) => void } } }
}

interface CanvasViewLike {
  canvas?: { nodes?: Map<string, CanvasNodeLike> }
}

/**
 * 옵시디언 플러그인.
 *
 * 기록은 이 플러그인의 data.json 하나에 남는다. 보관함을 옮기면 기록도 같이 간다.
 * 데스크톱 앱과 같은 내보내기 파일을 쓰므로 서로의 파일을 합쳐서 가져올 수 있다.
 */
export default class RetentionPlannerPlugin extends Plugin {
  private readonly mounts = new Mounts()
  private repository: SnapshotRepository | null = null
  private readonly lastNotice = new Map<string, number>()
  /**
   * 마지막으로 읽거나 쓴 기록 파일 내용.
   *
   * 옵시디언은 data.json 이 바뀌면 누가 바꿨든 알려 온다. 우리가 쓴 것을 다시 읽으면
   * 다시 쓰고, 그것이 또 바뀜으로 와서 끝없이 돈다. 같은 내용이면 우리 것으로 보고 넘긴다.
   */
  private lastText: string | null = null
  /**
   * 바로 전에 우리가 쓴 내용. 새로 쓰는 도중에 파일을 읽으면 아직 이것이 보인다.
   * 그것을 남이 바꾼 것으로 보고 다시 읽으면 방금 한 평가의 되돌리기와 적던 글이 사라진다.
   */
  private earlierText: string | null = null
  /** 깨진 파일이 그대로 있다. 다음에 쓸 때 그 파일을 옆에 남기고 쓴다. */
  private brokenOnDisk = false
  /** 깨지거나 지워진 파일을 되살리려고 기다리는 중. */
  private repairTimer: number | null = null
  /** 밖에서 깨뜨렸거나 지운 파일을 아직 지금 기록으로 되살리지 않았다. */
  private needsRepair: 'broken' | 'missing' | null = null

  /** 내보낸 파일을 쓸 곳. 시험에서 바꿔 끼운다. */
  downloads: Downloads | null = nodeDownloads()
  /** 기록 파일. 시험에서 바꿔 끼운다. */
  dataFile: DataFile | null = null
  /** 깨지거나 지워진 파일을 되살리기 전에 기다리는 시간. 시험에서 줄인다. */
  repairDelayMs = REPAIR_DELAY_MS

  override async onload(): Promise<void> {
    this.dataFile ??= this.defaultDataFile()
    // 기록을 다 읽고 나서 화면을 연다. 그 전에 뜬 화면은 기다리는 말만 보인다.
    await this.start()

    this.registerView(
      VIEW_TYPE,
      (leaf) =>
        new PlannerView(leaf, {
          mount: (parent, host, node) => this.mounts.mount(parent, 'app', host, node),
          host: (view) => this.viewHost(view),
        })
    )
    this.registerMarkdownCodeBlockProcessor(BLOCK_LANGUAGE, (_source, el, ctx) => {
      ctx.addChild(new TodayBlock(el, (parent) => this.mountBlock(parent)))
    })

    this.addRibbonIcon(ICON, `${DISPLAY_NAME} 열기`, () => {
      void this.openApp(null, 'tab')
    })
    this.addCommand({
      id: 'open',
      name: `${DISPLAY_NAME} 열기`,
      callback: () => void this.openApp(null, 'tab'),
    })
    this.addCommand({
      id: 'insert-today-block',
      name: '오늘 복습 카드 넣기',
      editorCallback: (editor) => {
        editor.replaceSelection(`\`\`\`${BLOCK_LANGUAGE}\n\`\`\`\n`)
      },
    })

    this.registerEvent(this.app.workspace.on('css-change', () => this.mounts.syncTheme()))
    // 옵시디언은 며칠씩 켜 둔다. 자정이 지나면 오늘을 다시 셈하고, 알림 시각을 지켜본다.
    this.registerInterval(window.setInterval(() => void this.tick(), 60_000))
    this.registerDomEvent(window, 'focus', () => void this.tick())

    // 캔버스의 첫 클릭이 카드 속 단추와 입력 칸에 닿게 한다. 따로 띄운 창도 본다.
    const forwarder = createFirstClickForwarder()
    const watched = new WeakSet<Document>()
    const watch = (doc: Document) => {
      if (watched.has(doc)) return
      watched.add(doc)
      this.registerDomEvent(doc, 'pointerdown', (event) => forwarder.pointerdown(event), true)
      this.registerDomEvent(doc, 'click', (event) => forwarder.click(event), true)
    }
    watch(document)
    // 플러그인을 껐다 켜면(판을 바꿀 때) 이미 떠 있던 따로 띄운 창은 열린다는 알림이 다시 오지 않는다.
    this.app.workspace.iterateAllLeaves?.((leaf) => {
      const doc = (leaf.view?.containerEl as HTMLElement | undefined)?.ownerDocument
      if (doc) watch(doc)
    })
    this.registerEvent(
      this.app.workspace.on('window-open', (win: { doc?: Document }) => {
        if (win?.doc) watch(win.doc)
      })
    )

    // 옵시디언은 data.json 이 바뀐 것을 수정 시각이 늘었을 때만 알려 온다. 지워졌을 때, 시각을 그대로
    // 둔 채 바뀌었을 때는 알려 오지 않는다. 보관함의 낮은 단계 알림으로 그 경로를 직접 지켜본다.
    const watchedPath = this.dataVaultPath()
    const vault = this.app.vault as unknown as {
      on(name: 'raw', callback: (path: string) => unknown): EventRef
    }
    this.registerEvent(
      vault.on('raw', (path) => {
        if (path === watchedPath) void this.checkDataFile()
      })
    )
    // 옵시디언을 끌 때는 플러그인의 onunload 를 부르지 않는다. 끄기 전에 기다려 주는 일감에 건다.
    this.registerEvent(
      this.app.workspace.on('quit', (tasks: { add(task: () => Promise<unknown>): void }) => {
        tasks.add(() => this.saveBeforeLeaving())
      })
    )

    // 옵시디언은 플러그인보다 먼저 캔버스를 그린다. 그때 빈 코드 블록으로 남은 카드를 다시 그린다.
    this.app.workspace.onLayoutReady(() => this.rerenderCanvasBlocks())
  }

  /**
   * 끄기 전에 기록을 남긴다. 밖에서 깨뜨렸거나 지운 파일이 그대로면 지금 기록으로 되살린다.
   * 안 그러면 기록이 메모리에만 있다가 사라진다.
   */
  private async saveBeforeLeaving(): Promise<void> {
    if (this.repairTimer !== null) window.clearTimeout(this.repairTimer)
    this.repairTimer = null
    const repository = this.repository
    const file = this.dataFile
    if (!repository) return
    const missing = file !== null && (await file.read().catch(() => '')) === null
    // 지워진 파일은 마지막으로 쓴 내용과 같아도 다시 써야 한다. 같으면 건너뛰는 쓰기가 막지 않게 비운다.
    if (missing) this.lastText = null
    if (this.needsRepair || missing) await repository.rewrite()
    else await repository.flush()
  }

  override onunload(): void {
    // 떠 있는 카드와 앱을 다 거둔다. 캔버스 카드는 옵시디언이 거둬 주지 않는다. 남겨 두면
    // 옛 코드가 새로 켠 플러그인 옆에서 돌며 새 기록을 덮는다.
    this.mounts.unmountAll()
    void this.saveBeforeLeaving()
  }

  /** 다른 기기나 프로그램이 data.json 을 고쳤을 때. 우리가 쓴 것도 이리로 온다. */
  override async onExternalSettingsChange(): Promise<void> {
    await this.checkDataFile()
  }

  /**
   * data.json 이 우리가 아는 내용 그대로인지 본다. 다르면 남이 바꾼 것이다.
   *
   * 옵시디언의 알림, 보관함의 낮은 단계 알림, 1분마다 도는 확인이 모두 이리로 온다.
   */
  private async checkDataFile(): Promise<void> {
    const kind = usePluginStatus.getState().status.kind
    if (kind === 'failed') {
      // 못 읽던 파일이 고쳐졌을 수 있다. 다시 열어 본다. 못 읽으면 그대로 멈춰 있다.
      await this.start()
      return
    }
    const repository = this.repository
    const file = this.dataFile
    if (!repository || !file || kind !== 'ready') return
    let text: string | null
    try {
      // 쓰고 있던 것이 끝난 뒤에 읽는다. 도중에 읽으면 우리 것의 앞 내용이 보인다.
      await repository.flush()
      text = await file.read()
    } catch {
      return
    }
    if (text === this.lastText) return
    if (text !== null && text === this.earlierText) return
    if (text === null) {
      // 누가 파일을 지웠다. 동기화 프로그램이 충돌을 풀며 지우는 일이 흔하다. 그대로 두면
      // 옵시디언을 끄는 순간 기록이 사라진다. 잠깐 기다렸다가 지금 기록으로 다시 쓴다.
      this.lastText = null
      this.scheduleRepair('missing')
      return
    }
    try {
      parseDataText(text)
    } catch {
      // 다른 프로그램이 쓰는 도중이거나 깨진 파일이다. 지금 기록을 지킨다.
      this.keepOwnRecords(text)
      return
    }
    try {
      await repository.reload()
      await usePlanner.getState().load()
    } catch {
      // JSON 으로는 읽히지만 기록의 꼴이 아니다. 깨진 것과 똑같이 다룬다.
      this.keepOwnRecords(text)
    }
  }

  /**
   * 밖에서 쓴 data.json 을 못 읽었다. 메모리의 기록을 지키고, 잠깐 기다렸다가 그 파일을 옆에
   * 남긴 뒤 지금 기록으로 다시 쓴다. 그 안에만 있던 것은 사람이 사본에서 찾아 쓸 수 있다.
   */
  private keepOwnRecords(text: string): void {
    this.lastText = text
    this.brokenOnDisk = true
    this.notice('external', `${DISPLAY_NAME}: 바뀐 기록을 읽지 못해서 지금 기록을 그대로 둡니다.`)
    this.scheduleRepair('broken')
  }

  private scheduleRepair(reason: 'broken' | 'missing'): void {
    this.needsRepair = reason
    if (this.repairTimer !== null) window.clearTimeout(this.repairTimer)
    this.repairTimer = window.setTimeout(() => {
      this.repairTimer = null
      void this.repair()
    }, this.repairDelayMs)
  }

  private async repair(): Promise<void> {
    const reason = this.needsRepair
    const repository = this.repository
    const file = this.dataFile
    if (!reason || !repository || !file) return
    let text: string | null
    try {
      text = await file.read()
    } catch {
      return
    }
    // 그사이에 또 바뀌었으면 그 알림이 따로 온다. 그쪽을 따른다.
    if (text !== this.lastText) return
    await repository.rewrite()
    if (this.needsRepair !== null) return
    // 깨진 파일을 옆에 남긴 것은 쓰는 쪽이 알린다.
    if (reason === 'missing') {
      this.notice('repair', `${DISPLAY_NAME}: 기록 파일이 지워져서 지금 기록으로 다시 썼어요.`)
    }
  }

  /**
   * 노트 카드나 명령에서 앱 화면을 연다.
   *
   * 떠 있는 것이 있으면 그것을 쓴다. 없으면 새 탭으로 연다. 앱 화면은 데스크톱 창처럼
   * 폭이 900px 은 있어야 열이 맞는데, 옆으로 나눈 칸은 그보다 좁기 쉽다.
   * 항목을 주면 그 항목으로, home 이면 오늘 화면으로 간다. 둘 다 아니면 보던 자리를 지킨다.
   */
  async openApp(
    target: OpenTarget,
    where: 'tab' | 'split',
    options: { home?: boolean } = {}
  ): Promise<void> {
    const { workspace } = this.app
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? null
    if (!leaf) {
      leaf =
        where === 'split'
          ? workspace.getLeaf('split', 'vertical')
          : workspace.getLeaf('tab')
      await leaf.setViewState({ type: VIEW_TYPE, active: true })
    }
    await workspace.revealLeaf(leaf)
    // 뒤에 있던 탭은 열기 전까지 비어 있다.
    if (typeof leaf.loadIfDeferred === 'function') await leaf.loadIfDeferred()
    // 앞에 내기만 하면 키보드가 뒤의 탭으로 간다. 쓰는 탭으로 삼는다.
    workspace.setActiveLeaf(leaf, { focus: true })
    const view = leaf.view
    if (!(view instanceof PlannerView)) return
    if (target) view.show({ screen: 'library', itemId: target.itemId })
    else if (options.home) view.show({ screen: 'today' })
  }

  private defaultDataFile(): DataFile | null {
    const load = (globalThis as { require?: (id: string) => unknown }).require
    const adapter = this.app.vault.adapter as { getBasePath?: () => string } | undefined
    const dir = (this.manifest as { dir?: string }).dir
    if (typeof load !== 'function' || typeof adapter?.getBasePath !== 'function' || !dir) {
      return null
    }
    try {
      const fs = load('fs') as DataFs
      const path = load('path') as { join(...parts: string[]): string }
      return nodeDataFile(fs, path.join(adapter.getBasePath(), dir, 'data.json'))
    } catch {
      return null
    }
  }

  private async start(): Promise<void> {
    const file = this.dataFile
    const repository = new SnapshotRepository({
      read: async () => {
        if (!file) return this.loadDataStrict()
        const text = await file.read()
        this.lastText = text
        this.earlierText = null
        if (text === null) return null
        // 깨졌으면 던진다. 그러면 아무것도 쓰지 않고 '읽지 못했어요' 를 띄운다.
        const data = parseDataText(text)
        this.brokenOnDisk = false
        this.needsRepair = null
        return data
      },
      write: (snapshot) => this.writeSnapshot(snapshot),
    })
    try {
      await repository.init()
      this.repository = repository
      provideRepository(repository)
      await usePlanner.getState().load()
      setPluginStatus({ kind: 'ready' })
    } catch (error) {
      this.repository = null
      setPluginStatus({ kind: 'failed', ...describeReadError(error), file: this.dataPath() })
      this.notice('read', `${DISPLAY_NAME}: 기록을 읽지 못했어요. 파일은 그대로 두었어요.`)
    }
  }

  /** 노드 fs 를 못 쓸 때만 쓴다. 옵시디언이 깨진 JSON 을 빈 값으로 주는 것을 오류로 바꾼다. */
  private async loadDataStrict(): Promise<unknown> {
    const data = await this.loadData()
    if (data === undefined) throw new Error('data.json 을 JSON 으로 읽지 못했다')
    return data
  }

  private async writeSnapshot(snapshot: Snapshot): Promise<void> {
    const file = this.dataFile
    if (!file) {
      await this.saveData(snapshot)
      return
    }
    const text = JSON.stringify(snapshot, null, 2)
    if (text === this.lastText) return
    const previous = this.lastText
    const earlier = this.earlierText
    // 쓰자마자 옵시디언이 바뀌었다고 알려 온다. 우리 것인지 가리려고 먼저 적어 둔다.
    this.lastText = text
    this.earlierText = previous
    try {
      let kept: string | null = null
      if (this.brokenOnDisk) {
        kept = await file.keepCopy(`broken-${localStamp()}`)
        this.brokenOnDisk = false
      } else {
        // 알림 없이 바뀐 파일을 그대로 덮으면 그 안에만 있던 것이 사라진다. 덮기 전에 옆에 남긴다.
        const onDisk = await file.read().catch(() => undefined)
        if (typeof onDisk === 'string' && onDisk !== previous && onDisk !== earlier) {
          kept = await file.keepCopy(`outside-${localStamp()}`)
        }
      }
      await file.write(text)
      this.needsRepair = null
      if (kept) {
        const name = kept.split(/[\\/]/).pop() ?? kept
        this.notice('repair', `${DISPLAY_NAME}: 읽지 못하거나 밖에서 바뀐 파일은 ${name}${josa(name, '으로', '로')} 남기고 지금 기록을 다시 썼어요.`)
      }
    } catch {
      // 메모리의 기록은 그대로 산다. 다음에 저장이 되면 그때까지의 것이 다 남는다.
      this.lastText = previous
      this.notice('save', `${DISPLAY_NAME}: 기록을 저장하지 못했어요. 옵시디언을 닫기 전에 내보내기로 남겨 두세요.`)
    }
  }

  private async tick(): Promise<void> {
    if (usePluginStatus.getState().status.kind !== 'ready') return
    // 링크 너머에서 바뀌었거나 알림 없이 바뀐 것도 여기서 잡는다.
    await this.checkDataFile()
    if (clockToday() !== usePlanner.getState().today) {
      await usePlanner.getState().load()
    }
    await remindIfDue()
  }

  /** 열려 있는 캔버스에서 이 카드를 품은 칸을 다시 그린다. */
  private rerenderCanvasBlocks(): void {
    const fence = `\`\`\`${BLOCK_LANGUAGE}`
    for (const leaf of this.app.workspace.getLeavesOfType('canvas')) {
      const nodes = (leaf.view as unknown as CanvasViewLike).canvas?.nodes
      if (!nodes || typeof nodes.values !== 'function') continue
      for (const node of nodes.values()) {
        // 글 칸은 글에서, 노트를 띄운 파일 칸은 그려 둔 모양에서 이 카드인지 안다. 플러그인보다
        // 먼저 그려진 파일 칸에는 아직 코드 글자로 남은 블록이 있다.
        const inText = typeof node.text === 'string' && node.text.includes(fence)
        // 따로 띄운 창의 요소는 그 창의 HTMLElement 라 instanceof 로 가리지 않는다.
        const nodeEl = node.nodeEl as { querySelector?: (selector: string) => unknown } | undefined
        const leftAsCode =
          typeof nodeEl?.querySelector === 'function' &&
          nodeEl.querySelector(`code.language-${BLOCK_LANGUAGE}`) !== null
        if (!inText && !leftAsCode) continue
        try {
          node.child?.previewMode?.renderer?.rerender?.(true)
        } catch {
          // 옵시디언 안쪽이 바뀌었다. 파일을 다시 열면 그려진다.
        }
      }
    }
  }

  private mountBlock(parent: HTMLElement): Mounted {
    return this.mounts.mount(
      parent,
      'block',
      this.blockHost(),
      <TodayCard onOpenApp={(target) => void this.openApp(target, 'tab', { home: true })} />
    )
  }

  private viewHost(view: PlannerView): Host {
    return {
      ownsTheme: false,
      ownsReminder: false,
      acceptsShortcut: (event) => {
        // 지금 쓰고 있는 탭이 이 화면일 때만 받는다. 옆 노트에서 친 키는 그 노트 것이다.
        if (this.app.workspace.getActiveViewOfType(PlannerView) !== view) return false
        const target = event.target as Node | null
        if (!target || typeof target.nodeType !== 'number') return false
        return (
          view.contentEl.contains(target) ||
          target === view.contentEl.ownerDocument.body
        )
      },
      saveTextFile: (name, text) => this.saveFile(name, text),
    }
  }

  private blockHost(): Host {
    return {
      ownsTheme: false,
      ownsReminder: false,
      // 카드는 창 전체의 키를 듣지 않는다.
      acceptsShortcut: () => false,
      saveTextFile: (name, text) => this.saveFile(name, text),
    }
  }

  private async saveFile(name: string, text: string): Promise<SavedFile> {
    if (this.downloads) {
      return { place: '다운로드 폴더', name: await this.downloads.save(name, text) }
    }
    return this.saveToVault(name, text)
  }

  /** 다운로드 폴더를 못 쓰면 보관함 안에 둔다. 같은 이름이 있으면 번호를 붙인다. */
  private async saveToVault(name: string, text: string): Promise<SavedFile> {
    const { vault } = this.app
    if (!vault.getFolderByPath(EXPORT_FOLDER)) await vault.createFolder(EXPORT_FOLDER)
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    for (let n = 0; ; n += 1) {
      const candidate = n === 0 ? name : `${stem} (${n})${ext}`
      const path = normalizePath(`${EXPORT_FOLDER}/${candidate}`)
      if (vault.getAbstractFileByPath(path)) continue
      await vault.create(path, text)
      return { place: `보관함의 ${EXPORT_FOLDER} 폴더`, name: candidate }
    }
  }

  private dataPath(): string {
    return `${this.app.vault.configDir}/plugins/${this.manifest.id}/data.json`
  }

  private notice(kind: string, message: string): void {
    const now = performance.now()
    if (now - (this.lastNotice.get(kind) ?? Number.NEGATIVE_INFINITY) < NOTICE_GAP_MS) return
    this.lastNotice.set(kind, now)
    // 옵시디언 알림은 한글 낱말 가운데서 줄을 바꾼다. 낱말을 지키는 글로 넘긴다.
    const fragment = document.createDocumentFragment()
    const text = document.createElement('span')
    text.style.wordBreak = 'keep-all'
    text.style.overflowWrap = 'anywhere'
    text.textContent = message
    fragment.appendChild(text)
    new Notice(fragment)
  }

  /** data.json 의 보관함 안 경로. 보관함의 낮은 단계 알림이 이 경로로 온다. */
  private dataVaultPath(): string {
    const dir = (this.manifest as { dir?: string }).dir
    return dir ? `${dir}/data.json` : this.dataPath()
  }
}

/**
 * 노트와 캔버스 카드 속 코드 블록 하나.
 *
 * 노트를 고치면 옵시디언이 블록을 새로 그린다. 그때마다 세우고 거둔다.
 */
class TodayBlock extends MarkdownRenderChild {
  private mounted: Mounted | null = null
  private readonly mountInto: (parent: HTMLElement) => Mounted

  constructor(containerEl: HTMLElement, mountInto: (parent: HTMLElement) => Mounted) {
    super(containerEl)
    this.mountInto = mountInto
  }

  override onload(): void {
    this.mounted = this.mountInto(this.containerEl)
  }

  override onunload(): void {
    this.mounted?.unmount()
    this.mounted = null
  }
}

/** 기록을 못 읽은 까닭을 사람이 읽을 말로. 오류 글 그대로는 '자세히' 에 둔다. */
function describeReadError(error: unknown): { reason: string; detail?: string } {
  if (error instanceof SnapshotFormatError) return { reason: error.message }
  const detail = error instanceof Error ? error.message : String(error)
  if (error instanceof SyntaxError) {
    return {
      reason: '파일이 끝까지 온전하지 않아요. 쓰다 만 파일이거나 다른 프로그램이 고친 파일일 수 있어요.',
      detail,
    }
  }
  return { reason: '파일을 여는 중에 문제가 생겼어요.', detail }
}
