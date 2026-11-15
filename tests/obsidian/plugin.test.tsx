// @vitest-environment happy-dom
import { act, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import RetentionPlannerPlugin from '../../obsidian/src/main'
import { setPluginStatus } from '../../obsidian/src/status'
import { resetRepositoryForTest } from '../../src/db'
import { freezeToday, unfreezeToday } from '../../src/lib/clock'
import { resetPlannerForTest, usePlanner } from '../../src/store/planner'
import { App, Component, Notice, WorkspaceLeaf } from '../fakes/obsidian'
import { aGoal, anItem } from '../scenarios/harness'

const TODAY = '2026-10-01'
const MANIFEST = { id: 'retention-planner', name: 'Retention Planner', version: '0.1.0' }

/**
 * 항목 상세와 설정은 따로 떼어 놓은 화면이다. 처음 열 때 그 조각을 받아오는 시간이 있어서
 * 기본 대기 시간으로는 컴퓨터가 바쁠 때 시험이 들쭉날쭉해진다.
 */
const LAZY = { timeout: 5000 }

/** 옵시디언이 들고 있던 data.json. 앱이 남기는 꼴 그대로다. */
function savedData(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    goals: [aGoal({ id: 'g1', name: '정보보안기사' })],
    items: [
      anItem({ id: 'i1', title: '4장 연습문제', goal_id: 'g1', due: TODAY, last_review: '2026-09-29' }),
      anItem({ id: 'i2', title: '5장 개념 정리', due: '2026-10-09', created_at: '2026-01-02T00:00:00.000Z' }),
    ],
    reviews: [],
    settings: { onboardingDone: 'true' },
    ...over,
  })
}

let app: App
let plugin: RetentionPlannerPlugin
let parent: Component
/** 브라우저 저장소. 플러그인은 여기에 한 글자도 쓰면 안 된다. */
let browserStore: Map<string, string>

/** 옵시디언 창에도 브라우저 저장소가 있다. 플러그인이 몰래 그쪽을 잡는지 보려고 끼운다. */
function installBrowserStore(): Map<string, string> {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size
      },
    },
  })
  return store
}

beforeEach(() => {
  freezeToday(TODAY, 9 * 60)
  resetRepositoryForTest()
  resetPlannerForTest()
  usePlanner.setState({ ready: false, goals: [], items: [], reviews: [], planned: [], today: TODAY, lastRating: null })
  setPluginStatus({ kind: 'loading' })
  Notice.messages = []
  browserStore = installBrowserStore()
  document.body.className = 'theme-light'
  app = new App()
  plugin = new RetentionPlannerPlugin(app as never, MANIFEST as never)
  parent = new Component()
})

afterEach(async () => {
  parent.unload()
  // 플러그인을 끄면 옵시디언은 그 플러그인의 탭도 닫는다. 남겨 두면 다음 시험에서 그 화면이
  // 창의 신호를 듣고 움직인다.
  for (const leaf of [...app.workspace.leaves]) await act(() => leaf.detach())
  plugin.unload()
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-theme')
  unfreezeToday()
})

async function start(data: string | null = savedData()) {
  ;(plugin as unknown as { dataText: string | null }).dataText = data
  await act(() => (plugin as unknown as Component).load())
}

const fake = () => plugin as unknown as {
  dataText: string | null
  saves: number
  processors: Map<string, (source: string, el: HTMLElement, ctx: { addChild(c: Component): void; sourcePath: string }) => unknown>
  commands: { id: string; callback?: () => unknown; editorCallback?: (editor: { replaceSelection(t: string): void }) => unknown }[]
}

/** 노트에 적힌 코드 블록 하나를 옵시디언처럼 그린다. */
async function renderBlock(): Promise<HTMLElement> {
  const host = document.createElement('div')
  host.className = 'block-language-retention-planner'
  document.body.appendChild(host)
  await parent.load()
  const handler = fake().processors.get('retention-planner')!
  await act(async () => {
    await handler('', host, { addChild: (child) => parent.addChild(child), sourcePath: '플래너.md' })
  })
  return host
}

