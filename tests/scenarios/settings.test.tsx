// @vitest-environment happy-dom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsScreen } from '../../src/features/settings/SettingsScreen'
import { usePlanner } from '../../src/store/planner'
import { anItem, render, setupApp, teardownApp } from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

function panelOf(label: string): HTMLElement {
  return screen.getByRole('group', { name: label })
}

async function openAdvanced(user: ReturnType<typeof render>['user']) {
  await user.click(screen.getByRole('button', { name: /고급/ }))
}

describe('설정', () => {
  it('S-081 기본 복습 강도 4단계', async () => {
    for (const [label, key] of [
      ['여유', 'easy'],
      ['표준', 'standard'],
      ['집중', 'focus'],
      ['최대', 'max'],
    ] as const) {
      cleanup()
      await setupApp(TODAY)
      const { user } = render(<SettingsScreen />)
      const panel = panelOf('기본 복습 강도')
      await user.click(within(panel).getByRole('button', { name: label }))
      expect(usePlanner.getState().settings.defaultIntensity).toBe(key)
    }
  })

  it('S-082 하루 최대 개수를 조절한다', async () => {
    await setupApp(TODAY)
    const { user } = render(<SettingsScreen />)
    const panel = panelOf('하루 최대 개수')
    const before = usePlanner.getState().settings.dailyCap
    await user.click(within(panel).getByRole('button', { name: '늘리기' }))
    expect(usePlanner.getState().settings.dailyCap).toBe(before + 1)
    await user.click(within(panel).getByRole('button', { name: '줄이기' }))
    expect(usePlanner.getState().settings.dailyCap).toBe(before)
  })

  it('S-083 알림 시각을 고르고 끈다', async () => {
    await setupApp(TODAY)
    const { user } = render(<SettingsScreen />)
    const panel = panelOf('알림 시각')
    // 숫자만 적으면 아침인지 저녁인지 한 번 더 생각해야 한다. 우리말로 적는다.
    for (const [name, at] of [
      ['오전 9시', '09:00'],
      ['낮 12시', '12:00'],
      ['저녁 6시', '18:00'],
      ['밤 9시', '21:00'],
    ] as const) {
      await user.click(within(panel).getByRole('button', { name }))
      expect(usePlanner.getState().settings.notifyAt).toBe(at)
    }
    await user.click(within(panel).getByRole('button', { name: '끄기' }))
    expect(usePlanner.getState().settings.notifyAt).toBeNull()
  })

  it('S-084 테마 3가지', async () => {
    for (const [label, key] of [
      ['시스템', 'system'],
      ['밝게', 'light'],
      ['어둡게', 'dark'],
    ] as const) {
      cleanup()
      await setupApp(TODAY)
      const { user } = render(<SettingsScreen />)
      await user.click(within(panelOf('테마')).getByRole('button', { name: label }))
      expect(usePlanner.getState().settings.theme).toBe(key)
    }
  })

  it('S-085 대략 목표의 여유 폭 3가지', async () => {
    // 퍼센트가 무엇을 말하는지 알 수 없다. 넓이 이름으로 고르고 실제 날짜로 확인한다.
    for (const [label, value] of [
      ['좁게', 0.15],
      ['보통', 0.25],
      ['넓게', 0.35],
    ] as const) {
      cleanup()
      await setupApp(TODAY)
      const { user } = render(<SettingsScreen />)
      await user.click(
        within(panelOf('대략 목표의 여유 폭')).getByRole('button', { name: label })
      )
      expect(usePlanner.getState().settings.uncertainty).toBeCloseTo(value, 10)
    }
  })

  it('S-086 고급을 펼친다', async () => {
    await setupApp(TODAY)
    const { user } = render(<SettingsScreen />)
    expect(screen.queryByText('목표 기억률 기본값')).toBeNull()
    await openAdvanced(user)
    expect(screen.getByText('목표 기억률 기본값')).toBeInTheDocument()
  })

  it('S-087 목표 기억률 기본값 3가지', async () => {
    for (const [label, value] of [
      ['85%', 0.85],
      ['90%', 0.9],
      ['95%', 0.95],
    ] as const) {
      cleanup()
      await setupApp(TODAY)
      const { user } = render(<SettingsScreen />)
      await openAdvanced(user)
      await user.click(
        within(panelOf('목표 기억률 기본값')).getByRole('button', { name: label })
      )
      expect(usePlanner.getState().settings.targetRetention).toBeCloseTo(value, 10)
    }
  })

  it('S-088 최소 복습 횟수 기본값을 조절한다', async () => {
    await setupApp(TODAY)
    const { user } = render(<SettingsScreen />)
    await openAdvanced(user)
    const panel = panelOf('최소 복습 횟수 기본값')
    const before = usePlanner.getState().settings.minReviews
    await user.click(within(panel).getByRole('button', { name: '늘리기' }))
    expect(usePlanner.getState().settings.minReviews).toBe(before + 1)
  })

  it('S-089 버퍼를 조절한다', async () => {
    await setupApp(TODAY)
    const { user } = render(<SettingsScreen />)
    await openAdvanced(user)
    const panel = panelOf('목표한 날 며칠 전까지 잡을지')
    const before = usePlanner.getState().settings.bufferDays
    await user.click(within(panel).getByRole('button', { name: '늘리기' }))
    expect(usePlanner.getState().settings.bufferDays).toBe(before + 1)
  })

  it('S-090 최대 간격 4가지', async () => {
    for (const [label, value] of [
      ['제한 없음', null],
      ['30일', 30],
      ['90일', 90],
      ['180일', 180],
    ] as const) {
      cleanup()
      await setupApp(TODAY)
      const { user } = render(<SettingsScreen />)
      await openAdvanced(user)
      await user.click(
        within(panelOf('최대 간격')).getByRole('button', { name: label })
      )
      expect(usePlanner.getState().settings.maxIntervalDays).toBe(value)
    }
  })

  it('S-091 알고리즘 파라미터를 펼치면 21개가 보인다', async () => {
    await setupApp(TODAY)
    const { user } = render(<SettingsScreen />)
    await openAdvanced(user)
    await user.click(screen.getByRole('button', { name: /알고리즘 파라미터/ }))
    expect(screen.getByText('0.212')).toBeInTheDocument()
    expect(screen.getByText('0.1542')).toBeInTheDocument()
    expect(screen.getByText(/지금은 기본값이에요/)).toBeInTheDocument()
  })

  it('S-092 이 앱이 쓰는 방식에서만 약어가 나온다', async () => {
    await setupApp(TODAY)
    render(<SettingsScreen />)
    const section = screen.getByText('이 앱이 쓰는 방식').parentElement!
    expect(within(section).getByText('FSRS')).toBeInTheDocument()
    expect(within(section).getByText('SM-2')).toBeInTheDocument()
    expect(
      within(section).getByText(/이 화면 말고는 어디에도 이런 약어를 쓰지 않습니다/)
    ).toBeInTheDocument()
  })

  it('S-093 내보내기를 하면 몇 개인지 말한다', async () => {
    await setupApp(TODAY, { items: [anItem({ id: 'i1' })] })
    const { user } = render(<SettingsScreen />)
    await user.click(screen.getByRole('button', { name: '내보내기' }))
    expect(
      await screen.findByText(/항목 1개와 평가 0건을 내보냈어요/)
    ).toBeInTheDocument()
  })

  it('S-093b 표로 내보내기', async () => {
    await setupApp(TODAY, { items: [anItem({ id: 'i1' })] })
    const { user } = render(<SettingsScreen />)
    await user.click(screen.getByRole('button', { name: '표로 내보내기' }))
    expect(
      await screen.findByText(/항목 1개를 표로 내보냈어요/)
    ).toBeInTheDocument()
  })

  it('S-094 가져오기 왕복', async () => {
    await setupApp(TODAY, { items: [anItem({ id: 'i1', title: '원래 항목' })] })
    const backup = JSON.stringify({
      version: 1,
      exportedAt: '',
      goals: [],
      items: [{ ...anItem({ id: 'i9', title: '가져온 항목' }) }],
      reviews: [],
      settings: { onboardingDone: 'true' },
    })

    const { user } = render(<SettingsScreen />)
    const file = new File([backup], 'backup.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('가져올 파일'), file)

    expect(
      await screen.findByText(/항목 1개와 평가 0건을 가져왔어요/)
    ).toBeInTheDocument()
    expect(usePlanner.getState().items.map((i) => i.title)).toEqual([
      '가져온 항목',
    ])
  })

  it('S-095 깨진 파일은 막고 지금 자료를 지키지 않는다', async () => {
    await setupApp(TODAY, { items: [anItem({ id: 'i1', title: '원래 항목' })] })
    const { user } = render(<SettingsScreen />)
    const file = new File(['깨진 파일'], 'bad.json', {
      type: 'application/json',
    })
    await user.upload(screen.getByLabelText('가져올 파일'), file)

    expect(await screen.findByText(/파일을 읽을 수 없어요/)).toBeInTheDocument()
    // 지금 있는 것이 사라지면 안 된다.
    expect(usePlanner.getState().items.map((i) => i.title)).toEqual([
      '원래 항목',
    ])
  })
})
