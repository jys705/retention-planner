import { describe, expect, it } from 'vitest'
import { nodeDownloads, writeNewFile, type NodeFs, type NodePath } from '../../obsidian/src/files'

const path: NodePath = {
  join: (...parts) => parts.join('/'),
  basename: (p) => p.split(/[\\/]/).pop() ?? p,
}

function fakeFs(existing: string[] = []) {
  const files = new Map<string, string>(existing.map((p) => [p, '']))
  const fs: NodeFs = {
    existsSync: (p) => p === '/home/me/Downloads' || files.has(p),
    promises: {
      mkdir: async () => undefined,
      writeFile: async (p, data, options) => {
        if (options.flag === 'wx' && files.has(p)) {
          throw Object.assign(new Error('있음'), { code: 'EEXIST' })
        }
        files.set(p, data)
      },
    },
  }
  return { fs, files }
}

describe('내보낸 파일 쓰기', () => {
  it('같은 이름이 있으면 덮지 않고 번호를 붙인다', async () => {
    const { fs, files } = fakeFs(['/d/backup.json', '/d/backup (1).json'])
    expect(await writeNewFile(fs, path, '/d', 'backup.json', '새것')).toBe('backup (2).json')
    expect(files.get('/d/backup (2).json')).toBe('새것')
    expect(files.get('/d/backup.json')).toBe('')
  })

  it('경로가 섞인 이름은 파일 이름만 쓴다', async () => {
    const { fs, files } = fakeFs()
    expect(await writeNewFile(fs, path, '/d', '../../etc/backup.json', '{}')).toBe('backup.json')
    expect([...files.keys()]).toEqual(['/d/backup.json'])
  })

  it('있는 것 말고 다른 까닭으로 못 쓰면 그대로 알린다', async () => {
    const { fs } = fakeFs()
    fs.promises.writeFile = async () => {
      throw Object.assign(new Error('권한 없음'), { code: 'EACCES' })
    }
    await expect(writeNewFile(fs, path, '/d', 'a.json', '{}')).rejects.toThrow('권한 없음')
  })

  it('노드 모듈을 못 쓰는 곳이면 다운로드 폴더를 쓰지 않는다', () => {
    expect(nodeDownloads(undefined)).toBeNull()
    expect(
      nodeDownloads(() => {
        throw new Error('없음')
      })
    ).toBeNull()
  })

  it('옵시디언 데스크톱이면 홈의 다운로드 폴더에 쓴다', async () => {
    const { fs, files } = fakeFs()
    const modules: Record<string, unknown> = { fs, path, os: { homedir: () => '/home/me' } }
    const downloads = nodeDownloads((id) => modules[id])
    expect(downloads).not.toBeNull()
    expect(await downloads!.save('retention-planner-2026-10-01.json', '{}')).toBe(
      'retention-planner-2026-10-01.json'
    )
    expect(files.has('/home/me/Downloads/retention-planner-2026-10-01.json')).toBe(true)
  })
})
