import {
  MarkdownRenderChild,
  normalizePath,
  Notice,
  Plugin,
  type WorkspaceLeaf,
} from 'obsidian'
import { provideRepository, SnapshotRepository } from '../../src/db'
import { TodayCard, type OpenTarget } from '../../src/features/today/TodayCard'
import { today as clockToday } from '../../src/lib/clock'
import type { Host, SavedFile } from '../../src/lib/host'
import { usePlanner } from '../../src/store/planner'
import { remindIfDue } from '../../src/store/reminder'
import { BLOCK_LANGUAGE, DISPLAY_NAME, ICON, VIEW_TYPE } from './constants'
import { nodeDownloads, type Downloads } from './files'
import { Mounts, type Mounted } from './mount'
import { setPluginStatus, usePluginStatus } from './status'
import { PlannerView } from './view'
import './styles.css'

/** 다운로드 폴더를 못 쓸 때 내보낸 파일을 둘 보관함 안 폴더. */
const EXPORT_FOLDER = 'retention-planner'

/** 저장 실패 알림을 이 간격 안에서는 한 번만 띄운다. 평가마다 쓰므로 실패도 연달아 온다. */
const SAVE_NOTICE_GAP_MS = 10_000

/**
 * 옵시디언 플러그인.
 *
 * 기록은 이 플러그인의 data.json 하나에 남는다. 보관함을 옮기면 기록도 같이 간다.
 * 데스크톱 앱과 같은 내보내기 파일을 쓰므로 서로의 파일을 합쳐서 가져올 수 있다.
 */
export default class RetentionPlannerPlugin extends Plugin {
  private readonly mounts = new Mounts()
  private repository: SnapshotRepository | null = null
  private lastSaveNotice = Number.NEGATIVE_INFINITY

  /** 내보낸 파일을 쓸 곳. 시험에서 바꿔 끼운다. */
  downloads: Downloads | null = nodeDownloads()

  override async onload(): Promise<void> {
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
  }

  override onunload(): void {
    void this.repository?.flush()
  }

  /** 다른 기기나 프로그램이 data.json 을 고쳤을 때. */
  override async onExternalSettingsChange(): Promise<void> {
    const repository = this.repository
    if (!repository || usePluginStatus.getState().status.kind !== 'ready') return
    try {
      await repository.reload()
      await usePlanner.getState().load()
    } catch {
      new Notice(`${DISPLAY_NAME}: 바뀐 기록을 읽지 못해서 지금 기록을 그대로 둡니다.`)
    }
  }

  /**
   * 노트 카드나 명령에서 앱 화면을 연다.
   *
   * 떠 있는 것이 있으면 그것을 쓴다. 없으면 새 탭으로 연다. 앱 화면은 데스크톱 창처럼
   * 폭이 900px 은 있어야 열이 맞는데, 옆으로 나눈 칸은 그보다 좁기 쉽다.
   */
  async openApp(target: OpenTarget, where: 'tab' | 'split'): Promise<void> {
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
    const view = leaf.view
    if (view instanceof PlannerView) {
      view.show(target ? { screen: 'library', itemId: target.itemId } : { screen: 'today' })
    }
  }

  private async start(): Promise<void> {
    const repository = new SnapshotRepository({
      read: () => this.loadData(),
      write: async (snapshot) => {
        try {
          await this.saveData(snapshot)
        } catch {
          // 메모리의 기록은 그대로 산다. 다음에 저장이 되면 그때까지의 것이 다 남는다.
          this.noticeSaveFailure()
        }
      },
    })
    try {
      await repository.init()
      this.repository = repository
      provideRepository(repository)
      await usePlanner.getState().load()
      setPluginStatus({ kind: 'ready' })
    } catch (error) {
      this.repository = null
      setPluginStatus({
        kind: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        file: this.dataFile(),
      })
      new Notice(`${DISPLAY_NAME}: 기록을 읽지 못했어요. 파일은 그대로 두었어요.`)
    }
  }

  private async tick(): Promise<void> {
    if (usePluginStatus.getState().status.kind !== 'ready') return
    if (clockToday() !== usePlanner.getState().today) {
      await usePlanner.getState().load()
    }
    await remindIfDue()
  }

  private mountBlock(parent: HTMLElement): Mounted {
    return this.mounts.mount(
      parent,
      'block',
      this.blockHost(),
      <TodayCard onOpenApp={(target) => void this.openApp(target, 'tab')} />
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

  private dataFile(): string {
    return `${this.app.vault.configDir}/plugins/${this.manifest.id}/data.json`
  }

  private noticeSaveFailure(): void {
    const now = performance.now()
    if (now - this.lastSaveNotice < SAVE_NOTICE_GAP_MS) return
    this.lastSaveNotice = now
    new Notice(`${DISPLAY_NAME}: 기록을 저장하지 못했어요. 옵시디언을 닫기 전에 내보내기로 남겨 두세요.`)
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
