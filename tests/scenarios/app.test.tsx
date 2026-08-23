// @vitest-environment happy-dom
import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/App'
import { usePlanner } from '../../src/store/planner'
import { aGoal, anItem, render, setupApp, teardownApp, pickFromMenu } from './harness'

const TODAY = '2026-10-01'

afterEach(teardownApp)

/**
 * 화면 하나만 그리는 시험은 앱 전체가 갈아끼워질 때 생기는 일을 못 잡는다.
 * 여기서는 App 을 통째로 그려서 화면 사이를 오가며 확인한다.
 */
/**
 * 차트를 쓰는 화면은 따로 떼어 놨다. 처음 열 때 그 조각을 받아오는 시간이 있어서
 * 기본 대기 시간으로는 시험이 들쭉날쭉해진다.
 */
const LAZY = { timeout: 5000 }

describe('앱 전체', () => {
  it('S-136 켜면 오늘 화면이 뜬다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '오늘 것', due: TODAY })],
    })
    render(<App />)
    expect(await screen.findByText('오늘 볼 항목')).toBeInTheDocument()
    expect(screen.getByText('오늘 것')).toBeInTheDocument()
  })

  it('S-137 왼쪽으로 다섯 화면을 오간다', async () => {
    await setupApp(TODAY, {
      goals: [aGoal({ id: 'g1', name: '시험' })],
      items: [anItem({ id: 'i1', goal_id: 'g1', title: '가', due: TODAY })],
    })
    const { user } = render(<App />)
    await screen.findByText('오늘 볼 항목')

    await user.click(screen.getByRole('button', { name: '예보' }))
    expect(
      (await screen.findAllByText('앞으로 60일', undefined, LAZY)).length
    ).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '목표' }))
    expect(await screen.findByText(/목표는 폴더가 아니라/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '서재' }))
    expect(await screen.findByLabelText('항목 찾기')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '설정' }))
    expect(
      await screen.findByText('이 앱이 쓰는 방식', undefined, LAZY)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^오늘/ }))
    expect(await screen.findByText('오늘 볼 항목')).toBeInTheDocument()
  })

  it('S-138 가져오기를 마치면 안내가 화면에 남는다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '원래 것', due: TODAY })],
    })
    const { user } = render(<App />)
    await screen.findByText('오늘 볼 항목')
    await user.click(screen.getByRole('button', { name: '설정' }))
    await screen.findByText('이 앱이 쓰는 방식', undefined, LAZY)

    const backup = JSON.stringify({
      version: 1,
      exportedAt: '',
      goals: [],
      items: [anItem({ id: 'i9', title: '가져온 것', due: TODAY })],
      reviews: [],
      settings: { onboardingDone: 'true' },
    })
    await user.upload(
      screen.getByLabelText('가져올 파일'),
      new File([backup], 'b.json', { type: 'application/json' })
    )

    // 자료가 바뀌어도 설정 화면이 사라지지 않아야 안내가 보인다.
    expect(
      await screen.findByText(/항목 1개와 평가 0건을 가져왔어요/)
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(usePlanner.getState().items.map((i) => i.title)).toEqual([
        '가져온 것',
      ])
    })
  })

  it('S-139 항목을 지우면 서재로 돌아간다', async () => {
    await setupApp(TODAY, {
      items: [anItem({ id: 'i1', title: '지울 것', due: TODAY })],
    })
    const { user } = render(<App />)
    await screen.findByText('오늘 볼 항목')
    await user.click(screen.getByRole('button', { name: '서재' }))
    await user.click(await screen.findByRole('button', { name: '지울 것' }))

    await pickFromMenu(user, '이 항목 더보기', '삭제')
    await user.click(screen.getByRole('button', { name: '지우기' }))

    expect(await screen.findByLabelText('항목 찾기')).toBeInTheDocument()
    expect(usePlanner.getState().items).toHaveLength(0)
  })

  it('S-140 목표를 지우면 목표 목록으로 돌아간다', async () => {
    await setupApp(TODAY, {
      goals: [aGoal({ id: 'g1', name: '지울 목표' })],
    })
    const { user } = render(<App />)
    await screen.findByText('오늘 볼 항목')
    await user.click(screen.getByRole('button', { name: '목표' }))
    await user.click(await screen.findByRole('button', { name: /지울 목표/ }))

    await user.click(await screen.findByRole('button', { name: '목표 삭제' }))
    await user.click(screen.getByRole('button', { name: '지우기' }))

    expect(await screen.findByText(/목표는 폴더가 아니라/)).toBeInTheDocument()
    expect(usePlanner.getState().goals).toHaveLength(0)
  })

  it('S-141 첫 실행이면 온보딩이 먼저 뜬다', async () => {
    await setupApp(TODAY)
    await usePlanner.getState().saveSetting('onboardingDone', false)
    const { user } = render(<App />)
    expect(await screen.findByText('1 / 3')).toBeInTheDocument()
    // 온보딩 중에는 왼쪽 차림표가 없다.
    expect(screen.queryByRole('button', { name: '서재' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '건너뛰기' }))
    expect(await screen.findByText('오늘 볼 항목')).toBeInTheDocument()
  })
})