function stored() {
  return JSON.parse(fake().dataText ?? 'null')
}

describe('옵시디언 플러그인', () => {
  it('켜면 data.json 의 기록을 읽어 노트 카드에 오늘 볼 항목을 띄운다', async () => {
    await start()
    const host = await renderBlock()
    const card = within(host)
    expect(await card.findByRole('list', { name: '오늘 볼 항목' })).toBeInTheDocument()
    expect(card.getByRole('button', { name: '4장 연습문제 자세히 보기' })).toBeInTheDocument()
    expect(card.queryByText('5장 개념 정리')).toBeNull()
    // 앱 스타일이 닿는 뿌리 요소 안에만 그린다.
    expect(host.querySelector('.rp-root.rp-block')).not.toBeNull()
  })

  it('카드에서 평가하면 data.json 에 남고 되돌릴 수도 있다', async () => {
    await start()
    const host = await renderBlock()
    const user = userEvent.setup()
    const card = within(host)
    await user.click(await card.findByRole('checkbox', { name: '4장 연습문제 평가하기' }))
    await user.click(card.getByRole('button', { name: /무난함/ }))

    await waitFor(() => expect(stored().reviews).toHaveLength(1))
    expect(stored().reviews[0]).toMatchObject({ item_id: 'i1', rating: 3, reviewed_at: TODAY })
    const note = await card.findByLabelText('방금 한 일')
    await user.click(within(note).getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(stored().reviews).toHaveLength(0))
    expect(stored().tombstones.map((t: { kind: string }) => t.kind)).toEqual(['review'])
  })

  it('카드에서 한 줄 적으면 언제 다시 올라오는지 알려 주고 data.json 에 남는다', async () => {
    await start()
    const host = await renderBlock()
    const user = userEvent.setup()
    const input = within(host).getByRole('textbox', { name: '새 항목 제목' })
    await user.type(input, '6장 요약{Enter}')

    expect(await within(host).findByRole('status')).toHaveTextContent('"6장 요약"을 적어뒀어요. 다음은')
    expect(input).toHaveValue('')
    await waitFor(() => expect(stored().items.map((i: { title: string }) => i.title)).toContain('6장 요약'))
  })

  it('한글을 조합하던 Enter 로 적어도 한 번만 적고 칸에 글자가 남지 않는다', async () => {
    await start()
    const host = await renderBlock()
    const input = within(host).getByRole('textbox', { name: '새 항목 제목' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '요약함' } })
    // 크롬 계열은 조합 중인 Enter 를 먼저 보내고, 조합을 끝낸 뒤 Enter 를 한 번 더 보낸다.
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(usePlanner.getState().items.filter((i) => i.title === '요약함')).toHaveLength(1)
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(usePlanner.getState().items.filter((i) => i.title === '요약함')).toHaveLength(1)
    expect(input).toHaveValue('')
  })

  it('조합 중인 Enter 하나만 와도 조합이 끝난 글로 적는다', async () => {
    await start()
    const host = await renderBlock()
    const input = within(host).getByRole('textbox', { name: '새 항목 제목' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '요약' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    // 조합이 끝나며 마지막 글자가 붙는다.
    fireEvent.change(input, { target: { value: '요약함' } })
    await waitFor(() => expect(usePlanner.getState().items.some((i) => i.title === '요약함')).toBe(true))
    expect(usePlanner.getState().items.some((i) => i.title === '요약')).toBe(false)
  })

  it('카드와 탭에 띄운 앱 화면이 한 기록을 같이 본다', async () => {
    await start()
    const host = await renderBlock()
    const user = userEvent.setup()
    await act(async () => {
      await fake().commands.find((c) => c.id === 'open')!.callback!()
    })
    const view = document.querySelector('.workspace-leaf-content[data-type="retention-planner"]') as HTMLElement
    expect(view).not.toBeNull()
    const appScreen = within(view)
    expect(await appScreen.findByRole('button', { name: '4장 연습문제 자세히 보기' })).toBeInTheDocument()

    // 카드에서 평가하면 앱 화면의 오늘 목록에서도 빠진다.
    await user.click(within(host).getByRole('checkbox', { name: '4장 연습문제 평가하기' }))
    await user.click(within(host).getByRole('button', { name: /쉬움/ }))
    await waitFor(() =>
      expect(appScreen.queryByRole('button', { name: '4장 연습문제 자세히 보기' })).toBeNull()
    )
  })

  it('카드에서 평가한 뒤 앱 화면을 열어도 되돌리기 자리가 그대로다', async () => {
    await start()
    const host = await renderBlock()
    const user = userEvent.setup()
    await user.click(await within(host).findByRole('checkbox', { name: '4장 연습문제 평가하기' }))
    await user.click(within(host).getByRole('button', { name: /어려움/ }))
    await within(host).findByLabelText('방금 한 일')
    await user.click(within(host).getByRole('button', { name: '앱에서 보기' }))
    await within(app.workspace.getLeavesOfType('retention-planner')[0].view!.containerEl).findByText('오늘 볼 항목')
    expect(within(host).getByLabelText('방금 한 일')).toBeInTheDocument()
  })

  it('카드에서 항목을 누르면 새 탭에 앱 화면을 열고 그 항목으로 간다', async () => {
    await start()
    const host = await renderBlock()
    const user = userEvent.setup()
    await user.click(await within(host).findByRole('button', { name: '4장 연습문제 자세히 보기' }))

    // 앱 화면은 900px 은 있어야 열이 맞는다. 옆으로 나눈 칸은 그보다 좁기 쉽다.
    const leaf = app.workspace.getLeavesOfType('retention-planner')[0] as WorkspaceLeaf
    expect(leaf.openedAs).toEqual({ kind: 'tab', direction: undefined })
    const view = leaf.view!.containerEl
    expect(await within(view).findByRole('button', { name: '제목' }, LAZY)).toHaveTextContent('4장 연습문제')

    // 이미 떠 있으면 새로 열지 않고 그 화면을 옮긴다.
    await user.click(within(host).getByRole('button', { name: '앱에서 보기' }))
    expect(app.workspace.getLeavesOfType('retention-planner')).toHaveLength(1)
    expect(await within(view).findByText('오늘 볼 항목')).toBeInTheDocument()
  })

  it('data.json 을 못 읽으면 아무것도 쓰지 않고 알린다', async () => {
    await start('{ 깨진 파일')
    const host = await renderBlock()
    expect(await within(host).findByRole('alert')).toHaveTextContent('복습 기록을 읽지 못했어요.')
    expect(within(host).getByRole('alert')).toHaveTextContent('.obsidian/plugins/retention-planner/data.json')
    expect(fake().saves).toBe(0)
    expect(fake().dataText).toBe('{ 깨진 파일')
    expect(Notice.messages.some((m) => m.includes('기록을 읽지 못했어요'))).toBe(true)
    // 브라우저 저장소로 몰래 갈아타지도 않는다.
    expect(browserStore.size).toBe(0)
  })

  it('칸의 꼴이 다른 data.json 도 덮지 않는다', async () => {
    const odd = savedData({ items: '항목이 아님' })
    await start(odd)
    const host = await renderBlock()
    expect(await within(host).findByRole('alert')).toBeInTheDocument()
    expect(fake().saves).toBe(0)
    expect(fake().dataText).toBe(odd)
  })

  it('처음 켜면 data.json 이 없어도 빈 기록으로 시작하고 카드는 시작하기를 권한다', async () => {
    await start(null)
    const host = await renderBlock()
    expect(await within(host).findByText('처음 쓰시나요?')).toBeInTheDocument()
    expect(browserStore.size).toBe(0)
  })

  it('카드 입력 칸에서 친 글자 키는 옵시디언으로 넘어가지 않는다', async () => {
    await start()
    const host = await renderBlock()
    const heard: string[] = []
    host.addEventListener('keydown', (event) => heard.push(event.key))
    const input = within(host).getByRole('textbox', { name: '새 항목 제목' })
    // 캔버스는 카드를 고른 채 Backspace 를 누르면 카드를 지운다.
    fireEvent.keyDown(input, { key: 'Backspace' })
    fireEvent.keyDown(input, { key: 'a' })
    // 수정 키를 누른 것은 옵시디언 명령이고, Esc 는 앱 화면도 듣는다.
    fireEvent.keyDown(input, { key: 'p', metaKey: true })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(heard).toEqual(['p', 'Escape'])
    // 입력 칸이 아닌 곳의 키는 그대로 넘어간다.
    fireEvent.keyDown(within(host).getByRole('button', { name: '앱에서 보기' }), { key: 'Backspace' })
    expect(heard).toEqual(['p', 'Escape', 'Backspace'])
  })

  it('옵시디언 테마를 따라 밝기가 바뀐다', async () => {
    await start()
    const host = await renderBlock()
    const root = host.querySelector('.rp-root') as HTMLElement
    expect(root.dataset.theme).toBe('light')
    document.body.className = 'theme-dark'
    app.workspace.trigger('css-change')
    expect(root.dataset.theme).toBe('dark')
    // 문서 전체에는 손대지 않는다.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('앱 화면은 앱 설정의 테마가 있어도 문서 전체의 밝기를 건드리지 않는다', async () => {
    await start(savedData({ settings: { onboardingDone: 'true', theme: 'dark' } }))
    await act(() => plugin.openApp(null, 'tab'))
    const view = app.workspace.getLeavesOfType('retention-planner')[0].view!.containerEl
    await within(view).findByText('오늘 볼 항목')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect((view.querySelector('.rp-root') as HTMLElement).dataset.theme).toBe('light')
  })

  it('다른 기기가 data.json 을 고치면 다시 읽는다', async () => {
    await start()
    const host = await renderBlock()
    await within(host).findByRole('button', { name: '4장 연습문제 자세히 보기' })
    const next = JSON.parse(savedData())
    next.items.push(
      anItem({ id: 'i3', title: '다른 기기에서 적은 것', due: TODAY, last_review: '2026-09-29', created_at: '2026-01-03T00:00:00.000Z' })
    )
    fake().dataText = JSON.stringify(next)
    await act(() => plugin.onExternalSettingsChange())
    expect(await within(host).findByRole('button', { name: '다른 기기에서 적은 것 자세히 보기' })).toBeInTheDocument()
  })

  it('앱 화면의 단축키는 그 탭을 쓰고 있을 때만 받는다', async () => {
    await start()
    await renderBlock()
    const user = userEvent.setup()
    await act(() => plugin.openApp({ itemId: 'i1' }, 'tab'))
    const leaf = app.workspace.getLeavesOfType('retention-planner')[0]
    const view = leaf.view!.containerEl
    await within(view).findByRole('button', { name: '제목' }, LAZY)

    // 다른 노트를 쓰는 중이다. 그 노트의 e 는 이 화면의 설정 편집이 아니다.
    const note = new WorkspaceLeaf(app.workspace, 'tab', undefined)
    app.workspace.activeLeaf = note
    fireEvent.keyDown(document.body, { key: 'e' })
    expect(within(view).queryByText('설정 고치기')).toBeNull()

    app.workspace.activeLeaf = leaf
    await user.keyboard('e')
    expect(await within(view).findByText('설정 고치기')).toBeInTheDocument()
  })

  it('내보내기는 다운로드 폴더에 쓰고 어디에 썼는지 알려 준다', async () => {
    await start()
    const written: { name: string; text: string }[] = []
    plugin.downloads = {
      save: async (name, text) => {
        written.push({ name, text })
        return name.replace('.json', ' (1).json')
      },
    }
    await act(() => plugin.openApp(null, 'tab'))
    const view = app.workspace.getLeavesOfType('retention-planner')[0].view!.containerEl
    const user = userEvent.setup()
    await user.click(await within(view).findByRole('button', { name: '설정 화면' }))
    await user.click(await within(view).findByRole('button', { name: '내보내기' }, LAZY))
    expect(
      await within(view).findByText(
        '항목 2개와 평가 0건을 내보냈어요. 다운로드 폴더에 저장했어요. 파일 이름은 retention-planner-2026-10-01 (1).json 이에요.'
      )
    ).toBeInTheDocument()
    expect(JSON.parse(written[0].text).items).toHaveLength(2)
    // 옵시디언 테마를 따르므로 테마 고르는 줄은 두지 않는다.
    expect(within(view).queryByText('테마')).toBeNull()
  })

  it('다운로드 폴더를 못 쓰면 보관함 안에 둔다', async () => {
    await start()
    plugin.downloads = null
    app.vault.files.set('retention-planner/retention-planner-2026-10-01.json', '{}')
    app.vault.folders.add('retention-planner')
    await act(() => plugin.openApp(null, 'tab'))
    const view = app.workspace.getLeavesOfType('retention-planner')[0].view!.containerEl
    const user = userEvent.setup()
    await user.click(await within(view).findByRole('button', { name: '설정 화면' }))
    await user.click(await within(view).findByRole('button', { name: '내보내기' }, LAZY))
    expect(
      await within(view).findByText(/보관함의 retention-planner 폴더에 저장했어요. 파일 이름은 retention-planner-2026-10-01 \(1\).json 이에요./)
    ).toBeInTheDocument()
    expect(app.vault.files.has('retention-planner/retention-planner-2026-10-01 (1).json')).toBe(true)
  })

  it('기록을 다 읽기 전에는 화면과 카드를 등록하지 않는다', async () => {
    // 앱 화면은 뜨자마자 기록을 읽으러 간다. 그때 플러그인 저장소가 아직 없으면
    // 브라우저 저장소를 잡고 그대로 굳는다.
    let release: () => void = () => {}
    const reading = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = plugin as unknown as { loadData: () => Promise<unknown> }
    slow.loadData = () => reading.then(() => JSON.parse(savedData()))
    const loading = (plugin as unknown as Component).load()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fake().processors.size).toBe(0)
    expect(app.workspace.creators.size).toBe(0)

    release()
    await act(() => loading)
    const host = await renderBlock()
    expect(await within(host).findByRole('list', { name: '오늘 볼 항목' })).toBeInTheDocument()
    expect(browserStore.size).toBe(0)
  })

  it('자정이 지나 창으로 돌아오면 오늘을 다시 센다', async () => {
    await start()
    const host = await renderBlock()
    await within(host).findByRole('list', { name: '오늘 볼 항목' })
    freezeToday('2026-10-09', 9 * 60)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(usePlanner.getState().today).toBe('2026-10-09'))
    expect(await within(host).findByRole('button', { name: '5장 개념 정리 자세히 보기' })).toBeInTheDocument()
  })

  it('노트에 오늘 복습 카드를 넣는 명령이 있다', async () => {
    await start()
    const inserted: string[] = []
    fake().commands.find((c) => c.id === 'insert-today-block')!.editorCallback!({
      replaceSelection: (text) => inserted.push(text),
    })
    expect(inserted).toEqual(['```retention-planner\n```\n'])
  })

  it('블록이 다시 그려지면 이전 것을 거둔다', async () => {
    await start()
    const host = await renderBlock()
    expect(host.querySelectorAll('.rp-root')).toHaveLength(1)
    parent.unload()
    expect(host.querySelectorAll('.rp-root')).toHaveLength(0)
  })
})
